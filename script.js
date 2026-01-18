// ==========================================
// 🔴 FIREBASE CONFIGURATION - INSTRUCȚIUNI 🔴
// ==========================================
// 1. Mergi la: https://console.firebase.google.com/project/transvortexltdcouk
// 2. Apasă "Project Settings" (roata dințată)
// 3. Sub "Your apps" găsește "Web App" (trebuie să existe)
// 4. Copiază obiectul config și înlocuiește de mai jos
// 5. ⚠️ IMPORTANT: Folosește doar firebaseConfig din Firebase Console, nu alte surse
// ==========================================

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDKyqAb198h6VdbHXZtciMdn_KIg-L2zZU",
  authDomain: "transvortexltdcouk.firebaseapp.com",
  projectId: "transvortexltdcouk",
  storageBucket: "transvortexltdcouk.firebasestorage.app",
  messagingSenderId: "980773899679",
  appId: "1:980773899679:web:08800ca927f4ac348581aa",
  measurementId: "G-D1QH23H9J8"
};

// Validation check
if (firebaseConfig.apiKey === "AIzaSy..." || !firebaseConfig.appId.includes(":web:")) {
    console.error("❌ FIREBASE CONFIG NOT SET! Follow instructions above.");
    console.error("apiKey must start with 'AIzaSy' (not placeholder)");
    console.error("appId must contain ':web:' (this indicates Web App, not Android)");
}

// Admin UID
const ADMIN_UID = "VhjWQiYKVGUrDVuOQUSJHA15Blk2";

// Global variables for Firebase
let app = null;
let auth = null;
let db = null;
let currentUser = null;
let isAdmin = false;
let pages = [];

// ==========================================
// FIREBASE INITIALIZATION (Web SDK only)
// ==========================================
async function initializeFirebase() {
    try {
        // Import Firebase App module
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
        
        // Import Firebase Auth module (Web SDK)
        const { 
            getAuth, 
            onAuthStateChanged, 
            signInWithPopup, 
            GoogleAuthProvider, 
            signOut 
        } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        
        // Import Firestore module
        const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        console.log("🔥 Firebase SDK: Initializing...");
        
        // Initialize Firebase App with Web config
        app = initializeApp(firebaseConfig);
        console.log("✅ Firebase App initialized");
        
        // Get Auth instance (Web SDK)
        auth = getAuth(app);
        console.log("✅ Firebase Auth initialized");
        
        // Get Firestore instance
        db = getFirestore(app);
        console.log("✅ Firestore initialized");

        // Setup authentication state listener
        onAuthStateChanged(auth, (user) => {
            currentUser = user;
            isAdmin = user?.uid === ADMIN_UID;
            updateAuthUI();
            
            if (user) {
                console.log(`✅ User authenticated: ${user.email}`);
                if (isAdmin) {
                    console.log("👑 Admin access granted");
                }
                loadPages();
                renderPages();
                updateStats();
                setupEventListeners();
            } else {
                console.log("🔓 User logged out");
            }
        });

    } catch (error) {
        console.error("❌ Firebase initialization error:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        
        // Provide helpful error messages
        if (error.code === "auth/api-key-not-valid") {
            updateAuthStatus("❌ API Key invalid. Check Firebase Console config.");
            console.error("SOLUTION: Go to Firebase Console > Project Settings > Copy Web firebaseConfig");
        } else if (error.code === "auth/network-request-failed") {
            updateAuthStatus("❌ Network error. Check internet connection.");
        } else {
            updateAuthStatus("❌ Firebase error. Check console.");
        }
    }
}

// ==========================================
// AUTHENTICATION FUNCTIONS (Google Sign-In)
// ==========================================
async function handleAuthToggle() {
    if (currentUser) {
        // User logged in → Logout
        try {
            const { signOut: firebaseSignOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
            await firebaseSignOut(auth);
            console.log("✅ User logged out successfully");
        } catch (error) {
            console.error("❌ Logout error:", error);
            updateAuthStatus("Eroare la deconectare.");
        }
    } else {
        // User not logged in → Google Sign-In
        try {
            const { signInWithPopup, GoogleAuthProvider } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
            
            // Create Google provider
            const provider = new GoogleAuthProvider();
            
            // Set language to Romanian
            auth.languageCode = 'ro';
            
            // Request scopes (optional - for accessing more user data)
            provider.addScope('profile');
            provider.addScope('email');
            
            console.log("🔐 Initiating Google Sign-In...");
            
            // Sign in with popup
            const result = await signInWithPopup(auth, provider);
            console.log("✅ Google Sign-In successful:", result.user.email);
            
        } catch (error) {
            console.error("❌ Login error:", error);
            console.error("Error code:", error.code);
            
            // Handle specific error codes
            if (error.code === "auth/popup-closed-by-user") {
                console.log("ℹ️ User closed sign-in popup");
                return;
            } else if (error.code === "auth/api-key-not-valid") {
                updateAuthStatus("❌ API Key invalid - check Firebase Console.");
                console.error("SOLUTION: Verify firebaseConfig in script.js matches Console");
            } else if (error.code === "auth/unauthorized-domain") {
                updateAuthStatus("❌ Domain not authorized - add to Firebase Console.");
                console.error("SOLUTION: Firebase Console > Auth > Settings > Authorized domains");
            } else if (error.code === "auth/network-request-failed") {
                updateAuthStatus("❌ Network error - check internet connection.");
            } else {
                updateAuthStatus("❌ Sign-in error. Try again.");
            }
        }
    }
}

function updateAuthUI() {
    const authStatus = document.getElementById('authStatus');
    const authButton = document.getElementById('authButton');
    const adminBadge = document.getElementById('adminBadge');

    if (currentUser) {
        authStatus.innerHTML = `✅ ${currentUser.displayName || 'Conectat'}`;
        authButton.textContent = 'Deconectare';
        authButton.disabled = false;

        if (isAdmin) {
            adminBadge.style.display = 'inline-block';
            // Show admin-only sections
            document.querySelectorAll('[data-admin-only]').forEach(el => {
                el.classList.add('admin-visible');
            });
        } else {
            adminBadge.style.display = 'none';
            // Hide admin-only sections
            document.querySelectorAll('[data-admin-only]').forEach(el => {
                el.classList.remove('admin-visible');
            });
        }
    } else {
        authStatus.innerHTML = '🔓 Conectează-te pentru a continua';
        authButton.textContent = 'Conectare cu Google';
        authButton.disabled = false;
        adminBadge.style.display = 'none';
        // Hide admin sections
        document.querySelectorAll('[data-admin-only]').forEach(el => {
            el.classList.remove('admin-visible');
        });
    }
}

function updateAuthStatus(status) {
    const authStatus = document.getElementById('authStatus');
    authStatus.textContent = status;
}

// ==========================================
// PAGE MANAGEMENT FUNCTIONS
// ==========================================
async function loadPages() {
    if (!currentUser) return;

    try {
        const { collection, getDocs, query, orderBy } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const q = query(collection(db, 'pages'), orderBy('addedDate', 'desc'));
        const snapshot = await getDocs(q);
        
        pages = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error loading pages:', error);
        showNotification('Eroare la încărcarea datelor', 'error');
    }
}

function setupEventListeners() {
    const form = document.getElementById('pageForm');
    if (form) {
        form.addEventListener('submit', handleAddPage);
    }
}

async function handleAddPage(e) {
    if (!isAdmin) {
        alert('Doar administratorii pot adăuga pagini.');
        return;
    }

    e.preventDefault();

    const pageName = document.getElementById('pageName').value.trim();
    const pageUrl = document.getElementById('pageUrl').value.trim();
    const pageAvatar = document.getElementById('pageAvatar').value.trim();

    if (!pageUrl.includes('facebook.com')) {
        alert('Te rog introdu un URL valid de Facebook!');
        return;
    }

    try {
        const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        await addDoc(collection(db, 'pages'), {
            name: pageName,
            url: pageUrl,
            avatar: pageAvatar || '',
            postedToday: false,
            lastPosted: null,
            addedDate: serverTimestamp(),
            createdBy: currentUser.uid
        });

        e.target.reset();
        await loadPages();
        renderPages();
        updateStats();
        showNotification('Pagină adăugată cu succes!', 'success');
    } catch (error) {
        console.error('Error adding page:', error);
        showNotification('Eroare la adăugarea paginii', 'error');
    }
}

async function markAsPosted(docId) {
    if (!isAdmin) return;

    try {
        const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        await updateDoc(doc(db, 'pages', docId), {
            postedToday: true,
            lastPosted: serverTimestamp()
        });

        await loadPages();
        renderPages();
        updateStats();
        showNotification('Pagină marcată ca postată!', 'success');
    } catch (error) {
        console.error('Error marking as posted:', error);
        showNotification('Eroare la actualizare', 'error');
    }
}

async function markAsUnposted(docId) {
    if (!isAdmin) return;

    try {
        const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        await updateDoc(doc(db, 'pages', docId), {
            postedToday: false
        });

        await loadPages();
        renderPages();
        updateStats();
        showNotification('Pagină marcată ca nepostată', 'info');
    } catch (error) {
        console.error('Error marking as unposted:', error);
        showNotification('Eroare la actualizare', 'error');
    }
}

async function deletePage(docId) {
    if (!isAdmin) return;

    if (!confirm('Ești sigur că vrei să ștergi această pagină?')) return;

    try {
        const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        await deleteDoc(doc(db, 'pages', docId));

        await loadPages();
        renderPages();
        updateStats();
        showNotification('Pagină ștearsă cu succes', 'success');
    } catch (error) {
        console.error('Error deleting page:', error);
        showNotification('Eroare la ștergere', 'error');
    }
}

// ==========================================
// UI RENDERING FUNCTIONS
// ==========================================
function renderPages() {
    const pagesList = document.getElementById('pagesList');
    const emptyState = document.getElementById('emptyState');

    if (pages.length === 0) {
        pagesList.innerHTML = '';
        emptyState.classList.add('show');
        return;
    }

    emptyState.classList.remove('show');
    const pagesHTML = pages.map(page => createPageCard(page)).join('');
    pagesList.innerHTML = pagesHTML;
    attachPageEventListeners();
}

function createPageCard(page) {
    const addedDate = page.addedDate?.toDate?.() || new Date(page.addedDate);
    const daysSinceAdded = Math.floor((new Date() - addedDate) / (1000 * 60 * 60 * 24));
    const lastPostedDate = page.lastPosted?.toDate?.() || (page.lastPosted ? new Date(page.lastPosted) : null);
    const daysSincePosted = lastPostedDate ? Math.floor((new Date() - lastPostedDate) / (1000 * 60 * 60 * 24)) : 999;
    
    let cardClass, statusClass, statusIcon, statusText;
    
    if (page.postedToday) {
        cardClass = 'posted-today';
        statusClass = 'status-posted';
        statusIcon = 'fa-check-circle';
        statusText = 'Postat astăzi';
    } else if (daysSincePosted > 30 || (daysSinceAdded > 30 && !page.lastPosted)) {
        cardClass = 'to-delete';
        statusClass = 'status-delete';
        statusIcon = 'fa-exclamation-triangle';
        statusText = 'Neactivă - Sugestie ștergere';
    } else {
        cardClass = 'pending';
        statusClass = 'status-pending';
        statusIcon = 'fa-clock';
        statusText = 'De postat';
    }
    
    const postButton = page.postedToday 
        ? `<button class="btn-action btn-unpost" data-id="${page.id}">
                <i class="fas fa-undo"></i> Marchează ca nepostat
           </button>`
        : `<button class="btn-action btn-post" data-id="${page.id}">
                <i class="fas fa-check"></i> Marchează ca postat
           </button>`;

    const deleteWarning = cardClass === 'to-delete' ? `<div style="background: var(--color-delete); color: white; padding: 8px; border-radius: 6px; margin-bottom: 10px; font-size: 0.85em; text-align: center; box-shadow: 0 0 10px var(--glow-red);"><i class="fas fa-exclamation-circle"></i> Pagină inactivă ${daysSincePosted < 999 ? daysSincePosted : daysSinceAdded} zile</div>` : '';
    
    const avatarHTML = page.avatar 
        ? `<img src="${page.avatar}" alt="${page.name}" class="page-avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
           <div class="page-avatar-placeholder" style="display:none;">${page.name.charAt(0).toUpperCase()}</div>`
        : `<div class="page-avatar-placeholder">${page.name.charAt(0).toUpperCase()}</div>`;
    
    const miniPreview = page.postedToday && page.lastPosted ? `
        <div class="mini-preview">
            <div class="mini-preview-header">
                <i class="fas fa-check-circle"></i>
                <span>Publicată cu succes</span>
            </div>
            <div class="mini-preview-text">
                Ultima postare: ${lastPostedDate.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
            </div>
        </div>
    ` : '';

    const adminButtons = isAdmin ? `
        <div class="page-actions">
            ${postButton}
            <button class="btn-action btn-visit" data-id="${page.id}">
                <i class="fas fa-external-link-alt"></i>
            </button>
            <button class="btn-action btn-delete" data-id="${page.id}">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    ` : '';
    
    return `
        <div class="page-card ${cardClass}">
            ${deleteWarning}
            <div class="page-header">
                <div class="page-header-left">
                    ${avatarHTML}
                    <div class="page-info">
                        <div class="page-title">${page.name}</div>
                    </div>
                </div>
            </div>
            <div class="page-url">
                <i class="fab fa-facebook"></i>
                <a href="${page.url}" target="_blank">${page.url}</a>
            </div>
            <div class="page-status ${statusClass}">
                <i class="fas ${statusIcon}"></i>
                <span>${statusText}</span>
            </div>
            ${miniPreview}
            ${adminButtons}
        </div>
    `;
}

function attachPageEventListeners() {
    document.querySelectorAll('.btn-post').forEach(btn => {
        btn.addEventListener('click', (e) => {
            markAsPosted(e.currentTarget.dataset.id);
        });
    });

    document.querySelectorAll('.btn-unpost').forEach(btn => {
        btn.addEventListener('click', (e) => {
            markAsUnposted(e.currentTarget.dataset.id);
        });
    });

    document.querySelectorAll('.btn-visit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const page = pages.find(p => p.id === e.currentTarget.dataset.id);
            if (page) {
                window.open(page.url, '_blank');
                markAsPosted(e.currentTarget.dataset.id);
            }
        });
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            deletePage(e.currentTarget.dataset.id);
        });
    });
}

// ==========================================
// STATISTICS & UI UPDATES
// ==========================================
function updateStats() {
    const totalPages = pages.length;
    const postedToday = pages.filter(p => p.postedToday).length;
    const pendingPages = totalPages - postedToday;

    animateNumber('totalPages', totalPages);
    animateNumber('postedToday', postedToday);
    animateNumber('pendingPages', pendingPages);
    
    updateLiveStatus();
    updateHumanMessage(postedToday, pendingPages);
}

function animateNumber(elementId, targetValue) {
    const element = document.getElementById(elementId);
    const currentValue = parseInt(element.textContent) || 0;
    
    if (currentValue === targetValue) return;
    
    element.classList.add('counting');
    
    const duration = 500;
    const steps = 20;
    const increment = (targetValue - currentValue) / steps;
    let current = currentValue;
    let step = 0;
    
    const timer = setInterval(() => {
        step++;
        current += increment;
        element.textContent = Math.round(current);
        
        if (step >= steps) {
            element.textContent = targetValue;
            clearInterval(timer);
            setTimeout(() => element.classList.remove('counting'), 100);
        }
    }, duration / steps);
}

function updateLiveStatus() {
    const lastPostElement = document.getElementById('lastPostTime');
    const nextPostElement = document.getElementById('nextPostTime');
    
    const postedPages = pages.filter(p => p.lastPosted);
    if (postedPages.length > 0) {
        const lastPosted = postedPages.reduce((latest, page) => {
            const latestDate = latest.lastPosted?.toDate?.() || new Date(latest.lastPosted);
            const pageDate = page.lastPosted?.toDate?.() || new Date(page.lastPosted);
            return pageDate > latestDate ? page : latest;
        });
        
        const postedDate = lastPosted.lastPosted?.toDate?.() || new Date(lastPosted.lastPosted);
        const timeDiff = Date.now() - postedDate;
        const minutes = Math.floor(timeDiff / 60000);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            lastPostElement.textContent = `acum ${hours} ${hours === 1 ? 'oră' : 'ore'}`;
        } else if (minutes > 0) {
            lastPostElement.textContent = `acum ${minutes} ${minutes === 1 ? 'minut' : 'minute'}`;
        } else {
            lastPostElement.textContent = 'chiar acum';
        }
    } else {
        lastPostElement.textContent = 'nicio postare încă';
    }
    
    const pendingCount = pages.filter(p => !p.postedToday).length;
    if (pendingCount > 0) {
        const now = new Date();
        const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0);
        nextPostElement.textContent = nextHour.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
    } else {
        nextPostElement.textContent = 'toate postate';
    }
}

function updateHumanMessage(postedCount, pendingCount) {
    const messageElement = document.getElementById('humanMessage');
    if (!messageElement) return;
    
    const span = messageElement.querySelector('span');
    
    if (pendingCount === 0) {
        span.innerHTML = '<i class="fas fa-party-horn"></i> Felicitări! Ai postat în toate paginile programate.';
    } else if (postedCount === 0) {
        span.innerHTML = `${pendingCount} ${pendingCount === 1 ? 'pagină necesită' : 'pagini necesită'} atenția ta.`;
    } else if (pendingCount === 1) {
        span.innerHTML = 'Aproape gata! Doar 1 pagină mai necesită atenția ta.';
    } else {
        span.innerHTML = `Progres excelent! ${pendingCount} pagini mai așteaptă.`;
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 15px 25px;
        border-radius: 8px;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        z-index: 999;
        animation: slideIn 0.3s ease;
    `;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        ${message}
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ==========================================
// INITIALIZE ON PAGE LOAD
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initializeFirebase();
});

