# Transvortex LTD - Appointments & Invoice Manager

A Firebase-based web application for managing appointments, invoices, and storage workflows for Transvortex LTD.

## 🚀 Quick Start (Local Development)

1. Open `index.html` in a web browser
2. Sign in with Google authentication
3. Manage appointments, create invoices, and track storage records

## 📡 Deployment to Production

**See `PRODUCTION_DEPLOYMENT_CHECKLIST.md` for complete deployment guide.**

### Key Deployment Points:
- ✅ All static assets use relative paths (`./icons/`, `./styles/`, etc.)
- ✅ Service Worker caching: Update `CACHE_NAME` when assets change
- ✅ PWA icons in `/icons/` folder (must be committed to repo)
- ✅ Logo in `/Logo/` folder (header branding)
- ✅ Works on GitHub Pages, Hostinger, and standard static hosting

**Quick Checklist:**
1. Icon paths: `./icons/favicon-32x32.png` ✅
2. Service Worker: `/service-worker.js` at root ✅
3. Bump cache version if CSS/JS/icons change ✅
4. Hard refresh deployed app after push ✅
5. Test PWA install on Android & iOS ✅

---

## 📁 Project Structure

```
Appointments-Transvortex/
├── index.html                    # Main application
├── invoice.html                  # Invoice page
├── offline.html                  # Offline fallback
├── script.js                     # Main app logic
├── service-worker.js             # PWA worker (cache strategy)
├── manifest.json                 # PWA manifest (fallback)
├── manifest.webmanifest          # PWA manifest (primary)
├── src/                          # JavaScript modules
│   ├── app.js                    # Modular app init
│   ├── invoice.js                # Invoice renderer
│   ├── config/                   # Firebase config
│   ├── core/                     # Core features
│   ├── services/                 # Business logic
│   ├── storage/                  # Invoice storage
│   └── utils/                    # Utilities
├── styles/                       # All CSS files
│   ├── design-system.css
│   ├── appointments.css
│   ├── invoice.css
│   ├── modal.css
│   └── ...
├── icons/                        # PWA icons (9 files - MUST COMMIT)
│   ├── icon-192x192.png          # Android PWA
│   ├── icon-512x512.png          # Android splash
│   ├── apple-touch-icon.png      # iOS home screen
│   └── favicon-*.png             # Browser tabs
└── Logo/                         # Brand assets
    ├── transvortex.png           # Header logo
    ├── gif.gif                   # Animated character
    └── ...
```

## 🔑 Features

- **Appointments:** Create, edit, finalize, and delete appointments
- **Invoices:** Generate professional invoices with PDF export
- **Admin:** Two-tier admin system with full access control
- **Responsive:** Mobile-first design with horizontal appointment cards
- **PWA:** Progressive Web App install on Android & iOS
- **Offline:** Basic offline page (via Service Worker)

## 🛠️ Technologies

- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3
- **Backend:** Firebase (Firestore, Authentication)
- **PWA:** Service Worker, Web App Manifest
- **Styling:** Responsive CSS with clamp(), custom design system
- **Icons:** Font Awesome 6.4.0, custom PWA icons

## 📝 Configuration

Firebase configuration is embedded in `src/config/firebase.config.js`. To use with your own Firebase project:

1. Create a Firebase project at https://console.firebase.google.com
2. Enable Google Authentication + Firestore
3. Update `FIREBASE_CONFIG` in `src/config/firebase.config.js`
4. Update `ADMIN_UIDS` array with your admin user IDs

## 🎨 Recent Updates (February 2026)

- ✅ **Production Optimization**: Fixed icon paths for deployed versions
- ✅ **Service Worker**: Enhanced cache strategy with version bumping
- ✅ **Manifest Files**: Unified PWA configuration across platforms
- ✅ **Header Branding**: Logo image replaces "Transvortex ADMIN" text
- ✅ **Local ↔ Deployed Parity**: All asset references now relative paths

## 📖 Documentation

**⭐ DEPLOYMENT GUIDE:**
- `PRODUCTION_DEPLOYMENT_CHECKLIST.md` ← **READ THIS BEFORE DEPLOYING**

**Project History:**
- `CLEANUP_REPORT.md` - Project reorganization
- `_archive_unused/` - Archived documentation and removed files

## 🧪 Testing Before Deployment

### Local Testing (Chrome DevTools):
```
1. Open DevTools (F12)
2. Application > Service Workers → Check registration
3. Application > Manifest → Verify icon paths use ./icons/
4. Network tab → Reload page, check no 404 errors
5. Console → Check no ERROR or WARN logs
```

### Mobile Testing (iOS/Android):
```
1. Install app to home screen
2. Launch from home screen icon
3. Verify app icon displays correctly
4. Check offline page appears when no network
5. Hard refresh → Verify updates load
```

## ⚠️ Critical Production Rules

| Rule | Status | Why |
|------|--------|-----|
| Use `./` relative paths, not `/` absolute | ✅ | GitHub Pages & relative hosting |
| Icons in `/icons/`, not `/Logo/` | ✅ | Case-sensitive Linux servers |
| Service Worker at root `/service-worker.js` | ✅ | PWA scope requirement |
| Update `CACHE_NAME` on asset changes | ✅ | Force cache invalidation |
| Commit `/icons/` folder to repo | ✅ | Must deploy all icon files |

## 📄 License

See LICENSE file for details.

---

**Transvortex LTD** - Professional automotive services 🇬🇧  
**Status**: ✅ Production-Ready (February 2026)
