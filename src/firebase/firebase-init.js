import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyDKyqAb198h6VdbHXZtciMdn_KIg-L2zZU",
  authDomain: "transvortexltdcouk.firebaseapp.com",
  projectId: "transvortexltdcouk",
  storageBucket: "transvortexltdcouk.firebasestorage.app",
  messagingSenderId: "980773899679",
  appId: "1:980773899679:web:1d741dd11f75cd238581aa",
  measurementId: "G-RL8PTZS34D"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
