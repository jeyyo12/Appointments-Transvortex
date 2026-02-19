/**
 * SINGLE SOURCE OF TRUTH - IN-MEMORY STORE
 * 
 * Maintains normalized data for appointments, invoices, and scanned invoices.
 * All UI updates derive from changes to this store.
 * 
 * Architecture:
 * - store.appointmentsById: Map<id, appointment>
 * - store.invoicesById: Map<id, invoice>
 * - store.scannedInvoicesById: Map<id, scannedInvoice>
 * - store.metrics: Computed KPIs (regenerated on data changes)
 * 
 * Ensures single direction of data flow:
 * Firestore → Store → Metrics → UI
 */

class DataStore {
  constructor() {
    // Normalized collections by ID (maps for O(1) lookups)
    this.appointmentsById = new Map();
    this.invoicesById = new Map();
    this.scannedInvoicesById = new Map();
    
    // Data ready flag (set after first Firestore snapshot)
    this.dataReady = false;
    
    // Computed metrics (cached, regenerated on data changes)
    this.metrics = {
      jobs: {
        total: 0,
        today: 0,
        upcoming: 0,
        completed: 0,
        cancelled: 0
      },
      invoices: {
        unpaidCount: 0,
        paidCount: 0,
        totalCount: 0
      },
      revenue: {
        weekTotal: 0,
        unpaidTotal: 0,
        todayTotal: 0,
        monthTotal: 0,
        allTimeTotal: 0
      },
      weeklyBuckets: {} // { 'week-1': sum, 'week-2': sum, ... }
    };
    
    // Listeners for store changes
    this.listeners = new Set();
    
    // Init guard to prevent duplicate syncs
    this.isSyncing = false;
  }
  
  /**
   * Upsert appointment (add or update)
   * @param {Object} apt - Appointment document
   */
  upsertAppointment(apt) {
    if (!apt || !apt.id) {
      console.warn('⚠️ Store: Invalid appointment (missing id)', apt);
      return;
    }
    
    const existing = this.appointmentsById.get(apt.id);
    this.appointmentsById.set(apt.id, {
      ...existing, // preserve unknown fields
      ...apt       // new/updated fields override
    });
    
    this.emit('appointmentChanged', { type: 'upsert', id: apt.id, appointment: apt });
  }
  
  /**
   * Remove appointment
   * @param {string} id - Appointment ID
   */
  removeAppointment(id) {
    if (!this.appointmentsById.has(id)) {
      console.warn('⚠️ Store: Appointment not found for removal:', id);
      return;
    }
    
    this.appointmentsById.delete(id);
    this.emit('appointmentChanged', { type: 'remove', id });
  }
  
  /**
   * Upsert invoice (add or update)
   * @param {Object} inv - Invoice document
   */
  upsertInvoice(inv) {
    if (!inv || !inv.id) {
      console.warn('⚠️ Store: Invalid invoice (missing id)', inv);
      return;
    }
    
    const existing = this.invoicesById.get(inv.id);
    this.invoicesById.set(inv.id, {
      ...existing,
      ...inv
    });
    
    this.emit('invoiceChanged', { type: 'upsert', id: inv.id, invoice: inv });
  }
  
  /**
   * Remove invoice
   * @param {string} id - Invoice ID
   */
  removeInvoice(id) {
    if (!this.invoicesById.has(id)) {
      console.warn('⚠️ Store: Invoice not found for removal:', id);
      return;
    }
    
    this.invoicesById.delete(id);
    this.emit('invoiceChanged', { type: 'remove', id });
  }
  
  /**
   * Upsert scanned invoice
   * @param {Object} si - Scanned invoice document
   */
  upsertScannedInvoice(si) {
    if (!si || !si.id) {
      console.warn('⚠️ Store: Invalid scanned invoice (missing id)', si);
      return;
    }
    
    const existing = this.scannedInvoicesById.get(si.id);
    this.scannedInvoicesById.set(si.id, {
      ...existing,
      ...si
    });
    
    this.emit('scannedInvoiceChanged', { type: 'upsert', id: si.id, scannedInvoice: si });
  }
  
  /**
   * Remove scanned invoice
   * @param {string} id - Scanned invoice ID
   */
  removeScannedInvoice(id) {
    if (!this.scannedInvoicesById.has(id)) {
      console.warn('⚠️ Store: Scanned invoice not found for removal:', id);
      return;
    }
    
    this.scannedInvoicesById.delete(id);
    this.emit('scannedInvoiceChanged', { type: 'remove', id });
  }
  
  /**
   * Get appointment by ID
   * @param {string} id
   * @returns {Object|undefined}
   */
  getAppointment(id) {
    return this.appointmentsById.get(id);
  }
  
  /**
   * Get invoice by ID
   * @param {string} id
   * @returns {Object|undefined}
   */
  getInvoice(id) {
    return this.invoicesById.get(id);
  }
  
  /**
   * Get scanned invoice by ID
   * @param {string} id
   * @returns {Object|undefined}
   */
  getScannedInvoice(id) {
    return this.scannedInvoicesById.get(id);
  }
  
  /**
   * Get all appointments as array
   * @returns {Array}
   */
  getAllAppointments() {
    return Array.from(this.appointmentsById.values());
  }
  
  /**
   * Get all invoices as array
   * @returns {Array}
   */
  getAllInvoices() {
    return Array.from(this.invoicesById.values());
  }
  
  /**
   * Get all scanned invoices as array
   * @returns {Array}
   */
  getAllScannedInvoices() {
    return Array.from(this.scannedInvoicesById.values());
  }
  
  /**
   * Clear all data (for testing or logout)
   */
  clear() {
    this.appointmentsById.clear();
    this.invoicesById.clear();
    this.scannedInvoicesById.clear();
    this.metrics = {
      jobs: { total: 0, today: 0, upcoming: 0, completed: 0, cancelled: 0 },
      invoices: { unpaidCount: 0, paidCount: 0, totalCount: 0 },
      revenue: { weekTotal: 0, unpaidTotal: 0, todayTotal: 0, monthTotal: 0, allTimeTotal: 0 },
      weeklyBuckets: {}
    };
    this.emit('storeCleared');
  }
  
  /**
   * Set metrics (called by metrics engine)
   * @param {Object} metrics - New computed metrics
   */
  setMetrics(metrics) {
    this.metrics = { ...this.metrics, ...metrics };
    this.emit('metricsUpdated', this.metrics);
  }
  
  /**
   * Mark that first data snapshot has been received
   * Called once after initial Firestore sync
   */
  markDataReady() {
    if (!this.dataReady) {
      this.dataReady = true;
      console.log('✅ Store: Data ready - appointments:', this.appointmentsById.size, 'invoices:', this.invoicesById.size, 'scanned:', this.scannedInvoicesById.size);
      this.emit('dataReady', true);
      console.log('✅ Store: Data ready (first snapshot received)');
    }
  }
  
  /**
   * Register listener for store changes
   * @param {Function} callback - Called with event: { type, data }
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }
  
  /**
   * Emit event to all listeners
   * @private
   */
  emit(eventType, data) {
    const event = { type: eventType, data };
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('❌ Store listener error:', error, event);
      }
    });
  }
  
  /**
   * Get store statistics for debugging
   */
  getStats() {
    return {
      appointments: this.appointmentsById.size,
      invoices: this.invoicesById.size,
      scannedInvoices: this.scannedInvoicesById.size,
      metrics: this.metrics,
      listeners: this.listeners.size
    };
  }
  
  /**
   * Get store snapshot for debugging
   */
  getSnapshot() {
    return {
      appointmentsById: Object.fromEntries(this.appointmentsById),
      invoicesById: Object.fromEntries(this.invoicesById),
      scannedInvoicesById: Object.fromEntries(this.scannedInvoicesById),
      metrics: this.metrics
    };
  }
}

// Create singleton store instance
const store = new DataStore();

// Export store and factory
export { store };
export default store;
