/**
 * Appointment History / Timeline Service
 * Logs all significant actions to Firestore for audit trail
 * 
 * Events tracked:
 * - APPOINTMENT_CREATED
 * - APPOINTMENT_OPENED (details modal)
 * - APPOINTMENT_EDITED
 * - APPOINTMENT_DELAYED
 * - APPOINTMENT_RESCHEDULED
 * - APPOINTMENT_FINALIZED
 * - APPOINTMENT_INVOICED
 * - APPOINTMENT_DELETED
 * - DELAY_MODAL_OPENED
 * - WHATSAPP_SHARED
 * - VISITED_LOCATION
 */

class AppointmentHistoryService {
    constructor(db, currentUser) {
        this.db = db;
        this.currentUser = currentUser;
    }

    /**
     * Log an event to the appointment's timeline
     * @param {string} appointmentId - Appointment ID in Firestore
     * @param {string} eventType - Type of event (use constants)
     * @param {object} data - Additional event data
     */
    async logEvent(appointmentId, eventType, data = {}) {
        if (!appointmentId || !eventType) {
            console.error('[HistoryService] Missing appointmentId or eventType', {
                appointmentId,
                eventType
            });
            return;
        }

        try {
            const {
                doc,
                updateDoc,
                serverTimestamp,
                arrayUnion,
                Timestamp
            } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

            const timelineEntry = {
                type: eventType,
                timestamp: Timestamp.now(),
                by: this.currentUser?.uid || 'system',
                byEmail: this.currentUser?.email || 'system',
                ...data
            };

            await updateDoc(doc(this.db, 'appointments', appointmentId), {
                timeline: arrayUnion(timelineEntry),
                lastUpdatedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            console.log(`✅ [HistoryService] Logged ${eventType} for ${appointmentId}`);
        } catch (error) {
            console.error(`❌ [HistoryService] Error logging ${eventType}:`, error);
        }
    }

    /**
     * Log an appointment modification with before/after values
     */
    async logModification(appointmentId, field, oldValue, newValue, reason = '') {
        await this.logEvent(appointmentId, 'APPOINTMENT_MODIFIED', {
            field,
            oldValue,
            newValue,
            reason
        });
    }

    /**
     * Log when delay/reschedule modal is opened
     */
    async logDelayModalOpened(appointmentId) {
        await this.logEvent(appointmentId, 'DELAY_MODAL_OPENED', {
            action: 'opened_delay_reschedule_modal'
        });
    }

    /**
     * Log when appointment is delayed
     */
    async logAppointmentDelayed(appointmentId, oldDate, newDate, reason = '') {
        await this.logEvent(appointmentId, 'APPOINTMENT_DELAYED', {
            oldDate,
            newDate,
            reason,
            delayMinutes: this.calculateMinutesDifference(oldDate, newDate)
        });
    }

    /**
     * Log when appointment is rescheduled
     */
    async logAppointmentRescheduled(appointmentId, oldDate, newDate, reason = '') {
        await this.logEvent(appointmentId, 'APPOINTMENT_RESCHEDULED', {
            oldDate,
            newDate,
            reason,
            rescheduleDays: this.calculateDaysDifference(oldDate, newDate)
        });
    }

    /**
     * Log when finalize modal is opened
     */
    async logFinalizeModalOpened(appointmentId) {
        await this.logEvent(appointmentId, 'FINALIZE_MODAL_OPENED', {
            action: 'opened_quick_finalize_modal'
        });
    }

    /**
     * Log when appointment is finalized using quick finalize
     */
    async logFinalizeQuick(appointmentId, customerName, regPlate, finalizationNote = null) {
        await this.logEvent(appointmentId, 'FINALIZED_QUICK', {
            customerName,
            regPlate,
            finalizationNote,
            previousStatus: 'scheduled'
        });
    }

    /**
     * Log when appointment is finalized with invoice data
     */
    async logAppointmentFinalized(appointmentId, invoiceData) {
        await this.logEvent(appointmentId, 'APPOINTMENT_FINALIZED', {
            invoiceNumber: invoiceData?.invoiceNumber,
            totalAmount: invoiceData?.totalAmount,
            vat: invoiceData?.vat,
            servicesCount: invoiceData?.services?.length || 0,
            partsCount: invoiceData?.parts?.length || 0
        });
    }

    /**
     * Log when invoice is generated/viewed
     */
    async logAppointmentInvoiced(appointmentId, invoiceNumber) {
        await this.logEvent(appointmentId, 'APPOINTMENT_INVOICED', {
            invoiceNumber,
            action: 'viewed_or_generated'
        });
    }

    /**
     * Log when invoice is updated/edited
     */
    async logInvoiceUpdated(appointmentId, invoiceNumber, changedFields = {}) {
        await this.logEvent(appointmentId, 'INVOICE_UPDATED', {
            invoiceNumber,
            changedFields,
            fieldsCount: Object.keys(changedFields).length
        });
    }

    /**
     * Log when appointment is edited
     */
    async logAppointmentEdited(appointmentId, changedFields = {}) {
        await this.logEvent(appointmentId, 'APPOINTMENT_EDITED', {
            changedFields,
            fieldsCount: Object.keys(changedFields).length
        });
    }

    /**
     * Log when details modal is opened
     */
    async logDetailsOpened(appointmentId) {
        await this.logEvent(appointmentId, 'APPOINTMENT_OPENED', {
            action: 'opened_details_modal'
        });
    }

    /**
     * Log when WhatsApp sharing is triggered
     */
    async logWhatsAppShared(appointmentId, recipientPhone = '') {
        await this.logEvent(appointmentId, 'WHATSAPP_SHARED', {
            recipientPhone,
            action: 'whatsapp_share_initiated'
        });
    }

    /**
     * Log when location is visited (Google Maps)
     */
    async logLocationVisited(appointmentId, address = '') {
        await this.logEvent(appointmentId, 'VISITED_LOCATION', {
            address,
            action: 'opened_in_google_maps'
        });
    }

    /**
     * Log when appointment is deleted
     */
    async logAppointmentDeleted(appointmentId, reason = '') {
        await this.logEvent(appointmentId, 'APPOINTMENT_DELETED', {
            reason,
            action: 'appointment_deleted'
        });
    }

    /**
     * Log when appointment is created
     */
    async logAppointmentCreated(appointmentId, appointmentData) {
        await this.logEvent(appointmentId, 'APPOINTMENT_CREATED', {
            clientName: appointmentData?.clientName,
            phone: appointmentData?.phone,
            vehicle: appointmentData?.vehicle,
            scheduledDate: appointmentData?.scheduledDate
        });
    }

    /**
     * Helper: Calculate difference in minutes between two dates
     */
    calculateMinutesDifference(date1, date2) {
        if (!date1 || !date2) return 0;
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        return Math.round((d2 - d1) / (1000 * 60));
    }

    /**
     * Helper: Calculate difference in days between two dates
     */
    calculateDaysDifference(date1, date2) {
        if (!date1 || !date2) return 0;
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        const diffTime = Math.abs(d2 - d1);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    }

    /**
     * Get human-readable label for event type
     */
    static getEventLabel(eventType) {
        const labels = {
            'APPOINTMENT_CREATED': 'Programare creată',
            'APPOINTMENT_OPENED': 'Detalii deschise',
            'APPOINTMENT_EDITED': 'Programare editată',
            'APPOINTMENT_DELAYED': 'Programare întârziată',
            'APPOINTMENT_RESCHEDULED': 'Programare reprogramată',
            'APPOINTMENT_FINALIZED': 'Programare finalizată',
            'APPOINTMENT_INVOICED': 'Factură generată',
            'APPOINTMENT_DELETED': 'Programare ștersă',
            'FINALIZE_MODAL_OPENED': 'Modal finalizare deschis',
            'FINALIZED_QUICK': 'Finalizare rapidă',
            'INVOICE_OPENED': 'Factură deschisă',
            'INVOICE_UPDATED': 'Factură actualizată',
            'DELAY_MODAL_OPENED': 'Modal deschis',
            'WHATSAPP_SHARED': 'Partajat pe WhatsApp',
            'VISITED_LOCATION': 'Locație vizitată',
            'APPOINTMENT_MODIFIED': 'Programare modificată'
        };
        return labels[eventType] || eventType;
    }

    /**
     * Get icon for event type
     */
    static getEventIcon(eventType) {
        const icons = {
            'APPOINTMENT_CREATED': 'fa-plus-circle',
            'APPOINTMENT_OPENED': 'fa-eye',
            'APPOINTMENT_EDITED': 'fa-edit',
            'APPOINTMENT_DELAYED': 'fa-clock',
            'APPOINTMENT_RESCHEDULED': 'fa-calendar-alt',
            'APPOINTMENT_FINALIZED': 'fa-check-circle',
            'APPOINTMENT_INVOICED': 'fa-file-invoice',
            'APPOINTMENT_DELETED': 'fa-trash',
            'FINALIZE_MODAL_OPENED': 'fa-window-maximize',
            'FINALIZED_QUICK': 'fa-check-double',
            'INVOICE_OPENED': 'fa-file-invoice',
            'INVOICE_UPDATED': 'fa-file-pen',
            'DELAY_MODAL_OPENED': 'fa-window-maximize',
            'WHATSAPP_SHARED': 'fa-whatsapp',
            'VISITED_LOCATION': 'fa-map-marker-alt',
            'APPOINTMENT_MODIFIED': 'fa-pencil-alt'
        };
        return icons[eventType] || 'fa-info-circle';
    }
}

// Export for use in main script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppointmentHistoryService;
}
// ES6 Export for module usage
export default AppointmentHistoryService;