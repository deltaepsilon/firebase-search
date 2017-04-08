const admin = require('firebase-admin');
const env = require('./services/environment');
var credential = admin.credential.cert(env.firebaseConfig.serviceAccount);

admin.initializeApp({
  databaseURL: env.firebaseConfig.databaseURL,
  credential
});
const ref = admin.database().ref('firebase-search/test/algolia');
const FirebaseSearch = require('./firebase-search');

describe('Firebase Search', () => {
  let search;
  beforeEach(() => {
    search = new FirebaseSearch(ref, env);
  });

  beforeEach(done =>
    clean().then(() => {
      search.algolia.search('test').then(res => {
        expect(res.nbHits).toEqual(0);
        done();
      });
    }));

  afterAll(done => clean().then(done));

  function clean() {
    return ref.remove().then(() => search.algolia.clearIndex(true));
  }

  describe('Algolia', () => {
    afterEach(done => {
      search.removeAllListeners();
      search.algolia.firebase.stop();
      done();
    });

    it(
      'should build',
      done => {
        const fakeEntries = createFakeEntries(10);
        const updates = getUpdates(fakeEntries);

        ref
          .update(updates)
          .then(() => search.algolia.firebase.build())
          .then(() => search.algolia.search('test'))
          .then(res => {
            expect(res.nbHits).toEqual(10);
            done();
          })
          .catch(done);
      },
      60000
    );

    it(
      'should sync',
      done => {
        const fakeEntries = createFakeEntries(10);
        const initialEntries = fakeEntries.slice(0, 4);
        const secondaryEntries = fakeEntries.slice(5);
        const initialUpdates = getUpdates(initialEntries);
        const secondaryUpdates = getUpdates(secondaryEntries);

        let counter = 0;
        let recordsAdded = [];
        search.on('algolia_child_added', function handleAlgoliaChildAdded(record) {
          counter++;
          recordsAdded.push(record.postId);
          if (counter == 5) {
            expect(recordsAdded.sort().join()).toEqual('test-0,test-1,test-2,test-3,test-4');
            done();
          }
        });

        ref.update(initialUpdates).then(() => search.algolia.firebase.start()).then(() => ref.update(secondaryUpdates));
      },
      60000
    );

    function getUpdates(entries) {
      return entries.reduce(
        (updates, entry) => {
          updates[entry.postId] = entry;
          return updates;
        },
        {}
      );
    }

    function createFakeEntries(n = 5) {
      var i = n;
      var fakeEntries = [];
      while (i--) {
        fakeEntries.push({
          postId: `test-${i}`,
          userComment: `#fake #${i}`,
          userCommentParts: ['#fake', `#${i}`]
        });
      }
      return fakeEntries;
    }
  });
});
