# Admin Intro Video Setup

## Overview
The admin intro animation system is ready. Replace this placeholder with an actual Transvortex LTD admin branding video.

## Current Setup
- **Location**: `/Logo/admin-intro.mp4` (or similar)
- **Duration**: 2 seconds (approximately)
- **Format**: MP4 or WebM (supported by all modern browsers)
- **Audio**: None (muted for autoplay + iOS compatibility)
- **Resolution**: 1080p or higher recommended

## How to Set Video Source

### Option 1: Update video.src in HTML
Edit `index.html`, line ~3044:
```html
<video 
    id="adminIntroVideo"
    ...
    src="./Logo/admin-intro.mp4">
</video>
```

### Option 2: Update JavaScript fallback
Edit `script.js` in `showAdminIntroAnimation()` function (around line 895):
```javascript
if (!video.src) {
    video.src = './Logo/admin-intro.mp4';
}
```

## Video Specifications
- **Format**: H.264 MP4 (best compatibility) or WebM
- **Codec**: H.264 video, AAC audio (or Vorbis for WebM)
- **Dimensions**: 1920×1080 px minimum (will scale responsively)
- **Duration**: ~2 seconds (shown before morphing to header)
- **Audio**: Mute or silent (required for iOS autoplay)
- **Frame Rate**: 24-30 fps

## Browser Compatibility
- ✅ Chrome/Edge (desktop & Android)
- ✅ Safari (desktop & iOS) - requires muted, playsinline, autoplay
- ✅ Firefox

## Testing
1. Log in as admin (user must have admin UID in Firebase)
2. First visit: Admin intro should play and morph to header
3. Subsequent visits: Video hidden (sessionStorage flag prevents replay)
4. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R): Video replays
5. Non-admin login: No overlay shown

## Troubleshooting

### Video doesn't play on iOS
- Ensure video has: muted, playsinline, autoplay attributes
- Test in Safari, not just in-app browsers
- Check console for CORS errors

### Video doesn't play at all
- Check browser console for 404 errors
- Verify video file actually exists at the path
- Try different video format (MP4 vs WebM)

### Animation feels laggy
- Ensure video dimensions match your export (1080p or higher)
- Check browser DevTools Performance tab for jank
- Reduce video bitrate if file is huge

### Audio plays despite muted attribute
- Ensure video file has no audio track, or is exported muted
- Re-encode with ffmpeg: `ffmpeg -i input.mp4 -an output.mp4`

## Replacement Files
No need to keep `dance.gif` - it's now unused. You can delete it or keep it for reference.

## Production Checklist
- [ ] Create admin intro MP4 video (2 seconds, muted, 1080p+)
- [ ] Place in `/Logo/admin-intro.mp4`
- [ ] Update video.src in index.html or script.js
- [ ] Test on Chrome desktop
- [ ] Test on Android Chrome
- [ ] Test on iOS Safari (important!)
- [ ] Verify non-admins don't see overlay
- [ ] Verify admins see intro on first visit only (per session)
