/**
 * Centralized Application State Management
 * 
 * Replaces 20+ global variables with a single source of truth.
 * Implements observer pattern for reactive UI updates.
 */

import { STORAGE_KEYS, APPOINTMENTS_TAB_TYPES } from '../config/constants.js';

/**
 * AppState - Singleton class managing all application state
 */
class AppState {
  constructor() {
    // Firebase instances
    this.firebase = {
      app: null,
      auth: null,
      db: null
    };

    // Current user & authentication
    this.auth = {
      currentUser: null,
      isAdmin: false,
      isInitialized: false
    };

    // Pages state
    this.pages = {
      data: [],
      loading: false,
      error: null
    };

    // Appointments state
    this.appointments = {
      data: [],
      filtered: [],
      loading: false,
      error: null,
      unsubscribe: null
    };

    // UI state
    this.ui = {
      currentTab: 'pages',
      activeAppointmentsTab: localStorage.getItem(STORAGE_KEYS.APPOINTMENTS_TAB) || APPOINTMENTS_TAB_TYPES.SCHEDULED,
      appointmentsClicksBound: false,
      selectedAppointmentId: null
    };

    // Modal state
    this.modals = {
      openModal: null,
      modalStack: [],
      detailsModalEl: null,
      detailsPopHandler: null,
      delayModalEl: null,
      delayPopHandler: null
    };

    // Services
    this.services = {
      appointmentHistory: null
    };

    // Observers for reactive updates
    this._observers = new Map();
  }

  /**
   * Get state value by path (e.g., 'appointments.data')
   * @param {string} path - Dot-notation path to state value
   * @returns {*} State value
   */
  getState(path) {
    const keys = path.split('.');
    let value = this;
    
    for (const key of keys) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[key];
    }
    
    return value;
  }

  /**
   * Set state value by path and notify observers
   * @param {string} path - Dot-notation path to state value
   * @param {*} value - New value
   * @param {boolean} notify - Whether to notify observers (default: true)
   */
  setState(path, value, notify = true) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = this;

    // Navigate to parent object
    for (const key of keys) {
      if (!target[key]) {
        target[key] = {};
      }
      target = target[key];
    }

    // Set value
    const oldValue = target[lastKey];
    target[lastKey] = value;

    // Notify observers if value changed
    if (notify && oldValue !== value) {
      this._notifyObservers(path, value, oldValue);
    }

    return this;
  }

  /**
   * Subscribe to state changes
   * @param {string} path - Dot-notation path to observe (or '*' for all changes)
   * @param {Function} callback - Called with (newValue, oldValue, path)
   * @returns {Function} Unsubscribe function
   */
  subscribe(path, callback) {
    if (!this._observers.has(path)) {
      this._observers.set(path, new Set());
    }
    
    this._observers.get(path).add(callback);

    // Return unsubscribe function
    return () => {
      const observers = this._observers.get(path);
      if (observers) {
        observers.delete(callback);
        if (observers.size === 0) {
          this._observers.delete(path);
        }
      }
    };
  }

  /**
   * Notify observers of state changes
   * @private
   */
  _notifyObservers(path, newValue, oldValue) {
    // Notify exact path observers
    const exactObservers = this._observers.get(path);
    if (exactObservers) {
      exactObservers.forEach(callback => {
        try {
          callback(newValue, oldValue, path);
        } catch (error) {
          console.error(`Observer error for path "${path}":`, error);
        }
      });
    }

    // Notify wildcard observers
    const wildcardObservers = this._observers.get('*');
    if (wildcardObservers) {
      wildcardObservers.forEach(callback => {
        try {
          callback(newValue, oldValue, path);
        } catch (error) {
          console.error(`Wildcard observer error for path "${path}":`, error);
        }
      });
    }
  }

  /**
   * Batch update multiple state values without triggering observers for each
   * @param {Object} updates - Object with path: value pairs
   */
  batchUpdate(updates) {
    Object.entries(updates).forEach(([path, value]) => {
      this.setState(path, value, false);
    });

    // Notify observers after all updates
    Object.entries(updates).forEach(([path, value]) => {
      this._notifyObservers(path, value, this.getState(path));
    });

    return this;
  }

  /**
   * Reset state to initial values
   */
  reset() {
    this.firebase = { app: null, auth: null, db: null };
    this.auth = { currentUser: null, isAdmin: false, isInitialized: false };
    this.pages = { data: [], loading: false, error: null };
    this.appointments = { data: [], filtered: [], loading: false, error: null, unsubscribe: null };
    this.ui = {
      currentTab: 'pages',
      activeAppointmentsTab: localStorage.getItem(STORAGE_KEYS.APPOINTMENTS_TAB) || APPOINTMENTS_TAB_TYPES.SCHEDULED,
      appointmentsClicksBound: false,
      selectedAppointmentId: null
    };
    this.modals = {
      openModal: null,
      modalStack: [],
      detailsModalEl: null,
      detailsPopHandler: null,
      delayModalEl: null,
      delayPopHandler: null
    };
    this.services = { appointmentHistory: null };

    this._notifyObservers('*', this, {});
  }

  /**
   * Get debug information about current state
   * @returns {Object} State summary
   */
  getDebugInfo() {
    return {
      firebase: {
        initialized: !!this.firebase.app,
        hasAuth: !!this.firebase.auth,
        hasDb: !!this.firebase.db
      },
      auth: {
        isAuthenticated: !!this.auth.currentUser,
        isAdmin: this.auth.isAdmin,
        userId: this.auth.currentUser?.uid
      },
      data: {
        pagesCount: this.pages.data.length,
        appointmentsCount: this.appointments.data.length,
        filteredAppointmentsCount: this.appointments.filtered.length
      },
      ui: {
        currentTab: this.ui.currentTab,
        activeAppointmentsTab: this.ui.activeAppointmentsTab
      },
      modals: {
        openModal: this.modals.openModal,
        stackDepth: this.modals.modalStack.length
      },
      observers: {
        pathCount: this._observers.size,
        paths: Array.from(this._observers.keys())
      }
    };
  }
}

// Export singleton instance
export const appState = new AppState();

// Export class for testing
export { AppState };
