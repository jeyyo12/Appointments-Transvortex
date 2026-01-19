import { formatGBP, formatDate } from '../shared/formatters.js';

export function mapAppointmentToInvoiceModel(appointment) {
  console.log('[InvoiceMapper] Mapping appointment:', appointment.id);
  
  const services = Array.isArray(appointment.services) ? appointment.services : [];
  const subtotal = services.reduce((sum, s) => sum + (Number(s.unitPrice) || 0) * (Number(s.qty) || 0), 0);
  const vatRate = appointment.vatRate ?? 0.20; // Default 20% VAT
  const vatAmount = subtotal * vatRate;
  const total = subtotal + vatAmount;

  const model = {
    company: {
      name: 'Transvortex Ltd',
      website: 'https://transvortexltd.co.uk',
      email: 'office@transvortex.com',
    },
    invoice: {
      number: appointment.invoiceNumber || `TVX-${appointment.id?.slice(0, 8) || 'DRAFT'}`,
      date: formatDate(appointment.completedAt || appointment.date),
      pin: appointment.pin || appointment.invoiceNumber || `TVX-${appointment.id?.slice(0, 8)}`,
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

  console.log('[InvoiceMapper] Mapped model:', model);
  return model;
}
