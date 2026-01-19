import jsPDF from 'jspdf';

async function loadImageAsDataURL(path) {
  console.log('[Invoice PDF] Loading image:', path);
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
        console.log('[Invoice PDF] Image loaded successfully');
        resolve(dataUrl);
      } catch (err) {
        console.error('[Invoice PDF] Canvas to DataURL failed:', err);
        reject(err);
      }
    };
    img.onerror = (err) => {
      console.error('[Invoice PDF] Image load failed:', path, err);
      reject(new Error(`Failed to load image: ${path}`));
    };
    img.src = path;
  });
}

export async function buildInvoicePdf(invoiceModel) {
  console.log('[Invoice PDF] Building PDF with model:', invoiceModel);
  
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  
  // Load template background
  let templateDataUrl;
  try {
    templateDataUrl = await loadImageAsDataURL('/Images/Invoice.png');
    doc.addImage(templateDataUrl, 'PNG', 0, 0, 210, 297);
    console.log('[Invoice PDF] Template background added');
  } catch (err) {
    console.warn('[Invoice PDF] Could not load template, proceeding without background:', err);
  }

  // Define precise positions (adjust these to match your template layout)
  const positions = {
    pin: { x: 160, y: 20 },
    date: { x: 160, y: 28 },
    customer: { x: 30, y: 60 },
    vehicle: { x: 30, y: 68 },
    mileage: { x: 30, y: 76 },
    address: { x: 30, y: 84 },
    servicesStartY: 105,
    rowHeight: 8,
    cols: {
      desc: 20,
      qty: 140,
      unit: 160,
      total: 190
    },
    subtotal: { x: 190, y: 230 },
    vat: { x: 190, y: 238 },
    total: { x: 190, y: 246 },
    notes: { x: 20, y: 260 }
  };

  // Header info
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`PIN: ${invoiceModel.invoice.number || 'N/A'}`, positions.pin.x, positions.pin.y, { align: 'right' });
  
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${invoiceModel.invoice.date}`, positions.date.x, positions.date.y, { align: 'right' });

  // Customer info
  doc.setFontSize(10);
  doc.text(`Customer: ${invoiceModel.customer.name || '-'}`, positions.customer.x, positions.customer.y);
  doc.text(`Vehicle: ${invoiceModel.customer.vehicle || '-'}`, positions.vehicle.x, positions.vehicle.y);
  doc.text(`Mileage: ${invoiceModel.customer.mileage || '-'}`, positions.mileage.x, positions.mileage.y);
  if (invoiceModel.customer.address) {
    const addressLines = doc.splitTextToSize(invoiceModel.customer.address, 160);
    doc.text(addressLines, positions.address.x, positions.address.y);
  }

  // Services table
  let y = positions.servicesStartY;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  if (invoiceModel.services.length > 0) {
    invoiceModel.services.forEach((service, index) => {
      if (y > 250) {
        doc.addPage();
        y = 30;
      }

      const descLines = doc.splitTextToSize(service.description || `Service ${index + 1}`, 110);
      doc.text(descLines, positions.cols.desc, y);
      doc.text(String(service.qty), positions.cols.qty, y, { align: 'right' });
      doc.text(invoiceModel.format(service.unitPrice), positions.cols.unit, y, { align: 'right' });
      doc.text(invoiceModel.format(service.lineTotal), positions.cols.total, y, { align: 'right' });
      
      y += positions.rowHeight;
    });
  } else if (invoiceModel.notes) {
    const notesLines = doc.splitTextToSize(invoiceModel.notes, 160);
    doc.text(notesLines, positions.cols.desc, y);
    y += positions.rowHeight * notesLines.length;
  }

  // Totals
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Subtotal:', positions.subtotal.x - 30, positions.subtotal.y);
  doc.text(invoiceModel.format(invoiceModel.totals.subtotal), positions.subtotal.x, positions.subtotal.y, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  const vatLabel = `VAT (${(invoiceModel.totals.vatRate * 100).toFixed(0)}%):`;
  doc.text(vatLabel, positions.vat.x - 30, positions.vat.y);
  doc.text(invoiceModel.format(invoiceModel.totals.vatAmount), positions.vat.x, positions.vat.y, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 99, 72);
  doc.text('TOTAL:', positions.total.x - 30, positions.total.y);
  doc.text(invoiceModel.format(invoiceModel.totals.total), positions.total.x, positions.total.y, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  // Footer notes
  if (invoiceModel.notes && invoiceModel.services.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const footerNotes = doc.splitTextToSize(invoiceModel.notes, 170);
    doc.text(footerNotes, positions.notes.x, positions.notes.y);
  }

  console.log('[Invoice PDF] PDF document built successfully');
  return doc;
}
