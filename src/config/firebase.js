import { firebaseConfig, validateFirebaseConfig } from './firebase.config.js';
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

let app = null;
let auth = null;
let db = null;
let storage = null;

export function initFirebase() {
  validateFirebaseConfig();

  if (!app) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
  }

  return { app, auth, db, storage };
}

export function getFirebase() {
  if (!app) {
    return initFirebase();
  }
  return { app, auth, db, storage };
}

export { app, auth, db, storage };
