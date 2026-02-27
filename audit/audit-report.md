# Wiring Audit Report

_Generated: 2026-02-27T12:46:26.502Z — files scanned: 84_

> **Definition of Done:** Real broken candidates = 0 · Unmapped actions = 0 · Invoice violations = 0 · Runtime smoke test passes

## 1. Summary Metrics

| Metric | Count | Target | Status |
| --- | --- | --- | --- |
| 🔴 REAL broken wiring candidates | 0 | 0 | ✅ |
| 🔵 Likely false positives (informational) | 22 | — | ℹ️ Review if needed |
| 🟡 Unmapped data-action values | 0 | 0 | ✅ |
| 🟠 Invoice param violations | 0 | 0 | ✅ |
| 🔁 High-risk duplicate functions (informational) | 0 | — | ℹ️ Review if needed |
| Wiring completeness estimate | ~100% | 100% |  |

**Total controls:** 78  |  **unique data-action values:** 20  |  **inline onclick:** 44  |  **window.* exports:** 117


## 2. REAL Issues — Fix These (ranked by impact)

These are the only items that need to be fixed. Each entry includes: file, action/expression, why it breaks, minimal fix.


### 2a. Item-scoped data-action missing data-id

Count: **0**

**Why it breaks:** `bindActionDelegation` (src/core/events.js) uses `closest("[data-action][data-id]")` — missing `data-id` means the click is silently swallowed.

**Minimal fix:** Add `data-id="${entity.id}"` (or `data-id="${apt.id}"`) to every rendering template that contains the buttons listed below.


✅ None found.

### 2b. onclick calls stub/no-op window functions

Count: **0**

**Why it breaks:** The function body is empty or a no-op — the click fires but nothing happens.

Known stubs: none

✅ None — stubs are overridden by real implementations before any click can fire.

### 2c. onclick calls window function with NO definition

Count: **0**

**Why it breaks:** The function does not exist at all — calling it throws `TypeError: window.fn is not a function`.

✅ None found.

### 2d. data-action values not matched by any handler string in JS

Count: **0**

**Why it breaks:** The delegation fires and matches the element, but no `case`/`if` branch handles the action string — click silently does nothing.

✅ All data-action values found as strings in JS source.

## 3. Invoice Contract & Violations

### 3a. Canonical contract

```

invoice.html?invoiceId=<firestoreDocId>&mode=<view|edit>

```

- `invoiceId` = Firestore document id — **required**

- `mode` = `view` (default) or `edit`

- `aptId`, `appointmentId`, `id` must **never** appear in the URL — resolve to `invoiceId` first

- All opens go through `openInvoicePage(invoiceId, mode)` in `src/invoices/invoice-manager.js`


### 3b. Violations found (non-canonical params)

Count: **0**  (target: 0)

✅ No violations — all detected direct opens use canonical params.

### 3c. All invoice.html entry points detected

**Search command:** `rg "invoice.html\?" -n`


| File | Line | Via | Params |
| --- | --- | --- | --- |
| script.js | 9287 | js | invoiceId=${invoiceId}, mode=edit |
| script.js | 9601 | js | invoiceId=${invoiceId}, mode=view |
| script.js | 9620 | js | invoiceId=${invoiceId}, mode=edit |
| src/invoices/invoice-manager.js | 636 | js | invoiceId=${invoiceId}, mode=${mode} |
| src/storage/storage.events.js | 132 | js | invoiceId=${targetInvoiceId}, mode=view |
| src/storage/storage.events.js | 140 | js | invoiceId=${targetInvoiceId}, mode=view |
| src/storage/storage.events.js | 160 | js | invoiceId=${canonicalInvoiceId}, mode=view |
| src/storage/storage.events.js | 163 | js | invoiceId=${targetInvoiceId}, mode=view |

### 3d. openInvoice* function call sites

**Search command:** `rg "openInvoice" -n src/`


| File | Line | Function |
| --- | --- | --- |
| script.js | 9112 | openInvoiceForAppointment |
| script.js | 9117 | openInvoice |
| script.js | 9159 | openInvoiceFromAppointment |
| script.js | 9165 | openInvoice |
| script.js | 9186 | openInvoice |
| script.js | 9579 | openInvoiceFile |
| src/invoice-create/invoiceCreate.flow.js | 48 | openInvoice |
| src/invoice-create/invoiceCreate.flow.js | 150 | openInvoice |
| src/invoices/invoice-manager.js | 631 | openInvoicePage |
| src/invoices/invoice-manager.js | 639 | openInvoice |
| src/storage/storage.events.js | 125 | openInvoiceFile |
| src/storage/storage.ui.js | 379 | openInvoiceFile |

### 3e. Invoice number generators (duplicate risk)

⚠️  4 definitions found — keep only the canonical one in `src/invoices/invoice-manager.js`.

| File | Line | Function |
| --- | --- | --- |
| script.js | 9080 | generateInvoiceNumberStable |
| script.js | 9148 | generateInvoiceNumberLegacy |
| src/invoice.js | 202 | generateInvoiceNumberStandalone |
| src/invoices/invoice-manager.js | 18 | generateInvoiceNumber |

## 4. Likely False Positives — Do NOT Fix Unless Proven

These items were flagged by the element scanner but are expected behavior in this repo.

Verify before making any changes to items listed here.


### 4a. Non-item-scoped or exempt-file data-action missing data-id

Count: **22**

These live in: modal dialogs, invoice.html, chips / search / filter controls, offline.html.

They use *local* event delegation that only needs `data-action` (no `data-id` required).

| File | Action | Why likely OK |
| --- | --- | --- |
| index.html | add-job | Non-item-scoped action (global/filter/chip) |
| index.html | add-part | Non-item-scoped action (global/filter/chip) |
| invoice.html | add-service | Exempt file (local delegation, no bindActionDelegation) |
| invoice.html | add-part | Exempt file (local delegation, no bindActionDelegation) |
| invoice.html | mark-paid | Exempt file (local delegation, no bindActionDelegation) |
| invoice.html | clear-payment | Exempt file (local delegation, no bindActionDelegation) |
| invoice.html | save-draft | Exempt file (local delegation, no bindActionDelegation) |
| invoice.html | cancel-edit | Exempt file (local delegation, no bindActionDelegation) |
| script.js | close | Non-item-scoped action (global/filter/chip) |
| script.js | cancel | Non-item-scoped action (global/filter/chip) |
| script.js | save | Non-item-scoped action (global/filter/chip) |
| script.js | close | Non-item-scoped action (global/filter/chip) |
| src/modal.js | cancel | Exempt file (local delegation, no bindActionDelegation) |
| src/modal.js | confirm | Exempt file (local delegation, no bindActionDelegation) |
| src/shared/modal.js | cancel | Exempt file (local delegation, no bindActionDelegation) |
| src/shared/modal.js | confirm | Exempt file (local delegation, no bindActionDelegation) |
| src/ui/components/details-modal.js | close | Non-item-scoped action (global/filter/chip) |
| src/ui/components/details-modal.js | close | Non-item-scoped action (global/filter/chip) |
| src/ui/components/finalize-modal.js | close | Non-item-scoped action (global/filter/chip) |
| src/ui/components/finalize-modal.js | cancel | Non-item-scoped action (global/filter/chip) |
| src/utils/notifications.js | cancel | Exempt file (local delegation, no bindActionDelegation) |
| src/utils/notifications.js | confirm | Exempt file (local delegation, no bindActionDelegation) |

### 4b. Invoice param set patterns observed

- Variant 1: `invoiceId,mode`

✅ Single canonical param set in use.


## 5. High-Risk Duplicate Functions — Review Required

Only invoice/wiring-critical function names are flagged here. The full duplicate list is in Appendix D.

A duplicate here means two files define the same critical function independently — risk of format drift or split behaviour.


✅ No high-risk duplicate functions found.

## 6. UI/UX Bugs (scroll-jump, dead buttons)

Static heuristic checks for no-op controls and unexpected scroll/navigation triggers.

Dead buttons: **6** · Scroll-jumps: **12** · Suspicious navigation: **0**


### 6a. Dead Buttons

Controls that look interactive (by class naming) but have no `data-action`, `onclick`, or `href`.

| File | Snippet |
| --- | --- |
| index.html | `<button id="cleanupInvoicesBtn" class="tvBtn tvBtn--secondary tvBtn--sm tvInvoicesStorage__action" title="Cleanup duplicate invoices">` |
| index.html | `<button id="refreshInvoicesButton" class="tvBtn tvBtn--secondary tvBtn--sm tvInvoicesStorage__action" title="Refresh invoices list">` |
| index.html | `<button type="button" class="btn-time-now">` |
| index.html | `<button type="button" class="btn-time-cancel">` |
| index.html | `<button type="button" class="btn-time-ok">` |
| invoice.html | `<button id="saveInvoiceBtn" class="btn-success" style="display:none;">` |

### 6b. Scroll Jumps

Patterns that may trigger unexpected jump/scroll behavior (`href="#..."`, `location.hash=`, `scrollIntoView`, `scrollTo`).

| File | Line | Kind | Snippet |
| --- | --- | --- | --- |
| script.js | 4351 | scroll-into-view | `if (firstCard) firstCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });` |
| script.js | 4455 | scroll-into-view | `aptRow.scrollIntoView({` |
| script.js | 4749 | scroll-into-view | `activeTabBtn.scrollIntoView({` |
| script.js | 5010 | scroll-to | `window.scrollTo(0, this.scrollLockY);` |
| script.js | 5064 | scroll-into-view | `selected.scrollIntoView({ block: 'center', behavior: 'smooth' });` |
| script.js | 5078 | scroll-into-view | `selected.scrollIntoView({ block: 'center', behavior: 'smooth' });` |
| script.js | 5373 | scroll-into-view | `activeTabBtn.scrollIntoView({` |
| script.js | 8722 | location-hash | `if (!fromPopState && location.hash === '#appointments') {` |
| src/enterprise-dashboard.js | 389 | scroll-into-view | `firstApt.scrollIntoView({ behavior: 'smooth', block: 'nearest' });` |
| src/header/header-search.js | 153 | scroll-into-view | `appointmentsTab.scrollIntoView({ behavior: 'smooth' });` |
| src/ui/form-stepper.js | 266 | scroll-into-view | `stepperHeader?.scrollIntoView({ behavior: 'smooth', block: 'start' });` |
| src/utils/notifications.js | 171 | scroll-into-view | `aptRow.scrollIntoView({` |

### 6c. Suspicious Navigation

Navigation to `.html` routes without query params (excluding `index.html`) that may miss required context.

✅ None found.


## Appendix A: All data-action values and occurrence counts

| Action | Occurrences |
| --- | --- |
| close | 5 |
| cancel | 5 |
| toggle-paid | 3 |
| confirm | 3 |
| add-part | 2 |
| invoice | 2 |
| add-job | 1 |
| add-service | 1 |
| mark-paid | 1 |
| clear-payment | 1 |
| save-draft | 1 |
| cancel-edit | 1 |
| complete-job | 1 |
| start-job | 1 |
| call | 1 |
| visit | 1 |
| toggle-secondary | 1 |
| edit | 1 |
| delete | 1 |
| save | 1 |

## Appendix B: All window.* exports

| Function | Definition File(s) | Stub? | Noop? |
| --- | --- | --- | --- |
| window.testFirebaseInit | FIRESTORE_DIAGNOSTIC.html | no | no |
| window.testFirestoreConnection | FIRESTORE_DIAGNOSTIC.html | no | no |
| window.testInvoicesQuery | FIRESTORE_DIAGNOSTIC.html | no | no |
| window.testCreateSampleInvoice | FIRESTORE_DIAGNOSTIC.html | no | no |
| window.testListAllCollections | FIRESTORE_DIAGNOSTIC.html | no | no |
| window.fixFirestoreRules | FIRESTORE_DIAGNOSTIC.html | no | no |
| window.createInvoicesCollection | FIRESTORE_DIAGNOSTIC.html | no | no |
| window.clearLogs | FIRESTORE_DIAGNOSTIC.html | no | no |
| window.log | FIRESTORE_DIAGNOSTIC.html | no | no |
| window.logConfig | FIRESTORE_DIAGNOSTIC.html | no | no |
| window.__TVX_USE_WIZARD_V2 | index.html | no | no |
| window.__openWizardV2 | index.html | no | no |
| window.switchTab | index.html, script.js, src/app.js | no | no |
| window.filteredAppointments | index.html, src/header/header-search.js | no | no |
| window.__tvInitFlags | index.html, script.js, src/data-layer/index.js | no | no |
| window.updateLiveIndicators | index.html | no | no |
| window.tvAptDrawerOpen | index.html | no | no |
| window.tvAptDrawerClose | index.html | no | no |
| window.applyKPIFilter | index.html | no | no |
| window.filterAppointmentsByKPI | index.html | no | no |
| window.initKPIFilters | index.html | no | no |
| window.goHome | offline.html | no | no |
| window.checkConnection | offline.html | no | no |
| window.PWA | pwa-init.js, pwa.js | no | no |
| window.initPWA | pwa.js, script.js | no | no |
| window.handleAuthToggle | script.js | no | no |
| window.handleRefreshAppointments | script.js, src/data-layer/index.js | no | no |
| window.handleAppointmentFilter | script.js, src/data-layer/index.js | no | no |
| window.handleAppointmentSearch | script.js, src/data-layer/index.js | no | no |
| window.exportAppointmentsCSV | script.js | no | no |
| window.__tvInit | script.js, src/app.js, src/storage/storage.page.js, src/workspace/workspace-controller.js | no | no |
| window.isUiV2Enabled | script.js | no | no |
| window.updateDashboardMetrics | script.js, verify-kpi-dashboard.js | no | no |
| window.updateHeaderMetrics | script.js | no | no |
| window.__tvRenderGate | script.js | no | no |
| window.renderWorkspace | script.js, src/workspace/workspace-controller.js | no | no |
| window.tryRenderAll | script.js, src/data-layer/firestore-sync.js, src/data-layer/index.js | no | no |
| window.toggleWriteTrace | script.js, src/invoice.js | no | no |
| window.getWriteTraces | script.js, src/invoice.js | no | no |
| window.showLastWrite | script.js, src/invoice.js | no | no |
| window.debugTvSplash | script.js | no | no |
| window.tvScanPageSize | script.js | no | no |
| window.Chart | script.js | no | no |
| window.toggleNotifDrawer | script.js | no | no |
| window.refreshBellBadge | script.js | no | no |
| window.createAppointmentCard | script.js | no | no |
| window.getScheduledDate | script.js | no | no |
| window.normalizeAppointment | script.js | no | no |
| window.formatCurrencyGBP | script.js | no | no |
| window.formatDateShort | script.js | no | no |
| window.formatTimeShort | script.js | no | no |
| window.toNumber | script.js | no | no |
| window.handleEditAction | script.js, src/workspace/workspace-controller.js | no | no |
| window.handleDeleteAction | script.js, src/workspace/workspace-controller.js | no | no |
| window.handleVisitAction | script.js, src/workspace/workspace-controller.js | no | no |
| window.toggleAppointmentPaidStatus | script.js, src/workspace/workspace-controller.js | no | no |
| window.toggleSecondaryActions | script.js, src/workspace/workspace-controller.js | no | no |
| window.renderAppointments | script.js, src/enterprise-dashboard.js, src/header/header-search.js | no | no |
| window.enterEditMode | script.js, src/workspace/workspace-controller.js | no | no |
| window.showNotification | script.js, src/workspace/workspace-controller.js | no | no |
| window.getOrCreateInvoiceForAppointment | script.js, src/workspace/workspace-controller.js | no | no |
| window.openInvoice | script.js | no | no |
| window.getAppointmentAmountGBP | script.js | no | no |
| window.callUsedOnce | script.js, src/workspace/workspace-controller.js | no | no |
| window.__TVX_UI_V2 | script.js | no | no |
| window.initEnterpriseHeaderControls | script.js | no | no |
| window.initWorkspacePanel | script.js, src/workspace/workspace-controller.js | no | no |
| window.__tvFilterAptsInitialized | script.js | no | no |
| window.__tvRenderAptsInitialized | script.js | no | no |
| window.updateAppointmentStats | script.js | no | no |
| window.openInvoiceForAppointment | script.js | no | no |
| window.__USE_MODULAR_STORAGE__ | script.js, src/app.js, src/storage/storage.page.js | no | no |
| window.tvInvLoadMore | script.js | no | no |
| window.openInvoiceFile | script.js, src/storage/storage.events.js | no | no |
| window.deleteInvoiceConfirm | script.js, src/storage/storage.events.js | no | no |
| window.openPDF | script.js | no | no |
| window.generateAndSaveInvoicePDF | script.js | no | no |
| window.handleRefreshInvoices | script.js, src/storage/storage.page.js | no | no |
| window.filterInvoices | script.js | no | no |
| window.toggleAppointmentDropdown | script.js | no | no |
| window.handleSignIn | src/app.js | no | no |
| window.handleSignOut | src/app.js | no | no |
| window.__tvFirebase | src/config/firebase.js, src/firebase/firebase.js | no | no |
| window.services | src/core/app.js | no | no |
| window.modalManager | src/core/app.js | no | no |
| window.appState | src/core/app.js | no | no |
| window.eventBus | src/core/app.js | no | no |
| window.__tvDebug | src/core/events.js | no | no |
| window.AppointmentsManager | src/data-layer/appointments-manager.js | no | no |
| window.appointmentsManager | src/data-layer/appointments-manager.js | no | no |
| window.AppointmentsUIRenderer | src/data-layer/appointments-ui.js | no | no |
| window.__DEBUG_DIAGNOSTICS | src/data-layer/index.js, src/data-layer/ui-updater.js | no | no |
| window.appointments | src/data-layer/index.js, src/enterprise-dashboard.js | no | no |
| window.allInvoices | src/data-layer/index.js | no | no |
| window.filterAppointments | src/data-layer/index.js | no | no |
| window.__tvCleanupFns | src/data-layer/index.js | no | no |
| window.appointmentsDebounceTimer | src/data-layer/index.js | no | no |
| window.Store | src/data-layer/index.js | no | no |
| window._dataLayer | src/data-layer/index.js | no | no |
| window._headerMetrics | src/data-layer/index.js | no | no |
| window.runWiringAudit | src/dev/runWiringAudit.js | no | no |
| window.enterpriseDashboard | src/enterprise-dashboard.js | no | no |
| window.__tvEmitPipelineDiag | src/header/header-metrics.js, src/metrics/dashboard-metrics.js, src/workspace/workspace-controller.js | no | no |
| window.debugInvoice | src/invoice.js | no | no |
| window.__tvDiagState | src/metrics/dashboard-metrics.js | no | no |
| window.__tvKpiDebugState | src/metrics/dashboard-metrics.js | no | no |
| window.__TV_DEBUG_KPI | src/metrics/dashboard-metrics.js | no | no |
| window.__tvLastDashboardMetrics | src/metrics/dashboard-metrics.js | no | no |
| window.getAppState | src/shared/state.js | no | no |
| window.rebuildInvoiceFromAppointment | src/storage/storage.events.js | no | no |
| window.toggleInvoicePaidStatus | src/storage/storage.events.js | no | no |
| window.__workspaceState | src/workspace/workspace-controller.js | no | no |
| window.setActiveWorkspace | src/workspace/workspace-controller.js | no | no |
| window.tvGroupLoadMore | src/workspace/workspace-controller.js | no | no |
| window.markInvoicePaid | src/workspace/workspace-controller.js | no | no |
| window.computeDashboardMetrics | verify-kpi-dashboard.js | no | no |
| window.renderDashboardMetrics | verify-kpi-dashboard.js | no | no |

## Appendix C: Closest-delegation sites (data-action dispatch points)

- script.js:7956 — `const btn = e.target.closest('button[data-action]');`
- src/core/events.js:9 — `const target = event.target.closest('[data-action][data-id]');`
- src/core/events.js:12 — `const noId = event.target.closest('[data-action]:not([data-id])');`
- src/invoice.js:1694 — `const actionEl = e.target.closest('[data-action]');`
- src/utils/notifications.js:212 — `const action = e.target.closest('[data-action]')?.dataset.action;`
- src/workspace/workspace-controller.js:387 — `const button = e.target.closest('[data-action]');`

## Appendix D: All duplicate function names (first 20)

Most duplicates are benign utility names. High-risk ones are covered in Section 5.

- `createInvoiceFromAppointment` — CHIPS_MODE_INTEGRATION.js:193, script.js:9175, src/invoice-create/invoiceCreate.flow.js:35
- `updateLiveIndicators` — index.html:4741, src/enterprise-dashboard.js:260
- `registerServiceWorker` — pwa-init.js:46, pwa.js:9
- `showUpdateNotification` — pwa-init.js:151, sw-update.js:82
- `setupInstallPrompt` — pwa-init.js:202, pwa.js:116
- `setupAppStateTracking` — pwa-init.js:228, pwa.js:147
- `isInstalledAsPWA` — pwa-init.js:243, pwa.js:67
- `getPWAInstallState` — pwa-init.js:265, pwa.js:89
- `getPlatform` — pwa-init.js:277, pwa.js:101
- `checkForUpdates` — pwa-init.js:293, sw-update.js:98
- `unregisterServiceWorker` — pwa-init.js:315, sw-update.js:121
- `renderScannedInvoiceReviewItems` — render_items_update.js:1, script.js:3496
- `tracedUpdateDoc` — script.js:235, src/invoice.js:63
- `formatCurrencyGBP` — script.js:320, src/core/chips-mode.js:644, src/shared/format.js:11
- `toNumber` — script.js:330, src/data-layer/formatters.js:41, src/invoice-create/invoiceCreate.ui.js:11, src/invoices/invoice-manager.js:24, src/metrics/dashboard-metrics.js:329, src/shared/format.js:21, src/storage/storage.events.js:18, src/storage/storage.service.js:12, src/storage/storage.ui.js:12
- `computePaymentStatus` — script.js:342, src/invoice.js:1590
- `escapeHtml` — script.js:592, src/core/chips-mode.js:622, src/invoice.js:1824
- `collectJobsPartsFromForm` — script.js:663, src/invoice-create/invoiceCreate.ui.js:31
- `buildJobsSummary` — script.js:938, src/invoice-create/invoiceCreate.ui.js:37
- `initializeFirebase` — script.js:986, src/core/app.js:22, src/invoice.js:1044
