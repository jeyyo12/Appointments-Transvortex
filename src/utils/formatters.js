/**
 * Formatting Utilities
 * 
 * Centralized formatting functions for dates, times, phone numbers, and other display values.
 */

/**
 * Format date to ISO string (YYYY-MM-DD)
 * @param {Date} date - JavaScript Date object
 * @returns {string} ISO formatted date string
 */
export function formatISODate(date) {
  return date ? date.toISOString().split('T')[0] : '';
}

/**
 * Format time to HH:MM (24-hour format)
 * @param {Date} date - JavaScript Date object
 * @returns {string} Formatted time string
 */
export function formatHHMM(date) {
  if (!date) return '';
  return date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Format date for UK display (DD/MM/YYYY)
 * @param {Date|string} date - Date to format
 * @returns {string} UK formatted date
 */
export function formatDateUK(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (!d || isNaN(d.getTime())) return '';
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  return `${day}/${month}/${year}`;
}

/**
 * Format timestamp for timeline display (Romanian locale)
 * @param {Object|Date|number} timestamp - Firestore Timestamp, Date, or milliseconds
 * @returns {string} Formatted timestamp
 */
export function formatTimelineTimestamp(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Format date/time for display (Romanian locale, full format)
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date/time
 */
export function formatDateTime(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (!d || isNaN(d.getTime())) return '';
  
  return d.toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Format UK phone number with proper spacing
 * Handles both national (07XXX) and international (+44 7XXX) formats
 * @param {string} value - Phone number to format
 * @returns {string} Formatted phone number
 */
export function formatPhoneNumber(value) {
  if (!value) return '';
  
  // Remove all non-digit characters
  const digits = value.replace(/\D/g, '');
  
  // UK mobile format: +44 7XXX XXX XXX or 07XXX XXX XXX
  if (digits.startsWith('44')) {
    const local = digits.slice(2);
    if (local.length === 0) return '+44';
    if (local.length <= 3) return `+44 ${local}`;
    if (local.length <= 6) return `+44 ${local.slice(0, 3)} ${local.slice(3)}`;
    return `+44 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 10)}`;
  } else if (digits.startsWith('0')) {
    const local = digits.slice(1);
    if (local.length === 0) return '0';
    if (local.length <= 3) return `0${local}`;
    if (local.length <= 6) return `0${local.slice(0, 3)} ${local.slice(3)}`;
    return `0${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 10)}`;
  }
  
  return value;
}

/**
 * Format currency value (GBP)
 * @param {number} value - Numeric value
 * @param {boolean} showSymbol - Whether to show £ symbol (default: true)
 * @returns {string} Formatted currency
 */
export function formatCurrency(value, showSymbol = true) {
  const num = Number(value);
  if (!Number.isFinite(num)) return showSymbol ? '£0.00' : '0.00';
  
  const formatted = num.toFixed(2);
  return showSymbol ? `£${formatted}` : formatted;
}

/**
 * Format mileage/distance
 * @param {number} miles - Mileage value
 * @param {boolean} showUnit - Whether to show 'miles' unit (default: true)
 * @returns {string} Formatted mileage
 */
export function formatMileage(miles, showUnit = true) {
  const num = Number(miles);
  if (!Number.isFinite(num)) return '';
  
  const formatted = num.toLocaleString('en-GB');
  return showUnit ? `${formatted} miles` : formatted;
}

/**
 * Format duration in minutes to human-readable format
 * @param {number} minutes - Duration in minutes
 * @returns {string} Formatted duration (e.g., "1h 30m")
 */
export function formatDuration(minutes) {
  const num = Number(minutes);
  if (!Number.isFinite(num) || num < 0) return '';
  
  const hours = Math.floor(num / 60);
  const mins = num % 60;
  
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Format relative time (e.g., "2 hours ago", "in 3 days")
 * @param {Date|string} date - Date to compare
 * @param {Date} reference - Reference date (default: now)
 * @returns {string} Relative time string
 */
export function formatRelativeTime(date, reference = new Date()) {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (!d || isNaN(d.getTime())) return '';
  
  const diffMs = d.getTime() - reference.getTime();
  const diffMins = Math.round(diffMs / 60000);
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);
  
  if (Math.abs(diffMins) < 1) return 'acum';
  if (Math.abs(diffMins) < 60) {
    return diffMins > 0 ? `în ${diffMins} min` : `acum ${Math.abs(diffMins)} min`;
  }
  if (Math.abs(diffHours) < 24) {
    return diffHours > 0 ? `în ${diffHours}h` : `acum ${Math.abs(diffHours)}h`;
  }
  if (Math.abs(diffDays) < 7) {
    return diffDays > 0 ? `în ${diffDays} zile` : `acum ${Math.abs(diffDays)} zile`;
  }
  
  return formatDateUK(d);
}

/**
 * Truncate text to specified length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export function truncate(text, maxLength = 50) {
  if (!text || text.length <= maxLength) return text || '';
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Capitalize first letter of string
 * @param {string} text - Text to capitalize
 * @returns {string} Capitalized text
 */
export function capitalize(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Format registration plate (uppercase, remove extra spaces)
 * @param {string} regPlate - Registration plate
 * @returns {string} Formatted registration plate
 */
export function formatRegPlate(regPlate) {
  if (!regPlate) return '';
  return regPlate.toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * Format postcode (uppercase, proper spacing)
 * @param {string} postcode - UK postcode
 * @returns {string} Formatted postcode
 */
export function formatPostcode(postcode) {
  if (!postcode) return '';
  const cleaned = postcode.toUpperCase().replace(/\s+/g, '');
  
  // UK postcode format: AA9A 9AA or A9A 9AA or A9 9AA or AA9 9AA etc.
  if (cleaned.length >= 5) {
    return `${cleaned.slice(0, -3)} ${cleaned.slice(-3)}`;
  }
  
  return cleaned;
}

/**
 * Sanitize HTML to prevent XSS
 * @param {string} html - HTML string
 * @returns {string} Sanitized HTML
 */
export function sanitizeHTML(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.textContent = html;
  return div.innerHTML;
}

/**
 * Format file size in bytes to human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
export function formatFileSize(bytes) {
  const num = Number(bytes);
  if (!Number.isFinite(num) || num < 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = num;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Format number with thousands separators (commas)
 * @param {number|string} num - Number to format
 * @returns {string} Formatted number with commas (e.g., "12,345")
 */
export function formatNumberWithCommas(num) {
  if (!num && num !== 0) return '';
  const n = Number(num);
  if (!Number.isFinite(n)) return '';
  return Math.round(n).toLocaleString('en-GB');
}

/**
 * Convert number to English words
 * @param {number} n - Number to convert (0-999,999)
 * @returns {string} English representation
 */
export function numberToWordsEN(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 0) return '';
  if (num === 0) return 'zero';
  
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const scales = ['', 'thousand', 'million', 'billion'];
  
  if (num >= 1000000000) return 'very large number';
  
  const convertHundreds = (n) => {
    let result = '';
    const h = Math.floor(n / 100);
    if (h > 0) result += ones[h] + ' hundred';
    
    const remainder = n % 100;
    if (remainder >= 20) {
      if (result) result += ' ';
      result += tens[Math.floor(remainder / 10)];
      const digit = remainder % 10;
      if (digit > 0) result += ' ' + ones[digit];
    } else if (remainder >= 10) {
      if (result) result += ' ';
      result += teens[remainder - 10];
    } else if (remainder > 0) {
      if (result) result += ' ';
      result += ones[remainder];
    }
    
    return result;
  };
  
  let parts = [];
  let scaleIndex = 0;
  let remaining = Math.round(num);
  
  while (remaining > 0 && scaleIndex < scales.length) {
    const chunk = remaining % 1000;
    if (chunk > 0) {
      const text = convertHundreds(chunk);
      if (scales[scaleIndex]) parts.unshift(text + ' ' + scales[scaleIndex]);
      else parts.unshift(text);
    }
    remaining = Math.floor(remaining / 1000);
    scaleIndex++;
  }
  
  return parts.join(' ');
}

/**
 * Format UK registration plate with smart spacing
 * @param {string} plate - Plate string (e.g., "AB12XYZ")
 * @returns {string} Formatted plate (e.g., "AB12 XYZ") or original if invalid
 */
export function formatUKPlate(plate) {
  if (!plate) return '';
  
  // Remove spaces and convert to uppercase
  const clean = plate.replace(/\s+/g, '').toUpperCase();
  
  // Only alphanumerics allowed
  if (!/^[A-Z0-9]+$/.test(clean)) return clean;
  
  // Format patterns:
  // If exactly 2 letters + 2 numbers + 3 letters: AB12 XYZ
  // If exactly 2 letters + 3 numbers + 3 letters: AB123 XYZ
  // Otherwise, keep as-is
  
  if (clean.length === 7) {
    // Could be AB12XYZ (2 letters + 2 digits + 3 letters)
    const match = clean.match(/^([A-Z]{2})(\d{2})([A-Z]{3})$/);
    if (match) return `${match[1]}${match[2]} ${match[3]}`;
    
    // Or AB123XYZ (2 letters + 3 digits + 3 letters) -- still 2+3+3 = 8, so won't match here
  }
  
  if (clean.length === 8) {
    // Could be AB123XYZ (2 letters + 3 digits + 3 letters)
    const match = clean.match(/^([A-Z]{2})(\d{3})([A-Z]{3})$/);
    if (match) return `${match[1]}${match[2]} ${match[3]}`;
  }
  
  return clean;
}
