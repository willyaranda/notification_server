/**
 * PUSH Notification server
 * (c) Telefonica Digital, 2012 - All rights reserved
 * License: GNU Affero V3 (see LICENSE file)
 * Fernando Rodríguez Sela <frsela@tid.es>
 * Guillermo Lopez Leal <gll@tid.es>
 */

var dataStore = require('../common/datastore'),
    log = require('../common/logger.js'),
    helpers = require('../common/helpers.js'),
    Connectors = require('./connectors/connector.js').getConnector(),
    connectionstate = require('../common/constants.js').connectionstate;

var node = require('../common/DB/node.js');
var app = require('../common/DB/app.js');
var async = require('async');
var mongoose = require('mongoose');

function datamanager() {
  log.info('dataManager --> In-Memory data manager loaded.');
}

datamanager.prototype = {
  /**
   * Register a new node. As a parameter, we receive the connector object
   */
  registerNode: function(data, connection, callback) {
    Connectors.getConnector(data, connection, function(err, connector) {
      if (err) {
        connection.res({
          errorcode: errorcodesWS.ERROR_GETTING_CONNECTOR,
          extradata: { messageType: 'hello' }
        });
        return log.error(log.messages.ERROR_WSERRORGETTINGCONNECTION);
      } else {
        log.debug('dataManager::registerNode --> Registraton of the node into datastore ' + data.uaid);
        node.register(
          data.uaid,
          connector.getServer(),
          {
            wakeup_hostport: connector.getInterface(),
            mobilenetwork: connector.getMobileNetwork(),
            protocol: connector.getProtocol(),
            canBeWakeup: connector.canBeWakeup()
          },
          callback
        );
      }
    });
  },

  /**
   * Unregisters (or inform about disconnection) a Node from the DDBB and memory
   */
  unregisterNode: function(uaid) {
    log.debug('dataManager::unregisterNode --> Going to unregister a node');
    var connector = null;
    if (!uaid) {
      //Might be a connection closed that has no uaid associated (e.g. registerWA without registerUA before)
      log.debug('dataManager::unregisterNode --> This connection does not have a uaid');
      return;
    } else {
      log.debug('dataManager::unregisterNode --> Removing disconnected node uaid ' + uaid);
      //Delete from DDBB
      connector = Connectors.getConnectorForUAID(uaid);
      var fullyDisconnected = connectionstate.DISCONNECTED;
      if (!connector) {
        log.debug('dataManager::unregisterNode --> No connector found for uaid=' + uaid);
      } else {
        fullyDisconnected = connector.canBeWakeup() ? connectionstate.WAKEUP : connectionstate.DISCONNECTED;
      }
      node.unregister(
        uaid,
        fullyDisconnected,
        function(error) {
          if (!error) {
            log.debug('dataManager::unregisterNode --> Unregistered');
          } else {
            log.error(log.messages.ERROR_DMERRORUNREGISTERUA, {
              "uaid": uaid
            });
          }
        }
      );
    }
    if (connector) {
      Connectors.unregisterUAID(uaid);
    }
  },

  /**
   * Gets a node connector (from memory)
   */
  getNode: function (uaid, callback) {
    log.debug("dataManager::getNode --> getting node from memory: " + uaid);
    var connector = Connectors.getConnectorForUAID(uaid);
    if (connector) {
      log.debug('dataManager::getNode --> Connector found: ' + uaid);
      return callback(connector);
    }
    return callback(null);
  },

  /**
   * Register an application
   */
  registerApplication: function (appToken, channelID, uaid, cert, callback) {
    async.parallel([
      function(callback) {
        node.registerApplication(uaid, channelID, appToken, callback);
      },
      function(callback) {
        app.registerApplication(appToken, channelID, uaid, callback);
      }],
      function(err) {
        if (err) {
          callback(err);
          return;
        }
        callback(null);
        return;
      }
    );
  },

 /**
   * Unregister an application
   */
  unregisterApplication: function (appToken, uaid, callback) {
    async.parallel([
      function(callback) {
        node.unregisterApplication(uaid, appToken, callback);
      },
      function(callback) {
        app.unregisterApplication(uaid, appToken, callback);
      }],
      function(err) {
        if (err) {
          callback(err);
          return;
        }
        callback(null);
        return;
      }
    );
  },

  /**
   * Delete an ACK'ed message
   */
  removeMessage: function(messageId, uaid) {
    if(!messageId || !uaid) {
      log.error(log.messages.ERROR_BACKENDERROR, {
        "class": 'dataStore',
        "method": 'removeMessage',
        "extra": 'No messageId nor UAID found'
      });
      return;
    }
    dataStore.removeMessage(messageId, uaid);
  },

  close: function() {
    dataStore.close();
  }
};

///////////////////////////////////////////
// Callbacks functions
///////////////////////////////////////////
function onMessage(message, message_info) {
  log.debug("dataManager::onMessage --> Message payload:", message[0].payload);
  message_info.callback(
    {
      messageId: message_info.id,
      payload: message[0].payload,
      data: message_info.callbackParam
    }
  );
}

///////////////////////////////////////////
// Singleton
///////////////////////////////////////////
var dm = new datamanager();
function getDataManager() {
  return dm;
}

module.exports = getDataManager();
