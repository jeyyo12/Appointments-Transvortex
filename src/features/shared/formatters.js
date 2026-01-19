/**
 * Format number as GBP currency
 */
export function formatGBP(amount) {
  const num = parseFloat(amount) || 0;
  return '£' + num.toFixed(2);
}

/**
 * Format date as DD/MM/YYYY
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}
