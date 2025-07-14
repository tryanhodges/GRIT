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
 */
export async function saveDataToFirestore(fullPath, data) {
    try {
        const docRef = doc(db, fullPath);
        await setDoc(docRef, data, { merge: true });
    } catch (e) {
        console.error(`Error saving to Firestore path "${fullPath}":`, e);
        showToast("Error saving data to the cloud.", "error");
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
 * Deletes all documents within a specified collection.
 * @param {string} collectionPath The path to the collection.
 */
export async function clearCollection(collectionPath) {
    const collectionRef = collection(db, collectionPath);
    const snapshot = await getDocs(collectionRef);
    if (snapshot.empty) {
        return; // Nothing to delete
    }
    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });
    await batch.commit();
}
