import { getAppointmentById } from '../../services/appointmentsService.js';
import { loadLogoAsDataURL } from '../../services/assetsService.js';
import { mapAppointmentToInvoiceModel } from './invoiceMapper.js';
import { buildInvoicePdf } from './invoicePdf.js';
import { openPreview } from './invoicePreview.js';

const LOGO_PATH = '/assets/transvortex-logo.png';

export async function downloadInvoicePDF(appointmentId) {
  const appointment = await getAppointmentById(appointmentId);
  if (!appointment) throw new Error('Appointment not found');
  const invoiceModel = mapAppointmentToInvoiceModel(appointment);
  const logo = await loadLogoAsDataURL(LOGO_PATH);
  const doc = buildInvoicePdf(invoiceModel, logo);

  const blob = doc.output('blob');
  const fileName = `${invoiceModel.invoice.number}.pdf`;

  if (navigator.share && navigator.canShare?.({ files: [new File([blob], fileName, { type: 'application/pdf' })] })) {
    const file = new File([blob], fileName, { type: 'application/pdf' });
    await navigator.share({ files: [file], title: fileName });
    return;
  }

  if (/Mobi|Android/i.test(navigator.userAgent)) {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    return;
  }

  doc.save(fileName);
}

export async function openInvoicePreview(appointmentId) {
  const appointment = await getAppointmentById(appointmentId);
  if (!appointment) throw new Error('Appointment not found');
  const invoiceModel = mapAppointmentToInvoiceModel(appointment);
  const logo = await loadLogoAsDataURL(LOGO_PATH);
  return openPreview(invoiceModel, logo, () => downloadInvoicePDF(appointmentId));
}
