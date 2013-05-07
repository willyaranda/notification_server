var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

var operatorSchema = new Schema({
  _id: String,
  country: String,
  operator: String,
  mcc: Number,
  mnc: Number,
  wakeup: String
});

mongoose.model('operator', operatorSchema);

var operator = mongoose.model('operator'),
    helpers = require('../helpers.js');

exports.getOperator = function(mcc, mnc, callback) {
  var id = helpers.padNumber(mcc, 3) + '-' + helpers.padNumber(mnc, 2);
  operator.findById(
    id,
    function(error, operator) {
      if (error) {
        callback(error);
        return;
      }
      callback(null, operator);
      return;
    }
  );
}