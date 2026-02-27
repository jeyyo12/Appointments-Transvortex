# Transvortex Firebase Web App (Appointments-Transvortex)

## 1) Project Overview

Transvortex is a Firebase-backed web app for automotive operations:
- appointments scheduling and lifecycle management
- invoice generation and editing
- invoice storage dashboard with paid/unpaid tracking
- scanned invoice upload + accounting flow
- workspace KPI dashboards and notifications
- PWA install support for Desktop, Android, and iPhone Safari

Main pages:
- [`./index.html`](./index.html) – primary app shell (appointments, storage, accounting tabs)
- [`./invoice.html`](./invoice.html) – invoice viewer/editor/print page
- [`./offline.html`](./offline.html) – offline fallback
- [`./FIRESTORE_DIAGNOSTIC.html`](./FIRESTORE_DIAGNOSTIC.html) – Firestore diagnostics utility

Quick vs Full invoice mode (appointment form mode toggle in `index.html`):
- **Quick** (`tvMode--quick`): hides optional fields/blocks (phone, make-model, mileage, parts tab, notes card, some location UI) for fast appointment intake.
- **Full invoice** (`tvMode--full`): shows full data-entry surface used for richer invoice-ready appointments.

Key engineering constraints for contributors:
- minimal diffs only; no broad rewrites
- keep Firebase schema/business logic stable
- mobile-first and deploy-parity aware (local behavior should match production)

---

## 2) Tech Stack

- Frontend: Vanilla JavaScript (ES modules), HTML, CSS
- Backend services: Firebase Authentication, Firestore, Firebase Storage
- Hosting targets: static hosting compatible (Firebase Hosting configured; GitHub/Hostinger documented below)
- PWA: `manifest.webmanifest` + service worker (`service-worker.js`)
- External libraries loaded from CDN:
    - Firebase Web SDK modules (`gstatic.com`)
    - Font Awesome 6.4.0
    - Chart.js 4.4.1
    - Tesseract.js 5
    - html2canvas + jsPDF (dynamically in invoice PDF save flow)

---

## 3) Folder Structure Map (important files)

```text
Appointments-Transvortex/
├─ index.html                         # Main app shell + script/css includes + SW registration
├─ invoice.html                       # Invoice page + print controls + SW registration
├─ script.js                          # Legacy runtime (still active) for appointments/scanned-invoices/etc.
├─ styles.css                         # Global base styles (loaded by index.html)
├─ service-worker.js                  # PWA caching strategy (network-first docs; SWR assets)
├─ manifest.webmanifest               # Primary PWA manifest
├─ manifest.json                      # Secondary/legacy manifest
├─ firebase.json                      # Firebase Hosting config (headers/rewrites/cache)
├─ storage.rules                      # Firebase Storage access rules
├─ storage.cors.json                  # Storage CORS allowlist (local + firebase domains)
├─ src/
│  ├─ app.js                          # Modular app entrypoint (new architecture bootstrap)
│  ├─ invoice.js                      # Invoice renderer/editor/save/print/PDF save
│  ├─ enterprise-dashboard.js         # Enterprise dashboard behaviors
│  ├─ config/
│  │  ├─ firebase.config.js           # Firebase config + ADMIN_UIDS (module path used by invoice/core)
│  │  └─ firebase.js                  # Firebase init wrapper + Firestore cache fallback
│  ├─ firebase/
│  │  ├─ firebase-config.js           # Alternate Firebase config module (parallel stack)
│  │  └─ firebase.js                  # Alternate Firebase init/auth helper (used by several src modules)
│  ├─ core/
│  │  ├─ auth-state.js                # Auth listener + admin resolution
│  │  ├─ app.js                       # Legacy modular core bootstrap
│  │  └─ chips-mode.js                # Invoice catalog chips (Firestore-backed)
│  ├─ data-layer/
│  │  ├─ index.js                     # Data layer coordinator (store + sync + compatibility globals)
│  │  ├─ store.js                     # Normalized in-memory single-source store
│  │  ├─ firestore-sync.js            # Realtime listeners: appointments/invoices/scannedInvoices
│  │  ├─ data-actions.js              # Firestore write actions
│  │  └─ automation.js                # Missing-invoice and automation computations
│  ├─ invoices/
│  │  └─ invoice-manager.js           # get/create invoice + dedupe + orphan cleanup
│  ├─ invoice-create/
│  │  ├─ invoiceCreate.flow.js        # Invoice creation flow entry helpers
│  │  └─ invoiceCreate.ui.js          # Invoice create UI helpers
│  ├─ storage/
│  │  ├─ storage.page.js              # Storage page init
│  │  ├─ storage.service.js           # Invoices listener + reconcile with appointments
│  │  ├─ storage.ui.js                # Storage rendering + paid/unpaid filter logic
│  │  └─ storage.events.js            # Storage button/click handlers
│  └─ workspace/
│     └─ workspace-controller.js      # Workspace panel actions and invoice opening
├─ styles/
│  ├─ design-system.css               # tokens/layout primitives
│  ├─ premium-ui.css                  # header/KPI/major responsive control rules
│  ├─ appointments.css                # appointments list/card layout rules
│  ├─ appointments-toolbar.css        # search/filter toolbar + icon placement
│  ├─ appointment-form.css            # form-specific responsive rules
│  ├─ modal.css                       # unified modal system
│  ├─ invoice.css                     # invoice page + print CSS
│  └─ ...
└─ assets/, Logo/, icons/             # static image/icon assets
```

Architecture note:
- This repo currently runs a **hybrid architecture**: legacy global flow (`script.js`) + modular `src/*` flow.
- Compatibility globals (`window.appointments`, `window.allInvoices`) are still used.

---

## 4) Firestore Data Model (important)

Primary collections used by current runtime:
- `appointments`
- `invoices`
- `scannedInvoices`

Additional collections used by specific features:
- `invoiceCatalog` (chips/autocomplete catalog)
- `invoices_archive` (dedupe/orphan archival)

### `appointments` (example fields)

| Field | Type | Notes |
|---|---|---|
| `customerName` | string | client display name |
| `customerPhone` | string | phone |
| `contactPref` | string | contact preference |
| `registrationPlate` | string | reg plate (modern key) |
| `regNumber` | string | legacy compatibility key |
| `vehicleMakeModel` | string | modern make/model key |
| `makeModel` | string | legacy compatibility key |
| `mileage` | number or null | numeric mileage |
| `serviceLocation` | string | garage/client/etc |
| `address` | string | address |
| `postcode` | string | postcode |
| `jobs` | array<object> | normalized line items (`name, qty, unitPrice, total`) |
| `parts` | array<object> | normalized parts (`name, qty, unitPrice, total`) |
| `totals` | object | `labour, parts, subtotal, total` |
| `paidAmount` | number | amount paid |
| `balanceDue` | number | remaining balance |
| `paymentStatus` | string | e.g. `PAID/UNPAID` or lower-case in some flows |
| `status` | string | appointment status |
| `invoiceId` | string | link to `invoices/{id}` |
| `invoiceNumber` | string | mirrored invoice number |
| `startAt` | timestamp/date | scheduling anchor |
| `scheduledDateTime` | timestamp/date | scheduling anchor |
| `createdAt` | timestamp | created timestamp |
| `updatedAt` | timestamp | updated timestamp |
| `createdBy` | string | uid |

Example (shape only):

```json
{
    "customerName": "John Doe",
    "customerPhone": "+44 7700 900 123",
    "registrationPlate": "AB12XYZ",
    "serviceLocation": "client",
    "address": "81 Foley Rd",
    "postcode": "B8 2JT",
    "jobs": [{ "name": "Diagnostics", "qty": 1, "unitPrice": 50, "total": 50 }],
    "parts": [{ "name": "Oil Filter", "qty": 1, "unitPrice": 12, "total": 12 }],
    "totals": { "labour": 50, "parts": 12, "subtotal": 62, "total": 62 },
    "paidAmount": 0,
    "balanceDue": 62,
    "paymentStatus": "UNPAID",
    "status": "scheduled",
    "invoiceId": "<invoiceDocId>",
    "startAt": "<timestamp>",
    "createdAt": "<timestamp>",
    "updatedAt": "<timestamp>"
}
```

### `invoices` (example fields)

| Field | Type | Notes |
|---|---|---|
| `invoiceNumber` | string | generated `INV-*` |
| `appointmentId` | string | reverse link to appointment |
| `status` | string | draft/final/... |
| `customerName` | string | top-level in many flows |
| `customer` | object | nested customer in editor save flow |
| `phone` | string | top-level phone |
| `address` | string | top-level address |
| `postcode` | string | postcode |
| `vehicleMakeModel` | string | top-level vehicle |
| `vehicle` | object | nested vehicle in editor save flow |
| `regPlate` | string | registration |
| `jobs` | array<object> | normalized labour items |
| `parts` | array<object> | normalized parts items |
| `totals` | object | `labour, parts, subtotal, total` |
| `total` | number | legacy total key used by some flows |
| `paidAmount` / `amountPaid` | number | both used across flows |
| `balanceDue` | number | remaining amount |
| `paymentStatus` | string | paid/unpaid variants |
| `paymentMethod` | string | method |
| `paymentDate` | string/date | payment date |
| `createdAt` | timestamp | query sort field |
| `updatedAt` | timestamp | update timestamp |
| `createdBy` | string | uid |
| `notes` | string | invoice notes |

Example (shape only):

```json
{
    "invoiceNumber": "INV-ABCDE-260219",
    "appointmentId": "<appointmentDocId>",
    "status": "draft",
    "customerName": "John Doe",
    "address": "81 Foley Rd",
    "postcode": "B8 2JT",
    "regPlate": "AB12XYZ",
    "jobs": [{ "name": "Diagnostics", "qty": 1, "unitPrice": 50, "total": 50 }],
    "parts": [{ "name": "Oil Filter", "qty": 1, "unitPrice": 12, "total": 12 }],
    "totals": { "labour": 50, "parts": 12, "subtotal": 62, "total": 62 },
    "paidAmount": 0,
    "balanceDue": 62,
    "paymentStatus": "UNPAID",
    "createdAt": "<timestamp>",
    "updatedAt": "<timestamp>"
}
```

### `scannedInvoices` (example fields)

| Field | Type | Notes |
|---|---|---|
| `createdAt` | timestamp | server timestamp |
| `clientCreatedAt` | number | local epoch fallback |
| `createdByUid` | string | uploader uid |
| `status` | string | upload/processing states |
| `file` | object | `storagePath, downloadURL, fileType` |
| `weekKey` | string | accounting grouping |
| `weekRange` | string | accounting grouping |

Example:

```json
{
    "createdAt": "<timestamp>",
    "clientCreatedAt": 1700000000000,
    "createdByUid": "<uid>",
    "file": {
        "storagePath": "scannedInvoices/<uid>/<date>/<file>",
        "downloadURL": "https://...",
        "fileType": "image"
    },
    "status": "uploaded",
    "weekKey": "2026-W08",
    "weekRange": "17 Feb - 23 Feb"
}
```

### Index requirements

Queries observed in code:
- `appointments` ordered by `startAt` ascending
- `invoices` ordered by `createdAt` descending
- `scannedInvoices` ordered by `createdAt` descending
- `appointments` where `status in ['completed', 'finalized']`
- `invoices` where `appointmentId == X` + orderBy `createdAt desc` (dedupe flow)
- `invoiceCatalog` where `type/normalized` with orderBy chains (chips autocomplete)

Potential composite indexes you may need in Firestore:
- `invoices(appointmentId ASC, createdAt DESC)` (explicitly handled in code comments in `invoice-manager.js`)
- `invoiceCatalog(type ASC, normalized ASC, usageCount DESC)` for chips search flow

---

## 5) Authentication / Admin

- Auth method: Google Sign-In via Firebase Auth popup.
- Admin check source: `ADMIN_UIDS` arrays in:
    - [`./src/config/firebase.config.js`](./src/config/firebase.config.js)
    - [`./src/firebase/firebase-config.js`](./src/firebase/firebase-config.js)
- Admin checks occur in:
    - [`./src/firebase/firebase.js`](./src/firebase/firebase.js)
    - [`./src/core/auth-state.js`](./src/core/auth-state.js)
    - [`./src/services/auth-service.js`](./src/services/auth-service.js)

Important:
- Keep admin UID lists synchronized between config modules until architecture is unified.
- Authorized Firebase domains must include all environments you use (localhost, firebase hosting domain, github.io/custom domain).

---

## 6) Running Locally (step-by-step)

### Requirements
- Modern browser (Chrome/Edge/Safari)
- VS Code + Live Server extension **or** any static server
- Node.js (optional; needed only for utility scripts and package installs)

### Install deps (optional but recommended)

```bash
npm install
```

### Start local server

Option A (VS Code):
1. Open repository in VS Code.
2. Open `index.html`.
3. Use “Open with Live Server”.
4. Typical URL: `http://127.0.0.1:5500/index.html`.

Option B (CLI):

```bash
npx live-server .
```

### Local smoke flow
1. Open `index.html`.
2. Authenticate with Google.
3. Create/edit appointment.
4. Open invoice (`invoice.html?invoiceId=...`).
5. Verify storage/scanned/accounting tabs load.

### Common local pitfalls
- Service worker serves old files: unregister SW + hard reload.
- Storage upload blocked: ensure local origins in `storage.cors.json` are applied in GCS bucket CORS.
- Auth popup fails: add local domain to Firebase Authorized Domains.
- Module path errors: serve over HTTP (not `file://`) because ESM imports are used.

---

## 7) Environment / Secrets

Current project state:
- Firebase client config is committed in:
    - [`./src/config/firebase.config.js`](./src/config/firebase.config.js)
    - [`./src/firebase/firebase-config.js`](./src/firebase/firebase-config.js)
- No runtime `.env` integration is currently wired into app code.

Secret handling guidance:
- Firebase Web config is client-safe, but still project-specific.
- Rotate values by replacing both config files above.
- Keep service account and private credential files out of git (already covered by `.gitignore`).

Optional future approach (documentation only):
- Introduce build-time env injection later if moving to bundler; not currently configured.

---

## 8) Invoice System (detailed)

### How invoice is generated from appointment

Main paths:
- [`./src/invoices/invoice-manager.js`](./src/invoices/invoice-manager.js): `getOrCreateInvoiceForAppointment()`
- [`./src/invoice-create/invoiceCreate.flow.js`](./src/invoice-create/invoiceCreate.flow.js): creation flow wrappers
- Legacy fallback in [`./script.js`](./script.js)

Flow summary:
1. Try `appointment.invoiceId` and verify target invoice exists.
2. Else query `invoices` by `appointmentId`.
3. If found, pick best/newest invoice and backfill `appointment.invoiceId`.
4. If not found, create new invoice payload from appointment jobs/parts/totals.
5. Update appointment link (`invoiceId`, sometimes `invoiceNumber`).

Linking rules:
- `appointments/{id}.invoiceId` points to invoice doc id.
- `invoices/{id}.appointmentId` points back to appointment doc id.
- Deduplication can archive extras in `invoices_archive`.

### Print and invoice rendering

- Invoice page: [`./invoice.html`](./invoice.html)
- Invoice renderer/editor: [`./src/invoice.js`](./src/invoice.js)
- Print CSS: [`./styles/invoice.css`](./styles/invoice.css)

Print trigger points:
- `downloadPDF()` and `handlePrint()` in `src/invoice.js` currently call `window.print()`.

### Postcode/address flow

- Appointment save payload in legacy flow includes `address` and `postcode`.
- Invoice creation copies `address/postcode` from appointment into invoice payload where available.

### Known Issues / Architecture Notes

- Mixed architecture: `script.js` legacy + `src/data-layer/*` modular coexist.
- `window.allInvoices` is still synchronized/overwritten in multiple places:
    - legacy listener in `script.js`
    - data-layer compatibility sync in `src/data-layer/index.js`
- Some payment fields are duplicated (`paidAmount` vs `amountPaid`; `paymentStatus` casing differs).
- Missing invoice placeholders come from both reconciliation and automation-derived logic.

---

## 9) Invoice Storage (detailed)

Storage module entry points:
- Page init: [`./src/storage/storage.page.js`](./src/storage/storage.page.js)
- Listener/service: [`./src/storage/storage.service.js`](./src/storage/storage.service.js)
- UI/filtering: [`./src/storage/storage.ui.js`](./src/storage/storage.ui.js)
- Events/actions: [`./src/storage/storage.events.js`](./src/storage/storage.events.js)

How listener starts:
- `initInvoicesStorage()` sets up controls and either:
    - uses data-layer store (`window.Store`/`window._dataLayer.store`) as source of truth, or
    - falls back to direct Firestore listener (`startInvoicesListener`).

Filtering behavior:
- Search + payment status filters run in `storage.ui.js` (`filterInvoices`).
- Paid/unpaid KPI pills toggle active payment filter.

Paid/Unpaid state rules:
- Normalization handles:
    - `paymentStatus`
    - `paid` boolean
    - amount math (`total`, `paidAmount`/`amountPaid`, `balanceDue`)

Why “missing invoices” can appear:
- Reconcile logic compares completed/finalized appointments against linked invoices.
- Any completed appointment without linked/derived invoice generates placeholder (`missingInvoice: true`).
- Query/sort field mismatches can also surface inconsistencies:
    - listeners sort by `createdAt`
    - some UI fields display `invoiceDate`
    - mixed payloads can omit one or the other in edge cases.

---

## 10) Responsive UI Rules (mobile-first)

Main responsive source files:
- Global/layout tokens: [`./styles.css`](./styles.css), [`./styles/design-system.css`](./styles/design-system.css)
- Header/KPI stability rules: [`./styles/premium-ui.css`](./styles/premium-ui.css)
- Appointments list/cards: [`./styles/appointments.css`](./styles/appointments.css)
- Toolbar/search row: [`./styles/appointments-toolbar.css`](./styles/appointments-toolbar.css)
- Form and modals: [`./styles/appointment-form.css`](./styles/appointment-form.css), [`./styles/modal.css`](./styles/modal.css)

Breakpoint set in current codebase (important checkpoints):
- `480`, `520`, `600`, `723`, `768`, `1023`, `1024`, `1400`

Stability rules currently documented in code intent:
- `100–600`: keep same structural behavior as mobile baseline (400px-like), only scale size/spacing.
- `601–723`: remain structurally aligned with mobile lock zone.
- `1023–1400` (header/KPI zone): preserve 1023 layout pattern; only smooth scaling.

Where to edit responsive behavior first:
1. `styles/premium-ui.css` (header + KPI + workspace grid behavior)
2. `styles/appointments.css` (appointments cards/carousel and day-group layout)
3. `styles/appointments-toolbar.css` (search/filter row)

---

## 11) PWA / Service Worker

Files:
- Manifest: [`./manifest.webmanifest`](./manifest.webmanifest)
- Secondary manifest: [`./manifest.json`](./manifest.json)
- SW: [`./service-worker.js`](./service-worker.js)

Current caching strategy:
- Cache name versioned via `CACHE_NAME` in `service-worker.js`.
- Install precaches critical app files.
- Fetch strategy:
    - documents/HTML: network-first
    - manifest: network-first
    - static assets: stale-while-revalidate
    - cross-origin requests: bypass SW

Update behavior:
- `index.html` registers SW with `scope: './'`, requests update on load, sends `SKIP_WAITING`, reloads on `controllerchange` with loop guard.

Hard refresh/update procedure:
1. DevTools → Application → Service Workers → unregister.
2. DevTools → Clear storage → clear site data.
3. Reload page with cache disabled.

iPhone Safari caveats:
- PWA update propagation can lag; close/reopen installed app after deploy.
- Keep font/input sizes iOS-safe in modals/forms (16px rule present for modal inputs).

---

## 12) Deployment Guides

### A) GitHub Pages

Status: **Not fully preconfigured in repo (no CI workflow found)**, but static structure is compatible.

Key rules:
- Keep relative paths (`./...`) for app assets.
- Avoid root-absolute imports (`/src/...`) for GH subpath compatibility.
- Ensure `service-worker.js` stays at project root and references relative assets.

Manual publish (branch/folder based):
1. Push repo to GitHub.
2. In GitHub Pages settings, publish from root (or configured folder) of selected branch.
3. Open published URL and verify:
     - `index.html` loads all CSS/JS without 404
     - `invoice.html` opens
     - SW registers and updates correctly

### B) Hostinger (static hosting)

Status: **No Hostinger-specific config file required; static upload expected**.

Steps:
1. Upload repository web root files to Hostinger public folder.
2. Preserve folder structure exactly (`src/`, `styles/`, `Logo/`, `assets/`, etc.).
3. Ensure MIME types for `.js`, `.css`, `.webmanifest` are served correctly.
4. Clear Hostinger/server cache after update.

Caching pitfalls:
- Old SW or aggressive host cache may keep stale UI.
- Always hard refresh and verify new `CACHE_NAME` deployment behavior.

---

## 13) Testing Checklist (copy/paste)

```text
Pre-flight
[ ] Open app over HTTP (not file://)
[ ] Login works (Google popup)
[ ] No red errors in console on initial load

Desktop Chrome/Edge
[ ] Create appointment
[ ] Edit appointment
[ ] Create/open invoice from appointment
[ ] Save invoice changes
[ ] Toggle paid/unpaid in storage
[ ] Scanned invoice upload + list update
[ ] KPI cards and workspace panel update correctly

Android Chrome
[ ] App loads and is usable at mobile widths
[ ] PWA install prompt/flow works
[ ] Header KPI chips remain readable and tappable
[ ] Invoice page opens and prints

iPhone Safari
[ ] Login flow works
[ ] No blocked scroll from fixed/sticky layers
[ ] PWA add-to-home-screen works
[ ] Installed PWA reloads updated UI after deploy
[ ] Invoice print opens without UI lock

PWA install/update
[ ] SW registered
[ ] New deploy triggers SW update and refresh
[ ] Stale cache is cleared after hard refresh

Firestore smoke tests
[ ] appointments write/read
[ ] invoices write/read
[ ] scannedInvoices write/read
[ ] appointment ↔ invoice linking persists

Breakpoint validation
[ ] 100
[ ] 280
[ ] 320
[ ] 360
[ ] 375
[ ] 390
[ ] 400
[ ] 437
[ ] 441
[ ] 480
[ ] 520
[ ] 580
[ ] 600
[ ] 723
[ ] 768
[ ] 805
[ ] 1023
[ ] 1024
[ ] 1200
[ ] 1400
```

---

## 14) Troubleshooting

### “Invoices not found” / “Missing invoices”
- Check reconcile logic in [`./src/storage/storage.service.js`](./src/storage/storage.service.js).
- Check placeholder generation in [`./src/storage/storage.ui.js`](./src/storage/storage.ui.js).
- Verify appointment has `invoiceId` and invoice has `appointmentId`.

### “Paid/Unpaid not filtering correctly”
- Inspect payment normalization in [`./src/storage/storage.ui.js`](./src/storage/storage.ui.js) (`isInvoicePaid`).
- Validate field consistency (`paidAmount`, `amountPaid`, `paymentStatus`, `balanceDue`) in invoice docs.

### “Invoice duplicates or orphan links”
- Use manager utilities in [`./src/invoices/invoice-manager.js`](./src/invoices/invoice-manager.js):
    - dedupe by appointment
    - cleanup orphaned invoices

### “Print slow or unstable on iPhone”
- Check print triggers in [`./src/invoice.js`](./src/invoice.js) (`downloadPDF`, `handlePrint`).
- Check print CSS in [`./styles/invoice.css`](./styles/invoice.css).

### “UI reflows around 437/600 or desktop header shifts”
- Check responsive control rules in [`./styles/premium-ui.css`](./styles/premium-ui.css).
- Check list/card behavior in [`./styles/appointments.css`](./styles/appointments.css).

### “Stale UI after deploy”
- Check `CACHE_NAME` and fetch handlers in [`./service-worker.js`](./service-worker.js).
- Validate hosting cache headers in [`./firebase.json`](./firebase.json) (if on Firebase Hosting).

### “Auth popup unauthorized-domain”
- Add deployment domain(s) to Firebase Authorized Domains.
- Verify `authDomain` in both Firebase config files.

---

## 15) Contribution / Dev Rules

1. Minimal diffs only; avoid broad refactors.
2. Do not rewrite core business logic unless explicitly requested.
3. Do not duplicate listeners or create parallel state paths when one already exists.
4. Prefer fixing in existing source-of-truth layer:
     - data changes: data-layer/store/listeners
     - invoice linkage: invoice-manager
     - responsive behavior: premium-ui + appointments CSS stack
5. Preserve deployment parity:
     - keep relative asset/module paths
     - validate SW update behavior after changes
6. Preserve mobile behavior (Desktop + Android + iPhone Safari).
7. Never commit secrets/service accounts; follow `.gitignore` policy.

---

## Useful project links

- Main app: [`./index.html`](./index.html)
- Invoice page: [`./invoice.html`](./invoice.html)
- Service worker: [`./service-worker.js`](./service-worker.js)
- Firebase hosting config: [`./firebase.json`](./firebase.json)
- Storage CORS config: [`./storage.cors.json`](./storage.cors.json)
- Storage rules: [`./storage.rules`](./storage.rules)
