import { ADMIN_UIDS } from '../config/firebase.config.js';
import { initFirebase, auth } from '../config/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

let isInitialized = false;
let currentUser = null;
let isAdmin = false;
let unsubscribe = null;
const listeners = new Set();
let initPromise = null;

export function initAuthListener() {
  if (initPromise) return initPromise;

  initPromise = Promise.resolve().then(() => {
    initFirebase();

    if (!unsubscribe) {
      unsubscribe = onAuthStateChanged(auth, (user) => {
        currentUser = user || null;
        isAdmin = Boolean(user && ADMIN_UIDS.includes(user.uid));
        isInitialized = true;

        // DEBUG: Log auth state resolution
        console.log('🔐 Auth state changed:', {
          user: user ? user.email : null,
          isAdmin: isAdmin,
          timestamp: new Date().toISOString()
        });

        listeners.forEach((cb) => {
          try {
            cb(currentUser, isAdmin);
          } catch (error) {
            console.error('❌ Auth state callback error:', error);
          }
        });
      });
    }
  });

  return initPromise;
}

export function onAuthStateChange(callback) {
  listeners.add(callback);

  if (isInitialized) {
    callback(currentUser, isAdmin);
  }

  return () => listeners.delete(callback);
}

export function getAuthState() {
  return {
    user: currentUser,
    isAdmin,
    isInitialized
  };
}

export async function waitForAuthReady() {
  await initAuthListener();

  if (isInitialized) {
    return { user: currentUser, isAdmin };
  }

  return new Promise((resolve) => {
    const off = onAuthStateChange((user, adminFlag) => {
      if (isInitialized) {
        off();
        resolve({ user, isAdmin: adminFlag });
      }
    });
  });
}
