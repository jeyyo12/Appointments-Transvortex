/**
 * SaaS Pro Automation System
 * Detects operational states and triggers workflow automation
 * 
 * Rules:
 * - Overdue job detection (date < now, not completed/cancelled)
 * - Completed without invoice
 * - Unpaid invoice follow-up
 * - Next appointment countdown
 * - Today focus mode
 */

import { store } from './store.js';

const COMPLETED_STATUSES = new Set(['completed', 'finalized']);

class AutomationEngine {
  constructor() {
    this.automationState = {
      overdueAppointments: [],
      uninvoicedCompleted: [],
      unpaidInvoices: [],
      nextAppointmentId: null,
      nextAppointmentTime: null,
      countdownSeconds: 0,
      todayJobCount: 0
    };
    
    this.dismissedAlerts = new Set();
    this.loadDismissedAlerts();
  }

  /**
   * Compute all automation state from current store data
   * Called on data changes (not on animation frame)
   */
  computeAutomationState() {
    const appointments = store.getAllAppointments();
    const invoices = store.getAllInvoices();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // A) OVERDUE JOB DETECTION
    const overdueAppointments = [];
    appointments.forEach(apt => {
      if (!apt.id) return;
      
      // Normalize status
      const status = this.normalizeStatus(apt.status);
      
      // Skip completed and cancelled
      if (status === 'completed' || status === 'cancelled') {
        return;
      }
      
      try {
        const aptDate = new Date(apt.appointmentDate || apt.startAt);
        const aptDateNormalized = new Date(aptDate.getFullYear(), aptDate.getMonth(), aptDate.getDate());
        
        // If date is in the past and not completed, it's overdue
        if (aptDateNormalized < today) {
          overdueAppointments.push({
            id: apt.id,
            title: apt.title || apt.name || 'Untitled',
            date: aptDate,
            status
          });
        }
      } catch (e) {
        console.warn('⚠️ Invalid appointment date:', apt.appointmentDate || apt.startAt);
      }
    });

    // B) COMPLETED WITHOUT INVOICE
    const uninvoicedCompleted = [];
    const invoicedAppointmentIds = new Set();
    
    // Collect all appointment IDs that have invoices (check multiple field names)
    invoices.forEach(inv => {
      if (!inv?.id || String(inv.id).startsWith('missing-')) return;
      const linkId = inv.appointmentId;
      if (linkId) {
        invoicedAppointmentIds.add(String(linkId).trim());
      }
    });
    
    appointments.forEach(apt => {
      if (!apt.id) return;
      const status = this.normalizeStatus(apt.status);
      
      if (COMPLETED_STATUSES.has(status) && !invoicedAppointmentIds.has(String(apt.id).trim())) {
        uninvoicedCompleted.push({
          id: apt.id,
          title: apt.title || apt.name || 'Untitled',
          date: apt.appointmentDate || apt.startAt
        });
      }
    });

    // C) UNPAID INVOICE FOLLOW-UP
    const unpaidInvoices = [];
    invoices.forEach(inv => {
      if (!inv.id) return;
      
      // Check payment status robustly (matches dashboard-metrics.js logic)
      const total = inv.total || inv.totalAmount || inv.grandTotal || inv.amount || 0;
      const paidAmount = inv.paidAmount || inv.amountPaid || inv.paidAmountGBP || 0;
      const balanceDue = Math.max(0, total - paidAmount);
      const explicitStatus = (inv.paymentStatus || inv.status || '').toLowerCase();
      const paidFlag = inv.paid === true;
      
      const isPaid = explicitStatus === 'paid' || paidFlag || balanceDue <= 0 || (total > 0 && paidAmount >= total);
      
      if (!isPaid) {
        const linkId = inv.appointmentId || null;
        unpaidInvoices.push({
          id: inv.id,
          appointmentId: linkId || null,
          amount: total,
          dueDate: inv.dueDate || inv.createdAt,
          clientName: inv.clientName || inv.customerName || 'Unknown Client'
        });
      }
    });

    // D) NEXT APPOINTMENT COUNTDOWN
    let nextAppointmentId = null;
    let nextAppointmentTime = null;
    
    let earliestFuture = null;
    appointments.forEach(apt => {
      if (!apt.id) return;
      const status = this.normalizeStatus(apt.status);
      if (status === 'completed' || status === 'cancelled') return;
      
      try {
        const aptDate = new Date(apt.appointmentDate || apt.startAt);
        if (aptDate >= now && (!earliestFuture || aptDate < earliestFuture)) {
          earliestFuture = aptDate;
          nextAppointmentId = apt.id;
          nextAppointmentTime = aptDate;
        }
      } catch (e) {
        // Skip invalid dates
      }
    });

    // E) TODAY JOB COUNT
    let todayJobCount = 0;
    appointments.forEach(apt => {
      if (!apt.id) return;
      const status = this.normalizeStatus(apt.status);
      if (status === 'completed' || status === 'cancelled') return;
      
      try {
        const aptDate = new Date(apt.appointmentDate || apt.startAt);
        const aptDateNormalized = new Date(aptDate.getFullYear(), aptDate.getMonth(), aptDate.getDate());
        if (aptDateNormalized.getTime() === today.getTime()) {
          todayJobCount++;
        }
      } catch (e) {
        // Skip invalid dates
      }
    });

    // Update state
    this.automationState = {
      overdueAppointments,
      uninvoicedCompleted,
      unpaidInvoices,
      nextAppointmentId,
      nextAppointmentTime,
      countdownSeconds: nextAppointmentTime ? Math.floor((nextAppointmentTime - now) / 1000) : 0,
      todayJobCount
    };

    return this.automationState;
  }

  /**
   * Get current automation state for UI
   */
  getAutomationState() {
    return { ...this.automationState };
  }

  /**
   * Get top 3 alerts for feed panel
   */
  getTopAlerts() {
    const alerts = [];

    // Alert 1: Overdue count
    if (this.automationState.overdueAppointments.length > 0) {
      const id = 'overdue-' + this.automationState.overdueAppointments.length;
      if (!this.dismissedAlerts.has(id)) {
        alerts.push({
          id,
          type: 'overdue',
          title: `${this.automationState.overdueAppointments.length} Job(s) Overdue`,
          description: 'Mark complete or reschedule',
          action: 'filter',
          actionTarget: 'overdue'
        });
      }
    }

    // Alert 2: Uninvoiced completed
    if (this.automationState.uninvoicedCompleted.length > 0) {
      const id = 'uninvoiced-' + this.automationState.uninvoicedCompleted.length;
      if (!this.dismissedAlerts.has(id)) {
        alerts.push({
          id,
          type: 'uninvoiced',
          title: `${this.automationState.uninvoicedCompleted.length} Invoice(s) Missing`,
          description: 'Generate invoices for completed jobs',
          action: 'filter',
          actionTarget: 'uninvoiced'
        });
      }
    }

    // Alert 3: Unpaid invoices
    if (this.automationState.unpaidInvoices.length > 0) {
      const totalUnpaid = this.automationState.unpaidInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
      const id = 'unpaid-' + this.automationState.unpaidInvoices.length;
      if (!this.dismissedAlerts.has(id)) {
        alerts.push({
          id,
          type: 'unpaid',
          title: `${this.automationState.unpaidInvoices.length} Unpaid Invoice(s)`,
          description: `Total: £${totalUnpaid.toFixed(2)}`,
          action: 'filter',
          actionTarget: 'unpaid'
        });
      }
    }

    return alerts.slice(0, 3);
  }

  /**
   * Dismiss an alert
   */
  dismissAlert(alertId) {
    this.dismissedAlerts.add(alertId);
    this.saveDismissedAlerts();
  }

  /**
   * Restore alert (undo dismiss)
   */
  restoreAlert(alertId) {
    this.dismissedAlerts.delete(alertId);
    this.saveDismissedAlerts();
  }

  /**
   * Persist dismissed alerts to localStorage
   */
  saveDismissedAlerts() {
    try {
      localStorage.setItem('tv_dismissed_alerts', JSON.stringify(Array.from(this.dismissedAlerts)));
    } catch (e) {
      console.warn('⚠️ Could not save dismissed alerts:', e);
    }
  }

  /**
   * Load dismissed alerts from localStorage
   */
  loadDismissedAlerts() {
    try {
      const stored = localStorage.getItem('tv_dismissed_alerts');
      if (stored) {
        this.dismissedAlerts = new Set(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('⚠️ Could not load dismissed alerts:', e);
    }
  }

  /**
   * Clear all dismissed alerts (e.g., on full refresh)
   */
  clearDismissedAlerts() {
    this.dismissedAlerts.clear();
    this.saveDismissedAlerts();
  }

  /**
   * Normalize appointment status (handle Romanian + English variants)
   * @private
   */
  normalizeStatus(status) {
    if (!status) return '';
    
    const normalized = status.toLowerCase()
      .replace(/[àáâăäandèéêëiòóôõöuùúûüûăîșț]/g, c => ({
        à:'a', á:'a', â:'a', ă:'a', ä:'a', è:'e', é:'e', ê:'e', ë:'e', i:'i',
        ò:'o', ó:'o', ô:'o', õ:'o', ö:'o', u:'u', ù:'u', ú:'u', û:'u', ü:'u',
        ă:'a', î:'i', ș:'s', ț:'t'
      }[c] || c));
    
    // Map Romanian to English
    const statusMap = {
      'completă': 'completed',
      'scheduled': 'scheduled',
      'confirmed': 'confirmed',
      'cancelled': 'cancelled',
      'anulată': 'cancelled',
      'active': 'active'
    };
    
    return statusMap[normalized] || normalized;
  }

  /**
   * Update countdown every second (called by scheduler)
   * Returns true if countdown changed
   */
  updateCountdown() {
    if (!this.automationState.nextAppointmentTime) {
      this.automationState.countdownSeconds = 0;
      return false;
    }

    const now = new Date();
    const newCountdown = Math.floor((this.automationState.nextAppointmentTime - now) / 1000);
    
    if (newCountdown !== this.automationState.countdownSeconds) {
      this.automationState.countdownSeconds = newCountdown;
      return true;
    }

    return false;
  }
}

// Singleton instance
const automationEngine = new AutomationEngine();

export { automationEngine };
export default automationEngine;
