/**
 * DATA LAYER COORDINATOR - INTEGRATION HUB
 * 
 * Initializes and coordinates all data layer modules:
 * - Store (single source of truth)
 * - Firestore Sync (real-time listeners)
 * - Metrics Engine (computed KPIs)
 * - UI Updater (incremental updates)
 * - Data Actions (user interactions)
 * 
 * Call initializeDataLayer(db, userId) once after auth is ready
 */

import store from './store.js';
import metricsEngine from './metrics-engine.js';
import { FirestoreSync } from './firestore-sync.js';
import { DataActions } from './data-actions.js';
import uiUpdater from './ui-updater.js';
import automationEngine from './automation.js';
import uiAutomation from './ui-automation.js';
import { HeaderMetrics } from '../header/header-metrics.js';

class DataLayerCoordinator {
  constructor() {
    this.firestoreSync = null;
    this.dataActions = null;
    this.isInitialized = false;
    this.unsubscribers = [];
  }
  
  /**
   * Initialize the entire data layer
   * Call this once after user authentication succeeds
   * @param {Object} db - Firestore database instance
   * @param {string} userId - Current user ID
   */
  async initialize(db, userId) {
    if (this.isInitialized) {
      console.warn('⚠️ Data layer already initialized');
      return;
    }
    
    if (!db || !userId) {
      console.error('❌ Data layer init failed: missing db or userId');
      return;
    }
    
    
    try {
      // Initialize Firestore sync (sets up real-time listeners)
      this.firestoreSync = new FirestoreSync(db);
      await this.firestoreSync.initialize(userId);
      
      // Initialize data actions (for user interactions)
      this.dataActions = new DataActions(db);
      
      // Setup store listeners for UI updates
      this.setupStoreListeners();
      
      // Initialize automation system
      this.initializeAutomation();
      
      // Initialize appointments list system
      this.initializeAppointmentsUI();
      
      // Expose global API for backward compatibility
      this.exposeGlobalAPI();
      
      this.isInitialized = true;
      console.log('✅ Data layer initialized');
      
      // Run DOM diagnostics (disabled by default - enable with window.__DEBUG_DIAGNOSTICS = true)
      // this.runDOMDiagnostics();
      
      // Optional: stats are available via window._dataLayer.getStats()
      
    } catch (error) {
      console.error('❌ Data layer initialization failed:', error);
    }
  }
  
  /**
   * Setup listeners for store changes to trigger UI updates
   * @private
   */
  setupStoreListeners() {
    // Sync global appointments array for backward compatibility
    // This keeps window.appointments in sync with the data layer
    const syncGlobalAppointments = () => {
      window.appointments = store.getAllAppointments();
      if (typeof window.tryRenderAll === 'function') {
        window.tryRenderAll('manual');
      }
    };

    const syncGlobalInvoices = () => {
      window.allInvoices = store.getAllInvoices().map((invoice) => ({
        ...invoice,
        appointmentId: invoice.appointmentId || invoice.aptId || invoice.appointmentRef || invoice.meta?.appointmentId || null
      }));
      if (typeof window.tryRenderAll === 'function') {
        window.tryRenderAll('manual');
      }
    };
    
    // Initial sync
    syncGlobalAppointments();
    syncGlobalInvoices();
    
    // Listen to metric updates
    const metricsUnsub = store.subscribe((event) => {
      if (event.type === 'metricsUpdated') {
        // Update UI KPI widgets
        uiUpdater.batchUpdate(() => {
          uiUpdater.updateKPIWidgets(event.data);
          uiUpdater.updateDashboardSummary(event.data);
        });
        
        // HeaderMetrics auto-updates badges on store changes (see header-metrics.js)
      }
    });
    
    // Listen to appointment changes
    const appointmentUnsub = store.subscribe((event) => {
      if (event.type === 'appointmentChanged') {
        const { data } = event;
        
        // Keep global appointments array in sync
        syncGlobalAppointments();
        
        // Re-apply filter and re-render when appointments change
        // This ensures the UI stays in sync with the store
        if (typeof window.filterAppointments === 'function') {
          window.filterAppointments();
        }
        
        if (data.type === 'upsert') {
          uiUpdater.batchUpdate(() => {
            uiUpdater.updateAppointmentCard(data.appointment);
          });
        } else if (data.type === 'remove') {
          const card = document.querySelector(`[data-apt-id="${data.id}"]`);
          if (card) {
            card.remove();
          }
        }
      }
    });
    
    // Listen to invoice changes
    const invoiceUnsub = store.subscribe((event) => {
      if (event.type === 'invoiceChanged') {
        const { data } = event;
        syncGlobalInvoices();
        
        if (data.type === 'upsert') {
          uiUpdater.batchUpdate(() => {
            uiUpdater.updateInvoiceCard(data.invoice);
          });
        } else if (data.type === 'remove') {
          const card = document.querySelector(`[data-invoice-id="${data.id}"]`);
          if (card) {
            card.remove();
          }
        }
        
        // HeaderMetrics auto-updates badges on store changes (see header-metrics.js)
      }
    });
    
    // Listen to data ready event
    const dataReadyUnsub = store.subscribe((event) => {
      if (event.type === 'dataReady') {
        const kpiElement = document.getElementById('tvStats');
        if (kpiElement) {
          kpiElement.style.display = 'grid';
        }
        
        // Trigger initial render when data arrives
        if (typeof window.filterAppointments === 'function') {
          window.filterAppointments();
        }
      }
    });
    
    this.unsubscribers.push(metricsUnsub, appointmentUnsub, invoiceUnsub, dataReadyUnsub);
  }

  /**
   * Initialize automation system with feed and scheduler
   * @private
   */
  initializeAutomation() {
    
    try {
      // Set data actions in UI automation
      uiAutomation.setDataActions(this.dataActions);
      
      // Initialize UI feed panel
      uiAutomation.initAutomationFeed();
      
      // Compute initial automation state
      automationEngine.computeAutomationState();
      uiAutomation.updateFeed();
      
      // Listen for changes to recompute automation
      const automationUnsub = store.subscribe((event) => {
        if (event.type === 'appointmentChanged' || event.type === 'invoiceChanged' || event.type === 'metricsUpdated') {
          automationEngine.computeAutomationState();
          uiAutomation.updateFeed();
        }
      });
      
      this.unsubscribers.push(automationUnsub);
      
      // Setup automation scheduler (countdown + low-freq checks)
      this.setupAutomationScheduler();
      
    } catch (e) {
      console.error('❌ Automation initialization failed:', e);
    }
  }

  /**
   * Setup safe automation scheduler (prevents duplicate timers)
   * @private
   */
  setupAutomationScheduler() {
    // Check for singleton guard
    if (window.__tvInitFlags?.automationScheduler) {
      return;
      return;
    }
    
    if (!window.__tvInitFlags) {
      window.__tvInitFlags = {};
    }
    
    window.__tvInitFlags.automationScheduler = true;
    
    // Update countdown every 1 second
    const countdownInterval = setInterval(() => {
      if (automationEngine.updateCountdown()) {
        // Countdown changed, update UI
        uiAutomation.updateFeed();
        
        // Broadcast for mini stat updates if needed
        const state = automationEngine.getAutomationState();
        const metricsEvent = new CustomEvent('automation-updated', { detail: state });
        document.dispatchEvent(metricsEvent);
      }
    }, 1000);
    
    // Periodic recompute (every 60 seconds) to catch state transitions
    const recomputeInterval = setInterval(() => {
      automationEngine.computeAutomationState();
      uiAutomation.updateFeed();
    }, 60000);
    
    // Store for cleanup
    if (!window.__tvCleanupFns) {
      window.__tvCleanupFns = [];
    }
    window.__tvCleanupFns.push(() => {
      clearInterval(countdownInterval);
      clearInterval(recomputeInterval);
    });
  }
  
  /**
   * Initialize appointments list UI system
   * DISABLED: Uses original renderAppointments() system from script.js instead of AppointmentsUIRenderer
   * @private
   */
  initializeAppointmentsUI() {
    // Guard: Skip if already initialized (singleton pattern)
    if (window.__tvInitFlags?.skipAppointmentsUIRenderer) {
      return;
    }
    
    
    try {
      // ⚠️ DISABLED: AppointmentsUIRenderer completely disabled
      // The original renderAppointments() + createAppointmentCard() system from script.js
      // is the authoritative renderer and produces the correct design.
      // 
      // This ensures:
      // - Single source of truth for rendering
      // - No competing designs (LEFT apts-card vs RIGHT app-card)
      // - Data flows: Firestore → Store → filterAppointments() → renderAppointments() → DOM
      
      // Provide fallback handlers that call the original system
      window.handleAppointmentFilter = window.handleAppointmentFilter || function(filterType) {
        // Delegate to original system: update button UI + call filterAppointments()
        if (typeof window.filterAppointments === 'function') {
          // Update active button state
          document.querySelectorAll('.apts-filter-btn').forEach(btn => {
            btn.classList.remove('apts-filter-btn--active');
            if (btn.dataset.filter === filterType) {
              btn.classList.add('apts-filter-btn--active');
            }
          });
          // Trigger filter (which calls renderAppointments internally)
          window.filterAppointments();
        }
      };

      window.handleAppointmentSearch = window.handleAppointmentSearch || function(event) {
        // Delegate to original system: debounce + call filterAppointments()
        if (typeof window.filterAppointments !== 'function') return;
        
        clearTimeout(window.appointmentsDebounceTimer);
        window.appointmentsDebounceTimer = setTimeout(() => {
          window.filterAppointments();
        }, 300);
      };

      window.handleRefreshAppointments = window.handleRefreshAppointments || function() {
        // Delegate to original system: reapply current filter
        if (typeof window.filterAppointments === 'function') {
          window.filterAppointments();
        }
      };

      // Mark as initialized to prevent duplicate init
      window.__tvInitFlags = window.__tvInitFlags || {};
      window.__tvInitFlags.skipAppointmentsUIRenderer = true;
      
    } catch (e) {
      console.error('❌ Appointments UI initialization failed:', e);
    }
  }

  /**
   * Expose data layer API on global window object
   * Allows existing code to use new architecture without refactoring
   * @private
   */
  exposeGlobalAPI() {
    window.Store = store;
    window._dataLayer = {
      // Direct access to store and engines
      store,
      metricsEngine,
      firestoreSync: this.firestoreSync,
      dataActions: this.dataActions,
      uiUpdater,
      automationEngine,
      uiAutomation,
      
      // High-level actions
      markAppointmentCompleted: (id) => this.dataActions.markAppointmentCompleted(id),
      markAppointmentCancelled: (id) => this.dataActions.markAppointmentCancelled(id),
      markInvoicePaid: (id, amount) => this.dataActions.markInvoicePaid(id, amount),
      markInvoiceUnpaid: (id) => this.dataActions.markInvoiceUnpaid(id),
      upsertInvoice: (data) => this.dataActions.upsertInvoice(data),
      deleteInvoice: (id) => this.dataActions.deleteInvoice(id),
      updateAppointmentServices: (id, services) => this.dataActions.updateAppointmentServices(id, services),
      
      // Automation quick actions
      executeQuickAction: (action, targetId) => uiAutomation.executeQuickAction(action, targetId),
      dismissAutomationAlert: (alertId) => automationEngine.dismissAlert(alertId),
      getAutomationState: () => automationEngine.getAutomationState(),
      getTopAlerts: () => automationEngine.getTopAlerts(),
      
      // UI actions
      applyFilter: (filterId) => {
        uiUpdater.setActiveFilter(filterId);
        const appointments = store.getAllAppointments();
        const invoices = store.getAllInvoices();
        const state = automationEngine.getAutomationState();
        let filtered = appointments;
        
        if (filterId === 'today') {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          filtered = appointments.filter(apt => {
            const aptDate = new Date(apt.appointmentDate || apt.startAt);
            aptDate.setHours(0, 0, 0, 0);
            return aptDate.getTime() === today.getTime();
          });
        } else if (filterId === 'upcoming') {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(0, 0, 0, 0);
          filtered = appointments.filter(apt => new Date(apt.appointmentDate || apt.startAt) > tomorrow);
        } else if (filterId === 'completed') {
          filtered = appointments.filter(apt => apt.status === 'Completă' || apt.status === 'Completed');
        } else if (filterId === 'overdue') {
          // Automation filter: show only overdue appointments
          const overdueIds = new Set(state.overdueAppointments.map(a => a.id));
          filtered = appointments.filter(apt => overdueIds.has(apt.id));
        } else if (filterId === 'uninvoiced') {
          // Automation filter: show only completed without invoice
          const uninvoicedIds = new Set(state.uninvoicedCompleted.map(a => a.id));
          filtered = appointments.filter(apt => uninvoicedIds.has(apt.id));
        } else if (filterId === 'unpaid') {
          // Automation filter: show unpaid invoices
          const unpaidIds = new Set(state.unpaidInvoices.map(i => i.id));
          filtered = invoices.filter(inv => unpaidIds.has(inv.id));
          
          // For invoice filters, show differently
          uiUpdater.applyCurrentFilter(filtered, 'invoices');
          return;
        }
        // else: total (show all)
        
        uiUpdater.applyCurrentFilter(filtered);
      },
      
      // Search functionality
      searchAppointments: (query) => {
        if (!query || query.length === 0) {
          // Clear search - show active filter results
          window._dataLayer?.applyFilter(uiUpdater.currentFilter || 'all');
          return [];
        }
        
        const lowerQuery = query.toLowerCase().trim();
        const appointments = store.getAllAppointments();
        
        // Filter by current filter first
        let filtered = appointments;
        if (uiUpdater.currentFilter === 'today') {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          filtered = appointments.filter(apt => {
            const aptDate = new Date(apt.appointmentDate || apt.startAt);
            aptDate.setHours(0, 0, 0, 0);
            return aptDate.getTime() === today.getTime();
          });
        } else if (uiUpdater.currentFilter === 'upcoming') {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(0, 0, 0, 0);
          filtered = appointments.filter(apt => new Date(apt.appointmentDate || apt.startAt) > tomorrow);
        } else if (uiUpdater.currentFilter === 'completed') {
          filtered = appointments.filter(apt => apt.status === 'Completă' || apt.status === 'Completed');
        }
        
        // Then search within filtered results
        const results = filtered.filter(apt => {
          const customer = (apt.customerName || '').toLowerCase();
          const phone = (apt.customerPhone || '').toLowerCase();
          const vehicle = (apt.vehicleReg || '').toLowerCase();
          const notes = (apt.notes || '').toLowerCase();
          
          return customer.includes(lowerQuery) ||
                 phone.includes(lowerQuery) ||
                 vehicle.includes(lowerQuery) ||
                 notes.includes(lowerQuery);
        });
        
        uiUpdater.applyCurrentFilter(results);
        return results;
      },
      
      // Diagnostics
      getStats: () => ({
        store: store.getStats(),
        metrics: metricsEngine.getStats(),
        sync: this.firestoreSync?.getStats(),
      }),
      getSnapshot: () => ({
        store: store.getSnapshot(),
        metrics: store.metrics,
      })
    };
  }
  
  /**
   * Run DOM structure diagnostics to verify UI is ready
   * @private
   */
  runDOMDiagnostics() {
    console.group('🔍 DOM Diagnostics');
    
    // Check for KPI cards
    const totalApt = document.getElementById('totalAppointments');
    const todayApt = document.getElementById('todayAppointments');
    const upcomingApt = document.getElementById('upcomingAppointments');
    const doneApt = document.getElementById('doneAppointments');
    
    console.log('KPI Elements:');
    console.log(`  ✓ #totalAppointments: ${totalApt ? 'FOUND' : 'MISSING'}`);
    console.log(`  ✓ #todayAppointments: ${todayApt ? 'FOUND' : 'MISSING'}`);
    console.log(`  ✓ #upcomingAppointments: ${upcomingApt ? 'FOUND' : 'MISSING'}`);
    console.log(`  ✓ #doneAppointments: ${doneApt ? 'FOUND' : 'MISSING'}`);
    
    // Check for header elements
    const headerBrand = document.getElementById('tvHeaderBrandSlot');
    const headerGif = document.getElementById('tvHeaderGif');
    const authBar = document.getElementById('authBar');
    
    console.log('Header Elements:');
    console.log(`  ✓ #tvHeaderBrandSlot: ${headerBrand ? 'FOUND' : 'MISSING'}`);
    console.log(`  ✓ #tvHeaderGif: ${headerGif ? 'FOUND' : 'MISSING'}`);
    console.log(`  ✓ #authBar: ${authBar ? 'FOUND' : 'MISSING'}`);
    
    // Check for duplicate KPI cards
    const kpiCards = document.querySelectorAll('.tvStatCard');
    console.log(`KPI Card Count: ${kpiCards.length} elements`);
    
    // Check for duplicate headers
    const headers = document.querySelectorAll('#authBar');
    console.log(`Header Count: ${headers.length} element(s)`);
    
    // Verify global appointments array
    const globalApts = window.appointments || [];
    console.log(`Global Appointments Array: ${globalApts.length} items`);
    
    // Debug badge elements for ui-updater
    console.log('Badge Elements (for metrics display):');
    if (typeof uiUpdater.debugBadgeElements === 'function') {
      uiUpdater.debugBadgeElements();
    }
    
    console.log('✅ Diagnostics complete');
    console.groupEnd();
  }
  
  /**
   * Cleanup (unsubscribe from listeners, etc.)
   */
  destroy() {
    
    this.unsubscribers.forEach(unsub => {
      try {
        unsub();
      } catch (e) {
        console.warn('⚠️ Error unsubscribing:', e);
      }
    });
    this.unsubscribers = [];
    
    if (this.firestoreSync) {
      this.firestoreSync.destroy();
    }
    
    metricsEngine.destroy();
    store.clear();
    
    this.isInitialized = false;
  }
  
  /**
   * Check if data layer is healthy
   */
  getHealth() {
    return {
      initialized: this.isInitialized,
      storeSize: store.getStats(),
      hasListeners: this.firestoreSync?.isInitialized,
      syncActive: Object.keys(this.firestoreSync?.listeners || {}).length
    };
  }
}

// Create and export singleton coordinator
const coordinator = new DataLayerCoordinator();

// Also export for explicit access
export { coordinator };
export default coordinator;


/**
 * Quick-start function: Initialize data layer in one call
 * Usage: initializeDataLayer(db, userId)
 */
export async function initializeDataLayer(db, userId) {
  await coordinator.initialize(db, userId);
  
  // Initialize header metrics after coordinator is ready
  try {
    const headerMetrics = new HeaderMetrics(store);

    // Perform initial metric update
    headerMetrics.update();

    // Export to window for global access
    window._headerMetrics = headerMetrics;

  } catch (error) {
    console.warn('⚠️ Header initialization warning (app continues to work):', error);
  }
  
  return coordinator;
}
