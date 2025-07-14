/**
 * @file auth.js
 * @description Handles all user authentication logic, including sign-in, sign-up,
 * sign-out, and the central onAuthStateChanged listener.
 */

import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { serverTimestamp, limit, query, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { auth, db } from './firebase.js';
import { appState } from './state.js';
import { loadDataFromFirestore, saveDataToFirestore } from './api.js';
import { showToast, setLoading, adjustUiForRole } from './ui.js';
import { getEl } from './utils.js';

/**
 * Shows an authentication-related error message in the UI.
 * @param {string} message The error message to display.
 */
function showAuthError(message) {
    const errorDiv = getEl('auth-error');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

/**
 * Clears any visible authentication error messages.
 */
function clearAuthError() {
    getEl('auth-error').classList.add('hidden');
}

/**
 * Handles the Google Sign-In popup flow.
 */
export async function handleGoogleSignIn() {
    clearAuthError();
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        // onAuthStateChanged will handle the rest.
    } catch (error) {
        showAuthError(error.message);
    }
}

/**
 * Handles new user sign-up with email and password.
 */
export async function handleSignUp() {
    clearAuthError();
    const email = getEl('email').value;
    const password = getEl('password').value;

    if (!email || !password) {
        showAuthError("Please enter both email and password.");
        return;
    }

    setLoading(true, "Creating account...");
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will handle creating the user profile.
    } catch (error) {
        showAuthError(error.message);
    } finally {
        setLoading(false);
    }
}

/**
 * Handles user sign-in with email and password.
 */
export async function handleSignIn() {
    clearAuthError();
    const email = getEl('email').value;
    const password = getEl('password').value;

    if (!email || !password) {
        showAuthError("Please enter both email and password.");
        return;
    }
    
    setLoading(true, "Logging in...");
    try {
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will handle the rest.
    } catch (error) {
        showAuthError(error.message);
    } finally {
        setLoading(false);
    }
}

/**
 * Handles user sign-out.
 */
export function handleSignOut() {
    signOut(auth);
}

/**
 * Initializes the central authentication listener. This function is called once
 * when the application starts.
 */
export function initializeAuthListener() {
    const authContainer = getEl('auth-container');
    const appContainer = getEl('app-container');
    const userInfoDiv = getEl('user-info');
    const userEmailSpan = getEl('user-email');

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            setLoading(true, 'Verifying user...');
            const userProfile = await loadDataFromFirestore(`users/${user.uid}`);
            
            if (!userProfile) {
                // This is a new user, create their profile.
                const usersQuery = query(collection(db, "users"), limit(1));
                const usersCollection = await getDocs(usersQuery);
                const role = usersCollection.empty ? 'manager' : 'salesfloor';
                
                const newUserProfile = {
                    email: user.email,
                    role: role,
                    status: 'pending',
                    requestTimestamp: serverTimestamp(),
                    approvedBy: null,
                    approvalTimestamp: null,
                    homeSiteId: null
                };
                await saveDataToFirestore(`users/${user.uid}`, newUserProfile);
                showToast(`Account created! A manager must approve your account before you can log in.`, 'success');
                signOut(auth); // Sign out immediately, user is pending.
                return;
            }
            
            if (userProfile.status === 'pending') {
                showToast('Your account is awaiting approval from a manager.', 'info');
                signOut(auth);
                return;
            }
            if (userProfile.status === 'denied') {
                showToast('Your account request has been denied.', 'error');
                signOut(auth);
                return;
            }

            // User is approved, set up the app state and UI.
            appState.currentUser.uid = user.uid;
            appState.currentUser.email = user.email;
            appState.currentUser.role = userProfile.role;
            appState.currentUser.homeSiteId = userProfile.homeSiteId || null;

            if(userEmailSpan) userEmailSpan.textContent = user.email;
            userInfoDiv.classList.remove('hidden');
            
            authContainer.classList.add('hidden');
            appContainer.classList.remove('hidden');
            
            adjustUiForRole(appState.currentUser.role);
            
            // Dispatch event instead of calling main.js function directly.
            document.dispatchEvent(new CustomEvent('user-authenticated'));

        } else {
            // User is signed out.
            appState.currentUser = { uid: null, email: null, role: null, homeSiteId: null };
            authContainer.classList.remove('hidden');
            appContainer.classList.add('hidden');
            userInfoDiv.classList.add('hidden');
            setLoading(false);
        }
    });
}
