import { formatGBP } from '../shared/formatters.js';

function generateInvoicePIN() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TVX-${timestamp}-${random}`;
}

export function mapAppointmentToInvoiceModel(appointment) {
  const services = Array.isArray(appointment.services) ? appointment.services : [];
  const subtotal = services.reduce((sum, s) => sum + (Number(s.unitPrice) || 0) * (Number(s.qty) || 0), 0);
  const vatRate = appointment.vatRate ?? 0.2; // Default 20% VAT
  const vatAmount = subtotal * vatRate;
  const total = subtotal + vatAmount;

  return {
    company: {
      name: appointment.companyName || 'Transvortex Ltd',
      website: appointment.companyWebsite || 'https://transvortexltd.co.uk',
      email: appointment.companyEmail || 'office@transvortex.com',
    },
    invoice: {
      number: appointment.invoiceNumber || appointment.pin || generateInvoicePIN(),
      date: appointment.completedAt || appointment.date || new Date().toISOString().slice(0, 10),
    },
    customer: {
      name: appointment.customerName || appointment.name || 'N/A',
      vehicle: appointment.vehicle || 'N/A',
      mileage: appointment.mileage || 'N/A',
      address: appointment.customerAddress || appointment.address || '',
    },
    services: services.length
      ? services.map((s, idx) => ({
          description: s.description || s.name || `Service ${idx + 1}`,
          qty: Number(s.qty) || 1,
          unitPrice: Number(s.unitPrice) || 0,
          lineTotal: (Number(s.qty) || 1) * (Number(s.unitPrice) || 0),
        }))
      : [],
    totals: {
      subtotal,
      vatRate,
      vatAmount,
      total,
    },
    notes: appointment.notes || (services.length ? '' : 'No services listed; refer to appointment notes.'),
    format: formatGBP,
  };
}
