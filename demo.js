var FirebaseSearch = require('./firebase-search.js');
var firebase = require('firebase');
var axios = require('axios');
var _ = require('lodash');

firebase.initializeApp({
  "databaseURL": "https://quiver-firebase-search.firebaseio.com",
  "serviceAccount": "./service-account.json"
});

var usersRef = firebase.database().ref('demo/users');
var elasticsearchConfig = {
    host: 'localhost:9200',
    log: 'warning',
    index: 'development'
  };
var algoliaConfig = require('./env.json').defaults.algolia;
// Sample Algolia config
// var algoliaConfig = {
//   "applicationID": "XXXXXXXX",
//   "searchAPIKey": "XXXXXXXX",
//   "monitoringAPIKey": "XXXXXXXX",
//   "apiKey": "XXXXXXXX"
// };
 
var search = new FirebaseSearch(usersRef, {
  elasticsearch: elasticsearchConfig,
  algolia: algoliaConfig
}, 'users');

search.elasticsearch.indices.exists()
  .then(function(exists) { // Delete elasticsearch index if it exists
    return exists ? search.elasticsearch.indices.delete() : true;
  })
  .then(function() { // Create elasticsearch index
    return search.elasticsearch.indices.create();
  })
  .then(function() { // Check if Algolia index exists
    return search.algolia.exists();
  })
  .then(function(exists) { // Make sure that Algolia index exists
    return exists ? search.algolia.clearIndex(true) : search.algolia.setSettings({attributesToIndex: ['name', 'gender']});
  })
  .then(function() { // Set listeners
    search.elasticsearch.firebase.start();
    search.algolia.firebase.start();
    search.on('all', function(e) {
      console.log(e.name, e.detail.name, "\n");
    });
    return true;
  })
  .then(function() {
    return usersRef.remove();
  })
  .then(function () { // Download 5 users from SWAPI
    var i = 5;
    var promises = [];
    var users = [];
    var getUser = function (i) {
      promises.push(axios.get(`http://swapi.co/api/people/${i + 1}/`)
        .then(function (res) {
          users.push(res.data);
        })
        .catch(function (err) {
          console.log('axios err', i);
          return true;
        }));
    };

    while (i--) {
      getUser(i);
    }
    return Promise.all(promises)
      .then(function() {
        return users;
      });
  })
  .then(function (users) { // Write users to disk
    var jsonFormat = require('json-format');
    var fs = require('fs');
    var fakeUsersFile = fs.openSync('./fake-users.json', 'w+');
    fs.writeSync(fakeUsersFile, jsonFormat(users));
    return fs.closeSync(fakeUsersFile);
  })
  .then(function () { // Read users from disk and push one to Firebase every 1000 millis
    return new Promise(function (resolve, reject) {
      var users = require('./fake-users.json');
      var pushUser = function (user) {
        usersRef.push(user)
          .then(function () {
            setTimeout(function () {
              if (users.length) {
                pushUser(users.pop());
              } else {
                resolve();
              }
            }, 1000);
          });
      };
      pushUser(users.pop());
    });
  })
  .then(function () {
    console.log('All records added. Now play around with the Firebase data to watch things change.');
    // process.exit();
  });

