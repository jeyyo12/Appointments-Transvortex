import jsPDF from 'jspdf';

export function buildInvoicePdf(invoiceModel, templateDataUrl, jsPDFLib) {
  console.log('[invoicePdf] Building PDF with model:', invoiceModel);
  console.log('[invoicePdf] Template available:', !!templateDataUrl);
  console.log('[invoicePdf] jsPDF library:', !!jsPDFLib);

  const { jsPDF } = jsPDFLib;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  // Add background template if available
  if (templateDataUrl) {
    try {
      doc.addImage(templateDataUrl, 'PNG', 0, 0, 210, 297);
      console.log('[invoicePdf] Template image added to PDF');
    } catch (err) {
      console.warn('[invoicePdf] Failed to add template image:', err);
    }
  } else {
    console.warn('[invoicePdf] No template - using plain background');
    // Add a simple header if no template
    doc.setFillColor(31, 31, 31);
    doc.rect(0, 0, 210, 40, 'F');
  }

  // Define positions (adjust these based on your template)
  const positions = {
    pin: { x: 170, y: 20 },
    date: { x: 170, y: 28 },
    customer: { x: 20, y: 60 },
    vehicle: { x: 20, y: 68 },
    mileage: { x: 20, y: 76 },
    vatRate: { x: 170, y: 76 },
    servicesStart: 100,
    rowHeight: 8,
    cols: {
      desc: 20,
      qty: 140,
      unit: 160,
      total: 190,
    },
    subtotal: { x: 190, y: 230 },
    vat: { x: 190, y: 238 },
    total: { x: 190, y: 246 },
    footer: { x: 20, y: 270 },
  };

  // Set font
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  // PIN and Date
  doc.text(`PIN: ${invoiceModel.invoice.pin}`, positions.pin.x, positions.pin.y, { align: 'right' });
  doc.text(`Date: ${invoiceModel.invoice.date}`, positions.date.x, positions.date.y, { align: 'right' });
  console.log('[invoicePdf] Header written');

  // Customer info
  doc.text(`Customer: ${invoiceModel.customer.name}`, positions.customer.x, positions.customer.y);
  doc.text(`Vehicle: ${invoiceModel.customer.vehicle}`, positions.vehicle.x, positions.vehicle.y);
  doc.text(`Mileage: ${invoiceModel.customer.mileage}`, positions.mileage.x, positions.mileage.y);
  doc.text(`VAT: ${(invoiceModel.totals.vatRate * 100).toFixed(0)}%`, positions.vatRate.x, positions.vatRate.y, { align: 'right' });
  console.log('[invoicePdf] Customer info written');

  // Services table
  let y = positions.servicesStart;
  doc.setFontSize(9);
  
  if (invoiceModel.services.length > 0) {
    invoiceModel.services.forEach((service, idx) => {
      if (y > 260) {
        doc.addPage();
        y = 30;
      }
      
      const descLines = doc.splitTextToSize(service.description, 110);
      doc.text(descLines, positions.cols.desc, y);
      doc.text(String(service.qty), positions.cols.qty, y, { align: 'right' });
      doc.text(invoiceModel.format(service.unitPrice), positions.cols.unit, y, { align: 'right' });
      doc.text(invoiceModel.format(service.lineTotal), positions.cols.total, y, { align: 'right' });
      
      y += positions.rowHeight;
    });
    console.log('[invoicePdf] Services written:', invoiceModel.services.length);
  } else {
    doc.text('No services listed', positions.cols.desc, y);
    console.log('[invoicePdf] No services to display');
  }

  // Totals
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  
  doc.text('Subtotal:', positions.subtotal.x - 30, positions.subtotal.y);
  doc.text(invoiceModel.format(invoiceModel.totals.subtotal), positions.subtotal.x, positions.subtotal.y, { align: 'right' });
  
  doc.setFont('helvetica', 'normal');
  doc.text(`VAT (${(invoiceModel.totals.vatRate * 100).toFixed(0)}%):`, positions.vat.x - 30, positions.vat.y);
  doc.text(invoiceModel.format(invoiceModel.totals.vatAmount), positions.vat.x, positions.vat.y, { align: 'right' });
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 138, 61); // Orange
  doc.text('TOTAL:', positions.total.x - 30, positions.total.y);
  doc.text(invoiceModel.format(invoiceModel.totals.total), positions.total.x, positions.total.y, { align: 'right' });
  console.log('[invoicePdf] Totals written');

  // Footer contact info
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  
  doc.text(`Call us: ${invoiceModel.company.phone}`, positions.footer.x, positions.footer.y);
  doc.text(`Emergency: ${invoiceModel.company.emergencyPhone}`, positions.footer.x, positions.footer.y + 5);
  doc.text(`Website: ${invoiceModel.company.website}`, positions.footer.x, positions.footer.y + 10);
  doc.text(`Invoice PIN: ${invoiceModel.invoice.pin}`, positions.footer.x, positions.footer.y + 20);
  console.log('[invoicePdf] Footer written');

  console.log('[invoicePdf] PDF build complete');
  return doc;
}
