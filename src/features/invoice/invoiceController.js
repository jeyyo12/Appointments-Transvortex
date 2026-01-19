import { getAppointmentById } from '../../services/appointmentsService.js';
import { mapAppointmentToInvoiceModel } from './invoiceMapper.js';
import { buildInvoicePdf } from './invoicePdf.js';

export async function downloadInvoicePDF(appointmentId) {
  console.log('[Invoice Controller] Invoice requested for appointment:', appointmentId);
  
  try {
    // Fetch appointment data
    const appointment = await getAppointmentById(appointmentId);
    if (!appointment) {
      console.error('[Invoice Controller] Appointment not found:', appointmentId);
      throw new Error('Appointment not found');
    }
    console.log('[Invoice Controller] Appointment loaded:', appointment);

    // Map to invoice model
    const invoiceModel = mapAppointmentToInvoiceModel(appointment);
    console.log('[Invoice Controller] Invoice model created:', invoiceModel);

    // Build PDF
    const doc = await buildInvoicePdf(invoiceModel);
    console.log('[Invoice Controller] PDF built successfully');

    // Generate filename
    const fileName = `Invoice_${invoiceModel.invoice.number || 'unknown'}_${invoiceModel.invoice.date}.pdf`;

    // Delivery strategy
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
                     window.matchMedia('(max-width: 768px)').matches;

    if (isMobile && navigator.share && navigator.canShare) {
      console.log('[Invoice Controller] Attempting mobile share');
      try {
        const pdfBlob = doc.output('blob');
        const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
        
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: fileName,
            text: `Invoice ${invoiceModel.invoice.number || ''}`
          });
          console.log('[Invoice Controller] PDF shared successfully');
          return;
        }
      } catch (err) {
        console.warn('[Invoice Controller] Share failed, falling back:', err);
      }
    }

    if (isMobile) {
      console.log('[Invoice Controller] Opening PDF in new tab (mobile)');
      const blobUrl = doc.output('bloburl');
      window.open(blobUrl, '_blank');
    } else {
      console.log('[Invoice Controller] Downloading PDF (desktop)');
      doc.save(fileName);
    }

    console.log('[Invoice Controller] Invoice delivered successfully');
  } catch (error) {
    console.error('[Invoice Controller] Invoice generation failed:', error);
    alert(`Failed to generate invoice: ${error.message}`);
    throw error;
  }
}

export async function openInvoicePreview(appointmentId) {
  console.log('[Invoice Controller] Preview not implemented, downloading instead');
  return downloadInvoicePDF(appointmentId);
}
