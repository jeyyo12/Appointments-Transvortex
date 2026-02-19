import { firebaseConfig, validateFirebaseConfig } from './firebase.config.js';
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

let app = null;
let auth = null;
let db = null;
let storage = null;

export function initFirebase() {
  validateFirebaseConfig();

  if (typeof window !== 'undefined' && window.__tvFirebase?.app && window.__tvFirebase?.db) {
    app = window.__tvFirebase.app;
    auth = window.__tvFirebase.auth;
    db = window.__tvFirebase.db;
    storage = window.__tvFirebase.storage;
    return { app, auth, db, storage };
  }

  if (!app) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    
    // ✅ FIX: Configure Firestore with explicit settings for better compatibility
    // Especially important for GitHub Pages and multi-tab scenarios
    db = initializeFirestoreWithFallback(app);
    storage = getStorage(app);

    if (typeof window !== 'undefined') {
      window.__tvFirebase = { app, auth, db, storage };
    }
  }

  return { app, auth, db, storage };
}

/**
 * Initialize Firestore with intelligent cache handling
 * Falls back gracefully from persistent to memory cache on errors
 */
function initializeFirestoreWithFallback(app) {
  try {
    const existingDb = getFirestore(app);
    if (existingDb) {
      return existingDb;
    }
  } catch (_err) {
    // Firestore not initialized yet for this app - continue with configured init.
  }

  // Strategy 1: Try persistent cache with multi-tab support
  try {
    console.log('🔄 Attempting Firestore with persistent multi-tab cache...');
    const db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
        cacheSizeBytes: 40 * 1024 * 1024  // 40MB cache
      }),
      ignoreUndefinedProperties: true,
      experimentalAutoDetectLongPolling: true,
      useFetchStreams: false
    });
    console.log('✅ Firestore initialized with persistent multi-tab cache');
    return db;
  } catch (persistentError) {
    console.warn('⚠️ Persistent cache failed:', persistentError.message || persistentError.code);
    
    // Strategy 2: Fall back to memory cache (safe for all scenarios including multi-tab)
    try {
      console.log('🔄 Falling back to memory cache...');
      const db = initializeFirestore(app, {
        localCache: memoryLocalCache(),
        ignoreUndefinedProperties: true,
        experimentalAutoDetectLongPolling: true,
        useFetchStreams: false
      });
      console.log('✅ Firestore initialized with memory cache (multi-tab safe)');
      return db;
    } catch (memoryError) {
      // Strategy 3: Minimal initialization as last resort
      console.warn('⚠️ Memory cache failed, using minimal config:', memoryError.message || memoryError.code);
      try {
        const db = initializeFirestore(app, {
          ignoreUndefinedProperties: true,
          experimentalAutoDetectLongPolling: true,
          useFetchStreams: false
        });
        console.log('✅ Firestore initialized with minimal config');
        return db;
      } catch (fallbackError) {
        console.error('❌ Firestore initialization failed:', fallbackError);
        throw fallbackError;
      }
    }
  }
}

export function getFirebase() {
  if (!app) {
    return initFirebase();
  }
  return { app, auth, db, storage };
}

export { app, auth, db, storage };

// ==========================================
// DIAGNOSTIC LOGGING
// ==========================================
export function logFirebaseStatus() {
  if (app) {
    console.log("✅ Firebase initialized");
    console.log("🔧 Project ID:", app.options.projectId);
    console.log("🔧 Auth Domain:", app.options.authDomain);
    console.log("🔧 Database URL:", app.options.databaseURL || "N/A");
  } else {
    console.error("❌ Firebase NOT initialized");
  }
}
