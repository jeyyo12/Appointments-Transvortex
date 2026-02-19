/**
 * Invoices Storage Page Module
 * Initializes invoices storage section
 */

import { startInvoicesListener, stopInvoicesListener } from './storage.service.js';
import { filterInvoices } from './storage.ui.js';
import { setupSearchAndFilterListeners, handleRefreshInvoicesClick, handleCleanupDuplicatesClick } from './storage.events.js';
import { createLogger } from '../shared/logger.js';
import { byId } from '../shared/dom.js';

const logger = createLogger('StoragePage');

/**
 * Initialize invoices storage page
 */
export function initInvoicesStorage() {
  const initState = typeof window !== 'undefined'
    ? (window.__tvInit = window.__tvInit || {})
    : {};

  if (initState.storageInitDone || initState.storageInitRunning) {
    logger.info('Skipping invoices storage init: already initialized or in progress');
    return;
  }

  initState.storageInitRunning = true;
  logger.info('Initializing invoices storage...');

  try {
    // Setup search and filter listeners
    setupSearchAndFilterListeners();

    // Setup refresh button
    const refreshBtn = byId('refreshInvoicesBtn');
    if (refreshBtn && !refreshBtn.dataset.tvBoundRefresh) {
      refreshBtn.addEventListener('click', () => {
        handleRefreshInvoicesClick(filterInvoices);
      });
      refreshBtn.dataset.tvBoundRefresh = '1';
    }

    // Setup cleanup duplicates button
    const cleanupBtn = byId('cleanupInvoicesBtn');
    if (cleanupBtn && !cleanupBtn.dataset.tvBoundCleanup) {
      cleanupBtn.addEventListener('click', handleCleanupDuplicatesClick);
      cleanupBtn.dataset.tvBoundCleanup = '1';
    }

    // Start listener with filter callback
    startInvoicesListener(filterInvoices);
    initState.storageInitDone = true;

    if (!initState.initProofLogged) {
      initState.initProofLogged = true;
      console.log('[INIT ONCE]', {
        storageInitDone: true,
        appInitDone: !!initState.appInitDone,
        scriptBootstrapDone: !!initState.scriptBootstrapDone,
        workspacePanelInitialized: !!initState.workspacePanelInitialized
      });
    }

    logger.info('✅ Invoices storage initialized');
  } finally {
    initState.storageInitRunning = false;
  }
}

/**
 * Cleanup invoices storage
 */
export function cleanupInvoicesStorage() {
  logger.info('Cleaning up invoices storage...');
  stopInvoicesListener();
}

// Expose refresh function to global scope
if (typeof window !== 'undefined') {
  window.handleRefreshInvoices = () => handleRefreshInvoicesClick(filterInvoices);
}
