# Alerts + Vehicle Sync Audit (Minimal-Diff)

Date: 2026-02-27

## Files and handlers involved

- `index.html`
  - Bell trigger: `#tvBellBtn` (`onclick="toggleNotifDrawer()"`)
  - Alerts drawer shell: `#tvNotifDrawer`, `#tvNotifBody`
- `script.js`
  - Notification state/store: `notifState`, `_notifUpsert`, `_notifPatch`, `_notifSubscribeFirestore`
  - UI wiring: `toggleNotifDrawer()`, `bindNotifDrawer()`, `refreshBellBadge()`, `_renderNotifBody()`
  - Automation ingestion: `syncAutomationAlertsToNotificationCenter()`
  - Legacy panel reference: `#tvAutomationFeed` (hidden via helper)
  - Vehicle/DVSA sync: `initDvsaLookup()`, `buildCanonicalVehicle()`, `syncCanonicalVehicleToFirestore()`
  - Appointment save path: `handleAddAppointment()` canonical mileage extraction and payload build
- `src/data-layer/ui-automation.js`
  - Legacy automation feed listeners already neutralized: `attachFeedEventListeners()`, `bindBellToggle()` return immediately
- `src/invoice.js`
  - Vehicle display + fallback parsing: `getVehicleVM()`, `formatMiles()`, `renderInvoiceMeta()`

## Root causes identified

1. **Dual UI legacy residue perception**
   - Bell drawer is the active system, but a legacy automation feed element (`#tvAutomationFeed`) could still be present in some builds/layout states.
   - Result: user can perceive two different alert UIs.

2. **Drawer closes during internal interaction (timing edge case)**
   - Outside-click close runs at document level.
   - During list re-render, click targets can become detached before document click check, causing false outside-close.

3. **Clear action semantics**
   - `Clear` previously archived all notifications.
   - Requested behavior is to clear read items (persisted) while preserving unread.

4. **Mileage persistence edge case**
   - Appointment save used `#mileage.dataset.rawMileage` as primary source.
   - If dataset value was not set but visible input had a formatted value, mileage could resolve as empty/null and not propagate as expected.

## Minimal changes applied

- Added single open/close state helper (`setAlertsOpenState`) and unified all close paths to use it.
- Added inside-click guard (`ignoreNextOutsideClick`) to prevent false outside-close after internal button actions.
- Added legacy panel suppression helper (`hideLegacyAutomationFeedPanel`) and applied it at startup + bell open.
- Changed `Clear` behavior to archive only read notifications.
- Added debug aliases:
  - Alerts: `window.TVX_DEBUG_ALERTS`
  - Vehicle: `window.TVX_DEBUG_VEHICLE`
- Improved mileage normalization on appointment save:
  - Parse from `dataset.rawMileage` **or** typed/formatted mileage input
  - Persist numeric mileage to canonical appointment/invoice paths.

## Expected behavior after patch

- One consistent bell dropdown remains open during internal actions.
- Outside click and `Escape` close behavior remains intact.
- Legacy forced automation panel stays hidden.
- Mileage edits persist as numeric and sync to linked invoice vehicle fields.
- Invoice mileage display remains UK-formatted (`en-GB`) with fallback handling.
