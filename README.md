# Installation

Install with nmp: ```npm install quiver-firebase-search```.

# Configuration

### Configure Firebase
- Create a Firebase project
- Configure a billing account for the Google Cloud project associated with this new Firebase project. You may need to upgrade your Firebase from Spark (free) to Blaze (pay as you go).
- Go to your project's Google Cloud Console's [API Manager](https://console.cloud.google.com/apis/credentials) and create a service account JSON file
  1. Click ***Create credentials***
  2. Select ***Service account key***
  3. Create new service account, give it a name and select JSON
  4. Download and save this key securely on your local machine

### Configure env.json

- Create ```/env.json``` using ```/env.json.dist``` as a template. Make sure to reference the service account JSON file that you created in the last step.
- ```env.json``` has three root nodes, ```defaults```, ```development```, ```test``` and ```production```. Fill in your details under the ```defaults``` node. The other three nodes are used to override your defaults according to ```process.env.NODE_ENV```. So if you're in production, ```process.env.NODE_ENV``` will be ```production```, and any overrides that you provide under the ```production``` attribute will override your defaults.
- You'll add your Elasticsearch and Algolia details to ```env.json``` once you have each service configured.
- If you're not using Elasticsearch, do not include any ```elasticsearch``` attributes in ```env.json```. The same goes for Algolia... don't include specs for the services that you're not using. Excluding a spec will disable that part of FirebaseSearch. So excluding ```defaults.elasticsearch``` will disable Elasticsearch. Of course, if you add a spec under ```production.elasticsearch```, then FirebaseSearch will attempt to configure Elasticsearch in your production environment.

### Configure Elasticsearch
- Find Google's [Elasticsearch project on Cloud Launcher](https://console.cloud.google.com/launcher/details/click-to-deploy-images/elasticsearch?q=elasticsearch&project=firebase-search)
- Launch a new cluster. Feel free to use the cheapest configuration. Elasticsearch doesn't need much processing power for simple operations.
- The [Deployment Manager](https://console.cloud.google.com/deployments) will have most of the details that you need to configure ```env.json```.
- You have a couple of options for connecting to your cluster. You can use the external IP, or you can use the gcloud utility to create a local tunnel and work off of an internal, tunnelled IP. The external IP method requires that you whitelist all Elasticsearch clients via your [Google Cloud firewall rules](https://console.cloud.google.com/networking/firewalls/list). Tunnelling is a bit easier, because gcloud handles all of the configuration for you. Of course, you could also tunnel manually using SSH or Nginx... so tunnelling is the most flexible and possibly the most secure way to connect.
- If you want to use the external IP, go to your [Compute Engine](https://console.cloud.google.com/compute/instances) page to find the external IP address for your cluster and then whitelist your client with a firewall rule.
- If you'd rather tunnel... 
  - Install [gcloud](https://cloud.google.com/sdk/)
  - Run ```gcloud --version``` and update if prompted
  - Run ```gcloud init``` to get your project initialized
  - Run ```npm run-script tunnel``` to read out a shell command that you can use to launch a local tunnel on port 9200 to your Elasticsearch cluster. This tunnel is required for testing and development, but not for production.
  - Visit [http://localhost:9200](http://localhost:9200) in your browser. You should see some JSON read out from Elasticsearch if your cluster is running and your tunnel is also live.

### Configure Algolia
- Sign up for [Algolia](https://www.algolia.com/)
- Copy your [api keys](https://www.algolia.com/api-keys) to ```env.json```.

### Testing
  
- Make sure that you've configured Firebase, Elasticsearch and Algolia according to the above instructions.
- Run ```npm install && npm test``` to ensure that everything is configured correctly. This command will test the indexing against the databaseURL that you referenced in ```env.json```. It will create some dummy data under ```/firebase-search/test/users```. It doesn't hurt to leave the dummy data, but it doesn't delete it automatically in case you want to run the tests again later. There's no need to attack the SWAPI servers that supply dummy data.
- You can run tests individually with ```node test-algolia.js``` and ```node test-elasticsearch.js```.

# Example Usage

```javascript
var FirebaseSearch = require('./firebase-search.js');
var firebase = require('firebase');

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
var algoliaConfig =  {
  "applicationID": "XXXXXXXX",
  "searchAPIKey": "XXXXXXXX",
  "monitoringAPIKey": "XXXXXXXX",
  "apiKey": "XXXXXXXX"
};
 
var search = new FirebaseSearch(usersRef, {
  elasticsearch: elasticsearchConfig,
  algolia: algoliaConfig
}, 'users');

search.elasticsearch.start();
search.algolia.start();
```

# FirebaseSearch Functions

## FirebaseSearch.elasticsearch.client

The entire [Elasticsearch client api](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/api-reference.html) is available via ```FirebaseSearch.elasticsearch.client```.

## FirebaseSearch.prototype.elasticsearch

A number of top-level Elasticsearch functions are proxied by FirebaseSearch from the [original api](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/api-reference.html). They're used internally by FirebaseSearch and also exist to provide a nice Promise-based api.

All functions assumed the default ```index``` and ```type``` values, although they can be overridden as needed. So where you'd typically need to make a call like ```firebasSearch.elasticsearch.create({index: 'development', type: 'users', body: {name: 'Chris'}});```, with the proxied version you can simply call ```firebasSearch.elasticsearch.create({body: {name: 'Chris'}});```. 

### Elasticsearch top-level proxied functions

***FirebaseSearch.prototype.elasticsearch.ping()***

```javascript
search.elasticsearch.ping()
  .then(function (isThisOn) {
    console.log('Is this thing on?', isThisOn);
  });
```

***FirebaseSearch.prototype.elasticsearch.create(requestObject)***

```javascript
search.elasticsearch.create({
  body: {
    name: 'Chris'
  }
})
  .then(function (res) {
    console.log('Create response', res);
  });
```

***FirebaseSearch.prototype.elasticsearch.update(requestObject)***

```javascript
search.elasticsearch.update({
  body: {
    doc: {
      name: 'Spike'
    }
  }
})
  .then(function (res) {
    console.log('Update response', res);
  });
```

***FirebaseSearch.prototype.elasticsearch.delete(requestObject)***

```javascript
search.elasticsearch.delete({
  id: 'someUserId'
})
  .then(function (res) {
    console.log('Delete response', res);
  });
```

***FirebaseSearch.prototype.elasticsearch.exists(requestObject)***

```javascript
search.elasticsearch.exists({
  id: 'someUserId'
})
  .then(function (exists) {
    console.log('Does this record exist?', exists);
  });
```

***FirebaseSearch.prototype.elasticsearch.get(requestObject)***

```javascript
search.elasticsearch.get({
  id: 'someUserId'
})
  .then(function (res) {
    console.log('Get response', res);
  });
```

***FirebaseSearch.prototype.elasticsearch.search(requestObject)***

```javascript
search.elasticsearch.search({
  q: 'name:Chris'
})
  .then(function (res) {
    console.log('Search response', res);
  });
```

## FirebaseSearch.prototype.elasticsearch.indices

The functions found under ```FirebaseSearch.prototype.elasticsearch.indices``` are all proxies of their [corresponding Elasticsearch functions](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/api-reference.html#api-indices-create). The only difference is that you don't have to specify any parameters to use them, because FirebaseSearch already knows which index you're using and defaults to that index. Of course, you can always override the default parameters if necessary.

### Elasticsearch proxied index functions

- ***elasticsearch.indices.exists()***
- ***elasticsearch.indices.delete()***
- ***elasticsearch.indices.create()***
- ***elasticsearch.indices.ensure()***

### Usage

```javascript
search.elasticsearch.indices.exists()
  .then(function (exists) {
    console.log('Does the index exist?', exists);
  });

search.elasticsearch.indices.delete()
  .then(function () {
    console.log('index deleted');
  });

search.elasticsearch.indices.create()
  .then(function () {
    console.log('index created');
  });

search.elasticsearch.indices.ensure()
  .then(function () {
    console.log('index created if necessary');
  });
```

### FirebaseSearch.prototype.elasticsearch.firebase

The functions found under ```FirebaseSearch.prototype.elasticsearch.firebase``` handle common Firebase operations.

***FirebaseSearch.prototype.elasticsearch.firebase.build()***

Builds the Elasticsearch index to reflect all existing Firebase records

```javascript
search.elasticsearch.firebase.build()
  .then(function () {
    console.log('Index built and synced with current Firebase state.');
  })
```

***FirebaseSearch.prototype.elasticsearch.firebase.start()***

Starts listening to Firebase records additions, changes and removals, syncing Elasticsearch appropriately

```javascript
search.elasticsearch.firebase.start()
  .then(function () {
    console.log('Syncing Elasticsearch with Firebase');
  })
```

***FirebaseSearch.prototype.elasticsearch.firebase.stop()*** 

Stops listening to Firebase and syncing Elasticsearch 

```javascript
search.elasticsearch.firebase.stop()
  .then(function () {
    console.log('Stopped syncing Elasticsearch with Firebase');
  })
```

### FirebaseSearch.algolia.client

Provides access to the Algolia [client api](https://www.algolia.com/doc/api-client/javascript/getting-started#init-index)

### FirebaseSearch.algolia.index

Provides access to the Algolia [index api](https://www.algolia.com/doc/api-client/javascript/getting-started#init-index)

### FirebaseSearch.prototype.algolia

These proxied functions are used internally by FirebaseSearch and are also available for manipulating Algolia.

These functions all return promises and can be called so that they wait for Algolia to finish its operations and confirm success before resolving the promise. Algolia returns all write operations immediately and provides a ```waitTask(taskID)``` function to wait for task completion.

***FirebaseSearch.prototype.algolia.search(searchText, options)***

Takes a search string as a first argument and an optional search options objects as a second argument.

```javascript
search.algolia.search('search text', {
  hitsPerPage: 25
})
  .then(function (res) {
    console.log('Search results', res);
  });
```

***FirebaseSearch.prototype.algolia.addObject(object, shouldWait)***

```javascript
search.algolia.addObject({
  name: 'Chris',
  objectID: '123456'
}, true)
  .then(function (res) {
    console.log('Object added', res);
  });
```

***FirebaseSearch.prototype.algolia.saveObject(object, shouldWait)***

```javascript
search.algolia.saveObject({
  name: 'Chris',
  objectID: '123456'
}, true)
  .then(function (res) {
    console.log('Object saved', res);
  });
```

***FirebaseSearch.prototype.algolia.deleteObject(objectID, shouldWait)***

```javascript
search.algolia.deleteObject('123456', true)
  .then(function (res) {
    console.log('Object deleted', res);
  });
```

***FirebaseSearch.prototype.algolia.setSettings(settings)***

```javascript
search.algolia.setSettings({
  customRanking: ['desc(height)']
})
  .then(function () {
    console.log('Setting set');
  });
```

***FirebaseSearch.prototype.algolia.listIndexes()***

```javascript
search.algolia.listIndexes()
  .then(function (indexes) {
    console.log('indexes', indexes);
  });
```

***FirebaseSearch.prototype.algolia.clearIndex()***

```javascript
search.algolia.clearIndex()
  .then(function () {
    console.log('Index cleared');
  });
```

***FirebaseSearch.prototype.algolia.waitTask()***

```javascript
search.algolia.index.partialUpdateObject({
  objectID: '123456',
  favoriteColor: 'green'
}, function (err, content) {
  search.algolia.waitTask(content.taskID)
    .then(function () {
      console.log('task complete');
    });
});
```

###FirebaseSearch.prototype.algolia.exists(objectType)

Algolia doesn't come with an "exists" function out of the box. But Elasticsearch's exist function is so useful, we might as well pre-package one for Algolia as well.

```javascript
search.algolia.exists('users')
  .then(function (exists) {
    console.log('Users index exists', exists);
  });
```

### FirebaseSearch.prototype.algolia.firebase

The functions found under ```FirebaseSearch.prototype.algolia.firebase``` handle common Firebase operations.

***FirebaseSearch.prototype.algolia.firebase.build()***

Builds the Algolia index to reflect all existing Firebase records

```javascript
search.algolia.firebase.build()
  .then(function () {
    console.log('Index built and synced with current Firebase state.');
  })
```

***FirebaseSearch.prototype.algolia.firebase.start()***

Starts listening to Firebase records additions, changes and removals, syncing Algolia appropriately

```javascript
search.algolia.firebase.start()
  .then(function () {
    console.log('Syncing Algolia with Firebase');
  })
```

***FirebaseSearch.prototype.algolia.firebase.stop()*** 

Stops listening to Firebase and syncing Algolia 

```javascript
search.algolia.firebase.stop()
  .then(function () {
    console.log('Stopped syncing Algolia with Firebase');
  })
```

# Events

Syncing with Elasticsearch and Algolia is all so asynchronous and difficult to track, that an events system is the easiest way to manage wait for syncing operations.

These events are all called after syncing has been completed by one of the ```*.start``` functions.

The ```all``` event is mostly for debugging, but it could be used for all sorts of stuff. It's fired every time any other event is fired. 

- ***all***
- ***elasticsearch_child_added***
- ***elasticsearch_child_changed***
- ***elasticsearch_child_removed***
- ***algolia_child_added***
- ***algolia_child_changed***
- ***algolia_child_removed***

## Usage

```javascript
search.on('all', function (e){
  console.log('Event name', e.name);
  console.log('Event detail', e.detail);
});

search.on('elasticsearch_child_added', function (record){
  console.log('Record synced', record);
});

search.on('elasticsearch_child_changed', function (record){
  console.log('Record synced', record);
});

search.on('elasticsearch_child_removed', function (record){
  console.log('Record synced', record);
});

search.on('algolia_child_added', function (record){
  console.log('Record synced', record);
});

search.on('algolia_child_changed', function (record){
  console.log('Record synced', record);
});

search.on('algolia_child_removed', function (record){
  console.log('Record synced', record);
});
```
