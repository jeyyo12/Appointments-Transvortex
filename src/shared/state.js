/**
 * Global State Management
 * Centralized state for current user, appointments, invoices, etc.
 */

const state = {
  // Auth state
  currentUser: null,
  isAdmin: false,
  
  // App state
  currentTab: 'pages',
  activeAppointmentsTab: 'scheduled', // 'scheduled' | 'history'
  
  // Data cache
  appointments: [],
  filteredAppointments: [],
  allInvoices: [],
  filteredInvoices: [],
  activePaymentFilter: 'all', // 'all' | 'paid' | 'unpaid'
  storageInvoicesLoaded: false,
  
  // Listeners (unsubscribe functions)
  appointmentsUnsubscribe: null,
  invoicesUnsubscribe: null,
  
  // Feature flags
  debugMode: false,
  writeTraceEnabled: true
};

/**
 * Get state value
 * @param {string} key - State key
 * @returns {any} State value
 */
export function getState(key) {
  return state[key];
}

/**
 * Set state value
 * @param {string} key - State key
 * @param {any} value - New value
 */
export function setState(key, value) {
  state[key] = value;
}

/**
 * Update multiple state values
 * @param {Object} updates - Key-value pairs to update
 */
export function updateState(updates) {
  Object.assign(state, updates);
}

/**
 * Get all state
 * @returns {Object} Complete state object
 */
export function getAllState() {
  return { ...state };
}

/**
 * Reset state (useful for testing)
 */
export function resetState() {
  state.currentUser = null;
  state.isAdmin = false;
  state.appointments = [];
  state.filteredAppointments = [];
  state.allInvoices = [];
  state.filteredInvoices = [];
  state.activePaymentFilter = 'all';
  state.storageInvoicesLoaded = false;
  state.appointmentsUnsubscribe = null;
  state.invoicesUnsubscribe = null;
}

/**
 * Persist active tab to localStorage
 * @param {string} tab - Tab name
 */
export function setActiveTab(tab) {
  state.currentTab = tab;
  localStorage.setItem('tvx.activeTab', tab);
}

/**
 * Get active tab from localStorage
 * @returns {string} Tab name
 */
export function getActiveTab() {
  return localStorage.getItem('tvx.activeTab') || state.currentTab;
}

/**
 * Persist appointments tab to localStorage
 * @param {string} tab - 'scheduled' | 'history'
 */
export function setAppointmentsTab(tab) {
  state.activeAppointmentsTab = tab;
  localStorage.setItem('tvx.activeAppointmentsTab', tab);
}

/**
 * Get appointments tab from localStorage
 * @returns {string} 'scheduled' | 'history'
 */
export function getAppointmentsTab() {
  return localStorage.getItem('tvx.activeAppointmentsTab') || state.activeAppointmentsTab;
}

// Export state for debugging
if (typeof window !== 'undefined') {
  window.getAppState = getAllState;
}
