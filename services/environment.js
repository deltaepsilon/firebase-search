var env = require('../env.json');
var environment = process.env.NODE_ENV;
var _ = require('lodash');
var result = {
  environment: environment,
  development: _.defaults(env.development, env.defaults),
  test: _.defaults(env.test, env.defaults),
  production: _.defaults(env.production, env.defaults)
};

return module.exports = _.defaults(result, result[environment]); 