/**
 * Invoice Creation Flow Module
 * Handles creating invoice documents in Firestore and linking them to appointments
 */

import { db, getCurrentUser } from '../firebase/firebase.js';
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { createLogger } from '../shared/logger.js';
import { showToast } from '../shared/ui.js';
import { getOrCreateInvoiceForAppointment, openInvoice } from '../invoices/invoice-manager.js';

const logger = createLogger('InvoiceCreate');

/**
 * Generate unique invoice number
 * Format: INV-{RANDOM}-{YYMMDD}
 * @returns {string} Generated invoice number
 */
export function generateInvoiceNumber() {
  const now = new Date();
  const dateStr = now.toISOString().slice(2, 8).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `INV-${random}-${dateStr}`;
}

/**
 * Create invoice document in Firestore immediately
 * Links to appointment if appointmentId provided
 * Opens invoice editor after creation
 * 
 * @param {string|null} appointmentId - Appointment ID to link (optional)
 * @param {Object} prefillData - Data to prefill invoice with
 * @param {string} prefillData.customerName - Customer name
 * @param {string} prefillData.customerPhone - Customer phone
 * @param {string} prefillData.address - Customer address
 * @param {string} prefillData.makeModel - Vehicle make/model
 * @param {string} prefillData.registrationPlate - Registration plate
 * @param {string} prefillData.mileage - Vehicle mileage
 * @param {string} prefillData.problemDescription - Problem description
 * @returns {Promise<string|null>} Created invoice ID or null on error
 */
export async function createInvoiceFromAppointment(appointmentId, prefillData) {
  const currentUser = getCurrentUser();
  
  if (!db || !currentUser) {
    logger.error('Database or user not initialized');
    alert('Please wait for authentication to complete');
    return null;
  }

  // If appointmentId is provided, use single-source manager to prevent duplicates
  if (appointmentId) {
    try {
      const invoiceId = await getOrCreateInvoiceForAppointment(appointmentId, prefillData || {});
      openInvoice(null, invoiceId, 'edit');
      return invoiceId;
    } catch (error) {
      logger.error('❌ Error opening appointment invoice:', error);
      showToast('Error opening invoice: ' + error.message, 'error');
      return null;
    }
  }

  logger.info('Creating invoice in Firestore...');
  logger.debug('Prefill data:', prefillData);
  
  try {
    // Generate invoice number
    const invoiceNumber = generateInvoiceNumber();
    
    // Build invoice payload
    const invoicePayload = {
      invoiceNumber: invoiceNumber,
      status: 'draft',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: currentUser.uid,
      
      // Customer info
      customerName: prefillData?.customerName || '',
      phone: prefillData?.customerPhone || '',
      address: prefillData?.address || '',
      
      // Vehicle info
      vehicleMakeModel: prefillData?.makeModel || '',
      regPlate: prefillData?.registrationPlate || prefillData?.regPlate || '',
      mileage: prefillData?.mileage || '',
      
      // Items (empty initially - user will add in editor)
      items: [],
      services: prefillData?.services || [],
      parts: prefillData?.parts || [],
      jobs: [...(prefillData?.services || []), ...(prefillData?.parts || [])],
      
      // Totals (0 initially)
      subtotal: prefillData?.subtotal || 0,
      vatRate: 0,
      vatAmount: 0,
      total: prefillData?.total || prefillData?.subtotal || 0,
      
      // Payment
      amountPaid: 0,
      remainingBalance: 0,
      paymentMethod: '',
      paymentDate: '',
      
      // Notes
      notes: prefillData?.problemDescription || '',
      jobsSummary: prefillData?.jobsSummary || '',
      
      // Link to appointment if provided
      ...(appointmentId && { appointmentId })
    };
    
    logger.info('Writing to Firestore collection "invoices"...');
    logger.debug('Payload:', invoicePayload);
    
    // Create invoice document in Firestore
    const invoiceRef = await addDoc(collection(db, 'invoices'), invoicePayload);
    const invoiceId = invoiceRef.id;
    
    logger.info('✅ Firestore doc created in /invoices:', invoiceId);
    logger.info('✅ Invoice number:', invoiceNumber);
    
    // Verify it was created (read-back)
    try {
      const verifyRef = doc(db, 'invoices', invoiceId);
      const verifySnap = await getDoc(verifyRef);
      logger.info('🔁 Read-back verification - exists:', verifySnap.exists());
      if (verifySnap.exists()) {
        logger.debug('🔁 Read-back data:', verifySnap.data());
      } else {
        logger.error('❌ Read-back FAILED - doc not found!');
      }
    } catch (readError) {
      logger.error('❌ Read-back error:', readError);
    }
    
    // Link invoice to appointment if appointmentId provided
    if (appointmentId) {
      try {
        await updateDoc(doc(db, 'appointments', appointmentId), {
          invoiceId: invoiceId,
          updatedAt: serverTimestamp()
        });
        logger.info('✅ Linked to appointment:', appointmentId);
      } catch (linkError) {
        logger.warn('⚠️ Could not link to appointment:', linkError);
      }
    }
    
    // Show success toast
    showToast('Invoice created successfully', 'success');
    
    // Open invoice editor to complete details
    logger.info('📝 Opening invoice editor...');
    window.open(`invoice.html?invoiceId=${invoiceId}&mode=edit`, '_blank');
    
    return invoiceId;
    
  } catch (error) {
    logger.error('❌ Error creating invoice:', error);
    showToast('Error creating invoice: ' + error.message, 'error');
    return null;
  }
}

/**
 * Validate required fields for invoice creation
 * @param {Object} data - Form data
 * @returns {boolean} True if valid
 */
export function validateInvoiceCreation(data) {
  const { customerName, customerPhone, registrationPlate } = data;
  
  if (!customerName || !customerPhone || !registrationPlate) {
    showToast('Please fill in at least Customer Name, Phone, and Registration Plate', 'warning');
    return false;
  }
  
  return true;
}
