/**
 * Invoices Storage UI Module
 * Handles rendering of invoice cards and filtering
 */

import { byId, setHTML } from '../shared/dom.js';
import { formatCurrencyGBP, formatDate } from '../shared/format.js';
import { createLogger } from '../shared/logger.js';
import { getState, setState } from '../shared/state.js';

const logger = createLogger('StorageUI');

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

function computeInvoiceTotal(invoice) {
  const directTotal = toNumber(invoice?.total);
  if (directTotal > 0) return directTotal;
  const storedTotal = toNumber(invoice?.totals?.total);
  if (storedTotal > 0) return storedTotal;
  const jobsTotal = sumLineItems(invoice?.jobs);
  const partsTotal = sumLineItems(invoice?.parts);
  return jobsTotal + partsTotal;
}

function getDataLayerStore() {
  if (typeof window === 'undefined') return null;
  return window.Store || window._dataLayer?.store || null;
}

function getInvoiceAppointmentId(invoice) {
  return invoice?.appointmentId || invoice?.aptId || invoice?.appointmentRef || invoice?.meta?.appointmentId || null;
}

function getStoreInvoicesArray() {
  const store = getDataLayerStore();
  if (!store || !(store.invoicesById instanceof Map)) return [];
  return Array.from(store.invoicesById.values());
}

function getMissingInvoicePlaceholders() {
  const missing = window._dataLayer?.automationEngine?.getAutomationState?.()?.uninvoicedCompleted;
  if (!Array.isArray(missing) || missing.length === 0) return [];
  return missing.map((apt) => ({
    id: `missing-${apt.id}`,
    appointmentId: apt.id,
    customerName: apt.title || apt.name || 'Unknown',
    status: 'missing',
    total: 0,
    amountPaid: 0,
    missingInvoice: true
  }));
}

function getSourceInvoices() {
  const storeInvoices = getStoreInvoicesArray();
  if (storeInvoices.length > 0) {
    const normalized = storeInvoices.map((invoice) => ({
      ...invoice,
      appointmentId: getInvoiceAppointmentId(invoice)
    }));

    const existingAppointmentIds = new Set(normalized.map(inv => String(inv.appointmentId || '').trim()).filter(Boolean));
    const missingPlaceholders = getMissingInvoicePlaceholders().filter(inv => !existingAppointmentIds.has(String(inv.appointmentId || '').trim()));
    return [...normalized, ...missingPlaceholders];
  }

  const fallbackInvoices = Array.isArray(window.allInvoices) ? window.allInvoices : [];
  return fallbackInvoices.map((invoice) => ({
    ...invoice,
    appointmentId: getInvoiceAppointmentId(invoice)
  }));
}

/**
 * Check if invoice is paid (normalized across different field formats)
 * @param {Object} inv - Invoice object
 * @returns {boolean} True if invoice is fully paid
 */
function isInvoicePaid(inv) {
  if (inv.paymentStatus) return String(inv.paymentStatus).toLowerCase() === 'paid';
  if (typeof inv.paid === 'boolean') return inv.paid;
  if (typeof inv.balanceDue === 'number') return inv.balanceDue <= 0;
  return false;
}

/**
 * Update KPI summary (Unpaid vs Paid counts)
 * Counts from ALL invoices, not filtered list
 */
function updateInvoiceKPI() {
  const allInvoices = getSourceInvoices();
  const kpiUnpaid = byId('kpiUnpaid');
  const kpiPaid = byId('kpiPaid');
  
  if (!kpiUnpaid || !kpiPaid) {
    logger.warn('KPI elements not found');
    return;
  }
  
  let unpaidCount = 0;
  let paidCount = 0;
  
  allInvoices.forEach(inv => {
    if (isInvoicePaid(inv)) {
      paidCount++;
    } else {
      unpaidCount++;
    }
  });
  
  kpiUnpaid.textContent = unpaidCount;
  kpiPaid.textContent = paidCount;
  
  logger.info('📊 KPI Updated:', { unpaidCount, paidCount, total: allInvoices.length });
}

/**
 * Filter invoices based on search term and payment status
 */
export function filterInvoices() {
  const normalizedInvoices = getSourceInvoices();
  const allInvoices = normalizedInvoices;
  logger.info('filterInvoices() called - allInvoices.length:', allInvoices.length);
  
  const searchInput = byId('searchInvoices');
  const paymentFilter = byId('filterInvoicePayment');
  
  const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const paymentValue = paymentFilter ? paymentFilter.value : 'unpaid';
  
  let filtered = allInvoices;
  
  // Filter by search term
  if (searchTerm) {
    filtered = filtered.filter(inv => {
      const invNumber = (inv.invoiceNumber || '').toLowerCase();
      const custName = (inv.customerName || '').toLowerCase();
      const custPhone = (inv.phone || '').toLowerCase();
      const plate = (inv.regPlate || '').toLowerCase();
      
      return invNumber.includes(searchTerm) ||
             custName.includes(searchTerm) ||
             custPhone.includes(searchTerm) ||
             plate.includes(searchTerm);
    });
  }
  
  // Filter by payment status
  if (paymentValue !== 'all') {
    filtered = filtered.filter(inv => {
      return paymentValue === 'paid' ? isInvoicePaid(inv) : !isInvoicePaid(inv);
    });
  }
  
  setState('filteredInvoices', filtered);
  updateInvoiceKPI();
  renderInvoicesStorage();
}

/**
 * Render invoices storage grid
 */
export function renderInvoicesStorage() {
  const filteredInvoices = getState('filteredInvoices') || [];
  logger.info('renderInvoicesStorage() called - filteredInvoices.length:', filteredInvoices.length);
  
  const container = byId('invoicesList');
  const emptyState = byId('emptyStateInvoices');
  
  if (!container) return;
  
  if (filteredInvoices.length === 0) {
    setHTML(container, '');
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }
  
  if (emptyState) emptyState.style.display = 'none';
  
  setHTML(container, filteredInvoices.map(invoice => createInvoiceCard(invoice)).join(''));
}

/**
 * Create HTML for invoice card
 * @param {Object} invoice - Invoice data
 * @returns {string} HTML string
 */
function createInvoiceCard(invoice) {
  if (invoice.missingInvoice) {
    const customerName = invoice.customerName || 'Unknown';
    const regPlate = invoice.regPlate || '';
    return `
      <div class="invoice-card invoice-card--missing" data-invoice-id="${invoice.id}">
        <div class="invoice-card__header">
          <div>
            <div class="invoice-card__number">Missing Invoice</div>
            <div class="invoice-card__date">Finalized appointment</div>
          </div>
          <span class="invoice-card__status" style="background: #FEE2E2; color: #991B1B;">MISSING</span>
        </div>
        <div class="invoice-card__meta">
          <div class="invoice-card__meta-item">
            <i class="fas fa-user"></i>
            <strong>${customerName}</strong>
          </div>
          ${regPlate ? `<div class="invoice-card__meta-item">
            <i class="fas fa-car"></i>
            ${regPlate}
          </div>` : ''}
        </div>
        <div style="padding: 0.75rem; background: #FFF7ED; border-radius: 0.375rem; margin: 0.5rem 0; font-size: 0.9rem; color: #9A3412;">
          Invoice document is missing for this appointment.
        </div>
        <div class="invoice-card__actions">
          <button
            class="invoice-card__action-btn"
            onclick="window.rebuildInvoiceFromAppointment('${invoice.appointmentId}', '${invoice.id}')"
            title="Rebuild invoice"
          >
            <i class="fas fa-hammer"></i> Rebuild Invoice
          </button>
        </div>
      </div>
    `;
  }

  const customerName = invoice.customerName || 'Unknown';
  const phone = invoice.phone || '';
  const regPlate = invoice.regPlate || '';
  const invoiceNumber = invoice.invoiceNumber || invoice.id?.slice(0, 8) || 'DRAFT';
  const total = computeInvoiceTotal(invoice);
  const amountPaid = toNumber(invoice.paidAmount || invoice.amountPaid || 0);
  const balanceDue = Math.max(0, total - amountPaid);
  const status = invoice.status || 'draft';
  const createdAt = invoice.createdAt;
  
  const paymentStatus = isInvoicePaid(invoice) ? 'paid' : 'unpaid';
  
  // Normalize for display (uppercase)
  const displayStatus = paymentStatus.toUpperCase();
  const paymentStatusColor = paymentStatus === 'paid' ? '#4CAF50' : '#9E9E9E';
  
  // Format date
  let dateStr = 'N/A';
  if (createdAt) {
    try {
      const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
      dateStr = date.toLocaleDateString('en-GB', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
      });
    } catch (e) {
      dateStr = 'N/A';
    }
  }
  
  const statusClass = status === 'final' ? 'final' : 'draft';
  
  return `
    <div class="invoice-card" data-invoice-id="${invoice.id}">
      <div class="invoice-card__header">
        <div>
          <div class="invoice-card__number">${invoiceNumber}</div>
          <div class="invoice-card__date">${dateStr}</div>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <span class="invoice-card__status ${statusClass}" style="padding: 0.25rem 0.75rem;">${status.toUpperCase()}</span>
          <span class="invoice-card__status" style="background: ${paymentStatusColor}; padding: 0.25rem 0.75rem; font-size: 0.8rem;">${displayStatus}</span>
        </div>
      </div>
      
      <div class="invoice-card__meta">
        <div class="invoice-card__meta-item">
          <i class="fas fa-user"></i>
          <strong>${customerName}</strong>
        </div>
        ${phone ? `<div class="invoice-card__meta-item">
          <i class="fas fa-phone"></i>
          ${phone}
        </div>` : ''}
        ${regPlate ? `<div class="invoice-card__meta-item">
          <i class="fas fa-car"></i>
          ${regPlate}
        </div>` : ''}
      </div>
      
      <div style="padding: 0.75rem; background: #f5f5f5; border-radius: 0.375rem; margin: 0.5rem 0;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem;">
          <span>Total:</span>
          <strong>${formatCurrencyGBP(total)}</strong>
        </div>
        ${amountPaid > 0 ? `<div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem; font-size: 0.9rem; color: #4CAF50;">
          <span>Paid:</span>
          <strong>${formatCurrencyGBP(amountPaid)}</strong>
        </div>` : ''}
        ${balanceDue > 0 ? `<div style="display: flex; justify-content: space-between; font-size: 0.9rem; color: #d32f2f;">
          <span>Due:</span>
          <strong>${formatCurrencyGBP(balanceDue)}</strong>
        </div>` : ''}
      </div>
      
      <div class="invoice-card__actions">
        <button 
          class="invoice-card__action-btn" 
          onclick="window.openInvoiceFile('${invoice.id}')"
          title="Open invoice"
        >
          <i class="fas fa-external-link-alt"></i> Open
        </button>
        <button 
          class="invoice-card__action-btn ${paymentStatus === 'paid' ? 'paid' : 'unpaid'}" 
          onclick="window.toggleInvoicePaidStatus('${invoice.id}')"
          title="Toggle payment status"
        >
          ${paymentStatus === 'paid' ? '<i class="fas fa-check"></i> PAID' : 'UNPAID'}
        </button>
        <button 
          class="invoice-card__action-btn danger" 
          onclick="window.deleteInvoiceConfirm('${invoice.id}')"
          title="Delete invoice"
        >
          <i class="fas fa-trash"></i> Delete
        </button>
      </div>
    </div>
  `;
}
