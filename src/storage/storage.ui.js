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

function toTimestampMs(value) {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return Number.isFinite(date?.getTime?.()) ? date.getTime() : 0;
  }
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

function getInvoiceSortMs(invoice) {
  return Math.max(
    toTimestampMs(invoice?.createdAt),
    toTimestampMs(invoice?.invoiceDate),
    toTimestampMs(invoice?.updatedAt)
  );
}

function sortInvoicesByDateDesc(invoices) {
  return [...invoices].sort((a, b) => getInvoiceSortMs(b) - getInvoiceSortMs(a));
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
    return sortInvoicesByDateDesc([...normalized, ...missingPlaceholders]);
  }

  const stateInvoices = getState('allInvoices');
  if (Array.isArray(stateInvoices) && stateInvoices.length > 0) {
    return sortInvoicesByDateDesc(stateInvoices.map((invoice) => ({
      ...invoice,
      appointmentId: getInvoiceAppointmentId(invoice)
    })));
  }

  const fallbackInvoices = Array.isArray(window.allInvoices) ? window.allInvoices : [];
  return sortInvoicesByDateDesc(fallbackInvoices.map((invoice) => ({
    ...invoice,
    appointmentId: getInvoiceAppointmentId(invoice)
  })));
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
    kpiUnpaid.textContent = 'â€¦';
    kpiPaid.textContent = 'â€¦';
    return;
  }
  
  let unpaidCount = 0;
  let paidCount = 0;
  
  allInvoices.forEach(inv => {
    if (!inv?.id) return;
    if (String(inv.id).startsWith('missing-') || inv.missingInvoice === true) return;
    if (isInvoicePaid(inv)) {
      paidCount++;
    } else {
      unpaidCount++;
    }
  });
  
  kpiUnpaid.textContent = unpaidCount;
  kpiPaid.textContent = paidCount;
  
  logger.info('ðŸ“Š KPI Updated:', { unpaidCount, paidCount, total: allInvoices.length });
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
        if (emptyTitle) emptyTitle.textContent = 'Loading invoicesâ€¦';
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

  const INV_PAGE = 10;
  const cards = filteredInvoices.map((invoice, i) => {
    const card = createInvoiceCard(invoice);
    return i < INV_PAGE ? card : `<div class="inv-hidden" style="display:none">${card}</div>`;
  });
  const remaining = filteredInvoices.length - INV_PAGE;
  const loadMore = remaining > 0
    ? `<button class="inv-load-more" onclick="window.tvInvLoadMore(this)">Load ${Math.min(INV_PAGE, remaining)} more</button>`
    : '';
  setHTML(container, `<div class="inv-list">${cards.join('')}</div>${loadMore}`);
}

/**
 * Compact invoice card â€” 4-row layout with icon-only actions
 * @param {Object} invoice
 * @returns {string} HTML string
 */
function createInvoiceCard(invoice) {
  if (invoice.missingInvoice) {
    const clientLine = [invoice.customerName || 'Unknown', invoice.regPlate].filter(Boolean).join(' â€” ');
    return `<div class="inv-row inv-row--missing" data-invoice-id="${invoice.id}">
  <div class="inv-row__head"><span class="inv-row__num">Missing Invoice</span><span class="inv-badge inv-badge--missing">MISSING</span></div>
  <div class="inv-row__info"><span class="inv-row__client">${clientLine}</span></div>
  <div class="inv-row__actions"><button class="inv-btn" onclick="window.rebuildInvoiceFromAppointment('${invoice.appointmentId}', '${invoice.id}')" title="Rebuild invoice"><i class="fas fa-hammer"></i></button></div>
</div>`;
  }

  const customerName = invoice.customerName || 'Unknown';
  const vehicleMakeModel = invoice.vehicleMakeModel || invoice.makeModel || '';
  const regPlate = invoice.regPlate || '';
  const invoiceNumber = invoice.invoiceNumber || invoice.id?.slice(0, 8) || 'DRAFT';
  const total = computeInvoiceTotal(invoice);
  const amountPaid = toNumber(invoice.paidAmount || invoice.amountPaid || 0);
  const balanceDue = Math.max(0, total - amountPaid);
  const status = invoice.status || 'draft';
  const isPaid = isInvoicePaid(invoice);
  const isPartial = amountPaid > 0 && balanceDue > 0 && !isPaid;

  let dateStr = '';
  if (invoice.createdAt) {
    try {
      const d = invoice.createdAt.toDate ? invoice.createdAt.toDate() : new Date(invoice.createdAt);
      dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
    } catch (e) {}
  }

  const vehicleStr = [regPlate, vehicleMakeModel].filter(Boolean).join(' Â· ');
  const clientLine = vehicleStr ? `${customerName} â€” ${vehicleStr}` : customerName;

  const payBadge = isPaid
    ? '<span class="inv-badge inv-badge--paid">PAID</span>'
    : isPartial
      ? '<span class="inv-badge inv-badge--partial">PARTIAL</span>'
      : '<span class="inv-badge inv-badge--due">DUE</span>';
  const statusBadge = status === 'final'
    ? '<span class="inv-badge inv-badge--final">FINAL</span>'
    : '<span class="inv-badge inv-badge--draft">DRAFT</span>';

  let finRow;
  if (isPaid) {
    finRow = `<strong class="inv-fin__total">${formatCurrencyGBP(total)}</strong><span class="inv-fin__paid">âœ“ Paid</span>`;
  } else if (isPartial) {
    finRow = `<strong class="inv-fin__total">${formatCurrencyGBP(total)}</strong><span class="inv-fin__partial">Paid ${formatCurrencyGBP(amountPaid)}</span><span class="inv-fin__due">Due ${formatCurrencyGBP(balanceDue)}</span>`;
  } else {
    finRow = `<strong class="inv-fin__total">${formatCurrencyGBP(total)}</strong><span class="inv-fin__due">${formatCurrencyGBP(balanceDue)} due</span>`;
  }

  const payBtn = !isPaid
    ? `<button class="inv-btn inv-btn--pay" onclick="window.toggleInvoicePaidStatus('${invoice.id}', '${invoice.appointmentId || ''}')" title="${isPartial ? 'Mark fully paid' : 'Mark Paid'}" aria-label="Mark paid"><i class="fas fa-check"></i></button>`
    : `<button class="inv-btn inv-btn--unpay" onclick="window.toggleInvoicePaidStatus('${invoice.id}', '${invoice.appointmentId || ''}')" title="Mark Unpaid" aria-label="Mark unpaid"><i class="fas fa-undo"></i></button>`;

  return `<div class="inv-row" data-invoice-id="${invoice.id}">
  <div class="inv-row__head"><span class="inv-row__num">${invoiceNumber}</span><div class="inv-row__chips">${payBadge}${statusBadge}</div></div>
  <div class="inv-row__info"><span class="inv-row__client">${clientLine}</span><span class="inv-row__date">${dateStr}</span></div>
  <div class="inv-row__fin">${finRow}</div>
  <div class="inv-row__actions"><button class="inv-btn inv-btn--open" onclick="window.openInvoiceFile('${invoice.id}', '${invoice.appointmentId || ''}')" title="Open" aria-label="Open invoice"><i class="fas fa-external-link-alt"></i></button>${payBtn}<button class="inv-btn inv-btn--del" onclick="window.deleteInvoiceConfirm('${invoice.id}')" title="Delete" aria-label="Delete invoice"><i class="fas fa-trash"></i></button></div>
</div>`;
}
