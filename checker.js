var APNSFeedbackClient = require("apns-feedback").Client;
var path = require('path');
var async = require("async");
var fs = require("fs");
var redis = require('redis');
var async = require("async");
var client = redis.createClient(6499);
var clients = {};

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
            client.zadd('apns_feedback:'+key, now, JSON.stringify(result), done);
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

async.forEach(modes, function(mode, done) {
    async.forEach(app_ids, function(app_id, done) {
        async.forEach([true, false], function(isDevelopment, done) {
            checkAndStore(mode+"-"+app_id, isDevelopment, done);
        }, done); 
    }, done);
}, function(err) {
    if(err) console.log(err);
    process.exit(-1);
});
