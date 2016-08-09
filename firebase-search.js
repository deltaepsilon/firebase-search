var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;
var _ = require('lodash');

module.exports = FirebaseSearch;
var firebaseSearch;

function FirebaseSearch(ref, options, type) {
  if (!(this instanceof FirebaseSearch)) {
    return new FirebaseSearch(ref, options, type);
  }
  firebaseSearch = this;
  this.ref = ref;
  this.options = options;
  this.type = type || ref.toString().replace(/.+\.com\//, '').replace(/\//g, ':');
  this.log = require('./services/log')(ref.parent.child(`firebase-search/logs/${this.type}`));
  if (this.options.elasticsearch) {
    var elasticsearch = require('elasticsearch');
    this.client = new elasticsearch.Client(_.clone(this.options.elasticsearch));
  } else {
    this.elasticsearch = 'Elasticsearch options undefined';
  }

  if (this.options.algolia) {
    console.log('algolia options present');
  } else {
    this.algolia = 'Algolia options undefined';
  }
};

inherits(FirebaseSearch, EventEmitter);

var toPromise = function (fn, args) {
  return new Promise(function (resolve, reject) {
    var argsArray = Array.isArray(args) ? args : [args];
    argsArray = argsArray.concat([function (err, res) {
      err ? reject(err) : resolve(res);
    }]);
    fn.apply(this, argsArray);
  }.bind(this));
};

FirebaseSearch.prototype.elasticsearch = {
  indices: {
    exists: function (params) {
      var params = _.defaults(params, {
        index: firebaseSearch.options.elasticsearch.index
      });
      return toPromise(firebaseSearch.client.indices.exists.bind(firebaseSearch.client.indices), params);
    },
    delete: function (params) {
      var params = _.defaults(params, {
        index: firebaseSearch.options.elasticsearch.index
      });
      return toPromise(firebaseSearch.client.indices.delete.bind(firebaseSearch.client.indices), params);
    },
    create: function (params) {
      var params = _.defaults(params, {
        index: firebaseSearch.options.elasticsearch.index
      });
      return toPromise(firebaseSearch.client.indices.create.bind(firebaseSearch.client.indices), params);
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
    return toPromise(firebaseSearch.client.ping.bind(firebaseSearch.client), { hello: 'elasticsearch!' });
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
        return toPromise(firebaseSearch.client.create.bind(firebaseSearch.client), params);
      });
  },
  update: function (params) {
    var params = _.defaults(params, {
      index: firebaseSearch.options.elasticsearch.index,
      type: firebaseSearch.type
    });
    return toPromise(firebaseSearch.client.update.bind(firebaseSearch.client), params);
  },
  delete: function (params) {
    var params = _.defaults(params, {
      index: firebaseSearch.options.elasticsearch.index,
      type: firebaseSearch.type
    });
    return toPromise(firebaseSearch.client.delete.bind(firebaseSearch.client), params);
  },
  exists: function (params) {
    var params = _.defaults(params, {
      index: firebaseSearch.options.elasticsearch.index,
      type: firebaseSearch.type
    });
    return toPromise(firebaseSearch.client.exists.bind(firebaseSearch.client), params);
  },
  get: function (params) {
    var params = _.defaults(params, {
      index: firebaseSearch.options.elasticsearch.index,
      type: firebaseSearch.type
    });
    return toPromise(firebaseSearch.client.get.bind(firebaseSearch.client), params);
  },
  search: function (params) {
    var params = _.defaults(params, {
      index: firebaseSearch.options.elasticsearch.index,
      type: firebaseSearch.type
    });
    return toPromise(firebaseSearch.client.search.bind(firebaseSearch.client), params);
  },
  firebase: { // Firebase index management
    build: function (returnPromise) {
      return new Promise(function(resolve, reject) {
        var ref = firebaseSearch.ref.orderByKey().limitToLast(1); 
        var handler = function(snap) {
          ref.off('child_added', handler);
          resolve(snap.key);
        };
        var timer = setTimeout(function() { // Must be empty if no response in 1000 millis
          ref.off('child_added', handler);
          reject('Timeout! Could be an empty Firebase collection.');
        }, 1000);
        ref.on('child_added', handler);
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
                }, 250);
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
    start: function () {
      return new Promise(function (resolve, reject) {
        var ref = firebaseSearch.ref;
        var started;
        firebaseSearch.handlers = {
          child_added: function (snap) {
            if (!started) { // Skip the first child_added event. It's always an existing record. 
              started = true;
              resolve(snap.key);
            } else {
              firebaseSearch.emit('child_added', snap);
              // firebaseSearch.log('child_added', snap.key);
              firebaseSearch.elasticsearch.create({
                id: snap.key,
                body: snap.val()
              });
            }
          },
          child_changed: function(snap) {
            firebaseSearch.emit('child_changed', snap);
            // firebaseSearch.log('child_changed', snap.key);
            firebaseSearch.elasticsearch.update({
              id: snap.key,
              body: snap.val()
            });
          },
          child_removed: function (snap) {
            firebaseSearch.emit('child_removed', snap);
            // firebaseSearch.log('child_removed', snap.key);
            firebaseSearch.elasticsearch.delete({
              id: snap.key
            });
          }
        };
        firebaseSearch.listeningRefs = {
          child_added: ref.orderByKey().limitToLast(1),
          child_changed: ref,
          child_removed: ref
        };
        firebaseSearch.listeningRefs.child_added.on('child_added', firebaseSearch.handlers.child_added);
        firebaseSearch.listeningRefs.child_changed.on('child_changed', firebaseSearch.handlers.child_changed);
        firebaseSearch.listeningRefs.child_removed.on('child_removed', firebaseSearch.handlers.child_removed);
      });
    },
    stop: function () {
      if (firebaseSearch.handler && firebaseSearch.listeningRefs) {
        firebaseSearch.listeningRefs.child_added.off('child_added', firebaseSearch.handlers.child_added);
        firebaseSearch.listeningRefs.child_removed.off('child_removed', firebaseSearch.handlers.child_removed);
      } else {
        console.firebaseSearch.log('Firebase listeners not started.');
      }
    }
  }
};

FirebaseSearch.prototype.algolia = {
  yes: 'no'
};


// module.exports = function (ref, options, type) {
//   var firebaseSearch = this;


//   this.ref = ref;
//   this.options = options;
//   this.type = type || ref.toString().replace(/.+\.com\//, '').replace(/\//g, ':');



//   if (this.options.elasticsearch) {
//     var elasticsearch = require('elasticsearch');
//     var firebaseSearch.client = new elasticsearch.firebaseSearch.client(_.clone(options.elasticsearch));

//     this.elasticsearch = {

//     };
//   }

//   if (this.options.algolia) {
//     this.algolia = {

//     }
//   }
// };