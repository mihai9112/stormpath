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

    try{
      var mm = request.query.token
      if((request.query.token === "") || (typeof request.query.token === "undefined")) throw "Empty token";
    }
    catch(err){
      response.send("No token specified");
    }

    var listOfBrands = request.query.brands.split(';');
    var listOfMetrics = request.query.metrics.split(';');
    var dates = [[request.query.time_from, request.query.time_to]];
    var constructedBrands = "";
    var constructedMetrics = "";

    listOfBrands.forEach(function(element) {
      constructedBrands += "[Brand:"+ element +"]";
    }, this);

    listOfMetrics.forEach(function(element){
      constructedMetrics += "[Metric:"+ element +"]";
    }, this);

    var jsonObject = JSON.stringify({
      "time_from": dates[0][0],
      "time_to": dates[0][1],
      "signal": "{Effective Base}{N Weighted}{Unweighted Base}{Weighted Base}",
      "context": "[Country:"+ request.query.country +"]"+ constructedBrands + constructedMetrics + "[Subgroup:" + request.query.subgroup +"]",
      "tractors": [
        "crop [Brand][Metric] ~> filter {Weighted Base}{N Weighted} ~> group by week ~> pad time ~> roll by 8 last ~> sum ~> calculate '{N Weighted}/{Weighted Base}' returns {Category Average} ~> crop [Metric] ~> average",
        "crop [Brand][Metric] ~> group by week ~> pad time ~> roll by 8 last ~> sum ~> calculate 'Round({N Weighted}/{Weighted Base}, 2)' includes {N Value} ~> replace {Unweighted Base} with {Sample Size}",
        "crop [Brand][Metric] ~> filter {Weighted Base}{N Weighted} ~> group by week ~> pad time ~> roll by 8 last ~> sum ~> calculate 'Round({N Weighted}/{Weighted Base}, 2)' returns {N Value} ~> rank olympic [Brand] ~> replace {N Value Rank by Brand} with {Rank} ~> filter {Rank}",
        "crop [Metric] ~> filter {Effective Base} ~> group by week ~> pad time ~> roll by 8 last ~> sum ~> replace {Effective Base} with {Effective Base Category Total}"
      ],
      "tractor": "sort by time"
    });

    var postheaders = {
      'Content-Type' : 'application/json',
      'Content-Length' : Buffer.byteLength(jsonObject, 'utf8')
    };
    var optionsPostList = [];
    var modulesResults = [];
    var modules = [];
    var clusterResults = [];

    for(var i = 0; i < request.query.modules; i++)
    {
        modules.push(i);
    }
    
    for(var i = 0; i < request.query.calls; i++)
    {
      var optionspost = {
        host : 'api.datashaka.com',
        port : 443,
        path : '/v1.0/retrieve.json?token='+ config.token +'&groupspace='+ request.query.groupspace +'&profile=on',
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
            var maxOfActors = [];
            var computeOfKatsuFilteredQueryActor = [];
            var valuesOfKatsuFilteredQueryActor = [];
            var computeOfKatsuSingleFilteredQueryActor = [];
            var valuesOfKatsuSingleFilteredQueryActor = [];
            var computeOfKatsuTractorActor = [];
            var valuesOfKatsuTractorActor = [];
            var computeOfKatsuTractoredFilteredQueryActor = [];
            var valuesOfKatsuTractoredFilteredQueryActor = [];
            var body = JSON.parse(data);
            var instance = "";
            var nodeCount = 0;

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

              if(body[i].context['Actor Name']){
                  instance += body[i].context.Instance + "; ";

                  switch(body[i].context['Actor Name']){
                      case "KatsuFilteredQueryActor" :
                          valuesOfKatsuFilteredQueryActor.push(value);
                          if(valuesOfKatsuFilteredQueryActor.length == 3){
                              computeOfKatsuFilteredQueryActor.push(valuesOfKatsuFilteredQueryActor.max());
                              valuesOfKatsuFilteredQueryActor = [];
                          }
                          break;
                      case "KatsuTractoredFilteredQueryActor" :
                          valuesOfKatsuTractoredFilteredQueryActor.push(value);
                          if(valuesOfKatsuTractoredFilteredQueryActor.length == 3){
                              computeOfKatsuTractoredFilteredQueryActor.push(valuesOfKatsuTractoredFilteredQueryActor.max());
                              valuesOfKatsuTractoredFilteredQueryActor = [];
                          }
                          break;
                      case "KatsuSingleFilteredQueryActor" :
                          valuesOfKatsuSingleFilteredQueryActor.push(value);
                          if(valuesOfKatsuSingleFilteredQueryActor.length == 3){
                              computeOfKatsuSingleFilteredQueryActor.push(valuesOfKatsuSingleFilteredQueryActor.max());
                              valuesOfKatsuSingleFilteredQueryActor = [];
                          }
                          break;
                      case "KatsuTractorActor" :
                          valuesOfKatsuTractorActor.push(value);
                          if(valuesOfKatsuTractorActor.length == 3){
                            computeOfKatsuTractorActor.push(valuesOfKatsuTractorActor.max());
                            valuesOfKatsuTractorActor = [];
                          } 
                          break;
                  }   
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

            if(valuesOfKatsuFilteredQueryActor.length > 0){
                computeOfKatsuFilteredQueryActor.push(valuesOfKatsuFilteredQueryActor.max());
            }

            if(valuesOfKatsuTractoredFilteredQueryActor.length > 0){
                computeOfKatsuTractoredFilteredQueryActor.push(valuesOfKatsuTractoredFilteredQueryActor.max());
            }

            if(valuesOfKatsuSingleFilteredQueryActor.length > 0){
                computeOfKatsuSingleFilteredQueryActor.push(valuesOfKatsuSingleFilteredQueryActor.max());
            }

            if(valuesOfKatsuTractorActor.length > 0){
                computeOfKatsuTractorActor.push(valuesOfKatsuTractorActor.max());
            }
            
            var clusterCallCach = 0;
            var clusterCallInfra = 0;

            for(var i = 0; i < resultsParrallel.length; i++)
            {
                clusterCallCach += resultsParrallel[i].cachTotal;
                clusterCallInfra += resultsParrallel[i].infraTotal;
            }

            var clusterResult = {
                index : option.index,
                filteredQueryActorMax : computeOfKatsuFilteredQueryActor.sum(),
                singleFilteredQueryActorMax :  computeOfKatsuSingleFilteredQueryActor.sum(),
                tractorActorMax : computeOfKatsuTractorActor.sum(),
                tractoredFilteredQueryActorMax : computeOfKatsuTractoredFilteredQueryActor.sum(),
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
          var total = getValues(clusterResults, 'total');
          var cache = getValues(clusterResults, 'cachTotal');
          var infra = getValues(clusterResults, 'infraTotal');

          response.render('pages/tests', {
            renderTheseResults : clusterResults,
            totalMin : total.min(),
            totalMax : total.max(),
            totalAverage : total.average(),
            cachMin : cache.min(),
            cachMax : cache.max(),
            cachAverage : cache.average(),
            infraMin : infra.min(),
            infraMax : infra.max(),
            infraAverage : infra.average(),
            untrackedAverage : getValues(clusterResults, 'untracked').average(),
            brand : constructedBrands,
            metric : request.query.metric,
            groupspace : request.query.groupspace,
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

Array.prototype.sum = function(){
    var sum = this.reduce(function(result, currentValue){
        return result + currentValue
    }, 0);
    return sum;
};

function getValues(objectsArray, valuePropName) {
    var numbersArray = [];
    for(var i = 0; i < objectsArray.length; i++){
      numbersArray.push(objectsArray[i][valuePropName]);
    }
    return numbersArray;
}

app.listen(3000);