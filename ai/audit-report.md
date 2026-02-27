# Forensic Audit Report

Task: Appointment changes not reflected in Invoice
Date: 2026-02-24
Mode: Read-only forensic audit (no code changes)

Rule set followed:
- ai/01-project-rules.md
- ai/02-backend-contract.md

---

## 1) Appointment save/update flow

### 1.1 Create + update entry point
Primary form handler:
- script.js -> handleAddAppointment
  - Create path: addDoc(collection(db, 'appointments'), basePayload)
  - Update path: updateDoc(doc(db, 'appointments', editingAppointmentId), basePayload)

Observed fields written in basePayload:
- customer: customerName, customerPhone, contactPref
- vehicle: registrationPlate, regNumber, vehicleMakeModel/makeModel (conditional), vehicle/car (derived), mileage
- location: serviceLocation, address, postcode
- job/financial: jobs, parts, totals, paidAmount, balanceDue, paymentStatus, status, notes, jobsSummary/problemDescription
- scheduling/timestamps: dateStr, time, startAt, scheduledDateTime, updatedAt (+ createdAt on create)

### 1.2 Invoice sync trigger on appointment save/update
Immediately after both create and update in handleAddAppointment:
- script.js -> syncInvoiceFromAppointmentPayload(appointmentId, basePayload)

Sync behavior:
- If existing invoice found by appointmentId query: syncInvoiceWithAppointment(newestInvoiceId, appointmentData)
- Else fallback to appointment.invoiceId: syncInvoiceWithAppointment(fallbackInvoiceId, appointmentData)
- Else create+sync only when appointmentData.status === finalized

### 1.3 Other appointment update paths (no full invoice field sync)
These update appointment docs but do not propagate vehicle/address updates into invoice fields:
- script.js -> cancelAppointment (status only)
- script.js -> handleDelaySubmit (scheduledDateTime/time/status/timeline)
- script.js -> logTimelineEvent (timeline only)
- src/data-layer/data-actions.js -> markAppointmentCompleted/Cancelled (status timestamps)

Exception:
- script.js -> toggleAppointmentPaidStatus updates both appointment and linked invoice payment fields.

---

## 2) Invoice creation/update flow

### 2.1 Canonical manager flow
- src/invoices/invoice-manager.js -> getOrCreateInvoiceForAppointment

Flow summary:
1) Read appointment
2) Reuse appointment.invoiceId if valid
3) Else query invoices by appointmentId
4) Else create invoice in invoices collection
5) Update appointment.invoiceId
6) Optionally dedupe duplicates

Mapped fields from appointment/prefill into invoice payload:
- link: appointmentId
- customer: customerName, phone, address, postcode, serviceLocation, contactPref
- vehicle: vehicleMakeModel, regPlate, mileage
- content: jobs, parts, notes, jobsSummary
- payment/totals: paidAmount, balanceDue, paymentStatus, totals.*

### 2.2 Script-level sync writer
- script.js -> syncInvoiceWithAppointment(invoiceId, appointmentData, appointmentId)

This function writes invoice fields from appointmentData payload, including:
- vehicle: makeModel, vehicleMakeModel, registrationPlate, regPlate, mileage
- customer/location: customerName, phone, address, postcode, serviceLocation, contactPref
- notes/jobs/totals/payment: notes, jobsSummary, jobs, parts, totals, paidAmount, balanceDue, paymentStatus

### 2.3 Additional invoice writers
- src/invoice.js save flow updates invoice doc directly from editor draftData
- src/invoice-create/invoiceCreate.flow.js can create invoice and link appointment
- script.js createInvoiceFromAppointment has standalone create path (when no appointmentId)

---

## 3) Invoice render flow

### 3.1 Main normalization
- src/invoice.js -> normalizeInvoiceData(raw, invoiceId, appointmentFallback)

Vehicle fallbacks:
- vehicleMakeModel: data.vehicleMakeModel -> data.vehicle.makeModel -> data.carMakeModel -> appointment.vehicleMakeModel -> appointment.carMakeModel
- vehicleReg: data.regPlate -> data.registrationPlate -> data.vehicle.regPlate -> appointment.regPlate -> appointment.registrationPlate
- vehicleMileage: data.mileage -> data.vehicle.mileage -> appointment.mileage

Address/postcode fallbacks:
- address: data.customerAddress -> data.address -> data.customer.address -> appointment.address -> COMPANY_ADDRESS
- postcode: data.postcode -> data.customer.postcode -> data.customerPostcode -> appointment.postcode

Payment fallbacks:
- amountPaid: paidAmount -> amountPaid -> payment.amountPaid
- balance: balanceDue -> remainingBalance -> totals.balanceDue -> computed total-amountPaid
- paymentStatus: raw paymentStatus else computed

### 3.2 View mode loading behavior
- src/invoice.js -> loadInvoicePreview(invoiceId)
  - Reads invoice doc once
  - Optionally reads linked appointment only if rawInvoice.appointmentId exists
  - Applies normalizeInvoiceData with appointment fallback

Implication:
- Invoice page view mode is snapshot-based from invoice doc (plus optional one-time appointment fallback), not continuously live-linked to appointment changes.

---

## 4) Duplicate / overlapping pipelines

### 4.1 Invoice listeners
1) script.js legacy invoices listener:
- startInvoicesListener -> onSnapshot(invoices) -> assigns local allInvoices -> filterInvoices
- guarded by window.__USE_MODULAR_STORAGE and data-layer store checks

2) src/storage/storage.service.js modular listener:
- startInvoicesListener -> onSnapshot(invoices) -> setState('allInvoices') -> callback

3) src/data-layer/firestore-sync.js listener:
- subscribeToInvoices -> onSnapshot(invoices) -> store.upsertInvoice
- src/data-layer/index.js mirrors store into window.allInvoices

### 4.2 Global state overlap
- window.allInvoices is expected by many UI paths
- data-layer index writes window.allInvoices
- script.js legacy listener writes local allInvoices variable (not window.allInvoices)

### 4.3 Global function overwrite overlap
- index.html tab buttons use inline onclick switchTab
- src/app.js exports window.switchTab
- script.js also exports window.switchTab

This creates dual ownership for the same global command path.

---

## Root Cause Report

### A) Why vehicle does not show on invoice
Primary causes:
1) Destructive sync overwrite from partial appointment payload
- script.js syncInvoiceWithAppointment writes vehicle fields with fallback to empty string when field is missing in appointmentData payload.
- handleAddAppointment passes basePayload (partial by design: vehicle fields added conditionally).
- Result: invoice vehicle fields can be blanked when omitted in payload.

2) Inconsistent vehicle source keys in creation flow
- invoice-manager creation maps from aptData.makeModel/aptData.regNumber in key spots.
- Mixed schemas (vehicleMakeModel vs makeModel, registrationPlate vs regNumber/regPlate) increase mismatch risk.

### B) Why updated appointment data does not propagate
Primary causes:
1) Propagation exists only on specific edit path
- Full invoice field-sync runs when edits go through handleAddAppointment submit path.
- Other appointment updates (delay/cancel/timeline/data-actions) do not trigger full invoice field sync.

2) Sync-on-save uses payload copy, not canonical read-back
- syncInvoiceWithAppointment consumes appointmentData payload directly.
- Missing keys in payload are interpreted as empty values and written to invoice.

### C) Is invoice stale copy or live-linked?
- It is mostly a denormalized/stale-copy model with selective synchronization.
- Invoice has its own stored customer/vehicle/address/payment fields.
- Invoice view mode reads invoice doc once, with optional one-time fallback to appointment when appointmentId is available.
- Not a continuously live-linked computed view over appointment.

### D) Responsible file/function ownership
- Appointment save/update + sync trigger:
  - script.js -> handleAddAppointment
  - script.js -> syncInvoiceFromAppointmentPayload
  - script.js -> syncInvoiceWithAppointment
- Canonical invoice creation/linking:
  - src/invoices/invoice-manager.js -> getOrCreateInvoiceForAppointment
- Invoice render normalization/fallback:
  - src/invoice.js -> normalizeInvoiceData
  - src/invoice.js -> loadInvoicePreview
- Duplicate invoice listener/state pipelines:
  - script.js -> startInvoicesListener
  - src/storage/storage.service.js -> startInvoicesListener
  - src/data-layer/firestore-sync.js -> subscribeToInvoices
  - src/data-layer/index.js -> syncGlobalInvoices (window.allInvoices mirror)

---

## Minimal surgical fix plan (no rewrite)

1) Make sync non-destructive (highest priority)
- In script.js syncInvoiceWithAppointment:
  - Do not write empty strings when appointmentData field is absent.
  - Use presence checks per field; if absent, preserve invoice existing value.
  - For vehicle keys, normalize from both vehicleMakeModel/makeModel and registrationPlate/regNumber/regPlate.

2) Sync from canonical merged source
- Before invoice write, merge payload with current appointment doc (or pass normalized appointment from DB).
- This avoids payload omissions blanking invoice fields.

3) Expand propagation triggers minimally
- For non-form appointment updates that should affect invoice-facing fields (if any), call a narrow sync helper only when impacted fields change.
- Do not add blanket listeners; avoid duplicate write loops.

4) Stabilize single invoice data source for UI
- Keep modular/data-layer path authoritative for invoice state.
- Keep legacy script listener disabled when modular/data-layer active.
- Ensure consumers rely on one state source shape.

5) Keep render fallback as safety net
- Retain normalizeInvoiceData fallbacks (invoice first, appointment second).
- Add missing aliases only where needed; do not alter invoice design/print layout.

6) Verification checklist after fixes
- Edit appointment vehicle/address and save -> invoice reflects changes.
- Edit via all supported appointment update paths in scope -> no unintended blanking.
- Invoice view mode shows consistent vehicle/address/payment.
- Invariant preserved: appointment.invoiceId <-> invoice.appointmentId.
- No duplicate listener side effects (double updates/flicker/inconsistent counts).
