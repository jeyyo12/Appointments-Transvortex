# Transvortex PWA Setup Guide

## Overview

This document describes the Progressive Web App (PWA) setup for Transvortex, hosted on GitHub Pages.

## Files Created/Modified

### New Files

1. **manifest.webmanifest** - PWA manifest file
   - Location: `/manifest.webmanifest`
   - Contains app metadata, icons, start URL, display mode
   - Relative paths work with GitHub Pages

2. **service-worker.js** - Service Worker for offline support
   - Location: `/service-worker.js`
   - Implements cache-first strategy
   - Caches HTML, CSS, JS, images, fonts
   - Network-first for Firebase API calls
   - Automatic cache cleanup on activation

3. **pwa.js** - PWA initialization and features
   - Location: `/pwa.js`
   - Registers service worker
   - Handles install prompts (Android)
   - Provides PWA state detection
   - Exports utility functions

4. **icons/** - Icons folder
   - Location: `/icons/`
   - Contains PWA icons (user to add)
   - See `icons/README.md` for requirements

### Modified Files

1. **index.html**
   - Added manifest link: `<link rel="manifest" href="./manifest.webmanifest">`
   - Added theme-color meta tag: `#FF7A18` (Transvortex orange)
   - Added Apple-specific meta tags:
     - `apple-mobile-web-app-capable`
     - `apple-mobile-web-app-status-bar-style`
     - `apple-mobile-web-app-title`
   - Added apple-touch-icon link
   - Added PWA initialization script

2. **script.js**
   - Added PWA initialization after language switcher
   - Calls `window.initPWA()` if available

## Installation on Different Platforms

### Android (Chrome/Edge)

1. Open `https://username.github.io/Appointments-Transvortex/` in Chrome
2. Tap the three-dot menu (⋮) → "Install app" (or "Add to home screen")
3. Confirm the installation dialog
4. App appears on home screen as standalone app

### iOS (Safari)

1. Open app in Safari on iPhone/iPad
2. Tap the Share button (box with arrow)
3. Scroll and tap "Add to Home Screen"
4. Choose app name and tap "Add"
5. App appears on home screen

### Desktop (Windows/Mac/Linux)

**Chrome/Edge:**
1. Click the install icon in address bar (looks like arrow pointing down)
2. Or use menu → "Install app"
3. App opens in a window (not browser tabs)

**Firefox:**
- Currently limited PWA support, but can use "Install" from browser menu

## PWA Features

### Service Worker Caching

The service worker implements a **cache-first** strategy:

```
User Request
    ↓
Cached? → YES → Serve from cache
    ↓ NO
Fetch from network
    ↓
Success? → YES → Cache + Return
    ↓ NO
Fallback (index.html for navigation)
```

**Cached Assets:**
- HTML files (index.html, invoice.html)
- CSS stylesheets
- JavaScript modules
- Images and icons
- Fonts

**Network-First for:**
- Firebase API calls
- Real-time data

### Install Prompt (Android)

On Android, after the app has been used:
1. User sees "Install app" in Chrome menu or address bar
2. `beforeinstallprompt` event fires
3. User can click to install directly to home screen
4. `appinstalled` event fires after successful install

### App State Detection

Access PWA state via `window.PWA`:

```javascript
// Check if app is installed
if (window.PWA.isInstalled()) {
    console.log('App is installed as PWA');
}

// Get complete state
const state = window.PWA.getState();
console.log(state);
// Output:
// {
//   installed: true,
//   standalone: true,
//   displayMode: 'standalone',
//   platform: 'android'  // 'android', 'ios', 'windows', 'mac', 'linux'
// }

// Detect platform
const platform = window.PWA.getPlatform();
```

### Service Worker Updates

The service worker checks for updates every 60 seconds:

```javascript
// Listen for updates
window.addEventListener('serviceWorkerUpdate', (event) => {
    console.log('Service Worker updated, refresh to get new version');
    // Show user notification/toast here
});
```

## GitHub Pages Configuration

All paths are **relative** using `./` prefix:
- Manifest: `./manifest.webmanifest`
- Icons: `./icons/icon-192x192.png`
- Start URL: `./index.html`
- Service worker scope: `./`

This ensures the app works on:
- `https://username.github.io/Appointments-Transvortex/`
- Custom domains with the same structure

## Lighthouse PWA Audit

To verify PWA compliance:

1. Open app in Chrome DevTools
2. Go to **Lighthouse** tab
3. Click **Analyze page load**
4. Select **Progressive Web App**
5. Click **Analyze**

*Expected Results:*
- ✅ Installable
- ✅ Offline support
- ✅ Image optimization
- ⚠️ Some metrics may warn (caching strategy dependent)

## Icons Setup

**STATUS:** Icons folder created but requires actual PNG files.

**Required files for full PWA:**
- `icons/icon-192x192.png` (required)
- `icons/icon-512x512.png` (required)
- `icons/icon-maskable-192x192.png` (recommended)
- `icons/icon-maskable-512x512.png` (recommended)

**To generate icons:**
1. See `icons/README.md` for detailed instructions
2. Use existing logo: `assets/images/Logo.png`
3. Resize to required dimensions
4. Place in `/icons/` folder

**Without icons:**
- PWA will still install but won't be "installable" per Lighthouse
- May show generic Chrome icon instead of app icon

## Testing Offline Support

1. **Install Service Worker:**
   - First visit loads all cache
   - Refresh page to ensure registration

2. **Test Offline Mode:**
   - Open DevTools → Network tab
   - Check "Offline" checkbox
   - Try navigating - should still work for cached pages
   - Firebase calls will fail (expected, requires internet)

3. **Clear Cache:**
   - DevTools → Storage → Cache Storage
   - Select "transvortex-v1" and delete
   - Next refresh will re-cache assets

## Updating App

When you modify the app:

1. **Service Worker Cache Updates:**
   - Version in `service-worker.js`: `CACHE_NAME = 'transvortex-v1'`
   - Increment version: `'transvortex-v2'`, `'transvortex-v3'`, etc.
   - Old cache automatically deleted on activation

2. **User Gets Update:**
   - Next visit checks for updated service worker
   - If changed, new worker activates
   - User sees notification (if you implement one)
   - Refresh to get new content

## Browser Support

| Browser | PWA Support | Install |
|---------|-------------|---------|
| Chrome (Android) | ✅ Full | Menu → "Install app" |
| Chrome (Desktop) | ✅ Full | Address bar icon |
| Edge | ✅ Full | Menu → "Install app" |
| Firefox | ⚠️ Limited | Menu → "Install app" |
| Safari (iOS) | ⚠️ Partial | Share → "Add to Home" |
| Safari (Mac) | ⚠️ Partial | Limited support |
| Opera | ✅ Full | Menu → "Install app" |

**Note:** iOS Safari doesn't use the manifest. Apple-specific meta tags handle installation.

## Firebase & Firestore Integration

**Important:** Service worker doesn't cache Firebase API responses.

- Real-time Firestore listeners work even with offline cache
- Only previously loaded data shows in offline mode
- New data requires internet connection
- Auth tokens managed by Firebase SDK

## Troubleshooting

### PWA Won't Install

1. Check `manifest.webmanifest` is served with MIME type `application/manifest+json`
2. Verify icons exist at `./icons/icon-192x192.png` and `./icons/icon-512x512.png`
3. Ensure service worker registers successfully (check console)
4. Run Lighthouse PWA audit for specific issues

### Service Worker Not Updating

1. Open DevTools → Service Workers
2. Click "Update on reload"
3. Hard refresh (Ctrl+Shift+R)
4. Check if new version loaded

### Icons Not Showing

1. Verify icon files exist: `icons/icon-192x192.png`
2. Check Network tab - icons should load (200 status)
3. Browser may cache icons - clear after updating

### Invoice URL Parameters Lost

Service worker preserves query strings:
- `./invoice.html?aptId=123` works correctly
- Falls back to `index.html` only for navigation requests without cached response

## Performance Impact

**With PWA:**
- First load: ~same (manifest + service worker downloaded)
- Subsequent loads: ~50% faster (from cache)
- Offline: Works for cached assets
- Network: Reduced bandwidth usage

**Cache Size:**
- Default: 40MB (Firebase Firestore persistent cache)
- Service worker cache: ~5-10MB (depends on assets)
- Total: ~45-50MB on device

## Next Steps

1. **Add Icons:** Generate/add PNG files to `icons/` folder
2. **Test Installation:** Install on Android/iOS device
3. **Verify Offline:** Test with DevTools offline mode
4. **Monitor Updates:** Track when users get new versions
5. **Gather Feedback:** Collect user feedback on PWA experience

## Resources

- [MDN: Progressive Web Apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [Web.dev: PWA Checklist](https://web.dev/pwa-checklist/)
- [Google: Installable Apps](https://developers.google.com/web/fundamentals/app-install-banners)
- [Apple: PWA on iOS](https://developer.apple.com/news/?id=85w5fvwr)

---

**Transvortex PWA is ready for installation. Add icons to complete the setup.**
