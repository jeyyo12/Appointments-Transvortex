# Prompt Templates

Use these templates when opening implementation tasks.

---
## Template: Bugfix Audit

### Header
- Model recommendation: GPT-5.3-Codex
- Minimal diffs only

### Prompt
```
Repo: Appointments-Transvortex
Task: Perform read-only forensic audit for [BUG NAME].
Scope:
1) map render pipeline(s)
2) map data read/write fields
3) list duplicate listeners/globals
4) produce root-cause report + minimal fix plan
Constraints:
- No code edits yet
- Preserve invoice design
- Preserve Firestore links
Deliverable:
- /ai/audit-report.md with exact file/function references
```

---
## Template: CSS Responsive Lock

### Header
- Model recommendation: GPT-5.3-Codex
- Minimal diffs only

### Prompt
```
Fix responsive regression in [AREA].
Constraints:
- 100–600 behaves like stable 400px layout
- 1023–1400 header remains structurally identical to 1023
- No redesign, no new components
- Keep invoice print untouched
Deliverable:
- list of tiny CSS diffs + width checklist results
```

---
## Template: Invoice Mapping Repair

### Header
- Model recommendation: GPT-5.3-Codex
- Minimal diffs only

### Prompt
```
Repair invoice data mapping (vehicle/address/payment fields) with fallback to linked appointment.
Required fields:
- vehicleMakeModel, registrationPlate/regNumber, mileage
- address/postcode
- paymentStatus/amountPaid/balanceDue/total
Constraints:
- Preserve invoice.html design and print structure exactly
- Preserve appointment.invoiceId <-> invoice.appointmentId
Deliverable:
- focused diffs + before/after mapping table
```

---
## Template: Invoice Storage Paid/Unpaid

### Header
- Model recommendation: GPT-5.3-Codex
- Minimal diffs only

### Prompt
```
Fix invoice storage tab where cards/KPIs diverge.
Requirements:
- single listener + single state source
- paid/unpaid toggle persists after refresh
- no false "missing invoice" for valid linked records
Constraints:
- no collection rename
- no duplicate pipelines
Deliverable:
- exact files changed + validation checklist
```

---
## Template: Remove Duplicates (Legacy vs Modular)

### Header
- Model recommendation: GPT-5.3-Codex
- Minimal diffs only

### Prompt
```
Deduplicate legacy/modular overlap.
Scope:
- listeners
- renderers
- global state writes
- inline handlers vs modular bindings
Rules:
- disable obsolete path; do not rewrite working path
- preserve behavior/UI
Deliverable:
- duplication matrix + surgical disable plan + diffs
```

---
## Template: Deploy Parity / Production Safety

### Header
- Model recommendation: GPT-5.3-Codex
- Minimal diffs only

### Prompt
```
Audit and fix deploy parity issues (GitHub Pages/Firebase hosting).
Check:
- relative paths
- service worker updates
- cache invalidation
- firebase.json headers/rules coherence
Constraints:
- no functional redesign
- preserve app routes and invoice links
Deliverable:
- minimal patches + smoke-test steps
```