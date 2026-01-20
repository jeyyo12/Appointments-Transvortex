# Invoice-Firestore Sync - Quick Test Guide

## What Changed

### Files Modified
1. **invoice.html** - Line 153: Changed `<script>` to `<script type="module">`
2. **src/invoice.js** - Complete refactor with 6 new functions + 2 enhanced functions

### Key Features Added
✅ **Live Sync** - Invoice updates automatically when appointment changes (onSnapshot)
✅ **Robust Field Mapping** - Supports 15+ field name variations
✅ **Smart Visibility** - Hides empty optional fields automatically
✅ **Dynamic Services** - Renders only valid services (filters out empty items)
✅ **Proper VAT** - Supports 2 different VAT schemas
✅ **Console Logging** - Full debug trace with emoji markers

---

## How to Test

### Test 1: Open Invoice for Scheduled Appointment (No Finalization)

**Step 1:** Open browser to: `http://localhost:8000/?tab=appointments`
(or wherever your app runs)

**Step 2:** Find an appointment that is NOT finalized (status != 'done')

**Step 3:** Click the Invoice button on that appointment card
(Should redirect to: `invoice.html?aptId=APT_ID`)

**Expected Result:**
```
✅ Invoice page loads
✅ Client name visible (e.g., "John Doe")
✅ Phone visible (if exists)
✅ Vehicle info visible (if exists)
✅ Services section HIDDEN (no items yet)
✅ Subtotal £0.00
✅ Total £0.00
✅ No error messages
```

**Check Console:**
- Open DevTools (F12)
- Go to Console tab
- Look for logs starting with: 📄 📍 ✅ ✅ ✅ 🔄 📋 ✅

---

### Test 2: Finalize an Appointment & Watch Invoice Auto-Update

**Step 1:** Open TWO browser tabs:
- **Tab 1:** `invoice.html?aptId=APT_123` (keep this open)
- **Tab 2:** Main app at `index.html`

**Step 2:** In Tab 2 (Main App):
- Find appointment APT_123
- Click "Finalizează" button
- In the modal:
  - Add a service: "Oil Change - £45.00"
  - Add another service: "Filter - £25.00"
  - Toggle VAT: ON
  - VAT Rate: 20%
  - Click "Finalizează & Salvează"

**Step 3:** Look at Tab 1 (Invoice Page):
- **WITHOUT REFRESHING**, observe the invoice auto-populate:
  - Services table appears with 2 rows
  - Subtotal shows: £70.00
  - VAT (20%) shows: £14.00
  - Total shows: £84.00

**Expected Result:**
```
✅ Invoice auto-updates (no page refresh needed)
✅ Services table populated
✅ Subtotal calculated correctly
✅ VAT section visible with percentage
✅ Total correct
✅ Console shows: 🔄 [Invoice] Appointment data received from Firestore
```

---

### Test 3: Verify Field Visibility (No Gaps)

**Scenario 1: Minimal Data**
```
Appointment has:
- customerName: "Jane Doe"
- phone: ""      (empty)
- address: null  (null)
- vehicle: ""    (empty)

Expected:
✅ Name shown: "Jane Doe"
✅ Phone row HIDDEN (no blank space)
✅ Address row HIDDEN
✅ Vehicle row HIDDEN
✅ Layout is clean (no "—" dashes)
```

**Scenario 2: Complete Data**
```
Appointment has:
- customerName: "John Smith"
- phone: "+44123456789"
- address: "123 Main St"
- carMakeModel: "BMW 320"
- registrationPlate: "AB12CD"
- mileage: 45000

Expected:
✅ All rows visible
✅ All fields populated
✅ Clean layout
```

---

### Test 4: VAT Calculation Scenarios

**Scenario A: VAT Enabled (20%)**
```
Input:
- services: [{name: "Work", price: 100}]
- vatEnabled: true
- vatRate: 0.2

Expected Display:
Subtotal:      £100.00
VAT (20%):     £ 20.00
TOTAL:         £120.00
```

**Scenario B: No VAT**
```
Input:
- services: [{name: "Work", price: 100}]
- vatEnabled: false

Expected Display:
Subtotal:      £100.00
(VAT row HIDDEN)
TOTAL:         £100.00
```

**Scenario C: 10% VAT**
```
Input:
- services: [{name: "Work", price: 50}]
- vatRate: 0.1

Expected Display:
Subtotal:      £50.00
VAT (10%):     £ 5.00
TOTAL:         £55.00
```

---

### Test 5: Download PDF

**Step 1:** Open any invoice

**Step 2:** Click "📥 Download PDF" button (at top)

**Step 3:** Print dialog opens

**Expected:**
```
✅ Invoice renders correctly in print preview
✅ All visible fields shown
✅ Hidden fields stay hidden
✅ Table formats properly
✅ Totals visible
```

**Step 4:** Print to PDF or printer

---

### Test 6: Console Logging (Debug Trace)

**How to Check:**
1. Open invoice.html?aptId=<id>
2. Open DevTools (F12 or Ctrl+Shift+I)
3. Go to "Console" tab
4. Look for these log messages:

**Expected Sequence:**
```
📄 [Invoice] Page loaded, initializing...
📍 [Invoice] aptId from URL: apt_abc123xyz
✅ [Invoice] User authenticated, setting up listener...
🔄 [Invoice] Appointment data received from Firestore
📋 [Invoice] Raw appointment data: {...}
✅ [Invoice] Normalized data: {...}
```

**If Finalized (with services):**
```
📋 [Invoice] Raw appointment data: {
  customerName: "John",
  phone: "+44...",
  services: [
    {name: "Oil Change", price: 45},
    {name: "Filter", price: 25}
  ],
  subtotal: 70,
  vatEnabled: true,
  vatRate: 0.2,
  total: 84
}

✅ [Invoice] Normalized data: {
  client: {name: "John", phone: "+44...", ...},
  items: [
    {description: "Oil Change", price: 45, qty: 1},
    {description: "Filter", price: 25, qty: 1}
  ],
  subtotal: 70,
  vatRate: 20,
  vatAmount: 14,
  total: 84,
  ...
}
```

---

### Test 7: Error Scenarios

**Scenario A: Missing aptId**
```
URL: invoice.html (no ?aptId=...)

Expected:
❌ Message: "Missing appointment ID"
❌ Download button DISABLED
```

**Scenario B: Invalid aptId**
```
URL: invoice.html?aptId=NONEXISTENT

Expected:
❌ Message: "Appointment not found in database"
❌ Download button DISABLED
```

**Scenario C: Not Logged In**
```
URL: invoice.html?aptId=valid_apt
(but user session expired)

Expected:
❌ Message: "You must be logged in to view invoices"
❌ Download button DISABLED
```

---

## Field Mapping Reference

The normalizer supports these field name variations:

| Data Point | Tried (in order) | Default |
|-----------|------------------|---------|
| **Customer Name** | customerName, clientName, name | '' |
| **Phone** | phone, customerPhone, tel, telefon | '' |
| **Address** | address, location, clientAddress | '' |
| **Vehicle** | carMakeModel, vehicleMakeModel, makeModel, make | '' |
| **Reg Plate** | registrationPlate, regPlate, regNumber, plate, registration | '' |
| **Mileage** | mileage, km | '' |

---

## What NOT to Test

❌ Don't worry about these (unchanged):
- PDF download dialog (uses browser's window.print)
- Back button functionality
- Print styling (handled by invoice.css)

---

## Troubleshooting

### Invoice shows "—" for fields that have data
```
Reason: Old render function still active
Solution: Clear browser cache (Ctrl+Shift+Delete)
          Then hard refresh (Ctrl+Shift+R)
```

### Services table shows empty rows
```
Reason: Invalid service data (price = 0 or NaN)
Solution: Check Firestore document - services array should have:
          [{name: "...", price: NUMBER}, ...]
          Not: [{name: "...", price: "£45"}, ...] (string prices fail)
```

### VAT section not showing even though data exists
```
Check:
1. vatEnabled = true (not false)
2. vatRate > 0 (not 0)
3. subtotal > 0 (calculation needs something to calculate from)
```

### Invoice not updating after finalization
```
Reason: Firestore listener may have been interrupted
Solution:
1. Hard refresh page (Ctrl+Shift+R)
2. Check console for errors (F12 → Console)
3. Look for: 🔄 [Invoice] Appointment data received
```

### Console shows "Cannot read property of null"
```
Likely: Missing DOM element in invoice.html
Check invoice.html has all these IDs:
- invoiceNumber, invoiceDate, dueDate, pinCode
- clientName, clientPhone, clientAddress
- vehicleMakeModel, vehicleRegPlate, vehicleMileage
- servicesTableBody, subtotal, total, vatRow, vatPercent, vatAmount
- paymentTermsText
```

---

## Success Checklist

After testing, you should see:

✅ Invoice loads without errors for scheduled appointments
✅ Invoice auto-populates when appointment is finalized
✅ Empty optional fields are hidden (no "—")
✅ Services/parts table shows only valid items
✅ Totals and VAT calculate correctly
✅ Console logs show full debug trace (📄 📍 ✅ 🔄 📋)
✅ PDF download works
✅ Layout stays clean with dynamic content

---

## How It Works (Simple Explanation)

### Before Your Changes
```
Invoice page → Loads appointment → Shows empty invoice
```

### After Your Changes
```
Invoice page → Loads appointment → normalizeAppointmentData()
            → renderInvoiceFromAppointment()
            → UI updates with proper data

When appointment changes in main app:
Main app → Saves to Firestore → onSnapshot triggers in invoice page
        → Automatic re-render (no page reload)
```

---

## Questions During Testing?

Check these files for answers:
- **INVOICE_SYNC_IMPLEMENTATION.md** - Full technical details
- **invoice.html** - DOM structure and element IDs
- **src/invoice.js** - Actual implementation code
  - `normalizeAppointmentData()` - Field mapping logic
  - `renderServicesOptimized()` - Services rendering
  - `renderTotalsOptimized()` - Calculation logic

