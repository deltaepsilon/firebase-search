var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;
var _ = require('lodash');

inherits(FirebaseSearch, EventEmitter);

module.exports = FirebaseSearch;

function FirebaseSearch(ref, options, type) {
  if (!(this instanceof FirebaseSearch)) {
    return new FirebaseSearch(ref, options, type);
  }

  var firebaseSearch = this;

  setPrototype(firebaseSearch);

  this.ensureExistingUser = function () {
    ref.orderByKey().limitToLast(1).once('value', function (snap) {
      if (!snap.numChildren()) {
        var fakeRef = ref.push();
        fakeRef.set(true)
          .then(function () {
            fakeRef.remove();
          })
      }
    });
  };

  this.getLastKey = function () {
    return new Promise(function (resolve, reject) {
      var ref = firebaseSearch.ref.orderByKey().limitToLast(1);
      var handler = function (snap) {
        ref.off('child_added', handler);
        resolve(snap.key);
      };
      var timer = setTimeout(function () { // Must be empty if no response in 1000 millis
        ref.off('child_added', handler);
        reject('Timeout! Could be an empty Firebase collection.');
      }, 1000);
      ref.on('child_added', handler);
    });
  };

  this.fire = function (name, detail) {
    firebaseSearch.emit(name, detail);
    firebaseSearch.emit('all', {
      name: name,
      detail: detail
    });
  };

  this.ref = ref;
  this.options = options;
  this.type = type || ref.toString().replace(/.+\.com\//, '').replace(/\//g, ':');
  if (options.log) {
    this.log = require('./services/log')(ref.parent.child(`firebase-search/logs/${this.type}`));
  } else {
    this.log = console.log;
  }
  if (this.options.elasticsearch) {
    var elasticsearch = require('elasticsearch');
    this.elasticsearch.client = new elasticsearch.Client(_.clone(this.options.elasticsearch));
  } else {
    this.elasticsearch = 'Elasticsearch options undefined';
  }

  if (this.options.algolia) {
    var algoliasearch = require('algoliasearch');
    this.algolia.client = algoliasearch(this.options.algolia.applicationID, this.options.algolia.apiKey);
    this.algolia.index = this.algolia.client.initIndex(this.type);
  } else {
    this.algolia = 'Algolia options undefined';
  }
};

function setPrototype(firebaseSearch) {
  
  function toPromise(fn, args, algoliaWait) {
    return new Promise(function (resolve, reject) {
      var argsArray = Array.isArray(args) ? args : [args];

      if (algoliaWait) {
        argsArray = argsArray.concat([function (err, content) {
          if (err) {
            reject(err);
          } else {
            firebaseSearch.algolia.index.waitTask(content.taskID, function (err) {
              err ? reject(err) : resolve(content);
            });
          }
        }]);
      } else {
        argsArray = argsArray.concat([function (err, res) {
          err ? reject(err) : resolve(res);
        }]);
      }


      if (typeof argsArray[0] === 'undefined') {
        argsArray.splice(0, 1);
      }
      fn.apply(this, argsArray);
    }.bind(this));
  };

  function addKeyToSnap(snap) {
    var obj = snap.val();
    obj.__id__ = snap.key;
    return obj;
  };


  firebaseSearch.elasticsearch = {
    indices: {
      exists: function (params) {
        var params = _.defaults(params, {
          index: firebaseSearch.options.elasticsearch.index
        });
        return toPromise(firebaseSearch.elasticsearch.client.indices.exists.bind(firebaseSearch.elasticsearch.client.indices), params);
      },
      delete: function (params) {
        var params = _.defaults(params, {
          index: firebaseSearch.options.elasticsearch.index
        });
        return toPromise(firebaseSearch.elasticsearch.client.indices.delete.bind(firebaseSearch.elasticsearch.client.indices), params);
      },
      create: function (params) {
        var params = _.defaults(params, {
          index: firebaseSearch.options.elasticsearch.index
        });
        return toPromise(firebaseSearch.elasticsearch.client.indices.create.bind(firebaseSearch.elasticsearch.client.indices), params);
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
      return toPromise(firebaseSearch.elasticsearch.client.ping.bind(firebaseSearch.elasticsearch.client), { hello: 'elasticsearch!' });
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
          return toPromise(firebaseSearch.elasticsearch.client.create.bind(firebaseSearch.elasticsearch.client), params);
        });
    },
    update: function (params) {
      var params = _.defaults(params, {
        index: firebaseSearch.options.elasticsearch.index,
        type: firebaseSearch.type
      });
      return toPromise(firebaseSearch.elasticsearch.client.update.bind(firebaseSearch.elasticsearch.client), params);
    },
    delete: function (params) {
      var params = _.defaults(params, {
        index: firebaseSearch.options.elasticsearch.index,
        type: firebaseSearch.type
      });
      return toPromise(firebaseSearch.elasticsearch.client.delete.bind(firebaseSearch.elasticsearch.client), params);
    },
    exists: function (params) {
      var params = _.defaults(params, {
        index: firebaseSearch.options.elasticsearch.index,
        type: firebaseSearch.type
      });
      return toPromise(firebaseSearch.elasticsearch.client.exists.bind(firebaseSearch.elasticsearch.client), params);
    },
    get: function (params) {
      var params = _.defaults(params, {
        index: firebaseSearch.options.elasticsearch.index,
        type: firebaseSearch.type
      });
      return toPromise(firebaseSearch.elasticsearch.client.get.bind(firebaseSearch.elasticsearch.client), params);
    },
    search: function (params) {
      var params = _.defaults(params, {
        index: firebaseSearch.options.elasticsearch.index,
        type: firebaseSearch.type
      });
      return toPromise(firebaseSearch.elasticsearch.client.search.bind(firebaseSearch.elasticsearch.client), params);
    },
    firebase: { // Firebase index management
      build: function (returnPromise) {
        return firebaseSearch.getLastKey()
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
          firebaseSearch.elasticsearch.handlers = {
            child_added: function (snap) {
              if (!started) { // Skip the first child_added event. It's often an existing record. 
                started = true;
                resolve(snap.key);
              } else {
                firebaseSearch.fire('elasticsearch_child_added', addKeyToSnap(snap));
                // firebaseSearch.log('elasticsearch_child_added', snap.key);
                firebaseSearch.elasticsearch.create({
                  id: snap.key,
                  body: snap.val()
                });
              }
            },
            child_changed: function (snap) {
              firebaseSearch.fire('elasticsearch_child_changed', addKeyToSnap(snap));
              // firebaseSearch.log('elasticsearch_child_changed', snap.key);
              firebaseSearch.elasticsearch.update({
                id: snap.key,
                body: {
                  doc: snap.val()
                }
              });
            },
            child_removed: function (snap) {
              firebaseSearch.fire('elasticsearch_child_removed', addKeyToSnap(snap));
              // firebaseSearch.log('elasticsearch_child_removed', snap.key);
              firebaseSearch.elasticsearch.delete({
                id: snap.key
              });
            }
          };
          firebaseSearch.elasticsearch.listeningRefs = {
            child_added: ref.orderByKey().limitToLast(1),
            child_changed: ref,
            child_removed: ref
          };
          firebaseSearch.elasticsearch.listeningRefs.child_added.once('value')
            .then(function (snap) {
              if (!snap.numChildren()) started = true, resolve(true);
              firebaseSearch.elasticsearch.listeningRefs.child_added.on('child_added', firebaseSearch.elasticsearch.handlers.child_added);
              firebaseSearch.elasticsearch.listeningRefs.child_changed.on('child_changed', firebaseSearch.elasticsearch.handlers.child_changed);
              firebaseSearch.elasticsearch.listeningRefs.child_removed.on('child_removed', firebaseSearch.elasticsearch.handlers.child_removed);
            });
        });
      },
      stop: function () {
        if (firebaseSearch.elasticsearch.handlers && firebaseSearch.elasticsearch.listeningRefs) {
          firebaseSearch.elasticsearch.listeningRefs.child_added.off('child_added', firebaseSearch.elasticsearch.handlers.child_added);
          firebaseSearch.elasticsearch.listeningRefs.child_changed.off('child_changed', firebaseSearch.elasticsearch.handlers.child_changed);
          firebaseSearch.elasticsearch.listeningRefs.child_removed.off('child_removed', firebaseSearch.elasticsearch.handlers.child_removed);
        } else {
          firebaseSearch.log('Firebase elasticsearch listeners not started.');
        }
      }
    }
  };

  firebaseSearch.algolia = {
    search: function (query, options) {
      return toPromise(firebaseSearch.algolia.index.search.bind(firebaseSearch.algolia.index), [query, options]);
    },
    addObject: function (args, shouldWait) {
      return toPromise(firebaseSearch.algolia.index.addObject.bind(firebaseSearch.algolia.index), args, shouldWait);
    },
    saveObject: function (args, shouldWait) {
      return toPromise(firebaseSearch.algolia.index.saveObject.bind(firebaseSearch.algolia.index), args, shouldWait);
    },
    deleteObject: function (args, shouldWait) {
      return toPromise(firebaseSearch.algolia.index.deleteObject.bind(firebaseSearch.algolia.index), args, shouldWait);
    },
    setSettings: function (args) {
      return toPromise(firebaseSearch.algolia.index.setSettings.bind(firebaseSearch.algolia.index), args);
    },
    listIndexes: function () {
      return toPromise(firebaseSearch.algolia.client.listIndexes.bind(firebaseSearch.algolia.client));
    },
    clearIndex: function (shouldWait) {
      return toPromise(firebaseSearch.algolia.index.clearIndex.bind(firebaseSearch.algolia.index), undefined, shouldWait);
    },
    waitTask: function (args) {
      return toPromise(firebaseSearch.algolia.index.waitTask.bind(firebaseSearch.algolia.index), args);
    },
    exists: function (name) {
      var name = name || firebaseSearch.type;
      return firebaseSearch.algolia.listIndexes()
        .then(function (indexes) {
          return !!~_.map(indexes.items, 'name').indexOf(name);
        });
    },
    firebase: {
      build: function () {
        return firebaseSearch.getLastKey()
          .then(function (lastKey) {
            return new Promise(function (resolve, reject) {
              var ref = firebaseSearch.ref.orderByKey();
              var first = true;
              var finish = false;
              var successful = 0;
              var failed = 0;
              var total = 0;
              var children = [];
              var timeouts = 0;
              var processObj = function () {
                if (children.length) {
                  var obj = children.shift();
                  firebaseSearch.algolia.addObject(obj)
                    .then(function (res) {
                      if (res.createdAt) {
                        successful += 1;
                      } else {
                        failed += 1;
                      }
                      total += 1;
                      processObj(); // Process next record from front of list  
                    });
                } else {
                  if (finish) {
                    resolve({
                      successful: successful,
                      failed: failed,
                      total: total
                    });
                  } else { // Wait for lagging child_added events and try again.
                    if (timeouts < 10) {
                      setTimeout(function () {
                        timeouts += 1;
                        processObj();
                      }, 500);
                    } else {
                      reject('child_added events took too long.');
                    }
                  }
                }
              };
              var handler = function (snap) {
                var obj = snap.val();
                obj.objectID = snap.key;
                children.push(obj);

                if (first) {
                  first = false;
                  processObj();
                }

                if (snap.key === lastKey) {
                  ref.off('child_added', handler);
                  finish = true;
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
          firebaseSearch.algolia.handlers = {
            child_added: function (snap) {
              if (!started) { // Skip the first child_added event. It's often an existing record. 
                started = true;
                resolve(snap.key);
              } else {
                var obj = snap.val();
                obj.objectID = snap.key;
                firebaseSearch.algolia.addObject(obj, true)
                  .then(function () {
                    // firebaseSearch.log('algolia_child_added', snap.key);
                    firebaseSearch.fire('algolia_child_added', obj);
                  });
              }
            },
            child_changed: function (snap) {
              var obj = snap.val();
              obj.objectID = snap.key;
              firebaseSearch.algolia.saveObject(obj, true)
                .then(function () {
                  // firebaseSearch.log('algolia_child_changed', snap.key);
                  firebaseSearch.fire('algolia_child_changed', obj);
                });
            },
            child_removed: function (snap) {
              firebaseSearch.algolia.deleteObject(snap.key, true)
                .then(function () {
                  // firebaseSearch.log('algolia_child_removed', snap.key);
                  firebaseSearch.fire('algolia_child_removed', snap.key);
                });
            }
          };
          firebaseSearch.algolia.listeningRefs = {
            child_added: ref.orderByKey().limitToLast(1),
            child_changed: ref,
            child_removed: ref
          };

          firebaseSearch.algolia.listeningRefs.child_added.once('value')
            .then(function (snap) {
              if (!snap.numChildren()) started = true, resolve(true);
              firebaseSearch.algolia.listeningRefs.child_added.on('child_added', firebaseSearch.algolia.handlers.child_added);
              firebaseSearch.algolia.listeningRefs.child_changed.on('child_changed', firebaseSearch.algolia.handlers.child_changed);
              firebaseSearch.algolia.listeningRefs.child_removed.on('child_removed', firebaseSearch.algolia.handlers.child_removed);
            });
        });
      },
      stop: function () {
        if (firebaseSearch.algolia.handlers && firebaseSearch.algolia.listeningRefs) {
          firebaseSearch.algolia.listeningRefs.child_added.off('child_added', firebaseSearch.algolia.handlers.child_added);
          firebaseSearch.algolia.listeningRefs.child_changed.off('child_changed', firebaseSearch.algolia.handlers.child_changed);
          firebaseSearch.algolia.listeningRefs.child_removed.off('child_removed', firebaseSearch.algolia.handlers.child_removed);
        } else {
          firebaseSearch.log('Firebase algolia listeners not started.');
        }
      }
    }
  };
};
