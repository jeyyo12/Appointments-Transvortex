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
 * Generate unique invoice number — canonical single source of truth.
 * Format: INV-{RANDOM}-{YYMMDD}
 * Export so all modules import this instead of defining their own.
 */
export function generateInvoiceNumber() {
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

function normalizeAppointmentLegalProfile(prefillData = {}, aptData = {}) {
  const fromPrefill = prefillData?.invoiceLegalProfile;
  const fromAppointment = aptData?.invoiceLegalProfile;
  const candidate = fromPrefill?.type === 'ro_company' ? fromPrefill : fromAppointment;
  return candidate?.type === 'ro_company' ? candidate : null;
}

function normalizeAppointmentEUCompanyProfile(prefillData = {}, aptData = {}) {
  const fromPrefill = prefillData?.invoiceLegalProfile;
  const fromAppointment = aptData?.invoiceLegalProfile;
  const candidate = fromPrefill?.type === 'eu_company' ? fromPrefill : fromAppointment;
  return candidate?.type === 'eu_company' ? candidate : null;
}

function buildReverseChargeNote(profile) {
  if (profile?.vat?.reverseCharge !== true) return '';
  const vatNumber = (profile?.buyer?.vatNumber || '').toString().trim();
  if (vatNumber) {
    return `VAT reverse charged to customer (B2B EU). Customer VAT number: ${vatNumber}`;
  }
  return 'VAT reverse charged to customer (B2B EU).';
}

function appendNoteOnce(baseText = '', extraLine = '') {
  const extra = (extraLine || '').toString().trim();
  if (!extra) return (baseText || '').toString().trim();

  const base = (baseText || '').toString().trim();
  if (base.includes(extra)) return base;
  return base ? `${base}\n${extra}` : extra;
}

function normalizeInvoiceTemplateType(prefillData = {}) {
  return prefillData?.templateType === 'mechanic' ? 'mechanic' : 'standard';
}

function buildMechanicDetails(prefillData = {}, aptData = {}) {
  const complaint = (prefillData?.mechanicDetails?.complaint || aptData?.notes || '').toString().trim();
  const diagnosis = (prefillData?.mechanicDetails?.diagnosis || '').toString().trim();
  const workPerformed = (prefillData?.mechanicDetails?.workPerformed || '').toString().trim();
  const recommendations = (prefillData?.mechanicDetails?.recommendations || '').toString().trim();

  const vin = (
    prefillData?.mechanicDetails?.vehicle?.vin ||
    prefillData?.vin ||
    aptData?.vin ||
    aptData?.vehicle?.vin ||
    ''
  ).toString().trim();

  const mileageValue =
    prefillData?.mechanicDetails?.vehicle?.mileage ??
    prefillData?.mileage ??
    aptData?.mileage ??
    aptData?.vehicle?.mileage ??
    '';
  const mileage = mileageValue === null || mileageValue === undefined ? '' : String(mileageValue).trim();

  const warrantyText = (prefillData?.mechanicDetails?.terms?.warrantyText || '').toString().trim();
  const disclaimerText = (prefillData?.mechanicDetails?.terms?.disclaimerText || '').toString().trim();

  const vehicle = {};
  if (vin) vehicle.vin = vin;
  if (mileage) vehicle.mileage = mileage;

  const terms = {};
  if (warrantyText) terms.warrantyText = warrantyText;
  if (disclaimerText) terms.disclaimerText = disclaimerText;

  const details = {};
  if (complaint) details.complaint = complaint;
  if (diagnosis) details.diagnosis = diagnosis;
  if (workPerformed) details.workPerformed = workPerformed;
  if (recommendations) details.recommendations = recommendations;
  if (Object.keys(vehicle).length > 0) details.vehicle = vehicle;
  if (Object.keys(terms).length > 0) details.terms = terms;

  return Object.keys(details).length > 0 ? details : null;
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
    const appointmentLegalProfile = normalizeAppointmentLegalProfile(prefillData, aptData);
    const appointmentEUProfile = normalizeAppointmentEUCompanyProfile(prefillData, aptData);
    const templateType = normalizeInvoiceTemplateType(prefillData);
    const mechanicDetails = templateType === 'mechanic'
      ? buildMechanicDetails(prefillData, aptData)
      : null;

    const euBuyer = appointmentEUProfile?.buyer || {};
    const euVehicleReg = (appointmentEUProfile?.vehicle?.reg || '').toString().trim();
    const euWorkSummary = (appointmentEUProfile?.work?.summary || '').toString().trim();
    const reverseChargeNote = buildReverseChargeNote(appointmentEUProfile);
    const baseNotes = prefillData.notes || prefillData.problemDescription || aptData.notes || aptData.problemDescription || '';
    const mergedNotes = appendNoteOnce(baseNotes, reverseChargeNote);
    const baseJobsSummary = prefillData.jobsSummary || aptData.jobsSummary || '';
    const mergedJobsSummary = baseJobsSummary || euWorkSummary || '';
    const baseCustomerName = prefillData.customerName || aptData.customerName || '';
    const basePhone = prefillData.customerPhone || aptData.customerPhone || '';
    const baseAddress = prefillData.address || aptData.address || '';
    const baseEmail = prefillData.customerEmail || prefillData.email || aptData.customerEmail || aptData.email || '';
    const canonicalVehicle = {
      regPlate: (
        prefillData?.vehicle?.regPlate ||
        prefillData?.registrationPlate ||
        prefillData?.regPlate ||
        aptData?.vehicle?.regPlate ||
        aptData?.registrationPlate ||
        aptData?.regNumber ||
        aptData?.regPlate ||
        euVehicleReg ||
        ''
      ).toString().trim(),
      makeModel: (
        prefillData?.vehicle?.makeModel ||
        prefillData?.vehicleMakeModel ||
        prefillData?.makeModel ||
        aptData?.vehicle?.makeModel ||
        aptData?.vehicleMakeModel ||
        aptData?.makeModel ||
        aptData?.carMakeModel ||
        ''
      ).toString().trim(),
      mileage: prefillData?.vehicle?.mileage ?? prefillData?.mileage ?? aptData?.vehicle?.mileage ?? aptData?.mileage ?? '',
      motStatus: (prefillData?.vehicle?.motStatus || aptData?.vehicle?.motStatus || '').toString().trim(),
      motExpiry: (prefillData?.vehicle?.motExpiry || aptData?.vehicle?.motExpiry || '').toString().trim(),
      taxStatus: (prefillData?.vehicle?.taxStatus || aptData?.vehicle?.taxStatus || '').toString().trim(),
      dvsaVerified: Boolean(prefillData?.vehicle?.dvsaVerified ?? aptData?.vehicle?.dvsaVerified),
      dvsaCheckedAt: prefillData?.vehicle?.dvsaCheckedAt || aptData?.vehicle?.dvsaCheckedAt || null
    };
    
    const invoicePayload = {
      invoiceNumber: invoiceNumber,
      status: 'draft',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: currentUser.uid,
      
      // Link to appointment
      appointmentId: appointmentId,
      
      // Customer info from prefill or appointment
      customerName: baseCustomerName || euBuyer.companyName || '',
      phone: basePhone || euBuyer.phone || '',
      address: baseAddress || euBuyer.address || '',
      postcode: prefillData.postcode || aptData.postcode || '',
      serviceLocation: prefillData.serviceLocation || aptData.serviceLocation || '',
      contactPref: prefillData.contactPref || aptData.contactPref || '',
      ...(baseEmail || euBuyer.email ? { customerEmail: baseEmail || euBuyer.email } : {}),
      
      // Vehicle info
      vehicle: canonicalVehicle,
      vehicleMakeModel: canonicalVehicle.makeModel || '',
      regPlate: canonicalVehicle.regPlate || '',
      vehicleReg: canonicalVehicle.regPlate || '',
      mileage: canonicalVehicle.mileage,
      
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
      notes: mergedNotes,
      jobsSummary: mergedJobsSummary,

      ...(appointmentLegalProfile ? { legalProfile: appointmentLegalProfile } : {}),
      ...(templateType === 'mechanic' ? { templateType: 'mechanic' } : {}),
      ...(templateType === 'mechanic' && mechanicDetails ? { mechanicDetails } : {})
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
 * @param {Set} validAppointmentIds - Cache of valid appointment IDs to skip orphaned invoices (optional)
 */
export async function dedupeInvoicesForAppointment(appointmentId, keepInvoiceId = null, validAppointmentIds = null) {
  logger.info('🧹 Deduplicating invoices for appointment:', appointmentId);
  
  try {
    // SKIP: If appointment doesn't exist and we have validation info
    if (validAppointmentIds && !validAppointmentIds.has(appointmentId)) {
      logger.warn(`⏭️ Skipping dedupe - appointment ${appointmentId} not found (orphaned invoice). Use cleanup-orphans feature to handle.`);
      return;
    }
    
    // Query all invoices for this appointment
    const invoicesQuery = query(
      collection(db, 'invoices'),
      where('appointmentId', '==', appointmentId),
      orderBy('createdAt', 'desc')
    );
    
    let invoicesSnap;
    try {
      invoicesSnap = await getDocs(invoicesQuery);
    } catch (queryError) {
      // Handle missing composite index gracefully
      if (queryError.code === 'failed-precondition' || queryError.message?.includes('requires an index')) {
        logger.warn('⚠️ Missing composite index for invoices(appointmentId, createdAt). Skipping dedupe.');
        logger.info('📍 Create index here: https://console.firebase.google.com/project/' + (db?.app?.options?.projectId || 'YOUR_PROJECT') + '/firestore/indexes?create_composite=...');
        return; // Gracefully skip dedupe without crashing
      }
      throw queryError; // Re-throw other errors
    }
    
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
 * Skips orphaned invoices (appointments that no longer exist)
 */
export async function cleanupInvoiceDuplicatesAcrossAppointments() {
  const currentUser = getCurrentUser();
  if (!db || !currentUser) {
    throw new Error('Please wait for authentication to complete');
  }

  logger.info('🧹 Starting global invoice dedupe...');

  try {
    // STEP 1: Collect all actual appointment IDs from appointments collection
    const appointmentsSnap = await getDocs(collection(db, 'appointments'));
    const validAppointmentIds = new Set();
    appointmentsSnap.forEach(docSnap => validAppointmentIds.add(docSnap.id));
    logger.info('✅ Found', validAppointmentIds.size, 'active appointments');

    // STEP 2: Scan invoices and detect orphaned ones
    const invoicesSnap = await getDocs(collection(db, 'invoices'));
    const orphanedInvoices = [];

    invoicesSnap.forEach(docSnap => {
      const data = docSnap.data();
      const aptId = data?.appointmentId;
      
      if (aptId && !validAppointmentIds.has(aptId)) {
        logger.warn('⚠️ Orphan invoice detected:', docSnap.id, '-> appointment', aptId, 'not found');
        orphanedInvoices.push({ invoiceId: docSnap.id, appointmentId: aptId });
      }
    });

    if (orphanedInvoices.length > 0) {
      logger.warn(`📋 Found ${orphanedInvoices.length} orphaned invoices (appointments missing)`);
      logger.info('💡 Tip: Call cleanupOrphanedInvoices() to remove them, or manage manually via Firestore console');
    }

    // STEP 3: Dedupe only valid appointments (skip orphans)
    logger.info('🧹 Deduping invoices for', validAppointmentIds.size, 'valid appointments (ignoring', orphanedInvoices.length, 'orphaned)...');

    for (const appointmentId of validAppointmentIds) {
      await dedupeInvoicesForAppointment(appointmentId, null, validAppointmentIds);
    }

    logger.info('✅ Global invoice dedupe complete');

  } catch (error) {
    logger.error('❌ Error in cleanupInvoiceDuplicatesAcrossAppointments:', error);
    throw error;
  }
}

/**
 * Cleanup orphaned invoices (invoices whose appointments no longer exist)
 * Optional feature for administrators
 * 
 * @returns {Promise<Object>} { orphanedCount, archivedCount }
 */
export async function cleanupOrphanedInvoices() {
  const currentUser = getCurrentUser();
  if (!db || !currentUser) {
    throw new Error('Please wait for authentication to complete');
  }

  logger.info('🧹 Starting orphaned invoice cleanup...');

  try {
    // Collect valid appointment IDs
    const appointmentsSnap = await getDocs(collection(db, 'appointments'));
    const validAppointmentIds = new Set(
      appointmentsSnap.docs.map(d => d.id)
    );

    logger.info('✅ Found', validAppointmentIds.size, 'valid appointments');

    // Find and delete orphaned invoices
    const invoicesSnap = await getDocs(collection(db, 'invoices'));
    const orphaned = [];

    invoicesSnap.forEach(docSnap => {
      const data = docSnap.data();
      const aptId = data?.appointmentId;
      if (aptId && !validAppointmentIds.has(aptId)) {
        orphaned.push({ id: docSnap.id, data });
      }
    });

    logger.info('🗑️ Found', orphaned.length, 'orphaned invoices to remove');

    let archivedCount = 0;
    for (const item of orphaned) {
      try {
        // Archive to invoices_archive first
        await addDoc(collection(db, 'invoices_archive'), {
          ...item.data,
          deletedAt: serverTimestamp(),
          deletedReason: 'Orphaned invoice - appointment no longer exists',
          originalId: item.id
        });
        
        // Delete from invoices
        await deleteDoc(doc(db, 'invoices', item.id));
        archivedCount++;
        logger.info('✅ Archived and deleted orphaned invoice:', item.id);
      } catch (delError) {
        logger.error('❌ Error deleting orphaned invoice:', item.id, delError);
      }
    }

    logger.info('✅ Orphaned invoice cleanup complete. Archived:', archivedCount, '/', orphaned.length);
    return { orphanedCount: orphaned.length, archivedCount };
    
  } catch (error) {
    logger.error('❌ Error in cleanupOrphanedInvoices:', error);
    throw error;
  }
}

/**
 * Open invoice (gets or creates if needed)
 * Use this for all "open invoice" actions
 * 
 * @param {string} appointmentId - Appointment ID (optional)
 * @param {string} directInvoiceId - Direct invoice ID (optional)
 * @param {string} mode - 'view' or 'edit'
 */
/**
 * Canonical URL navigator for invoice.html.
 * All code that opens invoice.html MUST go through this function.
 * Contract: invoice.html?invoiceId=<firestoreDocId>&mode=<view|edit>
 *
 * @param {string} invoiceId - Firestore invoice document id (required)
 * @param {string} [mode='view'] - 'view' or 'edit'
 */
export function openInvoicePage(invoiceId, mode = 'view') {
  if (!invoiceId) {
    logger.error('openInvoicePage: invoiceId is required');
    return;
  }
  window.open(`invoice.html?invoiceId=${invoiceId}&mode=${mode}`, '_blank');
}

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
