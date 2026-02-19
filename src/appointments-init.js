/**
 * APPOINTMENTS MANAGER - Global Integration
 * 
 * Provides global functions for HTML onclick handlers and coordinates
 * all appointment list logic, search, filters, and rendering.
 */

// Global references (set during initialization)
let appointmentsManager = null;
let appointmentsUIRenderer = null;
let appointmentsDebounceTimer = null;

/**
 * Initialize appointments system
 * Call this from data-layer init or app init
 */
async function initAppointmentsSystem(store) {
  try {
    // Dynamic import of modules
    const { default: AppointmentsManager } = await import('./data-layer/appointments-manager.js');
    const { default: AppointmentsUIRenderer } = await import('./data-layer/appointments-ui.js');

    // Create instances
    appointmentsManager = new AppointmentsManager();
    appointmentsManager.init(store);

    appointmentsUIRenderer = new AppointmentsUIRenderer(appointmentsManager);
    if (!appointmentsUIRenderer.init()) {
      console.warn('⚠️ Appointments UI not initialized - container missing');
      return false;
    }

    // Initial render
    appointmentsUIRenderer.render();

    console.log('✅ Appointments system initialized');
    return true;
  } catch (e) {
    console.error('❌ Failed to initialize appointments system:', e);
    return false;
  }
}

/**
 * Global handler: Apply filter (called from filter buttons)
 */
function handleAppointmentFilter(filterType) {
  if (!appointmentsManager) {
    console.warn('⚠️ Appointments manager not initialized');
    return;
  }

  appointmentsManager.setFilter(filterType);
  appointmentsUIRenderer.render();

  // Update active filter button
  document.querySelectorAll('.apts-filter-btn').forEach(btn => {
    btn.classList.remove('apts-filter-btn--active');
    if (btn.dataset.filter === filterType) {
      btn.classList.add('apts-filter-btn--active');
    }
  });

  // Update count badge
  updateAppointmentCountBadge();
}

/**
 * Global handler: Search appointments (debounced)
 */
function handleAppointmentSearch(event) {
  if (!appointmentsManager) {
    console.warn('⚠️ Appointments manager not initialized');
    return;
  }

  const searchTerm = event.target.value || '';

  // Debounce search
  clearTimeout(appointmentsDebounceTimer);
  appointmentsDebounceTimer = setTimeout(() => {
    appointmentsManager.setSearchTerm(searchTerm);
    appointmentsUIRenderer.render();
    updateAppointmentCountBadge();
  }, 300);
}

/**
 * Global handler: Refresh appointments list
 */
function handleRefreshAppointments() {
  if (!appointmentsManager || !appointmentsManager.store) {
    console.warn('⚠️ Appointments manager not properly initialized');
    return;
  }

  // Reload from store
  appointmentsManager.updateFromStore(appointmentsManager.store);
  appointmentsUIRenderer.render();
  updateAppointmentCountBadge();

  // Visual feedback
  const btn = document.getElementById('refreshAppointmentsButton');
  if (btn) {
    btn.style.opacity = '0.6';
    setTimeout(() => {
      btn.style.opacity = '1';
    }, 300);
  }

  console.log('🔄 Appointments list refreshed');
}

/**
 * Update the count badge with filtered count
 * @private
 */
function updateAppointmentCountBadge() {
  const badge = document.getElementById('aptsCountBadge');
  if (!badge) return;

  const count = appointmentsManager.getFiltered().length;
  const total = appointmentsManager.allAppointments.length;
  
  badge.textContent = count === total ? `${total}` : `${count} / ${total}`;
}

/**
 * Reload from store when Firestore updates
 * Called by store listener
 */
function updateAppointmentsFromStore(store) {
  if (!appointmentsManager) return;

  appointmentsManager.updateFromStore(store);
  appointmentsUIRenderer.renderDebounced();
  updateAppointmentCountBadge();
}

// Export for ES6 module systems
export { initAppointmentsSystem, updateAppointmentsFromStore, handleAppointmentFilter, handleAppointmentSearch, handleRefreshAppointments };
