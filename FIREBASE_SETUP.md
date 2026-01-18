# Firebase Setup Guide

## 1. Firestore Database Rules

Go to **Firebase Console** > **transvortexltdcouk** > **Firestore Database** > **Rules**

Replace the existing rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Public read access for everyone
    // Write access only for admin
    match /pages/{document=**} {
      // Everyone can read
      allow read: if true;
      
      // Only admin can write/update/delete
      allow write: if request.auth.uid == "VhjWQiYKVGUrDVuOQUSJHA15Blk2";
    }
  }
}
```

Click **Publish** to save.

---

## 2. Create Firestore Collection

In **Firestore Database**:

1. Click **+ Start collection**
2. Collection ID: `pages`
3. Click **Next**
4. Click **Save** (you can add documents manually later or let the app create them)

---

## 3. Document Structure

Each document in `pages` collection should have:

```javascript
{
  name: "Transvortex Official",
  url: "https://facebook.com/transvortex",
  avatar: "https://...",
  postedToday: false,
  lastPosted: null,
  addedDate: <timestamp>,
  createdBy: "VhjWQiYKVGUrDVuOQUSJHA15Blk2"
}
```

---

## 4. Configure Google Sign-In

1. Go to **Firebase Console** > **Authentication** > **Sign-in method**
2. Click **Google**
3. Enable it
4. Configure consent screen if needed

---

## 5. Add Authorized Domain

1. Go to **Firebase Console** > **Authentication** > **Settings**
2. Under **Authorized domains**, add:
   - `yourusername.github.io`

---

## How It Works

- **Public can view**: Anyone can see all pages (read-only)
- **Admin (you) can edit**: Only your Google account (`VhjWQiYKVGUrDVuOQUSJHA15Blk2`) can:
  - Add new pages
  - Mark pages as posted
  - Delete pages
- **No one else can edit**: The Firestore rules block all write requests except from admin

---

## Testing

1. Deploy to GitHub Pages
2. Click "Conectare cu Google"
3. Sign in with your Google account (the admin one)
4. You should see the "👑 ADMIN" badge
5. The form to add pages should appear
6. Non-admin users will see the pages but not the form

---

## Credentials

- **Admin UID**: VhjWQiYKVGUrDVuOQUSJHA15Blk2
- **Firebase Project**: transvortexltdcouk
- **Database**: Cloud Firestore (EU)
