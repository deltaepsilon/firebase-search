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
      return search.algolia.listIndexes();
    })
    .then(function (indices) {
      var names = _.map(indices, 'name');
      return ~names.indexOf(search.options.type) ? search.algolia.clearIndex() : true;
    })
    .then(function () {
      return search.algolia.setSettings({
        attributesToIndex: [
          'name',
          'timestamp'
        ]
      });
    })
    .then(function () {
      return search.algolia.firebase.start();
    })
    .then(function (firstKey) {
      if (firstKey !== true) throw new Error('firstKey should be true');
      return true;
    })
    .then(function () {
      return search.algolia.clearIndex();
    })
    .then(function () {
      return bootstrap.initialize();
    })
    .then(function () {
      return new Promise(function (resolve, reject) {
        test('Index should be empty before build', function (t) {
          search.algolia.listIndexes()
            .then(function (indices) {
              var index = _.find(indices.items, function (index) {
                return index.name === search.type;
              });
              t.equal(index.name, search.type);
              t.equal(index.entries, 0);
              t.end();
            });
        });

        test('Should build all records', function (t) {
          usersRef.once('value')
            .then(function (snap) {
              return snap.numChildren();
            })
            .then(function (numChildren) {
              search.algolia.firebase.build(true)
                .then(function (res) {
                  t.equal(res.successful, numChildren);
                  t.end();
                });
            });
        });

        test('Should track additions and changes', function (t) {
          return search.algolia.firebase.start()
            .then(function (firstKey) {
              var timestamp = (new Date()).toString();
              var firstRef = usersRef.child(firstKey);
              var newUserRef = usersRef.child('newUser');
              var hits;

              var promises = [
                new Promise(function (resolve, reject) {
                  search.once('algolia_child_added', resolve);
                }),
                new Promise(function (resolve, reject) {
                  search.once('algolia_child_changed', resolve);
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
                .then(function () {
                  return search.algolia.search(timestamp);
                })
                .then(function (res) {
                  t.equal(res.hits.length, 2);
                  return newUserRef.remove();
                })
                .then(function () {
                  t.end();
                });
            });
        });

        test('Should end empty', function (t) {
          search.algolia.clearIndex(true)
            .then(function () {
              return search.algolia.listIndexes();
            })
            .then(function (indices) {
              var index = _.find(indices.items, function (index) {
                return index.name === search.type;
              });
              t.equal(index.name, search.type);
              t.equal(index.entries, 0);
              t.end();
              resolve();
            });
        });
      });
    })
    .then(function () {
      console.log('algolia tests complete');
      process.exit();
      return true;
    })
    .catch(function (err) {
      console.log('algolia-test.js error', err);
    });
};
