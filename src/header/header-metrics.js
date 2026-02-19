/**
 * HEADER METRICS - LIVE DATA FOR SAAS COMMAND BAR
 * 
 * Computes and updates header badges from store data:
 * - Today Jobs (count)
 * - Overdue (count)
 * - Unpaid (count + £total)
 * - Week Revenue (£total, paid invoices only)
 * 
 * Single source of truth: window._dataLayer.store
 * Auto-updates whenever store data changes.
 */

import { computeDashboardKPIs } from '../metrics/dashboard-metrics.js';

class HeaderMetrics {
  constructor(store) {
    this.store = store;
    this.lastMetrics = null;
    this.initialized = false;
    this.updateCount = 0;
    
    // Bind store listener to update whenever data changes
    if (store) {
      this.unsubscribe = store.subscribe((event) => {
        // Update on any data change (appointments or invoices)
        if (event.type === 'appointmentChanged' || event.type === 'invoiceChanged' || event.type === 'metricsUpdated') {
          this.update();
        }
      });
    }
  }

  /**
   * Compute all header metrics from store
   * @returns {Object} Metrics object
   */
  compute() {
    const appointments = Array.isArray(window.appointments)
      ? window.appointments
      : (this.store?.getAllAppointments?.() || []);
    const invoices = Array.isArray(window.allInvoices) ? window.allInvoices : [];
    const kpis = computeDashboardKPIs(appointments, invoices);

    const metrics = {
      today: {
        count: kpis.todayCount,
        label: 'Today'
      },
      overdue: {
        count: kpis.overdueCount,
        label: 'Overdue'
      },
      unpaid: {
        count: kpis.unpaidCount,
        total: kpis.unpaidAmount,
        label: 'Unpaid'
      },
      weekRevenue: {
        total: kpis.weekAmount,
        label: 'Week Revenue'
      }
    };

    this.lastMetrics = metrics;
    return metrics;
  }

  /**
   * Get appointment date (handles multiple date fields)
   * @private
   */
  getAppointmentDate(apt) {
    if (apt.appointmentDate) return new Date(apt.appointmentDate);
    if (apt.startAt) return apt.startAt instanceof Date ? apt.startAt : new Date(apt.startAt);
    if (apt.dateStr) return new Date(apt.dateStr);
    return null;
  }

  /**
   * Update header UI with latest metrics
   * Only updates text/display if values changed
   */
  update() {
    const metrics = this.compute();
    this.updateCount++;
    
    this.updateBadge('tvHeaderToday', metrics.today.count, 'Today');
    this.updateBadge('tvHeaderOverdue', metrics.overdue.count, 'Overdue');
    this.updateBadgeCurrency('tvHeaderUnpaid', metrics.unpaid.count, metrics.unpaid.total, 'Unpaid');
    this.updateBadgeCurrency('tvHeaderWeekRevenue', null, metrics.weekRevenue.total, 'Week Revenue');

    // Unified one-line pipeline diagnostic (debounced in metrics module)
    if (typeof window !== 'undefined' && typeof window.__tvEmitPipelineDiag === 'function') {
      window.__tvEmitPipelineDiag({
        today: metrics.today.count,
        overdue: metrics.overdue.count,
        unpaid: metrics.unpaid.total,
        weekRevenue: metrics.weekRevenue.total
      });
    }
  }

  /**
   * Update a simple count badge
   * @private
   */
  updateBadge(elementId, count, label) {
    const badge = document.getElementById(elementId);
    if (!badge) return;

    if (count > 0) {
      badge.style.display = 'flex';
      const valueEl = badge.querySelector('.indicator-value');
      const labelEl = badge.querySelector('.indicator-label');
      if (valueEl) valueEl.textContent = String(count);
      if (labelEl) labelEl.textContent = label;
    } else {
      badge.style.display = 'none';
    }
  }

  /**
   * Update a badge with currency
   * Hide if zero value
   * @private
   */
  updateBadgeCurrency(elementId, count, total, label) {
    const badge = document.getElementById(elementId);
    if (!badge) return;

    // Hide if total is 0 or negative (strict UI rule: no meaningless £0)
    if (total <= 0) {
      badge.style.display = 'none';
      return;
    }

    badge.style.display = 'flex';
    const valueEl = badge.querySelector('.indicator-value');
    const labelEl = badge.querySelector('.indicator-label');
    
    if (valueEl) {
      // Format: "£100.00" or "3 • £100.00"
      if (count !== null && count > 0) {
        valueEl.textContent = `${count} • £${total.toFixed(2)}`;
      } else {
        valueEl.textContent = `£${total.toFixed(2)}`;
      }
    }
    if (labelEl) labelEl.textContent = label;
  }

  /**
   * Get empty metrics object
   * @private
   */
  getEmptyMetrics() {
    return {
      today: { count: 0, label: 'Today' },
      overdue: { count: 0, label: 'Overdue' },
      unpaid: { count: 0, total: 0, label: 'Unpaid' },
      weekRevenue: { total: 0, label: 'Week Revenue' }
    };
  }

  /**
   * Clean up listeners
   */
  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}

export { HeaderMetrics };
export default HeaderMetrics;
