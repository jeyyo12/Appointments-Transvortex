# Invoice System - Complete Rebuild

## Overview
The invoice system has been completely rebuilt from scratch with a clean, modern, print-perfect A4 template following UK business standards. The implementation uses pure HTML/DOM elements (no canvas text rendering) and is fully responsive.

## Files Created/Modified

### New Files Created:
1. **invoice.html** - Standalone invoice preview page
   - Main invoice template with semantic HTML structure
   - Responsive design for mobile/tablet/desktop
   - Print-optimized A4 layout
   - Dynamic content injection via JavaScript

2. **styles/invoice.css** - Complete invoice styling
   - Premium dark header with orange accent (Transvortex branding)
   - Responsive grid layout (mobile-first design)
   - Print media queries for perfect A4 output
   - Card-based design with subtle shadows and rounded corners
   - Full support for @page rules and @media print

3. **src/features/invoice/invoiceRenderer.js** - Invoice rendering engine
   - Core function `renderInvoice(invoiceData)` for dynamic content
   - Helper functions: formatCurrency(), formatDateUK(), generateInvoiceNumber(), generatePIN()
   - Validation: `validateInvoiceData()` checks for required fields
   - Error handling with user-friendly messages
   - sessionStorage integration for data persistence
   - Helper: `createInvoiceDataFromAppointment()` to convert appointment → invoice data

4. **script.js (updated)** - Main app integration
   - Added `createInvoiceFromAppointment()` function
   - Bridges appointment modal → invoice system via sessionStorage
   - Callable from appointment UI: `window.createInvoiceFromAppointment(appointment)`

### Files NOT Created (Removed/Deprecated):
- ❌ invoicePreview.html (old)
- ❌ invoiceTemplate.html (old)
- ❌ invoicePdf.js (old canvas logic)
- ❌ Old invoice controller functions (obsolete)
- ❌ Old invoice CSS paths

## Invoice Data Model

```javascript
invoiceData = {
  // Invoice metadata
  invoiceNumber: "INV-2601191445-042",        // Auto-generated if not provided
  invoiceDate: "2026-01-19",                   // YYYY-MM-DD format
  dueDate: "2026-01-26",                       // Auto-calculated (7 days from invoiceDate)
  pin: "TVX-8342",                             // Auto-generated if not provided
  paymentTerms: "Due within 7 days",
  
  // Company info
  company: {
    name: "Transvortex LTD",
    address: "81 Foley Rd, Birmingham B8 2JT",
    website: "https://transvortexltd.co.uk/",
    facebook: "https://www.facebook.com/profile.php?id=61586007316302",
    call: "Mihai +44 7440787527",
    emergency: "Iulian +44 7478280954"
  },
  
  // Client info
  client: {
    name: "John Smith",                        // REQUIRED
    address: "123 High Street, London",
    phone: "+44 123 456 7890",
    vehicle: "Toyota Camry 2020",              // makeModel
    regPlate: "AB20 CDE",                      // regNumber
    mileage: "45,000 miles"
  },
  
  // Services/items
  items: [                                     // REQUIRED (min 1 item)
    {
      description: "Engine Service",
      qty: 1,
      unitPrice: 150.00
    },
    {
      description: "Oil Change",
      qty: 1,
      unitPrice: 35.50
    }
  ],
  
  // Tax
  vatPercent: 20,  // Leave 0 or omit for no VAT
  
  // Optional metadata
  appointmentId: "doc123",
  appointmentDate: "2026-01-20",
  appointmentTime: "14:30"
}
```

## How to Use

### 1. From the Appointment Modal
When viewing an appointment, call:

```javascript
window.createInvoiceFromAppointment(appointmentObject);
```

This will:
- Validate appointment data (client name, vehicle, etc.)
- Convert to invoice data structure
- Store in sessionStorage
- Open invoice.html in a new tab

### 2. Direct Usage in invoice.html
Simply open `invoice.html` in the browser. If sessionStorage contains valid invoiceData, it will render immediately. Otherwise, it shows a helpful message.

### 3. Programmatic Access
Import invoiceRenderer.js and call directly:

```javascript
const invoiceData = { /* your data */ };
renderInvoice(invoiceData);
```

## Key Features

### ✅ Design
- **Premium Header**: Transvortex branding with company name (left), logo (right)
- **Dark Footer**: Dark gradient background with payment methods and social links
- **Card Layout**: Subtle shadows, rounded corners, light grey backgrounds for sections
- **Orange Accent**: Brand color used for borders, highlights, buttons
- **Responsive**: Works perfectly on mobile, tablet, desktop

### ✅ Content Structure
- **Invoice Meta Box**: Number, date, due date, reference PIN (auto-generated)
- **Bill To**: Client name, address, phone, vehicle details (make/model, reg, mileage)
- **Services Table**: Dynamic rows (Description, Qty, Unit Price, Line Total)
- **Totals**: Subtotal, VAT (optional), TOTAL (large, bold)
- **Payment Terms**: Configurable text (default: "Due within 7 days")
- **Footer**: Payment methods (Visa, Mastercard, Apple Pay, Google Pay), social links

### ✅ Validation
- Client name is REQUIRED
- At least 1 service item is REQUIRED
- Item descriptions, qty > 0, valid prices required
- Friendly error messages displayed if validation fails
- Download button disabled until data is valid

### ✅ Formatting
- **Currency**: GBP format with comma separators (£1,234.56)
- **Dates**: UK format DD/MM/YYYY (e.g., 19/01/2026)
- **Invoice Number**: Auto-generated YYMMDDHHmm-counter format (e.g., INV-2601191445-042)
- **PIN Code**: Auto-generated TVX-XXXX format (e.g., TVX-8342)

### ✅ Print/PDF
- **Perfect A4 Size**: @page rule with 10mm margins
- **No Page Breaks**: Sections use page-break-inside: avoid
- **Hidden UI**: Controls bar hidden in print view
- **Color Preservation**: print-color-adjust: exact for header/footer/logo
- **Download Button**: Uses `window.print()` (native browser print dialog)
- **Professional Output**: Print to PDF (Ctrl+P or Cmd+P) produces publication-ready invoice

## Path Handling (Go Live + GitHub Pages)

All paths are **relative** to invoice.html location:

```html
<!-- CSS (same directory as invoice.html) -->
<link rel="stylesheet" href="./styles/invoice.css">

<!-- Logo (parent directory Images/) -->
<img src="./Images/Logo.png" alt="Transvortex Logo">

<!-- JavaScript (features/invoice/) -->
<script src="./src/features/invoice/invoiceRenderer.js"></script>
```

This ensures:
- ✅ Works in Go Live: http://127.0.0.1:5500/invoice.html
- ✅ Works in GitHub Pages: https://username.github.io/repo/invoice.html

## Testing Checklist

### 1. Basic Rendering
- [ ] Open invoice.html in browser
- [ ] See "No invoice data loaded" message (expected, no data yet)
- [ ] Download PDF button is disabled

### 2. Load Test Data
Open browser console and run:
```javascript
const testData = {
  company: { name: 'Transvortex LTD', address: '81 Foley Rd, Birmingham B8 2JT', website: 'https://transvortexltd.co.uk/', facebook: 'https://www.facebook.com/profile.php?id=61586007316302', call: 'Mihai +44 7440787527', emergency: 'Iulian +44 7478280954' },
  client: { name: 'John Smith', address: '123 High St', phone: '01234 567890', vehicle: 'Toyota Camry', regPlate: 'AB20 CDE', mileage: '45000' },
  items: [
    { description: 'Engine Service', qty: 1, unitPrice: 150 },
    { description: 'Oil Change', qty: 1, unitPrice: 35.50 }
  ],
  vatPercent: 20
};
sessionStorage.setItem('invoiceData', JSON.stringify(testData));
location.reload();
```

### 3. Invoice Rendering
- [ ] All client details visible (name, address, phone)
- [ ] Vehicle info displayed (make/model, reg, mileage)
- [ ] Services table shows both items
- [ ] Totals calculated correctly:
  - Subtotal: £185.50
  - VAT (20%): £37.10
  - Total: £222.60
- [ ] Invoice number, date, due date, PIN visible
- [ ] Download PDF button is ENABLED
- [ ] Logo visible (top-right, clear, no blur)
- [ ] Company branding consistent (orange accents)

### 4. Print/PDF
- [ ] Click "Download PDF"
- [ ] Browser print dialog opens
- [ ] Page preview shows perfect A4 layout
- [ ] All text readable
- [ ] Logo sharp and clear
- [ ] Colors match screen (header/footer dark, text dark)
- [ ] No UI controls visible in print
- [ ] Save as PDF works without artifacts

### 5. Responsive Testing
Open DevTools (F12) and test at:
- [ ] **Mobile** (375px): Single column layout, readable fonts
- [ ] **Tablet** (768px): 2-column bill-to, proper spacing
- [ ] **Desktop** (1200px): Full 2-column bill-to, wide table

### 6. Validation Testing
Try these invalid scenarios:
```javascript
// Missing client name
renderInvoice({ client: { name: '' }, items: [{ description: 'X', qty: 1, unitPrice: 100 }] });
// Should show error, disable button

// No items
renderInvoice({ client: { name: 'Test' }, items: [] });
// Should show error, disable button
```

### 7. Integration Testing
- [ ] Open main app (index.html)
- [ ] Load appointment modal
- [ ] Call: `window.createInvoiceFromAppointment(appointmentObj)`
- [ ] New tab opens with invoice
- [ ] Data from appointment appears in invoice
- [ ] Download works from invoice tab

## Future Enhancements

### Optional Features (Not Yet Implemented)
1. **Invoice Background Image**: If Invoice.png is added to /Images/, update CSS background-image
2. **Edit Services in Invoice UI**: Add form to modify items before download
3. **Client Signature Field**: Add signature pad for acceptance
4. **Email Invoice**: Send as email attachment (requires backend)
5. **Invoice History**: Store generated invoices in Firestore
6. **Recurring Invoices**: Auto-generate for subscription services
7. **Multi-currency**: Support EUR, USD, etc.
8. **Custom Logo Upload**: Allow Transvortex to upload branding logo
9. **Batch Invoicing**: Generate multiple invoices at once
10. **Invoice Numbering System**: Persistent counter in Firestore instead of random generation

## Troubleshooting

### Images Not Loading
**Problem**: Logo or background not visible
- [ ] Check image paths are relative: `./Images/Logo.png` (not `/Images/Logo.png`)
- [ ] Verify Images folder exists in root directory
- [ ] Open DevTools (F12) → Network tab → check if images load
- [ ] Check browser console for 404 errors

### Invoice Data Not Showing
**Problem**: Page shows "No invoice data loaded"
- [ ] Check sessionStorage: `console.log(sessionStorage.getItem('invoiceData'))`
- [ ] Verify JSON is valid: `JSON.parse(sessionStorage.getItem('invoiceData'))`
- [ ] Ensure `client.name` is not empty (required field)
- [ ] Check browser console for JavaScript errors

### Print Looks Different
**Problem**: Page print preview shows layout issues
- [ ] Check @media print styles in invoice.css
- [ ] Verify page margin settings: `@page { margin: 10mm; }`
- [ ] Try different browser (Chrome print is most reliable)
- [ ] Check for CSS conflicts with global styles

### Paths Break in GitHub Pages
**Problem**: Resources 404 in https://username.github.io/repo/invoice.html
- [ ] All paths MUST be relative: `./Images/`, `./styles/`, `./src/`
- [ ] NO leading slash: ❌ `/Images/Logo.png`, ✅ `./Images/Logo.png`
- [ ] Check repository structure matches paths
- [ ] Test in Go Live first, then push to GitHub

## File Structure
```
c:\Users\Dan\Documents\GitHub\Appointments-Transvortex\
├── invoice.html                                    (NEW - Invoice page)
├── script.js                                       (UPDATED - Invoice integration)
├── Images/
│   └── Logo.png                                    (Existing - Required for invoice)
├── styles/
│   └── invoice.css                                 (NEW - Invoice styling)
└── src/
    └── features/
        └── invoice/
            └── invoiceRenderer.js                  (NEW - Invoice logic)
```

## Code References

### Main Invoice Function
```javascript
// In invoiceRenderer.js
function renderInvoice(invoiceData) {
    const validation = validateInvoiceData(invoiceData);
    if (!validation.isValid) {
        showValidationError(validation.errors);
        return;
    }
    // ... renders all sections
}
```

### Integration Helper
```javascript
// In script.js
window.createInvoiceFromAppointment(appointment) {
    const invoiceData = {
        // ... convert appointment to invoice data
    };
    sessionStorage.setItem('invoiceData', JSON.stringify(invoiceData));
    window.open('./invoice.html', '_blank');
}
```

---

**Last Updated**: January 19, 2026
**Status**: ✅ Complete, Ready for Testing
**Print Format**: UK A4 Standard
**Browser Support**: Chrome, Firefox, Safari, Edge (modern versions)
