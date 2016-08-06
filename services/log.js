var env = require('./environment.js');
var log = env.log;
var _ = require('lodash');

module.exports = function (logRef) {
  if (env.log === 'console') {
    return console.log.bind(console);
  } else if (env.log === 'firebase') {
    return function () {
      logRef.push({
        log: _.toArray(arguments).join(""),
        time: (new Date()).toString()
      });
    };
  }
};