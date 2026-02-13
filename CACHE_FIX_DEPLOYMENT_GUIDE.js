// INVOICE CACHE FIX - DEPLOYMENT GUIDE
// =====================================
// Date: 2026-02-12
// Issue: Invoice page shows old UI after normal refresh, requires hard refresh for new UI
// Cause: Service Worker cache-first strategy serving stale assets

/**
 * CHANGES SUMMARY
 * ===============
 */

/*
1. SERVICE-WORKER.JS - Complete Caching Strategy Overhaul
   --------------------------------------------------------
   ✅ CACHE_VERSION bumped: '1.1' → '2026-02-12-01'
      - Forces immediate cache invalidation on deploy
      - Old cache 'transvortex-v1.1' deleted automatically
      - New cache 'transvortex-v2026-02-12-01' created
   
   ✅ NETWORK-FIRST for HTML files (invoice.html, index.html):
      - Tries network request FIRST
      - Falls back to cache only if network fails
      - Caches fresh HTML for offline use
      - RESULT: Normal refresh ALWAYS gets latest HTML
   
   ✅ STALE-WHILE-REVALIDATE for assets (CSS, JS, images):
      - Returns cached version immediately (fast)
      - Fetches fresh version in background
      - Updates cache with new version
      - RESULT: Fast load + automatic updates
   
   ✅ Added sw-update.js to precache list
      - Ensures update manager is always available

2. PWA.JS - Auto-Reload on Service Worker Update
   ------------------------------------------------
   ✅ Added 'controllerchange' listener:
      - Automatically reloads page when new SW activates
      - NO MORE MANUAL HARD REFRESH NEEDED
      - Happens seamlessly in background
   
   ✅ Changed 'activated' → 'installed' state check:
      - Sends SKIP_WAITING immediately when new SW installs
      - Forces new SW to take control faster

3. SW-UPDATE.JS - Centralized Update Manager (NEW FILE)
   -------------------------------------------------------
   ✅ Created reusable SW update handler:
      - Auto-registers service worker
      - Checks for updates every 60 seconds
      - Forces reload on controllerchange
      - Can be imported by any page
   
   ✅ Export functions for manual control:
      - checkForUpdates() - Manual update check
      - unregisterServiceWorker() - Debug helper
   
   ✅ Custom event 'swUpdateAvailable':
      - Can be used to show update notifications
      - Optional UI feedback

4. INVOICE.HTML - Cache Busting + Update Manager
   -----------------------------------------------
   ✅ Added version query strings:
      - invoice.css → invoice.css?v=2026-02-12-01
      - invoice.js → invoice.js?v=2026-02-12-01
      - Forces browser to treat as new files
   
   ✅ Imported sw-update.js in <head>:
      - Ensures update manager loads immediately
      - Handles SW updates automatically
*/

/**
 * HOW IT WORKS NOW
 * ================
 */

/*
SCENARIO 1: User visits invoice.html after deploy
--------------------------------------------------
1. Browser requests invoice.html
2. Service Worker intercepts (fetch handler)
3. SW detects HTML request → uses NETWORK-FIRST
4. SW fetches fresh invoice.html from server
5. Returns FRESH HTML to browser ✅
6. Caches fresh HTML for offline use
7. Browser requests invoice.css?v=2026-02-12-01
8. SW detects asset → uses STALE-WHILE-REVALIDATE
9. SW returns cached CSS (if exists), fetches fresh in background
10. Updates cache with fresh CSS
11. Same for invoice.js?v=2026-02-12-01
12. RESULT: User sees NEW UI immediately ✅

SCENARIO 2: User refreshes invoice.html (normal F5)
----------------------------------------------------
1. Browser requests invoice.html
2. SW uses NETWORK-FIRST → fetches from server
3. Returns FRESH HTML ✅
4. CSS/JS requests include version query strings
5. SW serves them with stale-while-revalidate
6. RESULT: Consistent NEW UI, no mixed versions ✅

SCENARIO 3: New service worker deployed
----------------------------------------
1. User visits site, sw-update.js loads
2. SW registration checks for updates
3. Finds new service-worker.js on server
4. Downloads new SW, triggers 'updatefound'
5. New SW installs, sw-update.js sends SKIP_WAITING
6. New SW activates immediately
7. 'controllerchange' event fires
8. sw-update.js reloads page automatically
9. Fresh page load with new SW + new assets ✅
10. RESULT: Seamless update, no user action needed ✅

SCENARIO 4: Offline user (airplane mode)
------------------------------------------
1. Browser requests invoice.html
2. SW tries NETWORK-FIRST
3. Network fails (offline)
4. SW falls back to cached invoice.html
5. Serves last cached version
6. RESULT: Offline support maintained ✅
*/

/**
 * TESTING CHECKLIST
 * =================
 */

/*
✅ Test 1: Normal Refresh Shows New UI
   1. Deploy changes to server
   2. Visit invoice.html in browser
   3. Note current UI version
   4. Make CSS change (e.g., change a color)
   5. Deploy updated CSS
   6. Press F5 (normal refresh)
   7. VERIFY: New CSS applied immediately
   8. PASS: No hard refresh needed ✅

✅ Test 2: Service Worker Update Auto-Reload
   1. Visit invoice.html
   2. Open DevTools Console
   3. Change CACHE_VERSION in service-worker.js
   4. Deploy to server
   5. Wait ~60 seconds (auto-update check)
   6. VERIFY: Console shows "[SW Update] New service worker found"
   7. VERIFY: Page reloads automatically
   8. VERIFY: Console shows new CACHE_VERSION
   9. PASS: Automatic update works ✅

✅ Test 3: Cache Busting Query Strings
   1. Open invoice.html
   2. Open DevTools Network tab
   3. Refresh page
   4. VERIFY: invoice.css?v=2026-02-12-01 in Network tab
   5. VERIFY: invoice.js?v=2026-02-12-01 in Network tab
   6. PASS: Versioned assets loaded ✅

✅ Test 4: Old Cache Cleanup
   1. Open DevTools → Application → Cache Storage
   2. VERIFY: Only 'transvortex-v2026-02-12-01' exists
   3. VERIFY: 'transvortex-v1.1' deleted
   4. PASS: Old caches removed ✅

✅ Test 5: Offline Support Still Works
   1. Visit invoice.html (online)
   2. Wait for assets to cache
   3. Open DevTools → Network → Throttling → Offline
   4. Refresh page
   5. VERIFY: Invoice still displays
   6. VERIFY: Last cached version shown
   7. PASS: Offline mode functional ✅

✅ Test 6: Mixed Version Prevention
   1. Deploy new CSS + new HTML together
   2. Clear browser cache (Ctrl+Shift+Del)
   3. Visit invoice.html
   4. VERIFY: HTML and CSS match (same version)
   5. VERIFY: No old CSS with new HTML
   6. PASS: Versions consistent ✅
*/

/**
 * DEPLOYMENT STEPS
 * ================
 */

/*
STEP 1: Increment Version for Future Deploys
   - When making changes, update CACHE_VERSION
   - Format: 'YYYY-MM-DD-NN' (NN = deploy # that day)
   - Also update query strings in invoice.html
   - Example:
     const CACHE_VERSION = '2026-02-13-01';
     <link href="./styles/invoice.css?v=2026-02-13-01">

STEP 2: Deploy All Files Together
   ✅ service-worker.js (CRITICAL - deploy first)
   ✅ sw-update.js (new file)
   ✅ pwa.js (updated)
   ✅ invoice.html (updated)
   ✅ styles/invoice.css (if changed)
   ✅ src/invoice.js (if changed)

STEP 3: Verify Deployment
   1. Visit invoice.html
   2. Hard refresh once (Ctrl+F5) to get new SW
   3. Check Console for "[SW Update] Service Worker registered"
   4. Check Console for new CACHE_VERSION
   5. Verify new UI displays

STEP 4: Monitor Auto-Update
   1. Wait 60 seconds (auto-update check runs)
   2. If new SW deployed, page auto-reloads
   3. Check Console for update messages
   4. Verify users get updates automatically

STEP 5: Test Normal Refresh
   1. Normal refresh (F5) multiple times
   2. VERIFY: New UI always shows
   3. VERIFY: No stale cached assets
   4. VERIFY: No hard refresh needed
*/

/**
 * TROUBLESHOOTING
 * ===============
 */

/*
PROBLEM: Still seeing old UI after normal refresh
SOLUTION:
   1. Check CACHE_VERSION was updated
   2. Check query strings in invoice.html updated
   3. Hard refresh ONCE (Ctrl+F5) to register new SW
   4. Check DevTools → Application → Service Workers
   5. Click "Update" to force registration
   6. Verify new SW is "activated"
   7. Clear all caches manually if needed
   8. Unregister old SW if still present

PROBLEM: Page keeps auto-reloading
SOLUTION:
   1. This happens when new SW is deployed while testing
   2. Normal behavior during development
   3. In production, happens once per deploy
   4. To disable during dev: comment out controllerchange listener
   5. Or use DevTools → Disable cache + Update on reload

PROBLEM: Offline mode broken
SOLUTION:
   1. Check Network tab for failed requests
   2. Verify assets in ASSETS_TO_CACHE array
   3. Check Cache Storage for missing files
   4. Verify SW fetch handler returns cache on network fail
   5. Test online first, then offline

PROBLEM: Mixed old/new assets (old CSS, new HTML)
SOLUTION:
   1. Verify query string versions match
   2. Check Network tab for actual URLs loaded
   3. Ensure CACHE_VERSION updated
   4. Clear all caches and hard refresh
   5. Verify stale-while-revalidate updates cache

PROBLEM: Update not detected automatically
SOLUTION:
   1. Wait 60 seconds (update check interval)
   2. Or close/reopen tab to trigger check
   3. Or manually run: registration.update()
   4. Check Console for "[SW Update] Update check completed"
   5. Verify new service-worker.js exists on server
*/

/**
 * DEVELOPMENT MODE
 * ================
 */

/*
DISABLE CACHING DURING DEVELOPMENT:
1. DevTools → Application → Service Workers
2. Check "Update on reload"
3. Check "Bypass for network" (optional)
4. Or unregister SW completely during dev

FORCE UPDATE DURING TESTING:
1. Open Console
2. Run: navigator.serviceWorker.getRegistration().then(r => r.update())
3. Or click "Update" in DevTools → Application → Service Workers

VIEW CACHED ASSETS:
1. DevTools → Application → Cache Storage
2. Click "transvortex-v2026-02-12-01"
3. See all cached files
4. Right-click to delete individual files

UNREGISTER SERVICE WORKER:
1. DevTools → Application → Service Workers
2. Click "Unregister"
3. Or run: navigator.serviceWorker.getRegistration().then(r => r.unregister())
4. Hard refresh to start fresh
*/

/**
 * FUTURE IMPROVEMENTS (Optional)
 * ==============================
 */

/*
1. Add update notification UI:
   - Listen to 'swUpdateAvailable' event
   - Show toast: "Update available, refreshing..."
   - Gives user feedback during auto-reload

2. Add "Check for updates" button:
   - Import { checkForUpdates } from './sw-update.js'
   - Call on button click
   - Show "Update found" or "Already up to date"

3. Add version display in footer:
   - Show CACHE_VERSION to users
   - Helps verify deployment success
   - Example: "v2026-02-12-01"

4. Implement workbox (advanced):
   - Google's SW library
   - More strategies available
   - Better debugging tools
   - Easier configuration

5. Add SW lifecycle UI:
   - Show when new SW is installing
   - Show when activation happens
   - Show when update completes
   - Better user experience
*/

// END OF GUIDE
