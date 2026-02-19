/**
 * CENTRALIZED FORMATTING UTILITIES (DATA LAYER)
 * 
 * Single source of truth for all value formatting:
 * - Currency: Always GBP (£) with proper locale
 * - Numbers: Tousands separators where appropriate
 * 
 * Used by:
 * - ui-updater.js (header badges)
 * - data-actions.js (invoice operations)
 * - metrics-engine.js (computed values)
 */

/**
 * Format amount as GBP currency
 * @param {number|string} amount - The amount to format
 * @returns {string} Formatted currency string (£X.XX with commas for thousands)
 */
export function formatGBP(amount) {
  const num = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  
  if (!Number.isFinite(num)) {
    return '£0.00';
  }
  
  // Use Intl.NumberFormat for proper locale-aware formatting (UK English + GBP)
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

/**
 * Safely convert value to number
 * Handles string numbers, null, undefined, NaN
 * @param {any} value - Value to convert
 * @returns {number} Parsed number or 0
 */
export function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Format a number with thousands separators
 * @param {number|string} num - Number to format
 * @returns {string} Formatted number (e.g., "1,234")
 */
export function formatNumber(num) {
  const n = toNumber(num);
  return new Intl.NumberFormat('en-GB').format(n);
}

/**
 * Get numeric value without currency symbol (for calculations)
 * @param {string} currencyString - Currency formatted string (e.g., "£1,234.56")
 * @returns {number} Numeric value
 */
export function parseCurrencyValue(currencyString) {
  if (!currencyString) return 0;
  // Remove currency symbol and thousands separators, keep decimals
  const match = currencyString.match(/[\d,]+\.?\d*/);
  return toNumber(match ? match[0].replace(/,/g, '') : 0);
}

export default {
  formatGBP,
  toNumber,
  formatNumber,
  parseCurrencyValue
};
