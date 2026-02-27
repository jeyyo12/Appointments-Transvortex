/**
 * Workspace Panel System - Premium SaaS Dashboard
 * Controls the 5 workspaces:
 * 1. All Jobs - All appointments
 * 2. Today - Appointments for today
 * 3. Completed & Invoices - Completed appointments with invoice status
 * 4. Planning - Upcoming appointments grouped by day
 * 5. Revenue Inbox - Unpaid invoices + pending invoices + week revenue
 */

// ==========================================
// GLOBAL WORKSPACE STATE
// ==========================================

// Track which workspace is currently active (persists across data refreshes)
let activeWorkspace = 'today'; // Default to Today Focus
let workspaceSearch = '';

// Make state globally accessible for data-layer auto-refresh
window.__workspaceState = {
  get activeWorkspace() { return activeWorkspace; },
  set activeWorkspace(mode) { activeWorkspace = mode; }
};

// ==========================================
// SET ACTIVE WORKSPACE
// ==========================================

/**
 * Switch to a workspace and render it
 * @param {string} workspace - 'all', 'today', 'completed', 'planning', 'revenue'
 */
const setActiveWorkspace = function(workspace) {
  // Validate workspace ID
  const valid = ['all', 'today', 'completed', 'planning', 'revenue'];
  if (!valid.includes(workspace)) {
    return;
  }

  activeWorkspace = workspace;
  window.__workspaceState.activeWorkspace = workspace; // Keep global state in sync

  // Update KPI card styling
  updateWorkspaceCardSelection(workspace);

  // Update filter chip
  const _chip = document.getElementById('tvFilterChip');
  const _chipLabel = document.getElementById('tvFilterChipLabel');
  const _filterLabels = { all: '', today: 'Today Focus', completed: 'Completed', planning: 'Planning', revenue: 'Revenue Inbox' };
  if (_chip && _chipLabel) {
    if (workspace === 'all') {
      _chip.style.display = 'none';
    } else {
      _chipLabel.textContent = _filterLabels[workspace] || workspace;
      _chip.style.display = '';
    }
  }

  // Render the workspace
  renderWorkspace(workspace);
};

// Make globally available
window.setActiveWorkspace = setActiveWorkspace;

/**
 * Update visual selection of KPI cards
 */
function updateWorkspaceCardSelection(workspaceId) {
  // Segmented filter buttons
  document.querySelectorAll('.tv-seg-btn[data-workspace-id]').forEach(btn => {
    btn.classList.remove('tv-seg-btn--active');
    btn.removeAttribute('aria-pressed');
  });
  const activeBtn = document.querySelector(`.tv-seg-btn[data-workspace-id="${workspaceId}"]`);
  if (activeBtn) {
    activeBtn.classList.add('tv-seg-btn--active');
    activeBtn.setAttribute('aria-pressed', 'true');
  }

  // Legacy KPI cards (kept for any residual markup)
  document.querySelectorAll('.tvStatCard--workspace').forEach(card => {
    card.classList.remove('tvStatCard--active', 'tvStatCard--glow');
  });
  const activeCard = document.querySelector(`.tvStatCard--workspace[data-workspace-id="${workspaceId}"]`);
  if (activeCard) {
    activeCard.classList.add('tvStatCard--active', 'tvStatCard--glow');
  }
}

// ==========================================
// WORKSPACE RENDERER
// ==========================================

/**
 * Render appointments grouped by status (Overdue / Today / Upcoming / Completed)
 * Uses native <details> for collapsible groups — no extra JS required.
 * @param {HTMLElement} container
 * @param {Array} data
 * @returns {number} total item count
 */
const TV_GROUP_PAGE = 10;

function renderGroupedWorkspace(container, data) {
  const todayStr = new Date().toISOString().split('T')[0];
  const groups = [
    { id: 'overdue',   label: 'Overdue',   open: true,  items: [] },
    { id: 'today',     label: 'Today',     open: true,  items: [] },
    { id: 'upcoming',  label: 'Upcoming',  open: false, items: [] },
    { id: 'completed', label: 'Completed', open: false, items: [] },
  ];

  for (const apt of data) {
    const status = (apt.status || '').toLowerCase();
    if (['completed', 'done', 'finalized'].includes(status)) {
      groups[3].items.push(apt);
      continue;
    }
    const d = window.getScheduledDate?.(apt);
    const dateStr = (d && !isNaN(d.getTime()))
      ? d.toISOString().split('T')[0]
      : (apt.dateStr || null);
    if (dateStr && dateStr < todayStr)    groups[0].items.push(apt);
    else if (dateStr === todayStr)        groups[1].items.push(apt);
    else                                  groups[2].items.push(apt);
  }

  const html = groups
    .filter(g => g.items.length > 0)
    .map(g => {
      const cards = g.items.map(window.createAppointmentCard).filter(Boolean);
      const visible = cards.slice(0, TV_GROUP_PAGE).join('');
      const hidden  = cards.slice(TV_GROUP_PAGE)
        .map(c => `<div class="tv-card-hidden" style="display:none">${c}</div>`)
        .join('');
      const remaining = g.items.length - TV_GROUP_PAGE;
      const loadMore  = remaining > 0
        ? `<button class="tv-scan-load-more" onclick="tvGroupLoadMore(this)">Load ${Math.min(TV_GROUP_PAGE, remaining)} more</button>`
        : '';
      return `<details class="tv-group" ${g.open ? 'open' : ''} data-group="${g.id}">
        <summary class="tv-group__summary">
          <span class="tv-group__label">${g.label}</span>
          <span class="tv-group__count">${g.items.length}</span>
        </summary>
        <div class="tv-group__body">${visible}${hidden}${loadMore}</div>
      </details>`;
    }).join('');

  container.innerHTML = html;
  return data.length;
}

/**
 * Unhide the next TV_GROUP_PAGE hidden cards inside a group.
 * Called from the load-more button's onclick — no full re-render.
 */
window.tvGroupLoadMore = function(btn) {
  const body = btn.closest('.tv-group__body');
  if (!body) return;
  const hidden = Array.from(body.querySelectorAll('.tv-card-hidden'));
  hidden.slice(0, TV_GROUP_PAGE).forEach(el => {
    el.style.display = '';
    el.classList.remove('tv-card-hidden');
  });
  const stillHidden = body.querySelectorAll('.tv-card-hidden').length;
  if (stillHidden === 0) {
    btn.remove();
  } else {
    btn.textContent = `Load ${Math.min(TV_GROUP_PAGE, stillHidden)} more`;
  }
};

/**
 * Render active workspace content
 * @param {string} workspace - Workspace mode
 */
function renderWorkspace(workspace) {
  const container = document.getElementById('workspaceContent');
  const emptyState = document.getElementById('workspaceEmptyState');
  const title = document.getElementById('workspacePanelTitle');
  const badge = document.getElementById('workspaceCountBadge');

  const data = getWorkspaceData(workspace);

  if (!container) {
    return;
  }

  let count = 0;
  let titles = {
    all: '<i class="fas fa-calendar"></i> All Jobs',
    today: '<i class="fas fa-calendar-day"></i> Today Focus',
    completed: '<i class="fas fa-check-circle"></i> Completed & Invoices',
    planning: '<i class="fas fa-calendar-week"></i> Planning',
    revenue: '<i class="fas fa-coins"></i> Revenue Inbox'
  };

  // Update title
  if (title) title.innerHTML = titles[workspace] || 'Workspace';

  // Get filtered data

  if (!data || data.length === 0) {
    container.innerHTML = '';
    if (emptyState) {
      emptyState.style.display = 'block';
      const emptyTitle = document.getElementById('emptyTitle');
      const emptyDesc = document.getElementById('emptyDescription');
      if (emptyTitle) emptyTitle.textContent = `No items in ${titles[workspace].replace(/<[^>]*>/g, '')}`;
      if (emptyDesc) emptyDesc.textContent = 'Try switching to another workspace or creating new appointments';
    }
    if (badge) badge.textContent = '0';
    return;
  }

  // Hide empty state
  if (emptyState) emptyState.style.display = 'none';

  // 'all' workspace: grouped by status; others: flat list
  if (workspace === 'all') {
    count = renderGroupedWorkspace(container, data);
  } else {
    container.innerHTML = data.map(window.createAppointmentCard).filter(Boolean).join('');
    count = data.length;
  }
  if (badge) badge.textContent = String(count);

  // Unified one-line pipeline diagnostic (debounced in metrics module)
  if (typeof window !== 'undefined' && typeof window.__tvEmitPipelineDiag === 'function') {
    window.__tvEmitPipelineDiag({});
  }
}

// ==========================================
// WORKSPACE DATA FILTERS
// ==========================================

/**
 * Get filtered data for a workspace
 */
function getWorkspaceData(workspace) {
  const appts = (window.appointments || []).filter(a => !a.status?.toLowerCase().includes('cancel'));

  // Apply search filter if active
  const searchTerm = workspaceSearch.toLowerCase();
  const matchesSearch = (item) => {
    if (!searchTerm) return true;
    
    // Search in appointment properties
    if (item.customerName && item.customerName.toLowerCase().includes(searchTerm)) return true;
    if (item.phone && item.phone.includes(searchTerm)) return true;
    if (item.registrationPlate && item.registrationPlate.toLowerCase().includes(searchTerm)) return true;
    if (item.vehicleMakeModel && item.vehicleMakeModel.toLowerCase().includes(searchTerm)) return true;
    
    // Search in invoice properties
    if (item.invoiceNumber && item.invoiceNumber.toLowerCase().includes(searchTerm)) return true;
    if (item.customerName && item.customerName.toLowerCase().includes(searchTerm)) return true;
    
    return false;
  };

  const getLinkedInvoice = (apt) => {
    if (!apt?.id) return null;
    const invoices = Array.isArray(window.allInvoices) ? window.allInvoices : [];
    if (apt.invoiceId) {
      const byId = invoices.find(inv => inv.id === apt.invoiceId);
      if (byId) return byId;
    }
    return invoices.find(inv =>
      inv.appointmentId === apt.id ||
      inv.aptId === apt.id ||
      inv.meta?.appointmentId === apt.id
    ) || null;
  };

  const isCompletedByPayment = (apt) => {
    const paymentStatus = (apt.paymentStatus || '').toLowerCase();
    if (paymentStatus === 'paid') return true;
    const invoice = getLinkedInvoice(apt);
    if (!invoice) return false;
    const invoiceStatus = (invoice.paymentStatus || invoice.status || '').toLowerCase();
    if (invoiceStatus === 'paid') return true;
    const paid = window.toNumber?.(invoice.paidAmount || invoice.amountPaid || 0) || 0;
    const total = window.toNumber?.(invoice.total || invoice.totals?.total || 0) || 0;
    return total > 0 && paid >= total;
  };

  switch (workspace) {
    case 'all':
      return appts.filter(matchesSearch);

    case 'today':
      const todayStr = new Date().toISOString().split('T')[0];
      return appts.filter(a => (a.dateStr === todayStr || getNormalizedDate(a) === todayStr) && matchesSearch(a));

    case 'completed':
      return appts.filter(a => {
        const status = (a.status || '').toLowerCase();
        const completedByStatus = status === 'completed' || status === 'done' || status === 'finalized';
        return (completedByStatus || isCompletedByPayment(a)) && matchesSearch(a);
      });

    case 'planning':
      const now = new Date();
      return appts.filter(a => {
        const scheduled = window.getScheduledDate?.(a) || a.startAt?.toDate?.() || (a.startAt ? new Date(a.startAt) : null);
        if (!scheduled || isNaN(scheduled.getTime())) return false;
        const status = (a.status || '').toLowerCase();
        const isFutureOrActive = scheduled > now;
        const isNotClosed = !['completed', 'done', 'finalized', 'canceled', 'cancelled'].includes(status);
        return isFutureOrActive && isNotClosed && !isCompletedByPayment(a) && matchesSearch(a);
      }).sort((a, b) => {
        const aDate = window.getScheduledDate?.(a) || new Date(9999, 0, 0);
        const bDate = window.getScheduledDate?.(b) || new Date(9999, 0, 0);
        return aDate - bDate;
      });

    case 'revenue':
      return appts.filter(a => {
        const status = (a.status || '').toLowerCase();
        if (status === 'canceled' || status === 'cancelled') return false;

        const invoice = getLinkedInvoice(a);
        if (invoice) {
          const paid = window.toNumber?.(invoice.paidAmount || invoice.amountPaid || 0) || 0;
          const total = window.toNumber?.(invoice.total || invoice.totals?.total || 0) || 0;
          if (total <= 0) return false;
          return paid < total && matchesSearch(a);
        }

        const amountInfo = window.getAppointmentAmountGBP?.(a);
        const aptTotal = window.toNumber?.(amountInfo?.amount || a.total || a.subtotal || a.amount || 0) || 0;
        const aptPaid = window.toNumber?.(a.amountPaid || a.paidAmount || 0) || 0;
        if (aptTotal <= 0) return false;
        if ((amountInfo?.status || '').toLowerCase() === 'paid') return false;
        return aptPaid < aptTotal && matchesSearch(a);
      });

    default:
      return [];
  }
}

/**
 * Helper: Get normalized date from appointment
 */
function getNormalizedDate(apt) {
  if (apt.dateStr && typeof apt.dateStr === 'string') {
    return apt.dateStr;
  }

  let date = null;
  if (apt.startAt?.toDate) {
    date = apt.startAt.toDate();
  } else if (apt.startAt instanceof Date) {
    date = apt.startAt;
  } else if (apt.startAt) {
    date = new Date(apt.startAt);
  }

  if (date && !isNaN(date.getTime())) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

// ==========================================
// WORKSPACE EVENT HANDLERS
// ==========================================

/**
 * Bind event handlers for workspace actions
 */
let workspaceClickBound = false;

function bindWorkspaceActions() {
  const container = document.getElementById('workspaceContent');
  if (!container || workspaceClickBound) return;
  
  // Bind context menu and appointment card actions using event delegation
  container.addEventListener('click', (e) => {
    // Try to find button with data-action attribute
    const button = e.target.closest('[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id || button.closest('[data-apt-id]')?.dataset.aptId;

    if (!action) return;

    // Handle appointment actions
    handleWorkspaceAction(action, id, button);
  }, true); // Use capture phase for better event handling

  workspaceClickBound = true;

  // Search functionality
  const searchInput = document.getElementById('workspaceSearch');
  if (searchInput) {
    searchInput.oninput = (e) => {
      workspaceSearch = e.target.value.toLowerCase();
      renderWorkspace(activeWorkspace);
    };
  }
}

/**
 * Handle workspace action (edit, complete, call, visit, invoice, delete, etc)
 */
async function handleWorkspaceAction(action, appointmentId, buttonElement) {
  try {
    if (!appointmentId) {
      return;
    }

    // Get appointment from data-layer or window.appointments
    const apt = (window.appointments || []).find(a => a.id === appointmentId);
    if (!apt && action !== 'invoice') {
      console.error(`❌ [WS] Appointment not found: ${appointmentId}`);
      return;
    }

    switch (action) {
      // ===== EDIT ACTION =====
      case 'edit':
        if (typeof window.handleEditAction === 'function') {
          const { openCustomModal } = await import('../shared/modal.js').catch(() => ({ openCustomModal: null }));
          await window.handleEditAction(appointmentId, apt, openCustomModal);
        } else if (typeof window.enterEditMode === 'function') {
          window.enterEditMode(apt);
          if (typeof tvAptDrawerOpen === 'function') tvAptDrawerOpen();
        }
        break;

      // ===== PAYMENT TOGGLE =====
      case 'toggle-paid':
      case 'paid':
        if (typeof window.toggleAppointmentPaidStatus === 'function') {
          await window.toggleAppointmentPaidStatus(appointmentId);
        }
        break;

      // ===== START JOB ACTION =====
      case 'start-job':
      case 'start':
        await startAppointmentWorkspace(appointmentId, apt);
        break;

      // ===== COMPLETE ACTION =====
      case 'complete':
      case 'complete-job':
        await completeAppointmentWorkspace(appointmentId);
        break;

      // ===== CALL ACTION =====
      case 'call':
        const phone = (apt?.customerPhone || apt?.phone || '').trim();
        if (phone && phone.length >= 6) {
          // Mark Call as used for this appointment
          if (!window.callUsedOnce) window.callUsedOnce = {};
          window.callUsedOnce[appointmentId] = true;
          // Trigger tel: link
          window.location.href = `tel:${phone}`;
          // ✅ FIXED: Re-render workspace instead of legacy renderAppointments
          // This moves Call button from primary to secondary (More) menu
          if (typeof window.renderWorkspace === 'function' && window.__workspaceState?.activeWorkspace) {
            setTimeout(() => {
              window.renderWorkspace(window.__workspaceState.activeWorkspace);
            }, 500);
          }
        }
        break;

      // ===== VISIT ACTION =====
      case 'visit':
        if (typeof window.handleVisitAction === 'function') {
          const { confirmModal } = await import('../shared/modal.js').catch(() => ({ confirmModal: null }));
          await window.handleVisitAction(appointmentId, apt, confirmModal);
        } else if (apt?.address) {
          window.location.href = `https://maps.google.com/?q=${encodeURIComponent(apt.address)}`;
        }
        break;

      // ===== INVOICE ACTION =====
      case 'invoice':
      case 'view':
        if (typeof window.getOrCreateInvoiceForAppointment === 'function') {
          try {
            const invoiceId = await window.getOrCreateInvoiceForAppointment(appointmentId, apt || {});
            const basePath = window.location.pathname.replace(/[^/]+$/, '');
            const url = basePath + 'invoice.html?invoiceId=' + encodeURIComponent(invoiceId) + '&mode=view';
            const popup = window.open(url, '_blank');
            if (!popup) {
              window.location.href = url;
            }
          } catch (err) {
            console.error('[WS] Invoice error:', err);
            window.showNotification?.('Could not open invoice', 'error');
          }
        }
        break;

      // ===== DELETE ACTION =====
      case 'delete':
        if (typeof window.handleDeleteAction === 'function') {
          const { confirmModal } = await import('../shared/modal.js').catch(() => ({ confirmModal: null }));
          await window.handleDeleteAction(appointmentId, apt, confirmModal);
        }
        break;

      // ===== EXPAND/COLLAPSE SECONDARY ACTIONS =====
      case 'toggle-secondary':
        if (typeof window.toggleSecondaryActions === 'function') {
          window.toggleSecondaryActions(appointmentId, buttonElement);
        } else {
          // Fallback: toggle visibility of secondary actions menu
          const card = buttonElement?.closest('[data-apt-id]');
          if (card) {
            const secondaryMenu = card.querySelector(`[data-secondary-menu="${appointmentId}"]`);
            if (secondaryMenu) {
              secondaryMenu.classList.toggle('collapsed');
            }
          }
        }
        break;

      default:
        return;
    }
  } catch (error) {
    console.error(`❌ [WS] Error handling action "${action}":`, error);
    if (typeof window.showNotification === 'function') {
      window.showNotification?.(`Error: ${action} failed`, 'error');
    }
  }
}

/**
 * Start appointment job from workspace
 */
async function startAppointmentWorkspace(appointmentId, apt) {
  if (!appointmentId || !window.db) return;

  try {
    const {
      doc,
      updateDoc,
      serverTimestamp,
      arrayUnion,
      Timestamp
    } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

    const ref = doc(window.db, 'appointments', appointmentId);
    const startPayload = {
      jobStatus: 'in_progress',
      jobStartedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: 'in_progress',
      startedAt: serverTimestamp(),
      jobEvents: arrayUnion({ type: 'job_started', at: serverTimestamp(), source: 'workspace' })
    };

    try {
      await updateDoc(ref, startPayload);
    } catch {
      await updateDoc(ref, {
        ...startPayload,
        jobEvents: arrayUnion({ type: 'job_started', at: Timestamp.now(), source: 'workspace' })
      });
    }

    renderWorkspace(activeWorkspace);
    window.updateDashboardMetrics?.();

    const address = String(apt?.address || '').trim();
    if (!address) {
      window.showNotification?.('No address saved. Add it in Edit.', 'info');
      return;
    }

    let shouldNavigate = false;
    const { confirmModal } = await import('../shared/modal.js').catch(() => ({ confirmModal: null }));
    if (typeof confirmModal === 'function') {
      shouldNavigate = await confirmModal({
        title: 'Open navigation',
        message: 'Open navigation now?',
        confirmText: 'Open Maps',
        cancelText: 'Later',
        variant: 'primary'
      });
    } else {
      shouldNavigate = window.confirm('Open navigation now?');
    }

    if (shouldNavigate) {
      window.open(`https://maps.google.com/?q=${encodeURIComponent(address)}`, '_blank');
    }
  } catch (error) {
    console.error('❌ Error starting job:', error);
    window.showNotification?.('Could not start job', 'error');
  }
}

/**
 * Mark appointment as completed
 */
async function completeAppointmentWorkspace(appointmentId) {
  if (!appointmentId || !window.db) return;

  try {
    const {
      doc,
      updateDoc,
      serverTimestamp,
      arrayUnion,
      Timestamp
    } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

    const ref = doc(window.db, 'appointments', appointmentId);
    const completePayload = {
      jobStatus: 'completed',
      jobCompletedAt: serverTimestamp(),
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: 'completed',
      jobEvents: arrayUnion({ type: 'job_completed', at: serverTimestamp(), source: 'workspace' })
    };

    try {
      await updateDoc(ref, completePayload);
    } catch {
      await updateDoc(ref, {
        ...completePayload,
        jobEvents: arrayUnion({ type: 'job_completed', at: Timestamp.now(), source: 'workspace' })
      });
    }

    renderWorkspace(activeWorkspace); // Refresh workspace
    window.updateDashboardMetrics?.();
  } catch (error) {
    console.error('❌ Error marking appointment complete:', error);
  }
}

/**
 * Mark invoice as paid
 */
window.markInvoicePaid = async function(invoiceId) {
  if (!invoiceId || !window.db) {
    console.error('❌ Cannot mark invoice paid: missing invoiceId or db');
    return;
  }

  try {
    const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    const invoices = Array.isArray(window.allInvoices) ? window.allInvoices : [];
    const targetInvoice = invoices.find(i => i.id === invoiceId) || null;
    const invoiceTotal = targetInvoice ? (targetInvoice.total || targetInvoice.totals?.total || 0) : 0;
    const appointmentId = targetInvoice?.appointmentId || targetInvoice?.aptId || targetInvoice?.meta?.appointmentId || null;

    await updateDoc(doc(window.db, 'invoices', invoiceId), {
      paymentStatus: 'paid',
      paidAmount: invoiceTotal
    });

    // Keep appointment/workspace filters consistent: paid invoice => completed appointment
    if (appointmentId) {
      await updateDoc(doc(window.db, 'appointments', appointmentId), {
        status: 'completed',
        paymentStatus: 'paid'
      });
    }

    renderWorkspace(activeWorkspace); // Refresh workspace
    window.updateDashboardMetrics?.();
  } catch (error) {
    console.error('❌ Error marking invoice paid:', error);
  }
};

// ==========================================
// INITIALIZATION
// ==========================================

/**
 * Initialize workspace system
 * Called on page load
 */
window.initWorkspacePanel = function() {
  const initState = window.__tvInit = window.__tvInit || {};
  if (initState.workspacePanelInitialized || initState.workspacePanelInitializing) {
    return;
  }
  initState.workspacePanelInitializing = true;

  // CRITICAL: Bind event handlers to the workspace container BEFORE setting initial workspace
  // This ensures buttons work immediately when appointments render
  try {
    bindWorkspaceActions();

    // Set default workspace to today
    setActiveWorkspace('today');
    initState.workspacePanelInitialized = true;

    if (!initState.initProofLogged) {
      initState.initProofLogged = true;
      console.log('[INIT ONCE]', {
        workspacePanelInitialized: true,
        appInitDone: !!initState.appInitDone,
        scriptBootstrapDone: !!initState.scriptBootstrapDone,
        storageInitDone: !!initState.storageInitDone
      });
    }
  } finally {
    initState.workspacePanelInitializing = false;
  }
};

// Make renderWorkspace globally available for data-layer sync
window.renderWorkspace = renderWorkspace;

// Export for ES6 modules (used when imported)
export { setActiveWorkspace, renderWorkspace, getWorkspaceData };
