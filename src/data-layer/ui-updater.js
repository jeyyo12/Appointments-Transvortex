/**
 * UI UPDATER - INCREMENTAL UI CHANGES
 * 
 * Updates UI without full re-renders:
 * - updateKPIWidgets: Update only numeric values
 * - setActiveFilter: Switch filter classes
 * - applyCurrentFilter: Show/hide appointment cards
 * - Batches updates with requestAnimationFrame
 */

import store from './store.js';
import { formatGBP, toNumber } from './formatters.js';

class UIUpdater {
  constructor() {
    this.currentFilter = null;
    this.updateScheduled = false;
  }
  
  /**
   * Update KPI display widgets (numbers only)
   * Lightweight: only updates text content, no re-renders
   * Hides badges when value is 0 or empty
   */
  updateKPIWidgets(metrics) {
    // Update job metrics
    this.updateElementText('#totalAppointments', metrics.jobs.total || 0);
    this.updateElementText('#todayAppointments', metrics.jobs.today || 0);
    this.updateElementText('#upcomingAppointments', metrics.jobs.upcoming || 0);
    this.updateElementText('#doneAppointments', metrics.jobs.completed || 0);
    
    // Update invoice metrics with visibility logic (hide if 0)
    this.updateBadgeWithVisibility('.unpaid-count', metrics.invoices.unpaidCount || 0);
    this.updateBadgeWithVisibility('.paid-count', metrics.invoices.paidCount || 0);
    this.updateBadgeWithVisibility('.total-invoices', metrics.invoices.totalCount || 0);
    
    // Update revenue metrics with visibility logic (hide if 0)
    this.updateBadgeWithVisibility('.revenue-week', this.formatCurrency(metrics.revenue.weekTotal));
    this.updateBadgeWithVisibility('.revenue-month', this.formatCurrency(metrics.revenue.monthTotal));
    this.updateBadgeWithVisibility('.revenue-unpaid', this.formatCurrency(metrics.revenue.unpaidTotal));
    this.updateBadgeWithVisibility('.revenue-today', this.formatCurrency(metrics.revenue.todayTotal));
    
    console.log('✅ KPI widgets updated:', metrics.jobs);
  }
  
  /**
   * Update mini stats under each card and summary strip
   * Displays extended metrics like overdue, unpaid, weekly revenue
   */
  updateDashboardSummary(metrics) {
    // Mini stats on individual cards
    this.updateElementText('#totalMini', `Active: ${metrics.jobs.total - metrics.jobs.completed} • Completed: ${metrics.jobs.completed}`);
    this.updateElementText('#todayMini', `Overdue: ${metrics.dashboard?.overdueCount || 0}`);
    this.updateElementText('#upcomingMini', `Next in: ${metrics.dashboard?.nextAppointmentLabel || '—'}`);
    this.updateElementText('#completedMini', `Unpaid: ${this.formatCurrency(metrics.revenue.unpaidTotal)} • Week: ${this.formatCurrency(metrics.revenue.weekTotal)}`);
    
    // Summary strip
    this.updateElementText('#summaryToday', metrics.jobs.today);
    this.updateElementText('#summaryOverdue', metrics.dashboard?.overdueCount || 0);
    this.updateElementText('#summaryPending', this.formatCurrency(metrics.revenue.unpaidTotal));
    this.updateElementText('#summaryWeek', this.formatCurrency(metrics.revenue.weekTotal));
    
    // Show summary strip if data is ready
    const summaryStrip = document.getElementById('tvSummaryStrip');
    if (summaryStrip && metrics.jobs.total > 0) {
      summaryStrip.style.display = 'flex';
    }
  }
  
  /**
   * Set active KPI filter (class-based toggle)
   * @param {string} filterId - 'total', 'today', 'upcoming', 'completed'
   */
  setActiveFilter(filterId) {
    // Remove active class from all stat cards
    document.querySelectorAll('.tvStatCard').forEach(card => {
      card.classList.remove('tvStatCard--active', 'tvStatCard--glow');
    });
    
    // Add active class to selected card
    if (filterId) {
      const selectedCard = document.querySelector(`[data-filter-id="${filterId}"]`);
      if (selectedCard) {
        selectedCard.classList.add('tvStatCard--active', 'tvStatCard--glow');
      }
    }
    
    this.currentFilter = filterId;
    console.log('✅ Active filter set:', filterId);
  }
  
  /**
   * Apply current filter to appointment list
   * Show/hide existing cards without re-render
   * @param {Array} filteredAppointments - Pre-filtered appointment array
   */
  applyCurrentFilter(filteredAppointments) {
    const container = document.getElementById('appointmentsList');
    if (!container) {
      console.warn('⚠️ Appointments container (#appointmentsList) not found');
      return;
    }
    
    // Get IDs of filtered appointments
    const visibleIds = new Set(filteredAppointments.map(apt => apt.id));
    
    // Toggle visibility for all appointment cards (using data-apt-id attribute)
    container.querySelectorAll('[data-apt-id]').forEach(card => {
      const aptId = card.getAttribute('data-apt-id');
      if (visibleIds.has(aptId)) {
        card.style.display = '';
        card.classList.remove('hidden');
      } else {
        card.style.display = 'none';
        card.classList.add('hidden');
      }
    });
    
    // Show empty state if no appointments visible
    const emptyState = document.getElementById('emptyStateAppointments');
    if (visibleIds.size === 0) {
      if (emptyState) emptyState.style.display = 'block';
    } else {
      if (emptyState) emptyState.style.display = 'none';
    }
    
    console.log(`📋 Filter applied: ${visibleIds.size} appointments visible`);
  }
  
  /**
   * Incrementally update a single appointment card
   * Called when one appointment changes
   * @param {Object} appointment
   */
  updateAppointmentCard(appointment) {
    if (!appointment || !appointment.id) return;
    
    const card = document.querySelector(`[data-apt-id="${appointment.id}"]`);
    if (!card) {
      // Silently skip - appointment not yet rendered in DOM
      return;
    }
    
    // Update status badge
    const statusEl = card.querySelector('.app-card__status-badge');
    if (statusEl) {
      statusEl.textContent = appointment.status || 'N/A';
      statusEl.className = `app-card__status-badge status-${appointment.status?.toLowerCase()}`;
    }
    
    // Update payment section if exists
    const paymentSection = card.querySelector('.app-card__payment-summary');
    if (paymentSection && appointment.total) {
      const total = toNumber(appointment.total || 0);
      const amountPaid = toNumber(appointment.amountPaid || 0);
      paymentSection.innerHTML = `
        <div class="payment-item">
          <span class="payment-label">Amount:</span>
          <span class="payment-value">${this.formatCurrency(total)}</span>
        </div>
        <div class="payment-item ${amountPaid >= total ? 'paid' : 'unpaid'}">
          <span class="payment-label">${amountPaid >= total ? 'Paid ✓' : 'Unpaid'}</span>
          <span class="payment-value">${this.formatCurrency(amountPaid >= total ? total : total - amountPaid)}</span>
        </div>
      `;
    }
    
    console.log(`✅ Appointment card updated: ${appointment.id}`);
  }
  
  /**
   * Incrementally update invoice card
   * @param {Object} invoice
   */
  updateInvoiceCard(invoice) {
    if (!invoice || !invoice.id) return;
    
    const card = document.querySelector(`[data-invoice-id="${invoice.id}"]`);
    if (!card) return;
    
    // Update paid status
    const paidEl = card.querySelector('.invoice-paid-status');
    if (paidEl) {
      const isPaid = invoice.paid === true || (invoice.amountPaid >= invoice.total);
      paidEl.className = `invoice-paid-status ${isPaid ? 'paid' : 'unpaid'}`;
      paidEl.textContent = isPaid ? '✅ Paid' : '⏳ Unpaid';
    }
    
    // Update paid amount
    const paidAmountEl = card.querySelector('.invoice-paid-amount');
    if (paidAmountEl) {
      paidAmountEl.textContent = this.formatCurrency(invoice.amountPaid || 0);
    }
    
    // Update total
    const totalEl = card.querySelector('.invoice-total');
    if (totalEl) {
      totalEl.textContent = this.formatCurrency(invoice.total || 0);
    }
    
    console.log(`✅ Invoice card updated: ${invoice.id}`);
  }
  
  /**
   * Batch update multiple UI elements using requestAnimationFrame
   * Prevents layout thrashing
   * @param {Function} updateFn - Function that performs UI updates
   */
  batchUpdate(updateFn) {
    if (this.updateScheduled) return;
    
    this.updateScheduled = true;
    requestAnimationFrame(() => {
      try {
        updateFn();
      } catch (error) {
        console.error('❌ Batch update error:', error);
      } finally {
        this.updateScheduled = false;
      }
    });
  }
  
  /**
   * Show empty state message
   * @private
   */
  showEmptyState(container, message) {
    let emptyEl = container.querySelector('.empty-state');
    if (!emptyEl) {
      emptyEl = document.createElement('div');
      emptyEl.className = 'empty-state';
      container.appendChild(emptyEl);
    }
    emptyEl.textContent = message;
    emptyEl.style.display = 'block';
  }
  
  /**
   * Hide empty state message
   * @private
   */
  hideEmptyState(container) {
    const emptyEl = container.querySelector('.empty-state');
    if (emptyEl) {
      emptyEl.style.display = 'none';
    }
  }
  
  /**
   * Update element text content if element exists
   * Silently skips missing elements (they may be optional/workspace-specific)
   * @private
   */
  updateElementText(selector, value) {
    const el = document.querySelector(selector);
    if (el) {
      const oldValue = el.textContent;
      el.textContent = value;
      if (oldValue !== String(value)) {
        console.log(`✏️ DOM Updated: ${selector} "${oldValue}" → "${value}"`);
      }
    }
    // Silently skip missing elements - they may be workspace-specific or optional
  }

  /**
   * Update badge element with smart visibility
   * Hides badge if value is 0 or "£0.00"
   * Silently skips if element doesn't exist (optional/legacy badges)
   * @private
   */
  updateBadgeWithVisibility(selector, value) {
    const el = document.querySelector(selector);
    if (!el) {
      // Silently skip - these are optional legacy badges
      return;
    }

    // Check if value is 0 or "£0.00" style values
    const isZero = value === 0 || value === '0' || value === '£0.00' || value === '0.00';
    
    if (isZero) {
      // Hide badge if value is zero (no meaningless 0/£0)
      el.style.display = 'none';
      el.setAttribute('data-hidden', 'true');
      console.log(`🙈 Badge hidden (zero value): ${selector}`);
    } else {
      // Show badge if value is not zero
      el.style.display = 'inline-block';
      el.removeAttribute('data-hidden');
      el.textContent = value;
      console.log(`✏️ Badge updated: ${selector} → "${value}"`);
    }
  }
  
  /**
   * Format currency for display (GBP)
   * Uses centralized formatter from data layer
   * @private
   */
  formatCurrency(amount) {
    return formatGBP(amount);
  }
  
  /**
   * Format date for display
   * @private
   */
  formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat('ro-RO').format(date);
    } catch (e) {
      return dateStr;
    }
  }

  /**
   * Debug: Log which badge elements exist in DOM
   * These are optional/legacy badges - it's OK if they don't exist
   * Enable logging with: window.__DEBUG_DIAGNOSTICS = true; location.reload();
   */
  debugBadgeElements() {
    // Skip unless explicitly enabled for debugging
    if (window.__DEBUG_DIAGNOSTICS !== true) return;
    
    console.log('🔍 [UI Updater] Badge Element Scan:');
    
    const selectors = [
      '.unpaid-count',
      '.paid-count',
      '.total-invoices',
      '.revenue-week',
      '.revenue-month',
      '.revenue-unpaid',
      '.revenue-today'
    ];

    const found = [];
    const missing = [];

    selectors.forEach(selector => {
      const el = document.querySelector(selector);
      if (el) {
        found.push(`✅ ${selector}`);
      } else {
        missing.push(`❌ ${selector}`);
      }
    });

    found.forEach(msg => console.log(msg));
    if (missing.length > 0) {
      missing.forEach(msg => console.warn(msg));
    }

    console.log(`📊 Found ${found.length}/${selectors.length} badge elements`);
  }
}

// Create singleton instance
const uiUpdater = new UIUpdater();

export { uiUpdater };
export default uiUpdater;
