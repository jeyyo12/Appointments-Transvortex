/**
 * APPOINTMENTS UI RENDERER - SaaS Premium Panel
 * 
 * Handles:
 * 1. Rendering appointment cards with SaaS styling
 * 2. Status pills (Today, Upcoming, Overdue, Completed)
 * 3. Quick actions (View, Complete, Invoice, Call)
 * 4. Automation badges (Overdue, Invoice Missing, Unpaid)
 * 5. Professional empty states
 */

class AppointmentsUIRenderer {
  constructor(appointmentsManager) {
    this.manager = appointmentsManager;
    this.container = null;
    this.debounceTimer = null;
  }

  /**
   * Initialize renderer with DOM elements
   */
  init() {
    this.container = document.getElementById('appointmentsList');
    if (!this.container) {
      console.warn('⚠️ Appointments container (#appointmentsList) not found');
      return false;
    }
    return true;
  }

  /**
   * Render all filtered appointments
   */
  render() {
    if (!this.container) return;

    const appointments = this.manager.getFiltered();

    // Update count badge
    this.updateCountBadge(appointments);

    if (appointments.length === 0) {
      this.renderEmpty();
      return;
    }

    let html = '<div class="apts-list">';

    appointments.forEach(apt => {
      html += this.renderAppointmentCard(apt);
    });

    html += '</div>';
    this.container.innerHTML = html;

    // Attach event listeners
    this.attachEventListeners();
  }

  /**
   * Render empty state
   * @private
   */
  renderEmpty() {
    const emptyState = document.getElementById('emptyStateAppointments');
    if (emptyState) {
      emptyState.style.display = 'block';
      emptyState.querySelector('h3').textContent = 'No appointments match this filter';
      emptyState.querySelector('p').textContent = this.manager.searchTerm
        ? 'Try adjusting your search terms'
        : 'Create your first appointment to get started';
    }
    this.container.innerHTML = '';
  }

  /**
   * Render a single appointment card
   * @private
   */
  renderAppointmentCard(apt) {
    const aptDate = this.manager.getAppointmentDate ? this.manager.getAppointmentDate(apt) : null;
    const status = this.manager.normalizeStatus(apt.status);

    // Format date and time
    const dateStr = aptDate ? this.formatDateUK(aptDate) : 'No date';
    const timeStr = aptDate ? this.formatTime(aptDate) : '';

    // Get status pill
    const statusPill = this.getStatusPill(apt, aptDate, status);

    // Get badges (automation)
    const badges = this.getAutomationBadges(apt);

    // Vehicle info
    const vehicle = apt.vehicleMakeModel || apt.makeModel || apt.vehicle || apt.car || 'Vehicle TBD';
    const regPlate = apt.registrationPlate || apt.regNumber || '';

    // Customer
    const customer = apt.customerName || apt.name || 'Unknown';
    const phone = apt.customerPhone || apt.phone || '';

    // Quick actions
    const actions = this.getQuickActions(apt, status);

    // Next-action hint
    const hint = this.getNextActionHint(apt, status, aptDate);

    return `
      <div class="apts-card" data-apt-id="${apt.id}">
        <div class="apts-card__header">
          <div class="apts-card__customer">
            <strong>${this.escapeHtml(customer)}</strong>
            ${statusPill}
          </div>
          <div class="apts-card__badges">
            ${badges}
          </div>
        </div>

        <div class="apts-card__meta">
          <span class="apts-meta__item">
            <i class="fas fa-calendar"></i> ${dateStr}
          </span>
          ${timeStr ? `<span class="apts-meta__item"><i class="fas fa-clock"></i> ${timeStr}</span>` : ''}
          <span class="apts-meta__item">
            <i class="fas fa-car"></i> ${this.escapeHtml(vehicle)}
            ${regPlate ? ` • ${this.escapeHtml(regPlate)}` : ''}
          </span>
        </div>

        ${phone ? `<div class="apts-card__phone"><i class="fas fa-phone"></i> ${this.escapeHtml(phone)}</div>` : ''}

        ${hint ? `<div class="apts-card__hint">${hint}</div>` : ''}

        <div class="apts-card__actions">
          ${actions}
        </div>
      </div>
    `;
  }

  /**
   * Get status pill HTML
   * @private
   */
  getStatusPill(apt, aptDate, status) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const aptDateNorm = aptDate
      ? new Date(aptDate.getFullYear(), aptDate.getMonth(), aptDate.getDate())
      : null;

    let pillClass = 'apts-pill';
    let pillText = '';

    if (status === 'completed') {
      pillClass += ' apts-pill--completed';
      pillText = 'Completed';
    } else if (aptDateNorm && aptDateNorm.getTime() === today.getTime()) {
      pillClass += ' apts-pill--today';
      pillText = 'Today';
    } else if (aptDateNorm && aptDateNorm < today) {
      pillClass += ' apts-pill--overdue';
      pillText = 'Overdue';
    } else {
      pillClass += ' apts-pill--upcoming';
      pillText = 'Upcoming';
    }

    return `<span class="${pillClass}">${pillText}</span>`;
  }

  /**
   * Get automation badges
   * @private
   */
  getAutomationBadges(apt) {
    let badges = '';

    // Check for overdue (if automation engine available)
    if (window._dataLayer?.automationEngine) {
      const state = window._dataLayer.automationEngine.getAutomationState();

      if (state.overdueAppointments?.some(a => a.id === apt.id)) {
        badges += '<span class="apts-badge apts-badge--overdue" title="Overdue">⏰ Overdue</span>';
      }

      if (state.uninvoicedCompleted?.some(a => a.id === apt.id)) {
        badges += '<span class="apts-badge apts-badge--warning" title="Invoice Missing">📋 Invoice Missing</span>';
      }
    }

    return badges;
  }

  /**
   * Get quick actions HTML with primary + secondary action rows
   * Primary:   Invoice (orange) | Mark Complete / Mark Paid (green)
   * Secondary: View/Edit (ghost) | Call (if phone present)
   * @private
   */
  getQuickActions(apt, status) {
    const isCompleted  = status === 'completed';
    const isCancelled  = status === 'cancelled';
    const phone        = apt.customerPhone || apt.phone || '';

    // Resolve payment state — only usable when invoice exists
    const invoiceId = apt.invoiceId || null;
    const storedPaid = (apt.paymentStatus || '').toLowerCase() === 'paid';
    const computedPaid = Number(apt.amountPaid || 0) > 0 &&
                         Number(apt.amountPaid || 0) >= Number(apt.total || apt.estimatedCost || 0);
    const isPaid = storedPaid || computedPaid;

    // ── Primary row ──
    let primary = '';

    if (isCompleted) {
      // Invoice button (orange) — always present for completed appointments
      primary += `<button class="apts-action-btn apts-action-btn--invoice" onclick="window._dataLayer?.executeQuickAction?.('generate-invoice','${apt.id}')" title="Open / generate invoice">
        <i class="fas fa-file-invoice"></i> <span>Invoice</span>
      </button>`;
      // Mark Paid — only if an invoiceId is known AND not already paid
      if (invoiceId && !isPaid) {
        primary += `<button class="apts-action-btn apts-action-btn--success" onclick="window._dataLayer?.executeQuickAction?.('mark-paid','${invoiceId}')" title="Mark invoice as paid">
          <i class="fas fa-pound-sign"></i> <span>Mark Paid</span>
        </button>`;
      } else if (isPaid) {
        primary += `<span class="apts-pill apts-pill--paid" title="Invoice paid"><i class="fas fa-check-circle"></i> Paid</span>`;
      }
    } else if (!isCancelled) {
      // Mark Complete (green) — spans both columns if no other primary button
      primary += `<button class="apts-action-btn apts-action-btn--success apts-action-btn--full" onclick="window._dataLayer?.executeQuickAction?.('mark-complete','${apt.id}')" title="Mark appointment as complete">
        <i class="fas fa-check"></i> <span>Mark Complete</span>
      </button>`;
    }

    // ── Secondary row ──
    let secondary = '';

    // Edit / View
    secondary += `<button class="apts-action-btn" onclick="window._dataLayer?.editAppointment?.('${apt.id}')" title="View or edit appointment">
      <i class="fas fa-pen"></i> <span>Edit</span>
    </button>`;

    // Call (if phone)
    if (phone) {
      secondary += `<button class="apts-action-btn apts-action-btn--call" onclick="window.location.href='tel:${phone}'" title="Call ${phone}">
        <i class="fas fa-phone"></i> <span>Call</span>
      </button>`;
    }

    return `
      <div class="apts-card__actions-primary">${primary}</div>
      <div class="apts-card__actions-secondary">${secondary}</div>
    `;
  }

  /**
   * Get a short next-action hint for this appointment
   * Returns HTML string or null (nothing rendered).
   * @private
   */
  getNextActionHint(apt, status, aptDate) {
    if (status === 'completed') {
      const hasInvoice = !!(apt.invoiceId ||
        (Array.isArray(window.allInvoices) && window.allInvoices.find(inv =>
          inv.appointmentId === apt.id || inv.aptId === apt.id
        )));
      if (!hasInvoice) {
        return '<i class="fas fa-file-invoice" aria-hidden="true"></i> Invoice not created yet &mdash; tap Invoice';
      }
      const paid = (apt.paymentStatus || '').toLowerCase();
      if (paid !== 'paid') {
        return '<i class="fas fa-pound-sign" aria-hidden="true"></i> Invoice unpaid &mdash; tap Mark Paid';
      }
      return null;
    }

    if (aptDate && status !== 'completed') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const aptDay = new Date(aptDate.getFullYear(), aptDate.getMonth(), aptDate.getDate());
      const phone = apt.customerPhone || apt.phone || '';
      if (aptDay < today && phone) {
        return '<i class="fas fa-phone" aria-hidden="true"></i> Overdue &mdash; call or reschedule';
      }
    }

    return null;
  }

  /**
   * Attach event listeners to rendered elements
   * @private
   */
  attachEventListeners() {
    // Event delegation will be handled by the buttons' onclick attributes
    // No need for manual listeners
  }

  /**
   * Format date in UK format (DD MMM YYYY)
   * @private
   */
  /**
   * Update the count badge
   * @private
   */
  updateCountBadge(appointments) {
    const badge = document.getElementById('aptsCountBadge');
    if (!badge) return;

    const total = this.manager.allAppointments.length;
    const count = appointments.length;

    if (count === total) {
      badge.textContent = String(total);
    } else {
      badge.textContent = `${count} / ${total}`;
    }
  }

  /**
   * Format date (DD MMM YYYY in UK format)
   * @private
   */
  formatDateUK(date) {
    if (!date) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  }

  /**
   * Format time (HH:MM)
   * @private
   */
  formatTime(date) {
    if (!date) return '';
    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${mins}`;
  }

  /**
   * Escape HTML to prevent XSS
   * @private
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Debounced render
   */
  renderDebounced() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.render();
    }, 100);
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.AppointmentsUIRenderer = AppointmentsUIRenderer;
}

export { AppointmentsUIRenderer };
export default AppointmentsUIRenderer;
