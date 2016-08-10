var express = require('express');
var stormpath = require('express-stormpath');
const https = require('https');
const http = require('http');
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
  console.log('Stormpath Ready');
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

    var timeFrom = request.param('time_from');
    var timeTo = request.param('time_to');
    var noOfModules = request.param('modules');
    var parrallelCalls = request.param('calls');
    var metric = request.param('metric');
    var brands = request.param('brands');
    var country = request.param('country');
    var subgroup = request.param('subgroup');
    var groupspace = request.param('groupspace');

    var listOfBrands = brands.split(';');
    var dates = [[timeFrom, timeTo]];
    var constructedBrands = "";

    listOfBrands.forEach(function(element) {
      constructedBrands += "[Brand:"+ element +"]"
    }, this);

    var jsonObject = JSON.stringify({
      "time_from": dates[0][0],
      "time_to": dates[0][1],
      "signal": "{Effective Base}{N Weighted}{Unweighted Base}{Weighted Base}",
      "context": "[Country:"+ country +"]"+ constructedBrands +"[Metric:" + metric + "][Subgroup:" + subgroup +"]"
    });

    var postheaders = {
      'Content-Type' : 'application/json',
      'Content-Length' : Buffer.byteLength(jsonObject, 'utf8')
    };
    var optionsPostList = [];
    var modulesResults = [];
    var modules = [];
    var clusterResults = [];

    for(var i = 0; i < noOfModules; i++)
    {
        modules.push(i);
    }
    
    for(var i = 0; i < parrallelCalls; i++)
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

    console.info('Options prepared:');
    console.info(jsonObject);
    console.info(optionspost);
    console.info('Do the POST call');

    async.each(modules, function (mod, done) {
        async.each(optionsPostList, function (option, done) {
        var start = new Date().getTime();
        console.time("query");
        var reqPost = https.request(option, function (res) {
          console.log('statusCode: ' + res.statusCode);
          console.log('index: ' + option.index);
          res.on('data', function (data) {
            var end = new Date().getTime();
            var resultsParrallel = [];
            var body = JSON.parse(data);
            var instance = "";

            console.info('POST result:\n');

            for(var i = 0; i < body.length; i++)
            {
              var computeTotal = -1;
              var cacheTotal = -1;
              var infrastructureTotal = -1;
              var event = body[i].context.Event;
              var signal = body[i].signal;
              var value = body[i].value;

              if(event === "Gateway Call" && signal === "Duration"){
                infrastructureTotal += value;
              }

              if(event === "Deserialization" && signal === "Duration"){
                infrastructureTotal += value
              }

              if(event === "Compute" && signal === "Duration"){
                computeTotal = value;
              }

              if(event === "Cache" && body[i].signal === "Duration"){
                cacheTotal = value;
              }

              if(body[i].context['Actor Name'])
              {
                  instance += body[i].context.Instance + "; ";
              }

              if(computeTotal >= 0 || cacheTotal >= 0 || infrastructureTotal >= 0){
                var result = {
                  index : option.index,
                  compTotal : computeTotal + 1,
                  cachTotal : cacheTotal + 1,
                  infraTotal : infrastructureTotal + 1, 
                  total : 0,
                  module : mod,
                  untracked : 0
                }
                resultsParrallel.push(result);
              }
            }
            
            var clusterCallComp = 0;
            var clusterCallCach = 0;
            var clusterCallInfra = 0;

            for(var i = 0; i < resultsParrallel.length; i++)
            {
                clusterCallComp += resultsParrallel[i].compTotal;
                clusterCallCach += resultsParrallel[i].cachTotal;
                clusterCallInfra += resultsParrallel[i].infraTotal;
            }

            var clusterResult = {
                index : option.index,
                compTotal : clusterCallComp,
                cachTotal : clusterCallCach,
                infraTotal : clusterCallInfra,
                total : 0,
                module : mod,
                untracked : 0,
                inst : instance
            }

            clusterResults.push(clusterResult);
            
            console.info('\n\nPOST completed: '+ (end - start));
          });

          res.on('end', function () {
            var end = new Date().getTime();
            var lastResult = clusterResults[clusterResults.length - 1];
            lastResult.total = end - start;
            lastResult.untracked = lastResult.total - lastResult.infraTotal;
            console.timeEnd("query");
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
            renderTheseResults : clusterResults,
            totalMin : getValues(clusterResults, 'total').min(),
            totalMax : getValues(clusterResults, 'total').max(),
            totalAverage : getValues(clusterResults, 'total').average(),
            compMin : getValues(clusterResults, 'compTotal').min(),
            compMax : getValues(clusterResults, 'compTotal').max(),
            compAverage: getValues(clusterResults, 'compTotal').average(),
            cachMin : getValues(clusterResults, 'cachTotal').min(),
            cachMax : getValues(clusterResults, 'cachTotal').max(),
            cachAverage : getValues(clusterResults, 'cachTotal').average(),
            infraMin : getValues(clusterResults, 'infraTotal').min(),
            infraMax : getValues(clusterResults, 'infraTotal').max(),
            infraAverage : getValues(clusterResults, 'infraTotal').average(),
            untrackedAverage : getValues(clusterResults, 'untracked').average(),
            brand : constructedBrands,
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