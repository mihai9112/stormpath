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
    var jsonObject = JSON.stringify({
      "time_from":"2015-03",
      "time_to":"2015-04",
      "signal": "{Effective Base}{N Weighted}{Unweighted Base}{Weighted Base}",
      "context": "[Country:US][Brand:Southwest][Metric:Spontaneous Consideration - First Mention][Subgroup:Southwest System (63%) - Overall]"
    });

    var postheaders = {
      'Content-Type' : 'application/json',
      'Content-Length' : Buffer.byteLength(jsonObject, 'utf8')
    };
    var optionsPostList = [];
    var resultsParrallel = [];

    for(var i = 0; i < 10; i++)
    {
      var optionspost = {
        host : 'api.datashaka.com',
        port : 443,
        path : '/v1.0/retrieve.json?token='+ config.token +'&groupspace=Airlines&profile=on',
        method : 'POST',
        index : i,
        headers : postheaders
      };

      optionsPostList.push(optionspost);
    }

    // console.info('Options prepared:');
    // console.info(optionspost);
    // console.info('Do the POST call');

    async.each(optionsPostList, function (option, done) {
      var start = new Date().getTime();
      //console.time("query");
      var reqPost = https.request(option, function (res) {
        // console.log('statusCode: ' + res.statusCode);
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
                total : 0
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
        response.render('pages/tests', {
          renderThisResults : resultsParrallel
        });
      }
      else{
        response.send("Something went wrong");
      }
    });
});

app.listen(3000);