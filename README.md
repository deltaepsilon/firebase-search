# Configuration

- Create a Firebase project
- Configure a billing account for the Google Cloud project associated with this new Firebase project. You may need to upgrade your Firebase from Spark (free) to Blaze (pay as you go).
- Go to your project's Google Cloud Console's [API Manager](https://console.cloud.google.com/apis/credentials) and create a service account JSON file
  1. Click ***Create credentials***
  2. Select ***Service account key***
  3. Create new service account, give it a name and select JSON
  4. Download and save this key securely on your local machine
- Create ```/env.json``` using ```/env.json.dist``` as a template. Make sure to reference the service account JSON file that you created in the last step.
- Launch an Elasticsearch cluster
  1. Find Google's [Elasticsearch project on Cloud Launcher](https://console.cloud.google.com/launcher/details/click-to-deploy-images/elasticsearch?q=elasticsearch&project=firebase-search)
  2. Launch a new cluster
  4. Fill in your cluster details in ```env.json```, following the pattern found in ```./env.json.dist``` under the ***elasticsearch*** node. You may need to go to Google Cloud's **Compute Engine** page to find the external IP address for your cluster. We'll use the cluster's external IP exclusively. 
  5. Install [gcloud](https://cloud.google.com/sdk/) if you don't have it.
  6. Run ```gcloud --version``` and update if prompted
  6. Run ```npm tunnel``` to read out a shell command that you can use to launch a local tunnel on port 9200 to your Elasticsearch cluster. This tunnel is required for testing and development, but not for production.
  7. Visit [http://localhost:9200](http://localhost:9200) in your browser. You should see some JSON read out from Elasticsearch if your cluster is running and your tunnel is also live.
- Run ```npm install && npm test``` to ensure that everything is configured correctly. This command will test the indexing against the databaseURL that you referenced in ```env.json```. It will create some dummy data under ```/firebase-search/test/users```. It doesn't hurt to leave the dummy data, but it doesn't delete it automatically in case you want to run the tests again later. There's no need to attack the SWAPI servers that supply dummy data.   