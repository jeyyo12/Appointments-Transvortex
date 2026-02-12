/**
 * Application Constants
 * Centralized configuration values used throughout the application
 */

// ==========================================
// APPOINTMENT STATUS
// ==========================================
export const APPOINTMENT_STATUS = {
  SCHEDULED: 'scheduled',
  FINALIZED: 'finalized',
  DONE: 'done',
  DELAYED: 'delayed',
  CANCELLED: 'cancelled'
};

// ==========================================
// DELAY/RESCHEDULE REASONS
// ==========================================
export const DELAY_REASONS = {
  PART_MISSING: 'Part Missing',
  CUSTOMER_REQUEST: 'Customer Request',
  TECHNICIAN_UNAVAILABLE: 'Technician Unavailable',
  WEATHER: 'Weather Conditions',
  OTHER: 'Other'
};

// ==========================================
// MODAL TYPES
// ==========================================
export const MODAL_TYPES = {
  DETAILS: 'details',
  FINALIZE: 'finalize',
  EDIT: 'edit',
  DELAY: 'delay',
  DELETE: 'delete',
  APPOINTMENTS: 'appointments'
};

// ==========================================
// EVENT TYPES (for history/timeline)
// ==========================================
export const EVENT_TYPES = {
  // Appointment events
  CREATED: 'CREATED',
  UPDATED: 'UPDATED',
  FINALIZED: 'FINALIZED',
  FINALIZE_QUICK: 'FINALIZE_QUICK',
  FINALIZE_MODAL_OPENED: 'FINALIZE_MODAL_OPENED',
  DELAYED: 'DELAYED',
  RESCHEDULED: 'RESCHEDULED',
  DELETED: 'DELETED',
  INVOICE_UPDATED: 'INVOICE_UPDATED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  
  // Auth events
  AUTH_STATE_CHANGED: 'AUTH_STATE_CHANGED',
  
  // Modal events
  MODAL_OPENED: 'MODAL_OPENED',
  MODAL_CLOSED: 'MODAL_CLOSED',
  
  // Data events
  APPOINTMENTS_LOADED: 'APPOINTMENTS_LOADED',
  PAGES_LOADED: 'PAGES_LOADED',
  
  // Action events
  APPOINTMENT_FINALIZED: 'APPOINTMENT_FINALIZED',
  
  // Page events
  PAGE_CREATED: 'PAGE_CREATED',
  PAGE_UPDATED: 'PAGE_UPDATED',
  PAGE_DELETED: 'PAGE_DELETED',
  PAGE_POSTED: 'PAGE_POSTED',
  PAGE_UNPOSTED: 'PAGE_UNPOSTED'
};

// ==========================================
// TAB TYPES
// ==========================================
export const TAB_TYPES = {
  PAGES: 'pages',
  APPOINTMENTS: 'appointments'
};

export const APPOINTMENTS_TAB_TYPES = {
  SCHEDULED: 'scheduled',
  FINALIZED: 'finalized'
};

// ==========================================
// LOCAL STORAGE KEYS
// ==========================================
export const STORAGE_KEYS = {
  APPOINTMENTS_TAB: 'tvx.activeAppointmentsTab'
};

// ==========================================
// NOTIFICATION TYPES
// ==========================================
export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

// ==========================================
// TIME FORMATS
// ==========================================
export const TIME_FORMATS = {
  ISO_DATE: 'YYYY-MM-DD',
  UK_DATE: 'DD/MM/YYYY',
  DATETIME_LOCAL: 'YYYY-MM-DDTHH:mm',
  TIME_ONLY: 'HH:mm'
};

// ==========================================
// VALIDATION PATTERNS
// ==========================================
export const VALIDATION_PATTERNS = {
  UK_PHONE: /^(\+44\s?7\d{3}|\(?07\d{3}\)?)\s?\d{3}\s?\d{3}$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  UK_POSTCODE: /^[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}$/i,
  // UK registration plates - various formats
  UK_REG_PLATE: /^[A-Z]{2}\d{2}\s?[A-Z]{3}$|^[A-Z]\d{1,3}\s?[A-Z]{3}$|^[A-Z]{3}\s?\d{1,3}[A-Z]$/i
};

// ==========================================
// UI DEFAULTS
// ==========================================
export const UI_DEFAULTS = {
  NOTIFICATION_DURATION: 3000, // milliseconds
  ANIMATION_DURATION: 300, // milliseconds
  DEBOUNCE_DELAY: 300, // milliseconds
  MODAL_BACKDROP_OPACITY: 0.5
};

// ==========================================
// PAGINATION & LIMITS
// ==========================================
export const LIMITS = {
  MAX_APPOINTMENTS_PER_PAGE: 50,
  MAX_PAGES_PER_PAGE: 20,
  MAX_TIMELINE_EVENTS: 100
};

// ==========================================
// FIRESTORE COLLECTIONS
// ==========================================
export const COLLECTIONS = {
  APPOINTMENTS: 'appointments',
  PAGES: 'pages',
  USERS: 'users',
  SETTINGS: 'settings'
};

// ==========================================
// DATE HELPERS
// ==========================================
export const DATE_HELPERS = {
  MS_PER_DAY: 86400000,
  MS_PER_HOUR: 3600000,
  MS_PER_MINUTE: 60000
};
