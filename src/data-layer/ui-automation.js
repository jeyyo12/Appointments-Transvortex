/**
 * UI Automation Layer
 * Manages automation feed panel, quick actions, and alert UI updates
 */

import { automationEngine } from './automation.js';
import { store } from './store.js';
import { formatGBP } from './formatters.js';

class UIAutomation {
  constructor() {
    this.feedOpen = false;
    this.lastAlertCount = 0;
    this.dataActions = null; // Will be set during initialization
  }

  /**
   * Set the DataActions instance (called during initialization)
   */
  setDataActions(dataActions) {
    this.dataActions = dataActions;
  }

  /**
   * Initialize automation UI panel in DOM
   * Called once during app init
   */
  initAutomationFeed() {
    // Create feed panel if it doesn't exist
    if (document.getElementById('tvAutomationFeed')) {
      return; // Already exists
    }

    const feedHTML = `
      <div id="tvAutomationFeed" class="tv-automation-feed" style="display: none;">
        <div class="tv-feed-header">
          <span class="tv-feed-title">Automation Alerts</span>
          <button class="tv-feed-close" aria-label="Close alerts">×</button>
        </div>
        <div class="tv-feed-alerts" id="tvFeedAlerts"></div>
        <div class="tv-feed-footer">
          <small>Click alert to filter and jump to item</small>
        </div>
      </div>
    `;

    // Inject before main content
    const mainContent = document.querySelector('.tv-main-container') || document.body;
    const feedPanel = document.createElement('div');
    feedPanel.innerHTML = feedHTML;
    mainContent.parentNode.insertBefore(feedPanel.firstElementChild, mainContent);

    // Attach event listeners
    this.attachFeedEventListeners();
  }

  /**
   * Attach feed event listeners
   * @private
   */
  attachFeedEventListeners() {
    const closeBtn = document.querySelector('.tv-feed-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeFeed());
    }

    // Event delegation for alert actions
    document.addEventListener('click', (e) => {
      if (e.target.closest('.tv-alert-item')) {
        const alertId = e.target.closest('.tv-alert-item').dataset.alertId;
        this.handleAlertClick(alertId);
      }

      if (e.target.closest('.tv-alert-dismiss')) {
        e.stopPropagation();
        const alertId = e.target.closest('.tv-alert-item').dataset.alertId;
        this.dismissAlert(alertId);
      }
    });
  }

  /**
   * Update feed panel with latest alerts
   */
  updateFeed() {
    const alerts = automationEngine.getTopAlerts();
    const feedAlerts = document.getElementById('tvFeedAlerts');

    if (alerts.length === 0) {
      this.closeFeed();
      return;
    }

    // Auto-open feed if alert count changed
    if (alerts.length > this.lastAlertCount) {
      this.openFeed();
    }
    this.lastAlertCount = alerts.length;

    // Render alerts
    feedAlerts.innerHTML = alerts.map(alert => `
      <div class="tv-alert-item" data-alert-id="${alert.id}" data-type="${alert.type}">
        <div class="tv-alert-icon">
          ${this.getAlertIcon(alert.type)}
        </div>
        <div class="tv-alert-content">
          <div class="tv-alert-title">${alert.title}</div>
          <div class="tv-alert-desc">${alert.description}</div>
        </div>
        <button class="tv-alert-dismiss" aria-label="Dismiss" data-alert-id="${alert.id}">✕</button>
      </div>
    `).join('');
  }

  /**
   * Get icon for alert type
   * @private
   */
  getAlertIcon(type) {
    const icons = {
      overdue: '⏰',
      uninvoiced: '📋',
      unpaid: '💷',
      today: '📅'
    };
    return icons[type] || '●';
  }

  /**
   * Handle alert click
   */
  handleAlertClick(alertId) {
    const alerts = automationEngine.getTopAlerts();
    const alert = alerts.find(a => a.alertId === alertId);

    if (!alert) return;

    // Apply filter based on alert type
    if (alert.action === 'filter') {
      window._dataLayer?.applyFilter(alert.actionTarget);
    }

    // Dismiss alert after action
    this.dismissAlert(alertId);
  }

  /**
   * Dismiss an alert
   */
  dismissAlert(alertId) {
    automationEngine.dismissAlert(alertId);
    this.updateFeed();
  }

  /**
   * Open feed panel
   */
  openFeed() {
    const feed = document.getElementById('tvAutomationFeed');
    if (feed && !this.feedOpen) {
      feed.style.display = 'block';
      this.feedOpen = true;
    }
  }

  /**
   * Close feed panel
   */
  closeFeed() {
    const feed = document.getElementById('tvAutomationFeed');
    if (feed && this.feedOpen) {
      feed.style.display = 'none';
      this.feedOpen = false;
    }
  }

  /**
   * Add quick action button to appointment row
   * Based on automation state
   */
  renderAppointmentQuickActions(appointmentId) {
    const state = automationEngine.getAutomationState();
    const actions = [];

    // Check if overdue
    if (state.overdueAppointments.some(a => a.id === appointmentId)) {
      actions.push({
        label: 'Mark Complete',
        action: 'mark-complete',
        targetId: appointmentId,
        style: 'urgent'
      });

      actions.push({
        label: 'Reschedule',
        action: 'reschedule',
        targetId: appointmentId,
        style: 'secondary'
      });
    }

    // Check if completed but uninvoiced
    if (state.uninvoicedCompleted.some(a => a.id === appointmentId)) {
      actions.push({
        label: 'Generate Invoice',
        action: 'generate-invoice',
        targetId: appointmentId,
        style: 'primary'
      });
    }

    return actions;
  }

  /**
   * Add quick action button to invoice row
   */
  renderInvoiceQuickActions(invoiceId) {
    const state = automationEngine.getAutomationState();
    const actions = [];

    // Check if unpaid
    if (state.unpaidInvoices.some(i => i.id === invoiceId)) {
      actions.push({
        label: 'Mark Paid',
        action: 'mark-paid',
        targetId: invoiceId,
        style: 'primary'
      });

      actions.push({
        label: 'Send Reminder',
        action: 'send-reminder',
        targetId: invoiceId,
        style: 'secondary'
      });
    }

    return actions;
  }

  /**
   * Execute quick action
   */
  async executeQuickAction(action, targetId) {
    try {
      switch (action) {
        case 'mark-complete':
          await this.markAppointmentComplete(targetId);
          break;

        case 'reschedule':
          await this.triggerRescheduleModal(targetId);
          break;

        case 'generate-invoice':
          await this.generateInvoice(targetId);
          break;

        case 'mark-paid':
          await this.markInvoicePaid(targetId);
          break;

        case 'send-reminder':
          await this.sendPaymentReminder(targetId);
          break;

        default:
          console.warn('Unknown action:', action);
      }
    } catch (e) {
      console.error('❌ Quick action failed:', e);
    }
  }

  /**
   * Mark appointment complete
   * @private
   */
  async markAppointmentComplete(appointmentId) {
    if (!this.dataActions) {
      console.warn('⚠️ DataActions not available for quick action');
      return;
    }

    try {
      await this.dataActions.markAppointmentCompleted(appointmentId);
      console.log('✅ Appointment marked complete:', appointmentId);
    } catch (e) {
      console.error('❌ Failed to mark appointment complete:', e);
    }
  }

  /**
   * Trigger reschedule modal
   * @private
   */
  async triggerRescheduleModal(appointmentId) {
    const apt = store.getAppointmentById(appointmentId);
    if (!apt) return;

    // Dispatch custom event for modal system to handle
    const event = new CustomEvent('appointment-reschedule', {
      detail: { appointmentId, appointment: apt }
    });
    document.dispatchEvent(event);
  }

  /**
   * Generate invoice from completed appointment
   * @private
   */
  async generateInvoice(appointmentId) {
    if (!this.dataActions) {
      console.warn('⚠️ DataActions not available for quick action');
      return;
    }

    const apt = store.getAppointmentById(appointmentId);
    if (!apt) return;

    try {
      // Create basic invoice from appointment
      const invoice = {
        appointmentId,
        clientName: apt.customerName || apt.clientName || 'Client',
        total: apt.estimatedCost || apt.cost || 0,
        invoiceDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        description: apt.title || 'Professional Services',
        paid: false,
        amountPaid: 0,
        notes: `Invoice for appointment: ${apt.title || 'Service'}`
      };

      await this.dataActions.upsertInvoice(invoice);
      console.log('✅ Invoice generated for appointment:', appointmentId);
    } catch (e) {
      console.error('❌ Failed to generate invoice:', e);
    }
  }

  /**
   * Mark invoice as paid
   * @private
   */
  async markInvoicePaid(invoiceId) {
    if (!this.dataActions) {
      console.warn('⚠️ DataActions not available for quick action');
      return;
    }

    try {
      const inv = store.getInvoiceById(invoiceId);
      const totalAmount = inv?.total || 0;
      
      await this.dataActions.markInvoicePaid(invoiceId, totalAmount);
      console.log('✅ Invoice marked paid:', invoiceId);
    } catch (e) {
      console.error('❌ Failed to mark invoice paid:', e);
    }
  }

  /**
   * Get invoice total
   * @private
   */
  async getInvoiceTotal(invoiceId) {
    const inv = store.getInvoiceById(invoiceId);
    return inv?.total || 0;
  }

  /**
   * Send payment reminder (in-app notification)
   * @private
   */
  async sendPaymentReminder(invoiceId) {
    const inv = store.getInvoiceById(invoiceId);
    if (!inv) return;

    const message = `Payment reminder: Invoice #${invoiceId} for £${formatGBP(inv.total)} is due soon.`;

    // Store reminder in state or trigger notification
    const event = new CustomEvent('payment-reminder', {
      detail: { invoiceId, message }
    });
    document.dispatchEvent(event);

    console.log('✅ Payment reminder sent for invoice:', invoiceId);
  }

  /**
   * Render badge for appointment row
   * @param appointmentId
   * @returns HTML string or null
   */
  getAppointmentBadgeHTML(appointmentId) {
    const state = automationEngine.getAutomationState();

    if (state.overdueAppointments.some(a => a.id === appointmentId)) {
      return '<span class="tv-badge tv-badge--urgent">Overdue</span>';
    }

    if (state.uninvoicedCompleted.some(a => a.id === appointmentId)) {
      return '<span class="tv-badge tv-badge--warning">Invoice Missing</span>';
    }

    return null;
  }

  /**
   * Render badge for invoice row
   * @param invoiceId
   * @returns HTML string or null
   */
  getInvoiceBadgeHTML(invoiceId) {
    const state = automationEngine.getAutomationState();

    if (state.unpaidInvoices.some(i => i.id === invoiceId)) {
      return '<span class="tv-badge tv-badge--payment">Unpaid</span>';
    }

    return null;
  }
}

// Singleton instance
const uiAutomation = new UIAutomation();

export { uiAutomation };
export default uiAutomation;
