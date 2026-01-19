import { downloadInvoicePDF } from '../invoice/invoiceController.js';

// ...existing code...

async function finalizeAppointmentWithPrices(appointmentId, generateInvoiceNow) {
  // ...existing finalize logic...
  if (generateInvoiceNow) {
    await downloadInvoicePDF(appointmentId);
  }
}

// ...existing code...