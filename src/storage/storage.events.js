/**
 * Invoices Storage Events Module
 * Handles user interactions with invoice storage
 */

import { db, checkIsAdmin } from '../firebase/firebase.js';
import { doc, deleteDoc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, limit, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { createLogger } from '../shared/logger.js';
import { showToast, confirm } from '../shared/ui.js';
import { refreshInvoices } from './storage.service.js';
import { filterInvoices, setActivePaymentFilter, toggleActivePaymentFilter } from './storage.ui.js';
import { cleanupInvoiceDuplicatesAcrossAppointments, dedupeInvoicesForAppointment, getOrCreateInvoiceForAppointment, generateInvoiceNumber } from '../invoices/invoice-manager.js';

const logger = createLogger('StorageEvents');
let searchFilterListenersBound = false;

// generateInvoiceNumber is imported from the canonical source: src/invoices/invoice-manager.js

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

async function resolveInvoiceContext(invoiceId, appointmentId = null) {
  let resolvedInvoice = getInvoiceById(invoiceId);
  let resolvedAppointmentId = appointmentId || getInvoiceAppointmentId(resolvedInvoice);
  let resolvedInvoiceId = resolvedInvoice?.id || invoiceId;

  if (!resolvedAppointmentId && String(invoiceId || '').startsWith('missing-')) {
    resolvedAppointmentId = String(invoiceId).replace(/^missing-/, '').trim() || null;
  }

  if (!resolvedAppointmentId && invoiceId) {
    try {
      const byInvoiceId = await getDocs(query(collection(db, 'appointments'), where('invoiceId', '==', invoiceId), limit(1)));
      const linked = byInvoiceId.docs[0];
      if (linked) {
        resolvedAppointmentId = linked.id;
      }
    } catch (error) {
      logger.warn('Could not resolve appointment by invoiceId query:', error);
    }
  }

  if (resolvedAppointmentId) {
    try {
      const aptSnap = await getDoc(doc(db, 'appointments', resolvedAppointmentId));
      if (aptSnap.exists()) {
        const aptData = aptSnap.data() || {};
        const canonicalInvoiceId = String(aptData.invoiceId || '').trim();
        if (canonicalInvoiceId) {
          resolvedInvoiceId = canonicalInvoiceId;
          if (!resolvedInvoice || resolvedInvoice.id !== canonicalInvoiceId) {
            const canonicalSnap = await getDoc(doc(db, 'invoices', canonicalInvoiceId));
            if (canonicalSnap.exists()) {
              resolvedInvoice = { id: canonicalSnap.id, ...canonicalSnap.data() };
            }
          }
        }
      }
    } catch (error) {
      logger.warn('Could not resolve canonical invoice from appointment:', error);
    }
  }

  if (!resolvedInvoice && resolvedInvoiceId && resolvedInvoiceId !== invoiceId) {
    try {
      const fallbackSnap = await getDoc(doc(db, 'invoices', resolvedInvoiceId));
      if (fallbackSnap.exists()) {
        resolvedInvoice = { id: fallbackSnap.id, ...fallbackSnap.data() };
      }
    } catch (error) {
      logger.warn('Could not fetch resolved invoice by ID:', error);
    }
  }

  return {
    invoice: resolvedInvoice,
    invoiceId: resolvedInvoice?.id || resolvedInvoiceId || invoiceId,
    appointmentId: resolvedAppointmentId || getInvoiceAppointmentId(resolvedInvoice) || null
  };
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
export async function openInvoiceFile(invoiceId, appointmentId = null) {
  const resolved = await resolveInvoiceContext(invoiceId, appointmentId);
  const invoice = resolved.invoice;
  const targetInvoiceId = resolved.invoiceId || invoiceId;

  if (!invoice) {
    logger.warn('Invoice not found in state, opening resolved ID directly:', targetInvoiceId);
    window.open(`invoice.html?invoiceId=${targetInvoiceId}&mode=view`, '_blank');
    return;
  }

  const resolvedAppointmentId = resolved.appointmentId || getInvoiceAppointmentId(invoice);

  if (!resolvedAppointmentId) {
    logger.info('Opening invoice without appointmentId:', targetInvoiceId);
    window.open(`invoice.html?invoiceId=${targetInvoiceId}&mode=view`, '_blank');
    return;
  }

  logger.info('Opening invoice via appointment link:', { invoiceId: targetInvoiceId, appointmentId: resolvedAppointmentId });

  try {
    const aptSnap = await getDoc(doc(db, 'appointments', resolvedAppointmentId));
    const aptData = aptSnap.exists() ? aptSnap.data() : null;
    const canonicalInvoiceId = aptData?.invoiceId || targetInvoiceId;

    if (canonicalInvoiceId !== targetInvoiceId) {
      logger.warn('Detected non-canonical invoice, redirecting to canonical:', {
        clicked: targetInvoiceId,
        canonical: canonicalInvoiceId
      });

      await dedupeInvoicesForAppointment(resolvedAppointmentId, canonicalInvoiceId);
    }

    window.open(`invoice.html?invoiceId=${canonicalInvoiceId}&mode=view`, '_blank');
  } catch (error) {
    logger.error('Error resolving canonical invoice, opening resolved invoice:', error);
    window.open(`invoice.html?invoiceId=${targetInvoiceId}&mode=view`, '_blank');
  }
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
  if (storeInvoices instanceof Map) {
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
    const amountPaid = toNumber(apt.amountPaid ?? apt.paidAmount ?? 0);
    const balanceDue = Math.max(0, subtotal - amountPaid);
    const paymentStatus = amountPaid <= 0 ? 'unpaid' : (amountPaid >= subtotal ? 'paid' : 'partial');

    const payload = {
      invoiceNumber: apt.invoiceNumber || generateInvoiceNumber(),
      status: 'draft',
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
      total: subtotal,
      totals: {
        labour: labourTotal,
        parts: partsTotal,
        subtotal,
        total: subtotal
      },
      amountPaid,
      paidAmount: amountPaid,
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

    const targetRef = doc(db, 'invoices', targetId);
    const targetSnap = await getDoc(targetRef);
    if (!targetSnap.exists() || !targetSnap.data()?.createdAt) {
      payload.createdAt = serverTimestamp();
    }

    await setDoc(targetRef, payload, { merge: true });

    await updateDoc(doc(db, 'appointments', appointmentId), {
      invoiceId: targetId,
      updatedAt: serverTimestamp()
    });

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
  const unpaidKpiCard = document.querySelector('.invoice-kpi .kpi-item--unpaid');
  const paidKpiCard = document.querySelector('.invoice-kpi .kpi-item--paid');

  const setupKpiCard = (card) => {
    if (!card) return;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-pressed', 'false');
  };
  
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      logger.debug('Search input changed');
      filterInvoices();
    });
  }
  
  if (paymentFilter) {
    paymentFilter.addEventListener('change', () => {
      logger.debug('Payment dropdown changed - forcing all');
      if (paymentFilter.value !== 'all') {
        paymentFilter.value = 'all';
      }
      setActivePaymentFilter('all');
    });

    if (paymentFilter.value !== 'all') {
      paymentFilter.value = 'all';
    }
  }

  setupKpiCard(unpaidKpiCard);
  setupKpiCard(paidKpiCard);

  if (unpaidKpiCard) {
    unpaidKpiCard.addEventListener('click', () => {
      toggleActivePaymentFilter('unpaid');
    });
    unpaidKpiCard.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleActivePaymentFilter('unpaid');
      }
    });
  }

  if (paidKpiCard) {
    paidKpiCard.addEventListener('click', () => {
      toggleActivePaymentFilter('paid');
    });
    paidKpiCard.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleActivePaymentFilter('paid');
      }
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
      const resolved = await resolveInvoiceContext(invoiceId, appointmentId);
      const invoice = resolved.invoice;
      const resolvedInvoiceId = resolved.invoiceId || invoiceId;
      if (!invoice) {
        const hasStore = !!getStoreInvoicesMap();
        logger.warn('Invoice not found for toggle', { invoiceId: resolvedInvoiceId, hasStore, allInvoicesLength: Array.isArray(window.allInvoices) ? window.allInvoices.length : 0 });
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
        total,
        amountPaid: newPaidAmount,
        paidAmount: newPaidAmount,
        balanceDue: newBalance,
        paid: nextPaid,
        updatedAt: serverTimestamp()
      };

      const linkedAppointmentId = resolved.appointmentId || appointmentId || getInvoiceAppointmentId(invoice);
      if (linkedAppointmentId) {
        invoiceUpdate.appointmentId = linkedAppointmentId;
      }

      if (!invoice.createdAt) {
        invoiceUpdate.createdAt = serverTimestamp();
      }

      if (nextPaid) {
        invoiceUpdate.paidAt = serverTimestamp();
      } else {
        invoiceUpdate.paidAt = null;
      }

      await updateDoc(doc(db, 'invoices', resolvedInvoiceId), invoiceUpdate);

      if (linkedAppointmentId) {
        await updateDoc(doc(db, 'appointments', linkedAppointmentId), {
          invoiceId: resolvedInvoiceId,
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
