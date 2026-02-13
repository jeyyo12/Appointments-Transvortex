/**
 * Invoice Create UI Module
 * Handles UI for invoice creation flow
 */

import { byId, getValue } from '../shared/dom.js';
import { createInvoiceFromAppointment, validateInvoiceCreation } from './invoiceCreate.flow.js';
import { createLogger } from '../shared/logger.js';

const logger = createLogger('InvoiceCreateUI');

function toNumber(value) {
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function collectLineItems(containerId, type) {
  const container = byId(containerId);
  if (!container) return [];
  const rows = Array.from(container.querySelectorAll('.tvLineItemRow'));

  return rows.map(row => {
    const description = row.querySelector('.tvLineItemDesc')?.value?.trim() || '';
    const qty = Math.max(1, toNumber(row.querySelector('.tvLineItemQty')?.value || 1));
    const unitPrice = toNumber(row.querySelector('.tvLineItemPrice')?.value || 0);
    const lineTotal = qty * unitPrice;
    if (!description && unitPrice === 0) return null;
    return { type, description, qty, unitPrice, lineTotal };
  }).filter(Boolean);
}

function collectJobsPartsFromForm() {
  const services = collectLineItems('jobsContainer', 'labour');
  const parts = collectLineItems('partsContainer', 'part');
  return { services, parts };
}

function buildJobsSummary(services = [], parts = []) {
  const jobNames = services.map(item => item.description).filter(Boolean);
  const partNames = parts.map(item => item.description).filter(Boolean);
  const jobText = jobNames.length > 0 ? `Jobs: ${jobNames.join(', ')}` : '';
  const partText = partNames.length > 0 ? `Parts: ${partNames.join(', ')}` : '';
  if (jobText && partText) return `${jobText} | ${partText}`;
  return jobText || partText || '';
}

/**
 * Handle "Create Invoice" button click from appointment form
 * Validates form data, creates invoice in Firestore, opens editor
 */
export function handleCreateInvoiceClick() {
  logger.info('Create Invoice button clicked');
  
  // Get form data
  const customerName = getValue(byId('customerName'))?.trim();
  const customerPhone = getValue(byId('customerPhone'))?.trim();
  const regNumber = getValue(byId('regNumber'))?.trim();
  const address = getValue(byId('address'));
  const makeModel = getValue(byId('makeModel'));
  const mileage = getValue(byId('mileage'));
  const { services, parts } = collectJobsPartsFromForm();
  const jobsSummary = buildJobsSummary(services, parts);
  const subtotal = services.reduce((sum, item) => sum + toNumber(item.lineTotal), 0)
    + parts.reduce((sum, item) => sum + toNumber(item.lineTotal), 0);
  
  // Construct prefill data
  const prefillData = {
    customerName,
    customerPhone,
    address,
    makeModel,
    registrationPlate: regNumber,
    mileage,
    services,
    parts,
    subtotal,
    total: subtotal,
    jobsSummary,
    problemDescription: jobsSummary
  };
  
  // Validate
  if (!validateInvoiceCreation({
    customerName,
    customerPhone,
    registrationPlate: regNumber
  })) {
    return;
  }
  
  // Create invoice immediately
  createInvoiceFromAppointment(null, prefillData);
}

/**
 * Initialize invoice create UI
 * Binds create invoice button
 */
export function initInvoiceCreateUI() {
  const createInvoiceBtn = byId('createInvoiceBtn');
  if (createInvoiceBtn) {
    createInvoiceBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleCreateInvoiceClick();
    });
    logger.info('Create Invoice button handler attached');
  } else {
    logger.warn('Create Invoice button not found in DOM');
  }
}
