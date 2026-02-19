/**
 * APPOINTMENTS MANAGER - Fixed Logic
 * 
 * Handles:
 * 1. Data pipeline: Firestore → store → derived filters → UI
 * 2. All appointment states: today, upcoming, completed, past, overdue
 * 3. Search across all appointments
 * 4. Safe filtering without excluding data
 */

class AppointmentsManager {
  constructor() {
    this.allAppointments = [];
    this.filteredAppointments = [];
    this.currentFilter = 'all'; // all | today | upcoming | completed | past | overdue
    this.searchTerm = '';
    this.isInitialized = false;
  }

  /**
   * Initialize with store reference
   */
  init(store) {
    this.store = store;
    this.isInitialized = true;
    this.loadFromStore();
  }

  /**
   * Load all appointments from store
   */
  loadFromStore() {
    if (!this.store) return;
    this.allAppointments = this.store.getAllAppointments();
    this.applyFilters();
  }

  /**
   * Set the active filter type
   */
  setFilter(filterType) {
    if (['all', 'today', 'upcoming', 'completed', 'past', 'overdue'].includes(filterType)) {
      this.currentFilter = filterType;
      this.applyFilters();
    }
  }

  /**
   * Set search term
   */
  setSearchTerm(term) {
    this.searchTerm = (term || '').toLowerCase().trim();
    this.applyFilters();
  }

  /**
   * Apply all current filters and search
   */
  applyFilters() {
    let result = [...this.allAppointments];

    // 1. Apply filter by type
    result = this.filterByType(result, this.currentFilter);

    // 2. Apply search
    if (this.searchTerm) {
      result = this.filterBySearch(result, this.searchTerm);
    }

    // 3. Sort by date (nearest first)
    result.sort((a, b) => {
      const aDate = this.getAppointmentDate(a) || new Date(9999, 0, 0);
      const bDate = this.getAppointmentDate(b) || new Date(9999, 0, 0);
      return aDate - bDate;
    });

    this.filteredAppointments = result;
  }

  /**
   * Filter by appointment type
   * @private
   */
  filterByType(appointments, filterType) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return appointments.filter(apt => {
      const status = this.normalizeStatus(apt.status || '');
      const aptDate = this.getAppointmentDate(apt);

      if (!aptDate) return false; // Skip appointments without date

      const aptDateNormalized = new Date(aptDate.getFullYear(), aptDate.getMonth(), aptDate.getDate());

      switch (filterType) {
        case 'today':
          // Today: appointment date is today AND not cancelled
          return aptDateNormalized.getTime() === today.getTime() && status !== 'cancelled';

        case 'upcoming':
          // Future: appointment date > today AND not completed/cancelled
          return aptDateNormalized > today && status !== 'completed' && status !== 'cancelled';

        case 'completed':
          // Completed: status is completed (any date)
          return status === 'completed';

        case 'past':
          // Past: appointment date < today AND not completed/cancelled
          return aptDateNormalized < today && status !== 'completed' && status !== 'cancelled';

        case 'overdue':
          // Overdue: date in past AND not completed/cancelled
          return aptDateNormalized < today && status !== 'completed' && status !== 'cancelled';

        case 'all':
        default:
          // All except cancelled
          return status !== 'cancelled';
      }
    });
  }

  /**
   * Filter by search term
   * @private
   */
  filterBySearch(appointments, term) {
    return appointments.filter(apt => {
      const customerName = (apt.customerName || apt.name || '').toLowerCase();
      const phone = (apt.customerPhone || apt.phone || '').toLowerCase();
      const vehicle = (apt.vehicleMakeModel || apt.makeModel || apt.vehicle || apt.car || '').toLowerCase();
      const regPlate = (apt.registrationPlate || apt.regNumber || '').toLowerCase();
      const notes = (apt.notes || '').toLowerCase();

      return (
        customerName.includes(term) ||
        phone.includes(term) ||
        vehicle.includes(term) ||
        regPlate.includes(term) ||
        notes.includes(term)
      );
    });
  }

  /**
   * Get appointment date as JS Date
   * @private
   */
  getAppointmentDate(apt) {
    if (!apt) return null;

    // Try Firestore Timestamp first
    if (apt.appointmentDate?.toDate) {
      return apt.appointmentDate.toDate();
    }
    if (apt.startAt?.toDate) {
      return apt.startAt.toDate();
    }
    if (apt.scheduledDateTime?.toDate) {
      return apt.scheduledDateTime.toDate();
    }

    // Try string + time format
    if (apt.dateStr && apt.time) {
      try {
        return new Date(`${apt.dateStr}T${apt.time}`);
      } catch (e) {
        // Fall through
      }
    }

    // Try just date string
    if (apt.dateStr) {
      try {
        return new Date(apt.dateStr);
      } catch (e) {
        // Fall through
      }
    }

    return null;
  }

  /**
   * Normalize appointment status
   * @private
   */
  normalizeStatus(status) {
    if (!status) return 'upcoming';

    const normalized = status.toLowerCase()
      .replace(/[àáâăäandèéêëiòóôõöuùúûüûăîșț]/g, c => ({
        à:'a', á:'a', â:'a', ă:'a', ä:'a', è:'e', é:'e', ê:'e', ë:'e',
        ò:'o', ó:'o', ô:'o', õ:'o', ö:'o', u:'u', ù:'u', ú:'u', û:'u', ü:'u',
        ă:'a', î:'i', ș:'s', ț:'t'
      }[c] || c));

    // Map Romanian → English
    const statusMap = {
      'completă': 'completed',
      'completed': 'completed',
      'anulată': 'cancelled',
      'cancelled': 'cancelled',
      'scheduled': 'upcoming',
      'upcoming': 'upcoming',
      'confirmed': 'upcoming',
      'active': 'upcoming',
      'done': 'completed',
      'finalized': 'completed'
    };

    return statusMap[normalized] || normalized;
  }

  /**
   * Get count by filter type
   */
  getCountByType(filterType) {
    const counts = {
      all: this.allAppointments.filter(a => this.normalizeStatus(a.status) !== 'cancelled').length,
      today: this.filterByType(this.allAppointments, 'today').length,
      upcoming: this.filterByType(this.allAppointments, 'upcoming').length,
      completed: this.filterByType(this.allAppointments, 'completed').length,
      past: this.filterByType(this.allAppointments, 'past').length,
      overdue: this.filterByType(this.allAppointments, 'overdue').length
    };
    return counts[filterType] || 0;
  }

  /**
   * Get current filtered appointments
   */
  getFiltered() {
    return [...this.filteredAppointments];
  }

  /**
   * Update from store changes
   */
  updateFromStore(store) {
    this.store = store;
    this.loadFromStore();
  }
}

// Singleton instance
const appointmentsManager = new AppointmentsManager();

// Make available globally
if (typeof window !== 'undefined') {
  window.AppointmentsManager = AppointmentsManager;
  window.appointmentsManager = appointmentsManager;
}

export { appointmentsManager, AppointmentsManager };
export default appointmentsManager;
