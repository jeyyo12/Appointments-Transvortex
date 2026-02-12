/**
 * Application Initialization
 * 
 * Main entry point that initializes all services and wires the application together.
 */

import { firebaseConfig, validateFirebaseConfig, ADMIN_UIDS } from './config/firebase.config.js';
import { appState } from './core/app-state.js';
import { eventBus, EVENT_TYPES } from './core/event-bus.js';
import { FirebaseService } from './services/firebase-service.js';
import { AuthService } from './services/auth-service.js';
import { AppointmentService } from './services/appointment-service.js';
import { PageService } from './services/page-service.js';
import HistoryService from './services/historyService.js';
import { modalManager } from './ui/components/index.js';
import { showError } from './utils/notifications.js';

/**
 * Initialize Firebase
 * @returns {Promise<Object>} Firebase instances (app, auth, db)
 */
async function initializeFirebase() {
  try {
    // Validate config
    validateFirebaseConfig();

    // Dynamic import Firebase modules
    const { initializeApp } = await import(
      'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js'
    );
    const { getAuth } = await import(
      'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'
    );
    const { getFirestore } = await import(
      'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
    );

    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    console.log('✅ Firebase initialized successfully');

    return { app, auth, db };
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error);
    showError('Failed to initialize Firebase: ' + error.message);
    throw error;
  }
}

/**
 * Initialize all services
 * @param {Object} firebase - Firebase instances
 * @returns {Object} Service instances
 */
function initializeServices(firebase) {
  const { auth, db } = firebase;

  // Create core services
  const firebaseService = new FirebaseService(db);
  const authService = new AuthService(auth);
  const historyService = new HistoryService(db);

  // Create business logic services
  const appointmentService = new AppointmentService(firebaseService, historyService, authService);
  const pageService = new PageService(firebaseService, authService);

  // Store in app state
  appState.setState('services.appointmentHistory', historyService, false);

  console.log('✅ Services initialized');

  return {
    firebaseService,
    authService,
    appointmentService,
    pageService,
    historyService
  };
}

/**
 * Setup event subscriptions
 * @param {Object} services - Service instances
 */
function setupEventSubscriptions(services) {
  // Debug mode in development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    eventBus.setDebugMode(true);
  }

  // Log state changes in debug mode
  appState.subscribe('*', (newValue, oldValue, path) => {
    if (eventBus._debugMode) {
      console.log(`[AppState] ${path} changed:`, { oldValue, newValue });
    }
  });

  console.log('✅ Event subscriptions configured');
}

/**
 * Main application initialization
 */
export async function initializeApp() {
  try {
    console.log('🚀 Initializing Appointments-Transvortex application...');

    // 1. Initialize Firebase
    const firebase = await initializeFirebase();
    appState.setState('firebase', firebase, false);

    // 2. Initialize services
    const services = initializeServices(firebase);
    window.services = services; // Expose for debugging

    // 3. Setup auth listener
    services.authService.initializeAuthListener();

    // 4. Setup event subscriptions
    setupEventSubscriptions(services);

    // 5. Expose modal manager globally (for backward compatibility)
    window.modalManager = modalManager;

    // 6. Expose app state and event bus for debugging
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      window.appState = appState;
      window.eventBus = eventBus;
      
      console.log('🔍 Debug tools available:');
      console.log('  - window.appState.getDebugInfo()');
      console.log('  - window.eventBus.getDebugInfo()');
      console.log('  - window.services');
    }

    console.log('✅ Application initialized successfully');
    
    // Emit app ready event
    eventBus.emit('APP_READY', { services, firebase });

  } catch (error) {
    console.error('❌ Application initialization failed:', error);
    showError('Application failed to start. Please refresh the page.');
    throw error;
  }
}

/**
 * Export services for external access
 */
export function getServices() {
  return window.services;
}
