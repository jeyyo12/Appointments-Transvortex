# Project Rules (Authoritative)

## 0) Pre-change Protocol (Mandatory)
- Before any code change, read `/ai` docs first (minimum: `01-project-rules.md`, `02-backend-contract.md`, `03-ui-guidelines.md`, latest entries in `05-change-log.md`).
- After reading, explicitly decide one path before editing code:
  - `change` (small targeted fix), or
  - `refactor` (structure cleanup), or
  - `improve` (incremental enhancement).
- If scope is unclear, stop and create/update task snapshot in `06-task-snapshot-template.md` before touching code.
- Do not skip this protocol even for “small” edits.

## 1) Minimal Diffs Only
- Make the smallest change set that resolves the root cause.
- No broad rewrites, no style-only churn, no unrelated refactors.
- Preserve existing public behavior unless the task explicitly changes it.

## 2) Single Source of Truth
- One listener pipeline per domain:
  - Appointments: one Firestore source feeding one render state.
  - Invoices: one Firestore source feeding one render state.
- Avoid parallel legacy+modular state writes for the same UI.
- Do not keep duplicate renderers active for the same panel.

## 3) Strict Button Conditional Rendering
- A button is shown only if it can execute real logic.
- Hide buttons with missing prerequisites.

Required conditions:
- Call: show only when valid phone exists.
- Navigate/Visit: show only when address/postcode is present.
- Mark Paid/Unpaid: show only when payment toggle handler is wired and target record exists.
- Invoice/Open: show only when appointment/invoice linkage can be resolved.

## 4) Responsive Lock Rules
- Mobile lock: widths `100–600` must behave like stable `~400px` layout shape (scaling allowed, structural jumps not allowed).
- Header lock: widths `1023–1400` must keep same structure as `1023` baseline.
- Use existing tokenized CSS and clamp/rem/vw scaling; avoid breakpoint fragmentation.

## 5) Invoice Design Freeze (Critical)
- Never redesign invoice UI or print structure.
- Do not change invoice visual architecture in:
  - `invoice.html`
  - `src/invoice.js` preview/print structure
  - invoice print CSS
- Only data mapping fixes are allowed unless explicitly requested.

## 6) Firestore Integrity Rules
- Preserve invariant: `appointment.invoiceId <-> invoice.appointmentId`.
- Never change collection names.
- Never introduce writes that can orphan invoice links.

## 7) No New Frameworks / No Duplicate Systems
- Use current stack (vanilla modules + Firebase).
- No additional frameworks or runtime layers.
- Disable duplicate legacy paths instead of adding another parallel path.

## 8) Delivery Discipline
- Audit first when issue touches multiple pipelines.
- Document decisions in `/ai/05-change-log.md`.
- Validate at required widths/devices before finalizing.