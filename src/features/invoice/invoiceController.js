import { getAppointmentById } from '../../services/appointmentsService.js';
import { loadInvoiceTemplate } from '../../services/assetsService.js';
import { mapAppointmentToInvoiceModel } from './invoiceMapper.js';
import { buildInvoicePdf } from './invoicePdf.js';

const TEMPLATE_PATH = '/Images/Invoice.png';

function isMobileDevice() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
         window.matchMedia('(max-width: 768px)').matches;
}

async function deliverPDF(doc, fileName) {
  console.log('[invoiceController] Delivering PDF:', fileName);
  const blob = doc.output('blob');

  // Try native share on mobile
  if (isMobileDevice() && navigator.share) {
    try {
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        console.log('[invoiceController] Using native share');
        await navigator.share({ 
          files: [file], 
          title: 'Invoice',
          text: `Invoice ${fileName}` 
        });
        console.log('[invoiceController] PDF shared successfully');
        return;
      }
    } catch (err) {
      console.warn('[invoiceController] Share failed:', err);
    }
  }

  // Try opening in new tab (mobile fallback)
  if (isMobileDevice()) {
    try {
      console.log('[invoiceController] Opening PDF in new tab (mobile)');
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (win) {
        console.log('[invoiceController] PDF opened in new tab');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return;
      }
    } catch (err) {
      console.warn('[invoiceController] Open in tab failed:', err);
    }
  }

  // Desktop: direct download
  console.log('[invoiceController] Using direct download');
  doc.save(fileName);
  console.log('[invoiceController] PDF download initiated');
}

export async function downloadInvoicePDF(appointmentId) {
  console.log('[invoiceController] === INVOICE GENERATION START ===');
  console.log('[invoiceController] Appointment ID:', appointmentId);

  try {
    // Check jsPDF
    if (typeof window.jspdf === 'undefined') {
      throw new Error('jsPDF library not loaded. Include <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>');
    }
    console.log('[invoiceController] jsPDF library detected');

    // Fetch appointment
    console.log('[invoiceController] Fetching appointment data...');
    const appointment = await getAppointmentById(appointmentId);
    if (!appointment) {
      throw new Error('Appointment not found: ' + appointmentId);
    }
    console.log('[invoiceController] Appointment loaded');

    // Map to invoice model
    console.log('[invoiceController] Mapping to invoice model...');
    const invoiceModel = mapAppointmentToInvoiceModel(appointment);

    // Load template
    console.log('[invoiceController] Loading template...');
    const template = await loadInvoiceTemplate(TEMPLATE_PATH);
    if (!template) {
      console.warn('[invoiceController] Template not found, using plain PDF');
    }

    // Build PDF
    console.log('[invoiceController] Building PDF...');
    const doc = buildInvoicePdf(invoiceModel, template, window.jspdf);

    // Deliver
    const fileName = `Invoice_${invoiceModel.invoice.pin}_${invoiceModel.customer.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    console.log('[invoiceController] Delivering PDF:', fileName);
    await deliverPDF(doc, fileName);

    console.log('[invoiceController] === INVOICE GENERATION SUCCESS ===');
    return true;

  } catch (error) {
    console.error('[invoiceController] === INVOICE GENERATION FAILED ===');
    console.error('[invoiceController] Error:', error);
    alert(`Failed to generate invoice: ${error.message}`);
    return false;
  }
}

export async function openInvoicePreview(appointmentId) {
  console.log('[invoiceController] Preview not implemented - downloading PDF instead');
  return downloadInvoicePDF(appointmentId);
}
