var APNSFeedbackClient = require("apns-feedback").Client;
var path = require('path');
var async = require("async");
var fs = require("fs");
var redis = require('redis');
var async = require("async");
var http = require("http");
var client = redis.createClient(6499);
var URL = require('url');

var clients = {};
var CHECK_PERIOD = 1000 * 60 * 60 * 6;

function Checker(opts) {
    this.dataFile = opts.dataFile;
    this.domain = opts.domain;
    this.isDevelopment = opts.isDevelopment;
}

Checker.prototype.getFeedbackClient = function(callback) {
    var self = this;
    var client = clients[self.domain+'::'+self.isDevelopment];
    if(!client) {
        var certs_directory = path.join(process.cwd(),'certs');
        var keyFile = path.join(certs_directory,self.domain+"-key.pem");
        var certFile = path.join(certs_directory,self.domain+"-cert.pem");

        async.parallel({
            certData: function(done) { fs.readFile(certFile, done); },
            keyData: function(done) { fs.readFile(keyFile, done); }
        }, function(err, info) {
            info.backup = true;
            info.debug = true;
            info.name = self.domain;
            if(err) return callback(err);
            var client = new APNSFeedbackClient(info, !self.isDevelopment);
            return callback(null, client);
        });  
    }    
};


Checker.prototype.check = function(callback) {
    var self = this;
    if(self.dataFile) {
        var client = new APNSFeedbackClient({ dataFile: self.dataFile});
        client.check(callback);
    } else {
        self.getFeedbackClient(function(err, client) {
            if(err) {
                console.log("Error");
                console.log(err);
                return;
            }
            console.log(self.domain+", "+self.isDevelopment+" Got client: "+client);
            client.check(callback);
        });
    }
};

/*
var printResults = function(err, results) {
        if(err) {
            console.log("Error");
            console.log(err);
            return;
        }
        console.log("Got "+results.length+" results");
        for(var i = 0; i < results.length; i++) {
            console.log("Result "+i+": ");
            console.log(results[i]);
        }
};
*/

var storeResults = function(err, results, key, callback) {
        if(err) {
            console.log("Error");
            console.log(err);
            return;
        }
        var now = Date.now();
        async.forEach(results, function(result, done) {
            result.expired_at = result.expired_at * 1000;
            async.series([
                function(done) {
                    client.zadd('apns_feedback:'+key, now, JSON.stringify(result), function(err) {
                        if(err) console.log(err);
                        done();
                    });
                },
                function(done) {
                    client.zadd('apns_feedback:any', now, JSON.stringify(result), function(err) {
                        if(err) console.log(err);
                        done();
                    });
                }], done);

        }, callback);
};

function checkAndStore(domain, isDevelopment, callback) {
    var checker = new Checker({ domain: domain, isDevelopment: isDevelopment});
    checker.check(function(err, results) {
        if(err) {
            console.log(err);
            return callback(err);
        }
        storeResults(null, results, domain+(isDevelopment?"-sandbox":""), callback);
    });
}

var modes = ['production', 'development'];
var app_ids = ['io.incredible.DoHome', 'io.incredible.DoHomeInternal', 'io.incredible.donna'];
function doAllChecks(callback) {
    async.forEach(modes, function(mode, done) {
        async.forEach(app_ids, function(app_id, done) {
            async.forEach([true, false], function(isDevelopment, done) {
                checkAndStore(mode+"-"+app_id, isDevelopment, done);
            }, done); 
        }, done);
    }, function() {
        client.set('last_check', Date.now(), function(err) {
            if(err) console.log(err);
            callback(err);
        });
    });
}

function writeError(res, err) {
    res.writeHead(500, {'Content-Type': 'text/plain'});
    res.write(err.message);
}

function writeJSON(res, obj) {
    res.writeHead(200, {'Content-TYpe': 'application/json'});
    res.write(JSON.stringify(obj));
}

function notfound(res) {
    res.writeHead(404, {'Content-Type': 'text/plain'});
    res.write("Not found");
    res.end();
}
http.createServer(function(req, res) {
    console.log("Request from: "+req.url);
    var url = URL.parse(req.url, true);
    console.log(url);
    if(url.pathname != '/get') return notfound(res);

    var since = url.query.since || 0;
    var force = !!url.query.force;
    console.log("FORCE: "+force);
    async.waterfall([
        function checkTime(next) {
            client.get('last_check', next);
        },
        function(last_check, next) {
            if(!force && ((Date.now() - last_check) < CHECK_PERIOD)) return next();
            doAllChecks(next);
        },
        function(next) {
            console.log("zrangeby score "+since+", "+Date.now());
            client.zrangebyscore('apns_feedback:any', since, Date.now(), function(err, results) {
                if(err) return next(err);
                results = results || [];
                for(var i = 0; i < results.length; i++) {
                    console.log("Parsing: "+results[i]);
                    try {
                        results[i] = JSON.parse(results[i]);
                    } catch(err) {
                        results[i] = {
                            unparseable: results[i]
                        };
                    }
                }
                next(err, results);
            }); 
        }
    ], function(err, results) {
        console.log(results);
        if(err) {
            writeError(res, err);
            res.end();
        } else {
            writeJSON(res, results);
            res.end();
        }
    }); 
}).listen(6789);

