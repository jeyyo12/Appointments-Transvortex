/**
 * HEADER SEARCH & FILTERS - SAAS COMMAND BAR
 * 
 * Global search across appointments + invoices
 * Filter/badge click handlers
 * Search result navigation
 */

class HeaderSearchFilters {
  constructor(store) {
    this.store = store;
    this.searchTimeout = null;
    this.currentSearchQuery = '';
    this.currentFilter = null;
  }

  /**
   * Initialize search input
   */
  initSearch() {
    return;
  }

  /**
   * Global search across appointments + invoices
   * @private
   */
  handleSearch(query) {
    if (!query) {
      this.showAllData();
      return;
    }

    const appointments = this.store.getAllAppointments() || [];
    const invoices = this.store.getAllInvoices() || [];

    const appointmentResults = appointments.filter(apt => 
      this.matchesSearch(apt, query, 'appointment')
    );

    const invoiceResults = invoices.filter(inv =>
      this.matchesSearch(inv, query, 'invoice')
    );

    // Filter appointments
    if (appointmentResults.length > 0) {
      window.filteredAppointments = appointmentResults;
      if (typeof window.renderAppointments === 'function') {
        window.renderAppointments();
      }
    }

    // TODO: Show invoice results if any
    if (invoiceResults.length > 0) {
      // Invoices search results are available for invoice views when needed
    }
  }

  /**
   * Check if appointment/invoice matches search query
   * @private
   */
  matchesSearch(item, query, type) {
    if (type === 'appointment') {
      const searchText = [
        item.customerName || '',
        item.phone || item.customerPhone || '',
        item.vehicleMakeModel || item.makeModel || '',
        item.registrationPlate || item.regNumber || '',
        item.notes || ''
      ].join(' ').toLowerCase();

      return searchText.includes(query);
    } else if (type === 'invoice') {
      const searchText = [
        item.invoiceNumber || item.id || '',
        item.supplier || '',
        item.description || '',
        String(item.total || '')
      ].join(' ').toLowerCase();

      return searchText.includes(query);
    }

    return false;
  }

  /**
   * Show all data (clear search)
   * @private
   */
  showAllData() {
    // Reset appointments filter
    if (this.store) {
      window.filteredAppointments = (this.store.getAllAppointments() || [])
        .filter(apt => (apt.status || '').toLowerCase() !== 'cancelled');
      
      if (typeof window.renderAppointments === 'function') {
        window.renderAppointments();
      }
    }
  }

  /**
   * Badge click handler: Apply filter + navigate
   */
  onBadgeClick(filterType) {
    this.currentFilter = filterType;
    const appointments = this.store.getAllAppointments() || [];
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    let filtered = [];

    if (filterType === 'today') {
      filtered = appointments.filter(apt => {
        const aptDate = this.getAppointmentDate(apt);
        const status = (apt.status || '').toLowerCase();
        return aptDate >= todayStart && aptDate < todayEnd && 
               status !== 'cancelled' && status !== 'completed';
      });
    } else if (filterType === 'overdue') {
      filtered = appointments.filter(apt => {
        const aptDate = this.getAppointmentDate(apt);
        const status = (apt.status || '').toLowerCase();
        return aptDate && aptDate < todayStart && 
               status !== 'completed' && status !== 'cancelled';
      });
    } else if (filterType === 'unpaid') {
      // Show unpaid invoices
      const invoices = this.store.getAllInvoices() || [];
      const unpaidInvoices = invoices.filter(inv =>
        inv.paid !== true && (inv.status || '').toLowerCase() !== 'paid'
      );
      // TODO: Navigate to invoices tab and highlight unpaid
      return;
    } else if (filterType === 'weekRevenue') {
      // Show all paid invoices this week
      // TODO: Navigate to accounting/revenue view
      return;
    }

    window.__TVX_USER_NAV = true;

    // Update appointments list with filtered data
    window.filteredAppointments = filtered;
    if (typeof window.renderAppointments === 'function') {
      window.renderAppointments();
    }

    // Scroll to appointments section
    const appointmentsTab = document.getElementById('appointmentsTab');
        if (appointmentsTab) {
          const isUserNav = !!window.__TVX_USER_NAV;
          if (window.TVX_SCROLL_DEBUG === true) {
            console.debug('[TVX:SCROLL]', 'header-search:appointments-tab', { isUserNav });
          }
          if (isUserNav) {
            appointmentsTab.scrollIntoView?.({ behavior: 'auto', block: 'center' });
          }
    }
    setTimeout(() => {
      window.__TVX_USER_NAV = false;
    }, 0);
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
}

export { HeaderSearchFilters };
export default HeaderSearchFilters;
