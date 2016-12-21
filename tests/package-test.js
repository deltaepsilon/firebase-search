var firebase = require('firebase');
var env = require('../services/environment');
var test = require('tape-catch');
var FirebaseSearch = require('../firebase-search.js');

firebase.initializeApp(env.firebaseConfig);

var ref = firebase.database().ref();
var searchOne = new FirebaseSearch(ref.child('searchOne'), env, 'searchOne');
var searchTwo = new FirebaseSearch(ref.child('searchOne'), env, 'searchTwo');
var searchThree = new FirebaseSearch(ref.child('searchThree'), env, 'searchThree');
console.log(searchOne.type, searchTwo.type, searchThree.type);

module.exports = function () {
  searchOne.algolia.firebase.start();
  searchTwo.algolia.firebase.start();
  searchThree.algolia.firebase.start();

  console.log(searchOne.type, searchTwo.type, searchThree.type);
};

