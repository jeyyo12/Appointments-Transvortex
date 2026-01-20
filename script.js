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
  appId: "1:980773899679:web:1d741dd11f75cd238581aa",
  measurementId: "G-RL8PTZS34D"
};

// Validation check
if (firebaseConfig.apiKey === "AIzaSy..." || !firebaseConfig.appId.includes(":web:")) {
    console.error("❌ FIREBASE CONFIG NOT SET! Follow instructions above.");
    console.error("apiKey must start with 'AIzaSy' (not placeholder)");
    console.error("appId must contain ':web:' (this indicates Web App, not Android)");
}

// Admin UIDs - Two administrators
const ADMIN_UIDS = [
    "VhjWQiYKVGUrDVuOQUSJHA15Blk2", // Admin 1
    "9tcBBsCcdqOWHc06otNpHq8XAxW2"  // Admin 2
];

// Global variables for Firebase
let app = null;
let auth = null;
let db = null;
let currentUser = null;
let isAdmin = false;
let pages = [];

// Appointments global variables
let appointments = [];
let filteredAppointments = [];
let appointmentsUnsubscribe = null;

// Current active tab
let currentTab = 'pages';

// Appointments tab state (Programate / Finalizate)
const APPOINTMENTS_TAB_KEY = 'tvx.activeAppointmentsTab';
let activeAppointmentsTab = localStorage.getItem(APPOINTMENTS_TAB_KEY) || 'scheduled';

// Appointment buttons delegation flag
let appointmentsClicksBound = false;

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
        onAuthStateChanged(auth, async (user) => {
            currentUser = user;
            isAdmin = user ? ADMIN_UIDS.includes(user.uid) : false;
            updateAuthUI();
            
            if (user) {
                console.log(`✅ User authenticated: ${user.email}`);
                if (isAdmin) {
                    console.log("👑 Admin access granted");
                }
                
                // Setup event listeners first
                setupEventListeners();
                
                // Load pages from Firestore (this will also render)
                await loadPages();
                
                // Subscribe to appointments if on appointments tab
                subscribeToAppointments();
                
            } else {
                console.log("🔓 User logged out");
                pages = [];
                appointments = [];
                renderPages();
                updateStats();
                
                // Unsubscribe from appointments
                if (appointmentsUnsubscribe) {
                    appointmentsUnsubscribe();
                    appointmentsUnsubscribe = null;
                }
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
    if (!currentUser) {
        console.log('⏳ Not logged in yet, skipping loadPages');
        pages = [];
        renderPages();
        return;
    }

    if (!db) {
        console.error('❌ Firestore not initialized yet');
        return;
    }

    try {
        const { collection, getDocs, query, orderBy } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        console.log('📥 Loading pages from Firestore collection: "pages"...');
        const q = query(collection(db, 'pages'), orderBy('addedDate', 'desc'));
        const snapshot = await getDocs(q);
        
        // Map Firestore documents to pages array
        pages = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        console.log(`✅ Loaded ${pages.length} pages from Firestore`);
        
        // IMPORTANT: Render pages immediately after loading
        renderPages();
        updateStats();
        
    } catch (error) {
        console.error('❌ Error loading pages:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        
        // Reset to empty array on error
        pages = [];
        renderPages();
        
        // Specific error handling
        if (error.code === 'permission-denied') {
            console.error('🔴 PERMISSION DENIED! Firestore Rules issue:');
            console.error('Solution: Go to Firebase Console > Firestore > Rules');
            console.error('Make sure you have: allow read: if true;');
            showNotification('❌ Firestore Rules: Missing read permissions. Check console.', 'error');
        } else if (error.code === 'not-found') {
            console.error('⚠️ Pages collection does not exist yet. Create it in Firebase Console.');
            showNotification('⚠️ Firestore database not initialized. Please create "pages" collection.', 'error');
        } else {
            showNotification('❌ Eroare la încărcarea datelor: ' + error.message, 'error');
        }
    }
}

// setupEventListeners is defined later in the file with both page and appointment forms

// ==========================================
// REFRESH FUNCTION
// ==========================================
async function handleRefresh() {
    const refreshButton = document.getElementById('refreshButton');
    
    if (!currentUser) {
        showNotification('⚠️ Conectează-te pentru a reîncărca paginile', 'info');
        return;
    }
    
    try {
        // Add spinning animation
        if (refreshButton) {
            refreshButton.classList.add('refreshing');
            refreshButton.disabled = true;
        }
        
        console.log('🔄 Manual refresh triggered...');
        
        // Reload pages from Firestore
        await loadPages();
        
        showNotification(`✅ Reîncărcat! ${pages.length} ${pages.length === 1 ? 'pagină găsită' : 'pagini găsite'}`, 'success');
        
    } catch (error) {
        console.error('❌ Error refreshing:', error);
        showNotification('❌ Eroare la reîncărcare', 'error');
    } finally {
        // Remove spinning animation
        if (refreshButton) {
            refreshButton.classList.remove('refreshing');
            refreshButton.disabled = false;
        }
    }
}

// Refresh appointments manually (though they auto-update via listener)
async function handleRefreshAppointments() {
    const refreshButton = document.getElementById('refreshAppointmentsButton');
    
    if (!currentUser) {
        showNotification('⚠️ Conectează-te pentru a reîncărca programările', 'info');
        return;
    }
    
    try {
        if (refreshButton) {
            refreshButton.classList.add('refreshing');
            refreshButton.disabled = true;
        }
        
        console.log('🔄 Manual appointments refresh triggered...');
        
        // Appointments auto-update via Firestore listener, but we can show notification
        showNotification(`✅ Actualizat! ${appointments.length} programări`, 'success');
        
    } catch (error) {
        console.error('❌ Error refreshing appointments:', error);
        showNotification('❌ Eroare la reîncărcare', 'error');
    } finally {
        if (refreshButton) {
            refreshButton.classList.remove('refreshing');
            refreshButton.disabled = false;
        }
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
        
        console.log('📝 Adding page to Firestore collection: "pages"...');
        
        const docRef = await addDoc(collection(db, 'pages'), {
            name: pageName,
            url: pageUrl,
            avatar: pageAvatar || '',
            postedToday: false,
            lastPosted: null,
            addedDate: serverTimestamp(),
            createdBy: currentUser.uid
        });

        console.log(`✅ Page added with ID: ${docRef.id}`);
        
        // Reset form
        e.target.reset();
        
        // Reload pages from Firestore (this will also render and update stats)
        await loadPages();
        
        showNotification('Pagină adăugată cu succes!', 'success');
    } catch (error) {
        console.error('❌ Error adding page:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        showNotification('❌ Eroare la adăugarea paginii: ' + error.message, 'error');
    }
}

async function markAsPosted(docId) {
    if (!isAdmin) return;

    try {
        const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        console.log(`📝 Marking page ${docId} as posted...`);
        
        await updateDoc(doc(db, 'pages', docId), {
            postedToday: true,
            lastPosted: serverTimestamp()
        });

        console.log(`✅ Page ${docId} marked as posted`);
        
        // Reload pages from Firestore (this will also render and update stats)
        await loadPages();
        
        showNotification('Pagină marcată ca postată!', 'success');
    } catch (error) {
        console.error('❌ Error marking as posted:', error);
        console.error('Error code:', error.code);
        showNotification('❌ Eroare la actualizare: ' + error.message, 'error');
    }
}

async function markAsUnposted(docId) {
    if (!isAdmin) return;

    try {
        const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        console.log(`📝 Marking page ${docId} as unposted...`);
        
        await updateDoc(doc(db, 'pages', docId), {
            postedToday: false
        });

        console.log(`✅ Page ${docId} marked as unposted`);
        
        // Reload pages from Firestore (this will also render and update stats)
        await loadPages();
        
        showNotification('Pagină marcată ca nepostată', 'info');
    } catch (error) {
        console.error('❌ Error marking as unposted:', error);
        console.error('Error code:', error.code);
        showNotification('❌ Eroare la actualizare: ' + error.message, 'error');
    }
}

async function deletePage(docId) {
    if (!isAdmin) return;

    // Simple native confirmation
    if (!confirm('Șterge pagina? Această acțiune nu poate fi anulată.')) return;

    try {
        const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        console.log(`🗑️ Deleting page ${docId}...`);
        
        await deleteDoc(doc(db, 'pages', docId));

        console.log(`✅ Page ${docId} deleted`);
        
        // Reload pages from Firestore (this will also render and update stats)
        await loadPages();
        
        showNotification('Pagină ștearsă cu succes', 'success');
    } catch (error) {
        console.error('❌ Error deleting page:', error);
        console.error('Error code:', error.code);
        showNotification('❌ Eroare la ștergere: ' + error.message, 'error');
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
// TOAST NOTIFICATION SYSTEM (Design System)
// ==========================================
function showToast(message, type = 'success') {
    // Create toast container if doesn't exist
    let toastContainer = document.querySelector('.tvToastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'tvToastContainer';
        toastContainer.style.cssText = `
            position: fixed;
            top: clamp(1rem, 2vw, 1.5rem);
            right: clamp(1rem, 2vw, 1.5rem);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            pointer-events: none;
        `;
        document.body.appendChild(toastContainer);
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `tvToast tvToast--${type}`;
    toast.style.pointerEvents = 'auto';
    
    const icons = {
        success: 'check-circle',
        error: 'exclamation-circle',
        warning: 'exclamation-triangle',
        info: 'info-circle'
    };
    
    toast.innerHTML = `
        <i class="fas fa-${icons[type] || icons.info}"></i>
        <span>${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'tvToastSlideOut 0.3s ease forwards';
        setTimeout(() => {
            toast.remove();
            // Remove container if empty
            if (toastContainer.children.length === 0) {
                toastContainer.remove();
            }
        }, 300);
    }, 3000);
}

// ==========================================
// HIGHLIGHT AND SCROLL TO APPOINTMENT
// ==========================================
function highlightAndScrollToAppointment(appointmentId) {
    const aptRow = document.querySelector(`.aptRow[data-apt-id="${appointmentId}"]`);
    
    if (!aptRow) {
        console.warn(`⚠️ Appointment row not found for ID: ${appointmentId}`);
        return;
    }
    
    // Add highlight class
    aptRow.classList.add('tvHighlight');
    
    // Scroll to appointment (smooth scroll, centered)
    aptRow.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
    });
    
    // Remove highlight after animation (2 seconds)
    setTimeout(() => {
        aptRow.classList.remove('tvHighlight');
    }, 2000);
}

// ==========================================
// INITIALIZE ON PAGE LOAD
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initializeFirebase();
    
    // Set today's date as default in appointment form
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('appointmentDate');
    if (dateInput) {
        dateInput.value = today;
    }
    
    // Enhance native date/time pickers
    enhanceNativePickers();
    
    // Initialize modern time picker
    TimePicker.init();
    
    // Bind modal behaviors
    bindModalCloseBehavior();
    bindAppointmentsModalControls();
    
    // Bind appointment action buttons (delegated event handling)
    bindAppointmentsClickDelegation();
    
    // Deleted: bindStatsPopupButtons - removed per user request (no popups on stat cards)
});

// Deleted: confirmModal function - removed per user request

// ==========================================
// MODERN TIME PICKER
// ==========================================
const TimePicker = {
    overlay: null,
    input: null,
    hiddenInput: null,
    selectedHour: null,
    selectedMinute: null,
    
    init() {
        this.overlay = document.getElementById('timePicker');
        this.input = document.getElementById('appointmentTime');
        this.hiddenInput = document.getElementById('appointmentTimeValue');
        
        if (!this.overlay || !this.input) return;
        
        // Generate hours and minutes
        this.generateHours();
        this.generateMinutes();
        
        // Event listeners
        this.bindEvents();
    },
    
    generateHours() {
        const hourScroll = document.getElementById('hourScroll');
        if (!hourScroll) return;
        
        hourScroll.innerHTML = '';
        for (let h = 0; h < 24; h++) {
            const item = document.createElement('div');
            item.className = 'time-item';
            item.textContent = h.toString().padStart(2, '0');
            item.dataset.value = h;
            item.addEventListener('click', () => this.selectHour(h));
            hourScroll.appendChild(item);
        }
    },
    
    generateMinutes() {
        const minuteScroll = document.getElementById('minuteScroll');
        if (!minuteScroll) return;
        
        minuteScroll.innerHTML = '';
        // Generate minutes in 5-minute steps
        for (let m = 0; m < 60; m += 5) {
            const item = document.createElement('div');
            item.className = 'time-item';
            item.textContent = m.toString().padStart(2, '0');
            item.dataset.value = m;
            item.addEventListener('click', () => this.selectMinute(m));
            minuteScroll.appendChild(item);
        }
    },
    
    selectHour(hour) {
        this.selectedHour = hour;
        // Update UI
        document.querySelectorAll('#hourScroll .time-item').forEach(item => {
            item.classList.toggle('selected', parseInt(item.dataset.value) === hour);
        });
        // Auto-scroll to center
        const selected = document.querySelector('#hourScroll .time-item.selected');
        if (selected) {
            selected.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    },
    
    selectMinute(minute) {
        this.selectedMinute = minute;
        // Update UI
        document.querySelectorAll('#minuteScroll .time-item').forEach(item => {
            item.classList.toggle('selected', parseInt(item.dataset.value) === minute);
        });
        // Auto-scroll to center
        const selected = document.querySelector('#minuteScroll .time-item.selected');
        if (selected) {
            selected.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    },
    
    open() {
        // Parse existing value if any
        const currentValue = this.hiddenInput.value;
        if (currentValue && /^\d{2}:\d{2}$/.test(currentValue)) {
            const [h, m] = currentValue.split(':').map(Number);
            this.selectHour(h);
            this.selectMinute(this.roundToNearest5(m));
        } else {
            // Default to current time rounded to 5 minutes
            const now = new Date();
            this.selectHour(now.getHours());
            this.selectMinute(this.roundToNearest5(now.getMinutes()));
        }
        
        this.overlay.style.display = 'flex';
        
        // Focus quick input
        const quickInput = document.getElementById('timeQuickInput');
        if (quickInput) {
            quickInput.value = '';
            setTimeout(() => quickInput.focus(), 100);
        }
    },
    
    close() {
        this.overlay.style.display = 'none';
    },
    
    confirm() {
        if (this.selectedHour !== null && this.selectedMinute !== null) {
            const timeStr = `${this.selectedHour.toString().padStart(2, '0')}:${this.selectedMinute.toString().padStart(2, '0')}`;
            this.input.value = timeStr;
            this.hiddenInput.value = timeStr;
            this.close();
        }
    },
    
    setNow() {
        const now = new Date();
        this.selectHour(now.getHours());
        this.selectMinute(this.roundToNearest5(now.getMinutes()));
    },
    
    roundToNearest5(minutes) {
        return Math.round(minutes / 5) * 5;
    },
    
    parseQuickInput(input) {
        // Remove non-digits
        const digits = input.replace(/\D/g, '');
        
        if (digits.length === 3) {
            // e.g., "930" -> 09:30
            const h = parseInt(digits.substring(0, 1));
            const m = parseInt(digits.substring(1, 3));
            if (h >= 0 && h <= 9 && m >= 0 && m <= 59) {
                return { hour: h, minute: this.roundToNearest5(m) };
            }
        } else if (digits.length === 4) {
            // e.g., "1430" -> 14:30
            const h = parseInt(digits.substring(0, 2));
            const m = parseInt(digits.substring(2, 4));
            if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
                return { hour: h, minute: this.roundToNearest5(m) };
            }
        }
        
        return null;
    },
    
    bindEvents() {
        // Open picker on input click
        this.input.addEventListener('click', () => this.open());
        const wrapper = document.getElementById('timeInputWrapper');
        if (wrapper) {
            wrapper.addEventListener('click', () => this.open());
        }
        
        // Close button
        const closeBtn = this.overlay.querySelector('.time-picker-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }
        
        // Backdrop click
        const backdrop = this.overlay.querySelector('.time-picker-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', () => this.close());
        }
        
        // Cancel button
        const cancelBtn = this.overlay.querySelector('.btn-time-cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.close());
        }
        
        // OK button
        const okBtn = this.overlay.querySelector('.btn-time-ok');
        if (okBtn) {
            okBtn.addEventListener('click', () => this.confirm());
        }
        
        // Now button
        const nowBtn = this.overlay.querySelector('.btn-time-now');
        if (nowBtn) {
            nowBtn.addEventListener('click', () => this.setNow());
        }
        
        // Quick input
        const quickInput = document.getElementById('timeQuickInput');
        if (quickInput) {
            quickInput.addEventListener('input', (e) => {
                const parsed = this.parseQuickInput(e.target.value);
                if (parsed) {
                    this.selectHour(parsed.hour);
                    this.selectMinute(parsed.minute);
                }
            });
            
            quickInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.confirm();
                }
            });
        }
        
        // ESC key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlay.style.display === 'flex') {
                this.close();
            }
        });
    }
};

// ==========================================
// ENHANCE NATIVE DATE PICKER
// ==========================================
function enhanceNativePickers() {
    const dateInput = document.getElementById('appointmentDate');
    const dateWrap = document.getElementById('dateWrap');

    // Date picker (unchanged)
    if (dateWrap && dateInput && !dateWrap.dataset.bound) {
        dateWrap.addEventListener('click', () => {
            dateInput.focus();
            if (dateInput.showPicker) {
                try { dateInput.showPicker(); } catch (err) { console.log('showPicker not available or blocked'); }
            }
        });
        dateWrap.dataset.bound = "true";
    }
}

// ==========================================
// TAB SWITCHING
// ==========================================
function switchTab(tabName) {
    currentTab = tabName;
    
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });
    
    const activeTab = document.getElementById(`${tabName}Tab`);
    if (activeTab) {
        activeTab.classList.add('active');
        activeTab.style.display = 'block';
    }
    
    console.log(`📑 Switched to tab: ${tabName}`);
}

// ==========================================
// APPOINTMENTS MANAGEMENT
// ==========================================

// Subscribe to appointments real-time updates
function subscribeToAppointments() {
    if (!currentUser || !db) {
        console.log('⏳ Not ready to subscribe to appointments yet');
        return;
    }
    
    import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js')
                .then(({ collection, query, orderBy, onSnapshot }) => {
                    console.log('📥 Subscribing to appointments collection...');
                    
                    const q = query(collection(db, 'appointments'), orderBy('startAt', 'asc'));
                    
                    appointmentsUnsubscribe = onSnapshot(q, (snapshot) => {
                        appointments = snapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data()
                        }));
                        
                        console.log(`✅ Appointments loaded: ${appointments.length}`);
                        
                        // Filter and render
                        filterAppointments();
                        updateAppointmentStats();
                    }, (error) => {
                        console.error('❌ Error loading appointments:', error);
                        showNotification('❌ Eroare la încărcarea programărilor', 'error');
                    });
                })
                .catch((error) => {
                    console.error('❌ Error importing Firestore modules:', error);
                });
}

// Add new appointment (MODERN FORM)
async function handleAddAppointment(e) {
    e.preventDefault();
    
    if (!isAdmin) {
        showNotification('⚠️ Doar administratorii pot adăuga programări', 'error');
        return;
    }
    
    // Colectare date din formular
    const customerName = document.getElementById('customerName').value.trim();
    const customerPhone = document.getElementById('customerPhone').value.trim();
    const contactPref = document.getElementById('contactPref').value;
    const makeModel = document.getElementById('makeModel').value.trim();
    const regNumber = document.getElementById('regNumber').value.trim();
    const serviceLocation = document.getElementById('serviceLocation').value;
    const dateStr = document.getElementById('appointmentDate').value;
    const time = document.getElementById('appointmentTimeValue').value;
    const problemDescription = document.getElementById('problemDescription').value.trim();
    
    // Validare câmpuri required
    if (!customerName || !customerPhone || !contactPref || !makeModel || !regNumber || !serviceLocation || !dateStr || !time || !problemDescription) {
        showNotification('⚠️ Completează toate câmpurile obligatorii', 'error');
        return;
    }
    
    // Validare locație și adresă
    let address = '';
    let postcode = '';
    
    if (serviceLocation === 'client') {
        const clientAddress = document.getElementById('address').value.trim();
        postcode = document.getElementById('postcode').value.trim();
        
        if (!clientAddress || !postcode) {
            showNotification('⚠️ Completează adresa clientului (Adresă, Cod Poștal)', 'error');
            return;
        }
        
        address = clientAddress;
    } else if (serviceLocation === 'garage') {
        address = 'TransvortexLTD Mobile Mechanic, 81 Foley Rd, Birmingham B8 2JT';
        postcode = '';
    }
    
    // Validare format oră
    if (!/^\d{2}:\d{2}$/.test(time)) {
        showNotification('⚠️ Format oră invalid', 'error');
        return;
    }
    
    try {
        const { collection, addDoc, serverTimestamp, Timestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        // Crează obiect de dată cu oră
        const [year, month, day] = dateStr.split('-').map(Number);
        const [hours, minutes] = time.split(':').map(Number);
        const startDate = new Date(year, month - 1, day, hours, minutes, 0);
        
        console.log('📝 Adding appointment...');
        
        const docRef = await addDoc(collection(db, 'appointments'), {
            // Client info
            customerName,
            customerPhone,
            contactPref,
            
            // Vehicle info
            makeModel,
            regNumber,
            vehicle: makeModel + ' (' + regNumber + ')', // Compatibility field
            
            // Location
            serviceLocation,
            address,
            postcode: postcode || '',
            
            // Service details
            problemDescription,
            
            // Status (default to 'scheduled' for new appointments)
            status: 'scheduled',
            
            // Legacy fields for compatibility
            car: makeModel + ', ' + regNumber,
            
            // Timestamps
            time,
            startAt: Timestamp.fromDate(startDate),
            dateStr,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: currentUser.uid
        });
        
        console.log(`✅ Appointment added with ID: ${docRef.id}`);
        
        // Reset form
        e.target.reset();
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('appointmentDate').value = today;
        document.getElementById('appointmentTime').value = '';
        document.getElementById('appointmentTimeValue').value = '';
        
        // Reset location sections
        document.getElementById('serviceLocation').value = '';
        document.getElementById('garageAddressSection').style.display = 'none';
        document.getElementById('clientAddressSection').style.display = 'none';
        
        showNotification('✅ Programare adăugată cu succes!', 'success');
        showToast('Programare adăugată cu succes!', 'success');
        
        // Highlight and scroll to new appointment
        setTimeout(() => {
            highlightAndScrollToAppointment(docRef.id);
        }, 300);
        
    } catch (error) {
        console.error('❌ Error adding appointment:', error);
        showNotification('❌ Eroare la adăugarea programării: ' + error.message, 'error');
        showToast('Eroare la adăugarea programării', 'error');
    }
}
// ==========================================
// UTILITY: Split Vehicle & Registration
// ==========================================
/**
 * Parses combined vehicle string and extracts make/model and registration
 * Supports formats like:
 *   - "OPEL VIVARA (BV66HKE)"
 *   - "OPEL VIVARA - BV66HKE"
 *   - "OPEL VIVARA" (no reg, returns just make/model)
 * 
 * @param {string} inputString - Combined vehicle string
 * @returns {object} { vehicleMakeModel, regPlate }
 */
function splitVehicleAndReg(inputString) {
    if (!inputString || typeof inputString !== 'string') {
        return { vehicleMakeModel: '', regPlate: '' };
    }
    
    const input = inputString.trim();
    
    // Pattern 1: "OPEL VIVARA (BV66HKE)" or "OPEL VIVARA(BV66HKE)"
    const pattern1 = /^(.+?)\s*\((.+?)\)\s*$/;
    const match1 = input.match(pattern1);
    if (match1) {
        return {
            vehicleMakeModel: match1[1].trim(),
            regPlate: match1[2].trim()
        };
    }
    
    // Pattern 2: "OPEL VIVARA - BV66HKE" or "OPEL VIVARA -BV66HKE"
    const pattern2 = /^(.+?)\s*-\s*(.+?)\s*$/;
    const match2 = input.match(pattern2);
    if (match2) {
        return {
            vehicleMakeModel: match2[1].trim(),
            regPlate: match2[2].trim()
        };
    }
    
    // No pattern matched - return as vehicleMakeModel only
    return {
        vehicleMakeModel: input,
        regPlate: ''
    };
}

// Utility: Validate individual field (using design system classes)
function validateField(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field) return true;
    
    // Find parent .tvField container
    const tvField = field.closest('.tvField');
    
    // Legacy error element (fallback)
    const errorEl = document.getElementById(fieldId + '-error');
    
    let isValid = true;
    let errorMsg = '';
    
    const value = field.value.trim();
    
    // Check if required and empty
    if (field.hasAttribute('required') && !value) {
        isValid = false;
        errorMsg = 'Câmp obligatoriu';
    } else if (fieldId === 'regNumber' && value && value.length < 6) {
        isValid = false;
        errorMsg = 'Înmatriculare invalidă';
    }
    
    // Apply design system error state
    if (tvField) {
        if (!isValid) {
            tvField.classList.add('tvField--error');
            // Add error message if doesn't exist
            let errorSpan = tvField.querySelector('.tvError');
            if (!errorSpan) {
                errorSpan = document.createElement('span');
                errorSpan.className = 'tvError';
                tvField.appendChild(errorSpan);
            }
            errorSpan.textContent = errorMsg;
        } else {
            tvField.classList.remove('tvField--error');
            const errorSpan = tvField.querySelector('.tvError');
            if (errorSpan) errorSpan.remove();
        }
    }
    
    // Legacy error display (fallback for old markup)
    if (errorEl) {
        if (!isValid) {
            errorEl.textContent = errorMsg;
            field.classList.add('error');
        } else {
            errorEl.textContent = '';
            field.classList.remove('error');
        }
    }
    
    return isValid;
}

// Deleted: deleteAppointment function - removed per user request

// Mark appointment as canceled
async function cancelAppointment(id) {
    if (!isAdmin) return;
    
    try {
        const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        console.log(`❌ Canceling appointment ${id}...`);
        
        await updateDoc(doc(db, 'appointments', id), {
            status: 'canceled',
            updatedAt: serverTimestamp()
        });
        
        console.log(`✅ Appointment ${id} canceled`);
        showNotification('✅ Programare anulată', 'info');
        
    } catch (error) {
        console.error('❌ Error canceling appointment:', error);
        showNotification('❌ Eroare la anulare: ' + error.message, 'error');
    }
}

// Helpers for appointment state
function isAppointmentFinalized(apt) {
    return apt.finalized === true || apt.status === 'done' || apt.status === 'finalized';
}

function isAppointmentScheduled(apt) {
    if (apt.status === 'canceled') return false;
    return !isAppointmentFinalized(apt);
}

// Filter appointments (search + status select + active tab)
function filterAppointments() {
    const filterStatus = document.getElementById('filterStatus')?.value || 'all';
    const searchTerm = document.getElementById('searchAppointments')?.value.toLowerCase() || '';
    
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Update tab counts (unfiltered)
    const scheduledCount = appointments.filter(isAppointmentScheduled).length;
    const finalizedCount = appointments.filter(isAppointmentFinalized).length;
    const scheduledCountEl = document.getElementById('tabCountScheduled');
    const finalizedCountEl = document.getElementById('tabCountFinalized');
    if (scheduledCountEl) scheduledCountEl.textContent = scheduledCount;
    if (finalizedCountEl) finalizedCountEl.textContent = finalizedCount;
    
    filteredAppointments = appointments.filter(apt => {
        // Tab filter
        const inTab = activeAppointmentsTab === 'scheduled' ? isAppointmentScheduled(apt) : isAppointmentFinalized(apt);
        if (!inTab) return false;

        // Search filter
        const matchesSearch = !searchTerm ||
            (apt.customerName && apt.customerName.toLowerCase().includes(searchTerm)) ||
            (apt.car && apt.car.toLowerCase().includes(searchTerm)) ||
            (apt.makeModel && apt.makeModel.toLowerCase().includes(searchTerm)) ||
            (apt.regNumber && apt.regNumber.toLowerCase().includes(searchTerm));
        if (!matchesSearch) return false;
        
        // Status filter (keep existing filter dropdown semantics inside selected tab)
        if (filterStatus === 'all') return true;
        if (filterStatus === 'today') return apt.dateStr === todayStr;
        if (filterStatus === 'upcoming') {
            const aptDate = apt.startAt?.toDate ? apt.startAt.toDate() : new Date(apt.dateStr);
            return aptDate > now && apt.status === 'scheduled';
        }
        if (filterStatus === 'overdue') {
            const aptDate = apt.startAt?.toDate ? apt.startAt.toDate() : new Date(apt.dateStr);
            return aptDate < now && apt.status === 'scheduled';
        }
        return apt.status === filterStatus;
    });
    
    updateAppointmentsTabsUI();
    renderAppointments();
}

function setActiveAppointmentsTab(tab) {
    if (!tab || (tab !== 'scheduled' && tab !== 'finalized')) return;
    activeAppointmentsTab = tab;
    localStorage.setItem(APPOINTMENTS_TAB_KEY, tab);
    updateAppointmentsTabsUI();
    filterAppointments();
}

function updateAppointmentsTabsUI() {
    const tabs = document.querySelectorAll('[data-apt-tab]');
    tabs.forEach(btn => {
        const isActive = btn.dataset.aptTab === activeAppointmentsTab;
        if (isActive) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    const container = document.getElementById('appointmentsTabs');
    if (container) container.setAttribute('data-active-tab', activeAppointmentsTab);
}

function bindAppointmentsTabs() {
    const tabContainer = document.getElementById('appointmentsTabs');
    if (!tabContainer || tabContainer.dataset.bound) return;

    tabContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-apt-tab]');
        if (!btn) return;
        const tab = btn.dataset.aptTab;
        setActiveAppointmentsTab(tab);
    });

    tabContainer.dataset.bound = 'true';
    updateAppointmentsTabsUI();
}

// Render appointments grouped by day
function renderAppointments() {
    const container = document.getElementById('appointmentsList');
    const emptyState = document.getElementById('emptyStateAppointments');
    const tabEmptyMsg = activeAppointmentsTab === 'scheduled'
        ? 'Nu ai programări programate încă.'
        : 'Nu ai lucrări finalizate încă.';

    if (!filteredAppointments || filteredAppointments.length === 0) {
        container.innerHTML = '';
        if (emptyState) {
            emptyState.querySelector('h3').textContent = tabEmptyMsg;
            emptyState.style.display = 'block';
        }
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    
    // Group by date
    const grouped = {};
    filteredAppointments.forEach(apt => {
        const dateKey = apt.dateStr || apt.startAt.toDate().toISOString().split('T')[0];
        if (!grouped[dateKey]) {
            grouped[dateKey] = [];
        }
        grouped[dateKey].push(apt);
    });
    
    // Sort dates
    const sortedDates = Object.keys(grouped).sort();
    
    // Render
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const tomorrowStr = new Date(now.getTime() + 24*60*60*1000).toISOString().split('T')[0];
    
    let html = '';
    
    sortedDates.forEach(dateStr => {
        let dayLabel = dateStr;
        if (dateStr === todayStr) dayLabel = '🗓️ Astăzi (' + dateStr + ')';
        else if (dateStr === tomorrowStr) dayLabel = '📅 Mâine (' + dateStr + ')';
        else {
            const dayDate = new Date(dateStr + 'T00:00:00');
            const dayName = dayDate.toLocaleDateString('ro-RO', { weekday: 'long' });
            dayLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1) + ' (' + dateStr + ')';
        }
        
        html += `<div class="day-group">`;
        html += `<div class="day-header"><i class="fas fa-calendar-day"></i> ${dayLabel}</div>`;
        
        grouped[dateStr].forEach(apt => {
            html += createAppointmentCard(apt, now);
        });
        
        html += `</div>`;
    });
    
    container.innerHTML = html;
    
    // Bind delegation handler for appointment actions
    bindAppointmentsClickDelegation();
}

// Create appointment card HTML - COMPACT HORIZONTAL LAYOUT
function createAppointmentCard(apt) {
    const aptDate = apt.startAt.toDate();
    const timeDiff = aptDate - new Date();
    const minutesDiff = Math.floor(timeDiff / 60000);
    
    // Status badge
    let statusClass = 'status-scheduled';
    let statusIcon = 'fa-clock';
    let statusText = 'Programat';
    
    if (apt.status === 'done') {
        statusClass = 'status-done';
        statusIcon = 'fa-check-circle';
        statusText = 'Finalizat';
    } else if (apt.status === 'canceled') {
        statusClass = 'status-canceled';
        statusIcon = 'fa-times-circle';
        statusText = 'Anulat';
    }
    
    // Check if overdue
    const isOverdue = apt.status === 'scheduled' && minutesDiff < 0;
    const overdueClass = isOverdue ? 'aptRow--overdue' : '';
    
    const vehicleDisplay = apt.vehicle || apt.car || 'N/A';
    const regPlate = apt.regPlate || apt.registration || 'N/A';
    const mileage = apt.mileage ? ` • ${apt.mileage} km` : '';
    const location = apt.address ? apt.address.substring(0, 40) + (apt.address.length > 40 ? '...' : '') : 'N/A';
    
    // Full details for collapsible section
    const fullAddress = apt.address || 'N/A';
    const problemText = apt.problemDescription || apt.problem || 'N/A';
    const notesText = apt.notes || 'N/A';
    
    const hasDetails = apt.address || apt.problemDescription || apt.problem || apt.notes;
    
    // Butoane de acțiune (mobile-first layout) per tab
    const actionsHTML = apt.status !== 'canceled' ? `
        <div class="aptRow__actions">
            ${activeAppointmentsTab === 'scheduled' ? `
                <button class="apt-btn apt-btn-finalize" data-action="finalize" data-apt-id="${apt.id}" aria-label="Finalizează programarea">
                    <i class="fas fa-check-circle"></i>
                    <span>Finalizează</span>
                </button>
            ` : ''}
            ${apt.address ? `
                <button class="apt-btn apt-btn-visit" data-action="visit" data-apt-id="${apt.id}" aria-label="Vizitează locația">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>Vizitează</span>
                </button>
            ` : ''}
            ${activeAppointmentsTab === 'finalized' ? `
                <button class="apt-btn apt-btn-invoice" data-apt-id="${apt.id}" aria-label="Generează factură">
                    <i class="fas fa-file-invoice"></i>
                    <span>Invoice</span>
                </button>
            ` : ''}
            <button class="apt-btn apt-btn-edit" data-action="edit" data-apt-id="${apt.id}" aria-label="Editează programarea">
                <i class="fas fa-edit"></i>
                <span>Editează</span>
            </button>
            <button class="apt-btn apt-btn-delete" data-action="delete" data-apt-id="${apt.id}" aria-label="Șterge programarea">
                <i class="fas fa-trash-alt"></i>
                <span>Șterge</span>
            </button>
        </div>
    ` : '';
    
    return `
        <div class="aptRow ${overdueClass}" data-apt-id="${apt.id}">
            <div class="aptRow__header">
                <div class="aptRow__client">
                    <strong>${apt.customerName}</strong>
                </div>
                <div class="aptRow__badges">
                    <span class="status-badge ${statusClass}">
                        <i class="fas ${statusIcon}"></i> ${statusText}
                    </span>
                    ${isOverdue ? `<span class="reminder-badge reminder-overdue"><i class="fas fa-exclamation-triangle"></i> Întârziat</span>` : ''}
                </div>
            </div>
            <div class="aptRow__meta">
                <div class="aptRow__meta-item">
                    <i class="fas fa-clock"></i>
                    <span>${apt.time || 'N/A'}</span>
                </div>
                <div class="aptRow__meta-item">
                    <i class="fas fa-calendar"></i>
                    <span>${apt.dateStr || aptDate.toLocaleDateString('ro-RO')}</span>
                </div>
                <div class="aptRow__meta-item">
                    <i class="fas fa-car"></i>
                    <span>${vehicleDisplay}</span>
                </div>
                <div class="aptRow__meta-item">
                    <i class="fas fa-hashtag"></i>
                    <span>${regPlate}${mileage}</span>
                </div>
                <div class="aptRow__meta-item aptRow__meta-item--location">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>${location}</span>
                </div>
            </div>
            ${hasDetails ? `
                <button class="aptRow__toggleDetails" data-toggle="details" aria-expanded="false">
                    <i class="fas fa-chevron-down"></i>
                    <span>Detalii</span>
                </button>
                <div class="aptRow__details" hidden>
                    <div class="aptRow__detail-row">
                        <strong><i class="fas fa-map-marker-alt"></i> Adresă:</strong>
                        <span>${fullAddress}</span>
                    </div>
                    <div class="aptRow__detail-row">
                        <strong><i class="fas fa-clipboard"></i> Problemă:</strong>
                        <span>${problemText}</span>
                    </div>
                    <div class="aptRow__detail-row">
                        <strong><i class="fas fa-sticky-note"></i> Notițe:</strong>
                        <span>${notesText}</span>
                    </div>
                </div>
            ` : ''}
            ${actionsHTML}
        </div>
    `;
}

// Bind appointment action buttons using event delegation
function bindAppointmentsClickDelegation() {
    const container = document.getElementById('appointmentsList');
    if (!container) return;

    if (appointmentsClicksBound) return;

    container.addEventListener('click', async (e) => {
        // Handle details toggle
        const toggleBtn = e.target.closest('[data-toggle="details"]');
        if (toggleBtn) {
            e.preventDefault();
            const row = toggleBtn.closest('.aptRow');
            const detailsEl = row.querySelector('.aptRow__details');
            const icon = toggleBtn.querySelector('i');
            const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
            
            if (isExpanded) {
                detailsEl.hidden = true;
                toggleBtn.setAttribute('aria-expanded', 'false');
                icon.classList.remove('fa-chevron-up');
                icon.classList.add('fa-chevron-down');
            } else {
                detailsEl.hidden = false;
                toggleBtn.setAttribute('aria-expanded', 'true');
                icon.classList.remove('fa-chevron-down');
                icon.classList.add('fa-chevron-up');
            }
            return;
        }
        
        const btn = e.target.closest('button[data-apt-id]');
        if (!btn) return;

        const id = btn.dataset.aptId;
        const action = btn.dataset.action;
        
        if (!id) {
            console.error('[Main] Button clicked but data-apt-id is missing:', btn);
            showNotification('Programarea nu are ID - vă rugăm să reîmprospătați pagina', 'error');
            return;
        }

        // Special handling for Invoice button (no data-action by requirement)
        if (btn.classList.contains('apt-btn-invoice')) {
            e.preventDefault();
            try {
                const basePath = window.location.pathname.replace(/[^/]+$/, '');
                const url = basePath + 'invoice.html?aptId=' + encodeURIComponent(id);
                window.location.href = url;
            } catch (err) {
                console.error('[Main] Failed to navigate to invoice:', err);
                showNotification('Nu s-a putut deschide factura', 'error');
            }
            return;
        }

        // Import modal component
        const { confirmModal, openCustomModal } = await import('./src/modal.js');
        const appointment = appointments.find(a => a.id === id);

        // Handle actions
        switch(action) {
            case 'finalize':
                e.preventDefault();
                await handleFinalizeAction(id, appointment, openCustomModal);
                break;
                
            case 'visit':
                e.preventDefault();
                await handleVisitAction(id, appointment, confirmModal);
                break;

            case 'delete':
                e.preventDefault();
                await handleDeleteAction(id, appointment, confirmModal);
                break;
            
            case 'edit':
                e.preventDefault();
                await handleEditAction(id, appointment, openCustomModal);
                break;
                
            default:
                console.warn('[Main] Unknown action:', action);
        }
    });

    appointmentsClicksBound = true;
}

// ==========================================
// ACTION HANDLERS
// ==========================================

/**
 * Handle Finalize Action - Deschide modal pentru finalizare cu mile, VAT, servicii
 */
async function handleFinalizeAction(id, appointment, openCustomModal) {
    if (!appointment) {
        showNotification('Programarea nu a fost găsită', 'error');
        return;
    }

    // HTML pentru modal de finalizare
    const modalContent = `
        <form id="finalizeForm" class="finalize-form">
            <div class="form-field">
                <label for="finalizeMileage" class="form-label">
                    <i class="fas fa-road"></i> Mile la mașină <span class="required">*</span>
                </label>
                <input 
                    type="number" 
                    id="finalizeMileage" 
                    class="form-input" 
                    placeholder="Ex: 124500" 
                    min="0" 
                    step="1" 
                    required 
                    autocomplete="off"
                />
            </div>
            
            <div class="form-field">
                <label for="finalizeVatRate" class="form-label">
                    <i class="fas fa-percent"></i> VAT % (opțional)
                </label>
                <input 
                    type="number" 
                    id="finalizeVatRate" 
                    class="form-input" 
                    placeholder="Ex: 20" 
                    min="0" 
                    max="100" 
                    step="0.1" 
                    value="20"
                    autocomplete="off"
                />
            </div>
            
            <div class="form-field">
                <label class="form-label">
                    <i class="fas fa-list"></i> Servicii / Produse
                </label>
                <div class="services-mini-table">
                    <div class="services-row services-header">
                        <span>Descriere</span>
                        <span>Qty</span>
                        <span>Preț (£)</span>
                    </div>
                    <div id="servicesContainer">
                        <div class="services-row" data-row="1">
                            <input type="text" class="service-desc" placeholder="Descriere serviciu" />
                            <input type="number" class="service-qty" value="1" min="1" step="1" />
                            <input type="number" class="service-price" placeholder="0.00" min="0" step="0.01" />
                        </div>
                    </div>
                    <button type="button" class="btn-add-service" id="addServiceBtn">
                        <i class="fas fa-plus"></i> Adaugă serviciu
                    </button>
                </div>
                
                <div class="totals-mini">
                    <div class="totals-row">
                        <span>Subtotal:</span>
                        <strong id="subtotalDisplay">£0.00</strong>
                    </div>
                    <div class="totals-row">
                        <span>VAT:</span>
                        <strong id="vatDisplay">£0.00</strong>
                    </div>
                    <div class="totals-row totals-grand">
                        <span>Total:</span>
                        <strong id="totalDisplay">£0.00</strong>
                    </div>
                </div>
            </div>
            
            <div class="modal-footer-actions">
                <button type="button" class="modal-btn modal-btn-cancel" id="finalizeCancelBtn">
                    Anulează
                </button>
                <button type="submit" class="modal-btn modal-btn-success">
                    <i class="fas fa-check"></i> Finalizează + Salvează
                </button>
            </div>
        </form>
    `;

    const { panel, close } = openCustomModal({
        title: `Finalizează: ${appointment.customerName}`,
        content: modalContent,
        size: 'large'
    });

    // Setup form interactivity
    setupFinalizeForm(panel, id, close);
}

/**
 * Setup finalize form - calculează totaluri, adaugă servicii, submit
 */
function setupFinalizeForm(panel, appointmentId, closeModal) {
    const form = panel.querySelector('#finalizeForm');
    const addServiceBtn = panel.querySelector('#addServiceBtn');
    const servicesContainer = panel.querySelector('#servicesContainer');
    const cancelBtn = panel.querySelector('#finalizeCancelBtn');
    const vatInput = panel.querySelector('#finalizeVatRate');
    
    let serviceRowCount = 1;

    // Calculate totals
    const updateTotals = () => {
        const rows = servicesContainer.querySelectorAll('.services-row');
        let subtotal = 0;
        
        rows.forEach(row => {
            const qty = parseFloat(row.querySelector('.service-qty')?.value || 0);
            const price = parseFloat(row.querySelector('.service-price')?.value || 0);
            subtotal += qty * price;
        });
        
        const vatRate = parseFloat(vatInput.value || 0) / 100;
        const vatAmount = subtotal * vatRate;
        const total = subtotal + vatAmount;
        
        panel.querySelector('#subtotalDisplay').textContent = `£${subtotal.toFixed(2)}`;
        panel.querySelector('#vatDisplay').textContent = `£${vatAmount.toFixed(2)}`;
        panel.querySelector('#totalDisplay').textContent = `£${total.toFixed(2)}`;
    };

    // Add service row
    addServiceBtn.addEventListener('click', () => {
        serviceRowCount++;
        const newRow = document.createElement('div');
        newRow.className = 'services-row';
        newRow.dataset.row = serviceRowCount;
        newRow.innerHTML = `
            <input type="text" class="service-desc" placeholder="Descriere serviciu" />
            <input type="number" class="service-qty" value="1" min="1" step="1" />
            <input type="number" class="service-price" placeholder="0.00" min="0" step="0.01" />
            <button type="button" class="btn-remove-service" aria-label="Elimină">
                <i class="fas fa-times"></i>
            </button>
        `;
        servicesContainer.appendChild(newRow);
        
        // Remove service
        newRow.querySelector('.btn-remove-service').addEventListener('click', () => {
            newRow.remove();
            updateTotals();
        });
        
        // Update totals on change
        newRow.querySelectorAll('input[type="number"]').forEach(input => {
            input.addEventListener('input', updateTotals);
        });
    });

    // Update totals on existing inputs
    servicesContainer.addEventListener('input', (e) => {
        if (e.target.matches('input[type="number"]')) {
            updateTotals();
        }
    });
    
    vatInput.addEventListener('input', updateTotals);

    // Cancel
    cancelBtn.addEventListener('click', () => closeModal(false));

    // Submit form
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const mileage = parseInt(panel.querySelector('#finalizeMileage').value);
        let vatRateInput = parseFloat(panel.querySelector('#finalizeVatRate').value || 0);
        
        // ============================================
        // VALIDARE VAT: Fix pentru bug 2000%
        // Limită: 0-100%, default 20% dacă invalid
        // ============================================
        if (isNaN(vatRateInput) || vatRateInput < 0) {
            vatRateInput = 20; // Default
            showNotification('⚠️ VAT setat la 20% (default)', 'warning');
        } else if (vatRateInput > 100) {
            vatRateInput = 100; // Max cap
            showNotification('⚠️ VAT nu poate depăși 100%! Setat la 100%.', 'warning');
        }
        
        const vatRate = vatRateInput; // Stocat ca procent (nu decimal)
        
        if (!mileage || mileage < 0) {
            showNotification('⚠️ Mile obligatorii și trebuie să fie pozitive', 'warning');
            return;
        }

        // Collect services
        const services = [];
        const rows = servicesContainer.querySelectorAll('.services-row');
        
        rows.forEach(row => {
            const desc = row.querySelector('.service-desc').value.trim();
            const qty = parseFloat(row.querySelector('.service-qty').value || 0);
            const price = parseFloat(row.querySelector('.service-price').value || 0);
            
            if (desc && qty > 0) {
                services.push({
                    description: desc,
                    qty: qty,
                    unitPrice: price,
                    lineTotal: qty * price
                });
            }
        });

        if (services.length === 0) {
            showNotification('⚠️ Adaugă cel puțin un serviciu cu descriere', 'warning');
            return;
        }

        // Calculate totals
        const subtotal = services.reduce((sum, s) => sum + s.lineTotal, 0);
        const vatAmount = subtotal * (vatRate / 100);
        const total = subtotal + vatAmount;

        console.log(`[Finalize] VAT Rate: ${vatRate}%, VAT Amount: £${vatAmount.toFixed(2)}, Total: £${total.toFixed(2)}`);

        // Disable submit button
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Se salvează...';

        try {
            const { doc, updateDoc, Timestamp, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            
            await updateDoc(doc(db, 'appointments', appointmentId), {
                status: 'done',
                mileage: mileage,
                services: services,
                subtotal: subtotal,
                vatRate: vatRate / 100,
                vatAmount: vatAmount,
                total: total,
                doneAt: Timestamp.now(),
                updatedAt: serverTimestamp()
            });

            showNotification('✅ Programare finalizată cu succes!', 'success');
            closeModal(true);

        } catch (error) {
            console.error('[Finalize] Error:', error);
            showNotification('❌ Eroare la finalizare: ' + error.message, 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-check"></i> Finalizează + Salvează';
        }
    });

    // Initial calculation
    updateTotals();
}

/**
 * Handle Visit Action - Oferă opțiuni Google Maps / Apple Maps
 */
async function handleVisitAction(id, appointment, confirmModal) {
    if (!appointment || !appointment.address) {
        showNotification('⚠️ Nu există adresă pentru această programare', 'warning');
        return;
    }

    const address = encodeURIComponent(appointment.address);
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${address}`;
    const appleMapsUrl = `https://maps.apple.com/?q=${address}`;

    // Detectează dispozitivul
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isMac = /Macintosh|MacIntel/i.test(navigator.userAgent);

    const message = `
        <div style="text-align: center; margin-bottom: 1rem;">
            <p style="margin-bottom: 1.5rem; color: #6b7280;">Adresa: <strong>${appointment.address}</strong></p>
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                <a href="${googleMapsUrl}" target="_blank" class="maps-link maps-google">
                    <i class="fab fa-google"></i> Deschide în Google Maps
                </a>
                ${isIOS || isMac ? `
                    <a href="${appleMapsUrl}" class="maps-link maps-apple">
                        <i class="fas fa-map"></i> Deschide în Apple Maps
                    </a>
                ` : ''}
            </div>
        </div>
    `;

    // Folosim confirmModal doar pentru a afișa opțiunile (nu pentru confirmare)
    const modalDiv = document.createElement('div');
    modalDiv.className = 'modern-modal-overlay modern-modal-show';
    modalDiv.innerHTML = `
        <div class="modern-modal-backdrop"></div>
        <div class="modern-modal-panel modern-modal-primary">
            <div class="modern-modal-icon">
                <i class="fas fa-map-marker-alt"></i>
            </div>
            <div class="modern-modal-content">
                <h3 class="modern-modal-title">Vizitează Locația</h3>
                ${message}
            </div>
            <div class="modern-modal-actions">
                <button type="button" class="modern-modal-btn modern-modal-btn-cancel" data-action="close">
                    Închide
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modalDiv);
    document.body.style.overflow = 'hidden';

    const close = () => {
        modalDiv.classList.remove('modern-modal-show');
        setTimeout(() => {
            document.body.removeChild(modalDiv);
            document.body.style.overflow = '';
        }, 200);
    };

    modalDiv.querySelector('[data-action="close"]').addEventListener('click', close);
    modalDiv.querySelector('.modern-modal-backdrop').addEventListener('click', close);
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            close();
            document.removeEventListener('keydown', escHandler);
        }
    });
}

/**
 * Handle Delete Action - Confirmare simplă
 */
async function handleDeleteAction(id, appointment, confirmModal) {
    if (!appointment) {
        showNotification('Programarea nu a fost găsită', 'error');
        return;
    }

    const confirmed = await confirmModal({
        title: 'Șterge programarea',
        message: `Ești sigur că vrei să ștergi programarea pentru ${appointment.customerName}?\n\nAceastă acțiune este permanentă și nu poate fi anulată.`,
        icon: 'fa-trash-alt',
        confirmText: 'Șterge definitiv',
        cancelText: 'Anulează',
        variant: 'danger'
    });

    if (!confirmed) return;

    try {
        const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        await deleteDoc(doc(db, 'appointments', id));
        
        showNotification('✅ Programare ștearsă cu succes', 'success');
    } catch (error) {
        console.error('[Delete] Error:', error);
        showNotification('❌ Eroare la ștergere: ' + error.message, 'error');
    }
}

/**
 * Handle edit appointment action
 */
async function handleEditAction(id, appointment, openCustomModal) {
    if (!appointment) {
        showNotification('Programarea nu a fost găsită', 'error');
        return;
    }

    // HTML pentru modal de editare
    const modalContent = `
        <form id="editAppointmentForm" class="finalize-form">
            <div class="form-field">
                <label for="editCustomerName" class="form-label">
                    <i class="fas fa-user"></i> Nume Client <span class="required">*</span>
                </label>
                <input 
                    type="text" 
                    id="editCustomerName" 
                    class="form-input" 
                    placeholder="Ex: John Doe" 
                    required 
                    value="${appointment.customerName || ''}"
                    autocomplete="off"
                />
            </div>
            
            <div class="form-field">
                <label for="editDate" class="form-label">
                    <i class="fas fa-calendar"></i> Data <span class="required">*</span>
                </label>
                <input 
                    type="date" 
                    id="editDate" 
                    class="form-input" 
                    required 
                    value="${appointment.dateStr || ''}"
                />
            </div>
            
            <div class="form-field">
                <label for="editTime" class="form-label">
                    <i class="fas fa-clock"></i> Ora <span class="required">*</span>
                </label>
                <input 
                    type="time" 
                    id="editTime" 
                    class="form-input" 
                    required 
                    value="${appointment.time || ''}"
                />
            </div>
            
            <div class="form-field">
                <label for="editMakeModel" class="form-label">
                    <i class="fas fa-car"></i> Marca/Model <span class="optional">(opțional)</span>
                </label>
                <input 
                    type="text" 
                    id="editMakeModel" 
                    class="form-input" 
                    placeholder="Ex: OPEL VIVARA" 
                    autocomplete="off"
                />
                <small style="color: #999; margin-top: 4px; display: block;">Vehicle make and model (e.g., OPEL VIVARA)</small>
            </div>
            
            <div class="form-field">
                <label for="editRegNumber" class="form-label">
                    <i class="fas fa-hashtag"></i> Nr. Înmatriculare <span class="optional">(opțional)</span>
                </label>
                <input 
                    type="text" 
                    id="editRegNumber" 
                    class="form-input" 
                    placeholder="Ex: BV66HKE" 
                    autocomplete="off"
                />
                <small style="color: #999; margin-top: 4px; display: block;">Registration plate (e.g., BV66HKE)</small>
            </div>
            
            <div class="form-field">
                <label for="editMileage" class="form-label">
                    <i class="fas fa-road"></i> Kilometraj
                </label>
                <input 
                    type="number" 
                    id="editMileage" 
                    class="form-input" 
                    placeholder="Ex: 124500" 
                    min="0" 
                    step="1" 
                    value="${appointment.mileage || ''}"
                    autocomplete="off"
                />
            </div>
            
            <div class="form-field">
                <label for="editAddress" class="form-label">
                    <i class="fas fa-map-marker-alt"></i> Adresă / Locație
                </label>
                <input 
                    type="text" 
                    id="editAddress" 
                    class="form-input" 
                    placeholder="Ex: 123 Main Street, London" 
                    value="${appointment.address || ''}"
                    autocomplete="off"
                />
            </div>
            
            <div class="form-field">
                <label for="editProblem" class="form-label">
                    <i class="fas fa-clipboard"></i> Problemă / Serviciu Solicitat
                </label>
                <textarea 
                    id="editProblem" 
                    class="form-input" 
                    placeholder="Descrierea problemei sau serviciului solicitat..."
                    rows="3"
                >${appointment.problemDescription || appointment.problem || ''}</textarea>
            </div>
            
            <div class="form-field">
                <label for="editNotes" class="form-label">
                    <i class="fas fa-sticky-note"></i> Notițe
                </label>
                <textarea 
                    id="editNotes" 
                    class="form-input" 
                    placeholder="Notițe adiționale..."
                    rows="2"
                >${appointment.notes || ''}</textarea>
            </div>
            
            <div class="form-field">
                <label for="editStatus" class="form-label">
                    <i class="fas fa-info-circle"></i> Status
                </label>
                <select id="editStatus" class="form-input">
                    <option value="scheduled" ${appointment.status === 'scheduled' ? 'selected' : ''}>Programat</option>
                    <option value="done" ${appointment.status === 'done' ? 'selected' : ''}>Finalizat</option>
                    <option value="canceled" ${appointment.status === 'canceled' ? 'selected' : ''}>Anulat</option>
                </select>
            </div>
            
            <div class="modal-footer-actions">
                <button type="button" class="modal-btn modal-btn-cancel" id="editCancelBtn">
                    Anulează
                </button>
                <button type="submit" class="modal-btn modal-btn-success">
                    <i class="fas fa-save"></i> Salvează Modificările
                </button>
            </div>
        </form>
    `;

    const { panel, close } = openCustomModal({
        title: `Editează: ${appointment.customerName}`,
        content: modalContent,
        size: 'large'
    });

    const form = panel.querySelector('#editAppointmentForm');
    const cancelBtn = panel.querySelector('#editCancelBtn');
    
    // Prefill vehicle and registration by parsing the combined string
    const vehicleData = splitVehicleAndReg(
        appointment.vehicle || appointment.makeModel || appointment.car || ''
    );
    const editMakeModelInput = panel.querySelector('#editMakeModel');
    const editRegNumberInput = panel.querySelector('#editRegNumber');
    
    if (editMakeModelInput) {
        editMakeModelInput.value = vehicleData.vehicleMakeModel;
    }
    if (editRegNumberInput) {
        editRegNumberInput.value = vehicleData.regPlate;
    }

    // Cancel
    cancelBtn.addEventListener('click', () => close(false));

    // Submit form
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Collect form data
        const customerName = panel.querySelector('#editCustomerName').value.trim();
        const date = panel.querySelector('#editDate').value;
        const time = panel.querySelector('#editTime').value;
        const makeModel = panel.querySelector('#editMakeModel').value.trim();
        const regNumber = panel.querySelector('#editRegNumber').value.trim();
        const mileage = panel.querySelector('#editMileage').value;
        const address = panel.querySelector('#editAddress').value.trim();
        const problem = panel.querySelector('#editProblem').value.trim();
        const notes = panel.querySelector('#editNotes').value.trim();
        const status = panel.querySelector('#editStatus').value;
        
        // Validate
        if (!customerName || !date || !time) {
            showNotification('⚠️ Nume client, dată și oră sunt obligatorii', 'warning');
            return;
        }
        
        try {
            // Create update object
            const updateData = {
                customerName,
                dateStr: date,
                time,
                status
            };
            
            // Add vehicle fields - store as separate fields for consistency
            if (makeModel) updateData.makeModel = makeModel;
            if (regNumber) updateData.regNumber = regNumber;
            
            // Also update the combined 'vehicle' field for display compatibility
            if (makeModel || regNumber) {
                updateData.vehicle = makeModel + (regNumber ? ` (${regNumber})` : '');
            }
            
            if (mileage) updateData.mileage = parseInt(mileage);
            if (address) updateData.address = address;
            if (problem) updateData.problemDescription = problem;
            if (notes) updateData.notes = notes;
            
            // Update startAt timestamp
            const dateTime = new Date(`${date}T${time}`);
            const { Timestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            updateData.startAt = Timestamp.fromDate(dateTime);
            
            // Update Firestore
            const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            await updateDoc(doc(db, 'appointments', id), updateData);
            
            // Update local appointment object
            Object.assign(appointment, updateData);
            
            // Update the DOM row in place
            const row = document.querySelector(`.aptRow[data-apt-id="${id}"]`);
            if (row) {
                const newHTML = createAppointmentCard(appointment);
                const temp = document.createElement('div');
                temp.innerHTML = newHTML;
                row.replaceWith(temp.firstElementChild);
            }
            
            close(false);
            showNotification('✅ Programare actualizată cu succes', 'success');
        } catch (error) {
            console.error('[Edit] Error:', error);
            showNotification('❌ Eroare la actualizare: ' + error.message, 'error');
        }
    });
}

// Export appointments to CSV
function exportAppointmentsCSV() {
    if (filteredAppointments.length === 0) {
        showNotification('⚠️ Nicio programare de exportat', 'info');
        return;
    }
    
    // CSV Header
    let csv = 'Data,Ora,Client,Mașină,Adresă,Status,Notițe\n';
    
    // CSV Rows
    filteredAppointments.forEach(apt => {
        const row = [
            apt.dateStr || '',
            apt.time || '',
            apt.customerName || '',
            apt.car || '',
            apt.address || '',
            apt.status || '',
            (apt.notes || '').replace(/"/g, '""') // Escape quotes
        ];
        csv += row.map(field => `"${field}"`).join(',') + '\n';
    });
    
    // Create download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const today = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `appointments_${today}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification(`✅ Export CSV: ${filteredAppointments.length} programări`, 'success');
    console.log(`📄 Exported ${filteredAppointments.length} appointments to CSV`);
}

// Setup form listeners (called once after auth)
function setupEventListeners() {
    const pageForm = document.getElementById('pageForm');
    if (pageForm && !pageForm.dataset.bound) {
        pageForm.addEventListener('submit', handleAddPage);
        pageForm.dataset.bound = 'true';
    }
    
    const appointmentForm = document.getElementById('appointmentForm');
    if (appointmentForm && !appointmentForm.dataset.bound) {
        appointmentForm.addEventListener('submit', handleAddAppointment);
        appointmentForm.dataset.bound = 'true';
        setupAppointmentFormLogic();
    }

    // Tabs for appointments list
    bindAppointmentsTabs();
}

// Modern appointment form logic
function setupAppointmentFormLogic() {
    // 1. Toggle location sections based on serviceLocation dropdown
    const serviceLocationSelect = document.getElementById('serviceLocation');
    const garageSection = document.getElementById('garageAddressSection');
    const clientSection = document.getElementById('clientAddressSection');
    
    if (serviceLocationSelect) {
        serviceLocationSelect.addEventListener('change', (e) => {
            if (e.target.value === 'garage') {
                if (garageSection) garageSection.style.display = 'block';
                if (clientSection) clientSection.style.display = 'none';
                // Clear client address fields
                document.getElementById('address').value = '';
                document.getElementById('postcode').value = '';
            } else if (e.target.value === 'client') {
                if (garageSection) garageSection.style.display = 'none';
                if (clientSection) clientSection.style.display = 'block';
            } else {
                if (garageSection) garageSection.style.display = 'none';
                if (clientSection) clientSection.style.display = 'none';
            }
        });
    }
    
    // 2. Force UPPERCASE for makeModel and regNumber
    const makeModelInput = document.getElementById('makeModel');
    const regNumberInput = document.getElementById('regNumber');
    
    if (makeModelInput) {
        makeModelInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }
    
    if (regNumberInput) {
        regNumberInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }
    
    // 3. Real-time validation feedback (optional - can add error messages on change)
    const requiredFields = [
        'customerName', 'customerPhone', 'contactPref', 'makeModel', 'regNumber',
        'serviceLocation', 'appointmentDate', 'appointmentTime',
        'problemDescription'
    ];
    
    // Optionally add visual feedback on blur
    requiredFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('blur', () => {
                validateField(fieldId);
            });
        }
    });
}

// ==============================
// MODALS - open/close helpers
// ==============================
function openModal(id) {
    const el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el) return;
    el.style.display = 'flex';
}

function closeModal(id) {
    const el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el) return;
    el.style.display = 'none';
}

// Close modals on backdrop click + ESC
function bindModalCloseBehavior() {
    const modalIds = ['appointmentsModal'];

    modalIds.forEach(mid => {
        const backdrop = document.getElementById(mid);
        if (!backdrop || backdrop.dataset.bound) return;

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) closeModal(mid);
        });

        backdrop.dataset.bound = "true";
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal('appointmentsModal');
        }
    });

    // Close buttons
    const aClose = document.getElementById('appointmentsModalClose');
    if (aClose && !aClose.dataset.bound) {
        aClose.addEventListener('click', () => closeModal('appointmentsModal'));
        aClose.dataset.bound = "true";
    }

    // Deleted: finalize modal bindings - removed per user request
}

// Deleted: bindStatsPopupButtons function - removed per user request (no popups on stat cards)

// Deleted: openAppointmentsPopup function - removed per user request (no popups on stat cards)

function renderAppointmentsModalList(appointments) {
  const list = document.getElementById('appointmentsModalList');
  if (!list) return;
  
  if (!appointments || appointments.length === 0) {
    list.innerHTML = '<div class="empty-state show"><p>Nu există programări finalizate.</p></div>';
    return;
  }
  
  list.innerHTML = appointments.map(apt => `
    <div class="appointment-modal-item" data-apt-id="${apt.id}">
      <div class="apt-modal-header">
        <div class="apt-modal-info">
          <strong>${apt.customerName || apt.name || 'Fără nume'}</strong>
          <span class="apt-modal-date">${apt.date || 'Fără dată'}</span>
        </div>
        <div class="apt-modal-actions">
          <!-- Deleted: Invoice button - removed per user request -->
        </div>
      </div>
      <div class="apt-modal-details">
        <div><strong>Mașină:</strong> ${apt.vehicle || 'N/A'}</div>
        <div><strong>Mile:</strong> ${apt.mileage || 'N/A'}</div>
        <div><strong>Total:</strong> ${formatGBP(apt.totalAmount || 0)}</div>
      </div>
    </div>
  `).join('');
}

// Bind modal controls events
function bindAppointmentsModalControls() {
    const s = document.getElementById('modalSearch');
    const f = document.getElementById('modalStatusFilter');
    if (s && !s.dataset.bound) {
        s.addEventListener('input', renderAppointmentsModalList);
        s.dataset.bound = "true";
    }
    if (f && !f.dataset.bound) {
        f.addEventListener('change', renderAppointmentsModalList);
        f.dataset.bound = "true";
    }
}

// Deleted: bindFinalizeModalControls function - removed per user request

// Update appointment stats in UI
function updateAppointmentStats() {
    const totalEl = document.getElementById('totalAppointments');
    const todayEl = document.getElementById('todayAppointments');
    const upcomingEl = document.getElementById('upcomingAppointments');
    const doneEl = document.getElementById('doneAppointments');

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const total = appointments.length;
    const today = appointments.filter(a => a.dateStr === todayStr).length;
    const upcoming = appointments.filter(a => a.startAt?.toDate && a.startAt.toDate() > now && a.status === 'scheduled').length;
    const done = appointments.filter(a => a.status === 'done').length;

    if (totalEl) totalEl.textContent = total;
    if (todayEl) todayEl.textContent = today;
    if (upcomingEl) upcomingEl.textContent = upcoming;
    if (doneEl) doneEl.textContent = done;
}

// Expose needed functions to avoid ReferenceError in other files
window.updateAppointmentStats = updateAppointmentStats;

// ============================================
// INVOICE SYSTEM INTEGRATION
// ============================================

/**
 * Create invoice data from appointment
 * Called when user clicks "View Invoice" or "Download Invoice" on an appointment
 * Stores data in sessionStorage and opens invoice.html
 */
function createInvoiceFromAppointment(appointment) {
    if (!appointment || !appointment.customerName) {
        showNotification('⚠️ Cannot generate invoice: Missing client information', 'error');
        return;
    }

    // Create invoice data structure
    const invoiceData = {
        company: {
            name: 'Transvortex LTD',
            address: '81 Foley Rd, Birmingham B8 2JT',
            website: 'https://transvortexltd.co.uk/',
            facebook: 'https://www.facebook.com/profile.php?id=61586007316302',
            call: 'Iulian +44 7478280954',
            emergency: 'Mihai +44 7440787527'
        },
        client: {
            name: appointment.customerName || '',
            address: appointment.address || '',
            phone: appointment.customerPhone || '',
            vehicle: appointment.makeModel || '',
            regPlate: appointment.regNumber || '',
            mileage: appointment.mileage || ''
        },
        // Default empty items - can be added via invoice UI
        items: appointment.items || [
            {
                description: appointment.problemDescription || 'Service',
                qty: 1,
                unitPrice: 0
            }
        ],
        invoiceNumber: appointment.invoiceNumber || null,
        invoiceDate: appointment.appointmentDate || new Date().toISOString().split('T')[0],
        dueDate: null, // Will be calculated (7 days after invoice date)
        pin: null, // Will be generated
        paymentTerms: 'Due within 7 days',
        vatPercent: 0,
        
        // Metadata for reference
        appointmentId: appointment.id || null,
        appointmentDate: appointment.appointmentDate,
        appointmentTime: appointment.appointmentTime
    };

    // Store in sessionStorage
    try {
        sessionStorage.setItem('tvx.invoiceData', JSON.stringify(invoiceData));
        
        // Open invoice.html in new tab or same window
        // Using relative path that works in both Go Live and GitHub Pages
        const invoiceUrl = './invoice.html';
        window.open(invoiceUrl, '_blank');
    } catch (error) {
        console.error('Error storing invoice data:', error);
        showNotification('❌ Error generating invoice. Please try again.', 'error');
    }
}

// Expose to global scope
window.createInvoiceFromAppointment = createInvoiceFromAppointment;

/**
 * Open invoice for a given appointment ID
 * - Finds appointment in local cache; if not found, attempts to fetch
 * - Normalizes items and fields
 * - Stores in sessionStorage under key "tvx.invoiceData"
 * - Opens invoice.html via relative URL
 */
async function openInvoiceForAppointment(appointmentId) {
    try {
        let appointment = appointments.find(a => a.id === appointmentId);
        if (!appointment) {
            // Fallback: fetch directly from Firestore if available
            try {
                const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
                const snap = await getDoc(doc(db, 'appointments', appointmentId));
                if (snap?.exists()) appointment = { id: snap.id, ...snap.data() };
            } catch (err) {
                console.warn('[Invoice] Could not fetch appointment, proceeding with minimal data:', err);
            }
        }

        if (!appointment) {
            showNotification('❌ Nu s-a găsit programarea pentru factură', 'error');
            return;
        }

        const normalizeItems = (apt) => {
            const src = apt.invoiceItems || apt.items || apt.services || null;
            if (Array.isArray(src) && src.length) {
                return src.map(it => ({
                    description: it.description || it.name || it.service || apt.problemDescription || 'Service',
                    qty: Number(it.qty ?? it.quantity ?? 1),
                    unitPrice: Number(it.unitPrice ?? it.price ?? it.cost ?? 0)
                }));
            }
            const desc = apt.problemDescription || apt.notes || 'Service';
            return [{ description: desc, qty: 1, unitPrice: 0 }];
        };

        const todayISO = () => new Date().toISOString().split('T')[0];
        const plusDaysISO = (days) => {
            const d = new Date();
            d.setDate(d.getDate() + days);
            return d.toISOString().split('T')[0];
        };
        const generatePin = () => `TVX-${Math.floor(Math.random()*10000).toString().padStart(4,'0')}`;
        const generateInvoiceNumberStable = (id) => {
            const now = new Date();
            const yy = String(now.getFullYear()).slice(2);
            const mm = String(now.getMonth()+1).padStart(2,'0');
            const dd = String(now.getDate()).padStart(2,'0');
            const short = (id || 'INV').toString().slice(-6).toUpperCase();
            return `INV-${short}-${yy}${mm}${dd}`;
        };

        const invoiceData = {
            company: {
                name: 'Transvortex LTD',
                address: '81 Foley Rd, Birmingham B8 2JT',
                website: 'https://transvortexltd.co.uk/',
                facebook: 'https://www.facebook.com/profile.php?id=61586007316302',
                call: 'Iulian +44 7478280954',
                emergency: 'Mihai +44 7440787527'
            },
            invoiceNumber: generateInvoiceNumberStable(appointmentId),
            invoiceDate: todayISO(),
            dueDate: plusDaysISO(7),
            pin: generatePin(),
            paymentTerms: 'Due within 7 days',
            client: {
                name: appointment.customerName || appointment.clientName || appointment.name || '',
                address: appointment.address || '',
                phone: appointment.customerPhone || appointment.phone || '',
                vehicle: appointment.makeModel || appointment.vehicle || appointment.car || '',
                regPlate: appointment.regNumber || appointment.regPlate || appointment.plate || '',
                mileage: appointment.mileageFinal ?? appointment.mileage ?? ''
            },
            vatPercent: appointment.vatPercent ?? appointment.vat ?? 0,
            items: normalizeItems(appointment),
            notes: appointment.notes || ''
        };

        // Persist to sessionStorage under namespaced key
        try {
            sessionStorage.setItem('tvx.invoiceData', JSON.stringify(invoiceData));
        } catch (err) {
            console.error('[Invoice] Failed to store invoiceData:', err);
        }

        const getInvoiceUrl = () => {
            const href = window.location.href;
            const base = href.replace(/[^/]*$/, '');
            return base + 'invoice.html';
        };

        window.open(getInvoiceUrl(), '_blank', 'noopener');
    } catch (error) {
        console.error('[Invoice] Error opening invoice:', error);
        showNotification('❌ A apărut o eroare la generarea facturii', 'error');
    }
}

// Expose openInvoiceForAppointment globally
window.openInvoiceForAppointment = openInvoiceForAppointment;




