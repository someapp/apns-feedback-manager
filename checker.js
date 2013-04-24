var APNSFeedbackClinet = require("apns-feedback").Client;
var path = require('path');
var async = require("async");
var fs = require("fs");

var clients = {};
function getFeedbackClient(domain, isDevelopment, callback) {
    var client = clients[domain+'::'+isDevelopment];
    if(!client) {
        var certs_directory = path.join(process.cwd(),'certs');
        var keyFile = path.join(certs_directory,domain+"-key.pem");
        var certFile = path.join(certs_directory,domain+"-cert.pem");

        async.parallel({
            certData: function(done) { fs.readFile(certFile, done); },
            keyData: function(done) { fs.readFile(keyFile, done); }
        }, function(err, info) {
            info.backup = true;
            info.debug = true;
            info.name = domain;
            if(err) return callback(err);
            var client = new APNSFeedbackClinet(info, !isDevelopment);
            return callback(null, client);
        });  
    }    
}


function check(domain, isDevelopment) {
    getFeedbackClient(domain, isDevelopment, function(err, client) {
        if(err) {
            console.log("Error");
            console.log(err);
            return;
        }
        client.check(function(err, results) {
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
                
        });
    });
}


check('production-io.incredible.DoHome', false);
check('development-io.incredible.DoHome', false);
check('production-io.incredible.DoHomeInternal', false);
check('development-io.incredible.DoHomeInternal', false);
check('production-io.incredible.donna', false);
check('development-io.incredible.donna', false);
check('production-io.incredible.DoHome', true);
check('development-io.incredible.DoHome', true);
check('production-io.incredible.DoHomeInternal', true);
check('development-io.incredible.DoHomeInternal', true);
check('production-io.incredible.donna', true);
check('development-io.incredible.donna', false);
