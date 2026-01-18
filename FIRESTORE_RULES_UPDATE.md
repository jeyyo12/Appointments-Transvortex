# 🔥 Firestore Rules - UPDATE REQUIRED

## ⚠️ IMPORTANT: Update Firestore Security Rules

You've added a new **Programări (Appointments)** feature. You MUST update your Firestore Rules to include the `appointments` collection.

---

## 📋 Step-by-Step Instructions

### 1. Open Firebase Console

Go to: **https://console.firebase.google.com/project/transvortexltdcouk**

### 2. Navigate to Firestore Rules

```
Firebase Console
├─ Firestore Database
│  └─ Rules (tab)
```

### 3. Replace ALL Rules with This:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper function: Check if user is admin
    function isAdmin() {
      return request.auth != null &&
        (
          request.auth.uid == "VhjWQiYKVGUrDVuOQUSJHA15Blk2" ||
          request.auth.uid == "9tcBBsCcdqOWHc06otNpHq8XAxW2"
        );
    }

    // Facebook Pages Collection
    match /pages/{docId} {
      allow read: if true;  // Everyone can read
      allow write: if isAdmin();  // Only admins can write
    }

    // Appointments Collection (NEW)
    match /appointments/{docId} {
      allow read: if true;  // Everyone can read
      allow write: if isAdmin();  // Only admins can write
    }

    // Post Logs Collection (optional, for audit trail)
    match /postLogs/{docId} {
      allow read: if true;
      allow write: if isAdmin();
    }
  }
}
```

### 4. Click **Publish**

The rules will be applied immediately.

---

## ✅ What These Rules Do

| Collection | Read Access | Write Access |
|------------|-------------|--------------|
| `pages` | ✅ Everyone | 👑 Admins only (2 UIDs) |
| `appointments` | ✅ Everyone | 👑 Admins only (2 UIDs) |
| `postLogs` | ✅ Everyone | 👑 Admins only (2 UIDs) |

### Admin UIDs:
- `VhjWQiYKVGUrDVuOQUSJHA15Blk2`
- `9tcBBsCcdqOWHc06otNpHq8XAxW2`

---

## 🧪 Test After Publishing

1. **Refresh your website**
2. **Click "Programări" tab**
3. **Console (F12) should show:**
   ```
   📥 Subscribing to appointments collection...
   ✅ Appointments loaded: 0
   ```

4. **Add a test appointment** (as admin)
5. **Check it appears in the list**
6. **Refresh page** - appointment should persist

---

## 🐛 Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `permission-denied` when loading | Rules not published | Publish rules in Console |
| `permission-denied` when adding | Not logged in as admin | Log in with admin account |
| Collection not found | Collection doesn't exist yet | Add first appointment, it will auto-create |
| Rules validation error | Syntax error in rules | Copy/paste exact code from above |

---

## 📊 Data Model Verification

### Appointments Collection Structure:

```javascript
{
  customerName: "Ion Popescu",           // string (required)
  car: "Dacia Logan, AB-12-XYZ",        // string (required)
  address: "Str. Principală nr. 10",     // string (optional)
  notes: "Verificare tehnică anuală",    // string (optional)
  status: "scheduled",                   // enum: scheduled | done | canceled
  startAt: Timestamp,                    // Firestore Timestamp (combined date+time)
  dateStr: "2026-01-18",                // string YYYY-MM-DD (for filtering)
  timeStr: "14:30",                      // string HH:mm (for display)
  createdAt: serverTimestamp(),         // auto-generated
  updatedAt: serverTimestamp(),         // auto-generated
  createdBy: "uid"                       // admin UID who created it
}
```

---

## ✨ Features Enabled by These Rules

1. ✅ **Real-time sync** - Changes on PC show on phone instantly
2. ✅ **Public read** - Everyone can view appointments (if needed for display boards)
3. ✅ **Admin-only write** - Only 2 specific users can add/edit/delete
4. ✅ **Audit trail** - `createdBy` field tracks who created each appointment
5. ✅ **Security** - Firestore validates at database level (defense in depth)

---

## 🚀 After Publishing Rules

Your app will have:
- ✅ Facebook Pages Manager (existing)
- ✅ Appointments Manager (new)
- ✅ Real-time sync for both
- ✅ CSV export for appointments
- ✅ Reminders (upcoming/overdue badges)
- ✅ Day grouping in appointments list
- ✅ Search and filters

---

**Status**: ⏳ Waiting for Rules to be published  
**Next Step**: Publish rules, then test!  
**Documentation**: This file

