import { loadTemplateAsDataURL } from '../../services/assetsService.js';
import { layout } from './invoiceLayoutMap.js';

export async function buildInvoicePdf(invoiceModel) {
  console.log('[InvoicePDF] Starting PDF build');
  
  if (typeof window.jspdf === 'undefined') {
    throw new Error('jsPDF not loaded. Please include jsPDF library.');
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  // Load and add template background
  try {
    const templateDataUrl = await loadTemplateAsDataURL(layout.templatePath);
    console.log('[InvoicePDF] Template loaded, adding to PDF');
    doc.addImage(templateDataUrl, 'PNG', 0, 0, 210, 297);
  } catch (err) {
    console.warn('[InvoicePDF] Template load failed, using blank background:', err);
  }

  const { positions } = layout;

  // Set font
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  // Header info
  console.log('[InvoicePDF] Adding header information');
  doc.text(`PIN: ${invoiceModel.invoice.pin}`, positions.pin.x, positions.pin.y, { align: 'right' });
  doc.text(`Date: ${invoiceModel.invoice.date}`, positions.date.x, positions.date.y, { align: 'right' });

  // Customer info
  console.log('[InvoicePDF] Adding customer information');
  doc.text(`Customer: ${invoiceModel.customer.name}`, positions.customer.x, positions.customer.y);
  doc.text(`Vehicle: ${invoiceModel.customer.vehicle}`, positions.vehicle.x, positions.vehicle.y);
  doc.text(`Mileage: ${invoiceModel.customer.mileage}`, positions.mileage.x, positions.mileage.y);
  doc.text(`VAT: ${(invoiceModel.totals.vatRate * 100).toFixed(0)}%`, positions.vatRate.x, positions.vatRate.y, { align: 'right' });

  // Services table
  console.log('[InvoicePDF] Adding services table');
  let y = positions.servicesStart;
  
  if (invoiceModel.services.length > 0) {
    invoiceModel.services.forEach((service, idx) => {
      if (y > 250) {
        doc.addPage();
        y = 30;
      }
      
      const description = doc.splitTextToSize(service.description, 100);
      doc.text(description, positions.cols.description, y);
      doc.text(String(service.qty), positions.cols.qty, y, { align: 'right' });
      doc.text(invoiceModel.format(service.unitPrice), positions.cols.unitPrice, y, { align: 'right' });
      doc.text(invoiceModel.format(service.lineTotal), positions.cols.lineTotal, y, { align: 'right' });
      
      y += positions.rowHeight;
      console.log(`[InvoicePDF] Added service ${idx + 1}: ${service.description}`);
    });
  } else {
    doc.text('No services listed', positions.cols.description, y);
    y += positions.rowHeight;
  }

  // Totals
  console.log('[InvoicePDF] Adding totals');
  doc.setFont('helvetica', 'bold');
  doc.text('Subtotal:', positions.subtotal.x - 30, positions.subtotal.y);
  doc.text(invoiceModel.format(invoiceModel.totals.subtotal), positions.subtotal.x, positions.subtotal.y, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.text(`VAT (${(invoiceModel.totals.vatRate * 100).toFixed(0)}%):`, positions.vat.x - 30, positions.vat.y);
  doc.text(invoiceModel.format(invoiceModel.totals.vatAmount), positions.vat.x, positions.vat.y, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 99, 72);
  doc.text('TOTAL:', positions.total.x - 30, positions.total.y);
  doc.text(invoiceModel.format(invoiceModel.totals.total), positions.total.x, positions.total.y, { align: 'right' });

  // Notes
  if (invoiceModel.notes) {
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const notesText = doc.splitTextToSize(invoiceModel.notes, 170);
    doc.text(notesText, positions.notes.x, positions.notes.y);
  }

  // Footer
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Call: Mihai +44 7440787527 | Emergency: Iulian +44 7478280954', 20, 280);
  doc.text('Web: https://transvortexltd.co.uk/', 20, 285);
  doc.text(`Invoice PIN: ${invoiceModel.invoice.pin}`, 20, 290);

  console.log('[InvoicePDF] PDF build complete');
  return doc;
}
