/**
 * Firebase Initialization Module
 * Exports: app, auth, db, storage, and currentUser state
 */

import { firebaseConfig, ADMIN_UIDS, validateFirebaseConfig } from './firebase-config.js';
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

let app = null;
let auth = null;
let db = null;
let storage = null;
let currentUser = null;
let isAdmin = false;

/**
 * Initialize Firestore with intelligent cache handling
 * Falls back gracefully from persistent to memory cache on errors
 */
function initializeFirestoreWithFallback(firebaseApp) {
  // Strategy 1: Try persistent cache with multi-tab support
  try {
    console.log('🔄 Attempting Firestore with persistent multi-tab cache...');
    const firestoreDb = initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
        cacheSizeBytes: 40 * 1024 * 1024  // 40MB cache
      }),
      ignoreUndefinedProperties: true
    });
    console.log('✅ Firestore initialized with persistent multi-tab cache');
    return firestoreDb;
  } catch (persistentError) {
    console.warn('⚠️ Persistent cache failed:', persistentError.message || persistentError.code);
    
    // Strategy 2: Fall back to memory cache (safe for all scenarios including multi-tab)
    try {
      console.log('🔄 Falling back to memory cache...');
      const firestoreDb = initializeFirestore(firebaseApp, {
        localCache: memoryLocalCache(),
        ignoreUndefinedProperties: true
      });
      console.log('✅ Firestore initialized with memory cache (multi-tab safe)');
      return firestoreDb;
    } catch (memoryError) {
      // Strategy 3: Minimal initialization as last resort
      console.warn('⚠️ Memory cache failed, using minimal config:', memoryError.message || memoryError.code);
      const firestoreDb = initializeFirestore(firebaseApp, {
        ignoreUndefinedProperties: true
      });
      console.log('✅ Firestore initialized with minimal config');
      return firestoreDb;
    }
  }
}

/**
 * Initialize Firebase (call once on app startup)
 */
export function initFirebase() {
  validateFirebaseConfig();

  if (!app) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = initializeFirestoreWithFallback(app);
    storage = getStorage(app);
    
    console.log("✅ Firebase initialized");
    console.log("🔧 Project ID:", app.options.projectId);
  }

  return { app, auth, db, storage };
}

/**
 * Setup auth state listener
 * @param {Function} callback - Called with (user, isAdmin) when auth state changes
 */
export function setupAuthListener(callback) {
  if (!auth) {
    console.error('❌ Auth not initialized. Call initFirebase() first');
    return null;
  }
  
  return onAuthStateChanged(auth, (user) => {
    currentUser = user;
    isAdmin = user ? ADMIN_UIDS.includes(user.uid) : false;
    
    if (user) {
      console.log('👤 User authenticated:', user.email, '| Admin:', isAdmin);
    } else {
      console.log('👤 User signed out');
    }
    
    if (callback) {
      callback(user, isAdmin);
    }
  });
}

/**
 * Get current user
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * Check if current user is admin
 */
export function checkIsAdmin() {
  return isAdmin;
}

/**
 * Get Firebase instances
 */
export function getFirebase() {
  if (!app) {
    return initFirebase();
  }
  return { app, auth, db, storage };
}

// Export instances directly
export { app, auth, db, storage, currentUser, isAdmin, ADMIN_UIDS };
