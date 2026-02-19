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

  const stateInvoices = getState('allInvoices');
  if (Array.isArray(stateInvoices) && stateInvoices.length > 0) {
    return stateInvoices.map((invoice) => ({
      ...invoice,
      appointmentId: getInvoiceAppointmentId(invoice)
    }));
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
  const balanceDue = toNumber(inv.balanceDue);
  if (balanceDue > 0) return false;

  const total = computeInvoiceTotal(inv);
  const amountPaid = toNumber(inv.paidAmount ?? inv.amountPaid ?? 0);
  if (total > 0) return amountPaid >= total;

  if (typeof inv.balanceDue !== 'undefined') return balanceDue <= 0;
  return false;
}

function getActivePaymentFilter() {
  const active = String(getState('activePaymentFilter') || 'all').toLowerCase();
  return active === 'paid' || active === 'unpaid' ? active : 'all';
}

function updateActivePaymentFilterUI() {
  const activeFilter = getActivePaymentFilter();
  const unpaidCard = document.querySelector('.invoice-kpi .kpi-item--unpaid');
  const paidCard = document.querySelector('.invoice-kpi .kpi-item--paid');

  const syncCardState = (card, isActive) => {
    if (!card) return;
    card.classList.toggle('active', isActive);
    card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  };

  syncCardState(unpaidCard, activeFilter === 'unpaid');
  syncCardState(paidCard, activeFilter === 'paid');

  const paymentFilter = byId('filterInvoicePayment');
  if (paymentFilter && paymentFilter.value !== 'all') {
    paymentFilter.value = 'all';
  }
}

export function setActivePaymentFilter(nextFilter) {
  const normalized = String(nextFilter || 'all').toLowerCase();
  const value = normalized === 'paid' || normalized === 'unpaid' ? normalized : 'all';
  setState('activePaymentFilter', value);
  filterInvoices();
}

export function toggleActivePaymentFilter(targetFilter) {
  const target = String(targetFilter || 'all').toLowerCase();
  const active = getActivePaymentFilter();
  const next = active === target ? 'all' : target;
  setActivePaymentFilter(next);
}

/**
 * Update KPI summary (Unpaid vs Paid counts)
 * Counts from ALL invoices, not filtered list
 */
function updateInvoiceKPI() {
  const allInvoices = getSourceInvoices();
  const kpiUnpaid = byId('kpiUnpaid');
  const kpiPaid = byId('kpiPaid');
  const isLoaded = !!getState('storageInvoicesLoaded');
  
  if (!kpiUnpaid || !kpiPaid) {
    logger.warn('KPI elements not found');
    return;
  }

  if (!isLoaded && allInvoices.length === 0) {
    kpiUnpaid.textContent = '…';
    kpiPaid.textContent = '…';
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
  if (allInvoices.length > 0) {
    setState('storageInvoicesLoaded', true);
  }
  logger.info('filterInvoices() called - allInvoices.length:', allInvoices.length);
  
  const searchInput = byId('searchInvoices');
  
  const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const paymentValue = getActivePaymentFilter();
  
  let filtered = allInvoices;

  // Filter by payment status first
  if (paymentValue !== 'all') {
    filtered = filtered.filter(inv => {
      return paymentValue === 'paid' ? isInvoicePaid(inv) : !isInvoicePaid(inv);
    });
  }
  
  // Filter by search term on top of active payment filter
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
  
  setState('filteredInvoices', filtered);
  updateInvoiceKPI();
  updateActivePaymentFilterUI();
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
  const allInvoices = getSourceInvoices();
  const isLoaded = !!getState('storageInvoicesLoaded');
  
  if (!container) return;
  
  if (filteredInvoices.length === 0) {
    setHTML(container, '');
    if (emptyState) {
      const emptyTitle = emptyState.querySelector('h3');
      const emptyText = emptyState.querySelector('p');

      if (!isLoaded && allInvoices.length === 0) {
        if (emptyTitle) emptyTitle.textContent = 'Loading invoices…';
        if (emptyText) emptyText.textContent = 'Syncing latest invoice data.';
        emptyState.style.display = 'flex';
        return;
      }

      if (allInvoices.length === 0) {
        if (emptyTitle) emptyTitle.textContent = 'No invoices yet';
        if (emptyText) emptyText.textContent = 'Create your first invoice from an appointment\'s action menu';
      } else {
        if (emptyTitle) emptyTitle.textContent = 'No invoices match current filters';
        if (emptyText) emptyText.textContent = 'Try clearing search or toggling the status filter.';
      }

      emptyState.style.display = 'flex';
    }
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
