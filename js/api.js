/**
 * @file api.js
 * @description Contains all functions for interacting with the Firestore database.
 * This centralizes data access logic, making it easier to manage and debug.
 */

import { db } from './firebase.js';
import { showToast } from './ui.js';
import { doc, setDoc, getDoc, deleteDoc, collection, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

/**
 * Saves or merges data to a specific Firestore document.
 * @param {string} fullPath The full path to the document (e.g., 'sites/site-id').
 * @param {object} data The data to save.
 * @param {boolean} merge Whether to merge the data with existing data.
 */
export async function saveDataToFirestore(fullPath, data, merge = true) {
    try {
        const docRef = doc(db, fullPath);
        await setDoc(docRef, data, { merge });
    } catch (e) {
        console.error(`Error saving to Firestore path "${fullPath}":`, e);
        showToast("Error saving data to the cloud.", "error");
        throw e; // Re-throw the error to be handled by the caller
    }
}

/**
 * Loads data from a specific Firestore document.
 * @param {string} fullPath The full path to the document.
 * @returns {Promise<object|null>} The document data or null if it doesn't exist.
 */
export async function loadDataFromFirestore(fullPath) {
    try {
        const docRef = doc(db, fullPath);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data();
        }
        return null;
    } catch (e) {
        console.error(`Error loading from Firestore path "${fullPath}":`, e);
        showToast("Error loading data from the cloud.", "error");
        return null;
    }
}

/**
 * Loads all documents from a collection and returns them as a key-value map.
 * @param {string} collectionPath The path to the collection.
 * @returns {Promise<object>} A map where keys are document IDs and values are document data.
 */
export async function loadCollectionAsMap(collectionPath) {
    const map = {};
    try {
        const collectionRef = collection(db, collectionPath);
        const snapshot = await getDocs(collectionRef);
        snapshot.forEach(doc => {
            map[doc.id] = doc.data();
        });
        return map;
    } catch (e) {
        console.error(`Error loading collection from Firestore path "${collectionPath}":`, e);
        showToast("Error loading collection data from the cloud.", "error");
        return map;
    }
}


/**
 * Deletes a Firestore document.
 * @param {string} fullPath The full path to the document to delete.
 */
export async function deleteDocument(fullPath) {
    try {
        const docRef = doc(db, fullPath);
        await deleteDoc(docRef);
    } catch (e) {
        console.error(`Error deleting document at path "${fullPath}":`, e);
        showToast("Error deleting data from the cloud.", "error");
    }
}

/**
 * Deletes all documents within a specified collection using batch writes.
 * @param {string} collectionPath The path to the collection.
 */
export async function clearCollection(collectionPath) {
    try {
        const collectionRef = collection(db, collectionPath);
        const snapshot = await getDocs(collectionRef);
        if (snapshot.empty) {
            return; // Nothing to delete
        }
        
        // Firestore allows a maximum of 500 operations in a single batch.
        const batchSize = 500;
        let i = 0;
        let batch = writeBatch(db);
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
            i++;
            if (i % batchSize === 0) {
                batch.commit();
                batch = writeBatch(db); // start a new batch
            }
        });

        // Commit the final batch if it has any operations
        if (i % batchSize !== 0) {
            await batch.commit();
        }
    } catch (e) {
        console.error(`Error clearing collection at path "${collectionPath}":`, e);
        showToast("Error clearing collection data from the cloud.", "error");
    }
}

/**
 * Saves a map of data to a collection, where each key-value pair becomes a document.
 * @param {string} collectionPath The path to the collection.
 * @param {object} dataMap The map of data to save.
 */
export async function batchSaveToCollection(collectionPath, dataMap) {
    try {
        const batchSize = 500;
        const entries = Object.entries(dataMap);
        let i = 0;
        let batch = writeBatch(db);

        for (const [key, value] of entries) {
            const docRef = doc(db, collectionPath, key);
            batch.set(docRef, value);
            i++;
            if (i % batchSize === 0) {
                await batch.commit();
                batch = writeBatch(db);
            }
        }
        
        if (i % batchSize !== 0) {
            await batch.commit();
        }
    } catch (e) {
        console.error(`Error batch saving to collection "${collectionPath}":`, e);
        showToast("Error saving bulk data to the cloud.", "error");
        throw e;
    }
}
