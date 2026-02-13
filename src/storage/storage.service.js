/**
 * Invoices Storage Service Module
 * Handles Firestore listener for invoices collection
 */

import { db } from '../firebase/firebase.js';
import { collection, query, orderBy, onSnapshot, getDocs, where, doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { createLogger } from '../shared/logger.js';
import { getState, setState } from '../shared/state.js';

const logger = createLogger('StorageService');

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

function computeInvoiceTotals(invoice) {
  const jobs = Array.isArray(invoice?.jobs) ? invoice.jobs : [];
  const parts = Array.isArray(invoice?.parts) ? invoice.parts : [];
  const labour = sumLineItems(jobs);
  const partsTotal = sumLineItems(parts);
  const subtotal = labour + partsTotal;
  return {
    labour,
    parts: partsTotal,
    subtotal,
    total: subtotal
  };
}

function getPaymentStatus(total, paidAmount) {
  return paidAmount > 0 && paidAmount >= total ? 'PAID' : 'UNPAID';
}

/**
 * Start invoices storage listener
 * Listens to /invoices collection and updates state
 * @param {Function} callback - Called when invoices are updated
 */
export async function startInvoicesListener(callback) {
  const currentUnsubscribe = getState('invoicesUnsubscribe');
  
  if (currentUnsubscribe) {
    logger.info('Listener already active, skipping duplicate');
    return;
  }
  
  try {
    if (!db) {
      logger.error('Database not initialized');
      return;
    }
    
    logger.info('Setting up query: collection(db, "invoices") with orderBy("createdAt", "desc")');
    
    const invoicesQuery = query(
      collection(db, 'invoices'),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(
      invoicesQuery,
      async (snapshot) => {
        logger.info(`Snapshot received - size: ${snapshot.size}`);
        
        // Log all invoice IDs for debugging
        if (snapshot.size > 0) {
          const allIds = snapshot.docs.map(d => d.id);
          logger.debug('All invoice IDs:', allIds);
          
          // Log all invoices for comprehensive debugging
          snapshot.docs.forEach((doc, index) => {
            logger.debug(`Invoice ${index + 1}:`, doc.id, doc.data());
          });
        } else {
          logger.warn('No invoices found in query result');
        }
        
        const invoices = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        for (const invoice of invoices) {
          const totals = computeInvoiceTotals(invoice);
          const storedTotal = toNumber(invoice?.totals?.total);
          const hasItems = totals.total > 0;

          if (hasItems && storedTotal <= 0) {
            const paidAmount = toNumber(invoice?.paidAmount || 0);
            const balanceDue = Math.max(0, totals.total - paidAmount);
            const paymentStatus = getPaymentStatus(totals.total, paidAmount);
            try {
              await updateDoc(doc(db, 'invoices', invoice.id), {
                totals,
                balanceDue,
                paymentStatus
              });
              logger.info('✅ Updated invoice totals from items:', invoice.id);
            } catch (error) {
              logger.warn('⚠️ Failed to update invoice totals:', invoice.id, error);
            }
          }
        }

        logger.info('Mapped invoices array length:', invoices.length);

        const merged = await reconcileInvoicesWithAppointments(invoices);
        setState('allInvoices', merged);

        if (callback) {
          callback(merged);
        }
      },
      (error) => {
        logger.error('Listener error:', error);
        logger.error('Error code:', error.code);
        logger.error('Error message:', error.message);
      }
    );
    
    // Store unsubscribe function
    setState('invoicesUnsubscribe', unsubscribe);
    logger.info('✅ Listener started');
    
  } catch (error) {
    logger.error('Error starting listener:', error);
  }
}

function scoreInvoice(invoice) {
  let score = 0;
  if (invoice?.totals?.total || invoice?.total) score += 2;
  if (Array.isArray(invoice?.items) && invoice.items.length > 0) score += 1;
  if (Array.isArray(invoice?.services) && invoice.services.length > 0) score += 1;
  if (Array.isArray(invoice?.jobs) && invoice.jobs.length > 0) score += 1;
  if (Array.isArray(invoice?.parts) && invoice.parts.length > 0) score += 1;
  if (invoice?.customerName) score += 1;
  if (invoice?.appointmentId) score += 1;
  return score;
}

async function reconcileInvoicesWithAppointments(invoices) {
  try {
    const appointmentsQuery = query(
      collection(db, 'appointments'),
      where('status', 'in', ['done', 'finalized'])
    );

    const snapshot = await getDocs(appointmentsQuery);
    const appointments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const appointmentIds = new Set(appointments.map(apt => apt.id));

    const byAppointment = new Map();
    const merged = [];

    invoices.forEach(invoice => {
      const appointmentId = invoice.appointmentId || null;
      if (!appointmentId) {
        merged.push(invoice);
        return;
      }

      if (!appointmentIds.has(appointmentId)) {
        logger.warn('⚠️ Orphan invoice ignored (appointment not found):', invoice.id, appointmentId);
        return;
      }

      const existing = byAppointment.get(appointmentId);
      if (!existing || scoreInvoice(invoice) >= scoreInvoice(existing)) {
        byAppointment.set(appointmentId, invoice);
      }
    });

    byAppointment.forEach(invoice => merged.push(invoice));

    appointments.forEach(apt => {
      if (apt.status !== 'finalized') return;
      if (byAppointment.has(apt.id)) return;

      merged.push({
        id: apt.invoiceId || `missing-${apt.id}`,
        appointmentId: apt.id,
        customerName: apt.customerName || apt.clientName || 'Unknown',
        phone: apt.customerPhone || apt.phone || '',
        regPlate: apt.registrationPlate || apt.regNumber || '',
        createdAt: apt.createdAt || null,
        status: 'missing',
        total: 0,
        amountPaid: 0,
        missingInvoice: true
      });
    });

    return merged;
  } catch (error) {
    logger.error('Reconcile error:', error);
    return invoices;
  }
}

/**
 * Stop invoices storage listener
 */
export function stopInvoicesListener() {
  const unsubscribe = getState('invoicesUnsubscribe');
  
  if (unsubscribe) {
    logger.info('Stopping listener');
    unsubscribe();
    setState('invoicesUnsubscribe', null);
  }
}

/**
 * Refresh invoices (restart listener)
 */
export function refreshInvoices(callback) {
  logger.info('Manual refresh requested');
  stopInvoicesListener();
  startInvoicesListener(callback);
}
