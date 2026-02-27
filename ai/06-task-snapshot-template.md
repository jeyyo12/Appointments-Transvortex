# Task Snapshot Template (Copy/Paste)

## Header
- Model recommendation: GPT-5.3-Codex
- Minimal diffs only
- Reporting mode: write full implementation notes in `/ai/*.md`; keep chat acknowledgements concise

## 1) Goal
- What should be fixed/built (one paragraph):

## 2) Expected Behavior
- Expected UI/data behavior after fix:

## 3) Actual Behavior
- What is happening now:

## 4) Reproduction Steps
1.
2.
3.

## 5) Environment
- Date/time:
- Branch/commit (if known):
- User role (admin/accountant/other):
- Browser/device:
- Width(s): (e.g. 320, 375, 400, 441, 520, 600, 723, 1023, 1400)

## 6) Console/Network Evidence
- Console errors/warnings:
- Network failures (Firestore/auth/storage):
- Screenshots (optional):

## 7) Data Samples (Firestore)
Provide sanitized samples.

### Appointment sample
```json
{
  "id": "",
  "invoiceId": "",
  "customerName": "",
  "customerPhone": "",
  "vehicleMakeModel": "",
  "registrationPlate": "",
  "mileage": 0,
  "serviceLocation": "",
  "address": "",
  "postcode": "",
  "paymentStatus": "",
  "paidAmount": 0,
  "balanceDue": 0,
  "status": "",
  "createdAt": "",
  "updatedAt": ""
}
```

### Invoice sample
```json
{
  "id": "",
  "appointmentId": "",
  "invoiceNumber": "",
  "customerName": "",
  "phone": "",
  "vehicleMakeModel": "",
  "regPlate": "",
  "mileage": 0,
  "address": "",
  "postcode": "",
  "paymentStatus": "",
  "paidAmount": 0,
  "amountPaid": 0,
  "balanceDue": 0,
  "total": 0,
  "createdAt": "",
  "updatedAt": ""
}
```

## 8) Files to Inspect First
- List exact files suspected:

## 9) Constraints
- [ ] Preserve invoice design/print
- [ ] Preserve `appointment.invoiceId <-> invoice.appointmentId`
- [ ] No collection rename
- [ ] No new frameworks
- [ ] No duplicate listeners/states
- [ ] Strict conditional buttons only

## 10) Acceptance Checklist
- [ ] Bug reproduced
- [ ] Root cause identified
- [ ] Minimal fix applied
- [ ] Regression checks passed
- [ ] Width/device checks passed
- [ ] Changelog updated (`/ai/05-change-log.md`)

---

## Snapshot — 2026-02-24 — Add Appointment Invoice RO Tab

## Header
- Model recommendation: GPT-5.3-Codex
- Minimal diffs only

## 1) Goal
- Add a visible `Invoice RO` tab inside existing Add New Appointment form so RO legal data can be entered optionally at appointment stage, saved to appointment as `invoiceLegalProfile` only when enabled and meaningful, and used to prefill invoice creation later without rewriting invoice system.

## 2) Expected Behavior
- Add Appointment form shows segmented tabs: `Appointment` (default) and `Invoice RO`.
- `Invoice RO` tab exposes issuer/buyer/meta legal inputs and `roInvoiceEnabled` toggle.
- Save appointment includes `invoiceLegalProfile` only when enabled and core RO fields exist.
- Clicking/opening invoice for that appointment maps `appointment.invoiceLegalProfile` to `invoice.legalProfile` only if invoice legal profile is missing.

## 3) Actual Behavior (Before)
- Add Appointment form had no RO tab or legal inputs.
- Appointment save payload did not include `invoiceLegalProfile`.
- Invoice creation path did not prefill from appointment-level RO legal profile.

## 4) Reproduction Steps
1. Open Add New Appointment form.
2. Observe no Invoice RO panel/tab in create/edit surface.
3. Save appointment and inspect payload/doc — no RO legal profile storage path.
4. Open/create invoice from appointment — no appointment-sourced legal prefill mapping.

## 5) Environment
- Date/time: 2026-02-24
- Branch/commit (if known): workspace current
- User role (admin/accountant/other): admin
- Browser/device: responsive web app (mobile + desktop targets)
- Width(s): 375, 600, 1024, 1440

## 6) Console/Network Evidence
- No new runtime errors in touched files after edits.
- Firestore collection contracts unchanged (`appointments`, `invoices`).

## 7) Data Samples (Firestore)

### Appointment sample
```json
{
  "id": "apt123",
  "invoiceId": "inv123",
  "customerName": "Sample",
  "invoiceLegalProfile": {
    "type": "ro_company",
    "issuer": {
      "companyName": "Issuer SRL",
      "cui": "RO12345678",
      "regCom": "J40/1234/2020",
      "address": "Bucuresti",
      "iban": "RO49AAAA1B31007593840000",
      "bank": "Banca X",
      "vatStatusText": "Neplătitor TVA"
    },
    "buyer": {
      "companyName": "Buyer SRL",
      "cui": "RO99887766",
      "regCom": "",
      "address": "Cluj",
      "email": "office@buyer.ro",
      "phone": "+40700000000"
    },
    "meta": {
      "series": "TVX",
      "number": "123",
      "issueDate": "2026-02-24",
      "dueDate": "2026-03-03",
      "notes": ""
    }
  }
}
```

### Invoice sample
```json
{
  "id": "inv123",
  "appointmentId": "apt123",
  "invoiceNumber": "INV-ABC-260224",
  "legalProfile": {
    "type": "ro_company"
  }
}
```

## 8) Files to Inspect First
- index.html
- styles/premium-ui.css
- script.js
- src/invoices/invoice-manager.js

## 9) Constraints
- [x] Preserve invoice design/print
- [x] Preserve `appointment.invoiceId <-> invoice.appointmentId`
- [x] No collection rename
- [x] No new frameworks
- [x] No duplicate listeners/states
- [x] Strict conditional button/tab behavior only

## 10) Acceptance Checklist
- [x] Root cause identified (missing UI entry + no appointment-level RO capture)
- [x] Minimal fix applied
- [x] Regression checks executed on touched files
- [x] Changelog updated (`/ai/05-change-log.md`)

---

## Snapshot — 2026-02-24 — RO save/prefill/sync correction

## Header
- Model recommendation: GPT-5.3-Codex
- Minimal diffs only

## 1) Goal
- Repair Romanian legal profile flow end-to-end: correctly capture appointment RO legal data, inject it into NEW invoice creation payload at the right stage, and prevent non-RO appointment edits from destructively wiping invoice fields.

## 2) Expected Behavior
- `handleAddAppointment` reads RO inputs before payload build.
- `basePayload.invoiceLegalProfile` exists only when `roInvoiceEnabled=true` and issuer core fields (`companyName`, `cui`) are present.
- Existing appointment RO profile is preserved unless user explicitly disables RO.
- New invoice creation includes `invoicePayload.legalProfile` from appointment RO profile when available.
- Sync overwrites invoice fields only when appointment fields are explicitly provided.

## 3) Actual Behavior (Before)
- RO profile condition and attach path were inconsistent with required issuer-core rule.
- Legal profile injection occurred in existing-invoice reconciliation stages, not strictly at new-create stage.
- Sync could overwrite selected fields with empty fallback values on partial updates.

## 4) Reproduction Steps
1. Create/edit appointment with mixed RO enable/disable states.
2. Observe payload composition in `handleAddAppointment`.
3. Open/create invoice from appointment and inspect legal profile mapping stage.
4. Edit non-RO fields and verify invoice field preservation.

## 5) Environment
- Date/time: 2026-02-24
- Branch/commit (if known): workspace current
- User role (admin/accountant/other): admin
- Browser/device: responsive web app
- Width(s): 375, 600, 1024, 1440

## 6) Console/Network Evidence
- Touched files pass static error checks.
- No collection contract changes.

## 7) Data Samples (Firestore)

### Appointment sample
```json
{
  "id": "apt001",
  "invoiceId": "",
  "invoiceLegalProfile": {
    "type": "ro_company",
    "issuer": {
      "companyName": "Issuer SRL",
      "cui": "RO12345678"
    }
  }
}
```

### Invoice sample
```json
{
  "id": "inv001",
  "appointmentId": "apt001",
  "legalProfile": {
    "type": "ro_company"
  }
}
```

## 8) Files to Inspect First
- script.js (`handleAddAppointment`, `syncInvoiceWithAppointment`)
- src/invoices/invoice-manager.js (`getOrCreateInvoiceForAppointment`)

## 9) Constraints
- [x] Preserve invoice design/print
- [x] Preserve `appointment.invoiceId <-> invoice.appointmentId`
- [x] No collection rename
- [x] No new frameworks
- [x] No duplicate listeners/states
- [x] Minimal diffs only

## 10) Acceptance Checklist
- [x] Root cause identified
- [x] Minimal fix applied
- [x] Static verification passed for touched files
- [x] Changelog updated (`/ai/05-change-log.md`)
- [ ] Manual runtime checks completed in UI/Firestore

---

## Snapshot — 2026-02-24 — Mechanic Repair Invoice type (autofill)

## Header
- Model recommendation: GPT-5.3-Codex
- Minimal diffs only

## 1) Goal
- Implement a new invoice type `mechanic` that can be created from appointment details via a dedicated action, autofill mechanic-specific details from appointment data, and keep standard invoice behavior unchanged.

## 2) Expected Behavior
- Appointment card shows both existing `Invoice` action and new `Mechanic Invoice` action.
- `Mechanic Invoice` reuses the same get-or-create flow (no duplicates).
- New invoice created from this action includes optional `templateType='mechanic'` and optional `mechanicDetails`.
- Standard invoice render path remains unchanged.
- Mechanic invoice render shows conditional blocks only when values exist:
  - Complaint / Symptoms
  - Diagnosis
  - Work Performed
  - Recommendations
  - Warranty / Disclaimer

## 3) Actual Behavior (Before)
- Only standard invoice action existed in appointment cards.
- No template type differentiation for mechanic workflow.
- No mechanic-specific render blocks in invoice preview.

## 4) Reproduction Steps
1. Open appointments list and inspect action buttons.
2. Create/open invoice from appointment and inspect created invoice document.
3. Open invoice preview page and confirm mechanic sections are conditionally rendered.

## 5) Environment
- Date/time: 2026-02-24
- Branch/commit (if known): workspace current
- User role (admin/accountant/other): admin
- Browser/device: responsive web app
- Width(s): 375, 600, 1024, 1440

## 6) Console/Network Evidence
- No static errors in touched files after implementation.

## 7) Data Samples (Firestore)

### Appointment sample
```json
{
  "id": "apt-mech-001",
  "customerName": "John Doe",
  "customerPhone": "+44...",
  "address": "Client Address",
  "vehicleMakeModel": "Ford Transit",
  "registrationPlate": "AB12CDE",
  "mileage": "128450",
  "notes": "Engine warning light and rough idle"
}
```

### Invoice sample
```json
{
  "id": "inv-mech-001",
  "appointmentId": "apt-mech-001",
  "templateType": "mechanic",
  "customerName": "John Doe",
  "phone": "+44...",
  "address": "Client Address",
  "vehicleMakeModel": "Ford Transit",
  "regPlate": "AB12CDE",
  "mileage": "128450",
  "mechanicDetails": {
    "complaint": "Engine warning light and rough idle",
    "vehicle": {
      "mileage": "128450"
    }
  }
}
```

## 8) Files to Inspect First
- script.js
- src/invoices/invoice-manager.js
- src/invoice.js
- invoice.html

## 9) Constraints
- [x] Preserve invoice design/print
- [x] Preserve `appointment.invoiceId <-> invoice.appointmentId`
- [x] No collection rename
- [x] No new frameworks
- [x] No duplicate listeners/states
- [x] Keep existing invoice action unchanged

## 10) Acceptance Checklist
- [x] Mechanic invoice action added in appointment UI
- [x] Existing invoice action unchanged
- [x] Mechanic creation uses existing get-or-create flow
- [x] Optional `templateType` + `mechanicDetails` added for NEW mechanic invoices
- [x] Standard invoice render path unchanged
- [x] Mechanic conditional render blocks added
- [x] Changelog updated (`/ai/05-change-log.md`)
- [ ] Manual end-to-end UI validation completed

---

## Snapshot — 2026-02-24 — EU Company (RO) tab simplification

## Header
- Model recommendation: GPT-5.3-Codex
- Minimal diffs only

## 1) Goal
- Replace Add Appointment `Invoice RO` tab with a simplified EU buyer billing flow for UK-issued invoices to Romanian/EU companies, preserving existing save/linking behavior.

## 2) Expected Behavior
- Tab label becomes `EU Company (RO)`.
- UI keeps only buyer company details + `VAT Reverse Charge (B2B EU)` toggle.
- Appointment stores optional `invoiceLegalProfile` in simplified `eu_company` structure.
- Creating a new invoice from appointment prefills customer fields from buyer only when target fields are empty.
- Reverse-charge note is appended once and does not duplicate on repeated invoice opens.

## 3) Actual Behavior (Before)
- Tab contained Romanian issuer fields and Romanian meta overrides (series/number/issue/due).
- Save mapping built `ro_company` profile with issuer/meta blocks.

## 4) Reproduction Steps
1. Open Add New Appointment and switch to legal tab.
2. Observe issuer/meta fields that are not needed for UK issuer flow.
3. Save appointment and inspect `invoiceLegalProfile` payload shape.
4. Create invoice from appointment and inspect prefill/notes.

## 5) Environment
- Date/time: 2026-02-24
- Branch/commit (if known): workspace current
- User role (admin/accountant/other): admin
- Browser/device: responsive web app
- Width(s): 375, 600, 1024, 1400

## 6) Console/Network Evidence
- No static errors in touched files after patch.

## 7) Data Samples (Firestore)

### Appointment sample
```json
{
  "id": "apt-eu-001",
  "invoiceId": "",
  "invoiceLegalProfile": {
    "type": "eu_company",
    "buyer": {
      "companyName": "SC Exemplu SRL",
      "address": "Str. Exemplu 10, Cluj-Napoca",
      "vatNumber": "RO12345678",
      "email": "office@exemplu.ro",
      "phone": "+40..."
    },
    "vat": {
      "reverseCharge": true
    }
  }
}
```

### Invoice sample
```json
{
  "id": "inv-eu-001",
  "appointmentId": "apt-eu-001",
  "customerName": "SC Exemplu SRL",
  "address": "Str. Exemplu 10, Cluj-Napoca",
  "phone": "+40...",
  "customerEmail": "office@exemplu.ro",
  "notes": "VAT reverse charged to customer (B2B EU). Customer VAT number: RO12345678"
}
```

## 8) Files to Inspect First
- index.html
- script.js
- src/invoices/invoice-manager.js

## 9) Constraints
- [x] Preserve invoice design/print
- [x] Preserve `appointment.invoiceId <-> invoice.appointmentId`
- [x] No collection rename
- [x] No backend/API contract changes
- [x] No duplicate listeners/states
- [x] Keep VAT totals/pricing logic unchanged

## 10) Acceptance Checklist
- [x] Tab renamed and section title updated
- [x] Issuer/meta fields removed from Add Appointment legal tab
- [x] Buyer fields + reverse-charge toggle implemented
- [x] Simplified `eu_company` appointment profile mapping implemented
- [x] Invoice prefill from buyer fields implemented for empty targets
- [x] Reverse-charge note append-once logic implemented
- [x] Changelog updated (`/ai/05-change-log.md`)
- [ ] Manual runtime validation completed

---

## Snapshot — 2026-02-24 — EU tab Vehicle REG + Work summary extension

## Header
- Model recommendation: GPT-5.3-Codex
- Minimal diffs only

## 1) Goal
- Extend `EU Company (RO)` appointment tab with optional invoice-focused `Vehicle REG` and `Work summary` fields without duplicating jobs/services logic and without backend contract changes.

## 2) Expected Behavior
- EU panel shows:
  - `Vehicle REG` input
  - Compact read-only preview: `Jobs/Services: <count> • Total: <total>`
  - `Work summary (optional)` textarea
- Appointment save:
  - Overwrites `registrationPlate` only when EU REG is non-empty.
  - Overwrites `jobsSummary` only when EU work summary is non-empty.
  - Extends `invoiceLegalProfile.type="eu_company"` with optional `vehicle.reg` / `work.summary` only when values exist.
- New invoice creation prefill:
  - `regPlate` uses EU profile vehicle reg only if invoice reg is empty.
  - `jobsSummary` uses EU profile work summary only if invoice jobsSummary is empty.

## 3) Actual Behavior (Before)
- EU panel had buyer + reverse charge only.
- No EU-specific reg/work override path in appointment save or invoice prefill.

## 4) Reproduction Steps
1. Open Add New Appointment and switch to `EU Company (RO)`.
2. Fill `Vehicle REG` and/or `Work summary`.
3. Save appointment and inspect appointment doc fields.
4. Create/open invoice and inspect prefilled reg/jobsSummary values.

## 5) Environment
- Date/time: 2026-02-24
- Branch/commit (if known): workspace current
- User role (admin/accountant/other): admin
- Browser/device: responsive web app
- Width(s): 375, 600, 1024, 1400

## 6) Console/Network Evidence
- Static checks show no errors in touched files.

## 7) Data Samples (Firestore)

### Appointment sample
```json
{
  "id": "apt-eu-vehicle-001",
  "registrationPlate": "AB12 CDE",
  "jobsSummary": "Brake pads replaced, inspection, road test",
  "invoiceLegalProfile": {
    "type": "eu_company",
    "buyer": {
      "companyName": "SC Client SRL",
      "address": "Cluj"
    },
    "vat": {
      "reverseCharge": false
    },
    "vehicle": {
      "reg": "AB12 CDE"
    },
    "work": {
      "summary": "Brake pads replaced, inspection, road test"
    }
  }
}
```

### Invoice sample
```json
{
  "id": "inv-eu-vehicle-001",
  "appointmentId": "apt-eu-vehicle-001",
  "regPlate": "AB12 CDE",
  "jobsSummary": "Brake pads replaced, inspection, road test"
}
```

## 8) Files to Inspect First
- index.html
- script.js
- src/invoices/invoice-manager.js

## 9) Constraints
- [x] Preserve invoice design/print
- [x] Preserve `appointment.invoiceId <-> invoice.appointmentId`
- [x] No collection rename
- [x] No backend/API contract changes
- [x] No duplicate job system

## 10) Acceptance Checklist
- [x] EU panel includes Vehicle REG + Work summary UI
- [x] Compact jobs/total preview wired to existing totals updater
- [x] Appointment save override for reg only when EU REG is non-empty
- [x] Appointment save override for jobsSummary only when EU summary is non-empty
- [x] Optional `invoiceLegalProfile.vehicle/work` mapping implemented
- [x] Invoice creation prefill fallback uses EU vehicle/work only for empty targets
- [x] Changelog updated (`/ai/05-change-log.md`)
- [ ] Manual runtime validation completed