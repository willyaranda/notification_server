/**
 * PUSH Notification server
 * (c) Telefonica Digital, 2012 - All rights reserved
 * License: GNU Affero V3 (see LICENSE file)
 * Fernando Rodríguez Sela <frsela@tid.es>
 * Guillermo Lopez Leal <gll@tid.es>
 */

var log = require('./logger.js'),
    events = require('events'),
    util = require('util'),
    ddbbsettings = require('../config.js').ddbbsettings,
    helpers = require('../common/helpers.js'),
    connectionstate = require('../common/constants.js').connectionstate,
    mongoose = require('mongoose');

var DataStore = function() {
  this.callbackReady = function (callback) {
    if (this.ready) {
      callback(true);
      return;
    }
    if (!this.callbacks) {
      this.callbacks = [];
    }
    this.callbacks.push(helpers.checkCallback(callback));
  },

  this.init = function() {
    log.debug('dataStore::init --> MongoDB data store loading.');
    events.EventEmitter.call(this);

    //DB servers
    var uri = '';
    ddbbsettings.machines.forEach(function(machine) {
      uri += 'mongodb://' + machine[0] + ':' + machine[1] + '/' +
              ddbbsettings.ddbbname + ',';
    });
    //DB options
    var options = {
      db: { native_parser: true },
      server: { poolSize: 5 }
    };
    //Do we have a replica set?
    if (ddbbsettings.replicasetName) {
      options.replset = { rs_name: ddbbsettings.replicasetName };
      options.server.socketOptions = options.replset.socketOptions = { keepAlive: 1 };
    }
    //Connect
    this.db = mongoose.connect(uri, options);

    var self = this;
    this.db.connection.once('open', function() {
      log.info('dataStore::init --> MongoDB connected.');
      self.emit('ddbbconnected');
      self.ready = true;
    });
    this.db.connection.once('close', function() {
      self.emit('ddbbdisconnected');
      self.ready = false;
    });
  },

  this.close = function() {
    log.info('datastore::close --> Closing connection to DB');
    this.db.connection.close();
  };
};

///////////////////////////////////////////
// Singleton
///////////////////////////////////////////
util.inherits(DataStore, events.EventEmitter);

var _ds = new DataStore();
process.nextTick(function() {
  _ds.init();
});
function getDataStore() {
  return _ds;
}

module.exports = getDataStore();
