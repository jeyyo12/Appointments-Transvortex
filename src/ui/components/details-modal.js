/**
 * Details Modal
 * 
 * Shows full appointment details with timeline history.
 */

import { BaseModal } from './base-modal.js';
import { normalizeAppointment, getScheduledDate, formatTimelineTimestamp } from '../../utils/normalizers.js';
import { formatDateUK, formatHHMM } from '../../utils/formatters.js';

export class DetailsModal extends BaseModal {
  constructor(props) {
    super(props);
    this.appointment = props.appointment;
  }

  getType() {
    return 'details';
  }

  getShowClass() {
    return 'tvDetailsModalOverlay--show';
  }

  getHistoryData() {
    return { id: this.appointment?.id };
  }

  render() {
    const apt = this.appointment;
    if (!apt) return null;

    const normalized = normalizeAppointment(apt);
    const scheduledDate = getScheduledDate(apt);

    const overlay = document.createElement('div');
    overlay.className = 'tvDetailsModalOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'tvDetailsTitle');

    overlay.innerHTML = `
      <div class="tvDetailsModal">
        <!-- Header -->
        <div class="tvDetailsModal__header">
          <h2 id="tvDetailsTitle" class="tvDetailsModal__title">Detalii Programare</h2>
          <button type="button" class="tvDetailsModal__close" data-action="close" aria-label="Închide">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <!-- Body -->
        <div class="tvDetailsModal__body">
          <!-- Customer Info -->
          <section class="tvDetailsSection">
            <h3 class="tvDetailsSection__title">Informații Client</h3>
            <div class="tvDetailsGrid">
              <div class="tvDetailsField">
                <span class="tvDetailsField__label">Nume:</span>
                <span class="tvDetailsField__value">${normalized.customerName || 'N/A'}</span>
              </div>
              <div class="tvDetailsField">
                <span class="tvDetailsField__label">Telefon:</span>
                <span class="tvDetailsField__value">${normalized.customerPhone || 'N/A'}</span>
              </div>
            </div>
          </section>

          <!-- Vehicle Info -->
          <section class="tvDetailsSection">
            <h3 class="tvDetailsSection__title">Vehicul</h3>
            <div class="tvDetailsGrid">
              <div class="tvDetailsField">
                <span class="tvDetailsField__label">Mașină:</span>
                <span class="tvDetailsField__value">${normalized.vehicleMakeModel || 'N/A'}</span>
              </div>
              <div class="tvDetailsField">
                <span class="tvDetailsField__label">Înmatriculare:</span>
                <span class="tvDetailsField__value">${normalized.registrationPlate || 'N/A'}</span>
              </div>
            </div>
          </section>

          <!-- Appointment Info -->
          <section class="tvDetailsSection">
            <h3 class="tvDetailsSection__title">Programare</h3>
            <div class="tvDetailsGrid">
              <div class="tvDetailsField">
                <span class="tvDetailsField__label">Data:</span>
                <span class="tvDetailsField__value">${scheduledDate ? formatDateUK(scheduledDate) : normalized.dateStr || 'N/A'}</span>
              </div>
              <div class="tvDetailsField">
                <span class="tvDetailsField__label">Ora:</span>
                <span class="tvDetailsField__value">${scheduledDate ? formatHHMM(scheduledDate) : normalized.time || 'N/A'}</span>
              </div>
              ${normalized.address ? `
              <div class="tvDetailsField tvDetailsField--full">
                <span class="tvDetailsField__label">Locație:</span>
                <span class="tvDetailsField__value">${normalized.address}</span>
              </div>
              ` : ''}
            </div>
          </section>

          <!-- Problem Description -->
          <section class="tvDetailsSection">
            <h3 class="tvDetailsSection__title">Problemă / Serviciu</h3>
            <p class="tvDetailsDescription">${normalized.problemDescription || 'N/A'}</p>
          </section>

          ${normalized.notes ? `
          <!-- Notes -->
          <section class="tvDetailsSection">
            <h3 class="tvDetailsSection__title">Notițe</h3>
            <p class="tvDetailsDescription">${normalized.notes}</p>
          </section>
          ` : ''}

          <!-- Timeline -->
          ${this.renderTimeline(apt.timeline)}
        </div>

        <!-- Footer -->
        <div class="tvDetailsModal__footer">
          <button type="button" class="tvBtn tvBtn--secondary" data-action="close">
            Închide
          </button>
        </div>
      </div>
    `;

    return overlay;
  }

  renderTimeline(timeline) {
    if (!timeline || !Array.isArray(timeline) || timeline.length === 0) {
      return `
        <section class="tvDetailsSection">
          <h3 class="tvDetailsSection__title">Istoric</h3>
          <div class="tvDetailsTimeline tvDetailsTimeline--empty">
            Nu există istoric pentru această programare.
          </div>
        </section>
      `;
    }

    // Sort descending (newest first)
    const sorted = [...timeline].sort((a, b) => {
      const aTime = a.at?.toDate?.() || new Date(a.at);
      const bTime = b.at?.toDate?.() || new Date(b.at);
      return bTime - aTime;
    });

    const eventsHTML = sorted.map(event => {
      const eventLabel = this.getEventLabel(event.type);
      const timestamp = formatTimelineTimestamp(event.at);
      const icon = this.getEventIcon(event.type);

      return `
        <div class="tvTimelineEvent">
          <div class="tvTimelineEvent__icon">
            <i class="fas fa-${icon}"></i>
          </div>
          <div class="tvTimelineEvent__content">
            <div class="tvTimelineEvent__label">${eventLabel}</div>
            <div class="tvTimelineEvent__time">${timestamp}</div>
            ${event.note ? `<div class="tvTimelineEvent__note">${event.note}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    return `
      <section class="tvDetailsSection">
        <h3 class="tvDetailsSection__title">Istoric</h3>
        <div class="tvDetailsTimeline">
          ${eventsHTML}
        </div>
      </section>
    `;
  }

  getEventLabel(eventType) {
    const labels = {
      'CREATED': 'Programare creată',
      'UPDATED': 'Modificat',
      'FINALIZED': 'Finalizat',
      'FINALIZE_QUICK': 'Finalizare rapidă',
      'FINALIZE_MODAL_OPENED': 'Deschis finalizare',
      'DELAYED': 'Întârziat',
      'RESCHEDULED': 'Reprogramat',
      'CANCELLED': 'Anulat',
      'DELETED': 'Șters',
      'INVOICE_UPDATED': 'Factură actualizată'
    };
    return labels[eventType] || eventType;
  }

  getEventIcon(eventType) {
    const icons = {
      'CREATED': 'plus-circle',
      'UPDATED': 'edit',
      'FINALIZED': 'check-circle',
      'FINALIZE_QUICK': 'bolt',
      'FINALIZE_MODAL_OPENED': 'file-invoice',
      'DELAYED': 'clock',
      'RESCHEDULED': 'calendar-alt',
      'CANCELLED': 'ban',
      'DELETED': 'trash',
      'INVOICE_UPDATED': 'file-invoice-dollar'
    };
    return icons[eventType] || 'circle';
  }
}
