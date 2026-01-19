import { getAppointmentById } from '../../services/appointmentsService.js';
import { loadLogoAsDataURL } from '../../services/assetsService.js';
import { mapAppointmentToInvoiceModel } from './invoiceMapper.js';
import { buildInvoicePdf } from './invoicePdf.js';
import { openPreview } from './invoicePreview.js';

const LOGO_PATH = '/assets/transvortex-logo.png';

/**
 * Main entry point: Download invoice PDF
 */
export async function downloadInvoicePDF(appointmentId) {
  console.log('[Invoice Controller] Download PDF requested for appointment:', appointmentId);

  try {
    // Fetch appointment data
    console.log('[Invoice Controller] Fetching appointment data...');
    const appointment = await getAppointmentById(appointmentId);
    if (!appointment) {
      throw new Error('Appointment not found: ' + appointmentId);
    }
    console.log('[Invoice Controller] Appointment loaded:', appointment);

    // Map to invoice model
    console.log('[Invoice Controller] Mapping to invoice model...');
    const invoiceModel = mapAppointmentToInvoiceModel(appointment);
    console.log('[Invoice Controller] Invoice model created:', invoiceModel);

    // Load logo (optional, not used in template mode)
    console.log('[Invoice Controller] Loading logo...');
    let logo = null;
    try {
      logo = await loadLogoAsDataURL(LOGO_PATH);
      console.log('[Invoice Controller] Logo loaded');
    } catch (err) {
      console.warn('[Invoice Controller] Logo loading failed, continuing without:', err.message);
    }

    // Generate PDF
    console.log('[Invoice Controller] Building PDF...');
    const doc = await buildInvoicePdf(invoiceModel, logo);
    console.log('[Invoice Controller] PDF built successfully');

    // Deliver PDF
    await deliverPdf(doc, invoiceModel.invoice.number);
    console.log('[Invoice Controller] PDF delivered successfully');
  } catch (error) {
    console.error('[Invoice Controller] Error generating invoice:', error);
    alert('Failed to generate invoice: ' + error.message);
    throw error;
  }
}

/**
 * Deliver PDF based on device capabilities
 */
async function deliverPdf(doc, invoiceNumber) {
  const fileName = `Invoice_${invoiceNumber || 'Document'}.pdf`;
  const blob = doc.output('blob');

  console.log('[Invoice Controller] Delivering PDF:', fileName);

  // Mobile: Try navigator.share first
  if (isMobileDevice() && navigator.share) {
    console.log('[Invoice Controller] Attempting mobile share...');
    try {
      const file = new File([blob], fileName, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Invoice',
          text: `Invoice ${invoiceNumber || ''}`,
        });
        console.log('[Invoice Controller] Shared via navigator.share');
        return;
      } else {
        console.log('[Invoice Controller] navigator.canShare returned false, falling back');
      }
    } catch (err) {
      console.warn('[Invoice Controller] Share failed, falling back:', err.message);
    }
  }

  // Mobile fallback or desktop: Open in new tab
  if (isMobileDevice()) {
    console.log('[Invoice Controller] Opening PDF in new tab (mobile)');
    const blobUrl = URL.createObjectURL(blob);
    const win = window.open(blobUrl, '_blank');
    if (!win) {
      console.warn('[Invoice Controller] Popup blocked, using download fallback');
      doc.save(fileName);
    }
    return;
  }

  // Desktop: Direct download
  console.log('[Invoice Controller] Downloading PDF (desktop)');
  doc.save(fileName);
}

/**
 * Check if device is mobile
 */
function isMobileDevice() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    window.matchMedia('(max-width: 768px)').matches;
}

/**
 * Optional: Open invoice preview in modal
 */
export async function openInvoicePreview(appointmentId) {
  console.log('[Invoice Controller] Opening preview for appointment:', appointmentId);

  try {
    const appointment = await getAppointmentById(appointmentId);
    if (!appointment) {
      throw new Error('Appointment not found');
    }

    const invoiceModel = mapAppointmentToInvoiceModel(appointment);
    let logo = null;

    try {
      logo = await loadLogoAsDataURL(LOGO_PATH);
    } catch (err) {
      console.warn('[Invoice Controller] Logo not loaded for preview');
    }

    return openPreview(invoiceModel, logo, () => downloadInvoicePDF(appointmentId));
  } catch (error) {
    console.error('[Invoice Controller] Error opening preview:', error);
    alert('Failed to open invoice preview: ' + error.message);
    throw error;
  }
}
