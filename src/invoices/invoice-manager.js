/**
 * Invoice Management - Single Source of Truth
 * Ensures ONE invoice per appointment across all flows
 */

import { db, getCurrentUser } from '../firebase/firebase.js';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, addDoc, deleteDoc, serverTimestamp, limit, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { createLogger } from '../shared/logger.js';
import { showToast } from '../shared/ui.js';

const logger = createLogger('InvoiceManager');

/**
 * Generate unique invoice number
 * Format: INV-{RANDOM}-{YYMMDD}
 */
function generateInvoiceNumber() {
  const now = new Date();
  const dateStr = now.toISOString().slice(2, 8).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `INV-${random}-${dateStr}`;
}

function toNumber(value) {
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sumLineItems(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => {
    const qty = toNumber(item?.qty || 1);
    const unitPrice = toNumber(item?.unitPrice || item?.price || 0);
    const lineTotal = toNumber(item?.total || item?.lineTotal || (qty * unitPrice));
    return sum + lineTotal;
  }, 0);
}

function getInvoiceCreatedAt(invoice) {
  const createdAt = invoice.createdAt;
  if (!createdAt) return 0;
  if (typeof createdAt?.toMillis === 'function') return createdAt.toMillis();
  if (typeof createdAt === 'string') return new Date(createdAt).getTime();
  return new Date(createdAt).getTime();
}

function computeCompletenessScore(invoice) {
  if (!invoice) return 0;

  const itemsCount = Array.isArray(invoice.items) ? invoice.items.length : 0;
  const servicesCount = Array.isArray(invoice.services) ? invoice.services.length : 0;
  const partsCount = Array.isArray(invoice.parts) ? invoice.parts.length : 0;
  const totalItems = itemsCount + servicesCount + partsCount;

  const total = toNumber(invoice.total || invoice.totals?.total || 0);
  const amountPaid = toNumber(invoice.paidAmount || invoice.amountPaid || invoice.totals?.amountPaid || 0);

  const customerName = invoice.customerName || invoice.customer?.name || '';
  const hasCustomer = customerName.trim().length > 0 ? 1 : 0;

  const vehicleMake = invoice.vehicleMakeModel || invoice.vehicle?.makeModel || '';
  const regPlate = invoice.regPlate || invoice.vehicle?.regPlate || '';
  const hasVehicle = (vehicleMake || regPlate) ? 1 : 0;

  const hasTotal = total > 0 ? 2 : 0;
  const hasPaid = amountPaid > 0 ? 1 : 0;

  return totalItems + hasTotal + hasPaid + hasCustomer + hasVehicle;
}

function pickBestInvoice(invoices, preferredId = null) {
  if (!Array.isArray(invoices) || invoices.length === 0) return null;

  if (preferredId) {
    const preferred = invoices.find(inv => inv.id === preferredId);
    if (preferred) return preferred;
  }

  // Requirement: keep newest invoice by createdAt
  return [...invoices].sort((a, b) => getInvoiceCreatedAt(b) - getInvoiceCreatedAt(a))[0];
}

/**
 * Get or create invoice for appointment (SINGLE SOURCE OF TRUTH)
 * Ensures only ONE invoice exists per appointment
 * 
 * @param {string} appointmentId - Appointment ID
 * @param {Object} prefillData - Data to prefill if creating new invoice
 * @returns {Promise<string>} Invoice ID
 */
export async function getOrCreateInvoiceForAppointment(appointmentId, prefillData = {}) {
  const currentUser = getCurrentUser();
  
  if (!db || !currentUser) {
    logger.error('Database or user not initialized');
    throw new Error('Please wait for authentication to complete');
  }

  logger.info('📋 Getting or creating invoice for appointment:', appointmentId);

  try {
    // STEP 1: Check if appointment already has invoiceId
    const aptRef = doc(db, 'appointments', appointmentId);
    const aptSnap = await getDoc(aptRef);
    
    if (!aptSnap.exists()) {
      throw new Error(`Appointment ${appointmentId} not found`);
    }
    
    const aptData = aptSnap.data();
    
    if (aptData.invoiceId) {
      logger.info('✅ Appointment already has invoice:', aptData.invoiceId);
      console.log('Found invoice:', aptData.invoiceId);
      
      // Verify invoice exists
      const invSnap = await getDoc(doc(db, 'invoices', aptData.invoiceId));
      if (invSnap.exists()) {
        logger.info('✅ Invoice verified:', aptData.invoiceId);
        return aptData.invoiceId;
      } else {
        logger.warn('⚠️ Appointment references non-existent invoice, will create new');
      }
    }
    
    // STEP 2: Query for any invoices with this appointmentId
    const invoicesQuery = query(
      collection(db, 'invoices'),
      where('appointmentId', '==', appointmentId)
    );
    
    const invoicesSnap = await getDocs(invoicesQuery);
    
    if (!invoicesSnap.empty) {
      const invoices = invoicesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const bestInvoice = pickBestInvoice(invoices, aptData.invoiceId || null);
      const invoiceId = bestInvoice?.id;
      
      logger.info('✅ Found existing invoice for appointment:', invoiceId);
      console.log('Found invoice:', invoiceId);
      
      // Update appointment to reference this invoice
      await updateDoc(aptRef, {
        invoiceId: invoiceId,
        updatedAt: serverTimestamp()
      });
      
      logger.info('✅ Updated appointment.invoiceId to:', invoiceId);
      
      // Clean up any duplicates
      await dedupeInvoicesForAppointment(appointmentId, invoiceId);
      
      return invoiceId;
    }
    
    // STEP 3: No invoice exists, create new one
    logger.info('📝 Creating new invoice for appointment:', appointmentId);
    
    const invoiceNumber = generateInvoiceNumber();

    // STEP 4: Read jobs/parts from new schema (name, qty, price)
    let jobs = [];
    let parts = [];
    
    // Try new schema first
    if (Array.isArray(aptData.jobs) && aptData.jobs.length > 0) {
      jobs = aptData.jobs.map(item => {
        const name = (item.name || item.description || '').trim();
        const qty = parseInt(item.qty, 10) || 1;
        const unitPrice = parseFloat(item.unitPrice ?? item.price ?? 0) || 0;
        const total = parseFloat(item.total) || (qty * unitPrice);
        return name ? { name, qty, unitPrice, total } : null;
      }).filter(Boolean);
      logger.info('✅ Loaded jobs from new schema:', jobs);
    }
    
    if (Array.isArray(aptData.parts) && aptData.parts.length > 0) {
      parts = aptData.parts.map(item => {
        const name = (item.name || item.description || '').trim();
        const qty = parseInt(item.qty, 10) || 1;
        const unitPrice = parseFloat(item.unitPrice ?? item.price ?? 0) || 0;
        const total = parseFloat(item.total) || (qty * unitPrice);
        return name ? { name, qty, unitPrice, total } : null;
      }).filter(Boolean);
      logger.info('✅ Loaded parts from new schema:', parts);
    }
    
    // Fallback to legacy schema
    if (jobs.length === 0 && parts.length === 0) {
      const legacyJobs = prefillData.services || aptData.services || [];
      const legacyParts = prefillData.parts || [];
      
      if (Array.isArray(legacyJobs) && legacyJobs.length > 0) {
        jobs = legacyJobs.map(item => {
          const name = (item.description || item.name || '').trim();
          const qty = parseInt(item.qty, 10) || 1;
          const unitPrice = parseFloat(item.unitPrice || item.price) || 0;
          const total = qty * unitPrice;
          return name ? { name, qty, unitPrice, total } : null;
        }).filter(Boolean);
      }
      
      if (Array.isArray(legacyParts) && legacyParts.length > 0) {
        parts = legacyParts.map(item => {
          const name = (item.description || item.name || '').trim();
          const qty = parseInt(item.qty, 10) || 1;
          const unitPrice = parseFloat(item.unitPrice || item.price) || 0;
          const total = qty * unitPrice;
          return name ? { name, qty, unitPrice, total } : null;
        }).filter(Boolean);
      }
      
      logger.info('✅ Loaded from legacy schema - Jobs:', jobs.length, 'Parts:', parts.length);
    }
    
    // Calculate totals from new schema
    const labourTotal = sumLineItems(jobs);
    const partsTotal = sumLineItems(parts);
    const subtotal = labourTotal + partsTotal;
    const paidAmount = toNumber(aptData.paidAmount || 0);
    const balanceDue = Math.max(0, subtotal - paidAmount);
    const paymentStatus = (paidAmount > 0 && paidAmount >= subtotal) ? 'PAID' : 'UNPAID';
    
    const invoicePayload = {
      invoiceNumber: invoiceNumber,
      status: 'draft',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: currentUser.uid,
      
      // Link to appointment
      appointmentId: appointmentId,
      
      // Customer info from prefill or appointment
      customerName: prefillData.customerName || aptData.customerName || '',
      phone: prefillData.customerPhone || aptData.customerPhone || '',
      address: prefillData.address || aptData.address || '',
      
      // Vehicle info
      vehicleMakeModel: prefillData.makeModel || aptData.makeModel || '',
      regPlate: prefillData.registrationPlate || aptData.regNumber || '',
      mileage: prefillData.mileage || aptData.mileage || '',
      
      // STEP 4: Store jobs/parts in new schema
      jobs,
      parts,
      
      // Totals from new schema
      totals: {
        labour: labourTotal,
        parts: partsTotal,
        subtotal,
        total: subtotal
      },
      
      // Payment
      paidAmount,
      balanceDue,
      paymentStatus,
      
      // Notes
      notes: prefillData.notes || prefillData.problemDescription || aptData.notes || aptData.problemDescription || '',
      jobsSummary: prefillData.jobsSummary || aptData.jobsSummary || ''
    };
    
    logger.info('📝 Creating invoice with payload:', invoicePayload);
    
    const invoiceRef = await addDoc(collection(db, 'invoices'), invoicePayload);
    const invoiceId = invoiceRef.id;
    
    logger.info('✅ Invoice created:', invoiceId, 'Number:', invoiceNumber);
    
    // Update appointment with invoice ID
    await updateDoc(aptRef, {
      invoiceId: invoiceId,
      invoiceNumber: invoiceNumber,
      updatedAt: serverTimestamp()
    });
    
    logger.info('✅ Updated appointment with invoiceId');
    
    return invoiceId;
    
  } catch (error) {
    logger.error('❌ Error in getOrCreateInvoiceForAppointment:', error);
    throw error;
  }
}

/**
 * Deduplicate invoices for an appointment
 * Keeps the primary invoice, archives and deletes duplicates
 * 
 * @param {string} appointmentId - Appointment ID
 * @param {string} keepInvoiceId - Invoice ID to keep (optional)
 */
export async function dedupeInvoicesForAppointment(appointmentId, keepInvoiceId = null) {
  logger.info('🧹 Deduplicating invoices for appointment:', appointmentId);
  
  try {
    // Query all invoices for this appointment
    const invoicesQuery = query(
      collection(db, 'invoices'),
      where('appointmentId', '==', appointmentId),
      orderBy('createdAt', 'desc')
    );
    
    const invoicesSnap = await getDocs(invoicesQuery);
    
    if (invoicesSnap.size <= 1) {
      logger.info('✅ No duplicates found');
      return;
    }
    
    logger.warn(`⚠️ Found ${invoicesSnap.size} invoices for appointment, expected 1`);
    
    const invoices = invoicesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // Determine which invoice to keep
    const primaryInvoice = pickBestInvoice(invoices, keepInvoiceId);
    
    if (!primaryInvoice) {
      logger.warn('⚠️ No invoice selected to keep, aborting dedupe');
      return;
    }

    logger.info('✅ Keeping invoice:', primaryInvoice.id);

    // Ensure appointment links to the primary invoice
    try {
      await updateDoc(doc(db, 'appointments', appointmentId), {
        invoiceId: primaryInvoice.id,
        updatedAt: serverTimestamp()
      });
    } catch (linkError) {
      logger.warn('⚠️ Could not update appointment invoiceId during dedupe:', linkError);
    }
    
    // Archive and delete duplicates
    for (const invoice of invoices) {
      if (invoice.id === primaryInvoice.id) continue;
      
      logger.info('🗑️ Archiving duplicate invoice:', invoice.id);
      
      try {
        // Archive to invoices_archive collection
        await addDoc(collection(db, 'invoices_archive'), {
          ...invoice,
          deletedAt: serverTimestamp(),
          deletedReason: 'Duplicate invoice for appointment',
          originalId: invoice.id
        });
        
        // Delete from invoices collection
        await deleteDoc(doc(db, 'invoices', invoice.id));
        
        logger.info('✅ Archived and deleted:', invoice.id);
      } catch (deleteError) {
        logger.error('❌ Error deleting duplicate invoice:', invoice.id, deleteError);
      }
    }
    
    logger.info('✅ Deduplication complete');
    
  } catch (error) {
    logger.error('❌ Error in dedupeInvoicesForAppointment:', error);
  }
}

/**
 * Cleanup duplicates across all appointments
 */
export async function cleanupInvoiceDuplicatesAcrossAppointments() {
  const currentUser = getCurrentUser();
  if (!db || !currentUser) {
    throw new Error('Please wait for authentication to complete');
  }

  logger.info('🧹 Starting global invoice dedupe...');

  const appointmentIds = new Set();

  // Collect appointment IDs
  const appointmentsSnap = await getDocs(collection(db, 'appointments'));
  appointmentsSnap.forEach(docSnap => appointmentIds.add(docSnap.id));

  // Collect appointment IDs from invoices (in case appointments missing invoiceId)
  const invoicesSnap = await getDocs(collection(db, 'invoices'));
  invoicesSnap.forEach(docSnap => {
    const data = docSnap.data();
    if (data?.appointmentId) appointmentIds.add(data.appointmentId);
  });

  logger.info('🧹 Deduping invoices for appointment count:', appointmentIds.size);

  for (const appointmentId of appointmentIds) {
    await dedupeInvoicesForAppointment(appointmentId);
  }

  logger.info('✅ Global invoice dedupe complete');
}

/**
 * Open invoice (gets or creates if needed)
 * Use this for all "open invoice" actions
 * 
 * @param {string} appointmentId - Appointment ID (optional)
 * @param {string} directInvoiceId - Direct invoice ID (optional)
 * @param {string} mode - 'view' or 'edit'
 */
export async function openInvoice(appointmentId = null, directInvoiceId = null, mode = 'view') {
  logger.info('📂 Opening invoice...', { appointmentId, directInvoiceId, mode });
  if (appointmentId) {
    console.log('Opening invoice for appointment:', appointmentId);
  }
  
  try {
    let invoiceId = directInvoiceId;
    
    // If we have appointmentId but no directInvoiceId, get or create invoice
    if (appointmentId && !invoiceId) {
      invoiceId = await getOrCreateInvoiceForAppointment(appointmentId);
    }
    
    if (!invoiceId) {
      throw new Error('No invoice ID available');
    }
    
    // Open invoice in new tab or same tab
    const url = `invoice.html?invoiceId=${invoiceId}&mode=${mode}`;
    window.open(url, '_blank');
    
  } catch (error) {
    logger.error('❌ Error opening invoice:', error);
    showToast('Failed to open invoice: ' + error.message, 'error');
  }
}
