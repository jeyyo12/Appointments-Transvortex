import jsPDF from 'jspdf';

export function buildInvoicePdf(invoiceModel, logoDataUrl) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  let y = margin;

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', margin, y, 120, 60);
  }
  doc.setFontSize(18).setFont(undefined, 'bold').text(invoiceModel.company.name, margin + 140, y + 20);
  doc.setFontSize(10).setFont(undefined, 'normal');
  doc.text(invoiceModel.company.website, margin + 140, y + 38);
  doc.text(invoiceModel.company.email, margin + 140, y + 54);

  y += 80;
  doc.setFontSize(22).setFont(undefined, 'bold').text('INVOICE', margin, y);
  doc.setFontSize(11).setFont(undefined, 'normal');
  doc.text(`Invoice #: ${invoiceModel.invoice.number}`, margin, y + 18);
  doc.text(`Date: ${invoiceModel.invoice.date}`, margin, y + 34);

  y += 56;
  doc.setFontSize(12).setFont(undefined, 'bold').text('Bill To', margin, y);
  doc.setFontSize(11).setFont(undefined, 'normal');
  doc.text(invoiceModel.customer.name || '-', margin, y + 16);
  doc.text(invoiceModel.customer.vehicle || '', margin, y + 32);
  doc.text(invoiceModel.customer.mileage ? `Mileage: ${invoiceModel.customer.mileage}` : '', margin, y + 48);
  doc.text(invoiceModel.customer.address || '', margin, y + 64);

  y += 88;
  doc.setFontSize(12).setFont(undefined, 'bold').text('Services', margin, y);
  y += 16;
  const tableTop = y;
  doc.setFontSize(10).setFont(undefined, 'bold');
  doc.text('Description', margin, y);
  doc.text('Qty', margin + 260, y, { align: 'right' });
  doc.text('Unit Price', margin + 360, y, { align: 'right' });
  doc.text('Line Total', margin + 480, y, { align: 'right' });

  doc.setFont(undefined, 'normal');
  y += 12;
  if (invoiceModel.services.length) {
    invoiceModel.services.forEach((s) => {
      doc.text(s.description, margin, y);
      doc.text(String(s.qty), margin + 260, y, { align: 'right' });
      doc.text(invoiceModel.format(s.unitPrice), margin + 360, y, { align: 'right' });
      doc.text(invoiceModel.format(s.lineTotal), margin + 480, y, { align: 'right' });
      y += 18;
    });
  } else {
    doc.text(invoiceModel.notes || 'No services listed.', margin, y);
    y += 18;
  }

  y += 12;
  doc.line(margin, tableTop - 6, margin + 500, tableTop - 6);
  doc.line(margin, y - 6, margin + 500, y - 6);

  y += 10;
  doc.setFont(undefined, 'bold');
  doc.text('Subtotal', margin + 360, y, { align: 'right' });
  doc.text(invoiceModel.format(invoiceModel.totals.subtotal), margin + 480, y, { align: 'right' });

  y += 16;
  doc.text(`VAT (${(invoiceModel.totals.vatRate * 100).toFixed(0)}%)`, margin + 360, y, { align: 'right' });
  doc.text(invoiceModel.format(invoiceModel.totals.vatAmount), margin + 480, y, { align: 'right' });

  y += 16;
  doc.setFontSize(12).text('Total', margin + 360, y, { align: 'right' });
  doc.text(invoiceModel.format(invoiceModel.totals.total), margin + 480, y, { align: 'right' });

  if (invoiceModel.notes) {
    y += 32;
    doc.setFontSize(11).setFont(undefined, 'bold').text('Notes', margin, y);
    doc.setFont(undefined, 'normal').text(invoiceModel.notes, margin, y + 16, { maxWidth: 480 });
  }

  return doc;
}
