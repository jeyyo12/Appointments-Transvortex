/**
 * Appointment Service
 * 
 * Business logic for appointment operations.
 * Orchestrates Firebase and History services.
 */

import { eventBus, EVENT_TYPES } from '../core/event-bus.js';
import { showSuccess, showError } from '../utils/notifications.js';

export class AppointmentService {
  constructor(firebaseService, historyService, authService) {
    this.firebase = firebaseService;
    this.history = historyService;
    this.auth = authService;
  }

  /**
   * Create new appointment
   * @param {Object} data - Appointment data
   * @returns {Promise<string>} New appointment ID
   */
  async createAppointment(data) {
    try {
      const appointmentId = await this.firebase.createAppointment(data);
      
      // Log creation event
      if (this.history) {
        await this.history.logEvent(appointmentId, EVENT_TYPES.CREATED, {
          by: this.auth.getCurrentUser()?.uid
        });
      }

      eventBus.emit(EVENT_TYPES.CREATED, { appointmentId, data });
      showSuccess('✅ Programare creată cu succes');
      
      return appointmentId;
    } catch (error) {
      console.error('Error creating appointment:', error);
      showError('❌ Eroare la creare programare');
      throw error;
    }
  }

  /**
   * Update appointment
   * @param {string} id - Appointment ID
   * @param {Object} data - Updated data
   * @returns {Promise<void>}
   */
  async updateAppointment(id, data) {
    try {
      await this.firebase.updateAppointment(id, data);
      
      // Log update event
      if (this.history) {
        await this.history.logEvent(id, EVENT_TYPES.UPDATED, {
          by: this.auth.getCurrentUser()?.uid,
          changes: Object.keys(data)
        });
      }

      eventBus.emit(EVENT_TYPES.UPDATED, { appointmentId: id, data });
      showSuccess('✅ Programare actualizată');
      
    } catch (error) {
      console.error('Error updating appointment:', error);
      showError('❌ Eroare la actualizare');
      throw error;
    }
  }

  /**
   * Finalize appointment (quick finalize)
   * @param {string} id - Appointment ID
   * @param {string} customerName - Customer name
   * @param {string} regPlate - Registration plate
   * @param {string} note - Optional note
   * @returns {Promise<Object>} Updated appointment
   */
  async finalizeAppointment(id, customerName, regPlate, note = '') {
    try {
      const serverTimestamp = await this.firebase.getServerTimestamp();
      
      await this.firebase.updateAppointment(id, {
        status: 'finalized',
        customerName,
        registrationPlate: regPlate.toUpperCase(),
        finalizationNote: note,
        finalizedAt: serverTimestamp,
        finalizedBy: this.auth.getCurrentUser()?.uid
      });

      // Log finalization
      if (this.history) {
        await this.history.logFinalizeQuick(id, customerName, regPlate, note);
      }

      eventBus.emit(EVENT_TYPES.FINALIZED, { 
        appointmentId: id, 
        customerName, 
        regPlate, 
        note 
      });

      return await this.firebase.getAppointment(id);
    } catch (error) {
      console.error('Error finalizing appointment:', error);
      showError('❌ Eroare la finalizare');
      throw error;
    }
  }

  /**
   * Delay appointment
   * @param {string} id - Appointment ID
   * @param {string} reasonCode - Reason code
   * @param {string} note - Note
   * @param {number} delayMinutes - Delay in minutes
   * @returns {Promise<void>}
   */
  async delayAppointment(id, reasonCode, note, delayMinutes) {
    try {
      const appointment = await this.firebase.getAppointment(id);
      const currentDateTime = appointment.scheduledDateTime;
      
      // Calculate new time (add delay)
      const currentDate = currentDateTime?.toDate?.() || new Date(appointment.dateStr);
      const newDateTime = new Date(currentDate.getTime() + (delayMinutes * 60000));

      const serverTimestamp = await this.firebase.getServerTimestamp();
      
      await this.firebase.updateAppointment(id, {
        scheduledDateTime: newDateTime,
        delayReason: reasonCode,
        delayNote: note,
        delayedAt: serverTimestamp
      });

      // Log delay
      if (this.history) {
        await this.history.logAppointmentDelayed(id, reasonCode, note, currentDateTime, newDateTime);
      }

      eventBus.emit(EVENT_TYPES.DELAYED, { 
        appointmentId: id, 
        reasonCode, 
        note, 
        delayMinutes 
      });

      showSuccess(`✅ Programare întârziată cu ${delayMinutes} minute`);
    } catch (error) {
      console.error('Error delaying appointment:', error);
      showError('❌ Eroare la întârziere');
      throw error;
    }
  }

  /**
   * Reschedule appointment
   * @param {string} id - Appointment ID
   * @param {Date} newDate - New scheduled date/time
   * @param {string} reasonCode - Reason code
   * @param {string} note - Note
   * @returns {Promise<void>}
   */
  async rescheduleAppointment(id, newDate, reasonCode, note) {
    try {
      const appointment = await this.firebase.getAppointment(id);
      const oldDateTime = appointment.scheduledDateTime;

      const serverTimestamp = await this.firebase.getServerTimestamp();
      
      await this.firebase.updateAppointment(id, {
        scheduledDateTime: newDate,
        originalDateTime: oldDateTime,
        rescheduleReason: reasonCode,
        rescheduleNote: note,
        rescheduledAt: serverTimestamp
      });

      // Log reschedule
      if (this.history) {
        await this.history.logAppointmentRescheduled(id, reasonCode, note, oldDateTime, newDate);
      }

      eventBus.emit(EVENT_TYPES.RESCHEDULED, { 
        appointmentId: id, 
        newDate, 
        reasonCode, 
        note 
      });

      showSuccess('✅ Programare reprogramată');
    } catch (error) {
      console.error('Error rescheduling appointment:', error);
      showError('❌ Eroare la reprogramare');
      throw error;
    }
  }

  /**
   * Delete appointment
   * @param {string} id - Appointment ID
   * @returns {Promise<void>}
   */
  async deleteAppointment(id) {
    try {
      // Log deletion before deleting
      if (this.history) {
        await this.history.logAppointmentDeleted(id);
      }

      await this.firebase.deleteAppointment(id);

      eventBus.emit(EVENT_TYPES.DELETED, { appointmentId: id });
      showSuccess('✅ Programare ștearsă');
    } catch (error) {
      console.error('Error deleting appointment:', error);
      showError('❌ Eroare la ștergere');
      throw error;
    }
  }

  /**
   * Cancel appointment
   * @param {string} id - Appointment ID
   * @returns {Promise<void>}
   */
  async cancelAppointment(id) {
    try {
      const serverTimestamp = await this.firebase.getServerTimestamp();
      
      await this.firebase.updateAppointment(id, {
        status: 'canceled',
        canceledAt: serverTimestamp
      });

      eventBus.emit(EVENT_TYPES.STATUS_CHANGED, { 
        appointmentId: id, 
        status: 'canceled' 
      });

      showSuccess('✅ Programare anulată');
    } catch (error) {
      console.error('Error canceling appointment:', error);
      showError('❌ Eroare la anulare');
      throw error;
    }
  }

  /**
   * Get appointments by status
   * @param {string} status - Appointment status
   * @returns {Promise<Array>} Filtered appointments
   */
  async getAppointmentsByStatus(status) {
    return await this.firebase.getAppointmentsByStatus(status);
  }

  /**
   * Subscribe to appointments real-time updates
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribeToAppointments(callback) {
    return this.firebase.subscribeToAppointments((appointments) => {
      eventBus.emit(EVENT_TYPES.APPOINTMENTS_LOADED, { appointments });
      callback(appointments);
    });
  }
}
