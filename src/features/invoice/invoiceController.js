import { mapAppointmentToInvoiceModel } from './invoiceMapper.js';
import { buildInvoicePdf } from './invoicePdf.js';
import { getAppointmentById } from '../../services/appointmentsService.js';

function isMobileDevice() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.matchMedia('(max-width: 768px)').matches;
}

async function deliverPdf(doc, fileName) {
  // Try share
  if (isMobileDevice() && navigator.share) {
    try {
      const blob = doc.output('blob');
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName, text: fileName });
        return;
      }
    } catch (err) {
      console.warn('[InvoiceController] Share failed, fallback:', err);
    }
  }
  // Blob URL
  if (isMobileDevice()) {
    const url = doc.output('bloburl');
    window.open(url, '_blank');
    return;
  }
  // Desktop download
  doc.save(fileName);
}

export async function downloadInvoicePDF(appointmentId) {
  console.log('[InvoiceController] Invoice button clicked for appointment:', appointmentId);
  try {
    if (!appointmentId) throw new Error('appointmentId missing');

    let appointmentData = appointmentId;
    if (typeof appointmentId === 'string') {
      appointmentData = await getAppointmentById(appointmentId);
      if (!appointmentData) throw new Error(`Appointment with ID ${appointmentId} not found in database`);
    }
    if (!appointmentData.id) throw new Error('Appointment data is invalid (missing ID)');

    const invoiceModel = mapAppointmentToInvoiceModel(appointmentData);
    const doc = await buildInvoicePdf(invoiceModel);
    const fileName = `Invoice_${invoiceModel.invoice.pin}_${invoiceModel.customer.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    await deliverPdf(doc, fileName);
  } catch (error) {
    console.error('[InvoiceController] Invoice generation failed:', error);
    const msg = error.message.includes('not found')
      ? 'Programarea nu a fost găsită în baza de date'
      : error.message.includes('missing')
        ? 'Date lipsă - vă rugăm să reîmprospătați pagina'
        : `Eroare la generare: ${error.message}`;
    if (typeof window.showNotification === 'function') {
      window.showNotification(msg, 'error');
    } else {
      alert(msg);
    }
    throw error;
  }
}

export async function openInvoicePreview(appointment) {
  console.log('[InvoiceController] Preview not implemented, generating PDF instead');
  return downloadInvoicePDF(appointment);
}
