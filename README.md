# Transvortex LTD - Appointments & Invoice Manager

A Firebase-based web application for managing appointments, invoices, and Facebook pages for Transvortex LTD.

## 🚀 Quick Start

1. Open `index.html` in a web browser
2. Sign in with Google authentication
3. Manage appointments, create invoices, and track pages

## 📁 Project Structure

```
Appointments-Transvortex/
├── index.html              # Main application
├── invoice.html            # Invoice page
├── script.js               # Main app logic
├── assets/images/          # Logo and images
├── src/                    # JavaScript modules
│   ├── modal.js           # Modal component
│   └── invoice.js         # Invoice renderer
└── styles/                 # CSS stylesheets
```

## 🔑 Features

- **Appointments:** Create, edit, finalize, and delete appointments
- **Invoices:** Generate professional invoices with PDF export
- **Pages:** Manage Facebook pages and post content
- **Admin:** Two-tier admin system with full access control
- **Responsive:** Mobile-first design with horizontal appointment cards

## 🛠️ Technologies

- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3
- **Backend:** Firebase (Firestore, Authentication)
- **Styling:** Custom CSS with clamp() responsive units
- **Icons:** Font Awesome 6.4.0

## 📝 Configuration

Firebase configuration is embedded in `script.js`. To use with your own Firebase project:

1. Create a Firebase project at https://console.firebase.google.com
2. Enable Google Authentication
3. Enable Firestore Database
4. Update the `firebaseConfig` object in `script.js` (lines 9-17)
5. Update `ADMIN_UIDS` array with your admin user IDs (lines 31-34)

## 🎨 Recent Updates

- ✅ Redesigned appointment cards to horizontal "pe lat" layout
- ✅ Added Edit functionality for appointments
- ✅ Implemented tab filtering (Programate/Finalizate)
- ✅ Mobile-optimized with sticky tabs and collapsible details
- ✅ Cleaned project structure (removed 30 unused files)

## 📖 Documentation

See `CLEANUP_REPORT.md` for details on the recent project reorganization.

Archived documentation and unused files are in `_archive_unused/` for reference.

## 📄 License

See LICENSE file for details.

---

**Transvortex LTD** - Professional automotive services in the UK 🇬🇧
