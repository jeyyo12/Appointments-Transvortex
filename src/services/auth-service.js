/**
 * Authentication Service
 * 
 * Handles Firebase authentication, user management, and admin access control.
 */

import { ADMIN_UIDS } from '../config/firebase.config.js';
import { appState } from '../core/app-state.js';
import { eventBus, EVENT_TYPES } from '../core/event-bus.js';

/**
 * AuthService - Manages authentication and authorization
 */
export class AuthService {
  constructor(auth) {
    this.auth = auth;
  }

  /**
   * Initialize authentication state listener
   * @returns {Function} Unsubscribe function
   */
  initializeAuthListener() {
    return import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js')
      .then(({ onAuthStateChanged }) => {
        return onAuthStateChanged(this.auth, (user) => {
          this._handleAuthStateChange(user);
        });
      });
  }

  /**
   * Handle authentication state changes
   * @private
   * @param {Object} user - Firebase user object
   */
  _handleAuthStateChange(user) {
    if (user) {
      const isAdmin = ADMIN_UIDS.includes(user.uid);
      
      appState.batchUpdate({
        'auth.currentUser': user,
        'auth.isAdmin': isAdmin,
        'auth.isInitialized': true
      });

      console.log('✅ User authenticated:', {
        uid: user.uid,
        email: user.email,
        isAdmin
      });

      eventBus.emit(EVENT_TYPES.AUTH_STATE_CHANGED, { user, isAdmin });
    } else {
      appState.batchUpdate({
        'auth.currentUser': null,
        'auth.isAdmin': false,
        'auth.isInitialized': true
      });

      console.log('ℹ️ User signed out');
      
      eventBus.emit(EVENT_TYPES.AUTH_STATE_CHANGED, { user: null, isAdmin: false });
    }
    
    this._updateAuthUI();
  }

  /**
   * Sign in with Google
   * @returns {Promise<Object>} User credential
   */
  async signInWithGoogle() {
    const { signInWithPopup, GoogleAuthProvider } = await import(
      'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'
    );
    
    const provider = new GoogleAuthProvider();
    
    try {
      const result = await signInWithPopup(this.auth, provider);
      console.log('✅ Google sign-in successful:', result.user.email);
      return result;
    } catch (error) {
      console.error('❌ Google sign-in error:', error);
      throw error;
    }
  }

  /**
   * Sign out current user
   * @returns {Promise<void>}
   */
  async signOut() {
    const { signOut } = await import(
      'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'
    );
    
    try {
      await signOut(this.auth);
      console.log('✅ Sign-out successful');
    } catch (error) {
      console.error('❌ Sign-out error:', error);
      throw error;
    }
  }

  /**
   * Toggle authentication (sign in/out)
   * @returns {Promise<void>}
   */
  async toggleAuth() {
    const currentUser = appState.getState('auth.currentUser');
    
    if (currentUser) {
      await this.signOut();
    } else {
      await this.signInWithGoogle();
    }
  }

  /**
   * Check if current user is admin
   * @returns {boolean} True if admin
   */
  isAdmin() {
    return appState.getState('auth.isAdmin');
  }

  /**
   * Get current user
   * @returns {Object|null} Current user or null
   */
  getCurrentUser() {
    return appState.getState('auth.currentUser');
  }

  /**
   * Update authentication UI
   * @private
   */
  _updateAuthUI() {
    const currentUser = appState.getState('auth.currentUser');
    const isAdmin = appState.getState('auth.isAdmin');
    
    const authBtn = document.getElementById('authBtn');
    const authStatusText = document.getElementById('authStatusText');
    const adminIcon = document.getElementById('adminIcon');
    
    if (!authBtn) return;

    if (currentUser) {
      authBtn.textContent = 'Sign Out';
      authBtn.classList.remove('tvBtn--primary');
      authBtn.classList.add('tvBtn--secondary');
      
      if (authStatusText) {
        authStatusText.textContent = currentUser.email || 'User';
        authStatusText.style.display = 'inline';
      }
      
      if (adminIcon && isAdmin) {
        adminIcon.style.display = 'inline';
      } else if (adminIcon) {
        adminIcon.style.display = 'none';
      }
      
      // Show admin-only elements
      document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = isAdmin ? '' : 'none';
      });
    } else {
      authBtn.textContent = 'Sign In';
      authBtn.classList.remove('tvBtn--secondary');
      authBtn.classList.add('tvBtn--primary');
      
      if (authStatusText) {
        authStatusText.style.display = 'none';
      }
      
      if (adminIcon) {
        adminIcon.style.display = 'none';
      }
      
      // Hide admin-only elements
      document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = 'none';
      });
    }
  }

  /**
   * Check if user has permission for an action
   * @param {string} action - Action to check
   * @returns {boolean} True if permitted
   */
  hasPermission(action) {
    const isAdmin = this.isAdmin();
    const currentUser = this.getCurrentUser();
    
    // Define permission rules
    const permissionRules = {
      'create:appointment': () => !!currentUser,
      'edit:appointment': () => isAdmin,
      'delete:appointment': () => isAdmin,
      'finalize:appointment': () => !!currentUser,
      'create:page': () => isAdmin,
      'edit:page': () => isAdmin,
      'delete:page': () => isAdmin,
      'view:admin': () => isAdmin
    };
    
    const rule = permissionRules[action];
    return rule ? rule() : false;
  }
}
