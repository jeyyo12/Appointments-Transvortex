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
                        appointments = snapshot.docs.map(doc => normalizeAppointmentMileage({
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
    const vehicleMakeModel = document.getElementById('makeModel').value.trim();
    const registrationPlate = document.getElementById('regNumber').value.trim();
    const serviceLocation = document.getElementById('serviceLocation').value;
    const dateStr = document.getElementById('appointmentDate').value;
    const time = document.getElementById('appointmentTimeValue').value;
    const problemDescription = document.getElementById('problemDescription').value.trim();
    
    // Validare câmpuri required (vehicle and address are now OPTIONAL)
    if (!customerName || !customerPhone || !contactPref || !registrationPlate || !serviceLocation || !dateStr || !time || !problemDescription) {
        showNotification('⚠️ Completează toate câmpurile obligatorii', 'error');
        return;
    }
    
    // Validare locație și adresă (address is OPTIONAL even for client service)
    let address = '';
    let postcode = '';
    
    if (serviceLocation === 'client') {
        const clientAddress = document.getElementById('address').value.trim();
        postcode = document.getElementById('postcode').value.trim();
        
        // Address is now optional - only validate if user entered it
        if (clientAddress) {
            address = clientAddress;
        }
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
        
        // Build payload with only non-empty optional fields
        const payload = {
            // Client info (required)
            customerName,
            customerPhone,
            contactPref,
            
            // Registration plate (required)
            registrationPlate,
            regNumber: registrationPlate, // Legacy compatibility
            
            // Location (required)
            serviceLocation,
            
            // Service details (required)
            problemDescription,
            
            // Status (default to 'scheduled' for new appointments)
            status: 'scheduled',
            
            // Timestamps (required)
            time,
            startAt: Timestamp.fromDate(startDate),
            dateStr,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: currentUser.uid
        };
        
        // Add optional fields only if they have values
        if (vehicleMakeModel) {
            payload.vehicleMakeModel = vehicleMakeModel;
            payload.makeModel = vehicleMakeModel; // Legacy compatibility
            payload.vehicle = vehicleMakeModel + ' • ' + registrationPlate; // Compatibility field
            payload.car = vehicleMakeModel + ', ' + registrationPlate; // Legacy
        }
        
        if (address) {
            payload.address = address;
        }
        
        if (postcode) {
            payload.postcode = postcode;
        }
        
        const docRef = await addDoc(collection(db, 'appointments'), payload);
        
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

// Normalize mileage to a single optional field
function coalesceMileageValue(apt) {
    if (!apt) return null;
    const candidate = apt.mileage ?? apt.mileageFinal ?? apt.finalMileage ?? apt.kmFinal ?? apt.finalKm ?? apt.odometer;
    if (candidate === undefined || candidate === null || candidate === '') return null;
    const asNumber = Number(candidate);
    return Number.isFinite(asNumber) ? asNumber : candidate;
}

function normalizeAppointmentMileage(apt) {
    if (!apt) return apt;
    const mileageValue = coalesceMileageValue(apt);
    if (apt.mileage === undefined || apt.mileage === null || apt.mileage === '') {
        apt.mileage = mileageValue;
    }
    // Do not propagate legacy keys forward
    delete apt.mileageFinal;
    delete apt.finalMileage;
    delete apt.kmFinal;
    delete apt.finalKm;
    delete apt.odometer;
    return apt;
}

// Normalize appointment fields with fallbacks for legacy Firestore keys
// SINGLE SOURCE OF TRUTH - Used by all flows (Add/Edit/Finalize/Invoice)
function normalizeAppointment(apt) {
    if (!apt) return {};
    
    // Helper to extract make/model and plate from combined vehicle field (e.g., "BMW X5 • ABC123")
    function parseVehicleField(vehicleStr) {
        if (!vehicleStr) return { make: '', plate: '' };
        const parts = vehicleStr.split('•').map(p => p.trim());
        return {
            make: parts[0] || '',
            plate: parts[1] || ''
        };
    }
    
    // Vehicle make/model: prefer dedicated field, fallback to parsing combined vehicle field
    let vehicleMakeModel = apt.vehicleMakeModel || apt.makeModel || '';
    let registrationPlate = apt.registrationPlate || apt.regNumber || '';
    
    // Try to parse from combined "vehicle" or "car" field if dedicated fields missing
    if (!vehicleMakeModel || !registrationPlate) {
        const combinedVehicle = apt.vehicle || apt.car || '';
        const parsed = parseVehicleField(combinedVehicle);
        if (!vehicleMakeModel) vehicleMakeModel = parsed.make;
        if (!registrationPlate) registrationPlate = parsed.plate;
    }
    
    const customerName = (apt.customerName || '').trim();
    const customerPhone = ((apt.customerPhone || apt.phone || '').trim());
    const dateStr = (apt.dateStr || apt.date || '').trim();
    const time = (apt.time || '').trim();
    const address = (apt.address || '').trim();
    const serviceLocation = (apt.serviceLocation || '').trim();
    const contactPref = (apt.contactPref || '').trim();
    const problemDescription = ((apt.problemDescription || apt.problem || '').trim());
    const notes = (apt.notes || '').replace(/\s+/g, ' ').trim();
    const registrationPlateNorm = registrationPlate.toUpperCase().trim();
    const vehicleMakeModelNorm = vehicleMakeModel.replace(/\s+/g, ' ').trim();
    const status = apt.status || 'scheduled';
    
    return {
        customerName,
        customerPhone,
        vehicleMakeModel: vehicleMakeModelNorm,
        registrationPlate: registrationPlateNorm,
        dateStr,
        time,
        address,
        serviceLocation,
        contactPref,
        problemDescription,
        notes,
        status
    };
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
                // Build day label string per spec (Azi/Mâine) else weekday
                let dayLabel = dateStr;
                if (dateStr === todayStr) dayLabel = 'Azi (' + dateStr + ')';
                else if (dateStr === tomorrowStr) dayLabel = 'Mâine (' + dateStr + ')';
                else {
                        const dayDate = new Date(dateStr + 'T00:00:00');
                        const dayName = dayDate.toLocaleDateString('ro-RO', { weekday: 'long' });
                        dayLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1) + ' (' + dateStr + ')';
                }

                // Per-day structure (header outside scroll container)
                html += `
<section class="tvDayGroup" data-day="${dateStr}">
    <div class="tvDayHeader">${dayLabel}</div>
    <div class="tvCarousel" role="region" aria-label="Appointments carousel for ${dateStr}">
        <div class="tvTrack">
`;

                grouped[dateStr].forEach(apt => {
                        html += `
            <article class="tvCard" data-apt-id="${apt.id}">
                ${createAppointmentCard(apt, now)}
            </article>
`;
                });

                html += `
        </div>
    </div>
</section>
`;
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
    
    // Normalize appointment data
    const normalized = normalizeAppointment(apt);
    
    // Status badge
    let statusClass = 'status-scheduled';
    let statusIcon = 'fa-clock';
    let statusText = 'Programat';
    
    if (normalized.status === 'done') {
        statusClass = 'status-done';
        statusIcon = 'fa-check-circle';
        statusText = 'Finalizat';
    } else if (normalized.status === 'canceled') {
        statusClass = 'status-canceled';
        statusIcon = 'fa-times-circle';
        statusText = 'Anulat';
    }
    
    // Check if overdue
    const isOverdue = normalized.status === 'scheduled' && minutesDiff < 0;
    const overdueClass = isOverdue ? 'aptRow--overdue' : '';
    
    // Butoane de acțiune (mobile-first layout) per tab
    const actionsHTML = normalized.status !== 'canceled' ? `
        <div class="aptRow__actions">
            ${activeAppointmentsTab === 'scheduled' ? `
                <button class="apt-btn apt-btn-finalize" data-action="finalize" data-apt-id="${apt.id}" aria-label="Finalizează programarea">
                    <i class="fas fa-check-circle"></i>
                    <span>Finalizează</span>
                </button>
            ` : ''}
            ${normalized.address ? `
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
            <button class="apt-btn apt-btn-whatsapp" data-action="whatsapp" data-apt-id="${apt.id}" aria-label="Partajează pe WhatsApp">
                <i class="fab fa-whatsapp"></i>
                <span>WhatsApp</span>
            </button>
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
            <!-- Card Header: ONLY Client Name + Status Chip -->
            <div class="tvCardHeader">
                <h3 class="tvCardName">${normalized.customerName}</h3>
                <div class="tvCardBadges">
                    <span class="tvStatusChip ${statusClass}">
                        <i class="fas ${statusIcon}"></i>
                        <span>${statusText}</span>
                    </span>
                    ${isOverdue ? `<span class="tvOverdueChip"><i class="fas fa-exclamation-triangle"></i></span>` : ''}
                </div>
            </div>
            
            <!-- Detalii: now opens modern modal -->
            <button class="tvDetailsBtn" data-apt-id="${apt.id}" aria-label="Deschide detalii programare">
                <i class="fas fa-info-circle"></i>
                <span>Detalii</span>
            </button>

            <!-- Action Buttons -->
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
        // Handle modern details modal open
        const detailsBtn = e.target.closest('.tvDetailsBtn[data-apt-id]');
        if (detailsBtn) {
            e.preventDefault();
            const id = detailsBtn.dataset.aptId;
            const appointment = appointments.find(a => a.id === id);
            if (!appointment) {
                showNotification('Programarea nu a fost găsită', 'error');
                return;
            }
            openDetailsModal(appointment);
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

            case 'whatsapp':
                e.preventDefault();
                handleWhatsAppShare(id, appointment);
                break;
                
            default:
                console.warn('[Main] Unknown action:', action);
        }
    });

    appointmentsClicksBound = true;
}

// ==========================================
// DETAILS MODAL - Modern overlay with history integration
// ==========================================

let detailsModalEl = null;
let detailsPopHandler = null;

function openDetailsModal(appointment) {
    if (!appointment) return;

    // Close any existing details modal
    closeDetailsModal(false);

    const normalized = normalizeAppointment(appointment);
    const overlay = buildDetailsModalElement(normalized, appointment);
    detailsModalEl = overlay;

    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');

    // Show with small delay for transition
    requestAnimationFrame(() => {
        overlay.classList.add('tvDetailsModalOverlay--show');
    });

    // History push for back button close
    history.pushState({ tvModal: 'details', id: appointment.id }, '');

    detailsPopHandler = (event) => {
        if (detailsModalEl) {
            closeDetailsModal(false);
        }
    };

    window.addEventListener('popstate', detailsPopHandler);

    // Wire close interactions
    const closeBtn = overlay.querySelector('[data-close="details"]');
    closeBtn?.addEventListener('click', () => closeDetailsModal());
    overlay.addEventListener('click', (e) => {
        if (e.target.classList.contains('tvDetailsModalOverlay')) {
            closeDetailsModal();
        }
    });
}

function closeDetailsModal(triggerHistoryBack = true) {
    if (!detailsModalEl) return;

    const overlay = detailsModalEl;
    detailsModalEl = null;

    overlay.classList.remove('tvDetailsModalOverlay--show');

    setTimeout(() => {
        overlay.remove();
    }, 200);

    // Remove body lock only if no other modals are active
    if (!document.querySelector('.tvFinalizeModal--show') && !document.querySelector('.modern-modal-overlay.modern-modal-show') && !document.querySelector('.modal-backdrop.modalOverlay--show')) {
        document.body.classList.remove('modal-open');
    }

    if (detailsPopHandler) {
        window.removeEventListener('popstate', detailsPopHandler);
        detailsPopHandler = null;
    }

    if (triggerHistoryBack) {
        const state = history.state;
        if (state && state.tvModal === 'details') {
            history.back();
        }
    }
}

function buildDetailsModalElement(normalized, rawAppointment) {
    const items = [];

    const pushItem = (label, value, icon) => {
        if (!value) return;
        items.push(`
            <div class="tvDetailsItem">
                <div class="tvDetailsIcon"><i class="fas ${icon}"></i></div>
                <div class="tvDetailsContent">
                    <div class="tvDetailsLabel">${label}</div>
                    <div class="tvDetailsValue">${value}</div>
                </div>
            </div>
        `);
    };

    const dateValue = rawAppointment.dateStr || '';
    const timeValue = rawAppointment.time || '';
    const dateTimeValue = dateValue && timeValue ? `${dateValue} • ${timeValue}` : (dateValue || timeValue || '');

    const regPlate = normalized.registrationPlate;
    const problemText = normalized.problemDescription;
    const notesText = normalized.notes;
    const statusText = normalized.status === 'done' ? 'Finalizat' : normalized.status === 'canceled' ? 'Anulat' : 'Programat';

    pushItem('Telefon', normalized.phone, 'fa-phone');
    pushItem('Data', dateTimeValue, 'fa-calendar');
    pushItem('Ora', timeValue || dateValue, 'fa-clock');
    pushItem('Mașină', normalized.vehicleMakeModel, 'fa-car');
    pushItem('Nr. înmatriculare', regPlate, 'fa-hashtag');
    pushItem('Locație/Adresă', normalized.address, 'fa-map-marker-alt');
    pushItem('Tip serviciu', normalized.serviceLocation === 'garage' ? 'La garaj' : (normalized.serviceLocation ? 'La client' : ''), 'fa-wrench');
    pushItem('Problemă', problemText, 'fa-exclamation-circle');
    pushItem('Notițe', notesText, 'fa-clipboard');
    pushItem('Status', statusText, normalized.status === 'done' ? 'fa-check-circle' : normalized.status === 'canceled' ? 'fa-times-circle' : 'fa-clock');

    const itemsHtml = items.join('');

    const overlay = document.createElement('div');
    overlay.className = 'tvDetailsModalOverlay';
    overlay.innerHTML = `
        <div class="tvDetailsModal" role="dialog" aria-modal="true" aria-label="Detalii programare">
            <div class="tvDetailsModalHeader">
                <div class="tvDetailsTitle">Detalii: ${normalized.customerName || 'Client'}</div>
                <button class="tvDetailsClose" data-close="details" aria-label="Închide detalii">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="tvDetailsModalBody">
                <div class="tvDetailsGrid">
                    ${itemsHtml || '<div class="tvDetailsEmpty">Nu există informații de afișat.</div>'}
                </div>
            </div>
        </div>
    `;

    return overlay;
}

// ==========================================
// ACTION HANDLERS
// ==========================================

/**
 * Handle Finalize Action - Opens modern finalize modal
 */
async function handleFinalizeAction(id, appointment, openCustomModal) {
    if (!appointment) {
        showNotification('Programarea nu a fost găsită', 'error');
        return;
    }
    
    await openFinalizeModal(id, appointment);
}

/**
 * Open modern finalize modal with structured invoice data collection
 */
async function openFinalizeModal(appointmentId, appointment) {
    const apt = normalizeAppointment(appointment);
    
    // Build finalize modal DOM
    const modal = buildFinalizeModal(apt, appointmentId);
    
    // Mount modal using modal.js system
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    document.body.classList.add('modal-open');
    
    // History state for back button support
    history.pushState({ modal: 'finalize', aptId: appointmentId }, '', '#finalize');
    
    // Handle back button
    const popHandler = (e) => {
        if (e.state?.modal === 'finalize') {
            return; // Stay in finalize state
        }
        closeFinalizeModal(modal, popHandler, false);
    };
    window.addEventListener('popstate', popHandler);
    
    // Focus trap setup
    requestAnimationFrame(() => {
        modal.classList.add('tvFinalizeModal--show');
        const firstInput = modal.querySelector('input:not([readonly])');
        if (firstInput) firstInput.focus();
    });
    
    // Close handlers
    const closeBtn = modal.querySelector('[data-action="close"]');
    const cancelBtn = modal.querySelector('[data-action="cancel"]');
    
    closeBtn?.addEventListener('click', () => closeFinalizeModal(modal, popHandler, false));
    cancelBtn?.addEventListener('click', () => closeFinalizeModal(modal, popHandler, false));
    
    // ESC key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeFinalizeModal(modal, popHandler, false);
        }
    };
    document.addEventListener('keydown', escHandler);
    modal._escHandler = escHandler;
    
    // Form submission
    const form = modal.querySelector('#tvFinalizeForm');
    form.addEventListener('submit', (e) => handleFinalizeSubmit(e, modal, appointmentId, popHandler));
    
    // Setup interactive features
    setupFinalizeInteractivity(modal);
}

/**
 * Build finalize modal DOM structure
 */
function buildFinalizeModal(apt, appointmentId) {
    const modal = document.createElement('div');
    modal.className = 'tvFinalizeModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', 'tvFinalizeTitle');
    modal.setAttribute('aria-modal', 'true');
    
    modal.innerHTML = `
        <div class="tvFinalizeModal__backdrop"></div>
        <div class="tvFinalizeModal__panel">
            <!-- Header -->
            <div class="tvFinalizeModal__header">
                <h2 id="tvFinalizeTitle" class="tvFinalizeModal__title">Finalizare Programare</h2>
                <button type="button" class="tvFinalizeModal__close" data-action="close" aria-label="Închide">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <!-- Body -->
            <div class="tvFinalizeModal__body">
                <!-- Appointment Summary (Read-only) -->
                <div class="tvFinalize__summary">
                    <h3 class="tvFinalize__summaryTitle">Detalii Programare</h3>
                    <div class="tvFinalize__summaryGrid">
                        <div class="tvFinalize__summaryItem">
                            <span class="tvFinalize__summaryLabel">Client:</span>
                            <span class="tvFinalize__summaryValue">${apt.customerName || ''}${apt.phone ? ' • ' + apt.phone : ''}</span>
                        </div>
                        ${apt.vehicleMakeModel || apt.registrationPlate ? `
                        <div class="tvFinalize__summaryItem">
                            <span class="tvFinalize__summaryLabel">Mașină:</span>
                            <span class="tvFinalize__summaryValue">${apt.vehicleMakeModel || ''} ${apt.registrationPlate ? '• ' + apt.registrationPlate : ''}</span>
                        </div>
                        ` : ''}
                        <div class="tvFinalize__summaryItem">
                            <span class="tvFinalize__summaryLabel">Când:</span>
                            <span class="tvFinalize__summaryValue">${apt.dateStr || ''} la ${apt.time || ''}</span>
                        </div>
                        ${apt.address ? `
                        <div class="tvFinalize__summaryItem tvFinalize__summaryItem--full">
                            <span class="tvFinalize__summaryLabel">Locație:</span>
                            <span class="tvFinalize__summaryValue">${apt.address}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Form -->
                <form id="tvFinalizeForm" class="tvFinalize__form">
                    <!-- Section 1: Services -->
                    <div class="tvFinalize__section">
                        <h3 class="tvFinalize__sectionTitle">
                            <i class="fas fa-wrench"></i> Servicii
                            <span class="tvFinalize__required">*</span>
                        </h3>
                        <div id="tvServicesContainer" class="tvFinalize__rows">
                            <div class="tvFinalize__row" data-row-id="1">
                                <input type="text" class="tvFinalize__input tvFinalize__input--name" placeholder="Nume serviciu" data-field="name" required />
                                <input type="number" class="tvFinalize__input tvFinalize__input--price" placeholder="Preț (£)" data-field="price" step="0.01" min="0" required />
                                <button type="button" class="tvFinalize__removeBtn" data-action="remove-service" aria-label="Elimină" disabled>
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        <button type="button" class="tvFinalize__addBtn" data-action="add-service">
                            <i class="fas fa-plus"></i> Adaugă serviciu
                        </button>
                        <div class="tvFinalize__subtotal">
                            Subtotal servicii: <strong id="tvServicesSubtotal">£0.00</strong>
                        </div>
                    </div>
                    
                    <!-- Section 2: Parts (Optional) -->
                    <div class="tvFinalize__section">
                        <h3 class="tvFinalize__sectionTitle">
                            <i class="fas fa-cog"></i> Piese (opțional)
                        </h3>
                        <div id="tvPartsContainer" class="tvFinalize__rows">
                            <!-- Parts rows added dynamically -->
                        </div>
                        <button type="button" class="tvFinalize__addBtn" data-action="add-part">
                            <i class="fas fa-plus"></i> Adaugă piesă
                        </button>
                        <div class="tvFinalize__subtotal">
                            Subtotal piese: <strong id="tvPartsSubtotal">£0.00</strong>
                        </div>
                    </div>
                    
                    <!-- Section 3: Mileage (Optional) -->
                    <div class="tvFinalize__section tvFinalize__section--compact">
                        <h3 class="tvFinalize__sectionTitle">
                            <i class="fas fa-tachometer-alt"></i> Kilometraj (opțional)
                        </h3>
                        <input type="number" id="tvMileage" class="tvFinalize__input" placeholder="Ex: 124500" min="0" step="1" />
                    </div>
                    
                    <!-- Section 4: Extra Costs (Optional) -->
                    <div class="tvFinalize__section tvFinalize__section--compact">
                        <h3 class="tvFinalize__sectionTitle">
                            <i class="fas fa-pound-sign"></i> Costuri suplimentare (opțional)
                        </h3>
                        <input type="number" id="tvExtras" class="tvFinalize__input" placeholder="Ex: deplasare, parcare..." step="0.01" min="0" value="0" />
                    </div>
                    
                    <!-- Section 5: VAT -->
                    <div class="tvFinalize__section tvFinalize__section--compact">
                        <h3 class="tvFinalize__sectionTitle">
                            <i class="fas fa-percent"></i> TVA
                        </h3>
                        <div class="tvFinalize__vatRow">
                            <label class="tvFinalize__checkbox">
                                <input type="checkbox" id="tvVatEnabled" />
                                <span>Include TVA</span>
                            </label>
                            <input type="number" id="tvVatRate" class="tvFinalize__input tvFinalize__input--vatRate" value="20" min="0" max="30" step="0.1" disabled />
                            <span class="tvFinalize__vatLabel">%</span>
                        </div>
                    </div>
                    
                    <!-- Section 6: Totals (Auto-calculated) -->
                    <div class="tvFinalize__totals">
                        <div class="tvFinalize__totalRow">
                            <span>Subtotal:</span>
                            <strong id="tvSubtotal">£0.00</strong>
                        </div>
                        <div class="tvFinalize__totalRow">
                            <span>TVA:</span>
                            <strong id="tvVatAmount">£0.00</strong>
                        </div>
                        <div class="tvFinalize__totalRow tvFinalize__totalRow--grand">
                            <span>Total de plată:</span>
                            <strong id="tvGrandTotal">£0.00</strong>
                        </div>
                    </div>
                </form>
            </div>
            
            <!-- Footer -->
            <div class="tvFinalizeModal__footer">
                <button type="button" class="tvFinalize__btn tvFinalize__btn--cancel" data-action="cancel">
                    Anulează
                </button>
                <button type="submit" form="tvFinalizeForm" class="tvFinalize__btn tvFinalize__btn--save" id="tvFinalizeSaveBtn">
                    <i class="fas fa-check"></i> Finalizează & Salvează
                </button>
            </div>
        </div>
    `;
    
    return modal;
}

/**
 * Setup interactive features (add/remove rows, calculations)
 */
function setupFinalizeInteractivity(modal) {
    let serviceRowId = 1;
    let partRowId = 0;
    
    // Add service row
    modal.querySelector('[data-action="add-service"]').addEventListener('click', () => {
        serviceRowId++;
        const container = modal.querySelector('#tvServicesContainer');
        const row = document.createElement('div');
        row.className = 'tvFinalize__row';
        row.dataset.rowId = serviceRowId;
        row.innerHTML = `
            <input type="text" class="tvFinalize__input tvFinalize__input--name" placeholder="Nume serviciu" data-field="name" required />
            <input type="number" class="tvFinalize__input tvFinalize__input--price" placeholder="Preț (£)" data-field="price" step="0.01" min="0" required />
            <button type="button" class="tvFinalize__removeBtn" data-action="remove-service" aria-label="Elimină">
                <i class="fas fa-times"></i>
            </button>
        `;
        container.appendChild(row);
        row.querySelector('[data-field="name"]').focus();
        calculateTotals(modal);
    });
    
    // Add part row
    modal.querySelector('[data-action="add-part"]').addEventListener('click', () => {
        partRowId++;
        const container = modal.querySelector('#tvPartsContainer');
        const row = document.createElement('div');
        row.className = 'tvFinalize__row';
        row.dataset.rowId = partRowId;
        row.innerHTML = `
            <input type="text" class="tvFinalize__input tvFinalize__input--name" placeholder="Nume piesă" data-field="name" />
            <input type="number" class="tvFinalize__input tvFinalize__input--price" placeholder="Preț (£)" data-field="price" step="0.01" min="0" />
            <button type="button" class="tvFinalize__removeBtn" data-action="remove-part" aria-label="Elimină">
                <i class="fas fa-times"></i>
            </button>
        `;
        container.appendChild(row);
        row.querySelector('[data-field="name"]').focus();
        calculateTotals(modal);
    });
    
    // Remove rows (event delegation)
    modal.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('[data-action="remove-service"], [data-action="remove-part"]');
        if (removeBtn) {
            const row = removeBtn.closest('.tvFinalize__row');
            row.remove();
            calculateTotals(modal);
        }
    });
    
    // VAT toggle
    const vatCheckbox = modal.querySelector('#tvVatEnabled');
    const vatRateInput = modal.querySelector('#tvVatRate');
    vatCheckbox.addEventListener('change', () => {
        vatRateInput.disabled = !vatCheckbox.checked;
        calculateTotals(modal);
    });
    
    // Recalculate on input changes
    modal.addEventListener('input', (e) => {
        if (e.target.matches('[data-field="price"], #tvExtras, #tvVatRate')) {
            calculateTotals(modal);
        }
    });
    
    // Format prices on blur
    modal.addEventListener('blur', (e) => {
        if (e.target.matches('[data-field="price"], #tvExtras')) {
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val >= 0) {
                e.target.value = val.toFixed(2);
            }
        }
    }, true);
    
    // Initial calculation
    calculateTotals(modal);
}

/**
 * Calculate all totals
 */
function calculateTotals(modal) {
    // Services total
    const serviceRows = modal.querySelectorAll('#tvServicesContainer .tvFinalize__row');
    let servicesTotal = 0;
    serviceRows.forEach(row => {
        const price = parseFloat(row.querySelector('[data-field="price"]').value) || 0;
        servicesTotal += price;
    });
    
    // Parts total
    const partRows = modal.querySelectorAll('#tvPartsContainer .tvFinalize__row');
    let partsTotal = 0;
    partRows.forEach(row => {
        const price = parseFloat(row.querySelector('[data-field="price"]').value) || 0;
        partsTotal += price;
    });
    
    // Extras
    const extras = parseFloat(modal.querySelector('#tvExtras').value) || 0;
    
    // Subtotal
    const subtotal = servicesTotal + partsTotal + extras;
    
    // VAT
    const vatEnabled = modal.querySelector('#tvVatEnabled').checked;
    const vatRate = vatEnabled ? (parseFloat(modal.querySelector('#tvVatRate').value) || 0) / 100 : 0;
    const vatAmount = subtotal * vatRate;
    
    // Grand total
    const grandTotal = subtotal + vatAmount;
    
    // Update UI
    modal.querySelector('#tvServicesSubtotal').textContent = `£${servicesTotal.toFixed(2)}`;
    modal.querySelector('#tvPartsSubtotal').textContent = `£${partsTotal.toFixed(2)}`;
    modal.querySelector('#tvSubtotal').textContent = `£${subtotal.toFixed(2)}`;
    modal.querySelector('#tvVatAmount').textContent = `£${vatAmount.toFixed(2)}`;
    modal.querySelector('#tvGrandTotal').textContent = `£${grandTotal.toFixed(2)}`;
    
    // Enable/disable save button
    const saveBtn = modal.querySelector('#tvFinalizeSaveBtn');
    const hasValidService = Array.from(serviceRows).some(row => {
        const name = row.querySelector('[data-field="name"]').value.trim();
        const price = parseFloat(row.querySelector('[data-field="price"]').value) || 0;
        return name && price >= 0;
    });
    saveBtn.disabled = !hasValidService;
}

/**
 * Handle finalize form submission
 */
async function handleFinalizeSubmit(e, modal, appointmentId, popHandler) {
    e.preventDefault();
    
    const saveBtn = modal.querySelector('#tvFinalizeSaveBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Se salvează...';
    
    try {
        // Collect services
        const services = [];
        const serviceRows = modal.querySelectorAll('#tvServicesContainer .tvFinalize__row');
        serviceRows.forEach(row => {
            const name = row.querySelector('[data-field="name"]').value.trim();
            const price = parseFloat(row.querySelector('[data-field="price"]').value) || 0;
            if (name && price >= 0) {
                services.push({ name, price });
            }
        });
        
        if (services.length === 0) {
            showNotification('⚠️ Adaugă cel puțin un serviciu', 'warning');
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-check"></i> Finalizează & Salvează';
            return;
        }
        
        // Collect parts
        const parts = [];
        const partRows = modal.querySelectorAll('#tvPartsContainer .tvFinalize__row');
        partRows.forEach(row => {
            const name = row.querySelector('[data-field="name"]').value.trim();
            const price = parseFloat(row.querySelector('[data-field="price"]').value) || 0;
            if (name && price >= 0) {
                parts.push({ name, price });
            }
        });
        
        // Mileage
        const mileageStr = modal.querySelector('#tvMileage').value.trim();
        const mileage = mileageStr ? parseInt(mileageStr, 10) : null;
        
        // Extras
        const extras = parseFloat(modal.querySelector('#tvExtras').value) || 0;
        
        // VAT
        const vatEnabled = modal.querySelector('#tvVatEnabled').checked;
        const vatRate = vatEnabled ? (parseFloat(modal.querySelector('#tvVatRate').value) || 20) : 0;
        
        // Calculate totals
        const servicesTotal = services.reduce((sum, s) => sum + s.price, 0);
        const partsTotal = parts.reduce((sum, p) => sum + p.price, 0);
        const subtotal = servicesTotal + partsTotal + extras;
        const vatAmount = subtotal * (vatRate / 100);
        const total = subtotal + vatAmount;
        
        // Save to Firestore
        const { doc, updateDoc, Timestamp, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const payload = {
            status: 'done',
            services,
            parts,
            extras,
            vatEnabled,
            vatRate: vatRate / 100,
            subtotal,
            vatAmount,
            total,
            finalizedAt: Timestamp.now(),
            updatedAt: serverTimestamp()
        };
        
        if (mileage !== null && !isNaN(mileage) && mileage >= 0) {
            payload.mileage = mileage;
        }
        
        await updateDoc(doc(db, 'appointments', appointmentId), payload);
        
        showNotification('✅ Programare finalizată cu succes!', 'success');
        closeFinalizeModal(modal, popHandler, true);
        
    } catch (error) {
        console.error('[Finalize] Error:', error);
        showNotification('❌ Eroare la finalizare: ' + error.message, 'error');
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-check"></i> Finalizează & Salvează';
    }
}

/**
 * Close finalize modal
 */
function closeFinalizeModal(modal, popHandler, saved) {
    modal.classList.remove('tvFinalizeModal--show');
    
    // Cleanup
    window.removeEventListener('popstate', popHandler);
    if (modal._escHandler) {
        document.removeEventListener('keydown', modal._escHandler);
    }
    
    // Clean URL if modal was opened with hash
    if (window.location.hash === '#finalize') {
        history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    
    setTimeout(() => {
        modal.remove();
        document.body.style.overflow = '';
        const otherOpen = document.querySelector('.tvDetailsModalOverlay--show, .tvEditModalOverlay.active, .modern-modal-overlay.modern-modal-show, .modal-backdrop.modalOverlay--show');
        if (!otherOpen) {
            document.body.classList.remove('modal-open');
        }
    }, 300);
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
 * Handle WhatsApp Share action - Share appointment details via WhatsApp
 */
// Share appointment details via WhatsApp with professional message format
function handleWhatsAppShare(id, appointment) {
    if (!appointment) {
        showNotification('Programarea nu a fost găsită', 'error');
        return;
    }

    try {
        const apt = normalizeAppointment(appointment);
        
        // Build professional WhatsApp message with conditional lines
        const lines = [
            'TRANSVORTEX • Programare',
            '────────────────────'
        ];
        
        // Client line: always include name, phone if available
        if (apt.customerName) {
            let clientLine = `Client: ${apt.customerName}`;
            if (apt.customerPhone) clientLine += ` • ${apt.customerPhone}`;
            lines.push(clientLine);
        }
        
        // Vehicle line: always include if make/model or plate exists
        if (apt.vehicleMakeModel || apt.registrationPlate) {
            const make = apt.vehicleMakeModel || '?';
            const plate = apt.registrationPlate || '?';
            lines.push(`Mașină: ${make} • ${plate}`);
        }
        
        // Date/Time line: always include if date and/or time exist
        if (apt.dateStr || apt.time) {
            let whenLine = 'Când:';
            if (apt.dateStr) whenLine += ` ${apt.dateStr}`;
            if (apt.time) whenLine += ` la ${apt.time}`;
            lines.push(whenLine);
        }
        
        // Location line: include if address exists
        if (apt.address) {
            lines.push(`Locație: ${apt.address}`);
        }
        
        // Service type line: include if serviceLocation exists
        if (apt.serviceLocation) {
            const serviceText = apt.serviceLocation === 'garage' ? 'La garaj' : 'La client';
            lines.push(`Tip: ${serviceText}`);
        }
        
        // Problem line: always include if exists
        if (apt.problemDescription) {
            lines.push(`Lucrare: ${apt.problemDescription}`);
        }
        
        // Notes line: include only if present
        if (apt.notes) {
            lines.push(`Notițe: ${apt.notes}`);
        }
        
        // Closing
        lines.push('────────────────────');
        lines.push('Te rog confirmă cu OK.');
        
        // Invoice section for mechanic to fill in
        lines.push('');
        lines.push('Pentru factură (completat de mecanic):');
        lines.push('• Servicii efectuate:');
        lines.push('• Piese utilizate:');
        lines.push('• Timp lucru (ore):');
        lines.push('• Cost manoperă:');
        lines.push('• Cost piese:');
        lines.push('• Total:');
        lines.push('• TVA (dacă este cazul):');
        
        const message = lines.join('\n');
        const encoded = encodeURIComponent(message);
        
        // Open WhatsApp Web with prefilled message
        window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener,noreferrer');
        
        showNotification('✅ Deschizând WhatsApp cu detaliile programării', 'success');
    } catch (error) {
        console.error('[WhatsApp] Error:', error);
        showNotification('❌ Eroare la deschiderea WhatsApp: ' + error.message, 'error');
    }
}

/**
 * Handle edit appointment action
 */
// Helper: Format phone number as user types
function formatPhoneNumber(value) {
    // Remove all non-digit characters
    const digits = value.replace(/\D/g, '');
    
    // UK mobile format: +44 7XXX XXX XXX or 07XXX XXX XXX
    if (digits.startsWith('44')) {
        const local = digits.slice(2);
        if (local.length === 0) return '+44';
        if (local.length <= 3) return `+44 ${local}`;
        if (local.length <= 6) return `+44 ${local.slice(0, 3)} ${local.slice(3)}`;
        return `+44 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 10)}`;
    } else if (digits.startsWith('0')) {
        const local = digits.slice(1);
        if (local.length === 0) return '0';
        if (local.length <= 3) return `0${local}`;
        if (local.length <= 6) return `0${local.slice(0, 3)} ${local.slice(3)}`;
        return `0${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 10)}`;
    }
    return value;
}

// Helper: Validate UK phone number (mobile)
function validatePhoneNumber(value) {
    const digits = value.replace(/\D/g, '');
    
    // UK mobile numbers:
    // National: 07XXX XXX XXX (11 digits starting with 07)
    // International: +447XXX XXX XXX (12 digits: 44 + 10 digits starting with 7)
    
    if (digits.startsWith('44')) {
        return digits.length === 12 && digits[2] === '7';
    } else if (digits.startsWith('0')) {
        return digits.length === 11 && digits[1] === '7';
    }
    
    return false;
}

// Helper: Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Helper: Save draft to localStorage
function saveDraft(appointmentId, formData) {
    try {
        const draftKey = `tv_edit_draft_${appointmentId}`;
        const draft = {
            data: formData,
            timestamp: Date.now()
        };
        localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch (e) {
        console.warn('[Draft] Failed to save:', e);
    }
}

// Helper: Load draft from localStorage
function loadDraft(appointmentId) {
    try {
        const draftKey = `tv_edit_draft_${appointmentId}`;
        const draftStr = localStorage.getItem(draftKey);
        if (!draftStr) return null;
        
        const draft = JSON.parse(draftStr);
        const ageMs = Date.now() - draft.timestamp;
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        if (ageMs > maxAge) {
            localStorage.removeItem(draftKey);
            return null;
        }
        
        return draft.data;
    } catch (e) {
        console.warn('[Draft] Failed to load:', e);
        return null;
    }
}

// Helper: Clear draft from localStorage
function clearDraft(appointmentId) {
    try {
        const draftKey = `tv_edit_draft_${appointmentId}`;
        localStorage.removeItem(draftKey);
    } catch (e) {
        console.warn('[Draft] Failed to clear:', e);
    }
}

// Helper: Validate individual field
function validateField(input, showError = true) {
    const isRequired = input.hasAttribute('required') || input.classList.contains('tv-required');
    const value = input.value.trim();
    let isValid = !isRequired || value.length > 0;
    
    // Special validation for phone field
    if (input.id === 'editPhone' && value.length > 0) {
        isValid = validatePhoneNumber(value);
    }
    
    if (showError) {
        if (isValid) {
            input.classList.remove('error');
            const errorMsg = input.nextElementSibling;
            if (errorMsg && errorMsg.classList.contains('tvEditErrorMsg')) {
                errorMsg.style.display = 'none';
            }
        } else {
            input.classList.add('error');
            const errorMsg = input.nextElementSibling;
            if (errorMsg && errorMsg.classList.contains('tvEditErrorMsg')) {
                errorMsg.style.display = 'block';
            }
        }
    }
    
    return isValid;
}

// Helper: Validate all required fields in form
function validateAllFields(form) {
    const requiredFields = [
        { id: 'editName', label: 'Nume Client' },
        { id: 'editPhone', label: 'Telefon' },
        { id: 'editDate', label: 'Data' },
        { id: 'editTime', label: 'Ora' },
        { id: 'editRegNumber', label: 'Nr. Înmatriculare' },
        { id: 'editProblem', label: 'Problemă / Serviciu' }
    ];
    
    let isValid = true;
    const errors = [];
    
    requiredFields.forEach(field => {
        const input = form.querySelector(`#${field.id}`);
        if (input) {
            const fieldValid = validateField(input, true);
            if (!fieldValid) {
                isValid = false;
                errors.push(field.label);
            }
        }
    });
    
    return { isValid, errors };
}

// Create a new Edit Modal with modern, clean design
function createEditModalDOM(appointment) {
    const modal = document.createElement('div');
    modal.className = 'tvEditModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'editModalTitle');

    // Parse vehicle data
    const vehicleData = splitVehicleAndReg(
        appointment.vehicle || appointment.makeModel || appointment.car || ''
    );

    modal.innerHTML = `
        <!-- Header -->
        <div class="tvEditModalHeader">
            <h2 class="tvEditModalTitle" id="editModalTitle">
                Editează: ${appointment.customerName || 'Programare'}
            </h2>
            <button type="button" class="tvEditModalClose" aria-label="Închide" data-action="close">
                <i class="fas fa-times"></i>
            </button>
        </div>

        <!-- Body -->
        <div class="tvEditModalBody">
            <form id="tvEditForm" class="tvEditForm">
                <!-- Section 1: Client -->
                <div class="tvEditFieldGroup">
                    <div class="tvEditFieldGroupHeader">
                        <i class="fas fa-user"></i> Client
                    </div>
                    <div class="tvEditFieldsGrid">
                        <div class="tvEditField">
                            <label for="editName">Nume Client <span class="required">*</span></label>
                            <input type="text" id="editName" class="tvEditInput" 
                                placeholder="Ex: John Doe" 
                                value="${appointment.customerName || ''}"
                                required autocomplete="off">
                            <span class="tvEditErrorMsg">Nume obligatoriu</span>
                        </div>
                        <div class="tvEditField">
                            <label for="editPhone">Telefon <span class="required">*</span></label>
                            <input type="tel" id="editPhone" class="tvEditInput tv-required" 
                                placeholder="Ex: +44 7700 900 123"
                                value="${appointment.phone || ''}"
                                autocomplete="off">
                            <span class="tvEditErrorMsg">Telefon obligatoriu (ex: 07700 900 123)</span>
                        </div>
                    </div>
                </div>

                <!-- Section 2: Date & Time -->
                <div class="tvEditFieldGroup">
                    <div class="tvEditFieldGroupHeader">
                        <i class="fas fa-calendar"></i> Data & Ora
                    </div>
                    <div class="tvEditFieldsGrid">
                        <div class="tvEditField">
                            <label for="editDate">Data <span class="required">*</span></label>
                            <input type="date" id="editDate" class="tvEditInput"
                                value="${appointment.dateStr || ''}"
                                required>
                            <span class="tvEditErrorMsg">Data obligatorie</span>
                        </div>
                        <div class="tvEditField">
                            <label for="editTime">Ora <span class="required">*</span></label>
                            <input type="time" id="editTime" class="tvEditInput"
                                value="${appointment.time || ''}"
                                required>
                            <span class="tvEditErrorMsg">Ora obligatorie</span>
                        </div>
                    </div>
                </div>

                <!-- Section 3: Vehicle -->
                <div class="tvEditFieldGroup">
                    <div class="tvEditFieldGroupHeader">
                        <i class="fas fa-car"></i> Vehicul
                    </div>
                    <div class="tvEditFieldsGrid">
                        <div class="tvEditField">
                            <label for="editMakeModel">Marca / Model (opțional)</label>
                            <input type="text" id="editMakeModel" class="tvEditInput"
                                placeholder="Ex: OPEL VIVARA"
                                value="${vehicleData.vehicleMakeModel || ''}"
                                autocomplete="off">
                        </div>
                        <div class="tvEditField">
                            <label for="editRegNumber">Nr. Înmatriculare <span class="required">*</span></label>
                            <input type="text" id="editRegNumber" class="tvEditInput tv-required"
                                placeholder="Ex: BV66HKE"
                                value="${vehicleData.regPlate || ''}"
                                autocomplete="off" required>
                            <span class="tvEditErrorMsg">Nr. Înmatriculare obligatoriu</span>
                        </div>
                    </div>
                    <div class="tvEditFieldsGrid">
                        <div class="tvEditField">
                            <label for="editMileage">Kilometraj (opțional)</label>
                            <input type="number" id="editMileage" class="tvEditInput"
                                placeholder="Ex: 124500"
                                value="${coalesceMileageValue(appointment) || ''}"
                                min="0" step="1" autocomplete="off">
                        </div>
                    </div>
                </div>

                <!-- Section 4: Location & Service -->
                <div class="tvEditFieldGroup">
                    <div class="tvEditFieldGroupHeader">
                        <i class="fas fa-map-marker-alt"></i> Locație & Serviciu
                    </div>
                    <div class="tvEditFieldsGrid full-width">
                        <div class="tvEditField">
                            <label for="editAddress">Adresă / Locație (opțional)</label>
                            <input type="text" id="editAddress" class="tvEditInput"
                                placeholder="Ex: 123 Main Street, London"
                                value="${appointment.address || ''}"
                                autocomplete="off">
                        </div>
                    </div>
                    <div class="tvEditFieldsGrid">
                        <div class="tvEditField">
                            <label for="editServiceLocation">Tip Serviciu</label>
                            <select id="editServiceLocation" class="tvEditSelect">
                                <option value="">-- Selectează --</option>
                                <option value="garage" ${appointment.serviceLocation === 'garage' ? 'selected' : ''}>La garaj</option>
                                <option value="client" ${appointment.serviceLocation === 'client' ? 'selected' : ''}>La client</option>
                            </select>
                        </div>
                        <div class="tvEditField">
                            <label for="editContactPref">Preferință Contact</label>
                            <select id="editContactPref" class="tvEditSelect">
                                <option value="">-- Selectează --</option>
                                <option value="phone" ${appointment.contactPref === 'phone' ? 'selected' : ''}>Telefon</option>
                                <option value="sms" ${appointment.contactPref === 'sms' ? 'selected' : ''}>SMS</option>
                                <option value="whatsapp" ${appointment.contactPref === 'whatsapp' ? 'selected' : ''}>WhatsApp</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Section 5: Service Details -->
                <div class="tvEditFieldGroup">
                    <div class="tvEditFieldGroupHeader">
                        <i class="fas fa-tools"></i> Detalii Serviciu
                    </div>
                    <div class="tvEditFieldsGrid full-width">
                        <div class="tvEditField">
                            <label for="editProblem">Problemă / Serviciu Solicitat <span class="required">*</span></label>
                            <textarea id="editProblem" class="tvEditTextarea tv-required"
                                placeholder="Descrierea problemei sau serviciului solicitat...">${appointment.problemDescription || appointment.problem || ''}</textarea>
                            <span class="tvEditErrorMsg">Descrierea problemei este obligatorie</span>
                        </div>
                    </div>
                    <div class="tvEditFieldsGrid full-width">
                        <div class="tvEditField">
                            <label for="editNotes">Notițe Adiționale</label>
                            <textarea id="editNotes" class="tvEditTextarea"
                                placeholder="Notițe interne...">${appointment.notes || ''}</textarea>
                        </div>
                    </div>
                </div>

                <!-- Section 6: Status -->
                <div class="tvEditFieldGroup">
                    <div class="tvEditFieldGroupHeader">
                        <i class="fas fa-info-circle"></i> Status
                    </div>
                    <div class="tvEditFieldsGrid">
                        <div class="tvEditField">
                            <label for="editStatus">Status</label>
                            <select id="editStatus" class="tvEditSelect">
                                <option value="scheduled" ${appointment.status === 'scheduled' ? 'selected' : ''}>Programat</option>
                                <option value="done" ${appointment.status === 'done' ? 'selected' : ''}>Finalizat</option>
                                <option value="canceled" ${appointment.status === 'canceled' ? 'selected' : ''}>Anulat</option>
                            </select>
                        </div>
                    </div>
                </div>
            </form>
        </div>

        <!-- Footer -->
        <div class="tvEditModalFooter">
            <button type="button" class="tvEditModalCancel" data-action="cancel" id="tvEditCancel">
                Anulează
            </button>
            <button type="button" class="tvEditModalSave" data-action="save" id="tvEditSave">
                <i class="fas fa-save"></i> Salvează Modificări
            </button>
        </div>
    `;

    return modal;
}

// -------------------------------------------------
// Edit Modal state & history helpers
// -------------------------------------------------
const editModalHistoryState = {
    isOpen: false,
    suppressNextPop: false,
    popListenerBound: false,
    overlay: null,
    closeFn: null
};

const logEditHistory = () => {};

function ensureEditPopListener() {
    if (editModalHistoryState.popListenerBound) return;

    window.addEventListener('popstate', (e) => {
        if (editModalHistoryState.suppressNextPop) {
            editModalHistoryState.suppressNextPop = false;
            return;
        }

        if (editModalHistoryState.isOpen && typeof editModalHistoryState.closeFn === 'function') {
            editModalHistoryState.closeFn({ fromPopState: true });
        }
    });

    editModalHistoryState.popListenerBound = true;
}

function isEditModalOpen() {
    return editModalHistoryState.isOpen;
}

// Open Edit Modal
async function openEditModal(appointment) {
    if (!appointment) {
        showNotification('Programarea nu a fost găsită', 'error');
        return;
    }

    const appointmentId = appointment.id;
    ensureEditPopListener();
    
    // Create overlay and modal
    const overlay = document.createElement('div');
    overlay.className = 'tvEditModalOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    document.body.appendChild(overlay);

    const modal = createEditModalDOM(appointment);
    overlay.appendChild(modal);

    // Store original data for dirty check
    const form = modal.querySelector('#tvEditForm');
    const getFormData = () => ({
        name: form.querySelector('#editName').value,
        phone: form.querySelector('#editPhone').value,
        date: form.querySelector('#editDate').value,
        time: form.querySelector('#editTime').value,
        makeModel: form.querySelector('#editMakeModel').value,
        regNumber: form.querySelector('#editRegNumber').value,
        mileage: form.querySelector('#editMileage').value,
        address: form.querySelector('#editAddress').value,
        serviceLocation: form.querySelector('#editServiceLocation').value,
        contactPref: form.querySelector('#editContactPref').value,
        problem: form.querySelector('#editProblem').value,
        notes: form.querySelector('#editNotes').value,
        status: form.querySelector('#editStatus').value
    });

    const originalData = getFormData();

    // Check for draft and show in-modal prompt
    const draft = loadDraft(appointmentId);
    if (draft) {
        // Create draft prompt overlay
        const draftPrompt = document.createElement('div');
        draftPrompt.className = 'tvDraftPrompt';
        draftPrompt.innerHTML = `
            <div class="tvDraftPromptCard">
                <div class="tvDraftPromptIcon">
                    <i class="fas fa-file-alt"></i>
                </div>
                <h3>Draft nesalvat găsit</h3>
                <p>Am găsit un draft nesalvat pentru această programare. Vrei să îl recuperezi?</p>
                <div class="tvDraftPromptButtons">
                    <button type="button" class="tvDraftPromptBtn tvDraftPromptIgnore">Ignoră</button>
                    <button type="button" class="tvDraftPromptBtn tvDraftPromptRecover">Recuperează</button>
                </div>
            </div>
        `;
        modal.appendChild(draftPrompt);
        
        // Handle draft recovery
        draftPrompt.querySelector('.tvDraftPromptRecover').addEventListener('click', () => {
            Object.keys(draft).forEach(key => {
                const inputId = 'edit' + key.charAt(0).toUpperCase() + key.slice(1);
                const input = form.querySelector(`#${inputId}`);
                if (input && draft[key]) {
                    input.value = draft[key];
                }
            });
            draftPrompt.remove();
            showNotification('📝 Draft recuperat', 'info');
        });
        
        // Handle draft ignore
        draftPrompt.querySelector('.tvDraftPromptIgnore').addEventListener('click', () => {
            clearDraft(appointmentId);
            draftPrompt.remove();
        });
    }

    // Auto-focus first input
    setTimeout(() => form.querySelector('#editName').focus(), 100);

    // Phone number formatting
    const phoneInput = form.querySelector('#editPhone');
    phoneInput.addEventListener('input', (e) => {
        const cursorPos = e.target.selectionStart;
        const oldValue = e.target.value;
        const formatted = formatPhoneNumber(oldValue);
        e.target.value = formatted;
        
        // Restore cursor position (approximate)
        if (formatted.length >= cursorPos) {
            e.target.setSelectionRange(cursorPos, cursorPos);
        }
    });

    // Phone validation on blur
    phoneInput.addEventListener('blur', () => {
        const value = phoneInput.value.trim();
        if (value && !validatePhoneNumber(value)) {
            phoneInput.classList.add('error');
            const errorMsg = phoneInput.nextElementSibling;
            if (errorMsg && errorMsg.classList.contains('tvEditErrorMsg')) {
                errorMsg.textContent = 'Format invalid (ex: 07700 900 123)';
            }
        } else {
            phoneInput.classList.remove('error');
        }
    });

    // Auto-uppercase for registration plate and make/model
    const regNumberInput = form.querySelector('#editRegNumber');
    const makeModelInput = form.querySelector('#editMakeModel');
    
    [regNumberInput, makeModelInput].forEach(input => {
        input.addEventListener('input', (e) => {
            const start = e.target.selectionStart;
            const end = e.target.selectionEnd;
            e.target.value = e.target.value.toUpperCase();
            e.target.setSelectionRange(start, end);
        });
    });

    // Inline validation on blur for required fields
    const requiredInputs = form.querySelectorAll('[required], .tv-required');
    requiredInputs.forEach(input => {
        input.addEventListener('blur', () => validateField(input, true));
        input.addEventListener('input', () => {
            if (input.classList.contains('error')) {
                validateField(input, true);
            }
        });
    });

    // Debounced autosave (saves 500ms after user stops typing)
    const debouncedSave = debounce(() => {
        const currentData = getFormData();
        saveDraft(appointmentId, currentData);
    }, 500);

    // Trigger autosave on any form change
    form.addEventListener('input', debouncedSave);
    form.addEventListener('change', debouncedSave);

    // Close function with history-aware flow
    let closeModal = async ({ shouldSave = false, fromPopState = false, reason = 'unknown' } = {}) => {
        if (!editModalHistoryState.isOpen) return;

        const currentData = getFormData();
        const isDirty = JSON.stringify(originalData) !== JSON.stringify(currentData);

        if (!fromPopState && !shouldSave && isDirty) {
            const confirmed = await confirmUnsavedChanges();
            if (!confirmed) return;
        }

        editModalHistoryState.isOpen = false;
        editModalHistoryState.overlay = null;
        editModalHistoryState.closeFn = null;

        overlay.classList.remove('active');
        document.removeEventListener('keydown', handleEsc);

        // Cleanup DOM after transition
        setTimeout(() => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            document.body.style.overflow = '';
            if (!document.querySelector('.tvFinalizeModal--show') && !document.querySelector('.tvDetailsModalOverlay--show') && !document.querySelector('.modern-modal-overlay.modern-modal-show') && !document.querySelector('.modal-backdrop.modalOverlay--show')) {
                document.body.classList.remove('modal-open');
            }
        }, 200);

        if (fromPopState) {
            // Clean URL without adding new history entries
            history.replaceState(history.state, '', location.pathname + location.search);
            return;
        }

        // User-initiated close: remove the pushed state once
        if (location.hash === '#edit') {
            editModalHistoryState.suppressNextPop = true;
            history.back();
        } else {
            history.replaceState(history.state, '', location.pathname + location.search);
        }
    };

    // Handle close button
    modal.querySelector('.tvEditModalClose').addEventListener('click', () => closeModal({ shouldSave: false, fromUser: true, reason: 'close-button' }));

    // Add 'Șterge draft' button if draft exists
    const addDeleteDraftButton = () => {
        const footer = modal.querySelector('.tvEditModalFooter');
        const existingBtn = footer.querySelector('.tvDeleteDraftBtn');
        if (existingBtn) return;
        
        const hasDraft = loadDraft(appointmentId) !== null;
        if (hasDraft) {
            const deleteDraftBtn = document.createElement('button');
            deleteDraftBtn.type = 'button';
            deleteDraftBtn.className = 'tvDeleteDraftBtn';
            deleteDraftBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Șterge draft';
            deleteDraftBtn.addEventListener('click', () => {
                clearDraft(appointmentId);
                deleteDraftBtn.remove();
                showNotification('🗑️ Draft șters', 'info');
            });
            footer.insertBefore(deleteDraftBtn, footer.firstChild);
        }
    };
    
    // Add delete draft button after any save attempt
    setTimeout(addDeleteDraftButton, 100);

    // Handle cancel button
    modal.querySelector('#tvEditCancel').addEventListener('click', () => closeModal({ shouldSave: false, fromUser: true, reason: 'cancel-button' }));

    // Handle save button
    modal.querySelector('#tvEditSave').addEventListener('click', async () => {
        const saveBtn = modal.querySelector('#tvEditSave');
        
        // Validate all required fields
        const validation = validateAllFields(form);
        if (!validation.isValid) {
            const errorList = validation.errors.join(', ');
            showNotification(`⚠️ Câmpuri obligatorii lipsă: ${errorList}`, 'warning');
            // Scroll to first error
            const firstError = form.querySelector('.error');
            if (firstError) {
                firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                firstError.focus();
            }
            return;
        }

        // Show loading state
        saveBtn.disabled = true;
        saveBtn.classList.add('loading');

        try {
            const makeModel = form.querySelector('#editMakeModel').value.trim().toUpperCase();
            const regNumber = form.querySelector('#editRegNumber').value.trim().toUpperCase();
            const mileage = form.querySelector('#editMileage').value;
            const address = form.querySelector('#editAddress').value.trim();
            const problem = form.querySelector('#editProblem').value.trim();
            const notes = form.querySelector('#editNotes').value.trim();
            const status = form.querySelector('#editStatus').value;
            const phone = form.querySelector('#editPhone').value.trim();
            const serviceLocation = form.querySelector('#editServiceLocation').value;
            const contactPref = form.querySelector('#editContactPref').value;

            const updateData = {
                customerName: name,
                dateStr: date,
                time,
                status
            };

            // Vehicle fields (optional)
            if (makeModel) updateData.vehicleMakeModel = makeModel;
            if (regNumber) updateData.registrationPlate = regNumber;
            // Build combined vehicle field only if we have make/model or reg
            if (makeModel || regNumber) {
                updateData.vehicle = (makeModel || '') + (regNumber ? ` • ${regNumber}` : '');
            }

            // Optional fields (only save if non-empty)
            if (phone) updateData.phone = phone;
            if (mileage) updateData.mileage = parseInt(mileage, 10);
            if (address) updateData.address = address;
            if (problem) updateData.problemDescription = problem;
            if (notes) updateData.notes = notes;
            if (serviceLocation) updateData.serviceLocation = serviceLocation;
            if (contactPref) updateData.contactPref = contactPref;

            // Update timestamp
            const dateTime = new Date(`${date}T${time}`);
            const { Timestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            updateData.startAt = Timestamp.fromDate(dateTime);

            // Update Firestore
            const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            await updateDoc(doc(db, 'appointments', appointmentId), updateData);

            // Update local object
            Object.assign(appointment, updateData);

            // Update DOM
            const row = document.querySelector(`.tvCard[data-apt-id="${appointmentId}"]`);
            if (row) {
                const newHTML = createAppointmentCard(appointment);
                const temp = document.createElement('div');
                temp.innerHTML = newHTML;
                row.replaceWith(temp.firstElementChild);
                bindAppointmentsClickDelegation();
            }

            // Clear draft on successful save
            clearDraft(appointmentId);
            
            showNotification('✅ Programare actualizată cu succes', 'success');
            await closeModal({ shouldSave: true, fromUser: true, reason: 'save-success' });
        } catch (error) {
            console.error('[Edit] Error:', error);
            showNotification('❌ Eroare la salvare: ' + error.message, 'error');
            saveBtn.disabled = false;
            saveBtn.classList.remove('loading');
        }
    });

    // ESC closes modal
    const handleEsc = (e) => {
        if (e.key === 'Escape') closeModal({ shouldSave: false, fromUser: true, reason: 'esc' });
    };
    document.addEventListener('keydown', handleEsc);

    // History management
    history.pushState({ tvModal: 'edit', appointmentId }, '', location.pathname + location.search + '#edit');
    editModalHistoryState.isOpen = true;
    editModalHistoryState.overlay = overlay;
    editModalHistoryState.closeFn = closeModal;

    // Disable background scroll
    document.body.style.overflow = 'hidden';
    document.body.classList.add('modal-open');

    // Show modal
    setTimeout(() => overlay.classList.add('active'), 10);

    // Cleanup on close handled within closeModal (no extra reassignment needed)
}

// Confirm unsaved changes dialog
async function confirmUnsavedChanges() {
    const { confirmModal } = await import('./src/modal.js');
    return confirmModal({
        title: 'Modificări nesalvate',
        message: 'Ai modificări nesalvate. Sigur vrei să le anulezi?',
        icon: 'fa-exclamation-triangle',
        variant: 'danger',
        confirmText: 'Da, anulează',
        cancelText: 'Nu, rămân'
    });
}

async function handleEditAction(id, appointment, openCustomModal) {
    if (!appointment) {
        showNotification('Programarea nu a fost găsită', 'error');
        return;
    }

    await openEditModal(appointment);
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
                validateField(field);
            });
        }
    });
}

// ==============================
// MODALS - open/close helpers
// ==============================
const appointmentsModalState = {
    isOpen: false,
    popHandler: null,
    escHandler: null
};

function openModal(id) {
    const el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el || appointmentsModalState.isOpen) return;

    el.style.display = 'flex';
    el.classList.add('modalOverlay--show');
    appointmentsModalState.isOpen = true;

    document.body.classList.add('modal-open');

    history.pushState({ tvModal: 'appointments' }, '', location.pathname + location.search + '#appointments');

    appointmentsModalState.escHandler = (e) => {
        if (e.key === 'Escape') closeModal(id);
    };
    document.addEventListener('keydown', appointmentsModalState.escHandler);

    appointmentsModalState.popHandler = () => {
        if (appointmentsModalState.isOpen) {
            closeModal(id, { fromPopState: true });
        }
    };
    window.addEventListener('popstate', appointmentsModalState.popHandler);
}

function closeModal(id, { fromPopState = false } = {}) {
    const el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el || !appointmentsModalState.isOpen) return;

    el.classList.remove('modalOverlay--show');
    setTimeout(() => {
        el.style.display = 'none';
    }, 180);

    appointmentsModalState.isOpen = false;

    if (appointmentsModalState.escHandler) {
        document.removeEventListener('keydown', appointmentsModalState.escHandler);
        appointmentsModalState.escHandler = null;
    }
    if (appointmentsModalState.popHandler) {
        window.removeEventListener('popstate', appointmentsModalState.popHandler);
        appointmentsModalState.popHandler = null;
    }

    if (!fromPopState && location.hash === '#appointments') {
        history.back();
    }

    const otherOpen = document.querySelector('.tvDetailsModalOverlay--show, .tvEditModalOverlay.active, .tvFinalizeModal--show, .modern-modal-overlay.modern-modal-show');
    if (!otherOpen) {
        document.body.classList.remove('modal-open');
    }
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
        <div><strong>Mile:</strong> ${coalesceMileageValue(apt) || 'N/A'}</div>
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
                mileage: coalesceMileageValue(appointment) || ''
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

// ==========================================
// ==========================================
// CAROUSEL SYSTEM
// Mobile only: native touch scrolling with scroll-snap
// Desktop: normal grid layout (2-3 columns)
// No drag-to-scroll JS needed
// ==========================================

// Expose openInvoiceForAppointment globally
window.openInvoiceForAppointment = openInvoiceForAppointment;




