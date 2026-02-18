import { initFirebase, logFirebaseStatus } from './src/config/firebase.js';
import { initAuthListener, onAuthStateChange } from './src/core/auth-state.js';
import { bindActionDelegation } from './src/core/events.js';
import { t, getLanguage, setLanguage } from './language.js';
import { applyTranslations } from './init-language.js';
import { dedupeInvoicesForAppointment, getOrCreateInvoiceForAppointment, openInvoice } from './src/invoices/invoice-manager.js';
import { refreshVehicleFormatting } from './src/utils/input-formatters.js';

// ==========================================
// FIREBASE CONFIGURATION - SINGLE SOURCE
// ==========================================
// Firebase config lives in src/config/firebase.config.js
// Firebase initialization lives in src/config/firebase.js
// Auth state lives in src/core/auth-state.js
// ==========================================

// Global variables for Firebase
let app = null;
let auth = null;
let db = null;
let currentUser = null;
let isAdmin = false;
let isAccountant = false;

// Appointments global variables
let appointments = [];
let filteredAppointments = [];
let appointmentsUnsubscribe = null;

// Invoices Storage global variables
let allInvoices = [];
let filteredInvoices = [];
let invoicesUnsubscribe = null;

// Scanned invoices global variables
let scannedInvoices = [];
let scannedInvoicesUnsubscribe = null;
let pendingScannedInvoiceFile = null;
let pendingScannedPreviewUrl = null;
let scannedInvoiceOcrProgress = new Map();
let scannedInvoiceReviewState = null;
let scannedInvoiceReviewScanId = null;
let scannedInvoiceReviewBusy = false;
let scannedInvoiceBlobCache = new Map();
let scannedInvoicesCategoryFilter = 'all';
const ACCOUNTING_DEFAULT_CATEGORIES = [
    'Parts',
    'Fuel',
    'Tools',
    'Equipment',
    'Services',
    'Office',
    'Marketing',
    'Other'
];
let accountingWeeklyChart = null;
let accountingCategoryChart = null;
let accountingBackfillInFlight = new Set();
const ACCOUNTANT_UIDS = [
    // Add accountant UIDs here
];
let accountingCache = {
    scans: [],
    byWeek: new Map(),
    byMonth: new Map(),
    weeks: [],
    months: []
};

// Edit mode state
let editingAppointmentId = null;

// ========== DIAGNOSTICS ==========
let renderAppointmentsCallCount = 0;
let invoiceNumberGenerationCount = 0;
let firebaseListenerCount = 0;
// ==================================

// ========== WRITE TRACING (TEMPORARY DEBUG) ==========
const writeTraces = [];
let writeTraceEnabled = true;

async function tracedUpdateDoc(ref, data, reason="") {
    if (writeTraceEnabled) {
        const trace = new Error().stack;
        const info = {
            type: 'updateDoc',
            reason,
            path: ref?.path || 'unknown',
            timestamp: new Date().toISOString(),
            stack: trace
        };
        writeTraces.push(info);
        console.warn('🔥 WRITE updateDoc triggered:', reason);
        console.warn('📍 Path:', info.path);
        console.warn('📋 Data:', data);
        console.trace('Call stack:');
        
        // Limit trace array to last 20 writes
        if (writeTraces.length > 20) writeTraces.shift();
    }
    
    const { updateDoc: originalUpdateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    return originalUpdateDoc(ref, data);
}

async function tracedSetDoc(ref, data, opts=undefined, reason="") {
    if (writeTraceEnabled) {
        const trace = new Error().stack;
        const info = {
            type: 'setDoc',
            reason,
            path: ref?.path || 'unknown',
            timestamp: new Date().toISOString(),
            stack: trace
        };
        writeTraces.push(info);
        console.warn('🔥 WRITE setDoc triggered:', reason);
        console.warn('📍 Path:', info.path);
        console.warn('📋 Data:', data);
        console.trace('Call stack:');
        
        if (writeTraces.length > 20) writeTraces.shift();
    }
    
    const { setDoc: originalSetDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    return opts ? originalSetDoc(ref, data, opts) : originalSetDoc(ref, data);
}

// Expose for use in console
window.toggleWriteTrace = () => {
    writeTraceEnabled = !writeTraceEnabled;
    console.log('Write trace:', writeTraceEnabled ? 'ENABLED' : 'DISABLED');
};
window.getWriteTraces = () => writeTraces;
window.showLastWrite = () => {
    if (writeTraces.length === 0) {
        console.log('No writes recorded');
        return;
    }
    const last = writeTraces[writeTraces.length - 1];
    console.log('=== LAST WRITE ===');
    console.log('Type:', last.type);
    console.log('Reason:', last.reason);
    console.log('Path:', last.path);
    console.log('Time:', last.timestamp);
    console.log('Stack:', last.stack);
};
// ===================================================

// Current active tab
let currentTab = 'appointments';

// Appointment buttons delegation flag
let appointmentsClicksBound = false;

// Track which appointments have used the Call button once (to trigger action layout swap)
let callUsedOnce = {};

// ==========================================
// PAYMENT HELPER FUNCTIONS
// ==========================================

/**
 * Format amount as GBP currency
 * @param {number} amount - The amount to format
 * @returns {string} Formatted currency string (£X.XX)
 */
function formatCurrencyGBP(amount) {
    const num = toNumber(amount);
    return '£' + num.toFixed(2);
}

/**
 * Safely parse a value to number
 * @param {any} value - Value to parse
 * @returns {number} Parsed number or 0
 */
function toNumber(value) {
    if (typeof value === 'number') return value;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
}

/**
 * Compute payment status based on total and amount paid
 * @param {number} total - Total invoice amount
 * @param {number} amountPaid - Amount paid by client
 * @returns {string} Payment status: 'Unpaid', 'Partially Paid', or 'Paid'
 */
function computePaymentStatus(total, amountPaid) {
    const t = toNumber(total);
    const p = toNumber(amountPaid);
    if (p === 0) return 'Unpaid';
    if (p >= t) return 'Paid';
    return 'Partially Paid';
}

/**
 * Compute balance due
 * @param {number} total - Total invoice amount
 * @param {number} amountPaid - Amount paid by client
 * @returns {number} Balance due (never negative)
 */
function computeBalance(total, amountPaid) {
    return Math.max(0, toNumber(total) - toNumber(amountPaid));
}

// ==========================================
// JOBS & PARTS BUILDER (Appointments)
// ==========================================
// Built-in default presets (no prices - prices vary per car)
const BUILTIN_JOB_PRESETS = [
    'Diagnostics',
    'Oil Change',
    'Brake Pads Replacement',
    'Brake Discs Replacement',
    'Battery Replacement',
    'Starter Motor Replacement',
    'Alternator Replacement',
    'Timing Belt Service',
    'Wheel Alignment',
    'Suspension Check',
    'MOT Prep',
    'Air Conditioning Service'
];

const BUILTIN_PART_PRESETS = [
    'Oil Filter',
    'Air Filter',
    'Cabin Filter',
    'Fuel Filter',
    'Brake Pads Set',
    'Brake Discs Pair',
    'Battery',
    'Spark Plugs Set',
    'Engine Oil (5L)',
    'Coolant (5L)',
    'Wiper Blades'
];

// Runtime preset arrays (merged built-in + Firestore custom)
let jobPresets = [...BUILTIN_JOB_PRESETS];
let partPresets = [...BUILTIN_PART_PRESETS];

function buildLineItemRow(type, data = {}) {
    const rowKind = type === 'labour' ? 'job' : 'part';
    const row = document.createElement('div');
    row.classList.add('itemRow');
    row.dataset.kind = rowKind;

    const qty = data.qty || 1;
    const unitPrice = toNumber(data.unitPrice || data.price || 0);
    const lineTotal = qty * unitPrice;

    row.innerHTML = `
        <div class="itemMain">
            <input 
                class="itemName" 
                type="text"
                placeholder="Search or type new..."
                value="${data.description || ''}" 
                autocomplete="off" 
                data-preset-type="${type}" />
            <button type="button" class="ghostBtn savePresetBtn" title="Save as new ${rowKind}">
                Save
            </button>
        </div>

        <div class="itemNums">
            <input 
                class="itemQty" 
                type="number" 
                min="1" 
                step="1" 
                value="${qty}" 
                title="Quantity" />
            <input 
                class="itemPrice" 
                type="number" 
                min="0" 
                step="0.01" 
                placeholder="£" 
                value="${unitPrice > 0 ? unitPrice : ''}" 
                title="Unit price" />
            <div class="itemRowTotal">${formatCurrencyGBP(lineTotal)}</div>
            <button type="button" class="dangerIcon removeItemBtn" title="Remove item">
                🗑
            </button>
        </div>

        <input class="itemNameHidden" type="hidden" value="${data.description || ''}" />
    `;

    return row;
}

function renderLineItemsInContainer(containerId, type, items = [], ensureOne = false) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    if (Array.isArray(items) && items.length > 0) {
        items.forEach(item => {
            const row = buildLineItemRow(type, item);
            container.appendChild(row);
        });
    } else if (ensureOne) {
        const row = buildLineItemRow(type);
        container.appendChild(row);
    }
}

function updateLineItemTotal(row) {
    if (!row) return;
    // Updated for new compact item row structure
    const qty = Math.max(1, toNumber(row.querySelector('.itemQty')?.value || 1));
    const unitPrice = toNumber(row.querySelector('.itemPrice')?.value || 0);
    const lineTotal = qty * unitPrice;
    const totalEl = row.querySelector('.itemRowTotal');
    if (totalEl) totalEl.textContent = formatCurrencyGBP(lineTotal);
    row.dataset.lineTotal = lineTotal.toString();
    row.dataset.qty = qty.toString();
    row.dataset.unitPrice = unitPrice.toString();
}

// Smart Select: Filter and render suggestions
function renderSmartSelectList(smartSelect, query) {
    const type = smartSelect.dataset.presetType;
    const presets = type === 'labour' ? jobPresets : partPresets;
    const list = smartSelect.querySelector('.smart-select__list');
    if (!list) return;

    const lowerQuery = query.toLowerCase().trim();
    
    // Filter: prefix match first, then substring match
    let filtered = [];
    if (lowerQuery) {
        const prefixMatches = presets.filter(p => p.toLowerCase().startsWith(lowerQuery));
        const substringMatches = presets.filter(p => 
            !p.toLowerCase().startsWith(lowerQuery) && p.toLowerCase().includes(lowerQuery)
        );
        filtered = [...prefixMatches, ...substringMatches];
    } else {
        filtered = [...presets];
    }

    // Build list HTML
    let html = '';
    
    if (filtered.length > 0) {
        html = filtered.slice(0, 10).map(preset => 
            `<div class="smart-select__item" data-value="${escapeHtml(preset)}">${escapeHtml(preset)}</div>`
        ).join('');
    }
    
    // Add "Add new" option if query doesn't exactly match any preset
    if (lowerQuery.length >= 2) {
        const exactMatch = presets.some(p => p.toLowerCase() === lowerQuery);
        if (!exactMatch) {
            html += `<div class="smart-select__add" data-new-value="${escapeHtml(query.trim())}">
                        <i class="fas fa-plus-circle"></i> Add "${escapeHtml(query.trim())}"
                     </div>`;
        }
    }

    if (!html) {
        html = '<div class="smart-select__empty">No matches found</div>';
    }

    list.innerHTML = html;
    list.style.display = 'block';
}

// Smart Select: Select a preset
function selectSmartSelectItem(smartSelect, value) {
    const input = smartSelect.querySelector('.smart-select__input');
    const row = smartSelect.closest('.tvLineItemRow');
    const descInput = row?.querySelector('.tvLineItemDesc');
    const list = smartSelect.querySelector('.smart-select__list');

    if (input) input.value = value;
    if (descInput) descInput.value = value;
    if (list) list.style.display = 'none';
    
    updateLineItemTotal(row);
    updateAppointmentTotals();
}

// Smart Select: Add new preset to Firestore
async function addNewPreset(type, name) {
    const trimmedName = name.trim();
    
    // Validate
    if (trimmedName.length < 2) {
        console.warn('Preset name too short:', trimmedName);
        return false;
    }
    
    // Check for duplicates (case-insensitive)
    const presets = type === 'labour' ? jobPresets : partPresets;
    const exists = presets.some(p => p.toLowerCase() === trimmedName.toLowerCase());
    if (exists) {
        console.log('Preset already exists:', trimmedName);
        return true; // Already exists, not an error
    }
    
    if (!db || !currentUser) {
        console.warn('Cannot save preset: Firebase not initialized or user not logged in');
        return false;
    }
    
    try {
        const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const collectionName = type === 'labour' ? 'presets_jobs' : 'presets_parts';
        
        await addDoc(collection(db, collectionName), {
            name: trimmedName,
            createdAt: serverTimestamp(),
            createdByUid: currentUser.uid
        });
        
        // Add to in-memory array
        if (type === 'labour') {
            jobPresets.push(trimmedName);
            jobPresets.sort();
        } else {
            partPresets.push(trimmedName);
            partPresets.sort();
        }
        
        console.log(`✅ New ${type} preset added:`, trimmedName);
        return true;
    } catch (error) {
        console.error('Error adding preset:', error);
        return false;
    }
}

// Escape HTML for safe rendering
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function addJobRow(data = {}) {
    const container = document.getElementById('jobsContainer');
    if (!container) return;
    const row = buildLineItemRow('labour', data);
    container.appendChild(row);
    updateAppointmentTotals();
}

function addPartRow(data = {}) {
    const container = document.getElementById('partsContainer');
    if (!container) return;
    const row = buildLineItemRow('part', data);
    container.appendChild(row);
    updateAppointmentTotals();
}

function renderJobRows(services = []) {
    const container = document.getElementById('jobsContainer');
    if (!container) return;
    container.innerHTML = '';
    if (Array.isArray(services) && services.length > 0) {
        services.forEach(item => addJobRow(item));
    } else {
        addJobRow();
    }
}

function renderPartRows(parts = []) {
    const container = document.getElementById('partsContainer');
    if (!container) return;
    container.innerHTML = '';
    if (Array.isArray(parts) && parts.length > 0) {
        parts.forEach(item => addPartRow(item));
    }
}

function collectJobsPartsFromContainers(jobsContainerId, partsContainerId) {
    const jobsContainer = document.getElementById(jobsContainerId);
    const partsContainer = document.getElementById(partsContainerId);

    const collectRows = (container) => {
        if (!container) return [];
        const rows = Array.from(container.querySelectorAll('.itemRow'));
        return rows.map(row => {
            const description = row.querySelector('.itemName')?.value?.trim() || '';
            const qty = Math.max(1, toNumber(row.querySelector('.itemQty')?.value || 1));
            const unitPrice = toNumber(row.querySelector('.itemPrice')?.value || 0);
            const lineTotal = qty * unitPrice;
            if (!description && unitPrice === 0) return null;
            return {
                type: row.dataset.kind === 'job' ? 'labour' : 'part',
                description,
                qty,
                unitPrice,
                lineTotal
            };
        }).filter(Boolean);
    };

    const services = collectRows(jobsContainer);
    const parts = collectRows(partsContainer);

    return { services, parts };
}

function collectJobsPartsFromForm() {
    return collectJobsPartsFromContainers('jobsContainer', 'partsContainer');
}

function parseCurrencyToNumber(value) {
    if (value === null || value === undefined) return 0;
    const cleaned = String(value).replace(/[^0-9.-]+/g, '');
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
}

function collectChipsFromList(listId, kind) {
    const list = document.getElementById(listId);
    if (!list) return [];

    const chips = Array.from(list.querySelectorAll('.chipItem'));
    return chips.map(chip => {
        const name = chip.querySelector('.chipName')?.textContent?.trim() || '';
        const qtyValue = chip.querySelector('.chipQty')?.value ?? '0';
        const priceValue = chip.querySelector('.chipPrice')?.value ?? '0';

        let qty = parseInt(qtyValue, 10);
        if (!Number.isFinite(qty) || qty < 1) qty = 1;

        let unitPrice = parseCurrencyToNumber(priceValue);
        if (unitPrice < 0) unitPrice = 0;

        const lineTotal = qty * unitPrice;

        if (!name) return null;

        return {
            type: kind,
            description: name,
            name,
            qty,
            unitPrice,
            price: unitPrice,
            lineTotal
        };
    }).filter(Boolean);
}

function collectJobsFromUI() {
    return collectChipsFromList('jobsChips', 'labour');
}

function collectPartsFromUI() {
    return collectChipsFromList('partsChips', 'part');
}

function collectNotesFromUI() {
    const notesInput = document.getElementById('notes');
    return notesInput ? notesInput.value.trim() : '';
}

function collectTotalsFromUI(jobs = [], parts = []) {
    const labour = jobs.reduce((sum, item) => sum + toNumber(item.total ?? item.lineTotal ?? (item.qty * item.unitPrice)), 0);
    const partsTotal = parts.reduce((sum, item) => sum + toNumber(item.total ?? item.lineTotal ?? (item.qty * item.unitPrice)), 0);
    const subtotal = labour + partsTotal;
    const total = subtotal;

    return {
        labour,
        parts: partsTotal,
        subtotal,
        total
    };
}

function updateAppointmentTotals() {
    const jobs = collectJobsFromUI();
    const parts = collectPartsFromUI();
    const labourSubtotal = jobs.reduce((sum, item) => sum + toNumber(item.lineTotal), 0);
    const partsSubtotal = parts.reduce((sum, item) => sum + toNumber(item.lineTotal), 0);
    const combined = labourSubtotal + partsSubtotal;

    const labourEl = document.getElementById('labourSubtotal');
    const partsEl = document.getElementById('partsSubtotal');
    const combinedEl = document.getElementById('combinedSubtotal');
    if (labourEl) labourEl.textContent = formatCurrencyGBP(labourSubtotal);
    if (partsEl) partsEl.textContent = formatCurrencyGBP(partsSubtotal);
    if (combinedEl) combinedEl.textContent = formatCurrencyGBP(combined);
}

function bindLineItemEvents(container, onTotalsUpdated) {
    if (!container || container.dataset.bound) return;

    // New compact items panel - input events
    container.addEventListener('input', (e) => {
        // Handle qty/price changes in compact items panel
        if (e.target.classList.contains('itemQty') || e.target.classList.contains('itemPrice')) {
            const row = e.target.closest('.itemRow');
            if (row) {
                const qty = Math.max(1, toNumber(row.querySelector('.itemQty')?.value || 1));
                const unitPrice = toNumber(row.querySelector('.itemPrice')?.value || 0);
                const lineTotal = qty * unitPrice;
                const totalEl = row.querySelector('.itemRowTotal');
                if (totalEl) totalEl.textContent = formatCurrencyGBP(lineTotal);
                if (typeof onTotalsUpdated === 'function') onTotalsUpdated();
            }
            return;
        }
    });

    // Item row actions - click events
    container.addEventListener('click', (e) => {
        // Remove item button
        if (e.target.closest('.removeItemBtn')) {
            const row = e.target.closest('.itemRow');
            if (row) {
                row.remove();
                if (typeof onTotalsUpdated === 'function') onTotalsUpdated();
            }
            return;
        }

        // Save preset button
        if (e.target.closest('.savePresetBtn')) {
            const row = e.target.closest('.itemRow');
            if (row) {
                const input = row.querySelector('.itemName');
                const presetType = input?.dataset.presetType;
                const presetName = input?.value?.trim();
                
                if (presetType && presetName && presetName.length >= 2) {
                    addNewPreset(presetType, presetName).then(success => {
                        if (success) {
                            showNotification(`✅ Saved "${presetName}" as new ${presetType === 'labour' ? 'job' : 'part'}`, 'success');
                        }
                    });
                }
            }
            return;
        }
    });

    container.dataset.bound = 'true';
}

// Close smart-select lists when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.smart-select')) {
        document.querySelectorAll('.smart-select__list').forEach(list => {
            list.style.display = 'none';
        });
    }
});

function buildJobsSummary(services = [], parts = []) {
    const jobNames = services.map(item => item.description).filter(Boolean);
    const partNames = parts.map(item => item.description).filter(Boolean);

    const jobText = jobNames.length > 0 ? `Jobs: ${jobNames.join(', ')}` : '';
    const partText = partNames.length > 0 ? `Parts: ${partNames.join(', ')}` : '';

    if (jobText && partText) return `${jobText} | ${partText}`;
    return jobText || partText || '';
}

// ==========================================
// FIRESTORE PRESET LOADING
// ==========================================
async function loadPresetsFromFirestore() {
    if (!db) {
        console.warn('Cannot load presets: Firestore not initialized');
        return;
    }

    try {
        const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        // Load job presets
        const jobsSnapshot = await getDocs(collection(db, 'presets_jobs'));
        const customJobs = jobsSnapshot.docs.map(doc => doc.data().name).filter(Boolean);
        
        // Load part presets
        const partsSnapshot = await getDocs(collection(db, 'presets_parts'));
        const customParts = partsSnapshot.docs.map(doc => doc.data().name).filter(Boolean);
        
        // Merge with built-in defaults (avoid duplicates)
        jobPresets = [...new Set([...BUILTIN_JOB_PRESETS, ...customJobs])].sort();
        partPresets = [...new Set([...BUILTIN_PART_PRESETS, ...customParts])].sort();
        
        console.log(`✅ Loaded ${customJobs.length} custom job presets, ${customParts.length} custom part presets`);
    } catch (error) {
        console.error('Error loading presets from Firestore:', error);
        // Keep built-in presets on error
    }
}

// ==========================================
// FIREBASE INITIALIZATION (Single Source)
// ==========================================
// Firebase is initialized ONCE in src/config/firebase.js
// Auth state is managed in src/core/auth-state.js
async function initializeFirebase() {
    try {
        console.log("🔥 Firebase SDK: Initializing (single source)...");

        const { app: fbApp, auth: fbAuth, db: fbDb } = initFirebase();

        app = fbApp;
        auth = fbAuth;
        db = fbDb;

        // Log Firebase status
        logFirebaseStatus();

        await initAuthListener();

        onAuthStateChange(async (user, isAdminFlag) => {
            currentUser = user;
            isAdmin = isAdminFlag;
            isAccountant = Boolean(user?.uid && ACCOUNTANT_UIDS.includes(user.uid));
            updateAuthUI();
            applyAccountantModeUi();

            if (user) {
                console.log(`✅ User authenticated: ${user.email}`);
                if (isAdmin) {
                    console.log("👑 Admin access granted");
                }

                // Load custom presets from Firestore
                await loadPresetsFromFirestore();

                setupEventListeners();
                subscribeToAppointments();
                subscribeToScannedInvoices();

            } else {
                console.log("🔓 User logged out");
                appointments = [];
                scannedInvoices = [];
                isAccountant = false;
                scannedInvoiceOcrProgress.clear();
                scannedInvoiceBlobCache.clear();
                
                // Unsubscribe from appointments
                if (appointmentsUnsubscribe) {
                    appointmentsUnsubscribe();
                    appointmentsUnsubscribe = null;
                }

                if (scannedInvoicesUnsubscribe) {
                    scannedInvoicesUnsubscribe();
                    scannedInvoicesUnsubscribe = null;
                }

                clearScannedInvoicePending();
                renderScannedInvoicesList();
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
            const { signOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
            await signOut(auth);
            console.log("✅ User logged out successfully");
        } catch (error) {
            console.error("❌ Logout error:", error);
            updateAuthStatus("Eroare la deconectare.");
        }
    } else {
        // User not logged in → Google Sign-In
        try {
            const { signInWithPopup, GoogleAuthProvider } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');

            const provider = new GoogleAuthProvider();
            auth.languageCode = 'ro';
            provider.addScope('profile');
            provider.addScope('email');

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
                console.error("SOLUTION: Verify firebaseConfig in src/config/firebase.config.js matches Console");
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
    const adminHeaderVideo = document.getElementById('adminHeaderVideo');

    // DEBUG: Log element existence
    console.log('🔍 [updateAuthUI] adminHeaderVideo element:', adminHeaderVideo ? '✅ Found' : '❌ Not found');
    console.log('🔍 [updateAuthUI] currentUser:', currentUser ? currentUser.email : 'null');
    console.log('🔍 [updateAuthUI] isAdmin:', isAdmin);

    if (currentUser) {
        authStatus.innerHTML = `✅ ${currentUser.displayName || 'Conectat'}`;
        authButton.textContent = 'Deconectare';
        authButton.disabled = false;

        if (isAdmin) {
            // Show admin header video, hide text badge
            if (adminHeaderVideo) {
                adminHeaderVideo.classList.remove('admin-header-video-hidden');
                console.log('✅ [Admin] Removed admin-header-video-hidden class');
                
                // Force reflow to apply CSS changes
                void adminHeaderVideo.offsetHeight;
                
                // Verify element is visible
                const computedStyle = window.getComputedStyle(adminHeaderVideo);
                console.log('🎬 [Admin Video] Display:', computedStyle.display);
                console.log('🎬 [Admin Video] Visibility:', computedStyle.visibility);
                console.log('🎬 [Admin Video] Height:', computedStyle.height);
                console.log('🎬 [Admin Video] Width:', computedStyle.width);
                
                // Attempt autoplay
                playAdminHeaderVideo(adminHeaderVideo);
            } else {
                console.error('❌ [Admin] adminHeaderVideo element not found!');
            }
            adminBadge.style.display = 'none';
            authStatus.style.display = 'none';
            
            // Show admin-only sections
            document.querySelectorAll('[data-admin-only]').forEach(el => {
                el.classList.add('admin-visible');
            });
            // Trigger admin intro animation
            showAdminIntroAnimation();
        } else {
            // Show regular text and badge, hide video
            if (adminHeaderVideo) {
                adminHeaderVideo.classList.add('admin-header-video-hidden');
                console.log('✅ [Non-admin] Hidden video, showing text');
            }
            adminBadge.style.display = 'none';
            authStatus.style.display = 'inline';
            
            // Hide admin-only sections
            document.querySelectorAll('[data-admin-only]').forEach(el => {
                el.classList.remove('admin-visible');
            });
        }
    } else {
        authStatus.innerHTML = '🔓 ' + t('connectToStart');
        authButton.textContent = 'Conectare cu Google';
        authButton.disabled = false;
        adminBadge.style.display = 'none';
        
        // Hide admin header video for non-logged-in users
        if (adminHeaderVideo) {
            adminHeaderVideo.classList.add('admin-header-video-hidden');
            console.log('✅ [Logged out] Hidden admin video');
        }
        authStatus.style.display = 'inline';
        
        // Hide admin sections
        document.querySelectorAll('[data-admin-only]').forEach(el => {
            el.classList.remove('admin-visible');
        });
    }
}

/**
 * Play admin header video with fallback
 * If autoplay fails, fallback to showing text
 */
function playAdminHeaderVideo(videoElement) {
    if (!videoElement) {
        console.error('❌ [playAdminHeaderVideo] No video element provided');
        return;
    }

    console.log('🎬 [playAdminHeaderVideo] Attempting autoplay on:', videoElement.id);
    console.log('🎬 [playAdminHeaderVideo] Video src:', videoElement.src);
    console.log('🎬 [playAdminHeaderVideo] Video muted:', videoElement.muted);
    console.log('🎬 [playAdminHeaderVideo] Video autoplay attr:', videoElement.hasAttribute('autoplay'));

    // Ensure video is loaded
    videoElement.load();
    
    const playPromise = videoElement.play();
    if (playPromise !== undefined) {
        playPromise
            .then(() => {
                console.log('✅ Admin header video autoplay successful');
            })
            .catch(error => {
                console.warn('⚠️ Admin header video autoplay blocked:', error.name, error.message);
                console.log('📸 Fallback: Will display static image instead');
                // Fallback: show text instead
                fallbackToAdminText();
            });
    } else {
        // Older browsers without play() Promise support
        console.log('ℹ️ Browser does not support play() Promise - autoplay may or may not work');
        try {
            videoElement.play();
        } catch (e) {
            console.warn('⚠️ Video play() failed:', e.message);
            fallbackToAdminText();
        }
    }
}

/**
 * Fallback: show admin text instead of video if autoplay fails
 */
function fallbackToAdminText() {
    const adminHeaderVideo = document.getElementById('adminHeaderVideo');
    const authStatus = document.getElementById('authStatus');
    const adminBadge = document.getElementById('adminBadge');

    if (adminHeaderVideo) {
        adminHeaderVideo.classList.add('admin-header-video-hidden');
    }
    
    if (authStatus) {
        authStatus.style.display = 'inline';
    }
    
    if (adminBadge) {
        adminBadge.style.display = 'inline-block';
    }

    console.log('↩️ Fallback: Showing admin text badge instead');
}

/**
 * DEBUG: Diagnose why admin header video isn't appearing
 * Run from console: window.debugAdminVideo()
 */
window.debugAdminVideo = function() {
    const video = document.getElementById('adminHeaderVideo');
    const authBar = document.getElementById('authBar');
    const authLeft = document.querySelector('.auth-left');
    
    console.group('🔍 Admin Header Video Diagnostics');
    
    console.log('1️⃣ Element Existence:');
    console.log('   adminHeaderVideo:', video ? '✅ Found' : '❌ Missing', video);
    console.log('   authBar:', authBar ? '✅ Found' : '❌ Missing');
    console.log('   auth-left:', authLeft ? '✅ Found' : '❌ Missing');
    
    if (video) {
        const computed = window.getComputedStyle(video);
        console.log('\n2️⃣ Video Element Style:');
        console.log('   display:', computed.display);
        console.log('   visibility:', computed.visibility);
        console.log('   opacity:', computed.opacity);
        console.log('   height:', computed.height);
        console.log('   width:', computed.width);
        console.log('   z-index:', computed.zIndex);
        console.log('   position:', computed.position);
        
        console.log('\n3️⃣ Video Attributes:');
        console.log('   src:', video.src);
        console.log('   muted:', video.muted);
        console.log('   autoplay:', video.autoplay);
        console.log('   playsinline:', video.playsinline);
        console.log('   poster:', video.poster);
        console.log('   classList:', Array.from(video.classList));
        
        console.log('\n4️⃣ Parent Container Style:');
        if (authLeft) {
            const parentComputed = window.getComputedStyle(authLeft);
            console.log('   display:', parentComputed.display);
            console.log('   gap:', parentComputed.gap);
            console.log('   visibility:', parentComputed.visibility);
        }
        
        console.log('\n5️⃣ Auth State:');
        console.log('   currentUser:', currentUser ? currentUser.email : 'null');
        console.log('   isAdmin:', isAdmin);
        
        console.log('\n6️⃣ Key Check - is video hidden?');
        console.log('   Has class "admin-header-video-hidden":', video.classList.contains('admin-header-video-hidden'));
        
        console.log('\n7️⃣ File Check:');
        console.log('   Video src exists:', video.src ? '✅' : '❌');
        console.log('   Poster exists:', video.poster ? '✅' : '❌');
        
        console.log('\n💡 NEXT STEPS:');
        if (video.classList.contains('admin-header-video-hidden')) {
            console.log('   → Video is currently HIDDEN (class applied)');
            console.log('   → Log out and log back in as ADMIN to trigger display');
        } else {
            console.log('   → Video should be VISIBLE');
            console.log('   → Check if it\'s loading: video.readyState =', video.readyState);
            console.log('   → Try playing: video.play()');
        }
    }
    
    console.groupEnd();
};

/**
 * Show admin intro animation overlay (ADMIN only)
 * Triggers on first visit per session
 * Animates from center to header logo position
 */
function showAdminIntroAnimation() {
    // Only show for admins
    if (!isAdmin || !currentUser) {
        return;
    }

    // Prevent multiple playthroughs per session
    const introShownKey = 'adminIntroShown_' + currentUser.uid;
    if (sessionStorage.getItem(introShownKey)) {
        return;
    }

    // Mark intro as shown for this session
    sessionStorage.setItem(introShownKey, 'true');

    const overlay = document.getElementById('adminIntroOverlay');
    const video = document.getElementById('adminIntroVideo');
    
    if (!overlay || !video) {
        console.warn('⚠️ Admin intro overlay elements not found');
        return;
    }

    // Set video source (users should update this path to their actual video)
    if (!video.src) {
        // Fallback: use a simple animated brand asset
        // For production, replace with actual Transvortex admin intro video
        console.log('ℹ️ Admin intro video source not set. Using fallback.');
        // You can load a video from ./Logo/admin-intro.mp4 once created
        // video.src = './Logo/admin-intro.mp4';
    }

    // Show overlay
    overlay.classList.remove('admin-intro-hidden');

    // Attempt to play video with iOS-compatible handling
    const playPromise = video.play();
    if (playPromise !== undefined) {
        playPromise
            .then(() => {
                console.log('✅ Admin intro video playing');
                // Schedule animation after 2 seconds
                setTimeout(() => {
                    animateAdminIntroToLogo();
                }, 2000);
            })
            .catch(error => {
                console.log('⚠️ Autoplay blocked or video failed:', error.message);
                // Fallback: still animate even if video didn't play
                setTimeout(() => {
                    animateAdminIntroToLogo();
                }, 2000);
            });
    } else {
        // Older browsers - schedule animation anyway
        setTimeout(() => {
            animateAdminIntroToLogo();
        }, 2000);
    }
}

/**
 * Animate admin intro from center overlay to header logo position
 * Uses FLIP technique for smooth GPU-accelerated animation
 */
function animateAdminIntroToLogo() {
    const overlay = document.getElementById('adminIntroOverlay');
    const video = document.getElementById('adminIntroVideo');
    const headerLogo = document.querySelector('.inv-logo-desktop');

    if (!overlay || !video) return;

    // If header logo doesn't exist, just fade out overlay
    if (!headerLogo) {
        video.classList.add('morphing');
        setTimeout(() => {
            overlay.classList.add('admin-intro-hidden');
            video.classList.remove('morphing');
        }, 350);
        return;
    }

    // Get target position and size (FLIP technique - First)
    const targetRect = headerLogo.getBoundingClientRect();
    const sourceRect = video.getBoundingClientRect();

    // Calculate scale factor
    const targetWidth = targetRect.width || 260; // fallback to max-width
    const sourceWidth = sourceRect.width || window.innerWidth * 0.6;
    const scaleRatio = targetWidth / sourceWidth;

    // Calculate translation
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;
    const sourceCenterX = window.innerWidth / 2;
    const sourceCenterY = window.innerHeight / 2;

    const translateX = targetCenterX - sourceCenterX;
    const translateY = targetCenterY - sourceCenterY;

    // Apply animation
    video.classList.add('morphing');
    video.style.transform = `translate3d(calc(-50% + ${translateX}px), calc(-50% + ${translateY}px), 0) scale(${scaleRatio})`;
    
    // Fade out overlay
    setTimeout(() => {
        overlay.style.opacity = '0';
    }, 350);

    // Hide overlay after animation
    setTimeout(() => {
        overlay.classList.add('admin-intro-hidden');
        // Reset for potential re-use (though session flag prevents replay)
        video.classList.remove('morphing');
        overlay.style.opacity = '1';
        video.style.transform = '';
    }, 350);
}

function updateAuthStatus(status) {
    const authStatus = document.getElementById('authStatus');
    authStatus.textContent = status;
}

// ==========================================
// FIRESTORE GUARD - Ensure auth before operations
// ==========================================
/**
 * Guard function: Ensure user is authenticated and db is ready
 * All Firestore operations should call this first
 */
function ensureFirestoreReady(operationName) {
    if (!currentUser) {
        console.error(`❌ [${operationName}] Firestore not ready: No authenticated user`);
        console.error('   Firestore Rules will deny this operation - PERMISSION DENIED');
        return false;
    }
    
    if (!db) {
        console.error(`❌ [${operationName}] Firestore not ready: db not initialized`);
        return false;
    }
    
    console.log(`✅ [${operationName}] Firestore ready - User: ${currentUser.uid}`);
    return true;
}

// ==========================================
// SCANNED INVOICES
// ==========================================
function formatLocalDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getWeekMetaFromTimestamp(timestampMs) {
    const date = new Date(timestampMs);
    const mondayOffset = (date.getDay() + 6) % 7;
    const monday = new Date(date);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - mondayOffset);

    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    const mondayKey = formatLocalDate(monday);
    const sundayKey = formatLocalDate(sunday);

    return {
        weekKey: mondayKey,
        weekStart: mondayKey,
        weekEnd: sundayKey,
        weekRange: `${mondayKey} - ${sundayKey}`
    };
}

function roundMoney(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

function normalizeNullableNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const cleaned = String(value).replace(/[^0-9.-]+/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) return null;
    return roundMoney(parsed);
}

function getScannedInvoiceById(scanId) {
    return scannedInvoices.find((scan) => scan.id === scanId) || null;
}

function getWeekBoundsFromWeekKey(weekKey) {
    if (!weekKey) return { weekStart: null, weekEnd: null };
    const monday = new Date(`${weekKey}T00:00:00`);
    if (Number.isNaN(monday.getTime())) return { weekStart: null, weekEnd: null };
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
        weekStart: formatLocalDate(monday),
        weekEnd: formatLocalDate(sunday)
    };
}

function normalizeSupplierName(name) {
    const safe = String(name || '').trim();
    if (!safe) return '';
    if (/\b(gsf|groupauto|group\s*auto)\b/i.test(safe)) return 'GSF Car Parts';
    return safe;
}

function isGsfSupplierName(name) {
    return /\b(gsf|groupauto|group\s*auto)\b/i.test(String(name || ''));
}

function getScanSupplierName(scan) {
    const fromTopLevel = normalizeSupplierName(scan?.supplier);
    if (fromTopLevel) return fromTopLevel;
    return normalizeSupplierName(scan?.extracted?.vendorName);
}

function getScanCreatedDate(scan) {
    return scan?.createdAt?.toDate?.()
        || (scan?.clientCreatedAt ? new Date(scan.clientCreatedAt) : new Date());
}

function getAccountingDateFromScan(scan) {
    // Prefer extracted invoice date for accounting; fall back to upload date
    if (scan?.extracted?.invoiceDate) {
        const parsed = new Date(`${scan.extracted.invoiceDate}T00:00:00`);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }
    }
    // Fallback to upload date
    return getScanCreatedDate(scan);
}

function toMonthKeyFromDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function toIsoWeekCodeFromWeekKey(weekKey) {
    if (!weekKey) return '';
    const monday = new Date(`${weekKey}T00:00:00`);
    if (Number.isNaN(monday.getTime())) return weekKey;
    const thursday = new Date(monday);
    thursday.setDate(monday.getDate() + 3);
    const year = thursday.getFullYear();
    const jan4 = new Date(year, 0, 4);
    const jan4Day = (jan4.getDay() + 6) % 7;
    const week1Monday = new Date(jan4);
    week1Monday.setDate(jan4.getDate() - jan4Day);
    const diffDays = Math.floor((monday - week1Monday) / (24 * 60 * 60 * 1000));
    const weekNum = Math.floor(diffDays / 7) + 1;
    return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

function formatAccountingMoney(value) {
    const amount = Number(value) || 0;
    return `£${amount.toFixed(2)}`;
}

function getScannedInvoiceTotal(scan) {
    const extractedTotal = normalizeNullableNumber(scan?.extracted?.total);
    if (extractedTotal !== null) return extractedTotal;
    return 0;
}

function normalizeScanAccountingData(scan) {
    const normalized = { ...scan };
    const patch = {};
    
    // Use extracted invoice date for accounting; fall back to upload date
    const accountingDate = getAccountingDateFromScan(scan);
    const accountingDateStr = formatLocalDate(accountingDate);
    const weekMeta = getWeekMetaFromTimestamp(accountingDate.getTime());
    const weekKey = weekMeta.weekKey;
    const weekBounds = getWeekBoundsFromWeekKey(weekKey);
    const monthKey = toMonthKeyFromDate(accountingDate);
    
    const supplier = getScanSupplierName(scan);
    const inferredCategory = isGsfSupplierName(supplier) ? 'Parts' : 'Uncategorized';
    const category = (scan.category || inferredCategory).trim() || inferredCategory;
    const type = scan.type === 'income' ? 'income' : 'expense';
    const total = getScannedInvoiceTotal(scan);
    const computedImpact = roundMoney((type === 'income' ? 1 : -1) * total) || 0;

    // Always patch accounting fields based on extracted invoice date
    if (!scan.accountingDate || scan.accountingDate !== accountingDateStr) patch.accountingDate = accountingDateStr;
    if (!scan.weekKey || scan.weekKey !== weekKey) patch.weekKey = weekKey;
    if (!scan.monthKey || scan.monthKey !== monthKey) patch.monthKey = monthKey;
    if (!scan.weekStart || scan.weekStart !== weekBounds.weekStart) patch.weekStart = weekBounds.weekStart;
    if (!scan.weekEnd || scan.weekEnd !== weekBounds.weekEnd) patch.weekEnd = weekBounds.weekEnd;
    if (!scan.supplier || normalizeSupplierName(scan.supplier) !== supplier) patch.supplier = supplier || '';
    if (!scan.category || scan.category !== category) patch.category = category;
    if (!scan.type || scan.type !== type) patch.type = type;
    if (typeof scan.profitImpact !== 'number' || roundMoney(scan.profitImpact) !== computedImpact) {
        patch.profitImpact = computedImpact;
    }

    normalized.accountingDate = accountingDateStr;
    normalized.weekKey = weekKey;
    normalized.monthKey = monthKey;
    normalized.weekStart = weekBounds.weekStart;
    normalized.weekEnd = weekBounds.weekEnd;
    normalized.supplier = supplier;
    normalized.category = category;
    normalized.type = type;
    normalized.profitImpact = computedImpact;

    return {
        normalized,
        patch,
        needsBackfill: Object.keys(patch).length > 0
    };
}

async function backfillScannedInvoiceAccounting(scanId, patch) {
    if (!scanId || !patch || Object.keys(patch).length === 0) return;
    if (accountingBackfillInFlight.has(scanId)) return;
    accountingBackfillInFlight.add(scanId);

    try {
        const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        await updateDoc(doc(db, 'scannedInvoices', scanId), patch);
    } catch (error) {
        console.warn('⚠️ Failed silent accounting backfill for scan:', scanId, error);
    } finally {
        accountingBackfillInFlight.delete(scanId);
    }
}

function isDateWithinPlausibleRange(isoDate) {
    if (!isoDate) return false;
    const parsed = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return false;

    const now = new Date();
    const maxFuture = new Date(now);
    maxFuture.setDate(maxFuture.getDate() + 2);

    const minPast = new Date(now);
    minPast.setFullYear(minPast.getFullYear() - 2);

    return parsed <= maxFuture && parsed >= minPast;
}

function monthToNumber(monthName) {
    const map = {
        jan: 1, january: 1,
        feb: 2, february: 2,
        mar: 3, march: 3,
        apr: 4, april: 4,
        may: 5,
        jun: 6, june: 6,
        jul: 7, july: 7,
        aug: 8, august: 8,
        sep: 9, sept: 9, september: 9,
        oct: 10, october: 10,
        nov: 11, november: 11,
        dec: 12, december: 12
    };
    return map[String(monthName || '').toLowerCase()] || null;
}

function safeIsoDate(year, month, day) {
    if (!year || !month || !day) return null;
    const date = new Date(year, month - 1, day);
    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function extractInvoiceDates(rawText) {
    if (!rawText) return { invoiceDateISO: null, taxPointDateISO: null, confidence: 0 };

    const safe = String(rawText).trim();
    
    // Normalize: uppercase for keyword search, collapse multiple spaces, preserve line structure
    const normalized = safe
        .split(/\r?\n/)
        .map(line => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');
    
    // Flattened version for regex scanning
    const flattened = normalized.replace(/\n/g, ' ');
    
    let taxPointDateISO = null;
    let invoiceDateISO = null;
    let confidence = 0;

    // ===== A) Extract Tax Point Date (highest priority) =====
    // Handle OCR glitches: TAXPOlNT, TAX P0INT, TAXPO1NT, etc.
    const taxPointRegexes = [
        /tax\s*point\s*date?\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /tax\s*po[l1][n1]t\s*date?\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /tax\s*p0[i1]nt\s*date?\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /tax\s*point\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /tax\s*po[l1][n1]t\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /tax\s*p0[i1]nt\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
    ];

    for (const regex of taxPointRegexes) {
        const match = flattened.match(regex);
        if (match?.[1]) {
            const parsed = parseUkDate(match[1]);
            if (parsed && isDateWithinPlausibleRange(parsed)) {
                taxPointDateISO = parsed;
                confidence = 95;
                if (typeof DEBUG !== 'undefined' && DEBUG) {
                    console.log('🔍 Detected taxPointDate from regex:', taxPointDateISO, '(match:', match[1], ')');
                }
                break;
            }
        }
    }

    // ===== B) Extract Invoice Date (second priority) =====
    const invoiceDateRegexes = [
        /invoice\s*date\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /date\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})(?:\s+|$)/i,
        /invoice\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
    ];

    for (const regex of invoiceDateRegexes) {
        const match = flattened.match(regex);
        if (match?.[1]) {
            const parsed = parseUkDate(match[1]);
            if (parsed && isDateWithinPlausibleRange(parsed)) {
                invoiceDateISO = parsed;
                if (confidence < 90) confidence = 85;
                if (typeof DEBUG !== 'undefined' && DEBUG) {
                    console.log('🔍 Detected invoiceDate from regex:', invoiceDateISO, '(match:', match[1], ')');
                }
                break;
            }
        }
    }

    // ===== C) Fallback: Extract all plausible dates and score by proximity to keywords =====
    if (!taxPointDateISO || !invoiceDateISO) {
        const allDates = extractAllDatesFromText(flattened);
        
        if (allDates.length > 0 && typeof DEBUG !== 'undefined' && DEBUG) {
            console.log('🔍 Date candidates found:', allDates.map(d => d.value));
        }

        // Score dates by proximity to keywords
        const scoredDates = allDates.map(dateInfo => {
            let scoreBonus = 0;
            
            // Find position of the date in flattened text
            const dateIndex = flattened.indexOf(dateInfo.originalMatch);
            
            // Search for keyword proximity (within ±150 chars)
            const window = flattened.substring(Math.max(0, dateIndex - 150), dateIndex + 150);
            
            if (/tax\s*p/i.test(window)) scoreBonus += 50;
            if (/point/i.test(window)) scoreBonus += 30;
            if (/invoice/i.test(window)) scoreBonus += 20;
            if (/date/i.test(window)) scoreBonus += 10;
            
            return {
                value: dateInfo.value,
                originalMatch: dateInfo.originalMatch,
                score: scoreBonus,
                isPlausible: dateInfo.isPlausible
            };
        });

        // Prefer plausible dates, then by score
        scoredDates.sort((a, b) => {
            if (a.isPlausible !== b.isPlausible) return b.isPlausible ? 1 : -1;
            return b.score - a.score;
        });

        // Assign fallback dates if not yet found
        if (!taxPointDateISO && scoredDates.length > 0) {
            taxPointDateISO = scoredDates[0].value;
            confidence = Math.max(confidence, scoredDates[0].isPlausible ? 70 : 40);
            if (typeof DEBUG !== 'undefined' && DEBUG) {
                console.log('🔍 Fallback taxPointDate:', taxPointDateISO, '(from:', scoredDates[0].originalMatch, ')');
            }
        }

        if (!invoiceDateISO && scoredDates.length > 0) {
            invoiceDateISO = scoredDates[0].value;
            confidence = Math.max(confidence, scoredDates[0].isPlausible ? 70 : 40);
            if (typeof DEBUG !== 'undefined' && DEBUG) {
                console.log('🔍 Fallback invoiceDate:', invoiceDateISO, '(from:', scoredDates[0].originalMatch, ')');
            }
        }
    }

    // ===== D) If only taxPointDate found, use it for invoiceDate too =====
    if (taxPointDateISO && !invoiceDateISO) {
        invoiceDateISO = taxPointDateISO;
    }

    return { invoiceDateISO, taxPointDateISO, confidence };
}

function parseUkDate(dateStr) {
    if (!dateStr) return null;
    
    // Match DD/MM/YY(YY) or DD-MM-YY(YY)
    const match = String(dateStr).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (!match) return null;
    
    let day = Number(match[1]);
    let month = Number(match[2]);
    let year = Number(match[3]);
    
    // Validate day and month
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    
    // Convert 2-digit year to 4-digit (assume 2000-2099)
    if (year < 100) year += 2000;
    
    // Use safeIsoDate to validate and format
    return safeIsoDate(year, month, day);
}

function extractAllDatesFromText(text) {
    const datePatterns = [
        { pattern: /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g, type: 'numeric' }
    ];
    
    const candidates = [];
    
    for (const { pattern, type } of datePatterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const dateStr = match[1];
            const parsed = parseUkDate(dateStr);
            
            if (parsed && isDateWithinPlausibleRange(parsed)) {
                // Avoid duplicates
                if (!candidates.some(c => c.value === parsed)) {
                    candidates.push({
                        value: parsed,
                        originalMatch: dateStr,
                        isPlausible: true
                    });
                }
            }
        }
    }
    
    return candidates;
}

function parseDetectedDate(matchText) {
    if (!matchText) return null;

    const slashMatch = matchText.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (slashMatch) {
        let day = Number(slashMatch[1]);
        let month = Number(slashMatch[2]);
        let year = Number(slashMatch[3]);
        if (year < 100) year += 2000;
        return safeIsoDate(year, month, day);
    }

    const monthMatch = matchText.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})$/);
    if (monthMatch) {
        let day = Number(monthMatch[1]);
        let year = Number(monthMatch[3]);
        if (year < 100) year += 2000;
        const month = monthToNumber(monthMatch[2]);
        if (!month) return null;
        return safeIsoDate(year, month, day);
    }

    return null;
}

function detectInvoiceDate(rawText) {
    if (!rawText) return null;
    const taxPointRegexes = [
        /tax\s*point\s*date\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /tax\s*point\s*date\s*[:\-]?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})/i,
        /tax\s*point\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /tax\s*point\s*[:\-]?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})/i
    ];
    for (const regex of taxPointRegexes) {
        const match = String(rawText).match(regex);
        const parsed = parseDetectedDate(match?.[1]);
        if (parsed && isDateWithinPlausibleRange(parsed)) return parsed;
    }

    const regexes = [
        /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g,
        /\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}\b/g
    ];

    const candidates = [];
    regexes.forEach((regex) => {
        const matches = rawText.match(regex) || [];
        matches.forEach((m) => {
            const parsed = parseDetectedDate(m);
            if (!parsed) return;

            const dateObj = new Date(`${parsed}T00:00:00`);
            const now = new Date();
            const diffMs = Math.abs(now.getTime() - dateObj.getTime());
            const isPlausible = isDateWithinPlausibleRange(parsed);
            const score = (isPlausible ? 1000000000000 : 0) - diffMs;

            candidates.push({
                value: parsed,
                score,
                isPlausible
            });
        });
    });

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    return best?.isPlausible ? best.value : null;
}

function parseMoneyValuesFromLine(line) {
    const values = [];
    const matches = line.match(/£?\s?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})|£?\s?\d+(?:\.\d{1,2})/g) || [];
    matches.forEach((match) => {
        const value = normalizeNullableNumber(match);
        if (value !== null) values.push(value);
    });
    return values;
}

function detectTotalsFromText(rawText) {
    const lines = String(rawText || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const subtotalCandidates = [];
    const vatCandidates = [];
    const totalCandidates = [];
    const allAmounts = [];

    lines.forEach((line) => {
        const lower = line.toLowerCase();
        const values = parseMoneyValuesFromLine(line);
        if (values.length === 0) return;

        allAmounts.push(...values);
        const lastValue = values[values.length - 1];

        if (/(^|\W)(subtotal|goods)(\W|$)/i.test(lower)) {
            subtotalCandidates.push(lastValue);
        }
        if (/(^|\W)(vat|tax)(\W|$)/i.test(lower)) {
            vatCandidates.push(lastValue);
        }
        if (/(grand\s*total|amount\s*due|total\s*due|balance\s*due|(^|\W)total(\W|$))/i.test(lower)) {
            totalCandidates.push(Math.max(...values));
        }
    });

    const subtotal = subtotalCandidates.length ? Math.max(...subtotalCandidates) : null;
    const vat = vatCandidates.length ? Math.max(...vatCandidates) : null;
    let total = null;

    if (totalCandidates.length) {
        total = Math.max(...totalCandidates);
    } else if (allAmounts.length) {
        total = Math.max(...allAmounts);
    }

    return {
        subtotal: subtotal !== null ? roundMoney(subtotal) : null,
        vat: vat !== null ? roundMoney(vat) : null,
        total: total !== null ? roundMoney(total) : null
    };
}

function detectInvoiceNumber(rawText) {
    const safe = String(rawText || '');
    const patterns = [
        /tax\s*invoice\s*(?:number|no\.?|#)\s*[:\-]?\s*([A-Za-z0-9\-\/]{3,})/i,
        /invoice\s*(?:number|no\.?|#)\s*[:\-]?\s*([A-Za-z0-9\-\/]{3,})/i,
        /\binv\s*[:\-]?\s*([A-Za-z0-9\-\/]{3,})/i
    ];

    for (const pattern of patterns) {
        const match = safe.match(pattern);
        if (match?.[1]) return match[1].trim();
    }
    return null;
}

function detectTaxPointDate(rawText) {
    const safe = String(rawText || '');
    const patterns = [
        /tax\s*point\s*(?:date)?\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
        /tax\s*point\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i
    ];
    
    for (const pattern of patterns) {
        const match = safe.match(pattern);
        if (match?.[1]) {
            // Try to parse and format as YYYY-MM-DD
            const dateStr = match[1].trim();
            const parsed = parseDetectedDate(dateStr);
            return parsed ? parsed : null;
        }
    }
    return null;
}

function detectCustomerReference(rawText) {
    const safe = String(rawText || '');
    const patterns = [
        /customer\s*(?:reference|ref|ref\.?|no\.?|#)\s*[:\-]?\s*([A-Za-z0-9\-\/]{2,})/i,
        /cust\s*(?:ref|reference)\s*[:\-]?\s*([A-Za-z0-9\-\/]{2,})/i,
        /(?:customer|cust)\s*[:\-]?\s*([A-Z]{1,3}\d{3,})/i
    ];
    
    for (const pattern of patterns) {
        const match = safe.match(pattern);
        if (match?.[1]) return match[1].trim();
    }
    return null;
}

function isLikelyVendorLine(line) {
    if (!line) return false;
    const lower = line.toLowerCase();
    if (line.length < 3 || line.length > 60) return false;
    if (/\d{5,}/.test(line)) return false;
    // More comprehensive blocklist of non-vendor keywords
    if (/(invoice|receipt|subtotal|total|vat|tax|thank|phone|tel|www|http|address|date|road|way|street|birmingham|west midlands|units|dunlop|industrial|castle vale|park|delivery|billing|trade|account|sort|code|bank|cheques|pages|terms|conditions)/i.test(lower)) return false;
    return /[a-z]/i.test(line);
}

function shouldIgnoreItemLineStrict(line) {
    // Comprehensive blocklist to ignore header/address lines that might appear in items
    const blocklistKeywords = [
        'birmingham', 'west midlands', 'castle vale', 'industrial', 'park', 'dunlop', 'way',
        'units', 'vat reg', 'invoice', 'page', 'terms', 'delivery address', 'billing address',
        'trade club', 'account', 'sort code', 'bank', 'cheques', 'thank you', 'tel', 'phone',
        'email', 'www', 'http', 'address', 'delivery', 'billing', 'receipt', 'total', 'subtotal'
    ];
    const lower = line.toLowerCase();
    return blocklistKeywords.some(kw => lower.includes(kw));
}

function sanitizeVendorNameForModal(vendorName, rawText) {
    // Sanitize vendor name for display in modal
    // Priority 1: Check if it's GSF
    if (!vendorName) vendorName = '';
    const lower = String(vendorName).toLowerCase();
    if (/\b(gsf|groupauto|group\s*auto)\b/i.test(lower) || /\bgsf\b/i.test(String(rawText || ''))) {
        return 'GSF Car Parts';
    }
    // Priority 2: Clean up the vendor name if it looks like noise
    const cleaned = String(vendorName || '').trim();
    // If it looks like noise (very short, no vowels, etc.), return empty with hint
    if (cleaned && cleaned.length >= 3 && cleaned.length <= 40 && /[aeiou]/i.test(cleaned)) {
        // Check if it contains address keywords
        if (!shouldIgnoreItemLineStrict(cleaned)) {
            return cleaned;
        }
    }
    return '';
}

function computeMissingVat(subtotal, total) {
    // Compute VAT if subtotal and total exist but VAT is missing
    if (typeof subtotal !== 'number' || typeof total !== 'number') return null;
    if (subtotal <= 0) return null;
    const computedVat = roundMoney(total - subtotal);
    // Check if result is plausible (>= 0 and <= 30% of subtotal)
    if (computedVat < 0 || computedVat > subtotal * 0.30) return null;
    return computedVat;
}

function detectVendorName(rawText) {
    const lines = String(rawText || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    for (let index = 0; index < Math.min(lines.length, 12); index += 1) {
        const line = lines[index];
        if (isLikelyVendorLine(line)) return line;
    }

    return null;
}

function shouldIgnoreItemLine(line) {
    return /(thank you|terms|conditions|address|phone|tel|email|www|http|invoice\s*#?|receipt|subtotal|total|vat|tax|amount due)/i.test(line);
    // Note: For stricter filtering, use shouldIgnoreItemLineStrict()
}

function parseItemLineStructured(line) {
    // Implements STEP A-D structured parsing
    // Input: single OCR line e.g. "4 DRC BC500ML Drivetec Aerosol Brake Cleaner 500ML 2.20 8.80"
    // Output: {qty, partNumber, description, unitPrice, lineTotal} or null if invalid
    
    const trimmed = String(line || '').replace(/\s+/g, ' ').trim();
    if (!trimmed) return null;
    
    // STEP A: Extract QTY from line start
    const qtyMatch = trimmed.match(/^\s*(\d+(?:\.\d+)?)\s+/);
    if (!qtyMatch) return null;
    const qty = normalizeNullableNumber(qtyMatch[1]);
    if (qty === null) return null;
    
    const afterQty = trimmed.substring(qtyMatch[0].length);
    const tokens = afterQty.split(/\s+/);
    
    // STEP B: Extract prices from RIGHT to LEFT
    const allDecimals = trimmed.match(/\d+(?:\.\d{1,2})/g) || [];
    let lineTotal = null;
    let unitPrice = null;
    
    if (allDecimals.length >= 2) {
        lineTotal = normalizeNullableNumber(allDecimals[allDecimals.length - 1]);
        unitPrice = normalizeNullableNumber(allDecimals[allDecimals.length - 2]);
    } else if (allDecimals.length === 1) {
        lineTotal = normalizeNullableNumber(allDecimals[0]);
        if (qty && qty > 0) {
            unitPrice = roundMoney(lineTotal / qty);
        }
    }
    
    if (lineTotal === null) return null; // Must have at least lineTotal
    
    // STEP C: Extract part number (first token with letters+digits or hyphenated)
    let partNumber = null;
    let partNumberIdx = -1;
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        // Match: contains letters AND digits (e.g. "BC500ML"), or hyphenated alphanumeric (e.g. "BP-7788")
        if (/[A-Z0-9]+[A-Z0-9\-]*[A-Z0-9]$/i.test(token) && (/[A-Z]/i.test(token) && /\d/.test(token))) {
            partNumber = token;
            partNumberIdx = i;
            break;
        }
    }
    
    // STEP D: Extract description (everything except QTY, partNumber, and prices)
    let description = '';
    if (partNumberIdx >= 0) {
        // Include tokens before and after partNumber, but exclude partNumber and prices
        const allNonPartTokens = tokens.filter((t, i) => i !== partNumberIdx && !/^\d+(?:\.\d{1,2})$/.test(t));
        description = allNonPartTokens.join(' ').trim();
    } else {
        // No part number found: use all non-price tokens as description
        description = tokens.filter(t => !/^\d+(?:\.\d{1,2})$/.test(t)).join(' ').trim();
    }
    
    return {
        qty,
        partNumber: partNumber || null,
        description: description || '',
        unitPrice,
        lineTotal
    };
}

function detectItemsFromText(rawText) {
    const lines = String(rawText || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const detectedItems = [];

    for (const line of lines) {
        if (shouldIgnoreItemLine(line)) continue;

        // Try structured parsing first
        const item = parseItemLineStructured(line);
        if (item) {
            detectedItems.push(item);
            if (detectedItems.length >= 20) break;
            continue;
        }

        // Fallback: simple description + price pattern (for lines without clear qty)
        const lineMatch = line.match(/^(.*?)\s+£?\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})|\d+(?:\.\d{1,2}))$/);
        if (!lineMatch) continue;

        const description = (lineMatch[1] || '').trim();
        const lineTotal = normalizeNullableNumber(lineMatch[2]);
        if (!description || lineTotal === null) continue;

        let qty = null;
        let unitPrice = null;
        const qtyUnitMatch = description.match(/(\d+(?:\.\d+)?)\s*[xX]\s*£?\s?(\d+(?:\.\d{1,2})?)/);
        if (qtyUnitMatch) {
            qty = normalizeNullableNumber(qtyUnitMatch[1]);
            unitPrice = normalizeNullableNumber(qtyUnitMatch[2]);
        }

        detectedItems.push({
            qty,
            partNumber: null,
            description,
            unitPrice,
            lineTotal
        });

        if (detectedItems.length >= 20) break;
    }

    return detectedItems;
}

function detectItemsFromGsfText(rawText) {
    const lines = String(rawText || '')
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    if (lines.length === 0) return [];

    // Find the items table header
    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        const lower = lines[i].toLowerCase();
        if (/\b(qty|quantity)\b/.test(lower) && /\b(part|description)\b/.test(lower)) {
            headerIndex = i;
            break;
        }
    }

    const detectedItems = [];
    const itemStartIndex = headerIndex >= 0 ? headerIndex + 1 : 0;

    // Collect lines until we hit totals/footer keywords
    const itemLines = [];
    for (let i = itemStartIndex; i < lines.length; i++) {
        const lower = lines[i].toLowerCase();
        if (/\b(goods|vat|total|received|vat%|please make cheques|bank details|tax point|code)\b/.test(lower)) {
            break;
        }
        // Use stricter filtering to exclude address/header lines
        if (shouldIgnoreItemLine(lines[i]) || shouldIgnoreItemLineStrict(lines[i])) continue;
        itemLines.push(lines[i]);
    }

    // Parse items with structured parsing and continuation line handling
    let currentItem = null;
    for (const line of itemLines) {
        const lower = line.toLowerCase();

        // Try to parse as a new item line (starts with qty)
        const qtyMatch = line.match(/^\s*(\d+(?:\.\d+)?)\s+/);
        if (qtyMatch) {
            // Save previous item if exists and valid
            if (currentItem && (currentItem.description || currentItem.partNumber)) {
                detectedItems.push(currentItem);
            }

            // Use structured parser
            currentItem = parseItemLineStructured(line);
            if (!currentItem) {
                currentItem = null; // Invalid line
            }
        } else {
            // Continuation line - append to current item description
            if (currentItem && !shouldIgnoreItemLine(line) && !shouldIgnoreItemLineStrict(line)) {
                currentItem.description = `${currentItem.description} ${line}`.replace(/\s+/g, ' ').trim();
            }
        }

        if (detectedItems.length >= 50) break;
    }

    // Don't forget the last item
    if (currentItem && (currentItem.description || currentItem.partNumber)) {
        detectedItems.push(currentItem);
    }

    return detectedItems;
}

function detectItemsFromDescriptionZone(rawText) {
    const lines = String(rawText || '')
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    const detectedItems = [];
    const totalsKeywords = /\b(goods|vat|total|subtotal|received|vat%|code|please make cheques|bank|tax point)\b/i;

    for (const line of lines) {
        // Use stricter filtering to exclude address/header lines
        if (shouldIgnoreItemLine(line) || shouldIgnoreItemLineStrict(line) || totalsKeywords.test(line)) continue;
        
        // Quick validation: must have qty, letters, and prices
        if (!/^\s*\d+\s+/.test(line)) continue; // Must start with qty
        if (!/\d/.test(line) || !/[a-z]/i.test(line)) continue; // Must have digits and letters
        if (!/\d+\.\d{1,2}/.test(line) && !/£\s*\d/.test(line)) continue; // Must have prices
        
        // Use structured parser
        const item = parseItemLineStructured(line);
        if (item) {
            detectedItems.push(item);
        }

        if (detectedItems.length >= 50) break;
    }
    return detectedItems;
}

function normalizeExtractedData(extracted) {
    const safe = extracted || {};
    const items = Array.isArray(safe.items) ? safe.items : [];

    return {
        rawText: typeof safe.rawText === 'string' ? safe.rawText : '',
        vendorName: safe.vendorName ? normalizeSupplierName(safe.vendorName) : null,
        invoiceNo: safe.invoiceNo ? String(safe.invoiceNo).trim() : null,
        invoiceDate: safe.invoiceDate ? String(safe.invoiceDate).slice(0, 10) : null,
        currency: safe.currency || 'GBP',
        subtotal: normalizeNullableNumber(safe.subtotal),
        vat: normalizeNullableNumber(safe.vat),
        total: normalizeNullableNumber(safe.total),
        items: items.map((item) => ({
            partNumber: item?.partNumber ? String(item.partNumber).trim() : null,
            description: item?.description ? String(item.description).trim() : '',
            qty: normalizeNullableNumber(item?.qty),
            unitPrice: normalizeNullableNumber(item?.unitPrice),
            lineTotal: normalizeNullableNumber(item?.lineTotal)
        }))
    };
}

function recalculateExtractedData(extracted, options = {}) {
    const { overwriteDerived = false } = options;
    const normalized = normalizeExtractedData(extracted);

    normalized.items = normalized.items.map((item) => {
        const nextItem = { ...item };
        if ((nextItem.lineTotal === null || overwriteDerived) && nextItem.qty !== null && nextItem.unitPrice !== null) {
            nextItem.lineTotal = roundMoney(nextItem.qty * nextItem.unitPrice);
        }
        return nextItem;
    });

    const itemsTotal = normalized.items
        .map((item) => item.lineTotal)
        .filter((value) => value !== null)
        .reduce((sum, value) => sum + value, 0);

    if ((normalized.subtotal === null || overwriteDerived) && itemsTotal > 0) {
        normalized.subtotal = roundMoney(itemsTotal);
    }

    if (
        (normalized.total === null || overwriteDerived) &&
        normalized.subtotal !== null &&
        normalized.vat !== null
    ) {
        normalized.total = roundMoney(normalized.subtotal + normalized.vat);
    }

    return normalized;
}

function extractInvoiceDataFromRawText(rawText) {
    const safeRawText = String(rawText || '').trim();
    const totals = detectTotalsFromText(safeRawText);
    const vendorName = detectVendorName(safeRawText);
    const normalizedVendor = normalizeSupplierName(vendorName);
    const gsfDetected = isGsfSupplierName(normalizedVendor) || /\b(gsf|group\s*auto)\b/i.test(safeRawText);
    
    // Use comprehensive date extraction for both invoice date and tax point date
    const { invoiceDateISO, taxPointDateISO } = extractInvoiceDates(safeRawText);
    
    const extracted = {
        rawText: safeRawText,
        vendorName: normalizedVendor || null,
        invoiceNo: detectInvoiceNumber(safeRawText),
        invoiceDate: invoiceDateISO,
        taxPointDate: taxPointDateISO,
        customerReference: detectCustomerReference(safeRawText),
        currency: 'GBP',
        subtotal: totals.subtotal,
        vat: totals.vat,
        total: totals.total,
        items: (() => {
            const primaryItems = gsfDetected ? detectItemsFromGsfText(safeRawText) : detectItemsFromText(safeRawText);
            return (primaryItems && primaryItems.length > 0) ? primaryItems : detectItemsFromDescriptionZone(safeRawText);
        })()
    };
    return recalculateExtractedData(extracted, { overwriteDerived: false });
}

function getScanOcrProgress(scanId) {
    return scannedInvoiceOcrProgress.get(scanId) || null;
}

function setScanOcrProgress(scanId, progress = {}) {
    scannedInvoiceOcrProgress.set(scanId, {
        running: true,
        percent: typeof progress.percent === 'number' ? progress.percent : null,
        text: progress.text || 'Reading invoice…'
    });
    updateScannedInvoiceRow(scanId);
}

function clearScanOcrProgress(scanId) {
    if (scannedInvoiceOcrProgress.has(scanId)) {
        scannedInvoiceOcrProgress.delete(scanId);
        updateScannedInvoiceRow(scanId);
    }
}

function getScannedInvoiceStatusText(scan) {
    const progress = getScanOcrProgress(scan.id);
    if (progress?.running) {
        const percentLabel = Number.isFinite(progress.percent) ? ` ${progress.percent}%` : '';
        return `Reading invoice…${percentLabel}`;
    }
    return `${(scan?.file?.fileType || 'image').toUpperCase()} • ${scan.status || 'uploaded'}`;
}

function getScannedInvoiceSummaryText(scan) {
    const extracted = scan?.extracted;
    if (!extracted) return '';
    const bits = [];
    if (scan?.supplier || extracted.vendorName) bits.push(scan?.supplier || extracted.vendorName);
    if (extracted.invoiceNo) bits.push(`#${extracted.invoiceNo}`);
    if (extracted.invoiceDate) bits.push(extracted.invoiceDate);
    if (extracted.total !== null && extracted.total !== undefined) bits.push(`£${Number(extracted.total).toFixed(2)}`);
    return bits.join(' • ');
}

function buildScanCategoryOptions(selectedCategory) {
    const categories = ['Uncategorized', ...ACCOUNTING_DEFAULT_CATEGORIES];
    return categories.map((category) => {
        const isSelected = category === selectedCategory ? 'selected' : '';
        return `<option value="${escapeHtml(category)}" ${isSelected}>${escapeHtml(category)}</option>`;
    }).join('');
}

function ensureScanRow(scanId) {
    const list = document.getElementById('scannedInvoicesList');
    if (!list) return null;

    let row = list.querySelector(`.scanRow[data-scan-id="${scanId}"]`);
    if (!row) {
        row = document.createElement('div');
        row.className = 'scanRow';
        row.dataset.scanId = scanId;
        list.appendChild(row);
    }
    return row;
}

function updateScannedInvoiceRow(scanId) {
    const scan = getScannedInvoiceById(scanId);
    const row = document.querySelector(`.scanRow[data-scan-id="${scanId}"]`);
    if (!scan || !row) return;

    const createdDate = getScanCreatedDate(scan);
    const dateLabel = createdDate.toLocaleString('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    const fileType = scan?.file?.fileType || 'image';
    const fileUrl = scan?.file?.downloadURL || '#';
    const thumbHtml = fileType === 'image'
        ? `<img class="scanRow__thumb" src="${fileUrl}" alt="Scanned invoice preview" loading="lazy" referrerpolicy="no-referrer" />`
        : `<img class="scanRow__thumb" src="data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56"><rect width="56" height="56" rx="8" fill="#F3F4F6"/><path d="M15 10h17l9 9v27H15z" fill="#fff" stroke="#CBD5E1"/><text x="28" y="35" font-size="11" text-anchor="middle" fill="#475569" font-family="Arial">PDF</text></svg>')}" alt="PDF" />`;

    const progress = getScanOcrProgress(scanId);
    const progressRunning = Boolean(progress?.running);
    const statusText = escapeHtml(getScannedInvoiceStatusText(scan));
    const summaryText = getScannedInvoiceSummaryText(scan);
    const scanType = scan.type === 'income' ? 'income' : 'expense';
    const category = scan.category || 'Uncategorized';
    const accountantDisabled = isAccountant ? 'disabled' : '';
    const ocrDisabled = (progressRunning || isAccountant) ? 'disabled' : '';

    row.innerHTML = `
        ${thumbHtml}
        <div class="scanRow__meta">
            <div class="scanRow__date">${dateLabel}</div>
            <div class="scanRow__type">${statusText}</div>
            ${summaryText ? `<div class="scanRow__summary">${escapeHtml(summaryText)}</div>` : ''}
            <div class="scanRow__accounting">
                <select class="scanRow__select" data-scan-field="type" data-scan-id="${scan.id}" ${accountantDisabled}>
                    <option value="expense" ${scanType === 'expense' ? 'selected' : ''}>Expense</option>
                    <option value="income" ${scanType === 'income' ? 'selected' : ''}>Income</option>
                </select>
                <select class="scanRow__select" data-scan-field="category" data-scan-id="${scan.id}" ${accountantDisabled}>
                    ${buildScanCategoryOptions(category)}
                </select>
            </div>
        </div>
        <div class="scanRow__actions">
            <a class="scanRow__view" href="${fileUrl}" target="_blank" rel="noopener noreferrer">View</a>
            <button type="button" class="scanRow__btn" data-scan-action="extract" data-scan-id="${scan.id}" ${ocrDisabled}>Extract Details (OCR)</button>
            <button type="button" class="scanRow__btn" data-scan-action="details" data-scan-id="${scan.id}">View Details</button>
            ${isAdmin ? `<button type="button" class="scanRow__btn scanRow__btn--delete" data-scan-action="delete" data-scan-id="${scan.id}">Delete</button>` : ''}
        </div>
    `;
}

function reorderScannedInvoiceRows() {
    const list = document.getElementById('scannedInvoicesList');
    if (!list) return;

    scannedInvoices.forEach((scan) => {
        const row = list.querySelector(`.scanRow[data-scan-id="${scan.id}"]`);
        if (row) list.appendChild(row);
    });
}

function getVisibleScannedInvoices() {
    if (scannedInvoicesCategoryFilter === 'all') return scannedInvoices;
    return scannedInvoices.filter((scan) => (scan.category || 'Uncategorized') === scannedInvoicesCategoryFilter);
}

function applyScannedInvoicesCategoryFilter() {
    const list = document.getElementById('scannedInvoicesList');
    const emptyState = document.getElementById('scannedInvoicesEmpty');
    if (!list || !emptyState) return;

    const visibleIds = new Set(getVisibleScannedInvoices().map((scan) => scan.id));
    const rows = list.querySelectorAll('.scanRow[data-scan-id]');
    let visibleCount = 0;

    rows.forEach((row) => {
        const scanId = row.dataset.scanId;
        const isVisible = visibleIds.has(scanId);
        row.style.display = isVisible ? '' : 'none';
        if (isVisible) visibleCount += 1;
    });

    emptyState.style.display = visibleCount === 0 ? 'block' : 'none';
}

function syncScannedInvoicesEmptyState() {
    const list = document.getElementById('scannedInvoicesList');
    const emptyState = document.getElementById('scannedInvoicesEmpty');
    if (!list || !emptyState) return;

    if (!scannedInvoices || scannedInvoices.length === 0) {
        list.innerHTML = '';
        emptyState.style.display = 'block';
    } else {
        const visible = getVisibleScannedInvoices();
        emptyState.style.display = visible.length === 0 ? 'block' : 'none';
    }
}

function renderScannedInvoicesList() {
    syncScannedInvoicesEmptyState();
    if (!scannedInvoices || scannedInvoices.length === 0) {
        renderAccountingView();
        return;
    }

    scannedInvoices.forEach((scan) => {
        ensureScanRow(scan.id);
        updateScannedInvoiceRow(scan.id);
    });

    reorderScannedInvoiceRows();
    applyScannedInvoicesCategoryFilter();
    rebuildAccountingCache();
    renderAccountingView();
}

function applyScannedInvoiceDocChanges(snapshot) {
    snapshot.docChanges().forEach((change) => {
        const rawDocData = { id: change.doc.id, ...change.doc.data() };
        const { normalized: docData, patch, needsBackfill } = normalizeScanAccountingData(rawDocData);

        if (change.type === 'removed') {
            scannedInvoices = scannedInvoices.filter((scan) => scan.id !== docData.id);
            const row = document.querySelector(`.scanRow[data-scan-id="${docData.id}"]`);
            if (row) row.remove();
            scannedInvoiceOcrProgress.delete(docData.id);
            scannedInvoiceBlobCache.delete(docData.id);
            return;
        }

        if (needsBackfill) {
            backfillScannedInvoiceAccounting(docData.id, patch);
        }

        const existingIndex = scannedInvoices.findIndex((scan) => scan.id === docData.id);
        if (existingIndex >= 0) {
            scannedInvoices[existingIndex] = docData;
        } else {
            scannedInvoices.push(docData);
        }

        ensureScanRow(docData.id);
        updateScannedInvoiceRow(docData.id);
    });

    scannedInvoices.sort((a, b) => getScannedInvoiceSortTimestamp(b) - getScannedInvoiceSortTimestamp(a));
    reorderScannedInvoiceRows();
    applyScannedInvoicesCategoryFilter();
    syncScannedInvoicesEmptyState();
    rebuildAccountingCache();
    renderAccountingView();
}

function makeAggregateBucket(key, rangeLabel = '') {
    return {
        key,
        label: rangeLabel || key,
        income: 0,
        expenses: 0,
        vat: 0,
        count: 0,
        categoryTotals: new Map()
    };
}

function pushToCategoryTotals(bucket, category, amount) {
    if (!bucket.categoryTotals.has(category)) {
        bucket.categoryTotals.set(category, 0);
    }
    const current = bucket.categoryTotals.get(category) || 0;
    bucket.categoryTotals.set(category, roundMoney(current + amount) || 0);
}

function rebuildAccountingCache() {
    const byWeek = new Map();
    const byMonth = new Map();

    scannedInvoices.forEach((scan) => {
        const total = getScannedInvoiceTotal(scan);
        const vat = normalizeNullableNumber(scan?.extracted?.vat) || 0;
        const type = scan.type === 'income' ? 'income' : 'expense';
        const category = scan.category || 'Uncategorized';
        const weekKey = scan.weekKey || getWeekMetaFromTimestamp(getScanCreatedDate(scan).getTime()).weekKey;
        const weekLabel = scan.weekRange || weekKey;
        const monthKey = scan.monthKey || toMonthKeyFromDate(getScanCreatedDate(scan));

        if (!byWeek.has(weekKey)) {
            byWeek.set(weekKey, makeAggregateBucket(weekKey, weekLabel));
        }
        if (!byMonth.has(monthKey)) {
            byMonth.set(monthKey, makeAggregateBucket(monthKey, monthKey));
        }

        const weekBucket = byWeek.get(weekKey);
        const monthBucket = byMonth.get(monthKey);
        const updateBucket = (bucket) => {
            if (type === 'income') {
                bucket.income = roundMoney(bucket.income + total) || 0;
            } else {
                bucket.expenses = roundMoney(bucket.expenses + total) || 0;
                pushToCategoryTotals(bucket, category, total);
            }
            bucket.vat = roundMoney(bucket.vat + vat) || 0;
            bucket.count += 1;
        };

        updateBucket(weekBucket);
        updateBucket(monthBucket);
    });

    const sortedWeeks = Array.from(byWeek.keys()).sort((a, b) => b.localeCompare(a));
    const sortedMonths = Array.from(byMonth.keys()).sort((a, b) => b.localeCompare(a));

    accountingCache = {
        scans: [...scannedInvoices],
        byWeek,
        byMonth,
        weeks: sortedWeeks,
        months: sortedMonths
    };

    populateAccountingSelectors();
}

function getCurrentAndLastWeekKeys() {
    const now = Date.now();
    const thisWeek = getWeekMetaFromTimestamp(now).weekKey;
    const lastWeek = getWeekMetaFromTimestamp(now - 7 * 24 * 60 * 60 * 1000).weekKey;
    return { thisWeek, lastWeek };
}

function populateAccountingSelectors() {
    const weekSelect = document.getElementById('accountingWeekSelect');
    const monthSelect = document.getElementById('accountingMonthSelect');
    const categoryFilterSelect = document.getElementById('accountingCategoryFilter');
    const scanCategoryFilterSelect = document.getElementById('scanCategoryFilter');

    if (weekSelect) {
        const { thisWeek, lastWeek } = getCurrentAndLastWeekKeys();
        const previous = weekSelect.value || thisWeek;
        const options = [
            `<option value="${thisWeek}">This Week (${toIsoWeekCodeFromWeekKey(thisWeek)})</option>`,
            `<option value="${lastWeek}">Last Week (${toIsoWeekCodeFromWeekKey(lastWeek)})</option>`
        ];

        accountingCache.weeks
            .filter((key) => key !== thisWeek && key !== lastWeek)
            .forEach((key) => {
                options.push(`<option value="${key}">${toIsoWeekCodeFromWeekKey(key)} (${key})</option>`);
            });

        weekSelect.innerHTML = options.join('');
        weekSelect.value = options.some((opt) => opt.includes(`value="${previous}"`)) ? previous : thisWeek;
    }

    if (monthSelect) {
        const currentMonth = toMonthKeyFromDate(new Date());
        const previous = monthSelect.value || currentMonth;
        const options = accountingCache.months.length
            ? accountingCache.months.map((monthKey) => `<option value="${monthKey}">${monthKey}</option>`)
            : [`<option value="${currentMonth}">${currentMonth}</option>`];
        monthSelect.innerHTML = options.join('');
        monthSelect.value = options.some((opt) => opt.includes(`value="${previous}"`)) ? previous : options[0].match(/value="([^"]+)"/)?.[1] || currentMonth;
    }

    const categoryOptions = ['all', 'Uncategorized', ...ACCOUNTING_DEFAULT_CATEGORIES];

    if (categoryFilterSelect) {
        const previous = categoryFilterSelect.value || 'all';
        categoryFilterSelect.innerHTML = categoryOptions
            .map((cat) => `<option value="${escapeHtml(cat)}">${cat === 'all' ? 'All Categories' : escapeHtml(cat)}</option>`)
            .join('');
        categoryFilterSelect.value = categoryOptions.includes(previous) ? previous : 'all';
    }

    if (scanCategoryFilterSelect) {
        const previous = scanCategoryFilterSelect.value || scannedInvoicesCategoryFilter || 'all';
        scanCategoryFilterSelect.innerHTML = categoryOptions
            .map((cat) => `<option value="${escapeHtml(cat)}">${cat === 'all' ? 'All Categories' : escapeHtml(cat)}</option>`)
            .join('');
        scanCategoryFilterSelect.value = categoryOptions.includes(previous) ? previous : 'all';
        scannedInvoicesCategoryFilter = scanCategoryFilterSelect.value;
    }
}

function readAccountingSelections() {
    const weekSelect = document.getElementById('accountingWeekSelect');
    const monthSelect = document.getElementById('accountingMonthSelect');
    const categoryFilterSelect = document.getElementById('accountingCategoryFilter');

    return {
        selectedWeek: weekSelect?.value || getCurrentAndLastWeekKeys().thisWeek,
        selectedMonth: monthSelect?.value || toMonthKeyFromDate(new Date()),
        selectedCategory: categoryFilterSelect?.value || 'all'
    };
}

function getScansForWeek(weekKey, category) {
    return accountingCache.scans.filter((scan) => {
        if ((scan.weekKey || '') !== weekKey) return false;
        if (category && category !== 'all' && (scan.category || 'Uncategorized') !== category) return false;
        return true;
    });
}

function getScansForMonth(monthKey, category) {
    return accountingCache.scans.filter((scan) => {
        if ((scan.monthKey || '') !== monthKey) return false;
        if (category && category !== 'all' && (scan.category || 'Uncategorized') !== category) return false;
        return true;
    });
}

function summarizeScans(scans) {
    const summary = {
        income: 0,
        expenses: 0,
        vat: 0,
        subtotal: 0,
        count: scans.length,
        categories: new Map()
    };

    scans.forEach((scan) => {
        const total = getScannedInvoiceTotal(scan);
        const vat = normalizeNullableNumber(scan?.extracted?.vat) || 0;
        const goodsSubtotal = normalizeNullableNumber(scan?.extracted?.subtotal) || 0;
        const type = scan.type === 'income' ? 'income' : 'expense';
        const category = scan.category || 'Uncategorized';

        if (type === 'income') {
            summary.income = roundMoney(summary.income + total) || 0;
        } else {
            summary.expenses = roundMoney(summary.expenses + total) || 0;
            summary.subtotal = roundMoney(summary.subtotal + goodsSubtotal) || 0;
            const currentCategoryTotal = summary.categories.get(category) || 0;
            summary.categories.set(category, roundMoney(currentCategoryTotal + total) || 0);
        }

        summary.vat = roundMoney(summary.vat + vat) || 0;
    });

    summary.netProfit = roundMoney(summary.income - summary.expenses) || 0;
    return summary;
}

function setAccountingCardValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function renderWeeklyChart(selectedCategory) {
    const canvas = document.getElementById('accountingWeeklyChart');
    if (!canvas || typeof window.Chart === 'undefined') return;

    const weekKeys = accountingCache.weeks.slice(0, 8).reverse();
    const labels = weekKeys.map((weekKey) => toIsoWeekCodeFromWeekKey(weekKey));
    const expenses = weekKeys.map((weekKey) => {
        const scans = getScansForWeek(weekKey, selectedCategory);
        return summarizeScans(scans).expenses;
    });

    if (accountingWeeklyChart) {
        accountingWeeklyChart.destroy();
    }

    accountingWeeklyChart = new window.Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Expenses',
                data: expenses,
                backgroundColor: 'rgba(255, 138, 61, 0.75)',
                borderColor: 'rgba(244, 124, 44, 1)',
                borderWidth: 1,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => `£${value}`
                    }
                }
            }
        }
    });
}

function renderCategoryPieChart(summary) {
    const canvas = document.getElementById('accountingCategoryChart');
    if (!canvas || typeof window.Chart === 'undefined') return;

    const entries = Array.from(summary.categories.entries()).filter(([, value]) => value > 0);
    if (accountingCategoryChart) {
        accountingCategoryChart.destroy();
        accountingCategoryChart = null;
    }

    if (entries.length === 0) return;

    accountingCategoryChart = new window.Chart(canvas, {
        type: 'pie',
        data: {
            labels: entries.map(([category]) => category),
            datasets: [{
                data: entries.map(([, value]) => value),
                backgroundColor: [
                    '#FF8A3D', '#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#64748B'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function renderMonthlyCategoryBreakdown(summary) {
    const container = document.getElementById('accountingCategoryBreakdown');
    if (!container) return;

    const entries = Array.from(summary.categories.entries())
        .sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) {
        container.innerHTML = '<div class="accountingEmpty">No expense categories for selected month.</div>';
        return;
    }

    container.innerHTML = entries.map(([category, amount]) => `
        <div class="accountingBreakdownRow">
            <span>${escapeHtml(category)}</span>
            <strong>${formatAccountingMoney(amount)}</strong>
        </div>
    `).join('');
}

function renderWeeklyInvoicesTable(scans) {
    const tableWrap = document.getElementById('accountingWeeklyTable');
    if (!tableWrap) return;

    if (!scans.length) {
        tableWrap.innerHTML = '<div class="accountingEmpty">No invoices for selected week.</div>';
        return;
    }

    const rows = scans
        .slice()
        .sort((a, b) => getScannedInvoiceSortTimestamp(b) - getScannedInvoiceSortTimestamp(a))
        .map((scan) => {
            const extracted = scan.extracted || {};
            const date = extracted.invoiceDate || formatLocalDate(getScanCreatedDate(scan));
            const supplier = scan.supplier || extracted.vendorName || '';
            const invoiceNo = extracted.invoiceNo || '';
            const goods = extracted.subtotal ?? '';
            const vat = extracted.vat ?? '';
            const total = extracted.total ?? getScannedInvoiceTotal(scan);
            const type = scan.type || 'expense';
            const category = scan.category || 'Uncategorized';
            const weekKey = scan.weekKey || '';
            const monthKey = scan.monthKey || '';
            const fileUrl = scan?.file?.downloadURL || '#';

            return `
                <tr>
                    <td>${escapeHtml(date)}</td>
                    <td>${escapeHtml(supplier)}</td>
                    <td>${escapeHtml(invoiceNo)}</td>
                    <td>${escapeHtml(category)}</td>
                    <td>${escapeHtml(type)}</td>
                    <td>${escapeHtml(goods === '' ? '' : Number(goods).toFixed(2))}</td>
                    <td>${escapeHtml(vat === '' ? '' : Number(vat).toFixed(2))}</td>
                    <td>${escapeHtml(total === '' ? '' : Number(total).toFixed(2))}</td>
                    <td>${escapeHtml(weekKey)}</td>
                    <td>${escapeHtml(monthKey)}</td>
                    <td><a href="${fileUrl}" target="_blank" rel="noopener noreferrer">View</a></td>
                </tr>
            `;
        });

    tableWrap.innerHTML = `
        <div style="overflow-x: auto;">
            <table class="tvTable" style="width: 100%; min-width: 980px;">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Supplier</th>
                        <th>InvoiceNo</th>
                        <th>Category</th>
                        <th>Type</th>
                        <th>Goods</th>
                        <th>VAT</th>
                        <th>Total</th>
                        <th>WeekKey</th>
                        <th>MonthKey</th>
                        <th>File</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderAccountingView() {
    const accountingTab = document.getElementById('accountingTab');
    if (!accountingTab) return;

    const { selectedWeek, selectedMonth, selectedCategory } = readAccountingSelections();
    const weeklyScans = getScansForWeek(selectedWeek, selectedCategory);
    const weeklySummary = summarizeScans(weeklyScans);
    const monthlySummary = summarizeScans(getScansForMonth(selectedMonth, selectedCategory));

    setAccountingCardValue('accWeekSpend', formatAccountingMoney(weeklySummary.expenses));
    setAccountingCardValue('accWeekGoods', formatAccountingMoney(weeklySummary.subtotal));
    setAccountingCardValue('accWeekVat', formatAccountingMoney(weeklySummary.vat));
    setAccountingCardValue('accWeekCount', String(weeklySummary.count));

    setAccountingCardValue('accMonthSpend', formatAccountingMoney(monthlySummary.expenses));
    setAccountingCardValue('accMonthGoods', formatAccountingMoney(monthlySummary.subtotal));
    setAccountingCardValue('accMonthVat', formatAccountingMoney(monthlySummary.vat));
    setAccountingCardValue('accMonthCount', String(monthlySummary.count));

    renderWeeklyChart(selectedCategory);
    renderWeeklyInvoicesTable(weeklyScans);
    renderMonthlyCategoryBreakdown(monthlySummary);
    renderCategoryPieChart(monthlySummary);
}

function escapeCsvField(value) {
    const stringValue = String(value ?? '');
    return `"${stringValue.replace(/"/g, '""')}"`;
}

function downloadAccountingCsv(filename, rows) {
    const headers = ['Date', 'Supplier', 'InvoiceNo', 'Category', 'Type', 'Goods', 'VAT', 'Total', 'WeekKey', 'MonthKey'];
    const contentRows = [headers, ...rows];
    const csv = contentRows.map((row) => row.map(escapeCsvField).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function mapScanToCsvRow(scan) {
    const extracted = scan.extracted || {};
    const createdDate = getScanCreatedDate(scan);
    const date = extracted.invoiceDate || formatLocalDate(createdDate);
    return [
        date,
        scan.supplier || extracted.vendorName || '',
        extracted.invoiceNo || '',
        scan.category || 'Uncategorized',
        scan.type || 'expense',
        extracted.subtotal ?? '',
        extracted.vat ?? '',
        extracted.total ?? getScannedInvoiceTotal(scan),
        scan.weekKey || '',
        scan.monthKey || ''
    ];
}

function exportAccountingWeekCsv() {
    const { selectedWeek, selectedCategory } = readAccountingSelections();
    const scans = getScansForWeek(selectedWeek, selectedCategory);
    const rows = scans.map(mapScanToCsvRow);
    const fileWeek = toIsoWeekCodeFromWeekKey(selectedWeek) || selectedWeek;
    downloadAccountingCsv(`transvortex-week-${fileWeek}.csv`, rows);
    showNotification(`✅ Exported ${rows.length} rows for selected week`, 'success');
}

function exportAccountingMonthCsv() {
    const { selectedMonth, selectedCategory } = readAccountingSelections();
    const scans = getScansForMonth(selectedMonth, selectedCategory);
    const rows = scans.map(mapScanToCsvRow);
    downloadAccountingCsv(`transvortex-accounting-${selectedMonth}.csv`, rows);
    showNotification(`✅ Exported ${rows.length} rows for selected month`, 'success');
}

async function updateScannedInvoiceAccountingField(scanId, field, value) {
    if (isAccountant) return;
    const scan = getScannedInvoiceById(scanId);
    if (!scan) return;

    const nextType = field === 'type' ? (value === 'income' ? 'income' : 'expense') : (scan.type || 'expense');
    const nextCategory = field === 'category' ? (value?.trim() || 'Uncategorized') : (scan.category || 'Uncategorized');
    const total = getScannedInvoiceTotal(scan);
    const profitImpact = roundMoney((nextType === 'income' ? 1 : -1) * total) || 0;

    try {
        const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const patch = {
            type: nextType,
            category: nextCategory,
            profitImpact
        };

        await updateDoc(doc(db, 'scannedInvoices', scanId), patch);
    } catch (error) {
        console.error('❌ Failed updating scan accounting fields:', error);
        showNotification('❌ Could not update category/type', 'error');
    }
}

function handleScannedInvoiceListChange(event) {
    if (isAccountant) return;
    const select = event.target.closest('[data-scan-field]');
    if (!select) return;
    const scanId = select.dataset.scanId;
    const field = select.dataset.scanField;
    if (!scanId || !field) return;
    updateScannedInvoiceAccountingField(scanId, field, select.value);
}

function setupAccountingUI() {
    const weekSelect = document.getElementById('accountingWeekSelect');
    const monthSelect = document.getElementById('accountingMonthSelect');
    const categoryFilterSelect = document.getElementById('accountingCategoryFilter');
    const exportWeekBtn = document.getElementById('exportWeekCsvBtn');
    const exportMonthBtn = document.getElementById('exportMonthCsvBtn');
    const scanCategoryFilterSelect = document.getElementById('scanCategoryFilter');

    if (weekSelect && !weekSelect.dataset.bound) {
        weekSelect.addEventListener('change', renderAccountingView);
        weekSelect.dataset.bound = 'true';
    }

    if (monthSelect && !monthSelect.dataset.bound) {
        monthSelect.addEventListener('change', renderAccountingView);
        monthSelect.dataset.bound = 'true';
    }

    if (categoryFilterSelect && !categoryFilterSelect.dataset.bound) {
        categoryFilterSelect.addEventListener('change', renderAccountingView);
        categoryFilterSelect.dataset.bound = 'true';
    }

    if (exportWeekBtn && !exportWeekBtn.dataset.bound) {
        exportWeekBtn.addEventListener('click', exportAccountingWeekCsv);
        exportWeekBtn.dataset.bound = 'true';
    }

    if (exportMonthBtn && !exportMonthBtn.dataset.bound) {
        exportMonthBtn.addEventListener('click', exportAccountingMonthCsv);
        exportMonthBtn.dataset.bound = 'true';
    }

    if (scanCategoryFilterSelect && !scanCategoryFilterSelect.dataset.bound) {
        scanCategoryFilterSelect.addEventListener('change', () => {
            scannedInvoicesCategoryFilter = scanCategoryFilterSelect.value || 'all';
            applyScannedInvoicesCategoryFilter();
        });
        scanCategoryFilterSelect.dataset.bound = 'true';
    }

    populateAccountingSelectors();
}

function applyAccountantModeUi() {
    const scannedTabBtn = document.querySelector('.tab-btn[data-tab="scannedInvoices"]');
    const scannedTab = document.getElementById('scannedInvoicesTab');
    const cameraBtn = document.getElementById('scanInvoiceCameraBtn');
    const uploadBtn = document.getElementById('scanInvoiceUploadBtn');
    const uploadConfirmBtn = document.getElementById('scanInvoiceUploadConfirmBtn');
    const scanCategoryFilter = document.getElementById('scanCategoryFilter');

    if (scannedTabBtn) {
        scannedTabBtn.style.display = isAccountant ? 'none' : '';
    }

    if (cameraBtn) cameraBtn.disabled = isAccountant;
    if (uploadBtn) uploadBtn.disabled = isAccountant;
    if (uploadConfirmBtn) uploadConfirmBtn.disabled = isAccountant;
    if (scanCategoryFilter) scanCategoryFilter.disabled = isAccountant;

    if (isAccountant) {
        if (scannedTab) scannedTab.style.display = 'none';
        if (currentTab === 'scannedInvoices') {
            switchTab('accounting');
        }
    }
}

function ensureTesseractLoaded() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);

    const existingScript = document.getElementById('tesseractCdnScript');
    if (existingScript) {
        return new Promise((resolve, reject) => {
            existingScript.addEventListener('load', () => resolve(window.Tesseract), { once: true });
            existingScript.addEventListener('error', () => reject(new Error('Failed to load OCR engine')), { once: true });
        });
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.id = 'tesseractCdnScript';
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        script.async = true;
        script.onload = () => resolve(window.Tesseract);
        script.onerror = () => reject(new Error('Failed to load OCR engine'));
        document.head.appendChild(script);
    });
}

async function loadBlobFromUrl(url) {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) {
        throw new Error(`Unable to fetch image (${response.status})`);
    }
    return response.blob();
}

async function loadBlobForScannedInvoice(scan) {
    const fileUrl = scan?.file?.downloadURL;
    if (!fileUrl) {
        throw new Error('Missing scan file source');
    }

    try {
        return await loadBlobFromUrl(fileUrl);
    } catch (error) {
        const message = String(error?.message || '');
        const isCorsLike = /cors|failed to fetch|networkerror|xmlhttprequest/i.test(message);
        if (isCorsLike) {
            throw new Error('Storage CORS not configured. Please allow your domain in bucket CORS settings.');
        }
        throw error;
    }
}

function getEmptyExtractedPayload() {
    return {
        rawText: '',
        vendorName: null,
        invoiceNo: null,
        invoiceDate: null,
        currency: 'GBP',
        subtotal: null,
        vat: null,
        total: null,
        items: []
    };
}

async function persistScannedInvoiceExtraction(scanId, extractedData) {
    const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    const normalized = recalculateExtractedData(extractedData, { overwriteDerived: false });
    
    // Compute accounting date from extracted invoice date
    const tempScan = { extracted: normalized };
    const accountingDate = getAccountingDateFromScan(tempScan);
    const accountingDateStr = formatLocalDate(accountingDate);
    const weekMeta = getWeekMetaFromTimestamp(accountingDate.getTime());
    const weekBounds = getWeekBoundsFromWeekKey(weekMeta.weekKey);

    await updateDoc(doc(db, 'scannedInvoices', scanId), {
        extracted: normalized,
        verified: {
            isVerified: false,
            verifiedAt: null
        },
        status: 'extracted',
        accountingDate: accountingDateStr,
        weekKey: weekMeta.weekKey,
        weekStart: weekBounds.weekStart,
        weekEnd: weekBounds.weekEnd,
        monthKey: toMonthKeyFromDate(accountingDate)
    });
}

async function saveScannedInvoiceVerified(scanId, extractedData) {
    const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    const normalized = recalculateExtractedData(extractedData, { overwriteDerived: false });
    
    // Compute accounting date from extracted invoice date
    const tempScan = { extracted: normalized };
    const accountingDate = getAccountingDateFromScan(tempScan);
    const accountingDateStr = formatLocalDate(accountingDate);
    const weekMeta = getWeekMetaFromTimestamp(accountingDate.getTime());
    const weekBounds = getWeekBoundsFromWeekKey(weekMeta.weekKey);

    await updateDoc(doc(db, 'scannedInvoices', scanId), {
        extracted: normalized,
        verified: {
            isVerified: true,
            verifiedAt: serverTimestamp()
        },
        status: 'verified',
        accountingDate: accountingDateStr,
        weekKey: weekMeta.weekKey,
        weekStart: weekBounds.weekStart,
        weekEnd: weekBounds.weekEnd,
        monthKey: toMonthKeyFromDate(accountingDate)
    });
}

function openScannedInvoiceReview(scanId, extractedData = null) {
    const modal = document.getElementById('scanReviewModal');
    if (!modal) return;

    const scan = getScannedInvoiceById(scanId);
    const seed = extractedData || scan?.extracted || getEmptyExtractedPayload();

    scannedInvoiceReviewScanId = scanId;
    scannedInvoiceReviewState = {
        extracted: recalculateExtractedData(seed, { overwriteDerived: false })
    };

    populateScannedInvoiceReviewForm();
    setScannedInvoiceReviewBusy(false);
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    modal.removeAttribute('inert');
}

function closeScannedInvoiceReview() {
    const modal = document.getElementById('scanReviewModal');
    if (modal) {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('inert', '');
    }
    scannedInvoiceReviewState = null;
    scannedInvoiceReviewScanId = null;
    scannedInvoiceReviewBusy = false;
}

function showConfirmationDialog(title, message) {
    // Returns a promise that resolves to true if user confirms, false otherwise
    return new Promise((resolve) => {
        const dialog = document.createElement('div');
        dialog.className = 'confirmationDialog';
        dialog.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
            padding: 16px;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 24px;
            max-width: 400px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(15, 23, 42, 0.2);
        `;

        const titleEl = document.createElement('h3');
        titleEl.textContent = title;
        titleEl.style.cssText = `
            margin: 0 0 12px 0;
            font-size: 1.2rem;
            color: #0f172a;
            font-weight: 600;
        `;

        const messageEl = document.createElement('p');
        messageEl.textContent = message;
        messageEl.style.cssText = `
            margin: 0 0 24px 0;
            font-size: 0.95rem;
            color: #64748b;
            line-height: 1.5;
        `;

        const buttons = document.createElement('div');
        buttons.style.cssText = `
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `
            padding: 8px 16px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            background: white;
            color: #0f172a;
            font-weight: 600;
            font-size: 0.85rem;
            cursor: pointer;
            transition: all 0.2s;
        `;
        cancelBtn.addEventListener('mouseover', () => {
            cancelBtn.style.background = '#f1f5f9';
        });
        cancelBtn.addEventListener('mouseout', () => {
            cancelBtn.style.background = 'white';
        });
        cancelBtn.addEventListener('click', () => {
            dialog.remove();
            resolve(false);
        });

        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = 'Delete';
        confirmBtn.style.cssText = `
            padding: 8px 16px;
            border: 1px solid #991b1b;
            border-radius: 8px;
            background: #dc2626;
            color: white;
            font-weight: 600;
            font-size: 0.85rem;
            cursor: pointer;
            transition: all 0.2s;
        `;
        confirmBtn.addEventListener('mouseover', () => {
            confirmBtn.style.background = '#b91c1c';
        });
        confirmBtn.addEventListener('mouseout', () => {
            confirmBtn.style.background = '#dc2626';
        });
        confirmBtn.addEventListener('click', () => {
            dialog.remove();
            resolve(true);
        });

        buttons.appendChild(cancelBtn);
        buttons.appendChild(confirmBtn);

        content.appendChild(titleEl);
        content.appendChild(messageEl);
        content.appendChild(buttons);
        dialog.appendChild(content);
        document.body.appendChild(dialog);

        // Auto-focus cancel button for safety
        cancelBtn.focus();
    });
}

async function deleteScannedInvoice(scanId) {
    if (!isAdmin) {
        showNotification('❌ Only admins can delete invoices', 'error');
        return;
    }

    // Confirm deletion
    const confirmed = await showConfirmationDialog(
        'Delete invoice?',
        'This will permanently delete the invoice file and its saved data. This cannot be undone.'
    );
    if (!confirmed) return;

    // Show loading state on the card
    const scanRow = document.querySelector(`.scanRow[data-scan-id="${scanId}"]`);
    if (scanRow) {
        scanRow.style.opacity = '0.5';
        scanRow.style.pointerEvents = 'none';
    }

    try {
        // Get the scan document first to get storage path
        const scan = getScannedInvoiceById(scanId);
        if (!scan) {
            showNotification('❌ Invoice not found', 'error');
            if (scanRow) {
                scanRow.style.opacity = '1';
                scanRow.style.pointerEvents = 'auto';
            }
            return;
        }

        // Delete from Firebase Storage
        const storagePath = scan.file?.storagePath || scan.storagePath || scan.storageFullPath;
        const downloadURL = scan.file?.downloadURL || scan.downloadURL;

        if (storagePath || downloadURL) {
            try {
                const { ref, deleteObject, refFromURL } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js');
                
                let storageRef = null;
                if (storagePath) {
                    storageRef = ref(await getStorageService(), storagePath);
                } else if (downloadURL) {
                    storageRef = refFromURL(await getStorageService(), downloadURL);
                }

                if (storageRef) {
                    await deleteObject(storageRef);
                    console.log(`✅ Storage object deleted: ${storagePath || downloadURL}`);
                }
            } catch (storageError) {
                // If storage object not found, continue with Firestore delete
                if (storageError?.code === 'storage/object-not-found') {
                    console.log('ℹ️ Storage object not found, continuing with Firestore delete');
                } else {
                    console.warn('⚠️ Storage delete failed:', storageError.message);
                    // Continue to Firestore delete anyway
                }
            }
        }

        // Delete from Firestore
        const { deleteDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        await deleteDoc(doc(db, 'scannedInvoices', scanId));

        console.log(`✅ Firestore document deleted: ${scanId}`);

        // UI will update through Firestore listener (applyScannedInvoiceDocChanges)
        // But close modal if open
        if (scannedInvoiceReviewScanId === scanId) {
            closeScannedInvoiceReview();
        }

        showNotification('✅ Invoice deleted.', 'success');
    } catch (error) {
        console.error('❌ Delete failed:', error);
        showNotification(`❌ Failed to delete invoice: ${error.message}`, 'error');
        
        // Restore UI state
        if (scanRow) {
            scanRow.style.opacity = '1';
            scanRow.style.pointerEvents = 'auto';
        }
    }
}

async function getStorageService() {
    // Import and return the storage instance
    const { getStorage } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js');
    return getStorage();
}

function setScannedInvoiceReviewBusy(isBusy) {
    scannedInvoiceReviewBusy = Boolean(isBusy);

    const saveBtn = document.getElementById('scanReviewSaveBtn');
    const retryBtn = document.getElementById('scanReviewRetryBtn');
    const recalcBtn = document.getElementById('scanReviewRecalculateBtn');
    const addItemBtn = document.getElementById('scanReviewAddItemBtn');
    const parseItemsBtn = document.getElementById('scanReviewParseItemsBtn');
    const gsfParseBtn = document.getElementById('scanReviewGsfParseBtn');

    if (saveBtn) saveBtn.disabled = scannedInvoiceReviewBusy || isAccountant;
    if (recalcBtn) recalcBtn.disabled = scannedInvoiceReviewBusy || isAccountant;
    if (addItemBtn) addItemBtn.disabled = scannedInvoiceReviewBusy || isAccountant;
    if (parseItemsBtn) parseItemsBtn.disabled = scannedInvoiceReviewBusy || isAccountant;
    if (gsfParseBtn) gsfParseBtn.disabled = scannedInvoiceReviewBusy || isAccountant;

    if (retryBtn) {
        retryBtn.disabled = scannedInvoiceReviewBusy || isAccountant;
        retryBtn.textContent = scannedInvoiceReviewBusy ? 'Retrying…' : 'Retry OCR';
    }
}

function populateScannedInvoiceReviewForm() {
    if (!scannedInvoiceReviewState?.extracted) return;
    const data = scannedInvoiceReviewState.extracted;

    const dateEl = document.getElementById('scanReviewInvoiceDate');
    const invoiceNoEl = document.getElementById('scanReviewInvoiceNo');
    const taxPointDateEl = document.getElementById('scanReviewTaxPointDate');
    const customerRefEl = document.getElementById('scanReviewCustomerReference');
    const weekKeyEl = document.getElementById('scanReviewWeekKey');
    const monthKeyEl = document.getElementById('scanReviewMonthKey');
    const vendorEl = document.getElementById('scanReviewVendor');
    const currencyEl = document.getElementById('scanReviewCurrency');
    const subtotalEl = document.getElementById('scanReviewSubtotal');
    const vatEl = document.getElementById('scanReviewVat');
    const totalEl = document.getElementById('scanReviewTotal');
    const validationWarnEl = document.getElementById('scanReviewValidationWarning');
    const validationMsgEl = document.getElementById('scanReviewValidationMsg');

    if (dateEl) dateEl.value = data.invoiceDate || '';
    if (invoiceNoEl) invoiceNoEl.value = data.invoiceNo || '';
    if (taxPointDateEl) taxPointDateEl.value = data.taxPointDate || '';
    if (customerRefEl) customerRefEl.value = data.customerReference || '';
    
    // Sanitize vendor name: filter out noise, detect GSF, use rawText for context
    const cleanVendor = sanitizeVendorNameForModal(data.vendorName, data.rawText);
    if (vendorEl) vendorEl.value = cleanVendor || '';
    if (vendorEl && !cleanVendor) vendorEl.placeholder = 'Unknown supplier (edit)';
    
    if (currencyEl) currencyEl.value = data.currency || 'GBP';
    if (subtotalEl) subtotalEl.value = data.subtotal ?? '';
    
    // If VAT is missing but subtotal and total exist, compute it
    let displayVat = data.vat;
    if ((displayVat === null || displayVat === undefined) && data.subtotal !== null && data.total !== null) {
        const computedVat = computeMissingVat(data.subtotal, data.total);
        if (computedVat !== null) {
            displayVat = computedVat;
            // Update the extracted data with computed VAT
            scannedInvoiceReviewState.extracted.vat = computedVat;
        }
    }
    if (vatEl) vatEl.value = displayVat ?? '';
    if (totalEl) totalEl.value = data.total ?? '';
    
    // Compute and display accounting fields from extracted invoice date
    const tempScan = { extracted: data };
    const accountingDate = getAccountingDateFromScan(tempScan);
    const weekMeta = getWeekMetaFromTimestamp(accountingDate.getTime());
    const monthKey = toMonthKeyFromDate(accountingDate);
    
    // Display week/month as read-only text (with date range for week)
    if (weekKeyEl) {
        const weekKey = weekMeta.weekKey || '';
        const weekStart = weekMeta.start ? weekMeta.start.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }) : '';
        const weekEnd = weekMeta.end ? weekMeta.end.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }) : '';
        const dateRangeText = weekStart && weekEnd ? `${weekKey} (${weekStart} – ${weekEnd})` : weekKey;
        weekKeyEl.value = dateRangeText;
    }
    if (monthKeyEl) monthKeyEl.value = monthKey || '';

    // Show validation warnings
    let warnings = [];
    if (!data.invoiceDate) {
        warnings.push('⚠️ Invoice date missing (required for weekly/monthly grouping).');
    }
    if (warnings.length > 0) {
        if (validationWarnEl && validationMsgEl) {
            validationMsgEl.textContent = warnings.join(' ');
            validationWarnEl.style.display = 'block';
        }
    } else if (validationWarnEl) {
        validationWarnEl.style.display = 'none';
    }

    [dateEl, invoiceNoEl, taxPointDateEl, customerRefEl, vendorEl, currencyEl, subtotalEl, vatEl, totalEl].forEach((field) => {
        if (field) field.disabled = isAccountant;
    });

    renderScannedInvoiceReviewItems();
}

function renderScannedInvoiceReviewItems() {
    const container = document.getElementById('scanReviewItemsList');
    if (!container || !scannedInvoiceReviewState?.extracted) return;

    const items = scannedInvoiceReviewState.extracted.items || [];
    const warningEl = document.getElementById('scanReviewItemsWarning');
    
    if (items.length === 0) {
        container.innerHTML = '<div class="scanReviewItemsEmpty">No valid items detected. You can add items manually or use Parse Items From Description to re-extract from OCR text.</div>';
        if (warningEl) warningEl.style.display = 'block';
        return;
    }
    
    if (warningEl) warningEl.style.display = 'none';

    // Render items as mobile-friendly cards (no horizontal scroll)
    container.innerHTML = items.map((item, index) => `
        <div class="scanReviewItemCard" data-item-index="${index}">
            <div class="scanReviewItemCardRow1">
                <span class="scanReviewItemLabel">Qty:</span>
                <input type="number" class="scanReviewItemInput scanReviewItemQty" data-item-field="qty" step="0.01" value="${item.qty ?? ''}" placeholder="0.00" ${isAccountant ? 'disabled' : ''} />
                <span class="scanReviewItemLabel">Part No:</span>
                <input type="text" class="scanReviewItemInput scanReviewItemPartNo" data-item-field="partNumber" value="${escapeHtml(item.partNumber || '')}" placeholder="Part#" ${isAccountant ? 'disabled' : ''} />
            </div>
            <div class="scanReviewItemCardRow2">
                <span class="scanReviewItemLabel">Description:</span>
                <input type="text" class="scanReviewItemInput scanReviewItemDescription" data-item-field="description" value="${escapeHtml(item.description || '')}" placeholder="Item description" ${isAccountant ? 'disabled' : ''} />
            </div>
            <div class="scanReviewItemCardRow3">
                <span class="scanReviewItemLabel">Unit Price:</span>
                <input type="number" class="scanReviewItemInput scanReviewItemPrice" data-item-field="unitPrice" step="0.01" value="${item.unitPrice ?? ''}" placeholder="0.00" ${isAccountant ? 'disabled' : ''} />
                <span class="scanReviewItemLabel">Line Total:</span>
                <input type="number" class="scanReviewItemInput scanReviewItemTotal" data-item-field="lineTotal" step="0.01" value="${item.lineTotal ?? ''}" placeholder="0.00" ${isAccountant ? 'disabled' : ''} />
                <button type="button" class="scanReviewItemRemove" data-item-remove="${index}" ${isAccountant ? 'disabled' : ''}>✕</button>
            </div>
        </div>
    `).join('');
}

function addScannedInvoiceReviewItem() {
    if (isAccountant) return;
    if (!scannedInvoiceReviewState?.extracted) return;
    scannedInvoiceReviewState.extracted.items.push({
        description: '',
        qty: null,
        unitPrice: null,
        lineTotal: null
    });
    renderScannedInvoiceReviewItems();
}

function removeScannedInvoiceReviewItem(index) {
    if (isAccountant) return;
    if (!scannedInvoiceReviewState?.extracted) return;
    scannedInvoiceReviewState.extracted.items.splice(index, 1);
    renderScannedInvoiceReviewItems();
}

async function preprocessImageForOcr(blob, retryMode = false) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const img = new Image();
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width * 2;
                        canvas.height = img.height * 2;
                        const ctx = canvas.getContext('2d');
                        if (!ctx) throw new Error('Canvas context failed');
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        const data = imageData.data;
                        for (let i = 0; i < data.length; i += 4) {
                            const r = data[i], g = data[i + 1], b = data[i + 2];
                            const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                            const contrast = retryMode ? 1.6 : 1.4;
                            const adjusted = Math.round(((gray - 128) * contrast) + 128);
                            const clipped = Math.max(0, Math.min(255, adjusted));
                            const final = retryMode && clipped < 200 && clipped > 50 ? Math.round(Math.max(0, clipped - 30)) : clipped;
                            data[i] = data[i + 1] = data[i + 2] = final;
                        }
                        if (!retryMode) {
                            const sharpened = applySharpenFilter(imageData);
                            ctx.putImageData(sharpened, 0, 0);
                        } else {
                            ctx.putImageData(imageData, 0, 0);
                        }
                        canvas.toBlob((processedBlob) => {
                            processedBlob ? resolve(processedBlob) : reject(new Error('Canvas to blob failed'));
                        }, 'image/png', 0.95);
                    } catch (err) {
                        reject(err);
                    }
                };
                img.onerror = () => reject(new Error('Image load failed'));
                img.src = e.target.result;
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('FileReader failed'));
        reader.readAsDataURL(blob);
    });
}

function applySharpenFilter(imageData) {
    const data = imageData.data, width = imageData.width, height = imageData.height;
    const kernel = [0, -0.25, 0, -0.25, 2, -0.25, 0, -0.25, 0];
    const output = new ImageData(width, height);
    const outData = output.data;
    for (let i = 0; i < data.length; i++) outData[i] = data[i];
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let val = 0, idx = (y * width + x) * 4;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const kidx = ((y + ky) * width + (x + kx)) * 4;
                    val += data[kidx] * kernel[(ky + 1) * 3 + (kx + 1)];
                }
            }
            outData[idx] = outData[idx + 1] = outData[idx + 2] = Math.max(0, Math.min(255, Math.round(val)));
        }
    }
    return output;
}

async function runOcrWithRetry(tesseract, objectUrl, scanId) {
    let result = await tesseract.recognize(objectUrl, 'eng', {
        logger: (message) => {
            if (message?.status === 'recognizing text') {
                const percent = Math.round((message.progress || 0) * 100);
                setScanOcrProgress(scanId, { percent, text: 'Reading invoice…' });
            }
        }
    });
    let text = result?.data?.text || '';
    const lines = text.split('\n').filter(l => l.trim()).length;
    if (lines < 15) {
        setScanOcrProgress(scanId, { percent: 50, text: 'Retrying with enhanced preprocessing…' });
        result = await tesseract.recognize(objectUrl, 'eng', {
            logger: (message) => {
                if (message?.status === 'recognizing text') {
                    const percent = 50 + Math.round((message.progress || 0) * 50);
                    setScanOcrProgress(scanId, { percent, text: 'Retrying with enhanced preprocessing…' });
                }
            }
        });
        text = result?.data?.text || text;
    }
    return text;
}

async function runOcrForScannedInvoice(scanId, options = {}) {
    if (isAccountant) {
        showNotification('ℹ️ Accountant mode is read-only', 'info');
        return;
    }

    const scan = getScannedInvoiceById(scanId);
    if (!scan) {
        showNotification('❌ Scanned invoice not found', 'error');
        return;
    }

    const fileType = scan?.file?.fileType || 'image';
    const fileUrl = scan?.file?.downloadURL;
    const isReviewRetry = options.fromReview === true;
    if (isReviewRetry) setScannedInvoiceReviewBusy(true);

    if (!fileUrl) {
        showNotification('❌ Missing scan file URL', 'error');
        if (isReviewRetry) setScannedInvoiceReviewBusy(false);
        return;
    }

    if (fileType !== 'image') {
        showNotification('ℹ️ OCR currently supports image scans. You can still edit details manually.', 'info');
        openScannedInvoiceReview(scanId, scan.extracted || getEmptyExtractedPayload());
        if (isReviewRetry) setScannedInvoiceReviewBusy(false);
        return;
    }

    try {
        const tesseract = await ensureTesseractLoaded();
        setScanOcrProgress(scanId, { percent: 0, text: 'Reading invoice…' });

        const blob = await loadBlobForScannedInvoice(scan);
        
        // Preprocess image before OCR
        let processedBlob = blob;
        try {
            setScanOcrProgress(scanId, { percent: 5, text: 'Preprocessing image…' });
            processedBlob = await preprocessImageForOcr(blob, false);
        } catch (err) {
            console.warn('Image preprocessing failed, using original:', err);
            processedBlob = blob;
        }

        const objectUrl = URL.createObjectURL(processedBlob);

        try {
            const text = await runOcrWithRetry(tesseract, objectUrl, scanId);
            const extracted = extractInvoiceDataFromRawText(text);
            await persistScannedInvoiceExtraction(scanId, extracted);

            clearScanOcrProgress(scanId);
            showNotification('✅ OCR completed. Review extracted data.', 'success');

            if (options.openReview !== false) {
                openScannedInvoiceReview(scanId, extracted);
            }
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    } catch (error) {
        console.error('❌ OCR failed:', error);
        clearScanOcrProgress(scanId);
        const message = String(error?.message || '');
        if (message.includes('Storage CORS not configured')) {
            showNotification('Storage CORS not configured. Please allow your domain in bucket CORS settings.', 'error');
        } else {
            showNotification('❌ OCR failed. Scan is saved and you can retry OCR.', 'error');
        }
    } finally {
        if (isReviewRetry) setScannedInvoiceReviewBusy(false);
    }
}

async function handleScannedInvoiceReviewSave() {
    if (isAccountant) return;
    if (!scannedInvoiceReviewScanId || !scannedInvoiceReviewState?.extracted) return;
    if (scannedInvoiceReviewBusy) return;

    const data = normalizeExtractedData(scannedInvoiceReviewState.extracted);
    if (data.invoiceDate && !isDateWithinPlausibleRange(data.invoiceDate)) {
        const shouldContinue = confirm('The selected invoice date is outside the usual 2-year range. Save anyway?');
        if (!shouldContinue) return;
    }

    try {
        await saveScannedInvoiceVerified(scannedInvoiceReviewScanId, data);
        showNotification('✅ Extracted details saved and verified', 'success');
        closeScannedInvoiceReview();
    } catch (error) {
        console.error('❌ Failed to save verified extracted data:', error);
        showNotification('❌ Failed to save extracted details', 'error');
    }
}

function handleScannedInvoiceListClick(event) {
    const actionButton = event.target.closest('[data-scan-action]');
    if (!actionButton) return;

    const scanId = actionButton.dataset.scanId;
    const action = actionButton.dataset.scanAction;
    if (!scanId || !action) return;

    if (action === 'extract') {
        if (isAccountant) return;
        runOcrForScannedInvoice(scanId, { openReview: true });
    } else if (action === 'details') {
        const scan = getScannedInvoiceById(scanId);
        openScannedInvoiceReview(scanId, scan?.extracted || getEmptyExtractedPayload());
    } else if (action === 'delete') {
        deleteScannedInvoice(scanId);
    }
}

function bindScannedInvoiceReviewUI() {
    const modal = document.getElementById('scanReviewModal');
    const closeBtn = document.getElementById('scanReviewCloseBtn');
    const cancelBtn = document.getElementById('scanReviewCancelBtn');
    const saveBtn = document.getElementById('scanReviewSaveBtn');
    const retryBtn = document.getElementById('scanReviewRetryBtn');
    const recalcBtn = document.getElementById('scanReviewRecalculateBtn');
    const addItemBtn = document.getElementById('scanReviewAddItemBtn');
    const fieldsWrap = document.getElementById('scanReviewModalBody');

    if (!modal || modal.dataset.bound === 'true') return;

    if (closeBtn) closeBtn.addEventListener('click', closeScannedInvoiceReview);
    if (cancelBtn) cancelBtn.addEventListener('click', closeScannedInvoiceReview);

    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeScannedInvoiceReview();
    });

    if (saveBtn) {
        saveBtn.addEventListener('click', handleScannedInvoiceReviewSave);
    }

    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            if (isAccountant) return;
            if (!scannedInvoiceReviewScanId) return;
            runOcrForScannedInvoice(scannedInvoiceReviewScanId, { openReview: true, fromReview: true });
        });
    }

    if (recalcBtn) {
        recalcBtn.addEventListener('click', () => {
            if (isAccountant) return;
            if (!scannedInvoiceReviewState?.extracted) return;
            scannedInvoiceReviewState.extracted = recalculateExtractedData(scannedInvoiceReviewState.extracted, { overwriteDerived: true });
            populateScannedInvoiceReviewForm();
        });
    }

    if (addItemBtn) {
        addItemBtn.addEventListener('click', addScannedInvoiceReviewItem);
    }

    const parseItemsBtn = document.getElementById('scanReviewParseItemsBtn');
    if (parseItemsBtn) {
        parseItemsBtn.addEventListener('click', async () => {
            if (isAccountant || !scannedInvoiceReviewState?.extracted?.rawText) return;
            try {
                setScannedInvoiceReviewBusy(true);
                const items = detectItemsFromDescriptionZone(scannedInvoiceReviewState.extracted.rawText);
                scannedInvoiceReviewState.extracted.items = items;
                renderScannedInvoiceReviewItems();
                showNotification(`✅ Extracted ${items.length} items from description text`, 'success');
            } catch (err) {
                console.error('Parse items failed:', err);
                showNotification('❌ Could not parse items from description', 'error');
            } finally {
                setScannedInvoiceReviewBusy(false);
            }
        });
    }

    const gsfParseBtn = document.getElementById('scanReviewGsfParseBtn');
    if (gsfParseBtn) {
        gsfParseBtn.addEventListener('click', async () => {
            if (isAccountant || !scannedInvoiceReviewState?.extracted?.rawText) return;
            try {
                setScannedInvoiceReviewBusy(true);
                const items = detectItemsFromGsfText(scannedInvoiceReviewState.extracted.rawText);
                scannedInvoiceReviewState.extracted.items = items;
                renderScannedInvoiceReviewItems();
                showNotification(`✅ Extracted ${items.length} items using GSF parser`, 'success');
            } catch (err) {
                console.error('GSF parse failed:', err);
                showNotification('❌ Could not parse items using GSF mode', 'error');
            } finally {
                setScannedInvoiceReviewBusy(false);
            }
        });
    }

    const deleteBtn = document.getElementById('scanReviewDeleteBtn');
    if (deleteBtn) {
        deleteBtn.style.display = isAdmin ? 'block' : 'none';
        deleteBtn.addEventListener('click', () => {
            if (!scannedInvoiceReviewScanId) return;
            deleteScannedInvoice(scannedInvoiceReviewScanId);
        });
    }

    if (fieldsWrap) {
        fieldsWrap.addEventListener('input', (event) => {
            if (isAccountant) return;
            if (!scannedInvoiceReviewState?.extracted) return;
            const target = event.target;

            if (target.id === 'scanReviewInvoiceDate') {
                scannedInvoiceReviewState.extracted.invoiceDate = target.value || null;
                // Recalculate and display accounting fields when date is edited
                const tempScan = { extracted: scannedInvoiceReviewState.extracted };
                const accountingDate = getAccountingDateFromScan(tempScan);
                const weekMeta = getWeekMetaFromTimestamp(accountingDate.getTime());
                const monthKey = toMonthKeyFromDate(accountingDate);
                document.getElementById('scanReviewWeekKey').value = weekMeta.weekKey || '';
                document.getElementById('scanReviewMonthKey').value = monthKey || '';
                return;
            }
            if (target.id === 'scanReviewInvoiceNo') {
                scannedInvoiceReviewState.extracted.invoiceNo = target.value?.trim() || null;
                return;
            }
            if (target.id === 'scanReviewTaxPointDate') {
                scannedInvoiceReviewState.extracted.taxPointDate = target.value || null;
                return;
            }
            if (target.id === 'scanReviewCustomerReference') {
                scannedInvoiceReviewState.extracted.customerReference = target.value?.trim() || null;
                return;
            }
            if (target.id === 'scanReviewVendor') {
                scannedInvoiceReviewState.extracted.vendorName = target.value?.trim() || null;
                return;
            }
            if (target.id === 'scanReviewCurrency') {
                scannedInvoiceReviewState.extracted.currency = target.value || 'GBP';
                return;
            }
            if (target.id === 'scanReviewSubtotal') {
                scannedInvoiceReviewState.extracted.subtotal = normalizeNullableNumber(target.value);
                return;
            }
            if (target.id === 'scanReviewVat') {
                scannedInvoiceReviewState.extracted.vat = normalizeNullableNumber(target.value);
                return;
            }
            if (target.id === 'scanReviewTotal') {
                scannedInvoiceReviewState.extracted.total = normalizeNullableNumber(target.value);
                return;
            }

            if (target.classList.contains('scanReviewItemInput')) {
                const card = target.closest('.scanReviewItemCard');
                if (!card) return;
                const itemIndex = Number(card.dataset.itemIndex);
                if (!Number.isInteger(itemIndex)) return;
                const field = target.dataset.itemField;
                if (!field) return;

                const item = scannedInvoiceReviewState.extracted.items[itemIndex];
                if (!item) return;

                if (field === 'description') {
                    item.description = target.value || '';
                } else {
                    item[field] = normalizeNullableNumber(target.value);
                }
            }
        });

        fieldsWrap.addEventListener('click', (event) => {
            if (isAccountant) return;
            const removeButton = event.target.closest('[data-item-remove]');
            if (!removeButton) return;
            const index = Number(removeButton.dataset.itemRemove);
            if (!Number.isInteger(index)) return;
            removeScannedInvoiceReviewItem(index);
        });
    }

    modal.dataset.bound = 'true';
}

function clearScannedInvoicePending() {
    const previewBox = document.getElementById('scanPreviewBox');
    const previewThumb = document.getElementById('scanPreviewThumb');
    const previewName = document.getElementById('scanPreviewName');
    const previewType = document.getElementById('scanPreviewType');
    const cameraInput = document.getElementById('scanInvoiceCameraInput');
    const fileInput = document.getElementById('scanInvoiceFileInput');

    pendingScannedInvoiceFile = null;

    if (pendingScannedPreviewUrl) {
        URL.revokeObjectURL(pendingScannedPreviewUrl);
        pendingScannedPreviewUrl = null;
    }

    if (previewThumb) previewThumb.removeAttribute('src');
    if (previewName) previewName.textContent = '';
    if (previewType) previewType.textContent = '';
    if (previewBox) previewBox.style.display = 'none';
    if (cameraInput) cameraInput.value = '';
    if (fileInput) fileInput.value = '';
}

function handleScannedInvoiceFileSelected(file) {
    if (!file) return;

    const previewBox = document.getElementById('scanPreviewBox');
    const previewThumb = document.getElementById('scanPreviewThumb');
    const previewName = document.getElementById('scanPreviewName');
    const previewType = document.getElementById('scanPreviewType');

    pendingScannedInvoiceFile = file;

    if (pendingScannedPreviewUrl) {
        URL.revokeObjectURL(pendingScannedPreviewUrl);
        pendingScannedPreviewUrl = null;
    }

    if (previewName) previewName.textContent = file.name || 'scanned-invoice.jpg';
    if (previewType) previewType.textContent = file.type || 'image/jpeg';

    if (previewThumb) {
        if ((file.type || '').startsWith('image/')) {
            pendingScannedPreviewUrl = URL.createObjectURL(file);
            previewThumb.src = pendingScannedPreviewUrl;
        } else {
            previewThumb.src = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><rect width="72" height="72" rx="8" fill="#F3F4F6"/><path d="M20 14h22l10 10v34H20z" fill="#fff" stroke="#CBD5E1"/><text x="36" y="45" font-size="12" text-anchor="middle" fill="#475569" font-family="Arial">PDF</text></svg>');
        }
    }

    if (previewBox) previewBox.style.display = 'block';
}

async function uploadPendingScannedInvoice() {
    if (isAccountant) {
        showNotification('ℹ️ Accountant mode is read-only', 'info');
        return;
    }

    if (!pendingScannedInvoiceFile) {
        showNotification('⚠️ Selectează mai întâi un fișier pentru upload', 'info');
        return;
    }

    if (!currentUser || !db || !app) {
        showNotification('⚠️ Conectează-te înainte de upload', 'info');
        return;
    }

    const uploadBtn = document.getElementById('scanInvoiceUploadConfirmBtn');
    if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Uploading...';
    }

    try {
        const now = Date.now();
        const dayKey = formatLocalDate(new Date(now));
        const isImage = (pendingScannedInvoiceFile.type || '').startsWith('image/');
        const extension = isImage ? 'jpg' : 'pdf';
        const storagePath = `scannedInvoices/${currentUser.uid}/${dayKey}/${now}.${extension}`;

        const { getStorage, ref, uploadBytesResumable, getDownloadURL } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js');
        const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        const storage = getStorage(app);
        const storageRef = ref(storage, storagePath);

        const uploadTask = uploadBytesResumable(storageRef, pendingScannedInvoiceFile, {
            contentType: pendingScannedInvoiceFile.type || (isImage ? 'image/jpeg' : 'application/pdf')
        });

        await new Promise((resolve, reject) => {
            uploadTask.on('state_changed', null, reject, resolve);
        });

        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        const weekMeta = getWeekMetaFromTimestamp(now);

        const scanDocRef = await addDoc(collection(db, 'scannedInvoices'), {
            createdAt: serverTimestamp(),
            clientCreatedAt: now,
            createdByUid: currentUser.uid,
            file: {
                storagePath,
                downloadURL,
                fileType: isImage ? 'image' : 'pdf'
            },
            status: 'uploaded',
            weekKey: weekMeta.weekKey,
            weekRange: weekMeta.weekRange
        });

        if (scanDocRef?.id) {
            scannedInvoiceBlobCache.set(scanDocRef.id, pendingScannedInvoiceFile);
        }

        clearScannedInvoicePending();
        showNotification('✅ Scanned invoice uploaded', 'success');
    } catch (error) {
        console.error('❌ Error uploading scanned invoice:', error);
        showNotification('❌ Upload failed: ' + (error.message || 'Unknown error'), 'error');
    } finally {
        if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Upload';
        }
    }
}

function getScannedInvoiceSortTimestamp(scan) {
    const createdAtMs = scan?.createdAt?.toMillis?.();
    if (typeof createdAtMs === 'number') return createdAtMs;
    if (typeof scan?.clientCreatedAt === 'number') return scan.clientCreatedAt;
    return 0;
}

function subscribeToScannedInvoices() {
    if (!currentUser || !db) return;

    import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js')
        .then(({ collection, query, where, onSnapshot }) => {
            if (scannedInvoicesUnsubscribe) {
                scannedInvoicesUnsubscribe();
                scannedInvoicesUnsubscribe = null;
            }

            const handleSnapshot = (snapshot) => {
                applyScannedInvoiceDocChanges(snapshot);
            };

            const handleSnapshotError = (error) => {
                console.error('❌ Error loading scanned invoices:', error);
                showNotification('❌ Unable to load scanned invoices', 'error');
            };

            const scansQuery = isAccountant
                ? query(collection(db, 'scannedInvoices'))
                : query(
                    collection(db, 'scannedInvoices'),
                    where('createdByUid', '==', currentUser.uid)
                );

            scannedInvoicesUnsubscribe = onSnapshot(scansQuery, handleSnapshot, handleSnapshotError);
        })
        .catch((error) => {
            console.error('❌ Failed to subscribe scanned invoices:', error);
        });
}

function setupScannedInvoicesUI() {
    const cameraBtn = document.getElementById('scanInvoiceCameraBtn');
    const uploadBtn = document.getElementById('scanInvoiceUploadBtn');
    const cameraInput = document.getElementById('scanInvoiceCameraInput');
    const fileInput = document.getElementById('scanInvoiceFileInput');
    const confirmUploadBtn = document.getElementById('scanInvoiceUploadConfirmBtn');
    const scannedInvoicesList = document.getElementById('scannedInvoicesList');

    bindScannedInvoiceReviewUI();

    if (cameraBtn && !cameraBtn.dataset.bound) {
        cameraBtn.addEventListener('click', () => cameraInput?.click());
        cameraBtn.dataset.bound = 'true';
    }

    if (uploadBtn && !uploadBtn.dataset.bound) {
        uploadBtn.addEventListener('click', () => fileInput?.click());
        uploadBtn.dataset.bound = 'true';
    }

    if (cameraInput && !cameraInput.dataset.bound) {
        cameraInput.addEventListener('change', (event) => {
            const file = event.target?.files?.[0];
            handleScannedInvoiceFileSelected(file);
        });
        cameraInput.dataset.bound = 'true';
    }

    if (fileInput && !fileInput.dataset.bound) {
        fileInput.addEventListener('change', (event) => {
            const file = event.target?.files?.[0];
            handleScannedInvoiceFileSelected(file);
        });
        fileInput.dataset.bound = 'true';
    }

    if (confirmUploadBtn && !confirmUploadBtn.dataset.bound) {
        confirmUploadBtn.addEventListener('click', uploadPendingScannedInvoice);
        confirmUploadBtn.dataset.bound = 'true';
    }

    if (scannedInvoicesList && !scannedInvoicesList.dataset.bound) {
        scannedInvoicesList.addEventListener('click', handleScannedInvoiceListClick);
        scannedInvoicesList.addEventListener('change', handleScannedInvoiceListChange);
        scannedInvoicesList.dataset.bound = 'true';
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
// PREMIUM NOTES SECTION - Interactive Features
// ==========================================

function initPremiumNotes() {
    const notesTextarea = document.getElementById('notes');
    const notesCharCount = document.getElementById('notesCharCount');
    const notesPreview = document.getElementById('notesPreview');
    const notesBadge = document.getElementById('notesBadge');
    const tagButtons = document.querySelectorAll('.tag-btn');
    const notesTagInput = document.getElementById('notesTag');
    
    if (!notesTextarea) return;
    
    // Character counter
    function updateCharCount() {
        const length = notesTextarea.value.length;
        if (notesCharCount) {
            notesCharCount.textContent = length;
            
            // Warning color if approaching limit
            if (length > 900) {
                notesCharCount.style.color = '#dc2626';
            } else if (length > 750) {
                notesCharCount.style.color = '#f59e0b';
            } else {
                notesCharCount.style.color = '#64748b';
            }
        }
    }
    
    // Update preview text
    function updatePreview() {
        const content = notesTextarea.value.trim();
        if (notesPreview) {
            if (content) {
                notesPreview.textContent = content.substring(0, 100) + (content.length > 100 ? '...' : '');
                notesPreview.classList.add('has-content');
                if (notesBadge) notesBadge.textContent = `${content.length} chars`;
            } else {
                notesPreview.textContent = 'Click to add notes...';
                notesPreview.classList.remove('has-content');
                if (notesBadge) notesBadge.textContent = 'Optional';
            }
        }
    }
    
    // Tag switching
    tagButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const tag = btn.dataset.tag;
            
            // Update UI
            tagButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update hidden input
            if (notesTagInput) {
                notesTagInput.value = tag;
            }
        });
    });
    
    // Listen for input
    notesTextarea.addEventListener('input', () => {
        updateCharCount();
        updatePreview();
    });
    
    // Initialize
    updateCharCount();
    updatePreview();
    
    console.log('✅ Premium Notes initialized');
}

// ==========================================
// CHIPS MODE AUTO-SAVE INTEGRATION
// ==========================================

function initChipsModeAutoSave() {
    // Import and setup auto-save callback
    import('./src/core/chips-mode.js')
        .then(({ setAutoSaveCallback, setFirestoreDb }) => {
            // Set auto-save callback
            setAutoSaveCallback(() => {
                // Auto-save logic: only save if in edit mode
                if (editingAppointmentId) {
                    console.log('🔄 Auto-saving appointment changes...');
                    // Trigger form submission silently
                    const form = document.getElementById('appointmentForm');
                    if (form) {
                        // Create a custom event to differentiate from manual submit
                        const autoSaveEvent = new Event('submit', { 
                            bubbles: true, 
                            cancelable: true 
                        });
                        autoSaveEvent.isAutoSave = true;
                        form.dispatchEvent(autoSaveEvent);
                    }
                } else {
                    console.log('📝 Changes tracked (new appointment, save manually)');
                }
            });
            
            // Set Firestore DB reference for catalog persistence
            if (db) {
                setFirestoreDb(db);
                console.log('✅ Firestore DB reference set for catalog');
            }
            
            console.log('✅ Chips Mode auto-save callback registered');
        })
        .catch(err => {
            console.warn('⚠️ Could not setup auto-save:', err);
        });
}

// ==========================================
// INITIALIZE ON PAGE LOAD
// ==========================================
window.handleAuthToggle = handleAuthToggle;
window.switchTab = switchTab;
window.handleRefreshAppointments = handleRefreshAppointments;
window.exportAppointmentsCSV = exportAppointmentsCSV;

document.addEventListener('DOMContentLoaded', () => {
    console.log('%c🔍 APPOINTMENT SYSTEM DIAGNOSTICS', 'font-size: 14px; font-weight: bold; color: #FF7A24;');
    console.log('Watch the console for these diagnostic messages:');
    console.log('- 📊 [DIAG] renderAppointments called - shows how often render is triggered');
    console.log('- 🔐 [DIAG] Active Firestore listener status');
    console.log('- 🆕 [DIAG] Invoice number generation tracking');
    console.log('%cURL: ' + window.location.href, 'color: #666; font-size: 11px;');
    
    // ✅ Add WebChannel error diagnostics
    console.log('%c🔌 Firestore Connection Diagnostics', 'font-size: 12px; font-weight: bold; color: #0066cc;');
    console.log('If you see WebChannel 404/400 errors: This is Firebase SDK handling transport fallback.');
    console.log('It will automatically use REST if WebChannel is unavailable.');
    console.log('---');

    setupScannedInvoicesUI();
    setupAccountingUI();
    applyAccountantModeUi();
    renderScannedInvoicesList();
    
    initializeFirebase();
    
    // Initialize Premium Notes Section
    initPremiumNotes();
    
    // Initialize Auto-Save for Chips Mode
    initChipsModeAutoSave();
    
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

    // Initialize Invoice tab UI
    initInvoiceTabUI();
    
    // Initialize language switcher
    initLanguageSwitcher();
    
    // Scroll active tab into view on page load (mobile-friendly)
    setTimeout(() => {
        const activeTabBtn = document.querySelector('.tab-btn.active');
        if (activeTabBtn) {
            activeTabBtn.scrollIntoView({ 
                behavior: 'smooth', 
                inline: 'center', 
                block: 'nearest' 
            });
        }
    }, 300);
    
    // Initialize PWA features (if pwa.js is loaded)
    if (typeof window.initPWA === 'function') {
        window.initPWA();
    }
    
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
    currentMode: null,  // 'type' or 'picker'
    typeInput: null,
    scrollLockY: 0,  // Store scroll position for restoration
    
    init() {
        this.overlay = document.getElementById('timePicker');
        this.input = document.getElementById('appointmentTime');
        this.hiddenInput = document.getElementById('appointmentTimeValue');
        this.typeInput = document.getElementById('timeTypeInput');
        
        if (!this.overlay || !this.input) return;
        
        // Generate hours and minutes
        this.generateHours();
        this.generateMinutes();
        
        // Determine initial mode (mobile: type, desktop: picker)
        const defaultMode = this.detectDeviceType();
        const savedMode = localStorage.getItem('timePickerMode');
        this.currentMode = savedMode || defaultMode;
        
        // Event listeners
        this.bindEvents();
    },
    
    detectDeviceType() {
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        return isMobile ? 'type' : 'picker';
    },
    
    setMode(mode) {
        const isChanging = (mode !== this.currentMode);
        
        this.currentMode = mode;
        if (isChanging) {
            localStorage.setItem('timePickerMode', mode);
        }
        
        // Update mode buttons
        const typeBtn = this.overlay?.querySelector('[data-mode="type"]');
        const pickerBtn = this.overlay?.querySelector('[data-mode="picker"]');
        
        if (typeBtn) {
            typeBtn.classList.remove('active');
            if (mode === 'type') typeBtn.classList.add('active');
        }
        if (pickerBtn) {
            pickerBtn.classList.remove('active');
            if (mode === 'picker') pickerBtn.classList.add('active');
        }
        
        // Show/hide content
        const typeContent = document.getElementById('typeMode');
        const pickerContent = document.getElementById('pickerMode');
        
        if (typeContent) {
            typeContent.classList.remove('active', 'hidden');
            if (mode === 'type') typeContent.classList.add('active');
        }
        if (pickerContent) {
            pickerContent.classList.remove('active', 'hidden');
            if (mode === 'picker') pickerContent.classList.remove('hidden');
        }
        
        // Clear previous error
        this.clearError();
        
        // Focus appropriate input
        if (mode === 'type' && this.typeInput) {
            setTimeout(() => this.typeInput.focus(), 100);
        }
    },
    
    parseTimeInput(input) {
        // Accept formats: "1430", "14:30", "14.30"
        const normalized = input.trim().replace(/\./g, ':');
        
        // Remove leading/trailing separators
        const cleaned = normalized.replace(/^[:]+|[:]+$/g, '');
        
        // Check if it's HH:MM format
        if (cleaned.includes(':')) {
            const parts = cleaned.split(':');
            if (parts.length === 2) {
                const hours = parseInt(parts[0], 10);
                const minutes = parseInt(parts[1], 10);
                
                if (!isNaN(hours) && !isNaN(minutes)) {
                    return { 
                        hours: hours, 
                        minutes: minutes,
                        isValid: hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59,
                        formatted: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
                    };
                }
            }
        } else {
            // Check if it's HHMM format (4 or 3 digits)
            const digits = cleaned.replace(/\D/g, '');
            if (digits.length === 4) {
                const hours = parseInt(digits.substring(0, 2), 10);
                const minutes = parseInt(digits.substring(2, 4), 10);
                
                if (!isNaN(hours) && !isNaN(minutes)) {
                    return {
                        hours: hours,
                        minutes: minutes,
                        isValid: hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59,
                        formatted: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
                    };
                }
            } else if (digits.length === 3) {
                // e.g., "930" -> 09:30
                const hours = parseInt(digits.substring(0, 1), 10);
                const minutes = parseInt(digits.substring(1, 3), 10);
                
                if (!isNaN(hours) && !isNaN(minutes)) {
                    return {
                        hours: hours,
                        minutes: minutes,
                        isValid: hours >= 0 && hours <= 9 && minutes >= 0 && minutes <= 59,
                        formatted: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
                    };
                }
            }
        }
        
        return null;
    },
    
    validateAndApply(input) {
        const errorEl = document.getElementById('timeTypeError');
        
        if (!input || input.trim() === '') {
            this.clearError();
            return false;
        }
        
        const parsed = this.parseTimeInput(input);
        
        if (!parsed) {
            this.showError(errorEl, 'Format invalid');
            return false;
        }
        
        if (!parsed.isValid) {
            let errorMsg = 'Invalid time';
            if (parsed.hours > 23) {
                errorMsg = 'Ore: 0-23';
            } else if (parsed.minutes > 59) {
                errorMsg = 'Minute: 0-59';
            }
            this.showError(errorEl, errorMsg);
            return false;
        }
        
        // Valid time - clear error and update pickers
        this.clearError();
        this.selectHour(parsed.hours);
        this.selectMinute(parsed.minutes);
        
        // Update input to show formatted time
        if (this.typeInput) {
            this.typeInput.value = parsed.formatted;
        }
        
        return true;
    },
    
    showError(errorEl, message) {
        if (errorEl) {
            errorEl.textContent = message;
            if (this.typeInput) {
                this.typeInput.classList.add('error');
                // Trigger shake animation by removing and re-adding class
                this.typeInput.offsetHeight; // Force reflow
            }
        }
    },
    
    clearError() {
        const errorEl = document.getElementById('timeTypeError');
        if (errorEl) {
            errorEl.textContent = '';
        }
        if (this.typeInput) {
            this.typeInput.classList.remove('error');
        }
    },
    
    lockScroll() {
        // Store current scroll position
        this.scrollLockY = window.scrollY || document.documentElement.scrollTop;
        
        // Add modal-open class to body
        document.body.classList.add('modal-open');
        
        // Set top style to lock scroll position
        document.body.style.top = `-${this.scrollLockY}px`;
    },
    
    unlockScroll() {
        // Remove modal-open class
        document.body.classList.remove('modal-open');
        
        // Clear inline styles
        document.body.style.top = '';
        
        // Restore scroll position
        if (this.scrollLockY) {
            window.scrollTo(0, this.scrollLockY);
        }
    },
    
    preventBackdropScroll(e) {
        // Allow scrolling inside modal content, prevent on backdrop
        const backdrop = this.overlay?.querySelector('.time-picker-backdrop');
        if (e.target === backdrop || backdrop?.contains(e.target)) {
            if (e.touches && e.touches.length > 0) {
                e.preventDefault();
            }
        }
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
        
        // Lock background scroll
        this.lockScroll();
        
        // Ensure overlay is in DOM and ready for animation
        if (this.overlay.style.display === 'none') {
            this.overlay.style.display = 'flex';
        }
        
        // Trigger animation on next frame to ensure CSS is computed
        requestAnimationFrame(() => {
            this.overlay.classList.add('is-open');
        });
        
        // Set initial mode and display
        this.setMode(this.currentMode);
        
        // Initialize type input with current time
        if (this.typeInput && this.selectedHour !== null && this.selectedMinute !== null) {
            const timeStr = `${this.selectedHour.toString().padStart(2, '0')}:${this.selectedMinute.toString().padStart(2, '0')}`;
            this.typeInput.value = timeStr;
        }
    },
    
    close() {
        // Remove animation class to trigger close animation
        this.overlay.classList.remove('is-open');
        
        // Wait for animation to complete before hiding
        const panel = this.overlay.querySelector('.time-picker-panel');
        const onAnimationEnd = () => {
            this.overlay.style.display = 'none';
            if (panel) {
                panel.removeEventListener('transitionend', onAnimationEnd);
            }
        };
        
        // Set a timeout as fallback in case transitionend doesn't fire (400ms covers both animations)
        const timeout = setTimeout(() => {
            if (this.overlay.style.display !== 'none') {
                onAnimationEnd();
            }
        }, 400);
        
        // Listen for transitionend on panel (has longer animation)
        if (panel) {
            panel.addEventListener('transitionend', () => {
                clearTimeout(timeout);
                onAnimationEnd();
            }, { once: true });
        }
        
        // Unlock background scroll
        this.unlockScroll();
    },
    
    confirm() {
        // Use Type mode value if active
        if (this.currentMode === 'type' && this.typeInput) {
            const input = this.typeInput.value;
            if (input && this.validateAndApply(input)) {
                // Time was validated and pickers were updated
                if (this.selectedHour !== null && this.selectedMinute !== null) {
                    const timeStr = `${this.selectedHour.toString().padStart(2, '0')}:${this.selectedMinute.toString().padStart(2, '0')}`;
                    this.input.value = timeStr;
                    this.hiddenInput.value = timeStr;
                    this.close();
                }
            }
        } else if (this.selectedHour !== null && this.selectedMinute !== null) {
            // Use Picker mode values
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
        
        // Update Type mode input
        if (this.typeInput) {
            const timeStr = `${now.getHours().toString().padStart(2, '0')}:${this.roundToNearest5(now.getMinutes()).toString().padStart(2, '0')}`;
            this.typeInput.value = timeStr;
            this.clearError();
        }
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
            
            // Prevent scroll/touch on backdrop (non-passive to allow preventDefault)
            backdrop.addEventListener('touchmove', (e) => {
                // Allow default scrolling on modal content, prevent on pure backdrop
                if (!e.target.closest('.time-picker-panel')) {
                    e.preventDefault();
                }
            }, { passive: false });
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
        
        // Mode toggle buttons
        const modeButtons = this.overlay.querySelectorAll('.time-mode-btn');
        modeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.target.dataset.mode;
                if (mode) {
                    this.setMode(mode);
                }
            });
        });
        
        // Type Mode input events
        if (this.typeInput) {
            this.typeInput.addEventListener('input', (e) => {
                if (e.target.value) {
                    this.validateAndApply(e.target.value);
                }
            });
            
            this.typeInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.confirm();
                }
            });
        }
        
        // Quick input (deprecated but kept for compatibility)
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
    const activeTabBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeTabBtn) {
        activeTabBtn.classList.add('active');
        
        // Scroll active tab into view (mobile-friendly)
        setTimeout(() => {
            activeTabBtn.scrollIntoView({ 
                behavior: 'smooth', 
                inline: 'center', 
                block: 'nearest' 
            });
        }, 50);
    }
    
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

    if (tabName === 'accounting') {
        renderAccountingView();
    }
    
    console.log(`📑 Switched to tab: ${tabName}`);
}

// ==========================================
// APPOINTMENTS MANAGEMENT
// ==========================================

// Subscribe to appointments real-time updates
function subscribeToAppointments() {
    if (!currentUser) {
        console.error('❌ subscribeToAppointments: No user authenticated - Firestore will deny access');
        return;
    }
    
    if (!db) {
        console.error('❌ subscribeToAppointments: db not initialized - Firestore not ready');
        return;
    }
    
    console.log('✅ subscribeToAppointments: Auth ready, user:', currentUser.email, 'UID:', currentUser.uid);
    
    import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js')
                .then(({ collection, query, orderBy, onSnapshot }) => {
                    // CRITICAL FIX: Unsubscribe previous listener if it exists to prevent duplicate listeners
                    if (appointmentsUnsubscribe) {
                        console.log('🧹 [Firestore] Unsubscribing from previous appointments listener...');
                        appointmentsUnsubscribe();
                        appointmentsUnsubscribe = null;
                        firebaseListenerCount = 0;
                    }
                    
                    console.log('📥 [Firestore] Setting up real-time listener on appointments collection...');
                    
                    const q = query(collection(db, 'appointments'), orderBy('startAt', 'asc'));
                    
                    console.log('🔐 [Firestore] onSnapshot listener attached. Current user:', currentUser?.email);
                    firebaseListenerCount = 1;
                    
                    appointmentsUnsubscribe = onSnapshot(q, (snapshot) => {
                        console.log('📊 [Firestore] Real-time update received:', snapshot.docs.length, 'appointments');
                        
                        appointments = snapshot.docs.map(doc => normalizeAppointmentMileage(ensureScheduledFields({
                            id: doc.id,
                            ...doc.data()
                        })));
                        
                        console.log(`✅ [Firestore] Appointments loaded: ${appointments.length}`);
                        
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
    
    // Detect auto-save vs manual save
    const isAutoSave = e.isAutoSave === true;
    
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
    const mileageValue = document.getElementById('mileage').value.trim();
    const serviceLocation = document.getElementById('serviceLocation').value;
    const dateStr = document.getElementById('appointmentDate').value;
    const time = document.getElementById('appointmentTimeValue').value;
    const jobs = collectJobsFromUI();
    const parts = collectPartsFromUI();
    const notes = collectNotesFromUI();
    const totals = collectTotalsFromUI(jobs, parts);
    const services = jobs.map(item => ({
        description: item.description,
        qty: item.qty,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal
    }));
    const legacyParts = parts.map(item => ({
        description: item.description,
        qty: item.qty,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal
    }));

    console.log('[SAVE] jobs', jobs);
    console.log('[SAVE] parts', parts);
    console.log('[SAVE] notes', notes);
    console.log('[SAVE] totals', totals);
    
    // Soft warnings for missing important fields (NON-BLOCKING)
    const missingFields = [];
    if (!customerName) missingFields.push('Name');
    if (!customerPhone) missingFields.push('Phone');
    if (!registrationPlate) missingFields.push('Registration Plate');
    if (!dateStr) missingFields.push('Date');
    if (!time) missingFields.push('Time');
    if (!serviceLocation) missingFields.push('Service Location');
    if (!contactPref) missingFields.push('Contact Preference');
    
    if (missingFields.length > 0 || (jobs.length === 0 && parts.length === 0)) {
        let warningMsg = '⚠️ Some details are missing. You can still save and edit later.';
        if (missingFields.length > 0) {
            warningMsg = `⚠️ Missing: ${missingFields.join(', ')}. You can still save and edit later.`;
        } else if (jobs.length === 0 && parts.length === 0) {
            warningMsg = '⚠️ No jobs or parts added. You can still save and edit later.';
        }
        showNotification(warningMsg, 'info');
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
    
    // Validate time format only if time is provided
    if (time && !/^\d{2}:\d{2}$/.test(time)) {
        showNotification('⚠️ Format oră invalid', 'error');
        return;
    }
    
    try {
        const { collection, addDoc, serverTimestamp, Timestamp, doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        console.log('🔐 [Firestore] User ready for operation:', currentUser?.uid, 'Firestore db ready:', !!db);
        
        // Crează obiect de dată cu oră (with safe defaults)
        let scheduledTimestamp;
        if (dateStr && time) {
            const [year, month, day] = dateStr.split('-').map(Number);
            const [hours, minutes] = time.split(':').map(Number);
            const startDate = new Date(year, month - 1, day, hours, minutes, 0);
            scheduledTimestamp = Timestamp.fromDate(startDate);
        } else if (dateStr) {
            // Date but no time - use midnight
            const [year, month, day] = dateStr.split('-').map(Number);
            const startDate = new Date(year, month - 1, day, 0, 0, 0);
            scheduledTimestamp = Timestamp.fromDate(startDate);
        } else {
            // No date/time - use current timestamp
            scheduledTimestamp = Timestamp.fromDate(new Date());
        }
        
        // Build payload with safe defaults for all fields
        // STEP 2: Convert jobs/parts to proper schema with qty, unitPrice, total
        const normalizedJobs = jobs.map(item => {
            const name = (item.name || item.description || '').trim();
            const qty = parseInt(item.qty, 10) || 1;
            const unitPrice = parseFloat(item.unitPrice) || 0;
            const total = qty * unitPrice;
            return name ? { name, qty, unitPrice, total } : null;
        }).filter(Boolean);
        
        const normalizedParts = parts.map(item => {
            const name = (item.name || item.description || '').trim();
            const qty = parseInt(item.qty, 10) || 1;
            const unitPrice = parseFloat(item.unitPrice) || 0;
            const total = qty * unitPrice;
            return name ? { name, qty, unitPrice, total } : null;
        }).filter(Boolean);
        
        const jobsSummary = buildJobsSummary(services, legacyParts);

        const existingAppointment = editingAppointmentId
            ? appointments.find(apt => apt.id === editingAppointmentId)
            : null;
        const paidAmount = toNumber(existingAppointment?.paidAmount || 0);
        const balanceDue = Math.max(0, totals.total - paidAmount);
        const paymentStatus = (paidAmount > 0 && paidAmount >= totals.total) ? 'PAID' : 'UNPAID';
        const status = existingAppointment?.status || 'scheduled';

        const basePayload = {
            // Client info with safe defaults
            customerName: customerName || '',
            customerPhone: customerPhone || '',
            contactPref: contactPref || '',
            
            // Registration plate with safe default
            registrationPlate: registrationPlate || '',
            regNumber: registrationPlate || '', // Legacy compatibility
            
            // Location with safe default
            serviceLocation: serviceLocation || '',
            
            // STEP 1: Jobs & Parts arrays with proper schema
            jobs: normalizedJobs,
            parts: normalizedParts,
            notes: notes || '',
            totals: {
                labour: totals.labour,
                parts: totals.parts,
                subtotal: totals.subtotal,
                total: totals.total
            },
            paidAmount,
            balanceDue,
            paymentStatus,
            status,
            
            // Legacy compatibility fields
            jobsSummary,
            problemDescription: jobsSummary,
            
            // Timestamps with safe defaults
            time: time || '',
            dateStr: dateStr || '',
            startAt: scheduledTimestamp, // legacy compatibility
            scheduledDateTime: scheduledTimestamp,
            updatedAt: serverTimestamp()
        };
        
        // Add optional fields only if they have values
        if (vehicleMakeModel) {
            basePayload.vehicleMakeModel = vehicleMakeModel;
            basePayload.makeModel = vehicleMakeModel; // Legacy compatibility
            basePayload.vehicle = vehicleMakeModel + ' • ' + registrationPlate; // Compatibility field
            basePayload.car = vehicleMakeModel + ', ' + registrationPlate; // Legacy
        }
        
        if (address) {
            basePayload.address = address;
        }
        
        if (postcode) {
            basePayload.postcode = postcode;
        }

        // Add mileage if provided (safe default: null)
        // Use raw numeric value from dataset, not the formatted display value
        const rawMileage = Number(document.querySelector('#mileage')?.dataset.rawMileage || 0);
        basePayload.mileage = rawMileage > 0 ? rawMileage : null;

        // Determine if we're in create or edit mode
        console.log('[SAVE] payload:', basePayload);

        if (!editingAppointmentId) {
            // CREATE MODE - add new appointment
            console.log('📝 Creating new appointment...');
            
            basePayload.status = 'scheduled';
            basePayload.originalDateTime = scheduledTimestamp;
            basePayload.createdAt = serverTimestamp();
            basePayload.createdBy = currentUser.uid;
            
            const docRef = await addDoc(collection(db, 'appointments'), basePayload);
            
            console.log(`✅ [Firestore] Appointment created with ID: ${docRef.id}`);

            await syncInvoiceFromAppointmentPayload(docRef.id, basePayload);
            
            if (!isAutoSave) {
                showNotification('✅ Programare adăugată cu succes!', 'success');
                showToast('Programare adăugată cu succes!', 'success');
            }
        } else {
            // EDIT MODE - update existing appointment
            console.log(`📝 Updating appointment ${editingAppointmentId}...`);
            
            // Do NOT include createdAt or createdBy in updates
            await updateDoc(doc(db, 'appointments', editingAppointmentId), basePayload);
            
            console.log(`✅ [Firestore] Appointment ${editingAppointmentId} updated`);
            
            await syncInvoiceFromAppointmentPayload(editingAppointmentId, basePayload);
            
            if (isAutoSave) {
                // Subtle notification for auto-save
                console.log('💾 Auto-saved successfully');
            } else {
                showNotification('✅ Programare actualizată cu succes!', 'success');
                showToast('Programare actualizată cu succes!', 'success');
            }
        }
        
        // Reset form only for manual saves (not auto-saves)
        if (!isAutoSave) {
            e.target.reset();
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('appointmentDate').value = today;
            document.getElementById('appointmentTime').value = '';
            document.getElementById('appointmentTimeValue').value = '';
            document.getElementById('mileage').value = '';

            renderJobRows([]);
            renderPartRows([]);
            updateAppointmentTotals();
            
            // Reset location sections
            document.getElementById('serviceLocation').value = '';
            const garageSection = document.getElementById('garageAddressSection');
            const clientSection = document.getElementById('clientAddressSection');
            if (garageSection) garageSection.style.display = 'none';
            if (clientSection) clientSection.removeAttribute('open');

            const jobsContainer = document.getElementById('jobsContainer');
            const partsContainer = document.getElementById('partsContainer');
            if (jobsContainer) jobsContainer.innerHTML = '';
            if (partsContainer) partsContainer.innerHTML = '';
            
            // Reset editing state
            editingAppointmentId = null;
            
            // Clear chips
            const jobsChips = document.getElementById('jobsChips');
            const partsChips = document.getElementById('partsChips');
            if (jobsChips) jobsChips.innerHTML = '';
            if (partsChips) partsChips.innerHTML = '';
            
            // Update UI
            const submitBtn = document.getElementById('submitAppointmentBtn');
            const submitBtnText = document.getElementById('submitAppointmentBtnText');
            if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-plus"></i> <span id="submitAppointmentBtnText">Save Appointment</span>';
            if (submitBtnText) submitBtnText.textContent = 'Save Appointment';
            
            addJobRow();
            updateAppointmentTotals();
            
            // Reset edit mode
            exitEditMode();
            
            // Highlight and scroll to new/edited appointment
            setTimeout(() => {
                const targetId = editingAppointmentId || (e.target.lastInsertRowid);
                if (targetId && targetId !== '') {
                    highlightAndScrollToAppointment(targetId);
                }
            }, 300);
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        const mode = editingAppointmentId ? 'actualizării' : 'adăugării';
        showNotification(`❌ Eroare la ${mode} programării: ${error.message}`, 'error');
        showToast(`Eroare la ${mode} programării`, 'error');
    }
}

// ==========================================
// INVOICE SYNC HELPERS
// ==========================================

/**
 * Calculate subtotal from jobs and parts arrays
 */
function calculateSubtotal(jobs = [], parts = []) {
    let total = 0;

    if (Array.isArray(jobs)) {
        jobs.forEach(j => {
            if (j && j.total !== undefined) {
                total += toNumber(j.total);
            } else if (j && j.lineTotal) {
                total += toNumber(j.lineTotal);
            } else if (j && j.qty && (j.unitPrice || j.price)) {
                total += toNumber(j.qty) * toNumber(j.unitPrice ?? j.price);
            }
        });
    }

    if (Array.isArray(parts)) {
        parts.forEach(p => {
            if (p && p.total !== undefined) {
                total += toNumber(p.total);
            } else if (p && p.lineTotal) {
                total += toNumber(p.lineTotal);
            } else if (p && p.qty && (p.unitPrice || p.price)) {
                total += toNumber(p.qty) * toNumber(p.unitPrice ?? p.price);
            }
        });
    }

    return total;
}

/**
 * Sync invoice with updated appointment data
 * STEP 5: When appointment is edited, update linked invoice with new jobs/parts/totals
 * Only updates jobs/parts and related fields, preserves payment info
 */
async function syncInvoiceWithAppointment(invoiceId, appointmentData, appointmentId = null) {
    try {
        const { doc, getDoc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const invoiceRef = doc(db, 'invoices', invoiceId);
        const snap = await getDoc(invoiceRef);
        
        if (!snap.exists()) {
            console.warn('[InvoiceSync] Invoice not found:', invoiceId);
            return;
        }

        const invoice = snap.data();
        
        // Use new schema: jobs[] and parts[] from appointmentData
        const jobs = appointmentData.jobs || [];
        const parts = appointmentData.parts || [];

        const normalizeItems = (items) => items.map(item => {
            const name = (item.name || item.description || '').trim();
            const qty = parseInt(item.qty, 10) || 1;
            const unitPrice = parseFloat(item.unitPrice ?? item.price ?? 0) || 0;
            const total = parseFloat(item.total) || (qty * unitPrice);
            return name ? { name, qty, unitPrice, total } : null;
        }).filter(Boolean);

        const normalizedJobs = normalizeItems(jobs);
        const normalizedParts = normalizeItems(parts);
        
        // Recalculate totals from new schema (name, qty, price)
        const labourTotal = normalizedJobs.reduce((sum, item) => sum + (item.total || (item.qty * item.unitPrice)), 0);
        const partsTotal = normalizedParts.reduce((sum, item) => sum + (item.total || (item.qty * item.unitPrice)), 0);
        const newSubtotal = labourTotal + partsTotal;
        const newTotal = newSubtotal; // VAT logic would go here if needed
        
        const amountPaid = toNumber(appointmentData.paidAmount ?? invoice.paidAmount ?? invoice.totals?.paidAmount ?? 0);
        const newBalance = Math.max(0, newTotal - amountPaid);
        const paymentStatus = (amountPaid > 0 && amountPaid >= newTotal) ? 'PAID' : 'UNPAID';
        
        // Update invoice with appointment changes
        // Preserve: amountPaid, paymentStatus, paidAt, invoiceNumber
        await updateDoc(invoiceRef, {
            appointmentId: appointmentId || invoice.appointmentId || null,
            // Store jobs/parts in new schema for invoice
            jobs: normalizedJobs,
            parts: normalizedParts,
            // Vehicle info
            makeModel: appointmentData.makeModel || appointmentData.vehicleMakeModel || '',
            vehicleMakeModel: appointmentData.makeModel || appointmentData.vehicleMakeModel || '',
            registrationPlate: appointmentData.registrationPlate || '',
            regPlate: appointmentData.registrationPlate || '',
            mileage: appointmentData.mileage || null,
            // Customer info
            customerName: appointmentData.customerName || '',
            phone: appointmentData.customerPhone || '',
            address: appointmentData.address || '',
            // Notes
            notes: appointmentData.notes || '',
            jobsSummary: appointmentData.jobsSummary || appointmentData.problemDescription || '',
            // Totals
            totals: {
                labour: labourTotal,
                parts: partsTotal,
                subtotal: newSubtotal,
                total: newTotal
            },
            paidAmount: amountPaid,
            balanceDue: newBalance,
            paymentStatus,
            updatedAt: serverTimestamp()
        });
        
        console.log('[InvoiceSync] ✅ Invoice updated:', invoiceId, '| New total:', newTotal, '| Jobs:', normalizedJobs.length, '| Parts:', normalizedParts.length);
    } catch (error) {
        console.error('[InvoiceSync] Error:', error);
        throw error;
    }
}

async function syncInvoiceFromAppointmentPayload(appointmentId, appointmentData) {
    if (!appointmentId) return;

    try {
        const { collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        const invoicesQuery = query(
            collection(db, 'invoices'),
            where('appointmentId', '==', appointmentId)
        );

        const snap = await getDocs(invoicesQuery);
        if (!snap.empty) {
            const invoices = snap.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
            }));
            const newest = invoices.sort((a, b) => {
                const aTime = a.createdAt?.toMillis?.() || new Date(a.createdAt || 0).getTime();
                const bTime = b.createdAt?.toMillis?.() || new Date(b.createdAt || 0).getTime();
                return bTime - aTime;
            })[0];
            await syncInvoiceWithAppointment(newest.id, appointmentData, appointmentId);
            await dedupeInvoicesForAppointment(appointmentId, newest.id);
            console.log('Found invoice:', newest.id);
            return;
        }

        if (appointmentData.status === 'finalized') {
            const invoiceId = await getOrCreateInvoiceForAppointment(appointmentId, appointmentData);
            await syncInvoiceWithAppointment(invoiceId, appointmentData, appointmentId);
            console.log('Found invoice:', invoiceId);
        }
    } catch (error) {
        console.warn('[Invoice Sync] Warning:', error.message || error);
    }
}

// ==========================================
// EDIT MODE HELPERS
// ==========================================
function enterEditMode(appointment) {
    editingAppointmentId = appointment.id;
    
    // Show edit banner
    const banner = document.getElementById('editModeBanner');
    const bannerText = document.getElementById('editingAppointmentText');
    if (banner) {
        bannerText.textContent = `Editing appointment: ${appointment.customerName || ''} (${appointment.registrationPlate || appointment.regNumber || ''})`;
        banner.style.display = 'block';
    }
    
    // Change button label
    const btnText = document.getElementById('submitAppointmentBtnText');
    if (btnText) {
        btnText.textContent = 'Update Appointment';
    }
}

function exitEditMode() {
    editingAppointmentId = null;
    
    // Hide edit banner
    const banner = document.getElementById('editModeBanner');
    if (banner) {
        banner.style.display = 'none';
    }
    
    // Restore button label
    const btnText = document.getElementById('submitAppointmentBtnText');
    if (btnText) {
        btnText.textContent = 'Save Appointment';
    }
}

function populateFormFromAppointment(appointment) {
    if (!appointment) return;
    
    console.log('[EDIT] Populating form with appointment data:', appointment.id);
    console.log('[EDIT] Appointment fields:', {
        customerName: appointment.customerName,
        phone: appointment.customerPhone || appointment.phone,
        makeModel: appointment.makeModel || appointment.vehicleMakeModel,
        regNumber: appointment.registrationPlate || appointment.regNumber,
        date: appointment.dateStr,
        time: appointment.time,
        jobs: appointment.jobs?.length || 0,
        parts: appointment.parts?.length || 0
    });

    // Client info
    document.getElementById('customerName').value = appointment.customerName || '';
    document.getElementById('customerPhone').value = appointment.customerPhone || appointment.phone || '';
    document.getElementById('contactPref').value = appointment.contactPref || '';
    
    // Vehicle info - Direct field mapping (no parsing)
    document.getElementById('makeModel').value = appointment.makeModel || appointment.vehicleMakeModel || '';
    document.getElementById('regNumber').value = appointment.registrationPlate || appointment.regNumber || '';
    document.getElementById('mileage').value = coalesceMileageValue(appointment) || '';
    
    // Refresh vehicle input formatting (formats mileage with commas, registration plate with spaces)
    if (typeof refreshVehicleFormatting === 'function') {
      refreshVehicleFormatting();
    }
    
    // Service details
    document.getElementById('appointmentDate').value = appointment.dateStr || '';
    // CRITICAL FIX: Set both hidden value AND display field for time
    const timeValue = appointment.time || '';
    document.getElementById('appointmentTimeValue').value = timeValue;
    document.getElementById('appointmentTime').value = timeValue; // Display field
    
    document.getElementById('serviceLocation').value = appointment.serviceLocation || '';
    
    // Location address
    const garageSection = document.getElementById('garageAddressSection');
    const clientSection = document.getElementById('clientAddressSection');
    if (appointment.serviceLocation === 'garage' && garageSection) {
        garageSection.style.display = 'block';
        if (clientSection) clientSection.style.display = 'none';
    } else if (appointment.serviceLocation === 'client' && clientSection) {
        clientSection.style.display = 'block';
        if (garageSection) garageSection.style.display = 'none';
        document.getElementById('address').value = appointment.address || '';
        document.getElementById('postcode').value = appointment.postcode || '';
    } else {
        if (garageSection) garageSection.style.display = 'none';
        if (clientSection) clientSection.style.display = 'none';
    }
    
    // Jobs and Parts - Populate chips for edit mode
    let editJobs = Array.isArray(appointment.jobs) ? appointment.jobs : [];
    let editParts = Array.isArray(appointment.parts) ? appointment.parts : [];

    console.log('[EDIT] Initial jobs/parts:', { jobs: editJobs.length, parts: editParts.length });

    // Legacy fallback if new schema is empty
    if (editJobs.length === 0 && Array.isArray(appointment.services)) {
        console.log('[EDIT] Using legacy services field for jobs');
        editJobs = appointment.services;
    }

    if (editJobs.length === 0 && editParts.length === 0 && Array.isArray(appointment.jobs)) {
        console.log('[EDIT] Filtering jobs by type');
        editJobs = appointment.jobs.filter(item => item?.type === 'labour');
        editParts = appointment.jobs.filter(item => item?.type === 'part');
    }

    console.log('[EDIT] Final jobs/parts to populate:', { jobs: editJobs.length, parts: editParts.length });

    // Use chips mode populate function (async import)
    import('./src/core/chips-mode.js').then(({ populateChipsFromData }) => {
        populateChipsFromData(editJobs, editParts);
        console.log('[EDIT] Chips populated via chips-mode.js');
    }).catch(err => {
        console.error('[EDIT] Failed to import chips-mode:', err);
        // Fallback to legacy row rendering
        const jobsForRows = editJobs.map(item => ({
            description: item.name || item.description || '',
            qty: parseInt(item.qty, 10) || 1,
            unitPrice: parseFloat(item.unitPrice ?? item.price ?? 0) || 0
        }));
        const partsForRows = editParts.map(item => ({
            description: item.name || item.description || '',
            qty: parseInt(item.qty, 10) || 1,
            unitPrice: parseFloat(item.unitPrice ?? item.price ?? 0) || 0
        }));
        renderJobRows(jobsForRows);
        renderPartRows(partsForRows);
    });
    
    // Notes
    document.getElementById('notes').value = appointment.notes || '';
    
    console.log('[EDIT] Form population complete. Updating totals...');
    // Note: updateAppointmentTotals will be called by populateChipsFromData
    setTimeout(() => updateAppointmentTotals(), 100); // Ensure totals update after chips load
}

// ==========================================
// UTILITY: Parse vehicle input string
// ==========================================

function parseVehicleInput(inputString) {
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

// Utility: Validate individual field (supports id or element)
function validateField(inputOrId, showError = true) {
    const field = typeof inputOrId === 'string'
        ? document.getElementById(inputOrId)
        : inputOrId;
    if (!field) return true;
    
    // Find parent .tvField container
    const tvField = field.closest('.tvField');
    
    // Legacy error element (fallback)
    const fieldId = field.id || '';
    const errorEl = fieldId ? document.getElementById(fieldId + '-error') : null;
    
    let isValid = true;
    let errorMsg = '';
    
    const value = field.value.trim();
    
    const isRequired = field.hasAttribute('required') || field.classList.contains('tv-required');

    // Check if required and empty
    if (isRequired && !value) {
        isValid = false;
        errorMsg = 'Câmp obligatoriu';
    } else if (fieldId === 'regNumber' && value && value.length < 6) {
        isValid = false;
        errorMsg = 'Înmatriculare invalidă';
    } else if (fieldId === 'editPhone' && value && !validatePhoneNumber(value)) {
        isValid = false;
        errorMsg = 'Telefon invalid';
    }
    
    // Apply design system error state
    if (showError) {
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
    }
    
    // Legacy error display (fallback for old markup)
    if (showError && errorEl) {
        if (!isValid) {
            errorEl.textContent = errorMsg;
            field.classList.add('error');
        } else {
            errorEl.textContent = '';
            field.classList.remove('error');
        }
    }

    // Edit modal error display (inline message)
    if (showError && !tvField) {
        const errorMsgEl = field.nextElementSibling;
        if (errorMsgEl && errorMsgEl.classList.contains('tvEditErrorMsg')) {
            errorMsgEl.style.display = isValid ? 'none' : 'block';
        }
        field.classList.toggle('error', !isValid);
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
        showNotification(t('msgAppointmentCanceled'), 'info');
        
    } catch (error) {
        console.error('❌ Error canceling appointment:', error);
        showNotification('❌ Eroare la anulare: ' + error.message, 'error');
    }
}

// Time helpers (scheduledDateTime = canonical)
function getScheduledTimestamp(apt) {
    return apt?.scheduledDateTime || apt?.startAt || null;
}

function getScheduledDate(apt) {
    const ts = getScheduledTimestamp(apt);
    if (ts?.toDate) return ts.toDate();
    if (apt?.dateStr && apt?.time) return new Date(`${apt.dateStr}T${apt.time}`);
    if (apt?.dateStr) return new Date(apt.dateStr);
    return null;
}

function getOriginalDate(apt) {
    const ts = apt?.originalDateTime;
    if (ts?.toDate) return ts.toDate();
    return null;
}

function formatISODate(date) {
    return date ? date.toISOString().split('T')[0] : '';
}

function formatHHMM(date) {
    if (!date) return '';
    return date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function isSameDay(d1, d2) {
    return d1 && d2 && d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function ensureScheduledFields(apt) {
    if (!apt) return apt;
    const scheduled = apt.scheduledDateTime || apt.startAt;
    if (scheduled) {
        apt.scheduledDateTime = scheduled;
        apt.startAt = scheduled;
    }
    const scheduledDate = getScheduledDate(apt);
    if (scheduledDate) {
        if (!apt.dateStr) apt.dateStr = formatISODate(scheduledDate);
        if (!apt.time) apt.time = formatHHMM(scheduledDate);
    }
    return apt;
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
    let services = Array.isArray(apt.services) ? apt.services : [];
    let parts = Array.isArray(apt.parts) ? apt.parts : [];
    if (services.length === 0 && parts.length === 0 && Array.isArray(apt.jobs)) {
        services = apt.jobs.filter(item => item?.type === 'labour');
        parts = apt.jobs.filter(item => item?.type === 'part');
    }
    const problemDescription = ((apt.problemDescription || apt.problem || '').trim());
    const jobsSummary = (apt.jobsSummary || '').trim() || buildJobsSummary(services, parts) || problemDescription;
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
        problemDescription: jobsSummary,
        services,
        parts,
        jobsSummary,
        notes,
        status
    };
}

// ============================================================
// WORKFLOW MODE HELPERS
// ============================================================

function isTodayAppointmentPaid(apt) {
    const paymentStatus = (apt.paymentStatus || '').toLowerCase();
    if (paymentStatus === 'paid') return true;
    
    const total = toNumber(apt.total || 0);
    const amountPaid = toNumber(apt.amountPaid || apt.paidAmount || 0);
    const balanceDue = Math.max(0, total - amountPaid);
    
    return total > 0 && amountPaid > 0 && balanceDue <= 0;
}

// Helper: Check if appointment is today
function isTodayAppointment(apt) {
    const aptDate = getScheduledDate(apt);
    const today = new Date();
    return aptDate && isSameDay(aptDate, today);
}

// Helper: Check if appointment is in the past (before today)
function isPastAppointment(apt) {
    const aptDate = getScheduledDate(apt);
    if (!aptDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const aptAtMidnight = new Date(aptDate);
    aptAtMidnight.setHours(0, 0, 0, 0);
    return aptAtMidnight < today;
}

// Helper: Get month key for grouping (YYYY-MM)
function monthKey(date) {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

// Helper: Format month key to display (e.g. "February 2026")
function formatMonthYear(monthStr) {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    const monthObj = new Date(year, parseInt(month, 10) - 1, 1);
    return monthObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatDateShort(date) {
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    return `${day} ${month}`;
}

function formatTimeShort(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// Filter appointments (search only + show only scheduled/upcoming)
function filterAppointments() {
    const searchTerm = document.getElementById('searchAppointments')?.value.toLowerCase() || '';
    
    // Show only SCHEDULED appointments (exclude finalized)
    filteredAppointments = appointments.filter(apt => {
        // Only include scheduled appointments
        if (!isAppointmentScheduled(apt)) return false;

        // Search filter (client name, car, make/model, reg number)
        const matchesSearch = !searchTerm ||
            (apt.customerName && apt.customerName.toLowerCase().includes(searchTerm)) ||
            (apt.car && apt.car.toLowerCase().includes(searchTerm)) ||
            (apt.makeModel && apt.makeModel.toLowerCase().includes(searchTerm)) ||
            (apt.regNumber && apt.regNumber.toLowerCase().includes(searchTerm));
        
        return matchesSearch;
    });
    
    // Sort by scheduled datetime (nearest first)
    filteredAppointments.sort((a, b) => {
        const aDate = getScheduledDate(a) || new Date(a.dateStr || 0);
        const bDate = getScheduledDate(b) || new Date(b.dateStr || 0);
        return aDate - bDate;
    });
    
    renderAppointments();
}

// Render appointments grouped by day
// Render appointments with premium Active Workflow Mode
// Today Active (unpaid) → Completed Today (paid, collapsed) → History by month
function renderAppointments() {
    renderAppointmentsCallCount++;
    console.log(`📊 [DIAG] renderAppointments called (${renderAppointmentsCallCount} times), Active Firestore listener: ${!!appointmentsUnsubscribe}`);
    
    const container = document.getElementById('appointmentsList');
    const emptyState = document.getElementById('emptyStateAppointments');

    if (!filteredAppointments || filteredAppointments.length === 0) {
        container.innerHTML = '';
        if (emptyState) {
            emptyState.querySelector('h3').textContent = t('msgNoAppointmentsScheduled');
            emptyState.style.display = 'block';
        }
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    
    // Separate appointments into today and historical
    const todayAll = filteredAppointments.filter(apt => isTodayAppointment(apt));
    const historical = filteredAppointments.filter(apt => isPastAppointment(apt));
    
    // Split today into active vs completed
    const todayActive = todayAll.filter(apt => !isTodayAppointmentPaid(apt));
    const todayCompleted = todayAll.filter(apt => isTodayAppointmentPaid(apt));
    
    // Sort today appointments by time
    todayActive.sort((a, b) => {
        const aDate = getScheduledDate(a) || new Date(a.dateStr || 0);
        const bDate = getScheduledDate(b) || new Date(b.dateStr || 0);
        return aDate - bDate;
    });
    
    todayCompleted.sort((a, b) => {
        const aDate = getScheduledDate(a) || new Date(a.dateStr || 0);
        const bDate = getScheduledDate(b) || new Date(b.dateStr || 0);
        return aDate - bDate;
    });
    
    // Group historical by month
    const historicalByMonth = {};
    historical.forEach(apt => {
        const aptDate = getScheduledDate(apt);
        if (!aptDate) return;
        const key = monthKey(aptDate);
        if (!historicalByMonth[key]) {
            historicalByMonth[key] = [];
        }
        historicalByMonth[key].push(apt);
    });
    
    // Sort months in descending order (newest first)
    const sortedMonths = Object.keys(historicalByMonth).sort().reverse();
    
    // Build HTML
    let html = '';
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    // ===== TODAY ACTIVE SECTION (Always shown) =====
    html += `<section class="workflow-section workflow-section--today-active">
        <div class="workflow-header">
            <h3><i class="fas fa-calendar-day"></i> Today Active (${todayStr})</h3>
            <span class="workflow-count">${todayActive.length}</span>
        </div>
        <div class="appointments-grid">
            ${todayActive.map(apt => createAppointmentCard(apt, now)).join('')}
        </div>
    </section>`;
    
    // ===== COMPLETED TODAY SECTION (Collapsed if any items) =====
    if (todayCompleted.length > 0) {
        html += `<details class="workflow-section workflow-section--completed-today">
            <summary class="workflow-header workflow-header--collapsible">
                <span>
                    <i class="fas fa-check-circle"></i> Completed Today
                    <span class="workflow-count">${todayCompleted.length}</span>
                </span>
                <i class="fas fa-chevron-down"></i>
            </summary>
            <div class="workflow-content">
                <div class="appointments-grid">
                    ${todayCompleted.map(apt => createAppointmentCard(apt, now)).join('')}
                </div>
            </div>
        </details>`;
    }
    
    // ===== HISTORY SECTION (Grouped by month, collapsed) =====
    if (sortedMonths.length > 0) {
        html += `<section class="workflow-section workflow-section--history">
            <div class="workflow-header">
                <h3><i class="fas fa-history"></i> History</h3>
            </div>`;
        
        sortedMonths.forEach(monthStr => {
            const monthAppts = historicalByMonth[monthStr];
            const displayMonth = formatMonthYear(monthStr);
            
            // Sort appointments within month by date descending (newest first)
            monthAppts.sort((a, b) => {
                const aDate = getScheduledDate(a) || new Date(a.dateStr || 0);
                const bDate = getScheduledDate(b) || new Date(b.dateStr || 0);
                return bDate - aDate;
            });
            
            html += `<details class="month-accordion" open>
                <summary class="month-summary">
                    <span>${displayMonth}</span>
                    <span class="workflow-count">${monthAppts.length}</span>
                </summary>
                <div class="month-content">
                    <div class="appointments-grid">
                        ${monthAppts.map(apt => createAppointmentCard(apt, now)).join('')}
                    </div>
                </div>
            </details>`;
        });
        
        html += `</section>`;
    }
    
    container.innerHTML = html;
    
    // Keep Invoice tab selector in sync
    refreshInvoiceAppointmentOptions();

    // Bind delegation handler for appointment actions
    bindAppointmentsClickDelegation();
}

// LEGACY: Render appointments grouped by day (kept for reference, replaced by renderAppointments above)
function renderAppointmentsByDay_Legacy() {
    renderAppointmentsCallCount++;
    console.log(`📊 [DIAG] renderAppointments called (${renderAppointmentsCallCount} times), Active Firestore listener: ${!!appointmentsUnsubscribe}`);
    
    const container = document.getElementById('appointmentsList');
    const emptyState = document.getElementById('emptyStateAppointments');

    if (!filteredAppointments || filteredAppointments.length === 0) {
        container.innerHTML = '';
        if (emptyState) {
            emptyState.querySelector('h3').textContent = t('msgNoAppointmentsScheduled');
            emptyState.style.display = 'block';
        }
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    
    // Group by date
    const grouped = {};
    filteredAppointments.forEach(apt => {
        const scheduledDate = getScheduledDate(apt);
        const dateKey = scheduledDate ? formatISODate(scheduledDate) : (apt.dateStr || '');
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
                if (dateStr === todayStr) dayLabel = t('today') + ' (' + dateStr + ')';
                else if (dateStr === tomorrowStr) dayLabel = t('tomorrow') + ' (' + dateStr + ')';
                else {
                        const dayDate = new Date(dateStr + 'T00:00:00');
                        const dayName = dayDate.toLocaleDateString('ro-RO', { weekday: 'long' });
                        dayLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1) + ' (' + dateStr + ')';
                }

                // Premium SaaS grid layout (responsive)
                html += `
<section class="tvDayGroup" data-day="${dateStr}">
    <div class="tvDayHeader">${dayLabel}</div>
    <div class="appointments-grid">
`;

                grouped[dateStr].sort((a, b) => {
                    const aDate = getScheduledDate(a) || new Date(a.dateStr || 0);
                    const bDate = getScheduledDate(b) || new Date(b.dateStr || 0);
                    return aDate - bDate;
                });

                grouped[dateStr].forEach(apt => {
                        html += createAppointmentCard(apt, now);
                });

                html += `
    </div>
</section>
`;
    });
    
    container.innerHTML = html;
    
    // Keep Invoice tab selector in sync
    refreshInvoiceAppointmentOptions();

    // Bind delegation handler for appointment actions
    bindAppointmentsClickDelegation();
}

// Create appointment card HTML - PREMIUM SAAS COMPACT
function createAppointmentCard(apt) {
    const aptDate = getScheduledDate(apt) || new Date();
    const timeDiff = aptDate - new Date();
    const minutesDiff = Math.floor(timeDiff / 60000);
    
    // Normalize appointment data
    const normalized = normalizeAppointment(apt);
    
    // Check if overdue
    const isOverdue = minutesDiff < 0;
    
    // Compute payment status
    const amountPaid = toNumber(apt.amountPaid || apt.paidAmount || 0);
    const total = toNumber(apt.total || 0);
    const balance = Math.max(0, total - amountPaid);
    
    const storedStatus = (apt.paymentStatus || '').toLowerCase();
    const computedPaid = (amountPaid > 0 && amountPaid >= total);
    const isPaid = storedStatus === 'paid' || (!storedStatus && computedPaid);
    
    // Vehicle info
    const regPlate = normalized.registrationPlate || normalized.regNumber || '';
    const makeModel = normalized.vehicleMakeModel || normalized.makeModel || '';
    const vehicleDisplay = regPlate ? regPlate : makeModel;
    
    // Format date and time
    const dateStr = aptDate.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = aptDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const dateShort = formatDateShort(aptDate);
    const timeShort = formatTimeShort(aptDate);
    
    // Determine status badge
    let statusClass = '';
    let statusText = '';
    let timeStatusClass = '';
    
    if (normalized.status === 'completed' || normalized.status === 'done') {
        statusClass = 'status-completed';
        statusText = 'Completed';
        timeStatusClass = 'time-badge--completed';
    } else if (normalized.status === 'canceled') {
        statusClass = 'status-canceled';
        statusText = 'Canceled';
        timeStatusClass = 'time-badge--canceled';
    } else if (isOverdue && !isPaid) {
        // Only show Overdue if unpaid AND overdue
        statusClass = 'status-overdue';
        statusText = 'Overdue';
        timeStatusClass = 'time-badge--overdue';
    } else if (minutesDiff < 60 && minutesDiff >= 0) {
        statusClass = 'status-soon';
        statusText = 'In Progress';
        timeStatusClass = 'time-badge--active';
    } else {
        statusClass = 'status-scheduled';
        statusText = 'Scheduled';
        timeStatusClass = 'time-badge--scheduled';
    }
    
    // Payment section only if total exists
    let paymentSection = '';
    if (total > 0) {
        paymentSection = `
            <div class="app-card__payment-summary">
                <div class="payment-item">
                    <span class="payment-label">Amount:</span>
                    <span class="payment-value">${formatCurrencyGBP(total)}</span>
                </div>
                <div class="payment-item ${isPaid ? 'paid' : 'unpaid'}">
                    <span class="payment-label">${isPaid ? 'Paid ✓' : 'Unpaid'}</span>
                    <span class="payment-value">${isPaid ? formatCurrencyGBP(total) : formatCurrencyGBP(balance)}</span>
                </div>
            </div>
        `;
    }
    
    // Vehicle & client info
    const clientInfo = `
        <div class="app-card__info">
            <div class="info-row">
                <span class="info-label">Vehicle:</span>
                <span class="info-value">${vehicleDisplay || '—'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Client:</span>
                <span class="info-value">${normalized.customerName}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Date:</span>
                <span class="info-value">${dateStr} at ${timeStr}</span>
            </div>
        </div>
    `;
    
    // Actions
    const canShowActions = normalized.status !== 'canceled';
    const hasAddress = normalized.address || normalized.clientAddress;
    
    // Smart swap logic: Call replaces Mark Paid for timed appointments until used once
    const hasTime = Boolean(normalized.time && normalized.time.trim());
    const customerPhone = normalized.customerPhone || '';
    const hasPhone = Boolean(customerPhone && customerPhone.length >= 6);
    const showCallInPrimary = hasTime && hasPhone && !callUsedOnce[apt.id];
    
    // Debug log for phone detection (dev mode)
    console.log(`[CALL BTN DEBUG] Appointment ${apt.id}:`, {
        rawPhone: apt.customerPhone || apt.phone,
        normalizedPhone: customerPhone,
        hasPhone,
        hasTime,
        showCallInPrimary
    });
    
    const actionsHTML = canShowActions ? `
        <div class="app-card__actions">
            <!-- Row 1: Primary Actions (Invoice | Call or Mark Paid) -->
            <div class="action-group action-group--primary">
                <button class="action-btn action-btn--invoice" data-action="invoice" data-id="${apt.id}" aria-label="Invoice">
                    <i class="fas fa-file-invoice"></i><span>Invoice</span>
                </button>
                ${showCallInPrimary ? 
                    `<button class="action-btn action-btn--call" data-action="call" data-id="${apt.id}" aria-label="Call">
                        <i class="fas fa-phone"></i><span>Call</span>
                    </button>` :
                    `<button class="action-btn action-btn--payment ${isPaid ? 'paid' : 'unpaid'}" 
                            data-id="${apt.id}" 
                            data-action="toggle-paid"
                            title="${isPaid ? 'Click to mark as Unpaid' : 'Click to mark as Paid'}"
                            aria-label="Toggle payment status">
                        ${isPaid ? '<i class="fas fa-check-circle"></i><span>Paid</span>' : '<i class="fas fa-circle"></i><span>Mark Paid</span>'}
                    </button>`
                }
            </div>
            
            <!-- Row 2: Edit Always Visible + Toggle for secondary actions -->
            <div class="action-group action-group--main">
                <button class="action-btn action-btn--edit" data-action="edit" data-id="${apt.id}" aria-label="Edit">
                    <i class="fas fa-edit"></i><span>Edit</span>
                </button>
                <button class="action-btn action-btn--expand-triggers" data-action="toggle-secondary" data-id="${apt.id}" aria-label="More options" aria-expanded="false">
                    <i class="fas fa-ellipsis-h"></i><span>More</span>
                </button>
            </div>
            
            <!-- Row 3: Secondary Actions (Collapsible on mobile) -->
            <div class="action-group action-group--secondary collapsed" data-secondary-menu="${apt.id}">
                ${hasAddress ? `<button class="action-btn action-btn--visit" data-action="visit" data-id="${apt.id}" aria-label="Visit">
                    <i class="fas fa-map-marker-alt"></i><span>Visit</span>
                </button>` : ''}
                ${(hasPhone && !showCallInPrimary) ? `<button class="action-btn action-btn--call" data-action="call" data-id="${apt.id}" aria-label="Call">
                    <i class="fas fa-phone"></i><span>Call</span>
                </button>` : ''}
                <button class="action-btn action-btn--delete" data-action="delete" data-id="${apt.id}" aria-label="Delete">
                    <i class="fas fa-trash-alt"></i><span>Delete</span>
                </button>
            </div>
        </div>
    ` : '';
    
    return `
        <div class="app-card ${statusClass}" data-apt-id="${apt.id}">
            <!-- Header: Date, Time, Status Badge -->
            <div class="app-card__header">
                <div class="app-card__datetime">
                    <div class="date-badge">${dateShort}</div>
                    <div class="time-badge ${timeStatusClass}">
                        <i class="fas fa-clock"></i> ${timeShort}
                    </div>
                </div>
                <div class="app-card__status-badge ${statusClass}">
                    ${statusText}
                </div>
            </div>
            
            <!-- Customer Name (prominent) -->
            <div class="app-card__customer">
                <i class="fas fa-user-circle"></i> ${normalized.customerName}
            </div>
            
            <!-- Vehicle Info -->
            ${vehicleDisplay ? `<div class="app-card__vehicle">
                <i class="fas fa-car"></i> ${vehicleDisplay}
            </div>` : ''}
            
            <!-- Payment Summary (if has invoice) -->
            ${paymentSection}
            
            <!-- Actions -->
            ${actionsHTML}
        </div>
    `;
}

// Bind appointment action buttons using event delegation
function bindAppointmentsClickDelegation() {
    const container = document.getElementById('appointmentsList');
    if (!container) return;

    if (appointmentsClicksBound) return;
    bindActionDelegation(container, async ({ action, id, target }) => {
        const aptId = id;

        if (!aptId) {
            console.error('[Main] Button has no data-id:', target);
            showNotification('Programarea nu are ID', 'error');
            return;
        }

        const appointment = appointments.find(a => a.id === aptId);
        if (!appointment && action !== 'invoice') {
            console.error('[Main] Appointment not found:', aptId);
            showNotification(t('errorAppointmentNotFound'), 'error');
            return;
        }

        const { confirmModal, openCustomModal } = await import('./src/shared/modal.js');

        try {
            switch (action) {
                case 'toggle-paid':
                    // Handle payment status toggle
                    console.log('[DIAG] Paid toggle clicked, appointment ID:', aptId);
                    await toggleAppointmentPaidStatus(aptId);
                    break;

                case 'toggle-secondary':
                    // Handle secondary actions expand/collapse
                    console.log('[DIAG] Toggle secondary actions for appointment ID:', aptId);
                    toggleSecondaryActions(aptId, target);
                    break;

                case 'visit':
                    if (appointmentHistory) {
                        const address = appointment?.address || appointment?.clientAddress || '';
                        await appointmentHistory.logLocationVisited(aptId, address);
                    }
                    await handleVisitAction(aptId, appointment, confirmModal);
                    break;

                case 'invoice':
                    try {
                        const { getOrCreateInvoiceForAppointment } = await import('./src/invoices/invoice-manager.js');
                        const invoiceId = await getOrCreateInvoiceForAppointment(aptId, appointment || {});

                        const basePath = window.location.pathname.replace(/[^/]+$/, '');
                        const url = basePath + 'invoice.html?invoiceId=' + encodeURIComponent(invoiceId) + '&mode=view';
                        const popup = window.open(url, '_blank');
                        if (!popup) {
                            window.location.href = url;
                        }
                    } catch (err) {
                        console.error('[Main] Invoice navigation error:', err);
                        showNotification('Nu s-a putut deschide factura', 'error');
                    }
                    break;
                
                case 'call':
                    // Call the customer
                    const phone = (appointment?.customerPhone || appointment?.phone || '').trim();
                    if (phone && phone.length >= 6) {
                        // Mark Call as used for this appointment to trigger swap
                        callUsedOnce[aptId] = true;
                        // Trigger tel: link
                        window.location.href = `tel:${phone}`;
                        // Re-render to move Call to More menu and bring back Mark Paid
                        renderAppointments();
                    }
                    break;
                
                case 'edit':
                    await handleEditAction(aptId, appointment, openCustomModal);
                    break;

                case 'delete':
                    await handleDeleteAction(aptId, appointment, confirmModal);
                    break;
                    
                default:
                    console.warn('[Main] Unknown action:', action);
            }
        } catch (error) {
            console.error(`[Main] Error handling action "${action}":`, error);
            showNotification(`Eroare la executarea acțiunii: ${action}`, 'error');
        }
    });

    appointmentsClicksBound = true;
}

// ==========================================
// DELAY MODAL - History integration for back button
// ==========================================

let delayModalEl = null;
let delayPopHandler = null;

/**
 * NEW: Toggle appointment payment status (PAID ↔ UNPAID)
 * Syncs across appointment ↔ invoice ↔ storage
 * With instant visual feedback and optimistic update
 */
async function toggleAppointmentPaidStatus(appointmentId) {
    try {
        if (!appointmentId) {
            showNotification('❌ Invalid appointment ID', 'error');
            return;
        }

        console.log('[TogglePaid] Toggling payment status for:', appointmentId);

        // Find the button and provide instant visual feedback (optimistic update)
        const card = document.querySelector(`[data-apt-id="${appointmentId}"]`);
        const button = card?.querySelector('[data-action="toggle-paid"]');
        
        if (!button) {
            console.warn('[TogglePaid] Button not found, proceeding without UI update');
        }

        const { doc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        // Get appointment
        const appointmentRef = doc(db, 'appointments', appointmentId);
        const appointmentSnap = await getDoc(appointmentRef);

        if (!appointmentSnap.exists()) {
            showNotification('❌ Appointment not found', 'error');
            return;
        }

        const appointment = appointmentSnap.data();
        const total = toNumber(appointment.total || 0);
        const currentPaidAmount = toNumber(appointment.paidAmount || appointment.amountPaid || 0);
        
        // ✅ FIX: Normalize to lowercase with explicit default
        const currentStatus = (appointment.paymentStatus || 'unpaid').toLowerCase();
        
        let newPaidAmount, newPaymentStatus;

        // ✅ FIX: Toggle logic - current === paid ? unpaid : paid
        if (currentStatus === 'paid') {
            newPaidAmount = 0;
            newPaymentStatus = 'unpaid';
        } else {
            newPaidAmount = total;
            newPaymentStatus = 'paid';
        }

        const newBalance = Math.max(0, total - newPaidAmount);

        console.log('[TogglePaid] Toggle:', { currentStatus, newPaymentStatus, currentPaidAmount, newPaidAmount, total, balance: newBalance });

        // ✅ INSTANT VISUAL FEEDBACK: Update button immediately (optimistic UI)
        if (button) {
            const wasPaymentBtn = button.classList.contains('action-btn--payment');
            if (wasPaymentBtn) {
                // Update button appearance instantly
                button.classList.remove('unpaid', 'paid');
                button.classList.add(newPaymentStatus);
                
                // Update button text and icon instantly
                button.innerHTML = newPaymentStatus === 'paid' 
                    ? '<i class="fas fa-check-circle"></i><span>Paid</span>'
                    : '<i class="fas fa-circle"></i><span>Mark Paid</span>';
                
                // Add visual feedback animation
                button.style.transform = 'scale(1.05)';
                setTimeout(() => {
                    button.style.transition = 'all 0.3s ease';
                    button.style.transform = 'scale(1)';
                }, 50);
                
                // Disable button briefly to prevent double-clicks
                button.disabled = true;
                console.log('[TogglePaid] ✅ Button UI updated instantly');
            }
        }

        // Update appointment in Firestore
        await updateDoc(appointmentRef, {
            paymentStatus: newPaymentStatus,
            paidAmount: newPaidAmount,
            balanceDue: newBalance,
            updatedAt: serverTimestamp()
        });

        console.log('[TogglePaid] ✅ Appointment payment status updated in Firestore');

        // Find and update linked invoice(s)
        const invoicesQuery = query(
            collection(db, 'invoices'),
            where('appointmentId', '==', appointmentId)
        );
        
        const invoiceSnaps = await getDocs(invoicesQuery);
        
        if (!invoiceSnaps.empty) {
            const invoicePromises = invoiceSnaps.docs.map(docSnap => {
                const invoiceRef = doc(db, 'invoices', docSnap.id);
                return updateDoc(invoiceRef, {
                    paymentStatus: newPaymentStatus,
                    paidAmount: newPaidAmount,
                    balanceDue: newBalance,
                    amountPaid: newPaidAmount,
                    updatedAt: serverTimestamp()
                });
            });

            await Promise.all(invoicePromises);
            console.log('[TogglePaid] ✅ Linked invoice(s) updated');
        }

        // Re-enable button
        if (button) {
            button.disabled = false;
        }

        // Show notification with new status
        const statusLabel = newPaymentStatus === 'paid' ? '✅ Marked as PAID' : '⏸️ Marked as UNPAID';
        showNotification(statusLabel, 'success');

    } catch (error) {
        console.error('[TogglePaid] Error:', error);
        
        // Revert button state on error
        if (card) {
            const button = card.querySelector('[data-action="toggle-paid"]');
            if (button) {
                button.disabled = false;
                // Force re-render to fix button state
                const appointment = appointments.find(a => a.id === appointmentId);
                if (appointment) {
                    // Re-render will be triggered by Firestore listener, but manually trigger if needed
                }
            }
        }
        
        showNotification('❌ Error toggling payment status: ' + error.message, 'error');
    }
}

/**
 * Toggle secondary actions visibility (mobile compact mode)
 */
function toggleSecondaryActions(appointmentId, button) {
    if (!appointmentId || !button) return;
    
    const card = document.querySelector(`[data-apt-id="${appointmentId}"]`);
    if (!card) return;
    
    const secondaryMenu = card.querySelector(`[data-secondary-menu="${appointmentId}"]`);
    if (!secondaryMenu) return;
    
    const isExpanded = secondaryMenu.classList.contains('expanded');
    
    if (isExpanded) {
        // Close
        secondaryMenu.classList.remove('expanded');
        secondaryMenu.classList.add('collapsed');
        button.setAttribute('aria-expanded', 'false');
        console.log('[ToggleSecondary] Secondary actions collapsed');
    } else {
        // Open
        secondaryMenu.classList.remove('collapsed');
        secondaryMenu.classList.add('expanded');
        button.setAttribute('aria-expanded', 'true');
        console.log('[ToggleSecondary] Secondary actions expanded');
    }
}

/**
 * NEW: Toggle action dropdown menu for appointment card (LEGACY - keep for compatibility)
 */
function toggleAppointmentDropdown(event, appointmentId) {
    event.stopPropagation();
    
    // Find the dropdown menu for this appointment
    const card = document.querySelector(`[data-apt-id="${appointmentId}"]`);
    if (!card) return;
    
    const dropdown = card.querySelector('.app-card__dropdown-menu');
    if (!dropdown) return;
    
    const isOpen = dropdown.classList.contains('open');
    
    // Close all other dropdowns
    document.querySelectorAll('.app-card__dropdown-menu.open').forEach(d => {
        if (d !== dropdown) d.classList.remove('open');
    });
    
    // Toggle this dropdown
    if (isOpen) {
        dropdown.classList.remove('open');
    } else {
        dropdown.classList.add('open');
        
        // Close dropdown if user clicks outside
        const closeHandler = (e) => {
            if (!card.contains(e.target)) {
                dropdown.classList.remove('open');
                document.removeEventListener('click', closeHandler);
            }
        };
        
        document.addEventListener('click', closeHandler);
    }
}

async function logTimelineEvent(aptId, eventType, eventData = {}) {
    try {
        if (!aptId) return;
        const { doc, updateDoc, arrayUnion, serverTimestamp, Timestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        const timelineEntry = {
            type: eventType,
            at: Timestamp.now(),
            by: currentUser?.uid || 'unknown',
            ...eventData
        };

        await updateDoc(doc(db, 'appointments', aptId), {
            timeline: arrayUnion(timelineEntry),
            lastUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        console.log(`[Timeline] Logged event: ${eventType} for ${aptId}`);
    } catch (error) {
        console.error(`[Timeline] Error logging ${eventType}:`, error);
    }
}

// ==========================================
// TIMELINE / HISTORY UTILITIES
// ==========================================

/**
 * Map event type to human-readable label (RO)
 */
function getTimelineEventLabel(eventType) {
    const typeMap = {
        'DELAY_MODAL_OPENED': 'A deschis fereastra Întârziere/Reprogramare',
        'DELAYED': 'Întârziere',
        'RESCHEDULED': 'Reprogramare',
        'FINALIZED': 'Finalizat',
        'EDITED': 'Editat',
        'CREATED': 'Creat',
        'CANCELLED': 'Anulat',
        'DELETED': 'Șters'
    };
    return typeMap[eventType] || eventType;
}

/**
 * Map reasonCode to human-readable label (RO)
 */
function getReasonCodeLabel(code) {
    const reasonMap = {
        'PART_MISSING': 'Piesă lipsă',
        'PART_WRONG': 'Piesă greșită',
        'SUPPLIER_DELAY': 'Întârziere furnizor',
        'TRAFFIC': 'Trafic',
        'PREVIOUS_JOB_OVERRUN': 'Job anterior a durat mai mult',
        'CUSTOMER_UNAVAILABLE': 'Client indisponibil',
        'ACCESS_ISSUE': 'Acces/locație dificilă',
        'DIAG_EXTRA': 'Diagnostic suplimentar',
        'WEATHER': 'Condiții meteo',
        'OTHER': 'Alt motiv'
    };
    return reasonMap[code] || code;
}

/**
 * Format timestamp for display (ro-RO locale)
 */
function formatTimelineTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('ro-RO', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Build timeline HTML from array of events
 */
function buildTimelineHTML(timeline) {
    if (!timeline || !Array.isArray(timeline) || timeline.length === 0) {
        return '<div class="tvx-history-empty">Nu există istoric.</div>';
    }

    // Sort descending (newest first)
    const sorted = [...timeline].sort((a, b) => {
        const aTime = a.at?.toDate?.() || new Date(a.at);
        const bTime = b.at?.toDate?.() || new Date(b.at);
        return bTime - aTime;
    });

    let html = '';
    sorted.forEach(event => {
        const eventType = event.type || 'UNKNOWN';
        const eventLabel = getTimelineEventLabel(eventType);
        const eventTime = formatTimelineTimestamp(event.at);
        
        let detailsHtml = '';

        // from/to: display range
        if (event.from && event.to) {
            const fromStr = formatTimelineTimestamp(event.from);
            const toStr = formatTimelineTimestamp(event.to);
            detailsHtml += `<div class="tvx-history-item__meta">
                <small>De la:</small> ${fromStr} <small>→ La:</small> ${toStr}
            </div>`;
        }

        // reasonCode: display reason
        if (event.reasonCode) {
            const reasonLabel = getReasonCodeLabel(event.reasonCode);
            detailsHtml += `<div class="tvx-history-item__meta">
                <small>Motiv:</small> ${reasonLabel}
            </div>`;
        }

        // note: display additional note
        if (event.note) {
            detailsHtml += `<div class="tvx-history-item__meta">
                <small>Notă:</small> ${event.note}
            </div>`;
        }

        // by: display operator (if available)
        // For now, just store uid - can extend to fetch displayName later
        if (event.by && event.by !== 'unknown') {
            // Truncate uid for display (first 8 chars)
            const operatorId = event.by.substring(0, 8) + '...';
            detailsHtml += `<div class="tvx-history-item__meta">
                <small>Operator:</small> ${operatorId}
            </div>`;
        }

        html += `
            <div class="tvx-history-item">
                <div class="tvx-history-item__top">
                    <div class="tvx-history-item__title">${eventLabel}</div>
                    <div class="tvx-history-item__time">${eventTime}</div>
                </div>
                ${detailsHtml}
            </div>
        `;
    });

    return html;
}

// ==========================================
// ACTION HANDLERS
// ==========================================

/**
 * Handle appointment view - opens details modal
 */

// ==========================================
// DELAY / RESCHEDULE FLOW
// ==========================================

const DELAY_REASON_MAP = {
    PART_MISSING: 'piesa nu a ajuns',
    PART_WRONG: 'piesa primită nu este potrivită',
    SUPPLIER_DELAY: 'întârziere la furnizor',
    TRAFFIC: 'trafic',
    PREVIOUS_JOB_OVERRUN: 'intervenția anterioară a durat mai mult',
    CUSTOMER_UNAVAILABLE: 'nu te-am putut găsi disponibil',
    ACCESS_ISSUE: 'acces/locație dificilă',
    DIAG_EXTRA: 'diagnostic suplimentar necesar',
    WEATHER: 'condiții meteo',
    OTHER: 'un motiv logistic'
};

function buildWhatsAppMessage(actionType, apt, reasonCode, newDate) {
    const name = apt.customerName || '';
    const reasonText = DELAY_REASON_MAP[reasonCode] || 'un motiv logistic';
    const timeText = newDate ? formatHHMM(newDate) : '';
    const dateText = newDate ? newDate.toLocaleDateString('ro-RO') : '';
    if (actionType === 'delay') {
        return `Salut, ${name}. Am o întârziere din cauza ${reasonText}. Estimare actualizată: ${timeText}. Îți scriu imediat când sunt aproape. Mulțumesc pentru înțelegere.`;
    }
    return `Salut, ${name}. Din cauza ${reasonText}, trebuie să reprogramăm intervenția. Propun: ${dateText} la ${timeText}. Confirmi că este în regulă?`;
}

function buildDelayModal(appointment) {
    const scheduledDate = getScheduledDate(appointment) || new Date();
    const dateStr = formatISODate(scheduledDate);
    const timeStr = formatHHMM(scheduledDate);
    const hasPhone = Boolean(appointment.customerPhone || appointment.phone);

    const overlay = document.createElement('div');
    overlay.className = 'tvDelayModal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
        <div class="tvDelayModal__panel">
            <div class="tvDelayModal__header">
                <h2 class="tvDelayModal__title">Întârzie / Reprogramează</h2>
                <button class="tvDelayModal__close" data-action="close" aria-label="Închide">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="tvDelayModal__body">
                <form id="tvDelayForm">
                    <div class="tvDelay__section">
                        <div class="tvDelay__row">
                            <label class="tvDelay__label">Tip acțiune</label>
                            <div class="tvDelay__radios">
                                <label class="radio">
                                    <input type="radio" name="delayType" value="delay" checked>
                                    <span>Întârziere (azi)</span>
                                </label>
                                <label class="radio">
                                    <input type="radio" name="delayType" value="reschedule">
                                    <span>Reprogramare (altă zi)</span>
                                </label>
                            </div>
                        </div>
                        <div class="tvDelay__presets">
                            <button type="button" class="tvDelay__preset" data-delay-min="15">+15m</button>
                            <button type="button" class="tvDelay__preset" data-delay-min="30">+30m</button>
                            <button type="button" class="tvDelay__preset" data-delay-min="60">+60m</button>
                            <button type="button" class="tvDelay__preset" data-delay-min="90">+90m</button>
                        </div>
                        <div class="tvDelay__grid">
                            <label class="tvDelay__field">
                                <span>Data</span>
                                <input type="date" id="tvDelayDate" name="date" value="${dateStr}" required>
                            </label>
                            <label class="tvDelay__field">
                                <span>Ora</span>
                                <input type="time" id="tvDelayTime" name="time" value="${timeStr}" required>
                            </label>
                        </div>
                    </div>

                    <div class="tvDelay__section">
                        <label class="tvDelay__label">Motiv întârziere / reprogramare</label>
                        <select id="tvDelayReason" name="reason" required>
                            ${Object.entries(DELAY_REASON_MAP).map(([code, text]) => `<option value="${code}">${text}</option>`).join('')}
                        </select>
                        <label class="tvDelay__label">Notiță</label>
                        <textarea id="tvDelayNote" name="note" rows="2" placeholder="Detalii scurte"></textarea>
                    </div>

                    <div class="tvDelay__section tvDelay__toggleRow">
                        <label class="switch">
                            <input type="checkbox" id="tvDelayWhatsapp" ${hasPhone ? '' : 'disabled'}>
                            <span class="slider round"></span>
                        </label>
                        <div>
                            <div class="tvDelay__toggleTitle">Pregătește mesaj WhatsApp</div>
                            <div class="tvDelay__toggleDesc">${hasPhone ? 'Deschide WhatsApp cu mesaj precompletat' : 'Telefon lipsă - nu se poate trimite WhatsApp'}</div>
                        </div>
                    </div>
                </form>
            </div>
            <div class="tvDelayModal__footer">
                <button class="tvDelay__btn tvDelay__btn-secondary" data-action="cancel">
                    <i class="fas fa-arrow-left"></i>
                    <span>Înapoi</span>
                </button>
                <button class="tvDelay__btn tvDelay__btn-primary" data-action="save">
                    <i class="fas fa-save"></i>
                    <span>Salvează</span>
                </button>
            </div>
        </div>
    `;

    return overlay;
}

async function openDelayRescheduleModal(appointment) {
    if (!appointment) return;
    
    // Log DELAY_MODAL_OPENED event
    await logTimelineEvent(appointment.id, 'DELAY_MODAL_OPENED', {});
    
    // Close any existing delay modal
    if (delayModalEl) {
        delayModalEl.classList.remove('tvDelayModal--show');
        setTimeout(() => delayModalEl.remove(), 200);
        if (delayPopHandler) window.removeEventListener('popstate', delayPopHandler);
    }
    
    const overlay = buildDelayModal(appointment);
    delayModalEl = overlay;
    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');

    requestAnimationFrame(() => overlay.classList.add('tvDelayModal--show'));

    const closeBtn = overlay.querySelector('[data-action="close"]');
    const cancelBtn = overlay.querySelector('[data-action="cancel"]');
    const saveBtn = overlay.querySelector('[data-action="save"]');
    const form = overlay.querySelector('#tvDelayForm');
    const presets = overlay.querySelectorAll('[data-delay-min]');
    const dateInput = overlay.querySelector('#tvDelayDate');
    const timeInput = overlay.querySelector('#tvDelayTime');
    const radios = overlay.querySelectorAll('input[name="delayType"]');
    const baseDate = getScheduledDate(appointment) || new Date();

    function updateForAction(action) {
        if (action === 'delay') {
            dateInput.value = formatISODate(baseDate);
            dateInput.disabled = true;
        } else {
            dateInput.disabled = false;
        }
    }

    updateForAction('delay');

    radios.forEach(r => r.addEventListener('change', (e) => updateForAction(e.target.value)));

    presets.forEach(btn => {
        btn.addEventListener('click', () => {
            const mins = Number(btn.dataset.delayMin || '0');
            const clone = new Date(baseDate.getTime());
            clone.setMinutes(clone.getMinutes() + mins);
            dateInput.value = formatISODate(clone);
            timeInput.value = formatHHMM(clone);
            form.dataset.selectedPreset = String(mins);
            overlay.querySelector('input[value="delay"]').checked = true;
            updateForAction('delay');
        });
    });

    const close = () => {
        // Clean up history handler
        if (delayPopHandler) {
            window.removeEventListener('popstate', delayPopHandler);
            delayPopHandler = null;
        }
        delayModalEl = null;
        
        overlay.classList.remove('tvDelayModal--show');
        setTimeout(() => {
            overlay.remove();
            const otherOpen = document.querySelector('.tvDetailsModalOverlay--show, .tvEditModalOverlay.active, .modern-modal-overlay.modern-modal-show, .modal-backdrop.modalOverlay--show, .tvFinalizeModal--show');
            if (!otherOpen) document.body.classList.remove('modal-open');
        }, 200);
    };

    // History push for back button / swipe back on mobile
    history.pushState({ tvModal: 'delay', aptId: appointment.id }, '');

    delayPopHandler = (event) => {
        if (delayModalEl) {
            close();
        }
    };

    window.addEventListener('popstate', delayPopHandler);

    // Event delegation for close and cancel buttons
    overlay.addEventListener('click', (e) => {
        // Check if clicking on background overlay
        if (e.target === overlay) {
            return;
        }

        // Find closest button with data-action (handles clicks on icons inside buttons too)
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        if (action === 'close' || action === 'cancel') {
            e.preventDefault();
            e.stopPropagation();
            close();
        }
    });

    saveBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        await handleDelaySubmit({ form, overlay, appointment });
    });
}

async function handleDelaySubmit({ form, overlay, appointment }) {
    const saveBtn = overlay.querySelector('[data-action="save"]');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Se salvează...';

    try {
        const actionType = form.querySelector('input[name="delayType"]:checked')?.value || 'delay';
        const dateVal = form.querySelector('#tvDelayDate').value;
        const timeVal = form.querySelector('#tvDelayTime').value;
        const reasonCode = form.querySelector('#tvDelayReason').value;
        const note = form.querySelector('#tvDelayNote').value.trim();
        const wantWhatsapp = form.querySelector('#tvDelayWhatsapp')?.checked;

        if (!dateVal || !timeVal) {
            showNotification('Selectează data și ora', 'warning');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Salvează';
            return;
        }

        const baseDate = getScheduledDate(appointment) || new Date();
        const targetDate = new Date(`${dateVal}T${timeVal}`);

        if (actionType === 'delay' && !isSameDay(baseDate, targetDate)) {
            showNotification('Întârzierea trebuie să fie în aceeași zi', 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Salvează';
            return;
        }

        const status = actionType === 'delay' ? 'delayed' : 'rescheduled';

        const { Timestamp, doc, updateDoc, serverTimestamp, arrayUnion } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        const fromTs = getScheduledTimestamp(appointment) || Timestamp.fromDate(baseDate);
        const toTs = Timestamp.fromDate(targetDate);

        const timelineEntry = {
            type: status === 'delayed' ? 'DELAYED' : 'RESCHEDULED',
            at: Timestamp.now(),
            by: currentUser?.uid || 'unknown',
            from: fromTs,
            to: toTs,
            reasonCode,
            note
        };

        const updateData = {
            scheduledDateTime: toTs,
            startAt: toTs,
            dateStr: formatISODate(targetDate),
            time: formatHHMM(targetDate),
            status,
            delayReason: { code: reasonCode, note },
            lastUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            timeline: arrayUnion(timelineEntry)
        };

        if (!appointment.originalDateTime) {
            updateData.originalDateTime = fromTs;
        }

        await updateDoc(doc(db, 'appointments', appointment.id), updateData);

        // Local state update for instant re-sort
        Object.assign(appointment, updateData);
        ensureScheduledFields(appointment);
        // Update original if set now
        if (updateData.originalDateTime) appointment.originalDateTime = updateData.originalDateTime;

        // Resort & rerender
        appointments = appointments.map(a => a.id === appointment.id ? appointment : a);
        filterAppointments();

        // WhatsApp
        const phone = appointment.customerPhone || appointment.phone;
        if (wantWhatsapp && phone) {
            const msg = buildWhatsAppMessage(actionType, appointment, reasonCode, targetDate);
            const encoded = encodeURIComponent(msg);
            const url = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encoded}`;
            window.open(url, '_blank');
        }

        showNotification('✅ Programarea a fost actualizată', 'success');
    } catch (error) {
        console.error('[Delay] Error:', error);
        showNotification('❌ Eroare la actualizare: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvează';
        
        // Clean up history handler
        if (delayPopHandler) {
            window.removeEventListener('popstate', delayPopHandler);
            delayPopHandler = null;
        }
        delayModalEl = null;
        
        overlay.classList.remove('tvDelayModal--show');
        setTimeout(() => {
            overlay.remove();
            const otherOpen = document.querySelector('.tvDetailsModalOverlay--show, .tvEditModalOverlay.active, .modern-modal-overlay.modern-modal-show, .modal-backdrop.modalOverlay--show, .tvFinalizeModal--show');
            if (!otherOpen) document.body.classList.remove('modal-open');
        }, 200);
    }
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
            if (apt.dateStr) {
                // Format date as DD/MM/YYYY
                const [year, month, day] = apt.dateStr.split('-');
                const formattedDate = `${day}/${month}/${year}`;
                whenLine += ` ${formattedDate}`;
            }
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
        if (apt.jobsSummary) {
            lines.push(`Lucrare: ${apt.jobsSummary}`);
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


// Helper: Validate all required fields in form
function validateAllFields(form) {
    const requiredFields = [
        { id: 'editName', label: 'Nume Client' },
        { id: 'editPhone', label: 'Telefon' },
        { id: 'editDate', label: 'Data' },
        { id: 'editTime', label: 'Ora' },
        { id: 'editRegNumber', label: 'Nr. Înmatriculare' }
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

async function handleEditAction(id, appointment, openCustomModal) {
    if (!appointment) {
        showNotification('Programarea nu a fost găsită', 'error');
        return;
    }

    // Set edit mode and populate the form
    enterEditMode(appointment);
    populateFormFromAppointment(appointment);
    
    // Scroll to the appointment form
    const appointmentForm = document.getElementById('appointmentForm');
    if (appointmentForm) {
        appointmentForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Focus on the first field
        setTimeout(() => {
            const firstInput = appointmentForm.querySelector('input[type="text"], input[type="tel"]');
            if (firstInput) firstInput.focus();
        }, 100);
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
    setupScannedInvoicesUI();
    setupAccountingUI();
    applyAccountantModeUi();

    const appointmentForm = document.getElementById('appointmentForm');
    if (appointmentForm && !appointmentForm.dataset.bound) {
        appointmentForm.addEventListener('submit', handleAddAppointment);
        appointmentForm.dataset.bound = 'true';
        setupAppointmentFormLogic();
    }


}

// Modern appointment form logic
function setupAppointmentFormLogic() {
    // 0. Setup cancel edit button
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const form = document.getElementById('appointmentForm');
            if (form) {
                form.reset();
                const today = new Date().toISOString().split('T')[0];
                document.getElementById('appointmentDate').value = today;
                document.getElementById('appointmentTime').value = '';
                document.getElementById('appointmentTimeValue').value = '';
                document.getElementById('mileage').value = '';
                document.getElementById('serviceLocation').value = '';
                const garageAddrSection = document.getElementById('garageAddressSection');
                const clientAddrSection = document.getElementById('clientAddressSection');
                if (garageAddrSection) garageAddrSection.style.display = 'none';
                if (clientAddrSection) clientAddrSection.removeAttribute('open');
                renderJobRows([]);
                renderPartRows([]);
                updateAppointmentTotals();
                addJobRow();
            }
            exitEditMode();
            showNotification('✅ Edit mode cancelled', 'info');
        });
    }
    
    // 1. Toggle location sections based on serviceLocation dropdown
    const serviceLocationSelect = document.getElementById('serviceLocation');
    const garageSection = document.getElementById('garageAddressSection');
    const clientSection = document.getElementById('clientAddressSection');
    
    if (serviceLocationSelect) {
        serviceLocationSelect.addEventListener('change', (e) => {
            if (e.target.value === 'garage') {
                if (garageSection) garageSection.style.display = 'block';
                if (clientSection) clientSection.removeAttribute('open');
                // Clear client address fields
                document.getElementById('address').value = '';
                document.getElementById('postcode').value = '';
            } else if (e.target.value === 'client') {
                if (garageSection) garageSection.style.display = 'none';
                if (clientSection) clientSection.setAttribute('open', '');
            } else {
                if (garageSection) garageSection.style.display = 'none';
                if (clientSection) clientSection.removeAttribute('open');
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

    // 3. Items Panel - Tabs & Buttons
    const tabBtns = document.querySelectorAll('.tabBtn');
    const itemsPanel = document.querySelector('.itemsPanel');
    
    if (itemsPanel) {
        // Tab switching
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                if (!tabName) return;
                
                // Update button state
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Update tab content
                const jobsTab = document.getElementById('tabJobs');
                const partsTab = document.getElementById('tabParts');
                
                if (tabName === 'jobs') {
                    jobsTab?.classList.add('active');
                    partsTab?.classList.remove('active');
                } else if (tabName === 'parts') {
                    partsTab?.classList.add('active');
                    jobsTab?.classList.remove('active');
                }
            });
        });
        
        // Quick action buttons
        const miniButtons = itemsPanel.querySelectorAll('.miniBtn');
        miniButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                if (action === 'addJob') {
                    addJobRow();
                    // Switch to jobs tab
                    document.querySelector('[data-tab="jobs"]')?.click();
                } else if (action === 'addPart') {
                    addPartRow();
                    // Switch to parts tab
                    document.querySelector('[data-tab="parts"]')?.click();
                }
            });
        });
    }

    // 4. Jobs/Parts builder
    const jobsContainer = document.getElementById('jobsContainer');
    const partsContainer = document.getElementById('partsContainer');

    bindLineItemEvents(jobsContainer, updateAppointmentTotals);
    bindLineItemEvents(partsContainer, updateAppointmentTotals);

    if (jobsContainer && jobsContainer.children.length === 0) {
        addJobRow();
    }

    updateAppointmentTotals();
    
    // 5. Real-time validation feedback (optional - can add error messages on change)
    const requiredFields = [
        'customerName', 'customerPhone', 'contactPref', 'makeModel', 'regNumber',
        'serviceLocation', 'appointmentDate', 'appointmentTime'
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


// ==========================================
// INVOICE TAB (Overrides editor)
// ==========================================
let currentInvoiceEditAptId = null;
let invoiceAutosaveTimer = null;

/**
 * Initialize Invoice Tab UI elements and handlers
 */
function initInvoiceTabUI() {
  const selectEl = document.getElementById('invoiceAppointmentSelect');
  const openBtn = document.getElementById('openInvoicePreviewBtn');
  const saveBtn = document.getElementById('saveInvoiceDetailsBtn');
  const clearBtn = document.getElementById('clearInvoiceOverridesBtn');
  const formEl = document.getElementById('invoiceDetailsForm');

  if (!selectEl || !openBtn || !saveBtn || !clearBtn || !formEl) return;

  // Populate options initially (in case appointments already loaded)
  refreshInvoiceAppointmentOptions();

  selectEl.addEventListener('change', () => {
    currentInvoiceEditAptId = selectEl.value || null;
    const apt = currentInvoiceEditAptId
      ? appointments.find(a => a && a.id === currentInvoiceEditAptId)
      : null;
    fillInvoiceFormFromAppointment(apt);
    setInvoiceSaveStatus('');
  });

  openBtn.addEventListener('click', () => {
    if (!currentInvoiceEditAptId) {
      showNotification('Selectează o programare pentru invoice', 'warning');
      return;
    }
        (async () => {
            try {
                const { getOrCreateInvoiceForAppointment } = await import('./src/invoices/invoice-manager.js');
                const invoiceId = await getOrCreateInvoiceForAppointment(currentInvoiceEditAptId, {});
                const basePath = window.location.pathname.replace(/[^/]+$/, '');
                const url = basePath + 'invoice.html?invoiceId=' + encodeURIComponent(invoiceId) + '&mode=view';
                window.open(url, '_blank');
            } catch (err) {
                console.error('[InvoiceTab] Preview open error:', err);
                showNotification('Nu s-a putut deschide factura', 'error');
            }
        })();
  });

  // Autosave on input (debounced)
  formEl.addEventListener('input', () => {
    if (!currentInvoiceEditAptId) return;
    if (invoiceAutosaveTimer) clearTimeout(invoiceAutosaveTimer);
    invoiceAutosaveTimer = setTimeout(() => saveInvoiceOverrides(false), 600);
  });

  saveBtn.addEventListener('click', () => saveInvoiceToStorage());
  clearBtn.addEventListener('click', () => clearInvoiceOverrides());
}

/**
 * Refresh the appointment selector with finalized appointments
 */
function refreshInvoiceAppointmentOptions() {
  const selectEl = document.getElementById('invoiceAppointmentSelect');
  if (!selectEl) return;

  const prev = selectEl.value || '';

  const finalized = Array.isArray(appointments)
    ? appointments.filter(a => (a?.status === 'finalized' || a?.status === 'done'))
    : [];

  // Keep first placeholder option
  const placeholder = selectEl.querySelector('option[value=""]') || null;
  selectEl.innerHTML = '';
  if (placeholder) {
    selectEl.appendChild(placeholder);
  } else {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— Selectează —';
    selectEl.appendChild(opt);
  }

  finalized
    .sort((a, b) => {
      const da = new Date(a.finalizedAt?.toDate ? a.finalizedAt.toDate() : (a.finalizedAt || a.startAt || 0));
      const db = new Date(b.finalizedAt?.toDate ? b.finalizedAt.toDate() : (b.finalizedAt || b.startAt || 0));
      return db - da;
    })
    .forEach(apt => {
      const opt = document.createElement('option');
      opt.value = apt.id;
      const name = apt.customerName || apt.clientName || 'Client';
      const plate = apt.registrationPlate || apt.regPlate || '';
      const dateStr = apt.dateStr || '';
      opt.textContent = `${name}${plate ? ' • ' + plate : ''}${dateStr ? ' • ' + dateStr : ''}`;
      selectEl.appendChild(opt);
    });

  // restore if still exists
  if (prev && selectEl.querySelector(`option[value="${CSS.escape(prev)}"]`)) {
    selectEl.value = prev;
  }
}

/**
 * Fill invoice override form from appointment + existing overrides
 */
function fillInvoiceFormFromAppointment(apt) {
  const get = (id) => document.getElementById(id);
  const setVal = (id, v) => { const el = get(id); if (el) el.value = v ?? ''; };
  const setChk = (id, v) => { const el = get(id); if (el) el.checked = !!v; };

  if (!apt) {
    setVal('invClientName', '');
    setVal('invClientPhone', '');
    setVal('invClientAddress', '');
    setVal('invVehicle', '');
    setVal('invRegPlate', '');
    setVal('invMileage', '');
    setVal('invPaymentTerms', '');
    setVal('invExtras', '');
    setChk('invVatEnabled', false);
    setVal('invVatRate', '');
    return;
  }

  const o = apt.invoiceOverrides || {};

  setVal('invClientName', o.name ?? apt.customerName ?? apt.clientName ?? '');
  setVal('invClientPhone', o.phone ?? apt.phone ?? '');
  setVal('invClientAddress', o.address ?? apt.address ?? apt.location ?? '');
  setVal('invVehicle', o.vehicleMakeModel ?? o.makeModel ?? apt.carMakeModel ?? apt.vehicleMakeModel ?? apt.makeModel ?? '');
  setVal('invRegPlate', o.regPlate ?? apt.registrationPlate ?? apt.regPlate ?? '');
  setVal('invMileage', o.mileage ?? apt.mileage ?? '');
  setVal('invPaymentTerms', o.paymentTerms ?? apt.paymentTerms ?? 'Due within 7 days');
  setVal('invExtras', (o.extras ?? apt.extras ?? ''));

  setChk('invVatEnabled', (o.vatEnabled ?? apt.vatEnabled) ? true : false);
  setVal('invVatRate', (o.vatRate ?? apt.vatRate ?? ''));
}

/**
 * Build overrides object from form
 */
function getInvoiceOverridesFromForm() {
  const v = (id) => (document.getElementById(id)?.value ?? '').trim();
  const n = (id) => {
    const raw = document.getElementById(id)?.value;
    if (raw === '' || raw === null || raw === undefined) return '';
    const num = Number(raw);
    return Number.isFinite(num) ? num : '';
  };
  const c = (id) => !!document.getElementById(id)?.checked;

  const overrides = {
    name: v('invClientName'),
    phone: v('invClientPhone'),
    address: v('invClientAddress'),
    vehicleMakeModel: v('invVehicle'),
    regPlate: v('invRegPlate'),
    mileage: v('invMileage'),
    paymentTerms: v('invPaymentTerms'),
    extras: v('invExtras'),
    vatEnabled: c('invVatEnabled'),
    vatRate: v('invVatRate')
  };

  // Remove empty strings to keep doc clean
  Object.keys(overrides).forEach(k => {
    if (overrides[k] === '') delete overrides[k];
  });

  return overrides;
}

function setInvoiceSaveStatus(msg) {
  const el = document.getElementById('invoiceSaveStatus');
  if (el) el.textContent = msg || '';
}

/**
 * Save overrides to Firestore: appointments/{aptId}.invoiceOverrides
 */
async function saveInvoiceOverrides(showToast) {
  if (!currentInvoiceEditAptId) return;

  try {
    setInvoiceSaveStatus('Saving...');
    const overrides = getInvoiceOverridesFromForm();

    const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    await updateDoc(doc(db, 'appointments', currentInvoiceEditAptId), {
      invoiceOverrides: overrides
    });

    setInvoiceSaveStatus('Saved ✅');
    if (showToast) showNotification('Detaliile invoice au fost salvate ✅', 'success');
  } catch (err) {
    console.error('[InvoiceTab] Save error:', err);
    setInvoiceSaveStatus('Save failed ❌');
    if (showToast) showNotification('Nu s-a putut salva invoice ❌', 'error');
  }
}

/**
 * Clear invoiceOverrides from Firestore (deleteField)
 */
async function clearInvoiceOverrides() {
  if (!currentInvoiceEditAptId) return;

  try {
    const { doc, updateDoc, deleteField } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    await updateDoc(doc(db, 'appointments', currentInvoiceEditAptId), {
      invoiceOverrides: deleteField()
    });
    fillInvoiceFormFromAppointment(appointments.find(a => a?.id === currentInvoiceEditAptId) || null);
    setInvoiceSaveStatus('Reset ✅');
    showNotification('Override-ul de invoice a fost șters ✅', 'success');
  } catch (err) {
    console.error('[InvoiceTab] Clear error:', err);
    showNotification('Nu s-a putut reseta invoice ❌', 'error');
  }
}

// INVOICE SYSTEM INTEGRATION
// ============================================

/**
 * Ensure invoice identifiers exist for an appointment.
 * Generates once and persists to Firestore if missing.
 */
async function ensureInvoiceIdentifiers(appointmentId, appointmentData) {
    if (!appointmentId || !ensureFirestoreReady('ensureInvoiceIdentifiers')) return null;

    const existingNumber = appointmentData?.invoiceNumber || null;
    const existingPin = appointmentData?.pin || null;

    if (existingNumber && existingPin) {
        console.log(`✅ [Invoice] Using existing identifiers - Number: ${existingNumber}, PIN: ${existingPin}`);
        return { invoiceNumber: existingNumber, pin: existingPin };
    }

    invoiceNumberGenerationCount++;
    console.log(`🆕 [DIAG] Generating new invoice identifiers (generation #${invoiceNumberGenerationCount})`);

    const generatePin = () => `TVX-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    const generateInvoiceNumberStable = (id) => {
        const now = new Date();
        const yy = String(now.getFullYear()).slice(2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const short = (id || 'INV').toString().slice(-6).toUpperCase();
        return `INV-${short}-${yy}${mm}${dd}`;
    };

    const invoiceNumber = existingNumber || generateInvoiceNumberStable(appointmentId);
    const pin = existingPin || generatePin();

    console.log(`📝 [Invoice] Generated - Number: ${invoiceNumber}, PIN: ${pin}`);

    const updateData = {};
    if (!existingNumber) updateData.invoiceNumber = invoiceNumber;
    if (!existingPin) updateData.pin = pin;

    if (Object.keys(updateData).length > 0) {
        const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        await updateDoc(doc(db, 'appointments', appointmentId), updateData);
        console.log(`💾 [Invoice] Persisted to Firestore for appointment ${appointmentId}`);
    }

    return { invoiceNumber, pin };
}

/**
 * Open invoice for a given appointment ID
 * - Always uses Firestore invoices collection (one-to-one)
 * - Creates invoice if missing, then opens by invoiceId
 */
async function openInvoiceForAppointment(appointmentId) {
    try {
        console.log('Opening invoice for appointment:', appointmentId);
        const invoiceId = await getOrCreateInvoiceForAppointment(appointmentId);
        console.log('Found invoice:', invoiceId);
        await openInvoice(null, invoiceId, 'view');
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

// ==========================================
// LANGUAGE SWITCHING
// ==========================================

/**
 * Update language button states to reflect current language
 */
function updateLangButtonActiveState(lang) {
    const enBtn = document.getElementById('btnLangEN');
    const roBtn = document.getElementById('btnLangRO');
    
    if (enBtn && roBtn) {
        enBtn.classList.toggle('active', lang === 'en');
        roBtn.classList.toggle('active', lang === 'ro');
        console.log('[LANG] Button active state updated:', lang);
    } else {
        console.warn('[LANG] Buttons not found for state update');
    }
}

/**
 * Refresh dynamic UI strings after language change
 * Updates appointment cards, tabs, and other JS-generated content
 */
window.refreshUIStrings = function() {
    // Re-render appointments with new language
    if (typeof renderAppointments === 'function') {
        renderAppointments();
    }
};

/**
 * Apply language change and trigger UI updates
 */
function applyLanguage(lang) {
    // Validate language
    if (lang !== 'en' && lang !== 'ro') {
        lang = 'en';
    }
    
    // Set new language in localStorage
    setLanguage(lang);
    
    // Dispatch custom event for language change
    const event = new CustomEvent('languagechange', { detail: { lang } });
    window.dispatchEvent(event);
}

/**
 * Switch language and update all UI
 */
function switchLang(lang) {
    // Apply language change (sets localStorage + dispatches event)
    applyLanguage(lang);
    
    // Re-apply translations to static HTML elements with data-i18n
    applyTranslations(document);
    console.log('[LANG] Applied translations to document');
    
    // Update dynamic UI text created by JS
    if (typeof window.refreshUIStrings === 'function') {
        window.refreshUIStrings();
    }
    
    // Re-render appointments list if available and safe
    if (typeof renderAppointments === 'function') {
        renderAppointments();
    }
    
    // Update button active states
    updateLangButtonActiveState(lang);
}

/**
 * Initialize language switcher event handlers
 */
function initLanguageSwitcher() {
    const enBtn = document.getElementById('btnLangEN');
    const roBtn = document.getElementById('btnLangRO');
    
    if (!enBtn || !roBtn) {
        console.error('[LANG] EN/RO buttons not found in DOM!');
        return;
    }
    
    // Attach click handlers
    enBtn.addEventListener('click', () => {
        switchLang('en');
    });
    
    roBtn.addEventListener('click', () => {
        switchLang('ro');
    });
    
    // Set initial button states based on saved language
    const currentLang = getLanguage();
    updateLangButtonActiveState(currentLang);
    
    // Apply translations for the saved language on load
    applyTranslations(document);
}
(function initCompactHeaderMenu(){
  const btn = document.getElementById('menuBtn');
  const dd  = document.getElementById('menuDropdown');
  const en  = document.getElementById('langEN');
  const ro  = document.getElementById('langRO');

  if(!btn || !dd) return;

  const open = () => { dd.hidden = false; btn.setAttribute('aria-expanded','true'); };
  const close = () => { dd.hidden = true; btn.setAttribute('aria-expanded','false'); };
  const toggle = () => dd.hidden ? open() : close();

  btn.addEventListener('click', (e)=>{ e.stopPropagation(); toggle(); });

  // Close on outside click
  document.addEventListener('click', ()=> close());

  // Close on ESC
  document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') close(); });

  // Language handlers (hook into your existing translation system)
  en?.addEventListener('click', (e)=>{
    e.stopPropagation();
    localStorage.setItem('tv_lang', 'en');
    if(typeof window.applyTranslations === 'function') window.applyTranslations(document);
    close();
  });

  ro?.addEventListener('click', (e)=>{
    e.stopPropagation();
    localStorage.setItem('tv_lang', 'ro');
    if(typeof window.applyTranslations === 'function') window.applyTranslations(document);
    close();
  });
})();

/**
 * ===== STANDALONE INVOICES COLLECTION =====
 * Support for creating and managing invoices independent of appointments
 */

// Global state for invoice editing
let currentInvoiceDraft = null;
let currentInvoiceId = null;
let isLoadingInvoice = false;

/**
 * Generate invoice number in format: INV-XXXXX-YYMMDD
 */
function generateInvoiceNumber() {
    const now = new Date();
    const dateStr = now.toISOString().slice(2, 8).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `INV-${random}-${dateStr}`;
}

// ==========================================
// INVOICES STORAGE MANAGEMENT
// ==========================================

/**
 * Open invoice editor for appointment (Firestore-driven)
 */
async function openInvoiceFromAppointment(appointmentId, appointmentData) {
    if (!appointmentId) return;
    try {
        console.log('Opening invoice for appointment:', appointmentId);
        const invoiceId = await getOrCreateInvoiceForAppointment(appointmentId, appointmentData || {});
        console.log('Found invoice:', invoiceId);
        openInvoice(null, invoiceId, 'edit');
    } catch (error) {
        console.error('❌ [Invoice] Error opening appointment invoice:', error);
        alert('Error opening invoice: ' + error.message);
    }
}

/**
 * Create invoice document in Firestore immediately, then open editor
 */
async function createInvoiceFromAppointment(appointmentId, prefillData) {
    if (!db || !currentUser) {
        console.error('❌ [Invoice] Database or user not initialized');
        alert('Please wait for authentication to complete');
        return null;
    }

    // If appointmentId is provided, use single-source manager to prevent duplicates
    if (appointmentId) {
        try {
            const invoiceId = await getOrCreateInvoiceForAppointment(appointmentId, prefillData || {});
            openInvoice(null, invoiceId, 'edit');
            return invoiceId;
        } catch (error) {
            console.error('❌ [Invoice] Error opening existing appointment invoice:', error);
            alert('Error opening invoice: ' + error.message);
            return null;
        }
    }

    console.log('📝 [Invoice] Creating invoice in Firestore...');
    console.log('📝 [Invoice] Prefill data:', prefillData);
    
    try {
        const { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        // Generate invoice number
        const invoiceNumber = generateInvoiceNumber();
        
        // Build invoice payload
        const invoicePayload = {
            invoiceNumber: invoiceNumber,
            status: 'draft',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: currentUser.uid,
            
            // Customer info
            customerName: prefillData?.customerName || '',
            phone: prefillData?.customerPhone || '',
            address: prefillData?.address || '',
            
            // Vehicle info
            vehicleMakeModel: prefillData?.makeModel || '',
            regPlate: prefillData?.registrationPlate || prefillData?.regPlate || '',
            mileage: prefillData?.mileage || '',
            
            // Items (prefill from appointment)
            items: [...(prefillData?.services || []), ...(prefillData?.parts || [])],
            services: prefillData?.services || [],
            parts: prefillData?.parts || [],
            jobs: [...(prefillData?.services || []), ...(prefillData?.parts || [])],
            
            // Totals (0 initially)
            subtotal: prefillData?.subtotal || 0,
            vatRate: 0,
            vatAmount: 0,
            total: prefillData?.total || prefillData?.subtotal || 0,
            
            // Payment
            amountPaid: 0,
            remainingBalance: 0,
            paymentMethod: '',
            paymentDate: '',
            
            // Notes
            notes: prefillData?.problemDescription || '',
            jobsSummary: prefillData?.jobsSummary || '',
            
            // Link to appointment if provided
            ...(appointmentId && { appointmentId })
        };
        
        console.log('📝 [Invoice] Writing to Firestore collection "invoices"...');
        console.log('📝 [Invoice] Payload:', invoicePayload);
        
        // Create invoice document in Firestore
        const invoiceRef = await addDoc(collection(db, 'invoices'), invoicePayload);
        const invoiceId = invoiceRef.id;
        
        console.log('✅ [Invoice] Firestore doc created in /invoices:', invoiceId);
        console.log('✅ [Invoice] Invoice number:', invoiceNumber);
        
        // Verify it was created (read-back)
        try {
            const verifyRef = doc(db, 'invoices', invoiceId);
            const verifySnap = await getDoc(verifyRef);
            console.log('🔁 [Invoice] Read-back verification - exists:', verifySnap.exists());
            if (verifySnap.exists()) {
                console.log('🔁 [Invoice] Read-back data:', verifySnap.data());
            } else {
                console.error('❌ [Invoice] Read-back FAILED - doc not found!');
            }
        } catch (readError) {
            console.error('❌ [Invoice] Read-back error:', readError);
        }
        
        // Link invoice to appointment if appointmentId provided
        if (appointmentId) {
            try {
                await updateDoc(doc(db, 'appointments', appointmentId), {
                    invoiceId: invoiceId,
                    updatedAt: serverTimestamp()
                });
                console.log('✅ [Invoice] Linked to appointment:', appointmentId);
            } catch (linkError) {
                console.warn('⚠️ [Invoice] Could not link to appointment:', linkError);
            }
        }
        
        // Open invoice editor to complete details
        console.log('📝 [Invoice] Opening invoice editor...');
        window.open(`invoice.html?invoiceId=${invoiceId}&mode=edit`, '_blank');
        
        return invoiceId;
        
    } catch (error) {
        console.error('❌ [Invoice] Error creating invoice:', error);
        alert('Error creating invoice: ' + error.message);
        return null;
    }
}

/**
 * Start invoices storage listener
 */
async function startInvoicesListener() {
    if (invoicesUnsubscribe) {
        console.log('📦 [Invoices] Listener already active, skipping duplicate');
        return;
    }
    
    try {
        if (!db) {
            console.error('❌ [Invoices] Database not initialized');
            return;
        }
        
        const { collection, query, orderBy, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        console.log('📦 [Invoices] Setting up query: collection(db, "invoices") with orderBy("createdAt", "desc")');
        
        const invoicesQuery = query(
            collection(db, 'invoices'),
            orderBy('createdAt', 'desc')
        );
        
        invoicesUnsubscribe = onSnapshot(
            invoicesQuery,
            (snapshot) => {
                console.log(`📦 [Invoices] Snapshot received - size: ${snapshot.size}`);
                
                // Log all invoice IDs for debugging
                if (snapshot.size > 0) {
                    const allIds = snapshot.docs.map(d => d.id);
                    console.log('📦 [Invoices] All invoice IDs:', allIds);
                    
                    // Log first invoice details
                    const firstDoc = snapshot.docs[0];
                    console.log('📦 [Invoices] Invoice 1:', firstDoc.id, firstDoc.data());
                    
                    // Log all invoices for comprehensive debugging
                    snapshot.docs.forEach((doc, index) => {
                        console.log(`📦 [Invoices] Invoice ${index + 1}:`, doc.id, doc.data());
                    });
                } else {
                    console.warn('⚠️ [Invoices] No invoices found in query result');
                }
                
                allInvoices = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                
                console.log('📦 [Invoices] Mapped invoices array length:', allInvoices.length);
                
                // Apply filters and render
                filterInvoices();
            },
            (error) => {
                console.error('❌ [Invoices] Listener error:', error);
                console.error('❌ [Invoices] Error code:', error.code);
                console.error('❌ [Invoices] Error message:', error.message);
            }
        );
        
        console.log('✅ [Invoices] Listener started');
    } catch (error) {
        console.error('❌ [Invoices] Error starting listener:', error);
    }
}

/**
 * Stop invoices storage listener
 */
function stopInvoicesListener() {
    if (invoicesUnsubscribe) {
        console.log('🧹 [Invoices] Stopping listener');
        invoicesUnsubscribe();
        invoicesUnsubscribe = null;
    }
}

/**
 * Helper: Check if invoice is paid (normalized across different field formats)
 * @param {Object} inv - Invoice object
 * @returns {boolean} True if invoice is fully paid
 */
function isInvoicePaid(inv) {
    // Method 1: Check explicit paymentStatus field (set by sync)
    const paymentStatus = (inv.paymentStatus || '').toLowerCase();
    if (paymentStatus === 'paid') return true;
    
    // Method 2: Compute from amounts
    const total = inv.total || 0;
    const amountPaid = inv.amountPaid || inv.paidAmount || inv.totals?.amountPaid || 0;
    const balanceDue = Math.max(0, total - amountPaid);
    
    // Paid if amount paid covers total and total > 0
    return total > 0 && amountPaid > 0 && balanceDue <= 0;
}

/**
 * Filter and search invoices
 */
function filterInvoices() {
    console.log('🔍 [Invoices] filterInvoices() called - allInvoices.length:', allInvoices.length);
    const searchInput = document.getElementById('searchInvoices');
    const paymentFilter = document.getElementById('filterInvoicePayment');
    
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const paymentValue = paymentFilter ? paymentFilter.value : 'unpaid';
    
    console.log('🔍 [Filter] Payment filter:', paymentValue, 'Search:', searchTerm);
    
    let filtered = allInvoices;
    
    // Step 1: Filter by search term FIRST
    if (searchTerm) {
        filtered = filtered.filter(inv => {
            const invNumber = (inv.invoiceNumber || '').toLowerCase();
            const custName = (inv.customerName || '').toLowerCase();
            const custPhone = (inv.phone || '').toLowerCase();
            const plate = (inv.regPlate || '').toLowerCase();
            
            return invNumber.includes(searchTerm) ||
                   custName.includes(searchTerm) ||
                   custPhone.includes(searchTerm) ||
                   plate.includes(searchTerm);
        });
        console.log('🔍 [Filter] After search:', filtered.length);
    }
    
    // Step 2: Filter by payment status within search results
    if (paymentValue !== 'all') {
        filtered = filtered.filter(inv => {
            const isPaid = isInvoicePaid(inv);
            
            if (paymentValue === 'paid') {
                return isPaid;
            } else if (paymentValue === 'unpaid') {
                return !isPaid;
            }
            return true;
        });
        console.log('🔍 [Filter] After payment filter (', paymentValue, '):', filtered.length);
    }
    
    filteredInvoices = filtered;
    updateInvoiceKPI();
    renderInvoicesStorage();
}

/**
 * Update KPI summary (Unpaid vs Paid counts)
 */
function updateInvoiceKPI() {
    const kpiUnpaid = document.getElementById('kpiUnpaid');
    const kpiPaid = document.getElementById('kpiPaid');
    
    if (!kpiUnpaid || !kpiPaid) return;
    
    let unpaidCount = 0;
    let paidCount = 0;
    
    allInvoices.forEach(inv => {
        if (isInvoicePaid(inv)) {
            paidCount++;
        } else {
            unpaidCount++;
        }
    });
    
    kpiUnpaid.textContent = unpaidCount;
    kpiPaid.textContent = paidCount;
    
    console.log('📊 [KPI] Updated:', { unpaidCount, paidCount });
}

/**
 * Render invoices storage grid
 */
function renderInvoicesStorage() {
    console.log('🎨 [Invoices] renderInvoicesStorage() called - filteredInvoices.length:', filteredInvoices.length);
    const container = document.getElementById('invoicesList');
    const emptyState = document.getElementById('emptyStateInvoices');
    
    if (!container) return;
    
    if (filteredInvoices.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.style.display = 'flex';
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    
    // Wrap cards in premium grid layout
    container.innerHTML = `
        <div class="storage-grid">
            ${filteredInvoices.map(invoice => createInvoiceCard(invoice)).join('')}
        </div>
    `;
}

/**
 * Create HTML for invoice card - PREMIUM SAAS COMPACT
 */
function createInvoiceCard(invoice) {
    const customerName = invoice.customerName || 'Unknown';
    const phone = invoice.phone || '';
    const regPlate = invoice.regPlate || '';
    const invoiceNumber = invoice.invoiceNumber || invoice.id?.slice(0, 8) || 'DRAFT';
    const total = invoice.total || 0;
    const amountPaid = invoice.amountPaid || invoice.totals?.amountPaid || 0;
    const balanceDue = Math.max(0, total - amountPaid);
    const status = invoice.status || 'draft';
    const createdAt = invoice.createdAt;
    
    // Determine payment status with normalized logic
    const isPaid = isInvoicePaid(invoice);
    const isPartial = amountPaid > 0 && balanceDue > 0 && !isPaid;
    
    // Premium status chips
    let paymentChip = '';
    if (isPaid) {
        paymentChip = '<span class="status-chip status-chip--paid"><i class="fas fa-check-circle"></i> PAID</span>';
    } else if (isPartial) {
        paymentChip = '<span class="status-chip status-chip--partial"><i class="fas fa-exclamation-circle"></i> PARTIAL</span>';
    } else {
        paymentChip = '<span class="status-chip status-chip--due"><i class="fas fa-clock"></i> DUE</span>';
    }
    
    // Format date
    let dateStr = 'N/A';
    if (createdAt) {
        try {
            const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
            dateStr = date.toLocaleDateString('en-GB', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric' 
            });
        } catch (e) {
            dateStr = 'N/A';
        }
    }
    
    const statusBadgeClass = status === 'final' ? 'badge badge--done' : 'badge';
    
    return `
        <div class="storage-card" data-invoice-id="${invoice.id}">
            <div class="storage-card__top">
                <div>
                    <div class="storage-card__id">${invoiceNumber}</div>
                    <div class="storage-card__meta-date">${dateStr}</div>
                </div>
                <div class="storage-card__badges">
                    ${paymentChip}
                </div>
            </div>
            
            <div class="storage-card__line">
                <strong>${customerName}</strong>
                ${regPlate ? `<span class="app-card__meta-sep">•</span><span>${regPlate}</span>` : ''}
            </div>
            
            <div class="storage-card__line">
                <span>Total: <strong>£${total.toFixed(2)}</strong></span>
                ${amountPaid > 0 ? `<span class="app-card__meta-sep">•</span><span style="color: #16a34a; font-weight: 600;">Paid: £${amountPaid.toFixed(2)}</span>` : ''}
                ${balanceDue > 0 ? `<span class="app-card__meta-sep">•</span><span style="color: #dc2626; font-weight: 600;">Due: £${balanceDue.toFixed(2)}</span>` : ''}
            </div>
            
            <div class="storage-card__actions">
                ${invoice.pdfUrl ? `
                    <button 
                        class="action-btn action-btn--success" 
                        onclick="openPDF('${invoice.pdfUrl}')"
                        aria-label="Open PDF"
                        title="Download or view saved PDF"
                    >
                        <i class="fas fa-file-pdf"></i>
                        <span>PDF</span>
                    </button>
                ` : `
                    <button 
                        class="action-btn action-btn--secondary" 
                        onclick="generateAndSaveInvoicePDF('${invoice.id}')"
                        aria-label="Generate and save PDF"
                        title="Generate PDF and save to storage"
                    >
                        <i class="fas fa-save"></i>
                        <span>Save PDF</span>
                    </button>
                `}
                <button 
                    class="action-btn action-btn--primary" 
                    onclick="openInvoiceFile('${invoice.id}')"
                    aria-label="Open invoice"
                >
                    <i class="fas fa-external-link-alt"></i>
                    <span>Open</span>
                </button>
                <button 
                    class="action-btn action-btn--danger" 
                    onclick="deleteInvoiceConfirm('${invoice.id}')"
                    aria-label="Delete invoice"
                >
                    <i class="fas fa-trash"></i>
                    <span>Delete</span>
                </button>
            </div>
        </div>
    `;
}

/**
 * Open invoice in editor
 */
function openInvoiceFile(invoiceId) {
    window.open(`invoice.html?invoiceId=${invoiceId}&mode=view`, '_blank');
}

/**
 * 📥 Open PDF in new tab
 */
function openPDF(pdfUrl) {
    if (!pdfUrl) {
        alert('PDF URL not available');
        return;
    }
    window.open(pdfUrl, '_blank');
}

/**
 * 💾 Generate and save invoice PDF from storage list (opens invoice with prompt)
 */
function generateAndSaveInvoicePDF(invoiceId) {
    // Open invoice editor in new tab - user clicks Save PDF button there
    const invoiceWindow = window.open(`invoice.html?invoiceId=${invoiceId}&mode=edit`, '_blank');
    
    // Optional: Show message to user
    alert('Invoice opened. Click the "Save PDF" button in the invoice to save it to storage.');
}

/**
 * Delete invoice with confirmation
 */
async function deleteInvoiceConfirm(invoiceId) {
    const invoice = allInvoices.find(inv => inv.id === invoiceId);
    if (!invoice) return;
    
    const invoiceNumber = invoice.invoiceNumber || invoiceId;
    const customerName = invoice.customerName || 'Unknown';
    
    if (!confirm(`Delete invoice ${invoiceNumber} for ${customerName}?\n\nThis cannot be undone.`)) {
        return;
    }
    
    try {
        const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        await deleteDoc(doc(db, 'invoices', invoiceId));
        console.log('✅ [Invoices] Invoice deleted:', invoiceId);
    } catch (error) {
        console.error('❌ [Invoices] Error deleting invoice:', error);
        alert('Failed to delete invoice: ' + error.message);
    }
}

/**
 * Refresh invoices list
 */
function handleRefreshInvoices() {
    console.log('🔄 [Invoices] Manual refresh requested');
    stopInvoicesListener();
    startInvoicesListener();
}

// ==========================================
// NOTE: Invoice creation and storage are now handled by new modular architecture
// See src/invoice-create/ and src/storage/ modules
// These DOMContentLoaded handlers are commented out to avoid duplicates
// ==========================================

// LEGACY: Commented out - now handled by src/invoice-create/invoiceCreate.ui.js
// document.addEventListener('DOMContentLoaded', () => {
//     const createInvoiceBtn = document.getElementById('createInvoiceBtn');
//     if (createInvoiceBtn) {
//         createInvoiceBtn.addEventListener('click', (e) => {
//             e.preventDefault();
//             handleCreateInvoice();
//         });
//     }
//     
//     // Start invoices listener when appointments tab is active
//     startInvoicesListener();
// });

// LEGACY: Expose functions globally for inline onclick handlers
// NOTE: Now handled by src/storage/storage.events.js
// Keeping these here as fallback for compatibility
window.openInvoiceFile = window.openInvoiceFile || openInvoiceFile;
window.deleteInvoiceConfirm = window.deleteInvoiceConfirm || deleteInvoiceConfirm;
window.handleRefreshInvoices = window.handleRefreshInvoices || handleRefreshInvoices;
window.filterInvoices = window.filterInvoices || filterInvoices;

// NEW: Expose payment and dropdown toggle functions for appointment cards
window.toggleAppointmentPaidStatus = window.toggleAppointmentPaidStatus || toggleAppointmentPaidStatus;
window.toggleAppointmentDropdown = window.toggleAppointmentDropdown || toggleAppointmentDropdown;

// ✅ Script parsing completed successfully
console.log('[script.js] ✅ Parsed successfully to end - no syntax errors');





