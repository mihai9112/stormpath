var express = require('express');
var stormpath = require('express-stormpath');
const https = require('https');
var config = require('./config/apiKey.json');
var app = express();
var async = require('async');

app.set('view engine', 'ejs');
app.use(stormpath.init(app, {
  client: {
    apiKey: {
      id: config.apiKeyId,
      secret: config.apiKeySecret,
    }
  },
  application: {
    href: 'https://api.stormpath.com/v1/applications/' + config.hrefKey
  },
  web: {
    register: {
      nextUri: '/dashboard'
    }
  }
}));
 
app.on('stormpath.ready', function () {
  //console.log('Stormpath Ready');
});

app.get('/dashboard', stormpath.loginRequired, function(req, res) {
  res.send('Welcome back: ' + res.locals.user.email);
});

app.get('/createKey', stormpath.loginRequired, function (req, res) {
   account = req.user;
   
   account.getApiKeys(function (err, colectionResult) {
       colectionResult.each(function (apiKey, cb) {
            apiKey.delete(); 
            cb();
       }), function (err) {
           console.log(err);
       };
   });
   
   account.createApiKey(function (err, apiKey) {
        res.send('Your api key has been created </br> ApiId: ' + apiKey.id + '</br> ApiSecret: ' + apiKey.secret );   
   });
});

app.get('/speedTests', stormpath.loginRequired, function (request, response) {
    var metric = "Spontaneous Consideration - First Mention";
    var brand = "Southwest";
    var country = "US";
    var subgroup = "Southwest System (63%) - Overall"
    var groupspace = "Airlines";
    var dates = [["2015-03","2015-04"]];

    var jsonObject = JSON.stringify({
      "time_from": dates[0][0],
      "time_to": dates[0][1],
      "signal": "{Effective Base}{N Weighted}{Unweighted Base}{Weighted Base}",
      "context": "[Country:"+ country +"][Brand:"+ brand +"][Metric:" + metric + "][Subgroup:" + subgroup +"]"
    });

    var postheaders = {
      'Content-Type' : 'application/json',
      'Content-Length' : Buffer.byteLength(jsonObject, 'utf8')
    };
    var optionsPostList = [];
    var resultsParrallel = [];
    var modulesResults = [];
    var modules = [1,2,3,4,5];

    for(var i = 0; i < 10; i++)
    {
      var optionspost = {
        host : 'api.datashaka.com',
        port : 443,
        path : '/v1.0/retrieve.json?token='+ config.token +'&groupspace='+ groupspace +'&profile=on',
        method : 'POST',
        index : i,
        headers : postheaders
      };

      optionsPostList.push(optionspost);
    }

    // console.info('Options prepared:');
    // console.info(optionspost);
    // console.info('Do the POST call');

    async.each(modules, function (mod, done) {
        async.each(optionsPostList, function (option, done) {
        var start = new Date().getTime();
        console.time("query");
        var reqPost = https.request(option, function (res) {
          //console.log('statusCode: ' + res.statusCode);
          //console.log('index: ' + option.index);
          res.on('data', function (data) {
            var body = JSON.parse(data);

            var queryTotal = -1;
            var tractorTotal = -1;
            //console.info('POST result:\n');

            for(var i = 0; i < body.length; i++)
            {
              if(body[i].context.Event === "Query - Total" && body[i].signal === "Duration"){
                queryTotal = body[i].value;
              }

              if(body[i].context.Event === "Tractor" && body[i].signal === "Duration"){
                tractorTotal = body[i].value;
              }

              if(queryTotal >= 0 && tractorTotal >= 0){
                var result = {
                  index : option.index,
                  qTotal : queryTotal,
                  tTotal : tractorTotal,
                  total : 0,
                  module : mod
                }
                resultsParrallel.push(result);
                //console.log("Array length: " + resultsParrallel.length);
                queryTotal = -1;
                tractorTotal = -1;
              }
            }
            //console.info('\n\nPOST completed');
          });

          res.on('end', function () {
            var end = new Date().getTime();
            resultsParrallel[resultsParrallel.length - 1].total = end - start;
            //console.timeEnd("query");
            done();
          });
        });

        reqPost.write(jsonObject);
        reqPost.end();
        reqPost.on('error', function (e) {
            console.error(e);
        });
      }, function(err){
        if(!err){
          done();
        }
        else{
          response.send("Something went wrong");
        }
      });
    },function (err) {
        if(!err){
          response.render('pages/tests', {
            renderTheseResults : resultsParrallel,
            max : getValues(resultsParrallel, 'total').max(),
            min : getValues(resultsParrallel, 'total').min(),
            average : getValues(resultsParrallel, 'total').average(),
            brand : brand,
            metric : metric,
            groupspace : groupspace,
            startDate : dates[0][0],
            endDate : dates[0][1] 
          });
        }
        else{
          response.send("Something went wrong");
        }
    });
});

Array.prototype.max = function() {
  return Math.max.apply(null, this);
};

Array.prototype.min = function() {
  return Math.min.apply(null, this);
};

Array.prototype.average = function() {
    var sum = this.reduce(function(result, currentValue) {
        return result + currentValue
    }, 0);
    return sum / this.length;
};

function getValues(objectsArray, valuePropName) {
    var numbersArray = [];
    for(var i = 0; i < objectsArray.length; i++){
      numbersArray.push(objectsArray[i][valuePropName]);
    }
    return numbersArray;
}

app.listen(3000);