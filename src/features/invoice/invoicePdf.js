import jsPDF from 'jspdf';

async function loadTemplateImage(path) {
  console.log('[Invoice PDF] Loading template:', path);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      try {
        const dataUrl = canvas.toDataURL('image/png');
        console.log('[Invoice PDF] Template loaded successfully');
        resolve(dataUrl);
      } catch (err) {
        console.error('[Invoice PDF] Failed to convert template:', err);
        reject(err);
      }
    };
    img.onerror = () => {
      console.error('[Invoice PDF] Failed to load template image');
      reject(new Error('Template load failed'));
    };
    img.src = path;
  });
}

export async function buildInvoicePdf(invoiceModel, logoDataUrl) {
  console.log('[Invoice PDF] Starting PDF generation with model:', invoiceModel);
  
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  
  // Load and apply template background
  try {
    const templateBg = await loadTemplateImage('/Images/Invoice.png');
    doc.addImage(templateBg, 'PNG', 0, 0, 210, 297);
    console.log('[Invoice PDF] Template applied as background');
  } catch (err) {
    console.warn('[Invoice PDF] Template not available, using plain background:', err);
  }

  // Positioning coordinates (adjust based on your Invoice.png layout)
  const positions = {
    pin: { x: 160, y: 20 },
    date: { x: 160, y: 35 },
    customer: { x: 30, y: 60 },
    vehicle: { x: 30, y: 68 },
    mileage: { x: 30, y: 76 },
    vatRate: { x: 160, y: 76 },
    servicesStartY: 100,
    rowHeight: 8,
    cols: { desc: 20, qty: 140, unit: 160, total: 190 },
    subtotal: { x: 190, y: 230 },
    vat: { x: 190, y: 238 },
    total: { x: 190, y: 246 }
  };

  // Write PIN and Date
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const pin = invoiceModel.invoice.number || `TVX-${Date.now().toString(36).toUpperCase()}`;
  doc.text(`PIN: ${pin}`, positions.pin.x, positions.pin.y, { align: 'right' });
  doc.text(`Date: ${invoiceModel.invoice.date}`, positions.date.x, positions.date.y, { align: 'right' });

  // Write Customer Info
  doc.text(`Customer: ${invoiceModel.customer.name || '-'}`, positions.customer.x, positions.customer.y);
  doc.text(`Vehicle: ${invoiceModel.customer.vehicle || '-'}`, positions.vehicle.x, positions.vehicle.y);
  doc.text(`Mileage: ${invoiceModel.customer.mileage || '-'} miles`, positions.mileage.x, positions.mileage.y);
  doc.text(`VAT: ${(invoiceModel.totals.vatRate * 100).toFixed(0)}%`, positions.vatRate.x, positions.vatRate.y, { align: 'right' });

  // Write Services Table
  let y = positions.servicesStartY;
  if (invoiceModel.services.length) {
    invoiceModel.services.forEach((s) => {
      if (y > 255) {
        doc.addPage();
        y = 30;
      }
      const desc = doc.splitTextToSize(s.description, 100);
      doc.text(desc, positions.cols.desc, y);
      doc.text(String(s.qty), positions.cols.qty, y, { align: 'right' });
      doc.text(invoiceModel.format(s.unitPrice), positions.cols.unit, y, { align: 'right' });
      doc.text(invoiceModel.format(s.lineTotal), positions.cols.total, y, { align: 'right' });
      y += positions.rowHeight;
    });
  } else {
    doc.text(invoiceModel.notes || 'No services listed.', positions.cols.desc, y);
    y += positions.rowHeight;
  }

  // Write Totals
  doc.setFont('helvetica', 'bold');
  doc.text('Subtotal', positions.subtotal.x - 20, positions.subtotal.y);
  doc.text(invoiceModel.format(invoiceModel.totals.subtotal), positions.subtotal.x, positions.subtotal.y, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.text(`VAT (${(invoiceModel.totals.vatRate * 100).toFixed(0)}%)`, positions.vat.x - 20, positions.vat.y);
  doc.text(invoiceModel.format(invoiceModel.totals.vatAmount), positions.vat.x, positions.vat.y, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 99, 72);
  doc.text('TOTAL', positions.total.x - 20, positions.total.y);
  doc.text(invoiceModel.format(invoiceModel.totals.total), positions.total.x, positions.total.y, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  // Footer with contacts
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const contactY = 260;
  doc.text('Call us: Mihai +44 7440787527', 20, contactY);
  doc.text('Emergency: Iulian +44 7478280954', 20, contactY + 5);
  doc.text('Website: https://transvortexltd.co.uk/', 20, contactY + 10);
  doc.text('Facebook: https://www.facebook.com/profile.php?id=61586007316302', 20, contactY + 15);

  doc.setFontSize(9);
  doc.text(`Invoice PIN: ${pin}`, 20, 285);

  console.log('[Invoice PDF] PDF document built successfully');
  return doc;
}
