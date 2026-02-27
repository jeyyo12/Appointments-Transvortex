/**
 * Invoices Storage Page Module
 * Initializes invoices storage section
 */

import { startInvoicesListener, stopInvoicesListener } from './storage.service.js';
import { filterInvoices } from './storage.ui.js';
import { setupSearchAndFilterListeners, handleRefreshInvoicesClick, handleCleanupDuplicatesClick } from './storage.events.js';
import { createLogger } from '../shared/logger.js';
import { byId } from '../shared/dom.js';
import { setState } from '../shared/state.js';
import { checkIsAdmin } from '../firebase/firebase.js';

const logger = createLogger('StoragePage');

function getDataLayerStore() {
  if (typeof window === 'undefined') return null;
  return window.Store || window._dataLayer?.store || null;
}

function hasDataLayerInvoices() {
  const store = getDataLayerStore();
  return !!(store && store.invoicesById instanceof Map);
}

function bindStoreInvoicePipeline(initState) {
  const store = getDataLayerStore();
  if (!store || typeof store.subscribe !== 'function') return false;

  if (typeof initState.storageInvoicesUnsub === 'function') return true;

  if (store.dataReady || (store.invoicesById instanceof Map && store.invoicesById.size > 0)) {
    setState('storageInvoicesLoaded', true);
  }

  initState.storageInvoicesUnsub = store.subscribe((event) => {
    if (event.type !== 'invoiceChanged' && event.type !== 'dataReady') return;
    if (event.type === 'dataReady' || store.dataReady || (store.invoicesById instanceof Map && store.invoicesById.size > 0)) {
      setState('storageInvoicesLoaded', true);
    }
    filterInvoices();
  });

  filterInvoices();
  return true;
}

/**
 * Initialize invoices storage page
 */
export function initInvoicesStorage() {
  if (typeof window !== 'undefined') {
    window.__USE_MODULAR_STORAGE__ = true;
  }

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
    const refreshBtn = byId('refreshInvoicesButton');
    if (refreshBtn && !refreshBtn.dataset.tvBoundRefresh) {
      refreshBtn.addEventListener('click', () => {
        handleRefreshInvoicesClick(filterInvoices);
      });
      refreshBtn.dataset.tvBoundRefresh = '1';
    }

    // Setup cleanup duplicates button
    const cleanupBtn = byId('cleanupInvoicesBtn');
    if (cleanupBtn) {
      if (!checkIsAdmin()) {
        cleanupBtn.style.display = 'none';
      } else if (!cleanupBtn.dataset.tvBoundCleanup) {
        cleanupBtn.addEventListener('click', handleCleanupDuplicatesClick);
        cleanupBtn.dataset.tvBoundCleanup = '1';
      }
    }

    // Single source of truth: prefer data-layer store and avoid running both pipelines at once
    if (hasDataLayerInvoices() && bindStoreInvoicePipeline(initState)) {
      if (initState.storageFallbackActive) {
        stopInvoicesListener();
        initState.storageFallbackActive = false;
      }
    } else {
      // Temporary fallback only until data-layer store is ready
      startInvoicesListener(filterInvoices);
      initState.storageFallbackActive = true;

      if (!initState.storagePipelineWatcher) {
        initState.storagePipelineWatcher = setInterval(() => {
          if (bindStoreInvoicePipeline(initState)) {
            if (initState.storageFallbackActive) {
              stopInvoicesListener();
              initState.storageFallbackActive = false;
            }
            clearInterval(initState.storagePipelineWatcher);
            initState.storagePipelineWatcher = null;
          }
        }, 500);
      }
    }
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
  if (typeof window !== 'undefined') {
    const initState = window.__tvInit || {};
    if (typeof initState.storageInvoicesUnsub === 'function') {
      initState.storageInvoicesUnsub();
      initState.storageInvoicesUnsub = null;
    }
    if (initState.storagePipelineWatcher) {
      clearInterval(initState.storagePipelineWatcher);
      initState.storagePipelineWatcher = null;
    }
    initState.storageFallbackActive = false;
  }
  stopInvoicesListener();
}

// Expose refresh function to global scope
if (typeof window !== 'undefined') {
  window.handleRefreshInvoices = () => handleRefreshInvoicesClick(filterInvoices);
}
