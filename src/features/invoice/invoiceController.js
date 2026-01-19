import { mapAppointmentToInvoiceModel } from './invoiceMapper.js';
import { buildInvoicePdf } from './invoicePdf.js';

function isMobileDevice() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.matchMedia('(max-width: 768px)').matches;
}

export async function downloadInvoicePDF(appointment) {
  console.log('[InvoiceController] Invoice button clicked for appointment:', appointment?.id || appointment);
  
  try {
    // Validate input
    if (!appointment) {
      throw new Error('Appointment ID or data is missing');
    }
    
    // If appointment is just an ID string, fetch it
    let appointmentData = appointment;
    if (typeof appointment === 'string') {
      console.log('[InvoiceController] Fetching appointment by ID:', appointment);
      // Import getAppointmentById dynamically to avoid circular deps
      const { getAppointmentById } = await import('../../services/appointmentsService.js');
      appointmentData = await getAppointmentById(appointment);
      
      if (!appointmentData) {
        throw new Error(`Appointment with ID ${appointment} not found in database`);
      }
    }
    
    // Validate appointment data
    if (!appointmentData.id) {
      console.warn('[InvoiceController] Appointment missing ID field:', appointmentData);
      throw new Error('Appointment data is invalid (missing ID)');
    }

    console.log('[InvoiceController] Mapping appointment to invoice model');
    const invoiceModel = mapAppointmentToInvoiceModel(appointmentData);

    console.log('[InvoiceController] Building PDF');
    const doc = await buildInvoicePdf(invoiceModel);

    const fileName = `Invoice_${invoiceModel.invoice.pin}_${invoiceModel.customer.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    console.log('[InvoiceController] PDF built, filename:', fileName);

    // Mobile: try share API
    if (isMobileDevice() && navigator.share) {
      console.log('[InvoiceController] Attempting mobile share');
      try {
        const blob = doc.output('blob');
        const file = new File([blob], fileName, { type: 'application/pdf' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `Invoice ${invoiceModel.invoice.pin}`,
            text: `Invoice for ${invoiceModel.customer.name}`,
          });
          console.log('[InvoiceController] PDF shared successfully');
          return;
        }
      } catch (shareErr) {
        console.warn('[InvoiceController] Share failed, falling back:', shareErr);
      }
    }

    // Mobile fallback: open in new tab
    if (isMobileDevice()) {
      console.log('[InvoiceController] Opening PDF in new tab (mobile fallback)');
      const blobUrl = doc.output('bloburl');
      window.open(blobUrl, '_blank');
      console.log('[InvoiceController] PDF delivered via blob URL');
      return;
    }

    // Desktop: download
    console.log('[InvoiceController] Downloading PDF (desktop)');
    doc.save(fileName);
    console.log('[InvoiceController] PDF downloaded successfully');

  } catch (error) {
    console.error('[InvoiceController] Invoice generation failed:', error);
    
    // User-friendly error messages
    let message = 'Failed to generate invoice';
    if (error.message.includes('not found')) {
      message = 'Programarea nu a fost găsită în baza de date';
    } else if (error.message.includes('missing')) {
      message = 'Date lipsă - vă rugăm să reîmprospătați pagina';
    } else {
      message = `Eroare la generare: ${error.message}`;
    }
    
    // Show notification if available
    if (typeof window.showNotification === 'function') {
      window.showNotification(message, 'error');
    } else {
      alert(message);
    }
    
    throw error;
  }
}

export async function openInvoicePreview(appointment) {
  console.log('[InvoiceController] Preview not implemented, generating PDF instead');
  return downloadInvoicePDF(appointment);
}
