export function formatGBP(amount) {
  return `£${parseFloat(amount || 0).toFixed(2)}`;
}

export function formatDate(dateStr) {
  if (!dateStr) return new Date().toISOString().slice(0, 10);
  return new Date(dateStr).toISOString().slice(0, 10);
}
