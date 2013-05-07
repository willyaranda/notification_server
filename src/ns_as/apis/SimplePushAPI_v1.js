/* jshint node: true */

/**
 * PUSH Notification server
 * (c) Telefonica Digital, 2012 - All rights reserved
 * License: GNU Affero V3 (see LICENSE file)
 * Fernando Rodríguez Sela <frsela@tid.es>
 * Guillermo Lopez Leal <gll@tid.es>
 */

var msgBroker = require('../../common/msgbroker'),
    log = require('../../common/logger'),
    isVersion = require('../../common/helpers').isVersion;

var node = require('../../common/DB/node'),
    app = require('../../common/DB/app');

var kSimplePushASFrontendVersion = 'v1';

var SimplePushAPI_v1 = function() {
  this.processRequest = function(request, body, response) {
    var URI = request.url.split('/');
    if (URI.length < 3) {
      response.statusCode = 404;
      response.end('{ reason: "Not enough path data"}');
      log.debug('NS_UA_SimplePush_v1::processRequest --> Not enough path');
      return;
    }

    if (URI[1] !== kSimplePushASFrontendVersion) {
      response.statusCode = 400;
      response.end('{ reason: "Protocol version not supported"}');
      log.debug('NS_UA_SimplePush_v1::processRequest --> Version not supported, received: ' + URI[1]);
      return;
    }

    if (URI[2] !== 'notify') {
      response.statusCode = 404;
      response.end('{ reason: "API not known"}');
      log.debug('NS_UA_SimplePush_v1::processRequest --> API call not known, received: ' + URI[2]);
      return;
    }

    var appToken = URI[3];
    if (!appToken) {
      response.statusCode = 404;
      response.end('{ reason: "Not enough path data"}');
      log.debug('NS_UA_SimplePush_v1::processRequest --> Not enough path');
      return;
    }

    var versions = String(body).split('=');
    if (versions[0] !== 'version') {
      response.statusCode = 404;
      response.end('{ reason: "Bad body"}');
      log.debug('NS_UA_SimplePush_v1::processRequest --> Bad body, received lhs: ' + versions[0]);
      return;
    }

    var version = versions[1];
    if (!isVersion(version)) {
      response.statusCode = 404;
      response.end('{ reason: "Bad version"}');
      log.debug('NS_UA_SimplePush_v1::processRequest --> Bad version, received rhs: ' + version);
      return;
    }

    //Always return 200, fool the sender… or not
    response.statusCode = 200;
    response.end('{}');

    //Now, we are safe to start using the path and data
    log.notify(log.messages.NOTIFY_APPTOKEN_VERSION, {
      'appToken': appToken,
      'version': version
    });
    app.getChannelIDForAppToken(appToken, function(error, channelID) {
      if (!channelID) {
        return;
      }
      var msg = node.newVersion(appToken, channelID, version);
      msgBroker.push('newMessages', msg);
      return;
    });
  };
};

module.exports = new SimplePushAPI_v1();