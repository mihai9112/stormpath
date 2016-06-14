var express = require('express');
var stormpath = require('express-stormpath');
const https = require('https');
var config = require('./config/apiKey.json')
var app = express();

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

app.get('/speedTests', function (request, response) {
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

    var optionspost = {
      host : 'api.datashaka.com',
      port : 443,
      path : '/v1.0/retrieve.json?token=KNqFDIqhr06b42xWvKzhTw-njkKFHBEhEWRLbent2OHAg&groupspace=Airlines',
      method: 'POST',
      headers : postheaders
    };

    console.info('Options prepared:');
    console.info(optionspost);
    console.info('Do the POST call');

    var reqPost = https.request(optionspost, function (res) {
      console.log('statusCode: ' + res.statusCode);
      res.on('data', function (data) {
         console.info('POST result:\n');
         process.stdout.write(data);
         console.info('\n\nPOST completed');
      });
    });

    reqPost.on('error', function (e) {
        console.error(e);
    })
});
    
app.listen(3000);