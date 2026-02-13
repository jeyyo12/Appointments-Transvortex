/**
 * Formatting Utilities
 * Currency, dates, numbers, phone formatters
 */

/**
 * Format amount as GBP currency
 * @param {number} amount - The amount to format
 * @returns {string} Formatted currency string (£X.XX)
 */
export function formatCurrencyGBP(amount) {
  const num = toNumber(amount);
  return '£' + num.toFixed(2);
}

/**
 * Safely parse a value to number
 * @param {any} value - Value to parse
 * @returns {number} Parsed number or 0
 */
export function toNumber(value) {
  if (typeof value === 'number') return value;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Format date to DD/MM/YYYY
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  return `${day}/${month}/${year}`;
}

/**
 * Format date to YYYY-MM-DD (for input fields)
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDateISO(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  
  return d.toISOString().split('T')[0];
}

/**
 * Format time to HH:MM
 * @param {Date|string} time - Time to format
 * @returns {string} Formatted time string
 */
export function formatTime(time) {
  if (!time) return '';
  
  if (typeof time === 'string') {
    return time; // Already formatted
  }
  
  const d = new Date(time);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  
  return `${hours}:${minutes}`;
}

/**
 * Format phone number (UK format)
 * @param {string} phone - Phone number
 * @returns {string} Formatted phone
 */
export function formatPhone(phone) {
  if (!phone) return '';
  // Remove non-digits
  const digits = phone.replace(/\D/g, '');
  
  // UK mobile: +44 7XXX XXXXXX
  if (digits.startsWith('44') && digits.length === 12) {
    return `+44 ${digits.slice(2, 6)} ${digits.slice(6)}`;
  }
  
  // UK mobile: 07XXX XXXXXX
  if (digits.startsWith('0') && digits.length === 11) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  
  return phone; // Return as-is if not recognized
}

/**
 * Parse date from various formats
 * @param {string|Date} value - Date value
 * @returns {Date|null} Parsed date or null
 */
export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Compute payment status based on total and amount paid
 * @param {number} total - Total amount
 * @param {number} amountPaid - Amount paid
 * @returns {'paid'|'partial'|'unpaid'} Payment status
 */
export function getPaymentStatus(total, amountPaid) {
  const totalNum = toNumber(total);
  const paidNum = toNumber(amountPaid);
  
  if (paidNum <= 0) return 'unpaid';
  if (paidNum >= totalNum) return 'paid';
  return 'partial';
}

/**
 * Get payment badge class
 * @param {string} status - Payment status
 * @returns {string} CSS class
 */
export function getPaymentBadgeClass(status) {
  switch (status) {
    case 'paid': return 'badge-paid';
    case 'partial': return 'badge-partial';
    case 'unpaid': return 'badge-unpaid';
    default: return 'badge-unpaid';
  }
}

/**
 * Get payment badge text
 * @param {string} status - Payment status
 * @returns {string} Display text
 */
export function getPaymentBadgeText(status) {
  switch (status) {
    case 'paid': return 'Paid';
    case 'partial': return 'Partial';
    case 'unpaid': return 'Unpaid';
    default: return 'Unpaid';
  }
}
