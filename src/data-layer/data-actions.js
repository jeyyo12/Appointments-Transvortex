/**
 * DATA ACTIONS - USER INTERACTIONS THAT WRITE TO FIRESTORE
 * 
 * All actions follow the pattern:
 * 1. Write to Firestore (transaction/batch if linked docs)
 * 2. Return promise/status
 * 3. UI updates happen via onSnapshot listeners (not manual updates)
 * 
 * This ensures single source of truth: Firestore is the authority
 */

import store from './store.js';

class DataActions {
  constructor(db) {
    this.db = db;
  }
  
  /**
   * Mark appointment as completed
   * @param {string} appointmentId
   * @returns {Promise}
   */
  async markAppointmentCompleted(appointmentId) {
    if (!this.db) {
      throw new Error('Firestore not initialized');
    }
    
    try {
      const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      
      const appointmentRef = doc(this.db, 'appointments', appointmentId);
      await updateDoc(appointmentRef, {
        status: 'Completă',
        completedAt: new Date().toISOString()
      });
      
      console.log('✅ Appointment marked as completed:', appointmentId);
      // Store listener will handle UI update
      return true;
      
    } catch (error) {
      console.error('❌ Error marking appointment as completed:', error);
      throw error;
    }
  }
  
  /**
   * Mark appointment as cancelled
   * @param {string} appointmentId
   * @returns {Promise}
   */
  async markAppointmentCancelled(appointmentId) {
    if (!this.db) {
      throw new Error('Firestore not initialized');
    }
    
    try {
      const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      
      const appointmentRef = doc(this.db, 'appointments', appointmentId);
      await updateDoc(appointmentRef, {
        status: 'Anulată',
        cancelledAt: new Date().toISOString()
      });
      
      console.log('✅ Appointment marked as cancelled:', appointmentId);
      return true;
      
    } catch (error) {
      console.error('❌ Error marking appointment as cancelled:', error);
      throw error;
    }
  }
  
  /**
   * Mark invoice as paid
   * @param {string} invoiceId
   * @param {number} amountPaid - Total paid amount
   * @returns {Promise}
   */
  async markInvoicePaid(invoiceId, amountPaid) {
    if (!this.db) {
      throw new Error('Firestore not initialized');
    }
    
    try {
      const { doc, getDoc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      
      const invoiceRef = doc(this.db, 'invoices', invoiceId);
      const invoiceSnap = await getDoc(invoiceRef);
      if (!invoiceSnap.exists()) {
        throw new Error('Invoice not found');
      }

      const invoice = invoiceSnap.data() || {};
      const total = Number(invoice.total ?? invoice.totals?.total ?? 0) || 0;
      const normalizedAmountPaid = Number(amountPaid);
      const nextAmountPaid = Number.isFinite(normalizedAmountPaid) ? normalizedAmountPaid : total;
      const balanceDue = Math.max(0, total - nextAmountPaid);
      const paymentStatus = nextAmountPaid <= 0 ? 'unpaid' : (nextAmountPaid >= total ? 'paid' : 'partial');
      const nowIso = new Date().toISOString();

      const invoicePatch = {
        paymentStatus,
        total,
        amountPaid: nextAmountPaid,
        paidAmount: nextAmountPaid,
        balanceDue,
        updatedAt: nowIso,
        paid: paymentStatus === 'paid',
        paidAt: paymentStatus === 'paid' ? nowIso : null,
        paidDate: paymentStatus === 'paid' ? nowIso.split('T')[0] : null
      };

      if (!invoice.createdAt) {
        invoicePatch.createdAt = nowIso;
      }

      await updateDoc(invoiceRef, invoicePatch);

      const linkedAppointmentId = invoice.appointmentId || null;
      if (linkedAppointmentId) {
        const appointmentRef = doc(this.db, 'appointments', linkedAppointmentId);
        await updateDoc(appointmentRef, {
          invoiceId,
          paymentStatus,
          amountPaid: nextAmountPaid,
          paidAmount: nextAmountPaid,
          balanceDue,
          updatedAt: nowIso
        });
      }
      
      console.log('✅ Invoice marked as paid:', invoiceId);
      return true;
      
    } catch (error) {
      console.error('❌ Error marking invoice as paid:', error);
      throw error;
    }
  }
  
  /**
   * Mark invoice as unpaid
   * @param {string} invoiceId
   * @returns {Promise}
   */
  async markInvoiceUnpaid(invoiceId) {
    if (!this.db) {
      throw new Error('Firestore not initialized');
    }
    
    try {
      const { doc, getDoc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      
      const invoiceRef = doc(this.db, 'invoices', invoiceId);
      const invoiceSnap = await getDoc(invoiceRef);
      if (!invoiceSnap.exists()) {
        throw new Error('Invoice not found');
      }

      const invoice = invoiceSnap.data() || {};
      const total = Number(invoice.total ?? invoice.totals?.total ?? 0) || 0;
      const nowIso = new Date().toISOString();

      const invoicePatch = {
        paymentStatus: 'unpaid',
        total,
        amountPaid: 0,
        paidAmount: 0,
        balanceDue: Math.max(0, total),
        updatedAt: nowIso,
        paid: false,
        paidAt: null,
        paidDate: null
      };

      if (!invoice.createdAt) {
        invoicePatch.createdAt = nowIso;
      }

      await updateDoc(invoiceRef, invoicePatch);

      const linkedAppointmentId = invoice.appointmentId || null;
      if (linkedAppointmentId) {
        const appointmentRef = doc(this.db, 'appointments', linkedAppointmentId);
        await updateDoc(appointmentRef, {
          invoiceId,
          paymentStatus: 'unpaid',
          amountPaid: 0,
          paidAmount: 0,
          balanceDue: Math.max(0, total),
          updatedAt: nowIso
        });
      }
      
      console.log('✅ Invoice marked as unpaid:', invoiceId);
      return true;
      
    } catch (error) {
      console.error('❌ Error marking invoice as unpaid:', error);
      throw error;
    }
  }
  
  /**
   * Create or update invoice
   * @param {Object} invoiceData
   * @returns {Promise<string>} New invoice ID
   */
  async upsertInvoice(invoiceData) {
    if (!this.db) {
      throw new Error('Firestore not initialized');
    }
    
    try {
      const { collection, doc, setDoc, addDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      
      const invoiceRef = collection(this.db, 'invoices');
      
      if (invoiceData.id) {
        // Update existing
        const docRef = doc(this.db, 'invoices', invoiceData.id);
        await setDoc(docRef, {
          ...invoiceData,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        
        console.log('✅ Invoice updated:', invoiceData.id);
        return invoiceData.id;
      } else {
        // Create new
        const newDoc = await addDoc(invoiceRef, {
          ...invoiceData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        
        console.log('✅ Invoice created:', newDoc.id);
        return newDoc.id;
      }
      
    } catch (error) {
      console.error('❌ Error upserting invoice:', error);
      throw error;
    }
  }
  
  /**
   * Delete invoice
   * @param {string} invoiceId
   * @returns {Promise}
   */
  async deleteInvoice(invoiceId) {
    if (!this.db) {
      throw new Error('Firestore not initialized');
    }
    
    try {
      const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      
      const invoiceRef = doc(this.db, 'invoices', invoiceId);
      await deleteDoc(invoiceRef);
      
      console.log('✅ Invoice deleted:', invoiceId);
      return true;
      
    } catch (error) {
      console.error('❌ Error deleting invoice:', error);
      throw error;
    }
  }
  
  /**
   * Update appointment services/prices
   * @param {string} appointmentId
   * @param {Array} services
   * @returns {Promise}
   */
  async updateAppointmentServices(appointmentId, services) {
    if (!this.db) {
      throw new Error('Firestore not initialized');
    }
    
    try {
      const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      
      const appointmentRef = doc(this.db, 'appointments', appointmentId);
      await updateDoc(appointmentRef, {
        services: services,
        updatedAt: new Date().toISOString(),
        totalPrice: services.reduce((sum, s) => sum + (parseFloat(s.price) || 0) * (parseFloat(s.quantity) || 1), 0)
      });
      
      console.log('✅ Appointment services updated:', appointmentId);
      return true;
      
    } catch (error) {
      console.error('❌ Error updating appointment services:', error);
      throw error;
    }
  }
  
  /**
   * Batch update appointment status and related invoice
   * Ensures consistency between appointment and invoice
   * @param {string} appointmentId
   * @param {string} invoiceId
   * @param {string} status
   * @returns {Promise}
   */
  async updateAppointmentAndInvoiceStatus(appointmentId, invoiceId, status) {
    if (!this.db) {
      throw new Error('Firestore not initialized');
    }
    
    try {
      const { doc, writeBatch } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      
      const batch = writeBatch(this.db);
      
      // Update appointment
      const appointmentRef = doc(this.db, 'appointments', appointmentId);
      batch.update(appointmentRef, {
        status: status,
        updatedAt: new Date().toISOString()
      });
      
      // Update related invoice if exists
      if (invoiceId) {
        const invoiceRef = doc(this.db, 'invoices', invoiceId);
        batch.update(invoiceRef, {
          appointmentStatus: status,
          updatedAt: new Date().toISOString()
        });
      }
      
      await batch.commit();
      console.log('✅ Appointment and invoice status updated (batch):', appointmentId);
      return true;
      
    } catch (error) {
      console.error('❌ Error in batch update:', error);
      throw error;
    }
  }
}

export { DataActions };
