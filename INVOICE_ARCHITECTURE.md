# Invoice System - Architecture & Data Flow

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRANSVORTEX INVOICE SYSTEM                    │
└─────────────────────────────────────────────────────────────────┘

                         ┌─── MAIN APP ───┐
                         │   index.html    │
                         │   script.js     │
                         └────────┬────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
            ┌──────────────┐  ┌──────────┐  ┌─────────────┐
            │ Appointment  │  │  Modal   │  │   Forms     │
            │   List       │  │          │  │             │
            └──────────────┘  └────┬─────┘  └─────────────┘
                                   │
                                   │ Click "View Invoice"
                                   ▼
                    ┌──────────────────────────┐
                    │ createInvoiceFromAppt()  │
                    │      (in script.js)      │
                    └──────────────┬───────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
        ┌──────────────────────┐    ┌──────────────────────┐
        │  invoiceData Object  │    │  sessionStorage      │
        │  (converted from     │───▶│  .setItem()          │
        │   appointment)       │    │                      │
        └──────────────────────┘    └──────────────────────┘
                                             │
                                             │
                    ┌────────────────────────┴──────────────────┐
                    │                                           │
                    ▼ window.open('./invoice.html')            ▼
        ┌─────────────────────────┐            ┌─────────────────────┐
        │    invoice.html         │            │  Browser Tab 2      │
        │  (NEW PAGE / NEW TAB)   │            │  sessionStorage     │
        └────────────┬────────────┘            └─────────────────────┘
                     │
            ┌────────┴────────────────┐
            │                         │
            ▼                         ▼
    ┌──────────────────┐    ┌──────────────────────┐
    │   On Load Event  │    │ invoiceRenderer.js   │
    │   DOMContent     │    │   (Core Logic)       │
    │   Loaded         │    │                      │
    └────────┬─────────┘    └──────────┬───────────┘
             │                         │
             ▼                         ▼
    ┌──────────────────┐    ┌──────────────────────┐
    │ Load from        │    │ renderInvoice()      │
    │ sessionStorage   │───▶│ (Main Renderer)      │
    │ .getItem()       │    │                      │
    └──────────────────┘    └──────────┬───────────┘
                                       │
                ┌──────────────────────┼──────────────────────┐
                │                      │                      │
                ▼                      ▼                      ▼
        ┌───────────────┐      ┌────────────────┐    ┌──────────────┐
        │ Validate      │      │ Render Sections│    │ Calculate    │
        │ Data          │      │                │    │ Totals       │
        │ - Client name │      │ - Header       │    │              │
        │ - Items       │      │ - Meta Box     │    │ - Subtotal   │
        │ - Qty/Price   │      │ - Bill To      │    │ - VAT        │
        └───────────────┘      │ - Services Tbl │    │ - Total      │
                               │ - Totals       │    └──────────────┘
                               │ - Footer       │
                               └────────────────┘
                                      │
                                      ▼
                    ┌──────────────────────────────┐
                    │   Render Complete Invoice    │
                    │   (HTML DOM + Styled CSS)    │
                    └──────────────┬───────────────┘
                                   │
                ┌──────────────────┴──────────────────┐
                │                                     │
                ▼                                     ▼
        ┌────────────────────┐            ┌────────────────────┐
        │   User Actions     │            │  Browser Features  │
        │                    │            │                    │
        │ - View on screen   │            │ - Responsive layout│
        │ - Scroll table     │            │ - Print friendly   │
        │ - Click buttons    │            │ - CSS formatting   │
        └────────────────────┘            └────────────────────┘
                │                                     │
                ▼                                     ▼
        ┌────────────────────┐            ┌────────────────────┐
        │  Download PDF      │            │  @media print CSS  │
        │  window.print()    │            │  - Hide controls   │
        │                    │            │  - A4 page size    │
        │  ▼                 │            │  - Color preserve  │
        │  Print Dialog      │            │  - No shadows      │
        │  (Ctrl+P / Cmd+P)  │            │  - Break control   │
        │                    │            │                    │
        │  ▼                 │            │  ▼                 │
        │  Save as PDF       │            │  Perfect Output    │
        │  ✓ Professional    │            │  ✓ Print-ready     │
        │  ✓ Crisp quality   │            │  ✓ A4 compliant    │
        └────────────────────┘            └────────────────────┘
```

---

## 📊 Data Flow Diagram

```
APPOINTMENT DATA (from Firestore)
│
├─ customerName: "John Smith"
├─ customerPhone: "+44 123 456 7890"
├─ address: "123 High St, London"
├─ makeModel: "Toyota Camry 2020"
├─ regNumber: "AB20 CDE"
├─ appointmentDate: "2026-01-20"
├─ appointmentTime: "14:30"
├─ problemDescription: "Engine check"
└─ items: [...]
         │
         ▼
    createInvoiceFromAppointment()
    (Conversion Function)
         │
         ├─ Validate customerName ✓
         ├─ Transform fields
         ├─ Create invoiceData structure
         └─ Generate auto values (PIN, invoice #, due date)
         │
         ▼
INVOICE DATA OBJECT
│
├─ company: {
│  ├─ name: "Transvortex LTD"
│  ├─ address: "81 Foley Rd..."
│  ├─ website: "https://..."
│  ├─ call: "Mihai +44..."
│  └─ emergency: "Iulian +44..."
│
├─ client: {
│  ├─ name: "John Smith"              ◄── From customerName
│  ├─ phone: "+44 123 456 7890"       ◄── From customerPhone
│  ├─ address: "123 High St, London"  ◄── From address
│  ├─ vehicle: "Toyota Camry 2020"    ◄── From makeModel
│  ├─ regPlate: "AB20 CDE"            ◄── From regNumber
│  └─ mileage: "45,000"
│
├─ items: [
│  {
│  ├─ description: "Engine Service"
│  ├─ qty: 1
│  └─ unitPrice: 150.00
│  },
│  {
│  ├─ description: "Oil Change"
│  ├─ qty: 1
│  └─ unitPrice: 35.50
│  }
│ ]
│
├─ invoiceNumber: "INV-2601191445-042"  ◄── Auto-generated
├─ invoiceDate: "2026-01-19"            ◄── Current date
├─ dueDate: "2026-01-26"                ◄── +7 days
├─ pin: "TVX-8342"                      ◄── Auto-generated
├─ paymentTerms: "Due within 7 days"
├─ vatPercent: 20
│
└─ (Stored in sessionStorage)
   │
   ▼
sessionStorage
│
└─ "invoiceData": "{...JSON string...}"
   │
   ▼
   window.open('./invoice.html')
   │
   ▼
   invoice.html loads
   │
   ▼
   invoiceRenderer.js runs
   │
   ▼
   loadInvoiceDataFromStorage()
   │
   ▼
   renderInvoice(invoiceData)
   │
   ├─ validateInvoiceData() ✓
   ├─ renderInvoiceMeta()
   ├─ renderBillTo()
   ├─ renderServices()
   ├─ renderTotals()
   │  ├─ subtotal = sum(qty * price)     = £185.50
   │  ├─ vatAmount = subtotal * 0.20     = £37.10
   │  └─ total = subtotal + vatAmount    = £222.60
   ├─ renderPaymentTerms()
   └─ enableDownloadButton()
   │
   ▼
HTML DOM + CSS Rendering
   │
   ├─ Header (company info + logo)
   ├─ Meta Box (invoice#, date, PIN)
   ├─ Bill To (client + vehicle)
   ├─ Services Table (rows with £ formatting)
   ├─ Totals (£222.60 in orange)
   ├─ Payment Terms
   └─ Footer (dark, payment methods)
   │
   ▼
READY FOR USER
   │
   ├─ View on screen (responsive)
   └─ Click "Download PDF"
      │
      ▼
      window.print()
      │
      ▼
      Browser Print Dialog
      │
      ├─ @media print CSS applied
      ├─ Controls hidden
      ├─ Colors preserved
      ├─ A4 page size (210 x 297mm)
      ├─ 10mm margins
      └─ Logo prints crisp
      │
      ▼
      Save as PDF
      │
      ▼
      ✓ Professional Invoice PDF
      ✓ Ready for client delivery
```

---

## 🎨 Component Structure

```
invoice.html
│
├─ <div class="controls-bar">                    ← Sticky header (hidden in print)
│  ├─ <button id="downloadPdfBtn">              ← Download PDF button
│  ├─ <button id="backBtn">                     ← Back button
│  └─ <div id="validationMessage">              ← Error messages
│
└─ <div class="invoice-container">              ← Main container
   └─ <div class="invoice-wrapper">             ← White card with shadow
      │
      ├─ <header class="invoice-header">        ← Company branding
      │  ├─ <div class="header-left">
      │  │  ├─ <h1 class="company-name">       ← "Transvortex LTD"
      │  │  ├─ <p class="invoice-title">       ← "INVOICE"
      │  │  └─ <div class="company-contact">   ← Address, links, phone
      │  │
      │  └─ <div class="header-right">
      │     └─ <img class="company-logo">      ← Logo.png (120px)
      │
      ├─ <section class="invoice-meta">         ← Metadata 4-column grid
      │  ├─ <div class="meta-box">
      │  │  ├─ <h3 class="meta-label">         ← "Invoice Number"
      │  │  └─ <p class="meta-value">          ← "INV-2601191445-042"
      │  ├─ (repeat for date, due date, PIN)
      │
      ├─ <section class="bill-to">              ← Bill To section
      │  ├─ <h2 class="section-title">
      │  └─ <div class="bill-to-content">      ← 2-column grid
      │     ├─ <div class="bill-to-box">       ← Client details
      │     └─ <div class="bill-to-box">       ← Vehicle details
      │
      ├─ <section class="services-section">     ← Services table
      │  ├─ <h2 class="section-title">
      │  └─ <table class="services-table">
      │     ├─ <thead>
      │     │  └─ <tr>
      │     │     ├─ <th class="col-description">
      │     │     ├─ <th class="col-qty">
      │     │     ├─ <th class="col-unit-price">
      │     │     └─ <th class="col-line-total">
      │     │
      │     └─ <tbody id="servicesTableBody">  ← Dynamic rows
      │        └─ <tr> (repeated for each item)
      │           ├─ <td> Description
      │           ├─ <td> Qty
      │           ├─ <td> £ Price
      │           └─ <td> £ Total
      │
      ├─ <section class="totals-section">       ← Calculations
      │  └─ <div class="totals-box">
      │     ├─ <div class="totals-row">
      │     │  ├─ Subtotal: £185.50
      │     │
      │     ├─ <div class="totals-row">         ← Shows only if VAT > 0
      │     │  ├─ VAT (20%): £37.10
      │     │
      │     └─ <div class="totals-row totals-total">
      │        ├─ TOTAL: £222.60               ← Orange, bold, large
      │
      ├─ <section class="payment-terms">        ← Payment info
      │  └─ <p id="paymentTermsText">
      │
      ├─ <section class="legal-notes">          ← Legal text
      │  └─ <p> "All services provided..."
      │
      └─ <footer class="invoice-footer">        ← Dark footer
         ├─ <div class="footer-section">
         │  ├─ "Card & Cash Accepted"
         │  └─ <div class="payment-icons">
         │     ├─ "💳 Visa"
         │     ├─ "💳 Mastercard"
         │     ├─ "🍎 Apple Pay"
         │     └─ "🔵 Google Pay"
         │
         └─ <div class="footer-section">
            ├─ "Thank you for your business!"
            └─ "Visit us: transvortexltd.co.uk"
```

---

## 🔄 Validation Flow

```
renderInvoice(invoiceData)
│
└─ validateInvoiceData(invoiceData)
   │
   ├─ Check: invoiceData exists ✓
   │
   ├─ Check: client.name (required)
   │  └─ If empty → Error: "Client name is required"
   │
   ├─ Check: items array exists
   │  └─ If missing → Error: "At least one service item is required"
   │
   ├─ Loop through items[]:
   │  ├─ Check: description (required)
   │  │  └─ If empty → Error: "Item N: Description is required"
   │  │
   │  ├─ Check: qty > 0
   │  │  └─ If invalid → Error: "Item N: Quantity must be > 0"
   │  │
   │  └─ Check: unitPrice >= 0
   │     └─ If invalid → Error: "Item N: Unit price must be valid"
   │
   └─ Return: { isValid: boolean, errors: [] }
      │
      ├─ If VALID:
      │  ├─ Continue rendering
      │  ├─ clearValidationError()
      │  └─ enableDownloadButton()
      │
      └─ If INVALID:
         ├─ showValidationError(errors[0])  ◄── Show first error
         ├─ disableDownloadButton()
         └─ Return (stop rendering)
```

---

## 💾 sessionStorage Format

```javascript
// Key: "invoiceData"
// Value: JSON string

{
  "company": {
    "name": "Transvortex LTD",
    "address": "81 Foley Rd, Birmingham B8 2JT",
    "website": "https://transvortexltd.co.uk/",
    "facebook": "https://www.facebook.com/profile.php?id=61586007316302",
    "call": "Mihai +44 7440787527",
    "emergency": "Iulian +44 7478280954"
  },
  "client": {
    "name": "John Smith",
    "address": "123 High St, London",
    "phone": "+44 123 456 7890",
    "vehicle": "Toyota Camry 2020",
    "regPlate": "AB20 CDE",
    "mileage": "45,000 miles"
  },
  "items": [
    {
      "description": "Engine Service",
      "qty": 1,
      "unitPrice": 150.00
    }
  ],
  "invoiceNumber": "INV-2601191445-042",
  "invoiceDate": "2026-01-19",
  "dueDate": "2026-01-26",
  "pin": "TVX-8342",
  "paymentTerms": "Due within 7 days",
  "vatPercent": 20,
  "appointmentId": "appt-123"
}
```

---

## 🖨️ Print Process

```
User clicks "Download PDF"
│
└─ downloadPDF()
   │
   ├─ Validate: currentInvoiceData exists ✓
   │
   └─ window.print()
      │
      ├─ Browser detects @media print
      │
      ├─ Apply print CSS:
      │  ├─ Hide: .controls-bar
      │  ├─ Remove: box-shadows
      │  ├─ Preserve: print-color-adjust: exact
      │  ├─ Set: page-break-inside: avoid
      │  └─ Set: @page { size: A4; margin: 10mm; }
      │
      ├─ Calculate A4 layout:
      │  ├─ Page size: 210 x 297mm
      │  ├─ Margins: 10mm all sides
      │  ├─ Content width: 190mm
      │  ├─ Usable height: 277mm
      │  └─ Check if content fits ✓
      │
      ├─ Prepare content:
      │  ├─ Logo (print-color-adjust preserved)
      │  ├─ Header (dark colors preserved)
      │  ├─ All text (readable sizes)
      │  ├─ Table (proper spacing)
      │  ├─ Footer (dark gradient preserved)
      │  └─ No page breaks mid-section
      │
      └─ Open Browser Print Dialog
         │
         ├─ Preview shows:
         │  ├─ Page 1: Full invoice layout
         │  ├─ Colors: Orange, dark grey, black text
         │  ├─ Logo: Sharp, 120px visible
         │  └─ Quality: Print-ready
         │
         └─ User options:
            ├─ Save as PDF (✓ Recommended)
            ├─ Print to printer
            ├─ Cancel
            └─ Once saved → Professional PDF ready for delivery
```

---

## 🔗 File Dependency Graph

```
index.html (main app)
│
├─ script.js
│  └─ createInvoiceFromAppointment()
│     └─ window.open('./invoice.html')
│
└── Opens ──→ invoice.html
              │
              ├─ <link> styles/invoice.css
              │  ├─ Color variables
              │  ├─ Responsive grids
              │  ├─ Print styles
              │  └─ Animations
              │
              ├─ <img> ./Images/Logo.png
              │  └─ Transvortex company logo
              │
              ├─ <script> ./src/features/invoice/invoiceRenderer.js
              │  ├─ renderInvoice()
              │  ├─ validateInvoiceData()
              │  ├─ formatCurrency()
              │  ├─ formatDateUK()
              │  ├─ generateInvoiceNumber()
              │  ├─ generatePIN()
              │  └─ loadInvoiceDataFromStorage()
              │
              └─ sessionStorage ("invoiceData")
                 └─ JSON object passed from main app
```

---

## 📱 Responsive Breakpoints

```
Mobile First Approach
│
├─ Base (0px - 480px): MOBILE
│  └─ 1 column layout, stacked sections
│
├─ Tablet (481px - 768px): TABLET
│  └─ 2 column layout where appropriate
│
└─ Desktop (769px+): FULL
   └─ Multi-column layout, optimized spacing

CSS Media Queries:
@media (max-width: 768px) { ... }  ← Mobile/Tablet
@media print { ... }               ← Print (A4)
```

---

**Diagram Summary:** The invoice system flows from appointment → conversion → storage → rendering → print with clean data transformation at each stage.

**Last Updated:** January 19, 2026
