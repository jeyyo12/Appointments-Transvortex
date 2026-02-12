/**
 * Finalize Modal
 * 
 * Quick finalization modal for completing appointments.
 */

import { BaseModal } from './base-modal.js';
import { normalizeAppointment } from '../../utils/normalizers.js';
import { showSuccess, showError } from '../../utils/notifications.js';
import { eventBus, EVENT_TYPES } from '../../core/event-bus.js';

export class FinalizeModal extends BaseModal {
  constructor(props) {
    super(props);
    this.appointmentId = props.appointmentId;
    this.appointment = props.appointment;
    this.onSubmit = props.onSubmit; // Callback for form submission
  }

  getType() {
    return 'finalize';
  }

  getShowClass() {
    return 'tvQuickFinalizeModal--show';
  }

  getHistoryData() {
    return { aptId: this.appointmentId };
  }

  render() {
    const apt = normalizeAppointment(this.appointment);

    const modal = document.createElement('div');
    modal.className = 'tvQuickFinalizeModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', 'tvQuickFinalizeTitle');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <div class="tvQuickFinalizeModal__backdrop"></div>
      <div class="tvQuickFinalizeModal__panel">
        <!-- Header -->
        <div class="tvQuickFinalizeModal__header">
          <h2 id="tvQuickFinalizeTitle" class="tvQuickFinalizeModal__title">Finalizare Rapidă</h2>
          <button type="button" class="tvQuickFinalizeModal__close" data-action="close" aria-label="Închide">
            <i class="fas fa-times"></i>
          </button>
        </div>
        
        <!-- Body -->
        <div class="tvQuickFinalizeModal__body">
          <!-- Appointment Summary -->
          <div class="tvQuickFinalize__summary">
            <h3 class="tvQuickFinalize__summaryTitle">Detalii Programare</h3>
            <div class="tvQuickFinalize__summaryGrid">
              <div class="tvQuickFinalize__summaryItem">
                <span class="tvQuickFinalize__summaryLabel">Programare:</span>
                <span class="tvQuickFinalize__summaryValue">${apt.dateStr || ''} la ${apt.time || ''}</span>
              </div>
              ${apt.address ? `
              <div class="tvQuickFinalize__summaryItem">
                <span class="tvQuickFinalize__summaryLabel">Locație:</span>
                <span class="tvQuickFinalize__summaryValue">${apt.address}</span>
              </div>
              ` : ''}
            </div>
          </div>
          
          <!-- Form -->
          <form id="tvQuickFinalizeForm" class="tvQuickFinalize__form">
            <!-- Customer Name -->
            <div class="tvQuickFinalize__field">
              <label for="tvQuickFinalizeName" class="tvQuickFinalize__label">
                Nume Client <span class="tvQuickFinalize__required">*</span>
              </label>
              <input 
                type="text" 
                id="tvQuickFinalizeName" 
                class="tvQuickFinalize__input" 
                placeholder="ex: Ion Popescu"
                value="${apt.customerName || ''}"
                required
              />
            </div>
            
            <!-- Registration Plate -->
            <div class="tvQuickFinalize__field">
              <label for="tvQuickFinalizeRegPlate" class="tvQuickFinalize__label">
                Numere Mașină <span class="tvQuickFinalize__required">*</span>
              </label>
              <input 
                type="text" 
                id="tvQuickFinalizeRegPlate" 
                class="tvQuickFinalize__input" 
                placeholder="ex: AB 12 CD"
                value="${apt.registrationPlate || ''}"
                required
              />
            </div>
            
            <!-- Note (Optional) -->
            <div class="tvQuickFinalize__field">
              <label for="tvQuickFinalizeNote" class="tvQuickFinalize__label">
                Notă (opțional)
              </label>
              <textarea 
                id="tvQuickFinalizeNote" 
                class="tvQuickFinalize__textarea" 
                placeholder="Detalii finalizare..."
                rows="3"
              ></textarea>
            </div>
          </form>
        </div>
        
        <!-- Footer -->
        <div class="tvQuickFinalizeModal__footer">
          <button type="button" class="tvBtn tvBtn--secondary" data-action="cancel">
            Anulează
          </button>
          <button type="submit" form="tvQuickFinalizeForm" class="tvBtn tvBtn--success">
            <i class="fas fa-check"></i>
            Finalizează
          </button>
        </div>
      </div>
    `;

    return modal;
  }

  attachEventListeners() {
    if (!this.element) return;

    // Form submission
    const form = this.element.querySelector('#tvQuickFinalizeForm');
    if (form) {
      const submitHandler = (e) => this.handleSubmit(e);
      form.addEventListener('submit', submitHandler);
      this.listeners.push({ element: form, event: 'submit', handler: submitHandler });
    }

    // Cancel button
    const cancelBtn = this.element.querySelector('[data-action="cancel"]');
    if (cancelBtn) {
      const cancelHandler = () => this.close();
      cancelBtn.addEventListener('click', cancelHandler);
      this.listeners.push({ element: cancelBtn, event: 'click', handler: cancelHandler });
    }
  }

  async handleSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const customerName = form.querySelector('#tvQuickFinalizeName').value.trim();
    const regPlate = form.querySelector('#tvQuickFinalizeRegPlate').value.trim();
    const note = form.querySelector('#tvQuickFinalizeNote').value.trim();

    // Validation
    if (!customerName || !regPlate) {
      showError('Te rog completează toate câmpurile obligatorii');
      return;
    }

    try {
      // Disable submit button
      const submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Se finalizează...';
      }

      // Call onSubmit callback if provided
      if (this.onSubmit) {
        await this.onSubmit({
          appointmentId: this.appointmentId,
          customerName,
          regPlate,
          note
        });
      } else {
        // Emit event for default handling
        eventBus.emit(EVENT_TYPES.APPOINTMENT_FINALIZED, {
          appointmentId: this.appointmentId,
          customerName,
          regPlate,
          note
        });
      }

      showSuccess('✅ Programare finalizată');
      this.close();
    } catch (error) {
      console.error('Error finalizing appointment:', error);
      showError('❌ Eroare la finalizare: ' + error.message);

      // Re-enable submit button
      const submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-check"></i> Finalizează';
      }
    }
  }

  onOpened() {
    // Focus first input
    const firstInput = this.element?.querySelector('#tvQuickFinalizeName');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 100);
    }
  }
}
