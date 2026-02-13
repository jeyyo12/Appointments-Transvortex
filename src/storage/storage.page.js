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
  logger.info('Initializing invoices storage...');
  
  // Setup search and filter listeners
  setupSearchAndFilterListeners();
  
  // Setup refresh button
  const refreshBtn = byId('refreshInvoicesBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      handleRefreshInvoicesClick(filterInvoices);
    });
  }

  // Setup cleanup duplicates button
  const cleanupBtn = byId('cleanupInvoicesBtn');
  if (cleanupBtn) {
    cleanupBtn.addEventListener('click', handleCleanupDuplicatesClick);
  }
  
  // Start listener with filter callback
  startInvoicesListener(filterInvoices);
  
  logger.info('✅ Invoices storage initialized');
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
