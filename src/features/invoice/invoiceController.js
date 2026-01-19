import { getAppointmentById } from '../../services/appointmentsService.js';
import { loadLogoAsDataURL } from '../../services/assetsService.js';
import { mapAppointmentToInvoiceModel } from './invoiceMapper.js';
import { buildInvoicePdf } from './invoicePdf.js';
import { openPreview } from './invoicePreview.js';

const LOGO_PATH = '/assets/transvortex-logo.png';

function isMobileDevice() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.matchMedia('(max-width: 768px)').matches;
}

export async function downloadInvoicePDF(appointmentId) {
  console.log('[Invoice Controller] Invoice button clicked for appointment:', appointmentId);
  
  try {
    const appointment = await getAppointmentById(appointmentId);
    if (!appointment) {
      console.error('[Invoice Controller] Appointment not found:', appointmentId);
      throw new Error('Appointment not found');
    }
    console.log('[Invoice Controller] Appointment loaded:', appointment);

    const invoiceModel = mapAppointmentToInvoiceModel(appointment);
    console.log('[Invoice Controller] Invoice model created:', invoiceModel);

    let logo = null;
    try {
      logo = await loadLogoAsDataURL(LOGO_PATH);
      console.log('[Invoice Controller] Logo loaded');
    } catch (err) {
      console.warn('[Invoice Controller] Logo load failed, continuing without it:', err);
    }

    const doc = await buildInvoicePdf(invoiceModel, logo);
    console.log('[Invoice Controller] PDF built successfully');

    const blob = doc.output('blob');
    const fileName = `Invoice_${invoiceModel.invoice.number}_${invoiceModel.customer.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    // Mobile: Try native share first
    if (isMobileDevice() && navigator.share && navigator.canShare) {
      try {
        const file = new File([blob], fileName, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
          console.log('[Invoice Controller] Using native share');
          await navigator.share({ 
            files: [file], 
            title: `Invoice ${invoiceModel.invoice.number}`,
            text: `Invoice for ${invoiceModel.customer.name}`
          });
          console.log('[Invoice Controller] PDF shared successfully');
          return;
        }
      } catch (err) {
        console.warn('[Invoice Controller] Share failed, falling back:', err);
      }
    }

    // Mobile fallback: Open in new tab
    if (isMobileDevice()) {
      const url = URL.createObjectURL(blob);
      console.log('[Invoice Controller] Opening PDF in new tab (mobile)');
      const newWindow = window.open(url, '_blank');
      if (!newWindow) {
        console.error('[Invoice Controller] Popup blocked, trying download');
        doc.save(fileName);
      }
      return;
    }

    // Desktop: Direct download
    console.log('[Invoice Controller] Downloading PDF (desktop)');
    doc.save(fileName);
    console.log('[Invoice Controller] PDF delivered successfully');
    
  } catch (error) {
    console.error('[Invoice Controller] Invoice generation failed:', error);
    alert('Failed to generate invoice: ' + error.message);
    throw error;
  }
}

export async function openInvoicePreview(appointmentId) {
  console.log('[Invoice Controller] Opening invoice preview for:', appointmentId);
  
  const appointment = await getAppointmentById(appointmentId);
  if (!appointment) throw new Error('Appointment not found');
  
  const invoiceModel = mapAppointmentToInvoiceModel(appointment);
  const logo = await loadLogoAsDataURL(LOGO_PATH).catch(() => null);
  
  return openPreview(invoiceModel, logo, () => downloadInvoicePDF(appointmentId));
}
