/**
 * FIRESTORE SYNC - REAL-TIME DATA SYNCHRONIZATION
 * 
 * Sets up onSnapshot listeners for:
 * - appointments collection
 * - invoices collection
 * - scannedInvoices collection (if used)
 * 
 * Uses incremental docChanges to update store:
 * - added: new document, upsert to store
 * - modified: existing document changed, upsert to store
 * - removed: document deleted, remove from store
 * 
 * Architecture:
 * Firestore onSnapshot → docChanges → store upsert/remove → metrics compute → UI update
 */

import store from './store.js';
import metricsEngine from './metrics-engine.js';

class FirestoreSync {
  constructor(db) {
    this.db = db;
    this.listeners = new Map(); // { collectionName: unsubscribe }
    this.isInitialized = false;
    this.syncMetrics = {
      appointmentsAddedCount: 0,
      appointmentsModifiedCount: 0,
      appointmentsRemovedCount: 0,
      invoicesAddedCount: 0,
      invoicesModifiedCount: 0,
      invoicesRemovedCount: 0,
      lastSyncTime: null
    };
  }
  
  /**
   * Initialize all Firestore listeners
   * Call this once after user authentication
   * @param {string} userId - Current authenticated user ID (for security rules)
   */
  async initialize(userId) {
    if (this.isInitialized) {
      console.warn('⚠️ FirestoreSync already initialized, skipping');
      return;
    }
    
    if (!this.db) {
      console.error('❌ FirestoreSync: No Firestore instance provided');
      return;
    }
    
    if (!userId) {
      console.error('❌ FirestoreSync: No userId provided');
      return;
    }
    
    
    try {
      // Import Firestore modules
      const {
        collection,
        query,
        orderBy,
        onSnapshot
      } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      
      // Setup appointments listener
      this.subscribeToAppointments(collection, query, orderBy, onSnapshot);
      
      // Setup invoices listener
      this.subscribeToInvoices(collection, query, orderBy, onSnapshot);
      
      // Setup scanned invoices listener (if exists)
      this.subscribeToScannedInvoices(collection, query, orderBy, onSnapshot);
      
      this.isInitialized = true;
      console.log('✅ Firestore sync initialized');
      
    } catch (error) {
      console.error('❌ FirestoreSync initialization failed:', error);
    }
  }
  
  /**
   * Subscribe to real-time appointments changes
   * @private
   */
  subscribeToAppointments(collection, query, orderBy, onSnapshot) {
    // Unsubscribe from previous listener if it exists
    const prevUnsub = this.listeners.get('appointments');
    if (prevUnsub) {
      prevUnsub();
    }
    
    try {
      const q = query(collection(this.db, 'appointments'), orderBy('startAt', 'asc'));
      
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          // Process incremental changes
          snapshot.docChanges().forEach((change) => {
            const docData = change.doc.data();
            const apt = {
              id: change.doc.id,
              ...docData
            };
            
            if (change.type === 'added') {
              store.upsertAppointment(apt);
              this.syncMetrics.appointmentsAddedCount++;
            } else if (change.type === 'modified') {
              store.upsertAppointment(apt);
              this.syncMetrics.appointmentsModifiedCount++;
            } else if (change.type === 'removed') {
              store.removeAppointment(apt.id);
              this.syncMetrics.appointmentsRemovedCount++;
            }
          });
          
          // Recompute metrics after all changes
          const metrics = metricsEngine.compute();
          store.setMetrics(metrics);
          
          // Mark data as ready after first snapshot
          store.markDataReady();

          if (typeof window !== 'undefined' && typeof window.tryRenderAll === 'function') {
            window.tryRenderAll('appointments');
          }
          
          this.syncMetrics.lastSyncTime = new Date();
        },
        (error) => {
          console.error('❌ Appointments listener error:', error);
        }
      );
      
      this.listeners.set('appointments', unsubscribe);
      
    } catch (error) {
      console.error('❌ Failed to subscribe to appointments:', error);
    }
  }
  
  /**
   * Subscribe to real-time invoices changes
   * @private
   */
  subscribeToInvoices(collection, query, orderBy, onSnapshot) {
    const prevUnsub = this.listeners.get('invoices');
    if (prevUnsub) {
      prevUnsub();
    }
    
    try {
      const q = query(collection(this.db, 'invoices'), orderBy('invoiceDate', 'desc'));
      
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            const docData = change.doc.data();
            const inv = {
              id: change.doc.id,
              ...docData
            };
            
            if (change.type === 'added') {
              store.upsertInvoice(inv);
              this.syncMetrics.invoicesAddedCount++;
            } else if (change.type === 'modified') {
              store.upsertInvoice(inv);
              this.syncMetrics.invoicesModifiedCount++;
            } else if (change.type === 'removed') {
              store.removeInvoice(inv.id);
              this.syncMetrics.invoicesRemovedCount++;
            }
          });
          
          // Recompute metrics
          const metrics = metricsEngine.compute();
          store.setMetrics(metrics);

          if (typeof window !== 'undefined' && typeof window.tryRenderAll === 'function') {
            window.tryRenderAll('invoices');
          }
          
          this.syncMetrics.lastSyncTime = new Date();
        },
        (error) => {
          console.error('❌ Invoices listener error:', error);
        }
      );
      
      this.listeners.set('invoices', unsubscribe);
      
    } catch (error) {
      console.error('❌ Failed to subscribe to invoices:', error);
    }
  }
  
  /**
   * Subscribe to real-time scanned invoices changes
   * @private
   */
  subscribeToScannedInvoices(collection, query, orderBy, onSnapshot) {
    const prevUnsub = this.listeners.get('scannedInvoices');
    if (prevUnsub) {
      prevUnsub();
    }
    
    try {
      const q = query(collection(this.db, 'scannedInvoices'), orderBy('createdAt', 'desc'));
      
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            const docData = change.doc.data();
            const si = {
              id: change.doc.id,
              ...docData
            };
            
            if (change.type === 'added') {
              store.upsertScannedInvoice(si);
            } else if (change.type === 'modified') {
              store.upsertScannedInvoice(si);
            } else if (change.type === 'removed') {
              store.removeScannedInvoice(si.id);
            }
          });
          
          this.syncMetrics.lastSyncTime = new Date();
        },
        (error) => {
          console.error('❌ Scanned invoices listener error:', error);
        }
      );
      
      this.listeners.set('scannedInvoices', unsubscribe);
      
    } catch (error) {
      console.error('❌ Failed to subscribe to scanned invoices:', error);
    }
  }
  
  /**
   * Cleanup - unsubscribe from all listeners
   */
  destroy() {
    this.listeners.forEach((unsubscribe, name) => {
      unsubscribe();
    });
    this.listeners.clear();
    this.isInitialized = false;
  }
  
  /**
   * Get sync statistics for debugging
   */
  getStats() {
    return {
      isInitialized: this.isInitialized,
      listeners: Array.from(this.listeners.keys()),
      syncMetrics: this.syncMetrics
    };
  }
}

// Export (will be instantiated with db in integration)
export { FirestoreSync };
