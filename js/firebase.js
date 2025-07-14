/**
 * @file firebase.js
 * @description Handles Firebase initialization. It centralizes the configuration
 * and exports the initialized service instances (db, auth) for use in other modules.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCb31JTu267sVk65VG--Grlp14w6cpkq2c",
  authDomain: "grit-7fb60.firebaseapp.com",
  projectId: "grit-7fb60",
  storageBucket: "grit-7fb60.firebasestorage.app",
  messagingSenderId: "278201731023",
  appId: "1:278201731023:web:b1f4c1662a427dcabcb4ba",
  measurementId: "G-LJ16FE68W4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the initialized services
export const db = getFirestore(app);
export const auth = getAuth(app);
