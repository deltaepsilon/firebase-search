var axios = require('axios');
var test = require('tape-catch');
var _ = require('lodash');
var bootstrap = require('./bootstrap');

var firebase = bootstrap.firebase;
var env = bootstrap.env;
var search = bootstrap.search;

var ref = bootstrap.ref;
var usersRef = bootstrap.usersRef;
var log = bootstrap.log;
var wait = bootstrap.wait;
module.exports = function () {
  return usersRef.remove()
    .then(function () {
      return usersRef.child('newUser').remove();
    })
    .then(function () {
      return search.elasticsearch.indices.exists()
        .then(function (exists) {
          return exists ? search.elasticsearch.indices.delete() : true;
        });
    })
    .then(function () {
      return search.elasticsearch.indices.ensure();
    })
    .then(function () {
      return search.elasticsearch.firebase.start();
    })
    .then(function (firstKey) {
      if (firstKey !== true) throw new Error('firstKey should be true');
      return true;
    })
    .then(function () {
      return bootstrap.initialize();
    })
    .then(function () {
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
              resolve();
            });
        });

      });
    })
    .then(function () {
      return new Promise(function (resolve, reject) {
        test('ping should succeed', function (t) {
          search.elasticsearch.ping()
            .then(function (res) {
              t.equal(res, true);
              t.end();
              resolve();
            });
        });
      });
    })
    .then(function () {
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
              resolve();
            });

        });
      });
    })
    .then(function () {
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
              resolve();
            });
        });
      });
    })
    .then(function () {
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
                  search.once('elasticsearch_child_added', resolve);
                }),
                new Promise(function (resolve, reject) {
                  search.once('elasticsearch_child_changed', resolve);
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
                  resolve();
                });
            });
        });
      });
    })
    .then(function () {
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
              resolve();
            });
        });
      });
    })
    .then(function () {
      return new Promise(function (resolve, reject) {
        test('is this thing on?', function (t) {
          t.skip();
          t.end();
          resolve();
        });
      });
    })
    .then(function (res) {
      log('Elasticsearch tests complete ');
      process.exit();
      return true;
    })
    .catch(function (err) {
      log('error', err);
    });
};
