/**
 * PUSH Notification server
 * (c) Telefonica Digital, 2012 - All rights reserved
 * License: GNU Affero V3 (see LICENSE file)
 * Fernando Rodríguez Sela <frsela@tid.es>
 * Guillermo Lopez Leal <gll@tid.es>
 */

var log = require('../common/logger'),
    urlparser = require('url'),
    cluster = require('cluster'),
    consts = require('../config.js').consts,
    config = require('../config.js').NS_AS,
    fs = require('fs'),
    errorcodes = require('../common/constants').errorcodes.GENERAL,
    errorcodesAS = require('../common/constants').errorcodes.AS,
    pages = require('../common/pages.js'),
    maintance = require('../common/maintance.js');

var simplepush = require('./apis/SimplePushAPI_v1');

//We need this for mongoose to work
var dataStore = require('../common/dataStore');

function server(ip, port) {
  this.ip = ip;
  this.port = port;
  this.closing = false;
  this.server = null;
}

server.prototype = {
  //////////////////////////////////////////////
  // Constructor
  //////////////////////////////////////////////
  init: function() {
    // Create a new HTTPS Server
    if (cluster.isMaster) {
      // Fork workers.
      log.info('NS_AS::init --> We are goingo to fork ' + config.numProcesses +
               ' processes');
      for (var i = 0; i < config.numProcesses; i++) {
        cluster.fork();
      }

      cluster.on('exit', function(worker, code, signal) {
        if (code !== 0) {
          log.error(log.messages.ERROR_WORKERERROR, {
            "pid": worker.process.pid,
            "code": code
          });
        } else {
          log.info('NS_AS::init --> worker ' + worker.process.pid + ' exit');
        }
      });
    } else {
      var options = {
        key: fs.readFileSync(consts.key),
        cert: fs.readFileSync(consts.cert),
        requestCert: false,
        rejectUnauthorized: false
      };
      this.server = require('https').createServer(options,
                                                  this.onHTTPMessage.bind(this));
      this.server.listen(this.port, this.ip);
      log.info('NS_AS::init --> HTTPS push AS server started on ' +
        this.ip + ':' + this.port);
    }
  },

  stop: function() {
    if (cluster.isMaster) {
      setTimeout(function() {
        process.exit(0);
      }, 1000);
      return;
    }
    this.server.close(function() {
      log.info('NS_AS::stop --> NS_AS closed correctly');
    });
    this.closing = true;
  },

  //////////////////////////////////////////////
  // HTTP callbacks
  //////////////////////////////////////////////
  onHTTPMessage: function(request, response) {
    log.debug('[onHTTPMessage auth]', request.connection.authorizationError);
    log.debug('[onHTTPMessage received certificate]',
      request.connection.getPeerCertificate());

    response.res = function responseHTTP(errorCode) {
      log.debug('NS_AS::responseHTTP: ', errorCode);
      this.statusCode = errorCode[0];
      this.setHeader('access-control-allow-origin', '*');
      if (consts.PREPRODUCTION_MODE) {
        this.setHeader('Content-Type', 'text/plain');
        if (this.statusCode == 200) {
          this.write('{"status":"ACCEPTED"}');
        } else {
          this.write('{"status":"ERROR", "reason":"' + errorCode[1] + '"}');
        }
      }
      return this.end();
    };

    log.debug('NS_AS::onHTTPMessage --> Received request for ' + request.url);
    var url = urlparser.parse(request.url, true);
    var path = url.pathname.split('/');
    log.debug('NS_AS::onHTTPMessage --> Splitted URL path: ', path);

    // CORS support
    if (request.method === 'OPTIONS') {
      log.debug('NS_AS::onHTTPMessage --> Received an OPTIONS method');
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Access-Control-Allow-Methods', 'POST, PUT, GET, OPTIONS');
      return response.end();
    }

    // Frontend for the Mozilla SimplePush API
    if (request.method === 'PUT') {
      log.debug('NS_AS::onHTTPMessage --> Received a PUT');
      request.on('data', function(body) {
        simplepush.processRequest(request, body, response);
      });
      return;
    }

    switch (path[1]) {
      case 'about':
        if (consts.PREPRODUCTION_MODE) {
          try {
            var p = new pages();
            p.setTemplate('views/about.tmpl');
            text = p.render(function(t) {
              switch (t) {
                case '{{GIT_VERSION}}':
                  return require('fs').readFileSync('version.info');
                case '{{MODULE_NAME}}':
                  return 'Application Server Frontend';
                default:
                  return '';
              }
            });
          } catch(e) {
            text = "No version.info file";
          }
          response.setHeader('Content-Type', 'text/html');
          response.statusCode = 200;
          response.write(text);
          return response.end();
        } else {
          return response.res(errorcodes.NOT_ALLOWED_ON_PRODUCTION_SYSTEM);
        }
        break;

      case 'status':
        // Return status mode to be used by load-balancers
        response.setHeader('Content-Type', 'text/html');
        if (maintance.getStatus()) {
          response.statusCode = 503;
          response.write('Under Maintance');
        } else {
          response.statusCode = 200;
          response.write('OK');
        }
        return response.end();
        break;

      default:
        log.debug("NS_AS::onHTTPMessage --> messageType '" +
                  path[1] + "' not recognized");
        return response.res(errorcodesAS.BAD_URL);
    }
  }
};

// Exports
exports.server = server;
