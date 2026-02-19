/**
 * Dashboard Metrics Engine - Single Source of Truth
 * Computes normalized KPIs from appointments + invoices and applies them to dashboard UI.
 */

/**
 * Normalize appointment date to local YYYY-MM-DD and ms timestamp
 * Handles Firestore Timestamp, string, or Date objects
 * @param {Object} apt - Appointment object
 * @returns {Object} { dateISO: "YYYY-MM-DD", startMs: timestamp, timeString: "HH:MM" }
 */
function normalizeAppointmentDate(apt) {
  if (!apt) return { dateISO: null, startMs: null, timeString: '00:00' };

  let appointmentDate = null;

  // Priority 1: Firestore Timestamp (has toDate() method)
  if (apt.startAt && typeof apt.startAt.toDate === 'function') {
    appointmentDate = apt.startAt.toDate();
  }
  // Priority 2: dateStr (e.g., "2026-02-18")
  else if (apt.dateStr && typeof apt.dateStr === 'string') {
    // Try to parse as ISO date
    appointmentDate = new Date(apt.dateStr + 'T' + (apt.timeStr || apt.time || '00:00:00'));
  }
  // Priority 3: JavaScript Date object
  else if (apt.startAt instanceof Date) {
    appointmentDate = apt.startAt;
  }
  // Priority 4: Try parsing as string
  else if (apt.startAt && typeof apt.startAt === 'string') {
    appointmentDate = new Date(apt.startAt);
  }

  if (!appointmentDate || isNaN(appointmentDate.getTime())) {
    return { dateISO: null, startMs: null, timeString: '00:00' };
  }

  // Extract date in local timezone
  const year = appointmentDate.getFullYear();
  const month = String(appointmentDate.getMonth() + 1).padStart(2, '0');
  const day = String(appointmentDate.getDate()).padStart(2, '0');
  const hours = String(appointmentDate.getHours()).padStart(2, '0');
  const mins = String(appointmentDate.getMinutes()).padStart(2, '0');

  return {
    dateISO: `${year}-${month}-${day}`,
    startMs: appointmentDate.getTime(),
    timeString: `${hours}:${mins}`
  };
}

function normalizeStatus(value) {
  return (value || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isCancelledStatus(status) {
  const s = normalizeStatus(status);
  return s === 'canceled' || s === 'cancelled' || s === 'anulata' || s === 'anulată';
}

function isCompletedStatus(status) {
  const s = normalizeStatus(status);
  return s === 'completed' || s === 'done' || s === 'finalized' || s === 'completa' || s === 'completata' || s === 'completată';
}

/**
 * Get today's date key in local YYYY-MM-DD format
 * @returns {string} "YYYY-MM-DD" (today's date)
 */
function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get current week bounds (ISO week: Monday-Sunday)
 * @returns {Object} { startDate, endDate, startMs, endMs }
 */
function getCurrentWeekBounds() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  
  // Get Monday of this week  
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday = 0, so 6 days back; Mon = 1, so 0 days back
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysToMonday);
  monday.setHours(0, 0, 0, 0);
  
  // Get next Monday (exclusive upper bound)
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  nextMonday.setHours(0, 0, 0, 0);
  
  return {
    startDate: monday,
    endDate: nextMonday,
    startMs: monday.getTime(),
    endMs: nextMonday.getTime(),
    startISO: monday.toISOString().split('T')[0],
    endISO: nextMonday.toISOString().split('T')[0]
  };
}

function parseAnyDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  if (typeof value?.toDate === 'function') {
    const parsed = value.toDate();
    return parsed instanceof Date && !isNaN(parsed.getTime()) ? parsed : null;
  }

  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value * 1000;
    const parsed = new Date(ms);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const legacyUkDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (legacyUkDate) {
      const day = Number(legacyUkDate[1]);
      const month = Number(legacyUkDate[2]);
      const year = Number(legacyUkDate[3]);
      const parsedLegacy = new Date(year, month - 1, day);
      return isNaN(parsedLegacy.getTime()) ? null : parsedLegacy;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-').map(Number);
      const parsed = new Date(year, month - 1, day);
      return isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'object' && typeof value.seconds === 'number') {
    const ms = value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
    const parsed = new Date(ms);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function parseAmountFromItems(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => {
    if (!item) return sum;
    const qty = toNumber(item.qty || item.quantity || 1);
    const unit = toNumber(item.unitPrice || item.price || item.cost || 0);
    const line = toNumber(item.total || item.lineTotal || (qty * unit));
    return sum + line;
  }, 0);
}

function extractInvoiceLinkIds(invoice) {
  if (!invoice) return [];
  const candidates = [
    invoice.appointmentId,
    invoice.appointmentRef,
    invoice.aptId,
    invoice.jobId,
    invoice.meta?.appointmentId,
    invoice.meta?.appointmentRef,
    invoice.meta?.aptId,
    invoice.meta?.jobId
  ];
  return candidates
    .map(v => (v === null || v === undefined ? '' : String(v).trim()))
    .filter(Boolean);
}

/**
 * Normalize invoice data
 * @param {Object} invoice - Invoice object
 * @returns {Object} Normalized invoice { id, total, paidAmount, paymentStatus, invoiceDateMs, invoiceDate }
 */
function normalizeInvoice(invoice) {
  if (!invoice) return null;

  const total = toNumber(invoice.total || invoice.totalAmount || invoice.grandTotal || invoice.amount || invoice.totals?.total || 0);
  const paidAmount = toNumber(invoice.paidAmount || invoice.amountPaid || invoice.paidAmountGBP || 0);
  const balanceDue = Math.max(0, total - paidAmount);

  const fallbackDate =
    parseAnyDate(invoice.invoiceDate) ||
    parseAnyDate(invoice.date) ||
    parseAnyDate(invoice.createdAt) ||
    parseAnyDate(invoice.updatedAt) ||
    parseAnyDate(invoice.meta?.date) ||
    null;

  // Compute payment status
  let paymentStatus = 'unpaid';
  const explicitStatus = (invoice.paymentStatus || invoice.status || '').toLowerCase();
  const paidFlag = invoice.paid === true;
  if (explicitStatus === 'paid' || paidFlag || balanceDue <= 0 || (total > 0 && paidAmount >= total)) {
    paymentStatus = 'paid';
  } else if (explicitStatus === 'partial' || paidAmount > 0) {
    paymentStatus = 'partial';
  }

  const paidDate =
    parseAnyDate(invoice.paidAt) ||
    parseAnyDate(invoice.paidDate) ||
    fallbackDate;

  const effectiveDate = paidDate || fallbackDate || new Date();

  return {
    id: invoice.id,
    linkIds: extractInvoiceLinkIds(invoice),
    total,
    paidAmount,
    balanceDue,
    paymentStatus, // 'paid', 'partial', 'unpaid'
    paid: paymentStatus === 'paid',
    invoiceDateMs: effectiveDate.getTime(),
    invoiceDate: effectiveDate
  };
}

function buildInvoiceMaps(invoices = []) {
  const invoiceByAppointmentId = new Map();
  const invoiceById = new Map();

  (invoices || []).forEach(rawInvoice => {
    const normalized = normalizeInvoice(rawInvoice);
    if (!normalized) return;

    const wrapped = { raw: rawInvoice, normalized };
    invoiceById.set(String(rawInvoice.id || normalized.id || ''), wrapped);

    normalized.linkIds.forEach(linkId => {
      const existing = invoiceByAppointmentId.get(linkId);
      if (!existing || existing.normalized.invoiceDateMs < normalized.invoiceDateMs) {
        invoiceByAppointmentId.set(linkId, wrapped);
      }
    });
  });

  return { invoiceByAppointmentId, invoiceById };
}

function resolveAppointmentAmount(apt, linkedInvoice) {
  const direct = toNumber(apt?.total || apt?.subtotal || apt?.amount || apt?.totals?.total || apt?.pricing?.total || 0);
  if (direct > 0) return direct;

  const servicesSum = parseAmountFromItems(apt?.services);
  const jobsSum = parseAmountFromItems(apt?.jobs);
  const partsSum = parseAmountFromItems(apt?.parts);
  const fromItems = servicesSum + jobsSum + partsSum;
  if (fromItems > 0) return fromItems;

  const invoiceTotal = toNumber(linkedInvoice?.normalized?.total || linkedInvoice?.raw?.total || linkedInvoice?.raw?.totals?.total || 0);
  return Math.max(0, invoiceTotal);
}

function normalizeAppointmentForKPI(apt, invoiceMaps, now) {
  if (!apt || !apt.id) return null;

  const id = String(apt.id);
  const linkedById = apt.invoiceId ? invoiceMaps.invoiceById.get(String(apt.invoiceId)) : null;
  const linkedByAppointment = invoiceMaps.invoiceByAppointmentId.get(id) || null;
  const linkedInvoice = linkedById || linkedByAppointment || null;

  const hasInvoice = Boolean(linkedInvoice || apt.invoiceId);
  const normalizedDateInfo = normalizeAppointmentDate(apt);
  const date = parseAnyDate(apt.startAt) ||
    parseAnyDate(apt.date) ||
    parseAnyDate(apt.dateStr) ||
    parseAnyDate(apt.appointmentDate) ||
    parseAnyDate(apt.scheduledAt) ||
    (normalizedDateInfo.startMs ? new Date(normalizedDateInfo.startMs) : null);

  const cancelled = isCancelledStatus(apt.status);
  const completedFlag = apt.completed === true || apt.isCompleted === true;
  const completed = completedFlag || isCompletedStatus(apt.status);

  const appointmentPaidDefined = typeof apt.paid === 'boolean';
  const invoicePaid = linkedInvoice?.normalized?.paid === true;
  const paid = appointmentPaidDefined ? apt.paid : invoicePaid;

  const totalAmount = resolveAppointmentAmount(apt, linkedInvoice);

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const isToday = Boolean(date && date >= today && date < tomorrow);
  const isOverdue = Boolean(date && date < now && !completed);
  const isUpcoming = Boolean(date && date > now && !completed);
  const pendingAmount = (!paid && (hasInvoice || totalAmount > 0)) ? totalAmount : 0;

  return {
    id,
    date,
    status: cancelled ? 'cancelled' : (completed ? 'completed' : 'active'),
    isCompleted: completed,
    isOverdue,
    isToday,
    isUpcoming,
    hasInvoice,
    paid,
    totalAmount,
    pendingAmount
  };
}

/**
 * Helper: Convert value to number
 */
function toNumber(value) {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  return isNaN(num) || !isFinite(num) ? 0 : num;
}

/**
 * Debounced one-line pipeline diagnostic (max once per update cycle)
 */
function emitPipelineDiagnostic(partial = {}) {
  if (typeof window === 'undefined') return;

  if (partial.source !== 'metrics') {
    return;
  }

  const apptsLen = Array.isArray(window.appointments) ? window.appointments.length : 0;
  const invoicesLen = Array.isArray(window.allInvoices) ? window.allInvoices.length : 0;
  const last = window.__tvLastDashboardMetrics || {};
  const activeWorkspace = window.__workspaceState?.activeWorkspace || 'n/a';

  const metrics = {
    today: toNumber(partial.today ?? last.todayJobs ?? 0),
    overdue: toNumber(partial.overdue ?? last.overdueJobs ?? 0),
    upcoming: toNumber(partial.upcoming ?? last.upcomingJobs ?? 0),
    completed: toNumber(partial.completed ?? last.completedJobs ?? 0),
    unpaid: toNumber(partial.unpaid ?? last.unpaidTotalGBP ?? 0),
    weekRevenue: toNumber(partial.weekRevenue ?? last.weekRevenueGBP ?? 0)
  };

  window.__tvDiagState = window.__tvDiagState || { timer: null, payload: null };
  window.__tvDiagState.payload = { apptsLen, invoicesLen, metrics, activeWorkspace };

  if (window.__tvDiagState.timer) {
    clearTimeout(window.__tvDiagState.timer);
  }

  window.__tvDiagState.timer = setTimeout(() => {
    const payload = window.__tvDiagState.payload;
    if (!payload) return;
    const m = payload.metrics;
    console.log('[PIPELINE]', {
      apts: payload.apptsLen,
      invoices: payload.invoicesLen,
      weekRevenue: Number(m.weekRevenue.toFixed(2)),
      unpaidGBP: Number(m.unpaid.toFixed(2)),
      today: m.today,
      overdue: m.overdue,
      completed: m.completed
    });
  }, 100);
}

if (typeof window !== 'undefined') {
  window.__tvEmitPipelineDiag = emitPipelineDiagnostic;
}

/**
 * MAIN: Compute all dashboard metrics from appointments and invoices
 * @param {Array} appointments - All appointments from store
 * @param {Array} invoices - All invoices from store
 * @returns {Object} Metrics object with all KPI values
 */
export function computeDashboardMetrics(appointments = [], _invoices = []) {
  return computeDashboardKPIs(appointments, _invoices);
}

export function computeDashboardKPIs(appointments = [], invoicesInput = []) {
  const now = new Date();
  const weekBounds = getCurrentWeekBounds();
  const appointmentsList = Array.isArray(appointments) ? appointments : [];
  const globalInvoices = (typeof window !== 'undefined' && Array.isArray(window.allInvoices)) ? window.allInvoices : null;
  const invoices = globalInvoices || (Array.isArray(invoicesInput) ? invoicesInput : []);

  const invoiceMaps = buildInvoiceMaps(invoices);
  const normalizedAppointments = [];

  appointmentsList.forEach(apt => {
    const normalized = normalizeAppointmentForKPI(apt, invoiceMaps, now);
    if (normalized) {
      normalizedAppointments.push(normalized);
    }
  });

  const nonCancelled = normalizedAppointments.filter(a => a.status !== 'cancelled');
  const completed = nonCancelled.filter(a => a.isCompleted);
  const active = nonCancelled.filter(a => !a.isCompleted);

  const todayCount = nonCancelled.filter(a => a.isToday).length;
  const overdueCount = nonCancelled.filter(a => a.isOverdue).length;
  const upcomingCount = nonCancelled.filter(a => a.isUpcoming).length;

  const completedAndInvoices = completed.filter(a => a.hasInvoice);
  const unpaidAppointments = nonCancelled.filter(a => a.hasInvoice && !a.paid);

  const unpaidAmount = unpaidAppointments.reduce((sum, a) => sum + toNumber(a.totalAmount), 0);
  const pendingAmount = unpaidAppointments.reduce((sum, a) => sum + toNumber(a.pendingAmount), 0);

  const weekAppointments = nonCancelled.filter(a => {
    if (!a.date || isNaN(a.date.getTime())) return false;
    const ms = a.date.getTime();
    return ms >= weekBounds.startMs && ms < weekBounds.endMs;
  });

  const weekAmount = weekAppointments
    .filter(a => a.isCompleted || a.hasInvoice)
    .reduce((sum, a) => sum + toNumber(a.totalAmount), 0);

  const linkedAppointmentIds = new Set(nonCancelled.map(a => String(a.id)));
  const orphanInvoiceCount = (invoices || []).reduce((count, inv) => {
    const links = extractInvoiceLinkIds(inv);
    if (links.length === 0) return count + 1;
    const hasMatch = links.some(link => linkedAppointmentIds.has(String(link)));
    return hasMatch ? count : count + 1;
  }, 0);

  const kpis = {
    totalJobsCount: nonCancelled.length,
    activeCount: active.length,
    completedCount: completed.length,
    todayCount,
    overdueCount,
    upcomingCount,
    completedAndInvoicesCount: completedAndInvoices.length,
    unpaidCount: unpaidAppointments.length,
    unpaidAmount: Math.round(unpaidAmount * 100) / 100,
    pendingCount: unpaidAppointments.length,
    pendingAmount: Math.round(pendingAmount * 100) / 100,
    weekCount: weekAppointments.length,
    weekAmount: Math.round(weekAmount * 100) / 100,
    orphanInvoiceCount,
    _timestamp: new Date().toISOString(),
    _todayKey: getTodayKey(),
    _weekInfo: {
      start: weekBounds.startISO,
      end: weekBounds.endISO
    }
  };

  if (typeof window !== 'undefined') {
    window.__tvKpiDebugState = window.__tvKpiDebugState || { loggedOnce: false };
    if (window.__TV_DEBUG_KPI === true || window.__tvKpiDebugState.loggedOnce === false) {
      window.__tvKpiDebugState.loggedOnce = true;
      console.log('[KPI]', {
        appointments: appointmentsList.length,
        invoices: invoices.length,
        unpaidCount: kpis.unpaidCount,
        unpaidAmount: kpis.unpaidAmount,
        orphanInvoices: kpis.orphanInvoiceCount
      });
    }
  }

  return kpis;
}

/**
 * RENDER: Update all UI elements with computed metrics
 * @param {Object} metrics - Result from computeDashboardMetrics
 */
export function renderDashboardMetrics(metrics) {
  if (!metrics) return;

  applyDashboardKPIsToDOM(metrics);
}

export function applyDashboardKPIsToDOM(kpis) {
  if (!kpis) return;

  const formatGBP = (value) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(toNumber(value));

  // ========================================
  // KPI CARDS (5 cards)
  // ========================================

  // Card 1: All Jobs
  const totalAptsEl = document.getElementById('totalAppointments');
  const totalMiniEl = document.getElementById('totalMini');
  if (totalAptsEl) totalAptsEl.textContent = String(kpis.totalJobsCount);
  if (totalMiniEl) totalMiniEl.textContent = `Active: ${kpis.activeCount} • Completed: ${kpis.completedCount}`;

  // Card 2: Today Focus
  const todayAptsEl = document.getElementById('todayAppointments');
  const todayMiniEl = document.getElementById('todayMini');
  if (todayAptsEl) todayAptsEl.textContent = String(kpis.todayCount);
  if (todayMiniEl) todayMiniEl.textContent = `Overdue: ${kpis.overdueCount}`;

  // Card 3: Completed & Invoices
  const completedAptsEl = document.getElementById('completedAppointments');
  const completedMiniEl = document.getElementById('completedMini');
  if (completedAptsEl) completedAptsEl.textContent = String(kpis.completedAndInvoicesCount);
  if (completedMiniEl) completedMiniEl.textContent = `Unpaid: ${kpis.unpaidCount} • ${formatGBP(kpis.unpaidAmount)}`;

  // Card 4: Planning (Upcoming)
  const planningAptsEl = document.getElementById('planningAppointments');
  const planningMiniEl = document.getElementById('planningMini');
  if (planningAptsEl) planningAptsEl.textContent = String(kpis.upcomingCount);
  const nextLabel = kpis.upcomingCount > 0 ? `Upcoming: ${kpis.upcomingCount}` : 'No upcoming';
  if (planningMiniEl) planningMiniEl.textContent = nextLabel;

  // Card 5: Revenue Inbox
  const revenueCountEl = document.getElementById('revenueCount');
  const revenueMiniEl = document.getElementById('revenueMini');
  if (revenueCountEl) revenueCountEl.textContent = String(kpis.pendingCount);
  if (revenueMiniEl) {
    revenueMiniEl.textContent = `Pending: ${kpis.pendingCount} • ${formatGBP(kpis.pendingAmount)} • Week: ${kpis.weekCount} • ${formatGBP(kpis.weekAmount)}`;
  }

  // ========================================
  // SUMMARY STRIP
  // ========================================

  const summaryToday = document.getElementById('summaryToday');
  const summaryOverdue = document.getElementById('summaryOverdue');
  const summaryPending = document.getElementById('summaryPending');
  const summaryWeek = document.getElementById('summaryWeek');

  if (summaryToday) summaryToday.textContent = String(kpis.todayCount);
  if (summaryOverdue) summaryOverdue.textContent = String(kpis.overdueCount);
  if (summaryPending) summaryPending.textContent = `${formatGBP(kpis.pendingAmount)} (${kpis.pendingCount})`;
  if (summaryWeek) summaryWeek.textContent = `${formatGBP(kpis.weekAmount)} (${kpis.weekCount})`;

  const tvStats = document.getElementById('tvStats');
  if (tvStats) tvStats.style.display = 'grid';

  // Show summary strip if it exists
  const summaryStrip = document.getElementById('tvSummaryStrip');
  if (summaryStrip) summaryStrip.style.display = 'flex';

  // ========================================
  // HEADER BADGES (if present)
  // ========================================

  const setHeaderBadgeValue = (id, value, show) => {
    const badge = document.getElementById(id);
    if (!badge) return;
    const valueEl = badge.querySelector('.indicator-value');
    if (valueEl) valueEl.textContent = value;
    badge.style.display = show ? 'flex' : 'none';
  };

  setHeaderBadgeValue('tvHeaderToday', String(kpis.todayCount), kpis.todayCount > 0);
  setHeaderBadgeValue('tvHeaderOverdue', String(kpis.overdueCount), kpis.overdueCount > 0);
  setHeaderBadgeValue('tvHeaderUnpaid', `${kpis.unpaidCount} • ${formatGBP(kpis.unpaidAmount)}`, kpis.unpaidCount > 0 || kpis.unpaidAmount > 0);
  setHeaderBadgeValue('tvHeaderWeekRevenue', `${kpis.weekCount} • ${formatGBP(kpis.weekAmount)}`, kpis.weekCount > 0 || kpis.weekAmount > 0);

  // Persist last computed metrics and emit compact diagnostic summary
  if (typeof window !== 'undefined') {
    window.__tvLastDashboardMetrics = {
      ...kpis,
      totalJobs: kpis.totalJobsCount,
      activeJobs: kpis.activeCount,
      completedJobs: kpis.completedCount,
      todayJobs: kpis.todayCount,
      overdueJobs: kpis.overdueCount,
      upcomingJobs: kpis.upcomingCount,
      unpaidTotalGBP: kpis.unpaidAmount,
      unpaidCount: kpis.unpaidCount,
      weekRevenueGBP: kpis.weekAmount
    };
  }
  emitPipelineDiagnostic({
    source: 'metrics',
    today: kpis.todayCount,
    overdue: kpis.overdueCount,
    upcoming: kpis.upcomingCount,
    completed: kpis.completedCount,
    unpaid: kpis.unpaidAmount,
    weekRevenue: kpis.weekAmount
  });
}

/**
 * DEBUG: Log metrics to console (temporary, one-time per session)
 */
let debugLogged = false;
export function debugLogMetrics(metrics) {
  if (debugLogged) return;
  debugLogged = true;

  console.group('📊 Dashboard Metrics (DEBUG)');
  console.log('Appointments:', {
    total: metrics.totalJobs,
    active: metrics.activeJobs,
    completed: metrics.completedJobs,
    today: metrics.todayJobs,
    overdue: metrics.overdueJobs,
    upcoming: metrics.upcomingJobs
  });
  console.log('Invoices:', {
    unpaidCount: metrics.unpaidCount,
    unpaidTotal: '£' + metrics.unpaidTotalGBP.toFixed(2),
    weekRevenue: '£' + metrics.weekRevenueGBP.toFixed(2)
  });
  console.log('Today Key:', metrics._todayKey);
  console.log('Week:', metrics._weekInfo);
  console.groupEnd();
}
