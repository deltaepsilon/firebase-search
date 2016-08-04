var _ = require('lodash');

module.exports = function (ref, options, type) {
  var firebaseSearch = this;

  var toPromise = function (fn, args) {
    return new Promise(function (resolve, reject) {
      var argsArray = Array.isArray(args) ? args : [args];
      argsArray = argsArray.concat([function (err, res) {
        err ? reject(err) : resolve(res);
      }]);
      fn.apply(this, argsArray);
    }.bind(this));
  };

  this.ref = ref;
  this.options = options;
  this.type = type || ref.toString().replace(/.+\.com\//, '').replace(/\//g, ':');

  if (this.options.elasticsearch) {
    var elasticsearch = require('elasticsearch');
    var client = new elasticsearch.Client(options.elasticsearch);

    this.elasticsearch = {
      indices: {
        exists: function (params) {
          var params = _.defaults(params, {
            index: firebaseSearch.options.elasticsearch.index
          });
          return toPromise(client.indices.exists.bind(client.indices), params);
        },
        delete: function (params) {
          var params = _.defaults(params, {
            index: firebaseSearch.options.elasticsearch.index
          });
          return toPromise(client.indices.delete.bind(client.indices), params);
        },
        create: function (params) {
          var params = _.defaults(params, {
            index: firebaseSearch.options.elasticsearch.index
          });
          return toPromise(client.indices.create.bind(client.indices), params);
        },
        ensure: function () {
          var params = _.defaults(params, {
            index: firebaseSearch.options.elasticsearch.index
          });
          return firebaseSearch.elasticsearch.indices.exists()
            .then(function (exists) {
              return exists || firebaseSearch.elasticsearch.indices.create(params);
            });
        }
      },
      ping: function () {
        return toPromise(client.ping.bind(client), { hello: 'elasticsearch!' });
      },
      build: function (returnPromise) {
        var ref = firebaseSearch.ref;
        return ref.orderByKey().limitToLast(1).once('child_added')
          .then(function (snap) {
            return snap.key;
          })
          .then(function (lastKey) {
            return new Promise(function (resolve, reject) {
              var ref = firebaseSearch.ref.orderByKey();
              var promises = [];
              var finish = false;
              var successful = 0;
              var failed = 0;
              var total = 0;
              var handler = function (snap) {
                var promise = firebaseSearch.elasticsearch.create({
                  id: snap.key,
                  body: snap.val()
                }).then(function (res) {
                  successful += res._shards.successful;
                  failed += res._shards.failed;
                  total += 1;
                  return res;
                });

                if (returnPromise) {
                  promises.push(promise);
                }

                if (snap.key === lastKey) {
                  ref.off('child_added', handler);
                  finish = _.debounce(function () {
                    resolve({
                      successful: successful,
                      failed: failed,
                      total: total
                    });
                  }, 50);
                }

                if (finish) {
                  promise.then(function () {
                    if (returnPromise) {
                      resolve(Promise.all(promises));
                    } else {
                      finish();
                    }
                  });
                }
              }
              ref.on('child_added', handler);
            });
          });
      },
      create: function (params) {
        var params = _.defaults(params, {
          index: firebaseSearch.options.elasticsearch.index,
          type: firebaseSearch.type
        });
        return firebaseSearch.elasticsearch.exists(params)
          .then(function (exists) {
            return !exists ? true : firebaseSearch.elasticsearch.delete(params);
          })
          .then(function () {
            return toPromise(client.create.bind(client), params);
          });
      },
      delete: function (params) {
        var params = _.defaults(params, {
          index: firebaseSearch.options.elasticsearch.index,
          type: firebaseSearch.type
        });
        return toPromise(client.delete.bind(client), params);
      },
      exists: function (params) {
        var params = _.defaults(params, {
          index: firebaseSearch.options.elasticsearch.index,
          type: firebaseSearch.type
        });
        return toPromise(client.exists.bind(client), params);
      }
    };
  }

  if (this.options.algolia) {
    this.algolia = {

    }
  }
};