var env = require('../env.json');
var environment = process.env.NODE_ENV;
var _ = require('lodash');
var result = {
  environment: environment,
  development: _.defaultsDeep(env.development, env.defaults),
  test: _.defaultsDeep(env.test, env.defaults),
  production: _.defaultsDeep(env.production, env.defaults)
};

module.exports = _.defaultsDeep(result, result[environment]); 