import { formatGBP, formatDate } from '../shared/formatters.js';

export function mapAppointmentToInvoiceModel(appointment) {
  console.log('[invoiceMapper] Mapping appointment to invoice model:', appointment);
  
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
      phone: 'Mihai +44 7440787527',
      emergencyPhone: 'Iulian +44 7478280954',
    },
    invoice: {
      number: appointment.invoiceNumber || appointment.pin || `TVX-${appointment.id?.slice(0, 6).toUpperCase() || 'DRAFT'}`,
      date: formatDate(appointment.completedAt || appointment.date),
      pin: appointment.pin || `TVX-${Date.now().toString(36).toUpperCase()}`,
    },
    customer: {
      name: appointment.customerName || 'N/A',
      vehicle: appointment.vehicle || 'N/A',
      mileage: appointment.mileage || 'N/A',
      address: appointment.customerAddress || '',
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
    notes: appointment.notes || '',
    format: formatGBP,
  };

  console.log('[invoiceMapper] Invoice model created:', model);
  return model;
}
