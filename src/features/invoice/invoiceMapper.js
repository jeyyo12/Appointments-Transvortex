function formatGBP(n) {
  return '£' + parseFloat(n || 0).toFixed(2);
}

export function mapAppointmentToInvoiceModel(appointment) {
  const services = Array.isArray(appointment.services) ? appointment.services : [];
  const subtotal = services.reduce((sum, s) => sum + (Number(s.unitPrice) || 0) * (Number(s.qty) || 0), 0);
  const vatRate = appointment.vatRate ?? 0.2;
  const vatAmount = subtotal * vatRate;
  const total = subtotal + vatAmount;

  return {
    company: {
      name: appointment.companyName || 'Transvortex',
      website: appointment.companyWebsite || 'https://transvortex.com',
      email: appointment.companyEmail || 'office@transvortex.com',
    },
    invoice: {
      number: appointment.invoiceNumber || appointment.pin || `TVX-${appointment.id?.slice(0, 6) || 'UNKNOWN'}`,
      date: appointment.completedAt || appointment.date || new Date().toISOString().slice(0, 10),
    },
    customer: {
      name: appointment.customerName || '',
      vehicle: appointment.vehicle || '',
      mileage: appointment.mileage || '',
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
    notes: appointment.notes || (services.length ? '' : 'No services listed; refer to appointment notes.'),
    format: formatGBP,
  };
}
