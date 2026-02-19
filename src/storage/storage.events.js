/**
 * Invoices Storage Events Module
 * Handles user interactions with invoice storage
 */

import { db, checkIsAdmin } from '../firebase/firebase.js';
import { doc, deleteDoc, getDoc, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { createLogger } from '../shared/logger.js';
import { showToast, confirm } from '../shared/ui.js';
import { refreshInvoices } from './storage.service.js';
import { filterInvoices } from './storage.ui.js';
import { cleanupInvoiceDuplicatesAcrossAppointments, dedupeInvoicesForAppointment, getOrCreateInvoiceForAppointment } from '../invoices/invoice-manager.js';

const logger = createLogger('StorageEvents');
let searchFilterListenersBound = false;

function toNumber(value) {
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function generateInvoiceNumber() {
  const now = new Date();
  const dateStr = now.toISOString().slice(2, 8).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `INV-${random}-${dateStr}`;
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

function getStoreInvoicesMap() {
  if (typeof window === 'undefined') return null;
  const store = window.Store || window._dataLayer?.store || null;
  if (!store || !(store.invoicesById instanceof Map)) return null;
  return store.invoicesById;
}

export function getInvoiceAppointmentId(invoice) {
  return invoice?.appointmentId || invoice?.aptId || invoice?.appointmentRef || invoice?.meta?.appointmentId || null;
}

export function getInvoiceById(id) {
  const storeInvoices = getStoreInvoicesMap();
  if (storeInvoices?.get) {
    return storeInvoices.get(id) || null;
  }
  const allInvoices = Array.isArray(window.allInvoices) ? window.allInvoices : [];
  return allInvoices.find(inv => inv.id === id) || null;
}

function isInvoicePaid(invoice) {
  if (invoice?.paymentStatus) return String(invoice.paymentStatus).toLowerCase() === 'paid';
  if (typeof invoice?.paid === 'boolean') return invoice.paid;
  if (typeof invoice?.balanceDue === 'number') return invoice.balanceDue <= 0;
  return false;
}

/**
 * Open invoice in editor
 * @param {string} invoiceId - Invoice ID
 */
export function openInvoiceFile(invoiceId) {
  const invoice = getInvoiceById(invoiceId);

  if (!invoice) {
    logger.warn('Invoice not found in state, opening directly:', invoiceId);
    window.open(`invoice.html?invoiceId=${invoiceId}&mode=view`, '_blank');
    return;
  }

  const appointmentId = getInvoiceAppointmentId(invoice);

  if (!appointmentId) {
    logger.info('Opening invoice without appointmentId:', invoiceId);
    window.open(`invoice.html?invoiceId=${invoiceId}&mode=view`, '_blank');
    return;
  }

  logger.info('Opening invoice via appointment link:', { invoiceId, appointmentId });

  (async () => {
    try {
      const aptSnap = await getDoc(doc(db, 'appointments', appointmentId));
      const aptData = aptSnap.exists() ? aptSnap.data() : null;
      const canonicalInvoiceId = aptData?.invoiceId || invoiceId;

      if (canonicalInvoiceId !== invoiceId) {
        logger.warn('Detected non-canonical invoice, redirecting to canonical:', {
          clicked: invoiceId,
          canonical: canonicalInvoiceId
        });

        await dedupeInvoicesForAppointment(appointmentId, canonicalInvoiceId);
      }

      window.open(`invoice.html?invoiceId=${canonicalInvoiceId}&mode=view`, '_blank');
    } catch (error) {
      logger.error('Error resolving canonical invoice, opening clicked invoice:', error);
      window.open(`invoice.html?invoiceId=${invoiceId}&mode=view`, '_blank');
    }
  })();
}

/**
 * Delete invoice with confirmation
 * @param {string} invoiceId - Invoice ID
 */
export async function deleteInvoiceConfirm(invoiceId) {
  const invoice = getInvoiceById(invoiceId);
  
  if (!invoice) {
    logger.warn('Invoice not found:', invoiceId);
    return;
  }
  
  const invoiceNumber = invoice.invoiceNumber || invoiceId;
  const customerName = invoice.customerName || 'Unknown';
  
  const confirmed = confirm(`Delete invoice ${invoiceNumber} for ${customerName}?\n\nThis cannot be undone.`);
  
  if (!confirmed) {
    return;
  }
  
  try {
    await deleteDoc(doc(db, 'invoices', invoiceId));
    logger.info('✅ Invoice deleted:', invoiceId);
    showToast('Invoice deleted successfully', 'success');
  } catch (error) {
    logger.error('Error deleting invoice:', error);
    showToast('Failed to delete invoice: ' + error.message, 'error');
  }
}

/**
 * Handle refresh invoices button click
 */
export function handleRefreshInvoicesClick(callback) {
  logger.info('Manual refresh requested');
  const storeInvoices = getStoreInvoicesMap();
  if (storeInvoices?.size >= 0) {
    callback?.();
    return;
  }
  refreshInvoices(callback);
}

/**
 * Cleanup duplicate invoices (admin only)
 */
export async function handleCleanupDuplicatesClick() {
  if (!checkIsAdmin()) {
    showToast('Only admins can run cleanup', 'warning');
    return;
  }

  const confirmed = confirm('Cleanup duplicate invoices across all appointments?\n\nThis will archive and delete duplicates.');
  if (!confirmed) return;

  try {
    showToast('Running invoice dedupe...', 'info');
    await cleanupInvoiceDuplicatesAcrossAppointments();
    showToast('Invoice dedupe complete', 'success');
  } catch (error) {
    logger.error('Cleanup failed:', error);
    showToast('Invoice dedupe failed: ' + error.message, 'error');
  }
}

export async function rebuildInvoiceFromAppointment(appointmentId, invoiceId = null) {
  if (!appointmentId) return;

  try {
    const aptSnap = await getDoc(doc(db, 'appointments', appointmentId));
    if (!aptSnap.exists()) {
      showToast('Appointment not found', 'error');
      return;
    }

    const apt = aptSnap.data();
    let jobs = Array.isArray(apt.jobs) ? apt.jobs : [];
    let parts = Array.isArray(apt.parts) ? apt.parts : [];
    if (jobs.length === 0 && Array.isArray(apt.services)) {
      jobs = apt.services;
    }
    if (parts.length === 0 && Array.isArray(apt.parts)) {
      parts = apt.parts;
    }
    if (jobs.length === 0 && parts.length === 0 && Array.isArray(apt.jobs)) {
      jobs = apt.jobs.filter(item => item?.type === 'labour');
      parts = apt.jobs.filter(item => item?.type === 'part');
    }

    const normalizeItems = (items) => (Array.isArray(items) ? items : []).map(item => {
      const name = (item.name || item.description || '').trim();
      const qty = parseInt(item.qty, 10) || 1;
      const unitPrice = parseFloat(item.unitPrice ?? item.price ?? 0) || 0;
      const total = parseFloat(item.total) || (qty * unitPrice);
      return name ? { name, qty, unitPrice, total } : null;
    }).filter(Boolean);

    const normalizedJobs = normalizeItems(jobs);
    const normalizedParts = normalizeItems(parts);

    const labourTotal = sumLineItems(normalizedJobs);
    const partsTotal = sumLineItems(normalizedParts);
    const subtotal = labourTotal + partsTotal;
    const paidAmount = toNumber(apt.paidAmount || 0);
    const balanceDue = Math.max(0, subtotal - paidAmount);
    const paymentStatus = (paidAmount > 0 && paidAmount >= subtotal) ? 'PAID' : 'UNPAID';

    const payload = {
      invoiceNumber: apt.invoiceNumber || generateInvoiceNumber(),
      status: 'draft',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      appointmentId: appointmentId,
      customerName: apt.customerName || apt.clientName || '',
      phone: apt.customerPhone || apt.phone || '',
      address: apt.address || '',
      vehicleMakeModel: apt.vehicleMakeModel || apt.makeModel || '',
      regPlate: apt.registrationPlate || apt.regNumber || '',
      mileage: apt.mileage || '',
      jobs: normalizedJobs,
      parts: normalizedParts,
      totals: {
        labour: labourTotal,
        parts: partsTotal,
        subtotal,
        total: subtotal
      },
      paidAmount,
      balanceDue,
      paymentStatus,
      notes: apt.notes || '',
      jobsSummary: apt.jobsSummary || apt.problemDescription || ''
    };

    let targetId = invoiceId || apt.invoiceId || null;
    if (targetId && String(targetId).startsWith('missing-')) {
      targetId = null;
    }

    if (!targetId) {
      targetId = await getOrCreateInvoiceForAppointment(appointmentId, apt);
    }

    await setDoc(doc(db, 'invoices', targetId), payload, { merge: true });
    showToast('Invoice rebuilt successfully', 'success');

    await refreshInvoices(filterInvoices);
  } catch (error) {
    logger.error('Rebuild failed:', error);
    showToast('Failed to rebuild invoice: ' + error.message, 'error');
  }
}

/**
 * Setup search and filter event listeners
 */
export function setupSearchAndFilterListeners() {
  if (searchFilterListenersBound) {
    logger.info('Search and filter listeners already attached');
    return;
  }

  const searchInput = document.getElementById('searchInvoices');
  const paymentFilter = document.getElementById('filterInvoicePayment');
  
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      logger.debug('Search input changed');
      filterInvoices();
    });
  }
  
  if (paymentFilter) {
    paymentFilter.addEventListener('change', () => {
      logger.debug('Payment filter changed');
      filterInvoices();
    });
  }
  
  searchFilterListenersBound = true;
  logger.info('Search and filter listeners attached');
}

/**
 * Handle payment status toggle from storage invoice card
 * Delegates to main toggleAppointmentPaidStatus function
 */
function toggleInvoicePaidStatus(invoiceId, appointmentId) {
  (async () => {
    try {
      const invoice = getInvoiceById(invoiceId);
      if (!invoice) {
        const hasStore = !!getStoreInvoicesMap();
        logger.warn('Invoice not found for toggle', { invoiceId, hasStore, allInvoicesLength: Array.isArray(window.allInvoices) ? window.allInvoices.length : 0 });
        showToast('Invoice not found', 'warning');
        return;
      }

      const total = toNumber(invoice.total || invoice.totals?.total || sumLineItems(invoice.jobs) + sumLineItems(invoice.parts));
      const nextPaid = !isInvoicePaid(invoice);
      const newPaidAmount = nextPaid ? total : 0;
      const newBalance = Math.max(0, total - newPaidAmount);
      const nextStatus = nextPaid ? 'paid' : 'unpaid';

      const invoiceUpdate = {
        paymentStatus: nextStatus,
        amountPaid: newPaidAmount,
        paidAmount: newPaidAmount,
        balanceDue: newBalance,
        paid: nextPaid,
        updatedAt: serverTimestamp()
      };

      if (!invoice.createdAt) {
        invoiceUpdate.createdAt = serverTimestamp();
      }

      if (nextPaid) {
        invoiceUpdate.paidAt = serverTimestamp();
      } else {
        invoiceUpdate.paidAt = null;
      }

      await updateDoc(doc(db, 'invoices', invoiceId), invoiceUpdate);

      const linkedAppointmentId = appointmentId || getInvoiceAppointmentId(invoice);
      if (linkedAppointmentId) {
        await updateDoc(doc(db, 'appointments', linkedAppointmentId), {
          paymentStatus: nextStatus,
          amountPaid: newPaidAmount,
          paidAmount: newPaidAmount,
          balanceDue: newBalance,
          updatedAt: serverTimestamp()
        });
      }

      showToast(nextPaid ? 'Invoice marked as paid' : 'Invoice marked as unpaid', 'success');
    } catch (error) {
      logger.error('Failed to toggle invoice payment status:', error);
      showToast('Failed to update payment status: ' + error.message, 'error');
    }
  })();
}

// Expose to global scope for onclick handlers
if (typeof window !== 'undefined') {
  window.openInvoiceFile = openInvoiceFile;
  window.deleteInvoiceConfirm = deleteInvoiceConfirm;
  window.rebuildInvoiceFromAppointment = rebuildInvoiceFromAppointment;
  window.toggleInvoicePaidStatus = toggleInvoicePaidStatus;
}
