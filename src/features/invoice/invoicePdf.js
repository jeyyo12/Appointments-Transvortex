import jsPDF from 'jspdf';

/**
 * Generates invoice PDF using Images/Invoice.png as template
 * @param {Object} invoiceModel - Normalized invoice data
 * @param {string} logoDataUrl - Not used, kept for compatibility
 * @returns {jsPDF} PDF document
 */
export function buildInvoicePdf(invoiceModel, logoDataUrl = null) {
  console.log('[Invoice PDF] Starting PDF generation with model:', invoiceModel);
  
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  
  // Load template image
  const templatePath = '/Images/Invoice.png';
  console.log('[Invoice PDF] Loading template from:', templatePath);
  
  return loadImageAsDataURL(templatePath)
    .then(templateDataUrl => {
      console.log('[Invoice PDF] Template loaded successfully');
      
      // Add template as background (full A4: 210x297mm)
      doc.addImage(templateDataUrl, 'PNG', 0, 0, 210, 297);
      
      // Define positions (adjust these based on your template design)
      const positions = {
        // Header area
        pin: { x: 160, y: 25 },
        date: { x: 160, y: 35 },
        
        // Customer details
        customerName: { x: 30, y: 65 },
        vehicle: { x: 30, y: 73 },
        mileage: { x: 30, y: 81 },
        address: { x: 30, y: 89 },
        
        // Services table
        servicesHeader: { y: 105 },
        servicesStart: { y: 115 },
        rowHeight: 8,
        cols: {
          description: 25,
          qty: 145,
          unitPrice: 165,
          lineTotal: 185
        },
        
        // Totals
        subtotal: { x: 185, y: 230 },
        vat: { x: 185, y: 240 },
        total: { x: 185, y: 250 },
        
        // Footer
        footer: { y: 270 }
      };
      
      // Set default font
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      
      // Write PIN and Date
      console.log('[Invoice PDF] Writing header info');
      doc.setFont('helvetica', 'bold');
      doc.text(`PIN: ${invoiceModel.invoice.number || 'N/A'}`, positions.pin.x, positions.pin.y, { align: 'right' });
      doc.text(`Date: ${invoiceModel.invoice.date}`, positions.date.x, positions.date.y, { align: 'right' });
      
      // Write customer details
      console.log('[Invoice PDF] Writing customer details');
      doc.setFont('helvetica', 'normal');
      doc.text(`Customer: ${invoiceModel.customer.name || 'N/A'}`, positions.customerName.x, positions.customerName.y);
      doc.text(`Vehicle: ${invoiceModel.customer.vehicle || 'N/A'}`, positions.vehicle.x, positions.vehicle.y);
      doc.text(`Mileage: ${invoiceModel.customer.mileage || 'N/A'} miles`, positions.mileage.x, positions.mileage.y);
      
      if (invoiceModel.customer.address) {
        const addressLines = doc.splitTextToSize(invoiceModel.customer.address, 150);
        doc.text(addressLines, positions.address.x, positions.address.y);
      }
      
      // Write services
      console.log('[Invoice PDF] Writing services table');
      let y = positions.servicesStart.y;
      
      if (invoiceModel.services.length > 0) {
        invoiceModel.services.forEach((service, idx) => {
          if (y > 250) {
            console.log('[Invoice PDF] Adding new page for services overflow');
            doc.addPage();
            doc.addImage(templateDataUrl, 'PNG', 0, 0, 210, 297);
            y = 30;
          }
          
          const desc = doc.splitTextToSize(service.description || `Service ${idx + 1}`, 110);
          doc.text(desc, positions.cols.description, y);
          doc.text(String(service.qty), positions.cols.qty, y, { align: 'right' });
          doc.text(invoiceModel.format(service.unitPrice), positions.cols.unitPrice, y, { align: 'right' });
          doc.text(invoiceModel.format(service.lineTotal), positions.cols.lineTotal, y, { align: 'right' });
          
          y += positions.rowHeight;
        });
      } else if (invoiceModel.notes) {
        const notesLines = doc.splitTextToSize(invoiceModel.notes, 160);
        doc.text(notesLines, positions.cols.description, y);
        y += positions.rowHeight * 2;
      }
      
      // Write totals
      console.log('[Invoice PDF] Writing totals');
      doc.setFont('helvetica', 'bold');
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
      
      // Footer with contact info
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('Call us: Mihai +44 7440787527 | Emergency: Iulian +44 7478280954', 20, positions.footer.y);
      doc.text('Website: https://transvortexltd.co.uk/', 20, positions.footer.y + 5);
      doc.text('Facebook: https://www.facebook.com/profile.php?id=61586007316302', 20, positions.footer.y + 10);
      
      console.log('[Invoice PDF] PDF generation complete');
      return doc;
    })
    .catch(error => {
      console.error('[Invoice PDF] Failed to load template:', error);
      // Fallback: generate without template
      console.warn('[Invoice PDF] Generating fallback PDF without template');
      return generateFallbackPdf(doc, invoiceModel);
    });
}

/**
 * Load image as data URL for embedding in PDF
 */
function loadImageAsDataURL(imagePath) {
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
        resolve(dataUrl);
      } catch (err) {
        reject(new Error('Failed to convert image to data URL: ' + err.message));
      }
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image: ' + imagePath));
    };
    
    img.src = imagePath;
  });
}

/**
 * Generate PDF without template (fallback)
 */
function generateFallbackPdf(doc, invoiceModel) {
  const margin = 20;
  let y = margin;
  
  // Header
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE', margin, y);
  
  y += 15;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Invoice #: ${invoiceModel.invoice.number}`, margin, y);
  doc.text(`Date: ${invoiceModel.invoice.date}`, 150, y);
  
  // Customer
  y += 15;
  doc.setFont('helvetica', 'bold');
  doc.text('Bill To:', margin, y);
  doc.setFont('helvetica', 'normal');
  y += 7;
  doc.text(invoiceModel.customer.name || 'N/A', margin, y);
  y += 7;
  doc.text(invoiceModel.customer.vehicle || '', margin, y);
  y += 7;
  doc.text(`Mileage: ${invoiceModel.customer.mileage || 'N/A'}`, margin, y);
  
  // Services
  y += 15;
  doc.setFont('helvetica', 'bold');
  doc.text('Services', margin, y);
  y += 7;
  
  doc.text('Description', margin, y);
  doc.text('Qty', 120, y);
  doc.text('Price', 145, y);
  doc.text('Total', 170, y);
  y += 7;
  
  doc.setFont('helvetica', 'normal');
  invoiceModel.services.forEach(s => {
    doc.text(s.description.substring(0, 50), margin, y);
    doc.text(String(s.qty), 120, y);
    doc.text(invoiceModel.format(s.unitPrice), 145, y);
    doc.text(invoiceModel.format(s.lineTotal), 170, y);
    y += 7;
  });
  
  // Totals
  y += 10;
  doc.text('Subtotal:', 145, y);
  doc.text(invoiceModel.format(invoiceModel.totals.subtotal), 170, y);
  y += 7;
  doc.text(`VAT (${(invoiceModel.totals.vatRate * 100).toFixed(0)}%):`, 145, y);
  doc.text(invoiceModel.format(invoiceModel.totals.vatAmount), 170, y);
  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL:', 145, y);
  doc.text(invoiceModel.format(invoiceModel.totals.total), 170, y);
  
  return Promise.resolve(doc);
}
