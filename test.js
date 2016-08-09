process.env.NODE_ENV = 'test'; // Set env to test
var firebase = require('firebase');
var env = require('./services/environment');
var axios = require('axios');
var test = require('tape-catch');
var _ = require('lodash');
var FirebaseSearch = require('./firebase-search.js');

firebase.initializeApp(env.firebaseConfig);

var ref = firebase.database().ref('firebase-search/' + env.environment);
var usersRef = ref.child('users');
var log = require('./services/log')(ref.child('logs'));
var wait = function (time) {
  return function (arg) {
    var that = this;
    return new Promise(function (resolve, reject) {
      setImmediate(function () {
        setTimeout(function () {
          resolve.call(that, arg);
        }, time);
      });
    });
  }
};

ref.once('value')
  .then(function (snap) {
    if (snap.val()) {
      return true;
    } else {
      return usersRef.remove()
        .then(function () {
          var promises = [];
          var i = 10;
          while (i--) {
            promises.push(axios.get(`http://swapi.co/api/people/${i + 1}/`)
              .then(function (res) {
                return usersRef.push(res.data);
              }));
          }
          return Promise.all(promises);
        });
    }
  })
  .then(function () {
    return usersRef.child('newUser').remove();
  })
  .then(function () {
    var search = new FirebaseSearch(usersRef, env);
    return search.elasticsearch.indices.exists()
      .then(function (exists) {
        return exists ? search.elasticsearch.indices.delete() : true;
      })
      .then(function () {
        return search;
      });
  })
  .then(function (search) {
    return search.elasticsearch.indices.ensure()
      .then(function () {
        return search;
      });
  })
  .then(function (search) {
    return new Promise(function (resolve, reject) {
      test('Index should be empty before build', function (t) {
        search.elasticsearch.search({
          body: {
            query: {
              match_all: {}
            }
          }
        })
          .then(function (res) {
            t.equal(res.hits.hits.length, 0);
            t.end();
            resolve(search);
          });
      });

    });
  })
  .then(function (search) {
    return new Promise(function (resolve, reject) {
      test('ping should succeed', function (t) {
        search.elasticsearch.ping()
          .then(function (res) {
            t.equal(res, true);
            t.end();
            resolve(search);
          });
      });
    });
  })
  .then(function (search) {
    return new Promise(function (resolve, reject) {
      test('Index should be built', function (t) {
        search.elasticsearch.firebase.build()
          .then(wait(1000))
          .then(function () {
            return Promise.all([
              search.ref.once('value'),
              search.elasticsearch.search({
                body: {
                  query: {
                    match_all: {}
                  }
                }
              })
            ])
          })
          .then(function (values) {
            var existing = values[0].numChildren();
            var hits = values[1].hits.hits;
            t.equal(hits.length, existing);
            t.end();
            resolve(search);
          });

      });
    });
  })
  .then(function (search) {
    return new Promise(function (resolve, reject) {
      test('should find Luke Skywalker', function (t) {
        search.elasticsearch.search({
          q: 'name:Luke'
        })
          .then(function (res) {
            if (!res.hits.hits[0]) {
              return console.log('no hits found... rebuild data.');
            }
            var firstHit = res.hits.hits[0]._source;
            t.equal(firstHit.name, 'Luke Skywalker');
            t.end();
            resolve(search);
          });
      });
    });
  })
  .then(function (search) {
    return new Promise(function (resolve, reject) {
      test('Should track additions and changes', function (t) {
        return search.elasticsearch.firebase.start()
          .then(function (firstKey) {
            var timestamp = (new Date()).toString();
            var firstRef = usersRef.child(firstKey);
            var newUserRef = usersRef.child('newUser');
            var hits;

            var promises = [
              new Promise(function (resolve, reject) {
                search.once('child_added', resolve);
              }),
              new Promise(function (resolve, reject) {
                search.once('child_changed', resolve);
              })
            ];
            newUserRef.remove()
              .then(function () {
                return usersRef.child(firstKey).child('timestamp').remove();
              })
              .then(function () {
                var payload = {
                  'newUser': {
                    name: 'Chris',
                    timestamp: timestamp
                  }
                };
                payload[firstKey + '/timestamp'] = timestamp;
                return usersRef.update(payload);
              })
              .then(function () {
                return Promise.all(promises);
              })
              .then(wait(1000))
              .then(function () {
                return search.elasticsearch.search({
                  body: {
                    query: {
                      match: {
                        timestamp: timestamp
                      }
                    }
                  }
                });
              })
              .then(function (res) {
                t.equal(res.hits.hits.length, 2);
                t.end();
                resolve(search);
              });
          });
      });
    });
  })
  .then(function (search) {
    return new Promise(function (resolve, reject) {
      test('Should track removals', function (t) {
        usersRef.child('newUser').remove()
          .then(wait(50))
          .then(function () {
            return Promise.all([
              search.elasticsearch.search({
                body: {
                  query: {
                    match_all: {}
                  }
                }
              }),
              usersRef.once('value')
            ]);
          })
          .then(function (values) {
            var hits = values[0].hits.hits;
            var snap = values[1];
            t.equal(hits.length, snap.numChildren());
            t.end();
            resolve(search);
          });
      });
    });
  })
  .then(function (search) {
    return new Promise(function (resolve, reject) {
      test('is this thing on?', function (t) {
        t.skip();
        t.end();
        resolve(search);
      });
    });
  })
  .then(function (res) {
    log('finished');
    process.exit();
  })
  .catch(function (err) {
    log('error', err);
  });