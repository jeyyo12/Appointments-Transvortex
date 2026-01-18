# 🔴 FIX: auth/api-key-not-valid - Firebase Web Config

## ❌ Problema

```
Error: auth/api-key-not-valid
```

**Cauza reală:**
- Folosești un `firebaseConfig` **invalid** sau din altă aplicație
- Posibil: Config de **Android** (nu Web)
- Posibil: Config **șters** din Firebase
- Posibil: Copy-paste greșit

---

## ✅ Soluție: Obține Config Corect din Firebase Console

### Pas 1: Deschide Firebase Console

Mergi la: **https://console.firebase.google.com/project/transvortexltdcouk**

### Pas 2: Localizează Web App

1. Click pe **⚙️ Settings** (roata dințată în colțul stâng-sus)
2. Click pe **Project Settings**
3. Scroll la secțiunea **Your apps**
4. Caută o intrare cu **🌐 Web** icon și textul `Appointments-Transvortex`

```
Your apps
├─ 🌐 Appointments-Transvortex (Web)  ← TREBUIE SĂ EXISTE
├─ 🤖 Alte app-uri...
```

**Dacă NU există o Web App:**
1. Click **Add app**
2. Selectează **Web** (🌐)
3. Introdu: `Appointments-Transvortex`
4. Click **Register app**

### Pas 3: Copiază Firebase Config

1. Sub **Appointments-Transvortex (Web)**, click pe **</> Code**
2. Selectează SDK: **CDN** (NU npm)
3. Vei vedea:

```html
<script type="module">
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

  const firebaseConfig = {
    apiKey: "AIzaSy...",
    authDomain: "transvortexltdcouk.firebaseapp.com",
    projectId: "transvortexltdcouk",
    storageBucket: "transvortexltdcouk.firebasestorage.app",
    messagingSenderId: "980773...",
    appId: "1:980773...:web:08800ca9...",
    measurementId: "G-..."
  };
</script>
```

4. **Copiază DOAR obiectul `firebaseConfig`**

### Pas 4: Înlocuiește în script.js

Deschide [script.js](script.js) și găsește:

```javascript
const firebaseConfig = {
    apiKey: "AIzaSy...", // 🔴 REPLACE
    authDomain: "transvortexltdcouk.firebaseapp.com",
    projectId: "transvortexltdcouk",
    storageBucket: "transvortexltdcouk.firebasestorage.app",
    messagingSenderId: "XXXXXXXXX", // 🔴 REPLACE
    appId: "1:XXXXXXXXX:web:XXXXXXXX", // 🔴 REPLACE
    measurementId: "G-XXXXXXXXX" // 🔴 REPLACE
};
```

**Înlocuiește cu valoarea din Firebase Console (Pasul 3).**

---

## 🔍 Ce să Verifici

### ✅ ApiKey - Trebuie să înceapă cu `AIzaSy`

```javascript
apiKey: "AIzaSy..." ✅ Corect (Web)
apiKey: "AIzaSy..." ❌ Gol/Placeholder
```

### ✅ AppId - Trebuie să conțină `:web:`

```javascript
appId: "1:980773899679:web:08800ca927f4ac348581aa" ✅ Corect (Web)
appId: "1:980773899679:android:08800ca927f4ac348581aa" ❌ GREȘIT (Android)
appId: "1:980773899679:ios:08800ca927f4ac348581aa" ❌ GREȘIT (iOS)
```

### ✅ AuthDomain - Trebuie să se potrivească cu Project ID

```javascript
authDomain: "transvortexltdcouk.firebaseapp.com" ✅ Corect
authDomain: "otherapp.firebaseapp.com" ❌ GREȘIT (alt project)
```

---

## ⚙️ După Config Valid

Odată ce ai config **corect din Firebase Console**, asigură-te că:

### 1. Google Sign-In este Activat

```
Firebase Console
├─ Authentication
│  └─ Sign-in method
│     └─ Google ✅ ENABLED
```

1. Mergi la **Authentication** > **Sign-in method**
2. Click pe **Google**
3. Activează switch-ul
4. Selectează o email pentru **Project support email**
5. Click **Save**

### 2. Domeniu Autorizat

```
Firebase Console
├─ Authentication
│  └─ Settings
│     └─ Authorized domains
│        └─ yourusername.github.io ✅
```

1. Mergi la **Authentication** > **Settings**
2. Scroll la **Authorized domains**
3. Click **Add domain**
4. Introdu: `yourusername.github.io` (înlocuiește `yourusername`)
5. Click **Add**

### 3. Firestore Rules

```
Firebase Console
├─ Firestore Database
│  └─ Rules
│     ├─ allow read: if true;
│     └─ allow write: if request.auth.uid == "VhjWQiYKVGUrDVuOQUSJHA15Blk2";
```

Asigură-te că regulile sunt **Publish**ed.

---

## 🧪 Test Local Înainte de Deploy

Deschide **Developer Console (F12)** și verifi:

```javascript
// Ar trebui să zici:
✅ Firebase SDK: Initializing...
✅ Firebase App initialized
✅ Firebase Auth initialized
✅ Firestore initialized
```

**Dacă ai eroare:**

```
❌ auth/api-key-not-valid
SOLUTION: Go to Firebase Console > Project Settings > Copy Web firebaseConfig
```

---

## 🚀 Deploy & Test

Odată ce ai config **valid**:

```powershell
cd c:\Users\Dan\Documents\GitHub\Appointments-Transvortex
git add script.js
git commit -m "Fix Firebase API Key - use valid Web config from Console"
git push origin main
```

Deschide: `https://yourusername.github.io/Appointments-Transvortex/`

Click **Conectare cu Google**

---

## 🛠️ Troubleshooting

| Error | Cauza | Fix |
|-------|-------|-----|
| `auth/api-key-not-valid` | Config invalid/gol | Copy din Console |
| `auth/unauthorized-domain` | Domain not whitelisted | Add la Authorized domains |
| `auth/network-request-failed` | Connexion error | Check internet |
| `auth/popup-closed-by-user` | User closed login | Normal - nu e eroare |
| Blank page / No console logs | Firebase nu se initialize | Check apiKey, appId |

---

## 📋 Checklist

- [ ] Verifici Firebase Console pentru Web App
- [ ] Copiezi `firebaseConfig` din Firebase Console
- [ ] Înlocuiești `firebaseConfig` în [script.js](script.js)
- [ ] Verifici: `apiKey` start cu `AIzaSy`
- [ ] Verifici: `appId` conține `:web:`
- [ ] Google Sign-In e ENABLED în Firebase Console
- [ ] Domeniu autorizat e adăugat (`yourusername.github.io`)
- [ ] Firestore Rules sunt PUBLISH-ed
- [ ] Console (F12) arată `✅ Firebase App initialized`
- [ ] Push pe GitHub: `git push origin main`
- [ ] Test pe site-ul live

---

## ❓ De ce s-a întâmplat Asta?

**API Key-ul anterior era:**
- Din aplicație Android (nu Web)
- Din alt project Firebase (sters/schimbat)
- Invalid/expirat

**SDK Web (gstatic) NECESITĂ:**
- ✅ Web API Key (cu `:web:` în appId)
- ✅ AuthDomain valid
- ✅ ProjectId corect
- ✅ Nu necesită: Storage bucket, Messaging (dacă nu le folosești)

---

**Status**: 🔧 Ready to Fix  
**Time to fix**: ~5 minutes  
**Dificultate**: Ușor (copy-paste din Console)
