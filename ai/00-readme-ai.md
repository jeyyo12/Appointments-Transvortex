# AI Docs — Purpose & Usage

This folder contains internal engineering rules, contracts, audit outputs, and task templates used to guide safe, minimal-diff work in this repository.

## What `/ai` is for
- Keep implementation rules stable across sessions.
- Capture backend↔frontend contracts (Firestore and UI wiring).
- Standardize bug-report input so fixes are reproducible.
- Store audit reports and fix plans before code changes.

## How to use these docs
1. Read rules first: `01-project-rules.md`.
2. Validate data model assumptions: `02-backend-contract.md`.
3. Apply UI constraints: `03-ui-guidelines.md`.
4. Start from a template: `04-prompt-templates.md`.
5. Log completed changes: `05-change-log.md`.
6. Use task snapshot format for every new issue: `06-task-snapshot-template.md`.

### Mandatory pre-change protocol
- Before any code edit, read `/ai` docs and decide the path: `change` / `refactor` / `improve`.
- If ambiguous, fill/update task snapshot first, then edit.

## How to provide Task Snapshots
- Copy `06-task-snapshot-template.md` into the request.
- Fill all required sections (goal, repro, expected, widths/devices, logs, Firestore samples).
- Include exact file paths and current behavior.
- Provide at least one failing and one expected data sample.

## Which files to share by bug type

### Appointment card/actions issues
- `script.js`
- `src/workspace/workspace-controller.js`
- `index.html` (tab/actions/inline handlers)
- `styles/premium-ui.css`

### Invoice preview/render issues
- `invoice.html`
- `src/invoice.js`
- `styles/invoice.css`
- `styles/appointment-form.css` (if form mapping involved)

### Invoice storage tab issues
- `src/storage/storage.page.js`
- `src/storage/storage.service.js`
- `src/storage/storage.ui.js`
- `src/storage/storage.events.js`

### Firebase data/linking issues
- `src/invoices/invoice-manager.js`
- `src/data-layer/firestore-sync.js`
- `src/data-layer/index.js`
- `src/config/firebase.js`
- `src/firebase/firebase.js`

### Listener/state duplication issues
- `script.js`
- `src/app.js`
- `src/data-layer/index.js`
- `src/data-layer/firestore-sync.js`
- `index.html` (inline `onclick` and startup scripts)

### Responsive/layout regressions
- `index.html` (inline style blocks)
- `styles/premium-ui.css`
- `styles/enterprise-dashboard.css`
- `styles/appointments*.css`

### PWA/deploy parity/cache issues
- `service-worker.js`
- `sw-update.js`
- `pwa-init.js`
- `firebase.json`

## Operating principle
Use these docs as constraints, not suggestions. If a requested change conflicts with project rules, update the plan before touching code.