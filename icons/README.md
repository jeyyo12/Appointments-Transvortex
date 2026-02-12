# Transvortex PWA Icons

This folder contains the icons required for the Progressive Web App (PWA).

## Required Icons

To complete the PWA setup, add the following PNG icons to this directory:

### Standard Icons (required)
- `icon-192x192.png` - For Android home screen (192x192 pixels)
- `icon-512x512.png` - For Android splash screen / app stores (512x512 pixels)

### Maskable Icons (recommended for adaptive icons on Android)
- `icon-maskable-192x192.png` - Maskable variant (192x192 pixels)
- `icon-maskable-512x512.png` - Maskable variant (512x512 pixels)

### Optional: Shortcuts Icon
- `icon-96x96.png` - For app shortcuts/quick actions menu (96x96 pixels)

### Optional: Screenshots (for app stores)
- `screenshot-540x720.png` - Portrait screenshot (540x720 pixels)
- `screenshot-1280x720.png` - Landscape screenshot (1280x720 pixels)

## How to Create Icons

### Option 1: Use a Design Tool
Use Adobe XD, Figma, or Canva to create icons based on the Transvortex logo:
- Import `../assets/images/Logo.png`
- Resize to required dimensions
- Add safe area padding (for maskable icons)
- Export as PNG

### Option 2: Use Online Tools
- https://www.favicon-generator.org/
- https://icon.kitchen/
- https://pwa-asset-generator.netlify.app/

### Option 3: Command Line (using ImageMagick)
```bash
# Generate icons from the logo
convert ../assets/images/Logo.png -background white -resize 192x192 icon-192x192.png
convert ../assets/images/Logo.png -background white -resize 512x512 icon-512x512.png
```

## Icon Design Guidelines

### For Adaptive Icons (Maskable)
Maskable icons should have:
- Safe zone: center 66x66 or 192x192 pixels (depending on size)
- Transparent background
- Logo/artwork should fit within safe zone
- Meaning should be preserved when displayed as a circle

### Colors
- Use Transvortex brand color: #FF7A18 (Orange)
- Dark backgrounds work well with white/light backgrounds
- Ensure good contrast for visibility

## Testing PWA Installation

Once icons are in place:

### Android
1. Open the app in Chrome
2. Tap menu (⋮) → "Install app"
3. Confirm installation

### iOS
1. Open app in Safari
2. Tap Share → "Add to Home Screen"
3. Name the app and add it

### Desktop/Windows
1. Use Chrome menu or Edge menu
2. Select "Install app"

## Lighthouse PWA Audit

Run Chrome DevTools Lighthouse to check PWA status:
1. Open app in Chrome
2. Press F12 → Lighthouse tab
3. Run PWA audit
4. Check "Installable" status

All icons should be properly cached and serve 200 status for PWA to pass.
