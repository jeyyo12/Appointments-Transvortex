export function formatGBP(amount) {
  return '£' + parseFloat(amount || 0).toFixed(2);
}

export function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB');
}

export function formatDateTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('en-GB');
}
