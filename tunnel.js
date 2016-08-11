var env = require('./services/environment.js');
var spawn =  require('child_process').spawn;
var options = [
  '--ssh-flag',
  '-L9200:localhost:9200',
  '--project',
  env.elasticsearch.project,
  '--zone',
  env.elasticsearch.zone,
  env.elasticsearch.vm
];

var command = `gcloud compute ssh --ssh-flag=-L9200:localhost:9200 --project=${env.elasticsearch.project} --zone=${env.elasticsearch.zone} ${env.elasticsearch.vm}`;

console.log("Run the following command to establish a local tunnel:\n\n", command, "\n\n");

process.exit();