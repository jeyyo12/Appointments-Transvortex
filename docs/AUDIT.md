# Wiring Audit — Developer Guide

_Last updated: 2026-02-27 — reflects v2 audit script with context-aware classification._

---

## What "wired" means in this repo

A UI control is considered **fully wired** when **all** of the following are true:

| Layer | Requirement |
|---|---|
| HTML element | Has `data-action="<actionName>"` **and** `data-id="<entityId>"` |
| Delegation | `bindActionDelegation()` (in `src/core/events.js`) is bound to the element's ancestor container |
| Handler | The action string is matched by a `case` / `if` branch inside the delegation handler |
| Data guard | The button is only rendered when the required entity id / data actually exists |

For **inline onclick** handlers, wiring is complete when:
- The called function (`window.fnName`) has a **real, non-empty** implementation at the time the click fires
- The function is exported to `window` in `script.js` or the relevant module

> **`data-id` is only required for `bindActionDelegation`.**
>
> The other five delegation patterns in this repo (`closest('[data-action]')` in `src/invoice.js`, `src/modal.js`, `src/shared/modal.js`, `src/utils/notifications.js`, `src/workspace/workspace-controller.js`) only need `data-action`. Do **not** add spurious `data-id` attributes to modal/chip/invoice.html buttons — they are already wired correctly.
>
> **`data-id` is required only on item-scoped action buttons** — those that identify a specific appointment, invoice, job, or driver. Filter controls, search chips, modal close buttons, and global UI toggles do not need `data-id`.

---

## When is missing data-id a REAL problem vs a false positive?

The audit script classifies each `data-action` button automatically:

### REAL (fix required)
The button has an **item-scoped action** AND lives in a **non-exempt file**.

Item-scoped actions include: `open`, `edit`, `delete`, `view`, `details`, `mark-paid`, `mark-unpaid`, `invoice`, `reschedule`, `complete`, `remove`, `pay`, etc.

These must have `data-id` because they dispatch through `bindActionDelegation`, which requires `[data-action][data-id]`.

### Likely false positive (do not fix unless proven)
The button is one of:
- In an **exempt file**: `invoice.html`, `src/invoice.js`, `src/modal.js`, `src/shared/modal.js`, `src/utils/notifications.js`, `src/workspace/workspace-controller.js`, `offline.html`
- Has a **non-item-scoped action**: filter, search, toggle, add-chip, close, cancel, etc.

These use local handlers that only need `data-action`.

---

## Static Audit

**Scans:** all `.html`, `.js`, `.mjs` files (excludes `node_modules`, `.git`, `dist`, `build`, `_archive_unused`).

```bash
node tools/audit-wiring.mjs
```

**Outputs:**
- `audit/audit-report.json` — full machine-readable data
- `audit/audit-report.md` — human-readable report with 5 sections + appendices

### What the static audit covers

| Check | How detected | Classification |
|---|---|---|
| Item-scoped `data-action` missing `data-id` | Tag-level attribute co-presence + action name matching | **REAL** if item-scoped & non-exempt |
| Non-item-scoped or exempt-file missing `data-id` | Same scan + action name / file allowlist | **FP** (informational) |
| Stub/noop `window.*` functions | Empty-body pattern only — `window.fn \|\| realFn` fallbacks NOT flagged | REAL |
| `onclick` calling undefined `window.*` | Cross-reference onclick vs `window.fn =` assignments | REAL |
| `data-action` values unmapped to handler | String search + dynamic template-literal awareness | REAL |
| Invoice open entry points | `window.open`, `location.href`, `href=`, `openInvoice*` call sites | Info |
| Invoice param violations | Enforces canonical `invoiceId` + `mode` only; flags `aptId`/`appointmentId`/`id` | REAL |
| High-risk duplicate function names | `generateInvoiceNumber`, `openInvoice*`, `getOrCreateInvoice*`, etc. | Informational |

### Report sections

| Section | Contents |
|---|---|
| **1. Summary Metrics** | Counters for real broken candidates, FPs, unmapped, invoice violations, high-risk dups |
| **2. REAL Issues** | Item-scoped missing data-id, onclick→stub, onclick→undefined, unmapped actions |
| **3. Invoice Contract & Violations** | Canonical contract, all violations with file/line/recommended fix |
| **4. Likely False Positives** | Non-item-scoped or exempt-file items — do not fix |
| **5. High-Risk Duplicates** | Critical function names defined in multiple files |
| **Appendix A–D** | data-action counts, window.* exports, delegation sites, all duplicate names |

---

## Step-by-Step Troubleshooting

Work through this in order until **REAL broken candidates = 0**.

### Step 1 — Run static audit
```bash
node tools/audit-wiring.mjs
```
Read Section 1 of `audit/audit-report.md` for the current counts.

### Step 2 — Fix invoice param violations (Section 3b)
For each violation:
- Replace the direct `window.open(...)` or `location.href = ...` with:
  ```js
  openInvoicePage(invoiceId, 'view');   // or 'edit'
  // or
  openInvoice(null, invoiceId, 'edit');
  ```
- Never build the URL manually outside of `openInvoicePage`.
- Search: `rg "invoice.html\?" -n`

### Step 3 — Fix unmapped data-action values (Section 2d)
For each unmapped action:
- Find which delegation block should handle it
- Add a `case` / `if` branch with the action string
- Search: `rg "data-action" -n`

### Step 4 — Fix missing data-id on item-scoped card buttons (Section 2a)
For each REAL item in Section 2a:
- Locate the HTML template that renders the button (usually in `src/data-layer/appointments-ui.js`)
- Add `data-id="${appointment.id}"` (or the relevant entity id) to the button element
- All nested action buttons inside an appointment card must carry the card's entity id
- Search: `rg "data-action" -n src/data-layer/ src/invoices/`

### Step 5 — Fix stub and undefined window functions (Sections 2b, 2c)
- 2b stubs: locate the real implementation and ensure it's assigned to `window.fnName` before any DOMContentLoaded events fire
- 2c undefined: add the missing `window.fnName = realFunction` export in `script.js`
- Search: `rg "window\." -n script.js src/`

### Step 6 — Re-run until REAL issues = 0
```bash
node tools/audit-wiring.mjs
```

---

## Recommended Search Commands

```bash
# Find all invoice.html entry points
rg "invoice.html\?" -n

# Find all data-action buttons
rg "data-action" -n

# Find all inline onclick handlers
rg "onclick=" -n

# Find all window.* assignments (exports)
rg "window\." -n src/ script.js

# Find all data-id attributes
rg "data-id" -n src/data-layer/

# Find openInvoice call sites
rg "openInvoice" -n src/
```

---

## Definition of Done — 100% Readiness Checklist

- [ ] `REAL broken candidates = 0` (Section 1 of audit-report.md)
- [ ] `Unmapped data-action values = 0`
- [ ] `Invoice param violations = 0`
- [ ] High-risk duplicates reviewed — only canonical definition remains in `invoice-manager.js`
- [ ] Runtime smoke test passes:
  - [ ] Open invoice from appointment → correct `invoiceId=` URL
  - [ ] Edit invoice → saves to Firestore
  - [ ] Print / save PDF → no errors in console
  - [ ] Mark paid → appointment status updates
  - [ ] Mark unpaid → appointment status reverts
  - [ ] Add job / add part → chips appear in invoice
  - [ ] Modal open/close → all buttons functional

---

## Runtime Audit (DevTools)

**Purpose:** inspect the _live DOM_ in a running browser session.

### Load the helper

**Option A — add temporarily to index.html (dev only):**
```html
<!-- dev only, remove before deploy -->
<script src="src/dev/runWiringAudit.js"></script>
```

**Option B — paste in DevTools console:**
```js
await import('/src/dev/runWiringAudit.js');
```

### Run the audit

```js
window.runWiringAudit()
```

Returns a result object and prints a grouped console report. Options:

```js
const data = window.runWiringAudit({ json: true });   // return raw data
window.runWiringAudit({ verbose: true });              // all onclick details
```

### What it logs

| Group | Contents |
|---|---|
| 📊 Summary | Counts of all clickable controls, wired vs broken |
| ⚠️ data-action MISSING data-id | DOM elements + action name + visible text |
| ⚠️ onclick → stub/noop | Element + expression + which function is a stub |
| 🔴 onclick → UNDEFINED | Element + expression + which function is missing entirely |
| 🧾 Invoice controls | All invoice-related links/buttons in current DOM |

---

## Critical Architecture Notes

### `bindActionDelegation` — the hard rule

```js
// src/core/events.js
container.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action][data-id]');
  if (!target || !container.contains(target)) return;
  // ...
});
```

**Both `data-action` AND `data-id` must be present or the click is silently dropped.**
This is the #1 cause of silent broken buttons in appointment-card contexts.

The other five delegation patterns in this repo only need `data-action`.

### Canonical invoice open contract

```
invoice.html?invoiceId=<firestoreDocId>&mode=<view|edit>
```

- `invoiceId` = Firestore document id — **required**
- `aptId` must **not** appear in the URL — always resolve to `invoiceId` first
- `mode` = `view` (default) or `edit`

**Single URL builder:** `openInvoicePage(invoiceId, mode)` in `src/invoices/invoice-manager.js`.
All code that opens `invoice.html` must go through this function or through `openInvoice()` (which calls it internally).

### Canonical invoice number format

```
INV-{RANDOM5}-{YYMMDD}
```

Defined once in `src/invoices/invoice-manager.js` as `export function generateInvoiceNumber()`.
All other modules must **import** from there — never redefine locally.

`src/invoice.js` is standalone (loaded by `invoice.html`, no ES module imports) and maintains the same format manually. Keep in sync if the format ever changes.

### Stub function race condition (mitigated)

`script.js` seeds `window.fn = window.fn || ((...args) => console.error(...))` for six UI functions at parse time, then overrides them with real implementations later.

- **Before fix:** stubs were silent `() => {}` — clicks failed with no indication.
- **After fix:** stubs log `console.error('[Wiring] <fn> called before module loaded')` if fired during the race window.
- Root cause: if any ES module import in `script.js` throws, the real implementations never register.

---

## Audit baseline vs. current state

Run `node tools/audit-wiring.mjs` to refresh these numbers.

| Metric | v1 baseline | v2 (with classification) | Notes |
|---|---|---|---|
| Total broken candidates reported | 33 | **1 REAL + 22 FP** | v1 could not distinguish; v2 separates item-scoped real issues |
| `onclick` → stub/noop | 8 → 0 | **0** | Stubs overridden by real impls; now loud on race |
| `onclick` → undefined `window.*` | 3 → 1 | **0** | `goHome()` in `offline.html` — defined inline, not a real issue |
| Unmapped `data-action` values | 1 → 0 | **0** | `add-job`/`add-part` handled via dynamic selector |
| Invoice param violations | 0 | **0** | All opens use `invoiceId,mode` |
| `generateInvoiceNumber` definitions | 5 → 1 canonical | **1** | Others import from `invoice-manager.js` |
| High-risk duplicates | — | **2** informational | Review `openInvoice` + `generateInvoiceNumber` definitions |

---

## Files added / modified by the audit

### Added
| File | Purpose |
|---|---|
| `tools/audit-wiring.mjs` | Static analysis script (Node, no deps) |
| `src/dev/runWiringAudit.js` | Runtime DevTools inspector |
| `docs/AUDIT.md` | This file |
| `audit/audit-report.json` | Generated — machine-readable report |
| `audit/audit-report.md` | Generated — human-readable report |

### Modified (fixes applied)
| File | Change |
|---|---|
| `script.js` | Stub noops → loud `console.error`; export `window.openPDF` + `window.generateAndSaveInvoicePDF` |
| `src/invoices/invoice-manager.js` | `generateInvoiceNumber` exported; `openInvoicePage()` added |
| `src/invoice-create/invoiceCreate.flow.js` | Imports `generateInvoiceNumber` from manager; uses `openInvoice()` instead of direct `window.open` |
| `src/storage/storage.events.js` | Imports `generateInvoiceNumber` from manager; local copy removed |
| `src/invoice.js` | Number format aligned to canonical `INV-{RANDOM}-{YYMMDD}` |

---
