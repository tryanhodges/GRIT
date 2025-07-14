// netlify/functions/delete-site.js

/**
 * This serverless function handles the complete and secure deletion of a Firestore site document
 * and all of its nested subcollections.
 *
 * It performs the following actions:
 * 1. Initializes the Firebase Admin SDK.
 * 2. Verifies the calling user's Firebase Auth token to ensure they are authenticated.
 * 3. Checks if the authenticated user has the 'manager' role in Firestore.
 * 4. Takes a 'siteId' from the request body.
 * 5. Recursively deletes all documents within the site's subcollections (slotting, configs, purchaseOrders).
 * 6. Deletes the main site document itself.
 * 7. Returns a success or error message to the client.
 *
 * This server-side approach is necessary because client-side SDKs cannot delete subcollections directly,
 * which would otherwise lead to orphaned data.
 */
const admin = require('firebase-admin');
const cors = require('cors');

// Initialize the cors middleware to allow requests from any origin.
const corsHandler = cors({ origin: true });

// --- START: Firebase Admin SDK Initialization ---
// This check prevents re-initialization on "hot-reloads" of the function.
if (!admin.apps.length) {
  try {
    // The service account credentials should be stored as a secure Netlify environment variable.
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      throw new Error("FATAL_ERROR: GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable not set.");
    }
    const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (e) {
    console.error("FATAL_ERROR: Firebase Admin SDK initialization failed.", e);
  }
}
// --- END: Firebase Admin SDK Initialization ---

/**
 * Deletes all documents in a specified collection in batches.
 * @param {admin.firestore.Firestore} db The Firestore database instance.
 * @param {string} collectionPath The path to the collection to delete.
 * @param {number} batchSize The number of documents to delete in each batch.
 * @returns {Promise<void>}
 */
async function deleteCollection(db, collectionPath, batchSize) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, resolve).catch(reject);
  });
}

/**
 * Recursively deletes documents from a query batch.
 * @param {admin.firestore.Firestore} db The Firestore database instance.
 * @param {admin.firestore.Query} query The query for the documents to delete.
 * @param {Function} resolve The promise resolve function.
 */
async function deleteQueryBatch(db, query, resolve) {
  const snapshot = await query.get();

  if (snapshot.size === 0) {
    return resolve();
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  process.nextTick(() => {
    deleteQueryBatch(db, query, resolve);
  });
}


/**
 * The main handler for the Netlify serverless function.
 */
exports.handler = async (event, context) => {
  return new Promise((resolve) => {
    const callback = (statusCode, body) => {
      resolve({
        statusCode,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
      });
    };

    corsHandler(event, context, async () => {
      if (event.httpMethod !== 'POST') {
        return callback(405, { error: 'Method Not Allowed' });
      }

      if (!admin.apps.length) {
        console.error("CRASH_POINT: Firebase Admin not initialized.");
        return callback(500, { error: "Server configuration error." });
      }

      const db = admin.firestore();
      const token = event.headers.authorization?.split('Bearer ')[1];
      if (!token) {
        return callback(401, { error: 'Unauthorized: No token provided.' });
      }

      try {
        // 1. Authenticate and authorize the user
        const decodedToken = await admin.auth().verifyIdToken(token);
        const uid = decodedToken.uid;
        const userDoc = await db.collection('users').doc(uid).get();

        if (!userDoc.exists || userDoc.data().role !== 'manager') {
          console.error(`Permission denied for user: ${uid}`);
          return callback(403, { error: 'Permission Denied: Only managers can delete sites.' });
        }

        // 2. Get siteId from request body
        const { siteId } = JSON.parse(event.body);
        if (!siteId) {
          return callback(400, { error: 'Bad Request: siteId is required.' });
        }

        console.log(`Manager ${uid} initiated deletion for site: ${siteId}`);
        const siteRef = db.doc(`sites/${siteId}`);

        // 3. Define subcollections to be deleted
        const subcollections = ['slotting', 'configs', 'purchaseOrders'];

        // 4. Delete all documents in each subcollection
        for (const subcollection of subcollections) {
          const collectionPath = `sites/${siteId}/${subcollection}`;
          console.log(`Deleting subcollection: ${collectionPath}`);
          await deleteCollection(db, collectionPath, 100);
          console.log(`Successfully deleted subcollection: ${collectionPath}`);
        }
        
        // 5. Delete the main site document
        console.log(`Deleting main site document: sites/${siteId}`);
        await siteRef.delete();
        console.log(`Successfully deleted site: ${siteId}`);

        // 6. Return success response
        callback(200, { message: `Site ${siteId} and all its data have been deleted successfully.` });

      } catch (error) {
        console.error('Fatal error in delete-site function:', error);
        callback(500, { error: error.message || 'An internal server error occurred.' });
      }
    });
  });
};
