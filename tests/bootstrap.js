process.env.NODE_ENV = 'test'; // Set env to test
var firebase = require('firebase');
var env = require('../services/environment');
var axios = require('axios');
var test = require('tape-catch');
var _ = require('lodash');
var FirebaseSearch = require('../firebase-search.js');

firebase.initializeApp(env.firebaseConfig);

var ref = firebase.database().ref('firebase-search/' + env.environment);
var usersRef = ref.child('users');
var log = require('../services/log')(ref.child('logs'));
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


module.exports = {
  firebase: firebase,
  env: env,
  ref: ref,
  usersRef: usersRef,
  log: log,
  search: new FirebaseSearch(usersRef, env),
  wait: wait,
  initialize: function () {
    return ref.once('value')
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
      });
  }
};
