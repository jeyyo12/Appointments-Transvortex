# Wiring Audit Report

_Generated: 2026-02-27T20:16:01.474Z — files scanned: 85_

> **Definition of Done:** Real broken candidates = 0 · Unmapped actions = 0 · Invoice violations = 0 · Runtime smoke test passes

## 1. Summary Metrics

| Metric | Count | Target | Status |
| --- | --- | --- | --- |
| 🔴 REAL broken wiring candidates | 0 | 0 | ✅ |
| 🔵 Likely false positives (informational) | 37 | — | ℹ️ Review if needed |
| 🟡 Unmapped data-action values | 0 | 0 | ✅ |
| 🟠 Invoice param violations | 0 | 0 | ✅ |
| 🔁 High-risk duplicate functions (informational) | 0 | — | ℹ️ Review if needed |
| Wiring completeness estimate | ~100% | 100% |  |

**Total controls:** 97  |  **unique data-action values:** 33  |  **inline onclick:** 44  |  **window.* exports:** 141


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
| script.js | 4942 | js | invoiceId=${encodeURIComponent(invoiceId)}, mode=view |
| script.js | 10749 | js | invoiceId=${invoiceId}, mode=edit |
| script.js | 11063 | js | invoiceId=${invoiceId}, mode=view |
| script.js | 11082 | js | invoiceId=${invoiceId}, mode=edit |
| src/invoices/invoice-manager.js | 681 | js | invoiceId=${invoiceId}, mode=${mode} |
| src/storage/storage.events.js | 132 | js | invoiceId=${targetInvoiceId}, mode=view |
| src/storage/storage.events.js | 140 | js | invoiceId=${targetInvoiceId}, mode=view |
| src/storage/storage.events.js | 160 | js | invoiceId=${canonicalInvoiceId}, mode=view |
| src/storage/storage.events.js | 163 | js | invoiceId=${targetInvoiceId}, mode=view |

### 3d. openInvoice* function call sites

**Search command:** `rg "openInvoice" -n src/`


| File | Line | Function |
| --- | --- | --- |
| script.js | 4940 | openInvoice |
| script.js | 10574 | openInvoiceForAppointment |
| script.js | 10579 | openInvoice |
| script.js | 10621 | openInvoiceFromAppointment |
| script.js | 10627 | openInvoice |
| script.js | 10648 | openInvoice |
| script.js | 11041 | openInvoiceFile |
| src/invoice-create/invoiceCreate.flow.js | 48 | openInvoice |
| src/invoice-create/invoiceCreate.flow.js | 150 | openInvoice |
| src/invoices/invoice-manager.js | 676 | openInvoicePage |
| src/invoices/invoice-manager.js | 684 | openInvoice |
| src/storage/storage.events.js | 125 | openInvoiceFile |
| src/storage/storage.ui.js | 379 | openInvoiceFile |

### 3e. Invoice number generators (duplicate risk)

⚠️  4 definitions found — keep only the canonical one in `src/invoices/invoice-manager.js`.

| File | Line | Function |
| --- | --- | --- |
| script.js | 10542 | generateInvoiceNumberStable |
| script.js | 10610 | generateInvoiceNumberLegacy |
| src/invoice.js | 345 | generateInvoiceNumberStandalone |
| src/invoices/invoice-manager.js | 18 | generateInvoiceNumber |

## 4. Likely False Positives — Do NOT Fix Unless Proven

These items were flagged by the element scanner but are expected behavior in this repo.

Verify before making any changes to items listed here.


### 4a. Non-item-scoped or exempt-file data-action missing data-id

Count: **37**

These live in: modal dialogs, invoice.html, chips / search / filter controls, offline.html.

They use *local* event delegation that only needs `data-action` (no `data-id` required).

| File | Action | Why likely OK |
| --- | --- | --- |
| index.html | notif-mark-all | Non-item-scoped action (global/filter/chip) |
| index.html | notif-clear | Non-item-scoped action (global/filter/chip) |
| index.html | set-service-location | Non-item-scoped action (global/filter/chip) |
| index.html | set-service-location | Non-item-scoped action (global/filter/chip) |
| index.html | set-contact-pref | Non-item-scoped action (global/filter/chip) |
| index.html | set-contact-pref | Non-item-scoped action (global/filter/chip) |
| index.html | set-contact-pref | Non-item-scoped action (global/filter/chip) |
| index.html | set-contact-pref | Non-item-scoped action (global/filter/chip) |
| index.html | cleanup-duplicates | Non-item-scoped action (global/filter/chip) |
| index.html | refresh-invoices | Non-item-scoped action (global/filter/chip) |
| index.html | time-now | Non-item-scoped action (global/filter/chip) |
| index.html | time-cancel | Non-item-scoped action (global/filter/chip) |
| index.html | time-ok | Non-item-scoped action (global/filter/chip) |
| invoice.html | add-service | Exempt file (local delegation, no bindActionDelegation) |
| invoice.html | add-part | Exempt file (local delegation, no bindActionDelegation) |
| invoice.html | mark-paid | Exempt file (local delegation, no bindActionDelegation) |
| invoice.html | clear-payment | Exempt file (local delegation, no bindActionDelegation) |
| invoice.html | save-draft | Exempt file (local delegation, no bindActionDelegation) |
| invoice.html | cancel-edit | Exempt file (local delegation, no bindActionDelegation) |
| script.js | notif-tab | Non-item-scoped action (global/filter/chip) |
| script.js | notif-tab | Non-item-scoped action (global/filter/chip) |
| script.js | notif-tab | Non-item-scoped action (global/filter/chip) |
| script.js | close | Non-item-scoped action (global/filter/chip) |
| script.js | cancel | Non-item-scoped action (global/filter/chip) |
| script.js | save | Non-item-scoped action (global/filter/chip) |
| script.js | close | Non-item-scoped action (global/filter/chip) |
| src/core/chips-mode.js | add-preset-chip | Non-item-scoped action (global/filter/chip) |
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

Dead buttons: **0** · Scroll-jumps: **0** · Suspicious navigation: **0**


### 6a. Dead Buttons

Controls that look interactive (by class naming) but have no `data-action`, `onclick`, or `href`.

✅ None found.


### 6b. Scroll Jumps

Patterns that may trigger unexpected jump/scroll behavior (`href="#..."`, `location.hash=`, `scrollIntoView`, `scrollTo`).

✅ None found.


### 6c. Suspicious Navigation

Navigation to `.html` routes without query params (excluding `index.html`) that may miss required context.

✅ None found.


## Appendix A: All data-action values and occurrence counts

| Action | Occurrences |
| --- | --- |
| close | 5 |
| cancel | 5 |
| set-contact-pref | 4 |
| notif-tab | 3 |
| toggle-paid | 3 |
| confirm | 3 |
| set-service-location | 2 |
| notif-open | 2 |
| invoice | 2 |
| notif-mark-all | 1 |
| notif-clear | 1 |
| cleanup-duplicates | 1 |
| refresh-invoices | 1 |
| time-now | 1 |
| time-cancel | 1 |
| time-ok | 1 |
| add-service | 1 |
| add-part | 1 |
| mark-paid | 1 |
| clear-payment | 1 |
| save-draft | 1 |
| cancel-edit | 1 |
| ${item.read ?  | 1 |
| notif-dismiss | 1 |
| complete-job | 1 |
| start-job | 1 |
| call | 1 |
| visit | 1 |
| toggle-secondary | 1 |
| edit | 1 |
| delete | 1 |
| save | 1 |
| add-preset-chip | 1 |

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
| window.__tvDebug | script.js, src/app.js, src/core/events.js, src/storage/storage.page.js, src/workspace/workspace-controller.js | no | no |
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
| window.TVX_NOTIF_DEBUG | script.js | no | no |
| window.ALERTS_DEBUG | script.js | no | no |
| window.TVX_DEBUG_ALERTS | script.js | no | no |
| window.isAlertsOpen | script.js | no | no |
| window.addNotification | script.js | no | no |
| window.getNotifications | script.js | no | no |
| window.markRead | script.js | no | no |
| window.markAllRead | script.js | no | no |
| window.clearNotifications | script.js | no | no |
| window.unreadCount | script.js | no | no |
| window.TVX_SCROLL_DEBUG | script.js, src/core/chips-mode.js, src/enterprise-dashboard.js, src/header/header-search.js, src/ui/form-stepper.js, src/utils/notifications.js | no | no |
| window.__TVX_USER_NAV | script.js, src/enterprise-dashboard.js, src/header/header-search.js | no | no |
| window.openInvoice | script.js | no | no |
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
| window.getAppointmentAmountGBP | script.js | no | no |
| window.callUsedOnce | script.js, src/workspace/workspace-controller.js | no | no |
| window.__TVX_UI_V2 | script.js | no | no |
| window.initEnterpriseHeaderControls | script.js | no | no |
| window.initWorkspacePanel | script.js, src/workspace/workspace-controller.js | no | no |
| window.__tvTimePickerTestsRan | script.js | no | no |
| window.TVX_DEBUG_VEHICLE | script.js, src/invoice.js | no | no |
| window._syncServiceLocationUI | script.js | no | no |
| window._syncContactPrefUI | script.js | no | no |
| window._showLocPanel | script.js | no | no |
| window._resetVehicleLookupUI | script.js | no | no |
| window.__tvxLastDvsaVehicle | script.js | no | no |
| window.__tvFilterAptsInitialized | script.js | no | no |
| window.__tvRenderAptsInitialized | script.js | no | no |
| window.TVX_DVSA_DEBUG | script.js, src/invoice.js, src/invoices/invoice-manager.js | no | no |
| window.TVX_MILES_DEBUG | script.js | no | no |
| window.__tvxDvsaLookupWarnedMissing | script.js | no | no |
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
| window.__TVX_APP_STARTED | src/app.js | no | no |
| window.handleSignIn | src/app.js | no | no |
| window.handleSignOut | src/app.js | no | no |
| window.__tvFirebase | src/config/firebase.js, src/firebase/firebase.js | no | no |
| window.services | src/core/app.js | no | no |
| window.modalManager | src/core/app.js | no | no |
| window.appState | src/core/app.js | no | no |
| window.eventBus | src/core/app.js | no | no |
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
| window.INVOICE_VEHICLE_DEBUG | src/invoice.js | no | no |
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

- script.js:4897 — `const action = e.target.closest('[data-action]')?.dataset.action || '';`
- script.js:8770 — `const btn = e.target.closest('button[data-action]');`
- src/core/events.js:9 — `const target = event.target.closest('[data-action]');`
- src/invoice.js:1920 — `const actionEl = e.target.closest('[data-action]');`
- src/utils/notifications.js:224 — `const action = e.target.closest('[data-action]')?.dataset.action;`
- src/workspace/workspace-controller.js:387 — `const button = e.target.closest('[data-action]');`

## Appendix D: All duplicate function names (first 20)

Most duplicates are benign utility names. High-risk ones are covered in Section 5.

- `createInvoiceFromAppointment` — CHIPS_MODE_INTEGRATION.js:193, script.js:10637, src/invoice-create/invoiceCreate.flow.js:35
- `updateLiveIndicators` — index.html:5340, src/enterprise-dashboard.js:260
- `registerServiceWorker` — pwa-init.js:46, pwa.js:9
- `showUpdateNotification` — pwa-init.js:151, sw-update.js:82
- `setupInstallPrompt` — pwa-init.js:202, pwa.js:116
- `setupAppStateTracking` — pwa-init.js:228, pwa.js:147
- `isInstalledAsPWA` — pwa-init.js:243, pwa.js:67
- `getPWAInstallState` — pwa-init.js:265, pwa.js:89
- `getPlatform` — pwa-init.js:277, pwa.js:101
- `checkForUpdates` — pwa-init.js:293, sw-update.js:98
- `unregisterServiceWorker` — pwa-init.js:315, sw-update.js:121
- `renderScannedInvoiceReviewItems` — render_items_update.js:1, script.js:3524
- `isTvxDebugEnabled` — script.js:120, src/app.js:25, src/storage/storage.page.js:23
- `tracedUpdateDoc` — script.js:243, src/invoice.js:63
- `formatCurrencyGBP` — script.js:328, src/core/chips-mode.js:957, src/shared/format.js:11
- `toNumber` — script.js:338, src/data-layer/formatters.js:41, src/invoice-create/invoiceCreate.ui.js:11, src/invoices/invoice-manager.js:24, src/metrics/dashboard-metrics.js:329, src/shared/format.js:21, src/storage/storage.events.js:18, src/storage/storage.service.js:12, src/storage/storage.ui.js:12
- `computePaymentStatus` — script.js:350, src/invoice.js:1816
- `escapeHtml` — script.js:600, src/core/chips-mode.js:935, src/invoice.js:2050
- `collectJobsPartsFromForm` — script.js:671, src/invoice-create/invoiceCreate.ui.js:31
- `buildJobsSummary` — script.js:966, src/invoice-create/invoiceCreate.ui.js:37
