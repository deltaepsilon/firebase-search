var firebase = require('firebase');
var env = require('./services/environment');
var axios = require('axios');
var test = require('tape');
var _ = require('lodash');
var FirebaseSearch = require('./firebase-search.js');

firebase.initializeApp(env.firebaseConfig);

var ref = firebase.database().ref('firebase-search/test');
var usersRef = ref.child('users');

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
  // .then(function() {
  //   var search = new FirebaseSearch(usersRef, env);
  //   return search;
  // })
  .then(function(search) {
    return new Promise(function(resolve, reject) {
      test('Should build index', function(t) {
        Promise.all([
          search.elasticsearch.build(),
          search.ref.once('value')
        ])
          .then(function(values) {
            var successful = values[0].successful;
            var existing = values[1].numChildren();
            t.equal(successful, existing);
            t.end();
            resolve(search);
          }, reject)
      });
    })
  })
  .then(function (res) {
    console.log('finished');
    process.exit();
  })
  .catch(function (err) {
    console.log('error', err);
  });