/**
 * Main Application Entrypoint
 * Initializes Firebase, auth state, and feature modules
 */

import { initFirebase, setupAuthListener } from './firebase/firebase.js';
import { createLogger, setLogLevel } from './shared/logger.js';
import { setState, getState } from './shared/state.js';
import { byId } from './shared/dom.js';

// Feature modules
import { initInvoicesStorage } from './storage/storage.page.js';
import { initAllChipsModes } from './core/chips-mode.js';
import { initializeVehicleFormatting } from './utils/input-formatters.js';

const logger = createLogger('App');

function safeGetLocalStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function isTvxDebugEnabled() {
  if (typeof window === 'undefined') return false;
  const storageDebug = safeGetLocalStorage('tvxDebug') === '1';
  return storageDebug || window.__tvDebug === true;
}

function configureStartupLogLevel() {
  if (typeof window === 'undefined') return;

  const host = String(window.location?.hostname || '').toLowerCase();
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  let resolvedLevel = isLocal ? 'INFO' : 'WARN';
  const override = String(safeGetLocalStorage('tvx.logLevel') || '').trim().toUpperCase();
  if (['ERROR', 'WARN', 'INFO', 'DEBUG'].includes(override)) {
    resolvedLevel = override;
  }

  setLogLevel(resolvedLevel);
}

/*
Dev/runtime toggles:
- localStorage.tvx.logLevel = ERROR|WARN|INFO|DEBUG
- localStorage.tvxDebug = 1 (or window.__tvDebug = true)
*/

configureStartupLogLevel();

function getInitState() {
  if (typeof window === 'undefined') return {};
  window.__tvInit = window.__tvInit || {};
  return window.__tvInit;
}

/**
 * Initialize application
 */
async function initApp() {
  if (typeof window !== 'undefined' && window.__TVX_APP_STARTED === true) {
    logger.debug('Skipping app init: __TVX_APP_STARTED guard is active');
    return;
  }
  if (typeof window !== 'undefined') {
    window.__TVX_APP_STARTED = true;
  }

  const initState = getInitState();
  if (initState.appInitDone || initState.appInitRunning) {
    logger.debug('Skipping app init: already initialized or in progress');
    return;
  }
  initState.appInitRunning = true;

  logger.debug('🚀 Initializing Transvortex application...');
  
  try {
    // 1. Initialize Firebase
    logger.debug('Step 1: Initialize Firebase');
    initFirebase();
    
    // 2. Setup auth state listener
    logger.debug('Step 2: Setup auth listener');
    setupAuthListener(onAuthStateChanged);

    // 3. Setup tab navigation
    logger.debug('Step 3: Setup tab navigation');
    setupTabNavigation();

    // 4. Initialize Chips Mode for Jobs & Parts
    logger.debug('Step 4: Initialize Chips Mode');
    initAllChipsModes();

    // 5. Initialize Vehicle Section Formatting
    logger.debug('Step 5: Initialize Vehicle Section formatting');
    initializeVehicleFormatting();

    // 6. Initialize feature modules
    logger.debug('Step 6: Initialize feature modules');
    if (typeof window !== 'undefined') {
      window.__USE_MODULAR_STORAGE__ = true;
    }
    initInvoicesStorage();
    // Note: Invoice creation from appointments is handled via appointment detail actions

    // 7. Restore last active tab
    logger.debug('Step 7: Restore active tab');
    restoreActiveTab();
    
    logger.debug('✅ Application initialized successfully');
    initState.appInitDone = true;

    if (!initState.initProofLogged) {
      initState.initProofLogged = true;
      if (isTvxDebugEnabled()) {
        console.log('[INIT ONCE]', {
          appInitDone: true,
          scriptBootstrapDone: !!initState.scriptBootstrapDone,
          storageInitDone: !!initState.storageInitDone,
          workspacePanelInitialized: !!initState.workspacePanelInitialized
        });
      }
    }
    
  } catch (error) {
    logger.error('❌ Failed to initialize application:', error);
    alert('Failed to initialize application. Please refresh the page.');
  } finally {
    initState.appInitRunning = false;
  }
}

/**
 * Handle auth state changes
 * @param {Object} user - Firebase user object
 * @param {boolean} isAdmin - Whether user is admin
 */
function onAuthStateChanged(user, isAdmin) {
  setState('currentUser', user);
  setState('isAdmin', isAdmin);
  
  updateAuthUI(user, isAdmin);
  
  // Note: Appointments listener and other features are still in script.js
  // This will be migrated in future iterations
}

/**
 * Update auth-related UI
 * @param {Object} user - Firebase user
 * @param {boolean} isAdmin - Is admin user
 */
function updateAuthUI(user, isAdmin) {
  const authButton = byId('authButton');
  const userName = byId('userName');
  const userEmail = byId('userEmail');
  const adminBadge = byId('adminBadge');
  
  if (!authButton) return;
  
  if (user) {
    authButton.textContent = 'Sign Out';
    authButton.onclick = handleSignOut;
    
    if (userName) userName.textContent = user.displayName || 'User';
    if (userEmail) userEmail.textContent = user.email || '';
    if (adminBadge) adminBadge.style.display = isAdmin ? 'inline-block' : 'none';
  } else {
    authButton.textContent = 'Sign In';
    authButton.onclick = handleSignIn;
    
    if (userName) userName.textContent = 'Guest';
    if (userEmail) userEmail.textContent = '';
    if (adminBadge) adminBadge.style.display = 'none';
  }
}

/**
 * Handle sign in
 */
async function handleSignIn() {
  // Import auth functions dynamically
  const { getAuth, GoogleAuthProvider, signInWithPopup } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
  
  try {
    const auth = getAuth();
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    logger.info('✅ User signed in');
  } catch (error) {
    logger.error('Sign in error:', error);
    alert('Sign in failed: ' + error.message);
  }
}

/**
 * Handle sign out
 */
async function handleSignOut() {
  const { getAuth, signOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
  
  try {
    const auth = getAuth();
    await signOut(auth);
    logger.info('✅ User signed out');
  } catch (error) {
    logger.error('Sign out error:', error);
    alert('Sign out failed: ' + error.message);
  }
}

/**
 * Setup tab navigation
 */
function setupTabNavigation() {
  const tabButtons = document.querySelectorAll('[data-tab]');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;
      switchTab(tabName);
    });
  });
  
  logger.debug('Tab navigation setup complete');
}

/**
 * Switch to a tab
 * @param {string} tabName - Tab name
 */
function switchTab(tabName) {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.add('hidden');
  });
  
  // Remove active class from all buttons
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show selected tab content
  const tabContent = document.getElementById(`${tabName}Tab`);
  if (tabContent) {
    tabContent.classList.remove('hidden');
  }
  
  // Activate selected button
  const activeButton = document.querySelector(`[data-tab="${tabName}"]`);
  if (activeButton) {
    activeButton.classList.add('active');
  }
  
  // Update state
  setState('currentTab', tabName);
  localStorage.setItem('tvx.activeTab', tabName);
  
  logger.debug('Switched to tab:', tabName);
}

/**
 * Restore last active tab from localStorage
 */
function restoreActiveTab() {
  const lastTab = localStorage.getItem('tvx.activeTab') || 'pages';
  switchTab(lastTab);
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Expose functions to global scope for inline handlers
window.handleSignIn = handleSignIn;
window.handleSignOut = handleSignOut;
window.switchTab = switchTab;
