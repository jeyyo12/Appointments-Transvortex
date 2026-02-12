/**
 * Firebase Service
 * 
 * Centralized Firebase operations and database access.
 * Provides CRUD operations for appointments, pages, and other collections.
 */

import { COLLECTIONS } from '../config/constants.js';

/**
 * FirebaseService - Handles all Firestore operations
 */
export class FirebaseService {
  constructor(db) {
    this.db = db;
    this._firebaseImports = null;
  }

  /**
   * Lazy load Firebase Firestore imports
   * @private
   * @returns {Promise<Object>} Firestore module exports
   */
  async _getFirebaseImports() {
    if (!this._firebaseImports) {
      this._firebaseImports = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    }
    return this._firebaseImports;
  }

  // ==========================================
  // APPOINTMENT OPERATIONS
  // ==========================================

  /**
   * Get all appointments
   * @returns {Promise<Array>} Array of appointments
   */
  async getAppointments() {
    const { collection, getDocs } = await this._getFirebaseImports();
    const snapshot = await getDocs(collection(this.db, COLLECTIONS.APPOINTMENTS));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  /**
   * Get single appointment by ID
   * @param {string} id - Appointment ID
   * @returns {Promise<Object>} Appointment data
   */
  async getAppointment(id) {
    const { doc, getDoc } = await this._getFirebaseImports();
    const docRef = doc(this.db, COLLECTIONS.APPOINTMENTS, id);
    const snapshot = await getDoc(docRef);
    
    if (!snapshot.exists()) {
      throw new Error(`Appointment ${id} not found`);
    }
    
    return { id: snapshot.id, ...snapshot.data() };
  }

  /**
   * Create new appointment
   * @param {Object} data - Appointment data
   * @returns {Promise<string>} New appointment ID
   */
  async createAppointment(data) {
    const { collection, addDoc, serverTimestamp } = await this._getFirebaseImports();
    
    const appointmentData = {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: data.status || 'scheduled'
    };
    
    const docRef = await addDoc(collection(this.db, COLLECTIONS.APPOINTMENTS), appointmentData);
    return docRef.id;
  }

  /**
   * Update appointment
   * @param {string} id - Appointment ID
   * @param {Object} data - Data to update
   * @returns {Promise<void>}
   */
  async updateAppointment(id, data) {
    const { doc, updateDoc, serverTimestamp } = await this._getFirebaseImports();
    
    const updateData = {
      ...data,
      updatedAt: serverTimestamp()
    };
    
    await updateDoc(doc(this.db, COLLECTIONS.APPOINTMENTS, id), updateData);
  }

  /**
   * Delete appointment
   * @param {string} id - Appointment ID
   * @returns {Promise<void>}
   */
  async deleteAppointment(id) {
    const { doc, deleteDoc } = await this._getFirebaseImports();
    await deleteDoc(doc(this.db, COLLECTIONS.APPOINTMENTS, id));
  }

  /**
   * Subscribe to appointments real-time updates
   * @param {Function} callback - Called with appointment array on each update
   * @returns {Function} Unsubscribe function
   */
  subscribeToAppointments(callback) {
    import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js').then(({ collection, onSnapshot }) => {
      const unsubscribe = onSnapshot(
        collection(this.db, COLLECTIONS.APPOINTMENTS),
        (snapshot) => {
          const appointments = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          callback(appointments);
        },
        (error) => {
          console.error('❌ Appointments subscription error:', error);
          callback([]);
        }
      );
      
      return unsubscribe;
    });
  }

  /**
   * Add event to appointment timeline
   * @param {string} id - Appointment ID
   * @param {Object} event - Timeline event
   * @returns {Promise<void>}
   */
  async addTimelineEvent(id, event) {
    const { doc, updateDoc, arrayUnion, serverTimestamp } = await this._getFirebaseImports();
    
    const timelineEvent = {
      ...event,
      at: serverTimestamp()
    };
    
    await updateDoc(doc(this.db, COLLECTIONS.APPOINTMENTS, id), {
      timeline: arrayUnion(timelineEvent)
    });
  }

  // ==========================================
  // PAGE OPERATIONS
  // ==========================================

  /**
   * Get all pages
   * @returns {Promise<Array>} Array of pages
   */
  async getPages() {
    const { collection, getDocs } = await this._getFirebaseImports();
    const snapshot = await getDocs(collection(this.db, COLLECTIONS.PAGES));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  /**
   * Get single page by ID
   * @param {string} id - Page ID
   * @returns {Promise<Object>} Page data
   */
  async getPage(id) {
    const { doc, getDoc } = await this._getFirebaseImports();
    const docRef = doc(this.db, COLLECTIONS.PAGES, id);
    const snapshot = await getDoc(docRef);
    
    if (!snapshot.exists()) {
      throw new Error(`Page ${id} not found`);
    }
    
    return { id: snapshot.id, ...snapshot.data() };
  }

  /**
   * Create new page
   * @param {Object} data - Page data
   * @returns {Promise<string>} New page ID
   */
  async createPage(data) {
    const { collection, addDoc, serverTimestamp } = await this._getFirebaseImports();
    
    const pageData = {
      ...data,
      createdAt: serverTimestamp(),
      posted: false
    };
    
    const docRef = await addDoc(collection(this.db, COLLECTIONS.PAGES), pageData);
    return docRef.id;
  }

  /**
   * Update page
   * @param {string} id - Page ID
   * @param {Object} data - Data to update
   * @returns {Promise<void>}
   */
  async updatePage(id, data) {
    const { doc, updateDoc } = await this._getFirebaseImports();
    await updateDoc(doc(this.db, COLLECTIONS.PAGES, id), data);
  }

  /**
   * Delete page
   * @param {string} id - Page ID
   * @returns {Promise<void>}
   */
  async deletePage(id) {
    const { doc, deleteDoc } = await this._getFirebaseImports();
    await deleteDoc(doc(this.db, COLLECTIONS.PAGES, id));
  }

  /**
   * Subscribe to pages real-time updates
   * @param {Function} callback - Called with pages array on each update
   * @returns {Function} Unsubscribe function
   */
  subscribeToPages(callback) {
    import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js').then(({ collection, onSnapshot, query, orderBy }) => {
      const q = query(collection(this.db, COLLECTIONS.PAGES), orderBy('createdAt', 'desc'));
      
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const pages = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          callback(pages);
        },
        (error) => {
          console.error('❌ Pages subscription error:', error);
          callback([]);
        }
      );
      
      return unsubscribe;
    });
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  /**
   * Get server timestamp
   * @returns {Promise<Object>} Firestore server timestamp
   */
  async getServerTimestamp() {
    const { serverTimestamp } = await this._getFirebaseImports();
    return serverTimestamp();
  }

  /**
   * Batch update multiple documents
   * @param {Array} updates - Array of {collection, id, data} objects
   * @returns {Promise<void>}
   */
  async batchUpdate(updates) {
    const { doc, writeBatch } = await this._getFirebaseImports();
    const batch = writeBatch(this.db);
    
    updates.forEach(({ collection, id, data }) => {
      const docRef = doc(this.db, collection, id);
      batch.update(docRef, data);
    });
    
    await batch.commit();
  }

  /**
   * Query appointments by status
   * @param {string} status - Appointment status
   * @returns {Promise<Array>} Filtered appointments
   */
  async getAppointmentsByStatus(status) {
    const { collection, query, where, getDocs } = await this._getFirebaseImports();
    const q = query(
      collection(this.db, COLLECTIONS.APPOINTMENTS),
      where('status', '==', status)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  /**
   * Query appointments by date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Filtered appointments
   */
  async getAppointmentsByDateRange(startDate, endDate) {
    const { collection, query, where, getDocs, Timestamp } = await this._getFirebaseImports();
    const q = query(
      collection(this.db, COLLECTIONS.APPOINTMENTS),
      where('scheduledDateTime', '>=', Timestamp.fromDate(startDate)),
      where('scheduledDateTime', '<=', Timestamp.fromDate(endDate))
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
}
