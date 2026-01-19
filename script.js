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

    if (!confirm('Ești sigur că vrei să ștergi această pagină?')) return;

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
    
    // Bind modal behaviors
    bindModalCloseBehavior();
    bindAppointmentsModalControls();
    bindFinalizeModalControls();
    
    // Bind appointment action buttons (delegated event handling)
    bindAppointmentsClickDelegation();
    
    // Finalize form submit
    const finalizeForm = document.getElementById('finalizeForm');
    if (finalizeForm && !finalizeForm.dataset.bound) {
        finalizeForm.addEventListener('submit', finalizeAppointmentWithPrices);
        finalizeForm.dataset.bound = "true";
    }
    
    // Bind stats cards (needs card IDs in HTML)
    bindStatsPopupButtons();
});

// ==========================================
// ENHANCE NATIVE DATE/TIME PICKERS
// ==========================================
function enhanceNativePickers() {
    const dateInput = document.getElementById('appointmentDate');
    const timeInput = document.getElementById('appointmentTime');

    // Click anywhere on wrapper => focus input and open picker
    const dateWrap = document.getElementById('dateWrap');
    const timeWrap = document.getElementById('timeWrap');

    if (dateWrap && dateInput && !dateWrap.dataset.bound) {
        dateWrap.addEventListener('click', () => {
            dateInput.focus();
            // Opens native picker in modern browsers (Chrome/Edge/Safari)
            if (dateInput.showPicker) {
                try {
                    dateInput.showPicker();
                } catch (err) {
                    // Fallback: just focus (some browsers require user gesture)
                    console.log('showPicker not available or blocked');
                }
            }
        });
        dateWrap.dataset.bound = "true";
    }

    if (timeWrap && timeInput && !timeWrap.dataset.bound) {
        timeWrap.addEventListener('click', () => {
            timeInput.focus();
            if (timeInput.showPicker) {
                try {
                    timeInput.showPicker();
                } catch (err) {
                    console.log('showPicker not available or blocked');
                }
            }
        });
        timeWrap.dataset.bound = "true";
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
        .catch(error => {
            console.error('❌ Error importing Firestore:', error);
        });
}

// Add new appointment
async function handleAddAppointment(e) {
    e.preventDefault();
    
    if (!isAdmin) {
        showNotification('⚠️ Doar administratorii pot adăuga programări', 'error');
        return;
    }
    
    const customerName = document.getElementById('customerName').value.trim();
    const car = document.getElementById('car').value.trim();
    const dateStr = document.getElementById('appointmentDate').value;
    const timeStr = document.getElementById('appointmentTime').value;
    const address = document.getElementById('address').value.trim();
    const notes = document.getElementById('notes').value.trim();
    const status = document.getElementById('status').value;
    
    if (!customerName || !car || !dateStr || !timeStr) {
        showNotification('⚠️ Completează toate câmpurile obligatorii', 'error');
        return;
    }
    
    try {
        const { collection, addDoc, serverTimestamp, Timestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        // Create combined datetime
        const [year, month, day] = dateStr.split('-').map(Number);
        const [hours, minutes] = timeStr.split(':').map(Number);
        const startDate = new Date(year, month - 1, day, hours, minutes);
        
        console.log('📝 Adding appointment...');
        
        const docRef = await addDoc(collection(db, 'appointments'), {
            customerName,
            car,
            address: address || '',
            notes: notes || '',
            status,
            startAt: Timestamp.fromDate(startDate),
            dateStr,
            timeStr,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: currentUser.uid
        });
        
        console.log(`✅ Appointment added with ID: ${docRef.id}`);
        
        // Reset form
        e.target.reset();
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('appointmentDate').value = today;
        document.getElementById('status').value = 'scheduled';
        
        showNotification('✅ Programare adăugată cu succes!', 'success');
        
    } catch (error) {
        console.error('❌ Error adding appointment:', error);
        showNotification('❌ Eroare la adăugarea programării: ' + error.message, 'error');
    }
}

// Delete appointment
async function deleteAppointment(id) {
    if (!isAdmin) return;
    
    if (!confirm('Ești sigur că vrei să ștergi această programare?')) return;
    
    try {
        const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        console.log(`🗑️ Deleting appointment ${id}...`);
        
        await deleteDoc(doc(db, 'appointments', id));
        
        console.log(`✅ Appointment ${id} deleted`);
        showNotification('✅ Programare ștearsă cu succes', 'success');
        
    } catch (error) {
        console.error('❌ Error deleting appointment:', error);
        showNotification('❌ Eroare la ștergere: ' + error.message, 'error');
    }
}

// Mark appointment as done
// markAppointmentDone - removed, now opens finalize modal with pricing

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

// Filter appointments
function filterAppointments() {
    const filterStatus = document.getElementById('filterStatus')?.value || 'all';
    const searchTerm = document.getElementById('searchAppointments')?.value.toLowerCase() || '';
    
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    filteredAppointments = appointments.filter(apt => {
        // Search filter
        const matchesSearch = !searchTerm || 
            apt.customerName.toLowerCase().includes(searchTerm) ||
            apt.car.toLowerCase().includes(searchTerm);
        
        if (!matchesSearch) return false;
        
        // Status filter
        if (filterStatus === 'all') return true;
        if (filterStatus === 'today') return apt.dateStr === todayStr;
        if (filterStatus === 'upcoming') {
            const aptDate = apt.startAt.toDate();
            return aptDate > now && apt.status === 'scheduled';
        }
        if (filterStatus === 'overdue') {
            const aptDate = apt.startAt.toDate();
            return aptDate < now && apt.status === 'scheduled';
        }
        return apt.status === filterStatus;
    });
    
    renderAppointments();
}

// Render appointments grouped by day
function renderAppointments() {
    const container = document.getElementById('appointmentsList');
    const emptyState = document.getElementById('emptyStateAppointments');
    
    if (!filteredAppointments || filteredAppointments.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
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

// Create appointment card HTML
function createAppointmentCard(apt, now) {
    const aptDate = apt.startAt.toDate();
    const timeDiff = aptDate - now;
    const minutesDiff = Math.floor(timeDiff / 60000);
    
    // Check reminders
    let reminderBadge = '';
    if (apt.status === 'scheduled') {
        if (minutesDiff <= 30 && minutesDiff > 0) {
            reminderBadge = `<span class="reminder-badge reminder-soon"><i class="fas fa-bell"></i> În curând (≤30 min)</span>`;
        } else if (minutesDiff < 0) {
            reminderBadge = `<span class="reminder-badge reminder-overdue"><i class="fas fa-exclamation-triangle"></i> Întârziat</span>`;
        }
    }
    
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
    
    const addressRow = apt.address ? `
        <div class="detail-row">
            <i class="fas fa-map-marker-alt"></i>
            <span>${apt.address}</span>
        </div>
    ` : '';
    
    const notesRow = apt.notes ? `
        <div class="detail-row">
            <i class="fas fa-sticky-note"></i>
            <span>${apt.notes}</span>
        </div>
    ` : '';
    
    const adminActions = isAdmin ? `
        <div class="appointment-actions">
            <button class="btn-action-small btn-done" data-apt-id="${apt.id}">
                <i class="fas fa-check"></i> Finalizează
            </button>
            <button class="btn-action-small btn-cancel-appointment" data-apt-id="${apt.id}">
                <i class="fas fa-ban"></i> Anulează
            </button>
            <button class="btn-action-small btn-invoice" onclick="downloadInvoicePDF('${apt.id}')">
                <i class="fas fa-file-invoice"></i> Invoice
            </button>
            <button class="btn-action-small btn-delete-appointment" data-apt-id="${apt.id}">
                <i class="fas fa-trash"></i> Șterge
            </button>
        </div>
    ` : '';
    
    return `
        <div class="appointment-card">
            <div class="appointment-header">
                <div>
                    <div class="appointment-title">${apt.customerName}</div>
                    <div class="appointment-time">
                        <i class="fas fa-clock"></i> ${apt.timeStr || aptDate.toLocaleTimeString('ro-RO', {hour: '2-digit', minute: '2-digit'})}
                    </div>
                </div>
                <div>
                    <span class="status-badge ${statusClass}">
                        <i class="fas ${statusIcon}"></i> ${statusText}
                    </span>
                    ${reminderBadge}
                </div>
            </div>
            <div class="appointment-details">
                <div class="detail-row">
                    <i class="fas fa-car"></i>
                    <span><strong>Mașină:</strong> ${apt.car}</span>
                </div>
                ${addressRow}
                ${notesRow}
            </div>
            ${adminActions}
        </div>
    `;
}

// Event delegation for appointment action buttons
function bindAppointmentsClickDelegation() {
    const container = document.getElementById('appointmentsList');
    if (!container) return;
    
    // Prevent duplicate listeners
    if (appointmentsClicksBound) return;
    
    container.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-apt-id]');
        if (!btn) return;
        
        const id = btn.dataset.aptId;
        
        if (btn.classList.contains('btn-done')) {
            console.log('✅ Click Finalizează', id);
            markAppointmentDone(id);
        } else if (btn.classList.contains('btn-cancel-appointment')) {
            console.log('🟠 Click Anulează', id);
            cancelAppointment(id);
        } else if (btn.classList.contains('btn-delete-appointment')) {
            console.log('🗑️ Click Șterge', id);
            deleteAppointment(id);
        }
    });
    
    appointmentsClicksBound = true;
}

// Update appointment statistics
function updateAppointmentStats() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    const total = appointments.length;
    const today = appointments.filter(apt => apt.dateStr === todayStr).length;
    const upcoming = appointments.filter(apt => {
        const aptDate = apt.startAt.toDate();
        return aptDate > now && apt.status === 'scheduled';
    }).length;
    const done = appointments.filter(apt => apt.status === 'done').length;
    
    document.getElementById('totalAppointments').textContent = total;
    document.getElementById('todayAppointments').textContent = today;
    document.getElementById('upcomingAppointments').textContent = upcoming;
    document.getElementById('doneAppointments').textContent = done;
}

// Refresh appointments manually
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
        
        console.log('🔄 Manual refresh appointments triggered...');
        
        // Re-subscribe
        if (appointmentsUnsubscribe) {
            appointmentsUnsubscribe();
        }
        subscribeToAppointments();
        
        showNotification(`✅ Reîncărcat! ${appointments.length} ${appointments.length === 1 ? 'programare găsită' : 'programări găsite'}`, 'success');
        
    } catch (error) {
        console.error('❌ Error refreshing:', error);
        showNotification('❌ Eroare la reîncărcare', 'error');
    } finally {
        if (refreshButton) {
            refreshButton.classList.remove('refreshing');
            refreshButton.disabled = false;
        }
    }
}

// ========================================
// INVOICE SYSTEM WITH PRICES & SERVICES
// ========================================

// Currency formatter for GBP
function formatGBP(n) {
    return '£' + parseFloat(n || 0).toFixed(2);
}

// Load logo image and convert to Base64
function loadLogoAsDataURL(path) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            try {
                resolve(canvas.toDataURL('image/png'));
            } catch (err) {
                reject(err);
            }
        };
        img.onerror = () => reject(new Error('Failed to load logo'));
        img.src = path;
    });
}

// Global services array for finalize modal
let finalizeServices = [];

// Flag to prevent duplicate event listeners
let servicesTableListenerBound = false;

// Add new service row
function addServiceRow() {
    finalizeServices.push({ description: '', qty: 1, unitPrice: 0, lineTotal: 0 });
    renderServicesTable();
}

// Remove service row
function removeServiceRow(idx) {
    finalizeServices.splice(idx, 1);
    renderServicesTable();
}

// Render services table (render only, no event binding)
function renderServicesTable() {
    const tbody = document.getElementById('servicesTbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    finalizeServices.forEach((svc, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="svc-desc" data-idx="${i}" value="${svc.description || ''}" placeholder="ex: Schimb ulei motor" /></td>
            <td><input type="number" class="svc-qty" data-idx="${i}" min="1" step="1" value="${svc.qty || 1}" /></td>
            <td><input type="number" class="svc-unit" data-idx="${i}" min="0" step="0.01" value="${svc.unitPrice || 0}" placeholder="£" /></td>
            <td style="text-align:right;font-weight:600;" class="svc-total" data-idx="${i}">${formatGBP(svc.lineTotal || 0)}</td>
            <td><button type="button" class="btn-remove" data-idx="${i}"><i class="fas fa-times"></i></button></td>
        `;
        tbody.appendChild(tr);
    });

    recalcInvoiceTotals();
}

// Bind delegated event listeners for services table (call once)
function bindServicesTableDelegation() {
    const tbody = document.getElementById('servicesTbody');
    if (!tbody || servicesTableListenerBound) return;

    // Single delegated input listener for all input fields
    tbody.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        if (isNaN(idx) || !finalizeServices[idx]) return;

        if (e.target.classList.contains('svc-desc')) {
            // Description changed
            finalizeServices[idx].description = e.target.value;
        } else if (e.target.classList.contains('svc-qty')) {
            // Quantity changed
            finalizeServices[idx].qty = parseFloat(e.target.value) || 1;
            finalizeServices[idx].lineTotal = finalizeServices[idx].qty * finalizeServices[idx].unitPrice;
            
            // Update only this row's total cell (no full re-render)
            const totalCell = tbody.querySelector(`.svc-total[data-idx="${idx}"]`);
            if (totalCell) {
                totalCell.textContent = formatGBP(finalizeServices[idx].lineTotal);
            }
            recalcInvoiceTotals();
        } else if (e.target.classList.contains('svc-unit')) {
            // Unit price changed
            finalizeServices[idx].unitPrice = parseFloat(e.target.value) || 0;
            finalizeServices[idx].lineTotal = finalizeServices[idx].qty * finalizeServices[idx].unitPrice;
            
            // Update only this row's total cell (no full re-render)
            const totalCell = tbody.querySelector(`.svc-total[data-idx="${idx}"]`);
            if (totalCell) {
                totalCell.textContent = formatGBP(finalizeServices[idx].lineTotal);
            }
            recalcInvoiceTotals();
        }
    });

    // Single delegated click listener for remove buttons
    tbody.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.btn-remove');
        if (!removeBtn) return;
        
        const idx = parseInt(removeBtn.dataset.idx);
        if (!isNaN(idx)) {
            removeServiceRow(idx);
        }
    });

    servicesTableListenerBound = true;
}

// Recalculate invoice totals
function recalcInvoiceTotals() {
    const subtotal = finalizeServices.reduce((sum, s) => sum + (s.lineTotal || 0), 0);
    const vatRate = parseFloat(document.getElementById('finalizeVatRate')?.value || 0) / 100;
    const vatAmount = subtotal * vatRate;
    const total = subtotal + vatAmount;

    document.getElementById('invSubtotal').textContent = formatGBP(subtotal);
    document.getElementById('invVat').textContent = formatGBP(vatAmount);
    document.getElementById('invTotal').textContent = formatGBP(total);
}

// Bind finalize modal controls
function bindFinalizeModalControls() {
    const addBtn = document.getElementById('addServiceRowBtn');
    const vatInput = document.getElementById('finalizeVatRate');
    
    if (addBtn) {
        addBtn.addEventListener('click', addServiceRow);
    }
    if (vatInput) {
        vatInput.addEventListener('input', recalcInvoiceTotals);
    }
    
    // Bind delegated events for services table
    bindServicesTableDelegation();
}

// Open finalize modal with prices and services
window.openFinalizePricesModal = function(appointmentId) {
    const modal = document.getElementById('finalizeModal');
    if (!modal) return;

    const appt = appointments.find(a => a.id === appointmentId);
    if (!appt) return;

    // Load existing services or create default
    finalizeServices = appt.services && appt.services.length > 0
        ? JSON.parse(JSON.stringify(appt.services))
        : [{ description: 'Service auto', qty: 1, unitPrice: 0, lineTotal: 0 }];

    document.getElementById('finalizeAppointmentId').value = appointmentId;
    document.getElementById('finalizeMileage').value = appt.mileage || '';
    document.getElementById('finalizeVatRate').value = (appt.vatRate !== undefined ? appt.vatRate : 0);
    document.getElementById('generateInvoiceNow').checked = true;

    renderServicesTable();
    openModal('finalizeModal');
};

// Finalize appointment with prices
async function finalizeAppointmentWithPrices(e) {
    e.preventDefault();
    
    console.log('🔄 Starting finalize appointment...');
    
    const appointmentId = document.getElementById('finalizeAppointmentId').value;
    const mileage = parseInt(document.getElementById('finalizeMileage').value);
    const vatRate = parseFloat(document.getElementById('finalizeVatRate').value) || 0;
    const generateNow = document.getElementById('generateInvoiceNow').checked;
    const submitBtn = e.target.querySelector('button[type="submit"]');

    if (!appointmentId) {
        console.error('❌ No appointment ID');
        return;
    }
    if (!mileage || mileage < 0) {
        showNotification('⚠️ Mile obligatorii!', 'warning');
        return;
    }

    // Disable submit button to prevent double-submit
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Se salvează...';
    }

    // Calculate totals
    const subtotal = finalizeServices.reduce((sum, s) => sum + (s.lineTotal || 0), 0);
    const vatAmount = subtotal * (vatRate / 100);
    const total = subtotal + vatAmount;

    try {
        const { doc, updateDoc, Timestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const appointmentRef = doc(db, 'appointments', appointmentId);

        console.log('💾 Saving to Firestore...', { appointmentId, mileage, status: 'done' });

        await updateDoc(appointmentRef, {
            status: 'done',
            mileage,
            services: finalizeServices,
            subtotal,
            vatRate,
            vatAmount,
            total,
            doneAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        });

        console.log('✅ Firestore update successful');
        showNotification('✅ Programare finalizată cu succes!', 'success');

        // Close modal BEFORE invoice generation
        closeModal('finalizeModal');

        // Generate invoice if checked (after modal closed)
        if (generateNow) {
            console.log('📄 Generating invoice...');
            setTimeout(() => downloadInvoicePDF(appointmentId), 300);
        }

    } catch (error) {
        console.error('❌ Error finalizing appointment:', error);
        showNotification('❌ Eroare la finalizare: ' + error.message, 'error');
        
        // Re-enable button on error
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-check"></i> Finalizează + Salvează';
        }
    }
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
            apt.timeStr || '',
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
    }
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
    const modalIds = ['appointmentsModal', 'finalizeModal'];

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
            closeModal('finalizeModal');
        }
    });

    // Close buttons
    const aClose = document.getElementById('appointmentsModalClose');
    if (aClose && !aClose.dataset.bound) {
        aClose.addEventListener('click', () => closeModal('appointmentsModal'));
        aClose.dataset.bound = "true";
    }

    const fClose = document.getElementById('finalizeModalClose');
    if (fClose && !fClose.dataset.bound) {
        fClose.addEventListener('click', () => closeModal('finalizeModal'));
        fClose.dataset.bound = "true";
    }

    const fCancel = document.getElementById('finalizeCancelBtn');
    if (fCancel && !fCancel.dataset.bound) {
        fCancel.addEventListener('click', () => closeModal('finalizeModal'));
        fCancel.dataset.bound = "true";
    }
}

// ==============================
// STAT CARDS -> open popups
// ==============================
function bindStatsPopupButtons() {
    const totalCard = document.getElementById('totalAppointmentsCard');
    const doneCard = document.getElementById('doneAppointmentsCard');

    if (totalCard && !totalCard.dataset.bound) {
        totalCard.classList.add('clickable');
        totalCard.addEventListener('click', () => openAppointmentsPopup('all'));
        totalCard.dataset.bound = "true";
    }

    if (doneCard && !doneCard.dataset.bound) {
        doneCard.classList.add('clickable');
        doneCard.addEventListener('click', () => openAppointmentsPopup('done'));
        doneCard.dataset.bound = "true";
    }
}

// ==============================
// OPEN appointments popup
// ==============================
function openAppointmentsPopup(mode = 'all') {
    const title = document.getElementById('appointmentsModalTitle');
    const subtitle = document.getElementById('appointmentsModalSubtitle');

    if (mode === 'done') {
        title.textContent = 'Programări finalizate';
        subtitle.textContent = 'Toate programările cu status "Finalizat"';
    } else {
        title.textContent = 'Toate programările';
        subtitle.textContent = 'Lista completă a programărilor';
    }

    // Set default filter based on mode
    const statusFilter = document.getElementById('modalStatusFilter');
    const search = document.getElementById('modalSearch');
    if (search) search.value = '';
    if (statusFilter) statusFilter.value = (mode === 'done') ? 'done' : 'all';

    renderAppointmentsModalList();
    openModal('appointmentsModal');
}

function renderAppointmentsModalList() {
    const body = document.getElementById('appointmentsModalBody');
    const statusFilter = document.getElementById('modalStatusFilter')?.value || 'all';
    const searchTerm = (document.getElementById('modalSearch')?.value || '').toLowerCase();

    let list = appointments || [];

    // Filter
    list = list.filter(a => {
        const matchesSearch =
            !searchTerm ||
            (a.customerName || '').toLowerCase().includes(searchTerm) ||
            (a.car || '').toLowerCase().includes(searchTerm) ||
            (a.address || '').toLowerCase().includes(searchTerm);

        if (!matchesSearch) return false;

        if (statusFilter === 'all') return true;
        return a.status === statusFilter;
    });

    if (!list.length) {
        body.innerHTML = `<div style="padding:16px;opacity:0.7;">Nicio programare găsită.</div>`;
        return;
    }

    // Group by dateStr
    const grouped = {};
    list.forEach(a => {
        const key = a.dateStr || (a.startAt?.toDate?.()?.toISOString?.().split('T')[0]) || 'unknown';
        (grouped[key] ||= []).push(a);
    });

    const dates = Object.keys(grouped).sort();

    let html = '';
    dates.forEach(d => {
        html += `<div class="day-group"><div class="day-header"><i class="fas fa-calendar-day"></i> ${d}</div>`;
        grouped[d].forEach(a => {
            const statusClass = a.status === 'done' ? 'status-done' : a.status === 'canceled' ? 'status-canceled' : 'status-scheduled';
            const statusIcon = a.status === 'done' ? 'fa-check-circle' : a.status === 'canceled' ? 'fa-times-circle' : 'fa-clock';
            const statusText = a.status === 'done' ? 'Finalizat' : a.status === 'canceled' ? 'Anulat' : 'Programat';
            
            html += `
                <div class="appointment-card">
                    <div class="appointment-header">
                        <div>
                            <div class="appointment-title">${a.customerName || '-'}</div>
                            <div class="appointment-time"><i class="fas fa-clock"></i> ${a.timeStr || '-'}</div>
                        </div>
                        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                            <span class="status-badge ${statusClass}">
                                <i class="fas ${statusIcon}"></i> ${statusText}
                            </span>
                            <button class="btn-action-small" onclick="downloadInvoicePDF('${a.id}')" title="Descarcă factură PDF">
                                <i class="fas fa-file-invoice"></i> Invoice
                            </button>
                        </div>
                    </div>
                    <div class="appointment-details">
                        <div class="detail-row"><i class="fas fa-car"></i> <span><strong>Mașină:</strong> ${a.car || '-'}</span></div>
                        ${a.address ? `<div class="detail-row"><i class="fas fa-map-marker-alt"></i> <span>${a.address}</span></div>` : ''}
                        ${a.mileage != null ? `<div class="detail-row"><i class="fas fa-road"></i> <span><strong>Mile:</strong> ${a.mileage}</span></div>` : ''}
                        ${a.notes ? `<div class="detail-row"><i class="fas fa-sticky-note"></i> <span>${a.notes}</span></div>` : ''}
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    });

    body.innerHTML = html;
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

// ==============================
// Old finalize functions removed - now using openFinalizePricesModal
// ==============================

// Mark appointment as done - opens finalize modal with pricing
window.markAppointmentDone = function(id) {
    if (!isAdmin) return;
    openFinalizePricesModal(id);
}

// ==============================
// Invoice PDF (jsPDF)
// ==============================
async function getAppointmentById(id) {
    return (appointments || []).find(a => a.id === id);
}

window.downloadInvoicePDF = async function(appointmentId) {
    const appt = appointments.find(a => a.id === appointmentId);
    if (!appt) {
        showNotification('⚠️ Programare negăsită', 'warning');
        return;
    }

    // Load jsPDF if not already loaded
    if (typeof window.jspdf === 'undefined') {
        showNotification('⚠️ jsPDF library not loaded', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // --- Logo
    let logoDataURL = null;
    try {
        logoDataURL = await loadLogoAsDataURL('Images/Logo.png');
        doc.addImage(logoDataURL, 'PNG', 14, 10, 40, 20);
    } catch (err) {
        console.warn('⚠️ Could not load logo:', err);
    }

    // --- Company Header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Transvortex LTD', logoDataURL ? 60 : 14, 18);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('www.transvortex.co.uk', logoDataURL ? 60 : 14, 24);
    doc.text('contact@transvortex.co.uk', logoDataURL ? 60 : 14, 29);

    // --- Invoice Title
    let yPos = 45;
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 99, 72);
    doc.text('INVOICE', 14, yPos);
    doc.setTextColor(0, 0, 0);
    yPos += 12;

    // --- Invoice Info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const now = new Date().toLocaleDateString('ro-RO');
    doc.text(`Date: ${appt.dateStr || now}`, 14, yPos);
    yPos += 6;
    doc.text(`Customer: ${appt.customerName || 'N/A'}`, 14, yPos);
    yPos += 6;
    doc.text(`Vehicle: ${appt.car || 'N/A'}`, 14, yPos);
    yPos += 6;
    doc.text(`Mileage: ${appt.mileage || 'N/A'} miles`, 14, yPos);
    yPos += 10;

    // --- Services Table
    if (appt.services && appt.services.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(255, 99, 72);
        doc.rect(14, yPos, 182, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.text('Description', 16, yPos + 5);
        doc.text('Qty', 130, yPos + 5);
        doc.text('Unit Price', 150, yPos + 5);
        doc.text('Total', 180, yPos + 5);
        doc.setTextColor(0, 0, 0);
        yPos += 10;

        doc.setFont('helvetica', 'normal');
        appt.services.forEach(svc => {
            doc.text(svc.description || '', 16, yPos);
            doc.text(String(svc.qty || 1), 130, yPos);
            doc.text(formatGBP(svc.unitPrice || 0), 150, yPos);
            doc.text(formatGBP(svc.lineTotal || 0), 180, yPos);
            yPos += 6;
        });

        yPos += 5;
        
        // --- Totals
        doc.setFont('helvetica', 'bold');
        doc.text('Subtotal:', 150, yPos);
        doc.text(formatGBP(appt.subtotal || 0), 180, yPos);
        yPos += 6;

        if (appt.vatRate > 0) {
            doc.setFont('helvetica', 'normal');
            doc.text(`VAT (${appt.vatRate}%):`, 150, yPos);
            doc.text(formatGBP(appt.vatAmount || 0), 180, yPos);
            yPos += 6;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(255, 99, 72);
        doc.text('TOTAL:', 150, yPos);
        doc.text(formatGBP(appt.total || 0), 180, yPos);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        yPos += 10;

    } else {
        // No services - show basic notes
        doc.setFont('helvetica', 'bold');
        doc.text('Services / Notes:', 14, yPos);
        yPos += 8;
        doc.setFont('helvetica', 'normal');
        const notes = appt.notes || 'Service auto (detalii la cerere).';
        const splitNotes = doc.splitTextToSize(notes, 180);
        doc.text(splitNotes, 14, yPos);
    }

    // --- Footer
    doc.setDrawColor(230);
    doc.line(14, 270, 196, 270);
    doc.setFontSize(10);
    doc.text('Mulțumim! Transvortex LTD', 14, 278);

    const fileName = `invoice_${appt.customerName?.replace(/[^a-zA-Z0-9]/g, '_') || 'client'}_${appt.dateStr || now}.pdf`;
    
    // Mobile-friendly invoice handling
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    if (isMobile) {
        console.log('📱 Mobile detected - using share/blob URL');
        
        // Try to use Web Share API with PDF blob
        if (navigator.share && navigator.canShare) {
            try {
                const pdfBlob = doc.output('blob');
                const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
                
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: 'Invoice',
                        text: `Invoice for ${appt.customerName}`
                    });
                    showNotification('✅ Invoice partajat!', 'success');
                    console.log('✅ Invoice shared via Web Share API');
                    return;
                }
            } catch (shareError) {
                console.log('ℹ️ Share failed, falling back to blob URL:', shareError.message);
            }
        }
        
        // Fallback: Open in new tab using blob URL
        const blobUrl = doc.output('bloburl');
        window.open(blobUrl, '_blank');
        showNotification('✅ Invoice deschis în tab nou!', 'success');
        console.log('✅ Invoice opened in new tab (mobile)');
    } else {
        // Desktop: use traditional download
        doc.save(fileName);
        showNotification('✅ Invoice PDF descărcat!', 'success');
        console.log('✅ Invoice PDF downloaded (desktop)');
    }
}

// ==========================================
// ⏰ CUSTOM TIME PICKER - FULL IMPLEMENTATION
// ==========================================
const CustomTimePicker = {
    // State
    selectedHour: null,
    selectedMinute: null,
    selectedPeriod: 'AM',
    targetInput: null,
    displaySpan: null,
    
    // Elements (will be set after DOM loads)
    modal: null,
    overlay: null,
    hoursArea: null,
    minutesArea: null,
    previewText: null,
    amBtn: null,
    pmBtn: null,
    
    // Initialize the picker
    init() {
        console.log('⏰ CustomTimePicker: Initializing...');
        
        // Get modal elements
        this.modal = document.getElementById('timePickerModal');
        this.overlay = this.modal?.querySelector('.time-picker-overlay');
        this.hoursArea = document.getElementById('hoursScrollArea');
        this.minutesArea = document.getElementById('minutesScrollArea');
        this.previewText = document.getElementById('timePreviewText');
        this.amBtn = document.getElementById('amBtn');
        this.pmBtn = document.getElementById('pmBtn');
        
        if (!this.modal || !this.hoursArea || !this.minutesArea) {
            console.error('❌ Time picker elements not found!');
            return;
        }
        
        console.log('✅ Time picker elements found');
        
        // Generate hours (1-12)
        this.generateHours();
        
        // Generate minutes (00-59, step 1)
        this.generateMinutes();
        
        // Setup event listeners using event delegation
        this.setupEventListeners();
        
        console.log('✅ CustomTimePicker initialized');
    },
    
    generateHours() {
        this.hoursArea.innerHTML = '';
        for (let h = 1; h <= 12; h++) {
            const div = document.createElement('div');
            div.className = 'time-value-option';
            div.textContent = h;
            div.dataset.value = h;
            this.hoursArea.appendChild(div);
        }
        console.log('✅ Generated 12 hours');
    },
    
    generateMinutes() {
        this.minutesArea.innerHTML = '';
        // Step 1 for all minutes (00-59)
        for (let m = 0; m < 60; m++) {
            const div = document.createElement('div');
            div.className = 'time-value-option';
            div.textContent = m.toString().padStart(2, '0');
            div.dataset.value = m;
            this.minutesArea.appendChild(div);
        }
        console.log('✅ Generated 60 minutes');
    },
    
    setupEventListeners() {
        console.log('🔗 Setting up event listeners...');
        
        // IMPORTANT: Use event delegation on document for the trigger
        // This ensures it works even if the element is re-rendered
        document.addEventListener('click', (e) => {
            const timeWrap = e.target.closest('#timeWrap');
            if (timeWrap) {
                console.log('🖱️ timeWrap clicked');
                e.preventDefault();
                e.stopPropagation();
                this.open();
            }
        });
        
        // Hour selection (event delegation on scroll area)
        this.hoursArea.addEventListener('click', (e) => {
            const option = e.target.closest('.time-value-option');
            if (option) {
                const value = parseInt(option.dataset.value);
                console.log('Selected hour:', value);
                this.selectHour(value);
            }
        });
        
        // Minute selection (event delegation on scroll area)
        this.minutesArea.addEventListener('click', (e) => {
            const option = e.target.closest('.time-value-option');
            if (option) {
                const value = parseInt(option.dataset.value);
                console.log('Selected minute:', value);
                this.selectMinute(value);
            }
        });
        
        // AM/PM toggle buttons
        this.amBtn.addEventListener('click', () => this.setPeriod('AM'));
        this.pmBtn.addEventListener('click', () => this.setPeriod('PM'));
        
        // Close button
        document.getElementById('timePickerCloseBtn')?.addEventListener('click', () => {
            console.log('Close button clicked');
            this.close();
        });
        
        // Cancel button
        document.getElementById('timeCancelBtn')?.addEventListener('click', () => {
            console.log('Cancel button clicked');
            this.close();
        });
        
        // OK button
        document.getElementById('timeOkBtn')?.addEventListener('click', () => {
            console.log('OK button clicked');
            this.confirm();
        });
        
        // Click outside overlay to close
        this.overlay?.addEventListener('click', () => {
            console.log('Overlay clicked');
            this.close();
        });
        
        // ESC key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display !== 'none') {
                console.log('ESC pressed');
                this.close();
            }
        });
        
        console.log('✅ Event listeners attached');
    },
    
    open() {
        console.log('🔓 Opening time picker...');
        
        this.targetInput = document.getElementById('appointmentTime');
        this.displaySpan = document.getElementById('timeDisplayText');
        
        if (!this.targetInput || !this.displaySpan) {
            console.error('❌ Target input or display not found');
            return;
        }
        
        // Parse existing value if present
        const currentValue = this.targetInput.value;
        if (currentValue && currentValue.includes(':')) {
            console.log('Parsing existing value:', currentValue);
            const [hoursStr, minutesStr] = currentValue.split(':');
            const hours24 = parseInt(hoursStr);
            const minutes = parseInt(minutesStr);
            
            // Convert 24h to 12h + AM/PM
            if (hours24 === 0) {
                this.selectedHour = 12;
                this.selectedPeriod = 'AM';
            } else if (hours24 < 12) {
                this.selectedHour = hours24;
                this.selectedPeriod = 'AM';
            } else if (hours24 === 12) {
                this.selectedHour = 12;
                this.selectedPeriod = 'PM';
            } else {
                this.selectedHour = hours24 - 12;
                this.selectedPeriod = 'PM';
            }
            this.selectedMinute = minutes;
        } else {
            // Default to current time
            const now = new Date();
            const hours = now.getHours();
            const minutes = now.getMinutes();
            
            if (hours === 0) {
                this.selectedHour = 12;
                this.selectedPeriod = 'AM';
            } else if (hours < 12) {
                this.selectedHour = hours;
                this.selectedPeriod = 'AM';
            } else if (hours === 12) {
                this.selectedHour = 12;
                this.selectedPeriod = 'PM';
            } else {
                this.selectedHour = hours - 12;
                this.selectedPeriod = 'PM';
            }
            this.selectedMinute = minutes;
            
            console.log('Set to current time:', this.selectedHour, this.selectedMinute, this.selectedPeriod);
        }
        
        // Update UI
        this.updateSelections();
        this.updatePeriodButtons();
        this.updatePreview();
        
        // Show modal
        this.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        console.log('✅ Time picker opened');
    },
    
    close() {
        console.log('🔒 Closing time picker...');
        this.modal.style.display = 'none';
        document.body.style.overflow = '';
        console.log('✅ Time picker closed');
    },
    
    selectHour(hour) {
        this.selectedHour = hour;
        this.updateSelections();
        this.updatePreview();
    },
    
    selectMinute(minute) {
        this.selectedMinute = minute;
        this.updateSelections();
        this.updatePreview();
    },
    
    setPeriod(period) {
        console.log('Setting period:', period);
        this.selectedPeriod = period;
        this.updatePeriodButtons();
        this.updatePreview();
    },
    
    updateSelections() {
        // Update hour selection visual
        this.hoursArea.querySelectorAll('.time-value-option').forEach(opt => {
            const isSelected = parseInt(opt.dataset.value) === this.selectedHour;
            opt.classList.toggle('selected', isSelected);
            
            // Scroll selected into view
            if (isSelected) {
                setTimeout(() => {
                    opt.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 50);
            }
        });
        
        // Update minute selection visual
        this.minutesArea.querySelectorAll('.time-value-option').forEach(opt => {
            const isSelected = parseInt(opt.dataset.value) === this.selectedMinute;
            opt.classList.toggle('selected', isSelected);
            
            // Scroll selected into view
            if (isSelected) {
                setTimeout(() => {
                    opt.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 50);
            }
        });
    },
    
    updatePeriodButtons() {
        this.amBtn.classList.toggle('active', this.selectedPeriod === 'AM');
        this.pmBtn.classList.toggle('active', this.selectedPeriod === 'PM');
    },
    
    updatePreview() {
        if (this.selectedHour !== null && this.selectedMinute !== null) {
            const hourStr = this.selectedHour.toString().padStart(2, '0');
            const minuteStr = this.selectedMinute.toString().padStart(2, '0');
            const preview = `${hourStr}:${minuteStr} ${this.selectedPeriod}`;
            this.previewText.textContent = preview;
            console.log('Preview updated:', preview);
        }
    },
    
    confirm() {
        if (this.selectedHour === null || this.selectedMinute === null) {
            console.warn('⚠️ No time selected');
            showNotification('⚠️ Te rog selectează ora și minutele', 'warning');
            return;
        }
        
        // Convert to 24-hour format
        let hours24 = this.selectedHour;
        
        if (this.selectedPeriod === 'PM' && hours24 !== 12) {
            hours24 += 12;
        } else if (this.selectedPeriod === 'AM' && hours24 === 12) {
            hours24 = 0;
        }
        
        const hours24Str = hours24.toString().padStart(2, '0');
        const minuteStr = this.selectedMinute.toString().padStart(2, '0');
        const timeValue24h = `${hours24Str}:${minuteStr}`;
        
        // Friendly display (12h format)
        const hourStr12 = this.selectedHour.toString().padStart(2, '0');
        const displayText = `${hourStr12}:${minuteStr} ${this.selectedPeriod}`;
        
        console.log('✅ Selected time (24h):', timeValue24h);
        console.log('✅ Display text (12h):', displayText);
        
        // Set the hidden input to 24h format
        if (this.targetInput) {
            this.targetInput.value = timeValue24h;
        }
        
        // Update the display span
        if (this.displaySpan) {
            this.displaySpan.textContent = displayText;
        }
        
        this.close();
        showNotification('✅ Ora selectată: ' + displayText, 'success');
    }
};

// Initialize time picker after DOM is fully loaded
if (document.readyState === 'loading') {
    console.log('⏳ Waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', () => {
        console.log('✅ DOM loaded, initializing CustomTimePicker');
        CustomTimePicker.init();
    });
} else {
    console.log('✅ DOM already loaded, initializing CustomTimePicker immediately');
    CustomTimePicker.init();
}



