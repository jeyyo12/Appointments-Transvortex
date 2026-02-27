# Backend Contract (Firestore + App Invariants)

## Collections in use

Primary:
- `appointments`
- `invoices`
- `scannedInvoices`

Supporting/auxiliary found in repo:
- `invoices_archive`
- `invoiceCatalog`
- `presets_jobs`
- `presets_parts`
- `pages` (service utility path)

## Canonical linkage invariant
- Appointment and invoice must remain bidirectionally consistent:
  - `appointments/{id}.invoiceId === invoices/{invoiceId}.id`
  - `invoices/{invoiceId}.appointmentId === appointments/{id}.id`
- On conflict, canonicalization flow should resolve to one invoice per appointment and repair links.

## Canonical fields and normalizations

### Appointments
Identity/link:
- `id` (document id)
- `invoiceId`
- `invoiceNumber` (optional mirror)

Client/contact:
- `customerName`
- `customerPhone` (legacy alias: `phone`)
- `contactPref`

Vehicle:
- Canonical: `vehicleMakeModel`, `registrationPlate`, `mileage`
- Legacy aliases still observed: `makeModel`, `regNumber`, `vehicle`, `car`

Location:
- `serviceLocation` (`garage`/`client` expected)
- `address`
- `postcode`

Scheduling/status:
- `dateStr`, `time`
- `startAt` / `scheduledDateTime`
- `status` (e.g. `scheduled`, `completed`, `finalized`, `canceled`)

Payment mirrors:
- `paidAmount`
- `balanceDue`
- `paymentStatus`

Timestamps:
- `createdAt`
- `updatedAt`

### Invoices
Identity/link:
- `id` (document id)
- `appointmentId`
- `invoiceNumber`

Client/contact:
- `customerName`
- `phone` (some flows use `customerPhone`)
- `address`
- `postcode`

Vehicle:
- Canonical output: `vehicleMakeModel`, `regPlate`/`registrationPlate`, `mileage`
- Normalization must accept aliases and appointment fallback.

Payment:
- `paymentStatus`
- `paidAmount` / `amountPaid`
- `balanceDue` / `remainingBalance`
- `total` or `totals.total`

Content:
- `jobs`, `parts`, `items` (multiple schema variants exist)
- `status` (`draft`/`final` observed)

Timestamps:
- `createdAt`
- `updatedAt`

## Payment invariants
For any invoice/appointment payment UI:
- `total >= 0`
- `amountPaid >= 0`
- `balanceDue = max(0, total - amountPaid)`
- `paymentStatus = paid` when `amountPaid >= total` and `total > 0`, else unpaid.

## Address/postcode invariants
- If `serviceLocation=client`, `address` should be present.
- Navigate actions require usable location text (`address` and/or postcode).
- Render should never display dead navigation actions.

## Vehicle field invariants
- Prefer canonical `vehicleMakeModel`, `registrationPlate`, `mileage`.
- Accept legacy aliases during read normalization.
- Invoice render must fallback to linked appointment fields when missing in invoice.

## Ordering/query patterns used
Observed core patterns:
- Appointments stream: `orderBy('startAt', 'asc')`
- Invoices stream: `orderBy('createdAt', 'desc')`
- Scanned invoices stream: `orderBy('createdAt', 'desc')`
- Invoice per appointment: `where('appointmentId', '==', appointmentId)`
- Completed/finalized appointment filters: `where('status', 'in', ['completed', 'finalized'])`
- Additional utility filters exist for customer phone/id and date ranges.

## Status transitions (expected)
Appointments:
- `scheduled` -> `completed/finalized`
- Optional cancellation: `canceled/cancelled`

Invoices:
- `draft` -> `final`
- Payment state toggles independently via `paymentStatus`/amount fields.

## Contract enforcement notes
- Do not rename collections.
- Do not remove legacy read aliases until all writers are unified.
- Keep link repair/canonicalization idempotent and minimal-diff.