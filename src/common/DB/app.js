var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

var appSchema = new Schema({
  _id: String,
  ch: String,
  no: [String]
});

mongoose.model('app', appSchema);

var app = mongoose.model('app'),
    helpers = require('../../common/helpers.js'),
    log = require('../logger');

exports.registerApplication = function (appToken, channelID, uaid, callback) {
  callback = helpers.checkCallback(callback);
  app.findByIdAndUpdate(
    appToken,
    {
      $set:
        {
          ch: channelID
        },
      $addToSet:
        {
          no: uaid
        }
    },
    { upsert: true },
    function(error, app) {
      if (error) {
        callback(error);
        return;
      }
      callback(null, app);
      return;
    }
  );
};

exports.unregisterApplication = function (uaid, appToken, callback) {
  app.findByIdAndUpdate(
    appToken,
    {
      $pull: {
        no: uaid
      }
    },
    function(err, app) {
      if (err) {
        callback(err);
        return;
      }
      callback(null, app);
      return;
    }
  );
};

exports.getChannelIDForAppToken = function (appToken, callback) {
  log.debug('appAPI::getChannelIDForAppToken --> Looking for ' + appToken);
  app.findById(
    appToken,
    function(error, app) {
      if (error) {
        log.error('appAPI::getChannelIDForAppToken --> Error ', error);
        callback(error);
        return;
      }
      if (!app || !app.ch) {
        log.debug('appAPI::getChannelIDForAppToken --> Empty appToken=', appToken);
        callback(null, null);
        return;
      }
      log.debug('appAPI::getChannelIDForAppToken --> Found channelID=' + app.ch +  'for appToken=' + appToken);
      callback(null, app.ch);
      return;
    }
  );
};
