export function formatGBP(value) {
  const num = parseFloat(value || 0);
  return '£' + num.toFixed(2);
}

export function formatDate(date) {
  if (!date) return new Date().toISOString().split('T')[0];
  if (typeof date === 'string') return date.split('T')[0];
  return date.toISOString().split('T')[0];
}
