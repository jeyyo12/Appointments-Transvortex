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
let pages = [];

// Appointments global variables
let appointments = [];
let filteredAppointments = [];
let appointmentsUnsubscribe = null;

// Invoices Storage global variables
let allInvoices = [];
let filteredInvoices = [];
let invoicesUnsubscribe = null;

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
let currentTab = 'pages';

// Appointment buttons delegation flag
let appointmentsClicksBound = false;

// History Service - for appointment timeline logging
let appointmentHistory = null;

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
            updateAuthUI();

            if (user) {
                console.log(`✅ User authenticated: ${user.email}`);
                if (isAdmin) {
                    console.log("👑 Admin access granted");
                }

                // Load custom presets from Firestore
                await loadPresetsFromFirestore();

                const { default: HistoryService } = await import('./src/services/historyService.js').catch(() => {
                    console.warn('⚠️  History service not available');
                    return { default: null };
                });
                if (HistoryService) {
                    appointmentHistory = new HistoryService(db, user);
                    console.log("✅ Appointment history service initialized");
                }

                setupEventListeners();
                await loadPages();
                subscribeToAppointments();

            } else {
                console.log("🔓 User logged out");
                pages = [];
                appointments = [];
                renderPages();
                appointmentHistory = null;
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
        authStatus.innerHTML = '🔓 ' + t('connectToStart');
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
// PAGE MANAGEMENT FUNCTIONS
// ==========================================
async function loadPages() {
    if (!currentUser) {
        console.error('❌ loadPages: No user authenticated - Firestore will deny access');
        pages = [];
        renderPages();
        return;
    }

    if (!db) {
        console.error('❌ loadPages: Firestore not initialized yet');
        return;
    }
    
    console.log('✅ loadPages: Auth ready, user:', currentUser.email, 'UID:', currentUser.uid);

    try {
        const { collection, getDocs, query, orderBy } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        console.log('📥 [Firestore] Executing getDocs on pages collection with user:', currentUser.uid);
        const q = query(collection(db, 'pages'), orderBy('addedDate', 'desc'));
        const snapshot = await getDocs(q);
        console.log('📊 [Firestore] getDocs succeeded, loaded', snapshot.docs.length, 'pages');
        
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
        
        console.log(`📝 [Firestore] Updating page ${docId} as posted with user:`, currentUser?.uid);
        
        await updateDoc(doc(db, 'pages', docId), {
            postedToday: true,
            lastPosted: serverTimestamp()
        });

        console.log(`✅ [Firestore] Page ${docId} marked as posted`);
        
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
    if (!confirm(t('confirmDeletePage'))) return;

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
        showNotification(t('errorDeleting') + ' ' + error.message, 'error');
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
        statusText = t('statusInactiveSuggestDelete');
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
        span.innerHTML = '<i class="fas fa-party-horn"></i> ' + t('msgCongratulations');
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
window.handleAuthToggle = handleAuthToggle;
window.switchTab = switchTab;
window.handleRefresh = handleRefresh;
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
            
            showNotification('✅ Programare adăugată cu succes!', 'success');
            showToast('Programare adăugată cu succes!', 'success');
        } else {
            // EDIT MODE - update existing appointment
            console.log(`📝 Updating appointment ${editingAppointmentId}...`);
            
            // Do NOT include createdAt or createdBy in updates
            await updateDoc(doc(db, 'appointments', editingAppointmentId), basePayload);
            
            console.log(`✅ [Firestore] Appointment ${editingAppointmentId} updated`);
            
            await syncInvoiceFromAppointmentPayload(editingAppointmentId, basePayload);
            
            showNotification('✅ Programare actualizată cu succes!', 'success');
            showToast('Programare actualizată cu succes!', 'success');
        }
        
        // Reset form
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
        addJobRow();
        updateAppointmentTotals();
        
        // Reset edit mode
        if (editingAppointmentId) {
            exitEditMode();
        }
        
        // Highlight and scroll to new/edited appointment
        setTimeout(() => {
            const targetId = editingAppointmentId || (e.target.lastInsertRowid);
            if (targetId && targetId !== '') {
                highlightAndScrollToAppointment(targetId);
            }
        }, 300);
        
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
    document.getElementById('appointmentTimeValue').value = appointment.time || '';
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
    
    // Jobs and Parts - Render existing rows
    let editJobs = Array.isArray(appointment.jobs) ? appointment.jobs : [];
    let editParts = Array.isArray(appointment.parts) ? appointment.parts : [];

    // Legacy fallback if new schema is empty
    if (editJobs.length === 0 && Array.isArray(appointment.services)) {
        editJobs = appointment.services;
    }
    if (editParts.length === 0 && Array.isArray(appointment.parts)) {
        editParts = appointment.parts;
    }

    if (editJobs.length === 0 && editParts.length === 0 && Array.isArray(appointment.jobs)) {
        editJobs = appointment.jobs.filter(item => item?.type === 'labour');
        editParts = appointment.jobs.filter(item => item?.type === 'part');
    }

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
    
    // Notes
    document.getElementById('notes').value = appointment.notes || '';
    
    updateAppointmentTotals();
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
    
    // Compute payment status - READ FROM FIELD FIRST, then fallback to computation
    const amountPaid = toNumber(apt.amountPaid || apt.paidAmount || 0);
    const total = toNumber(apt.total || 0);
    const balance = Math.max(0, total - amountPaid);
    
    // ✅ FIX: Read paymentStatus field first (same as toggle function)
    const storedStatus = (apt.paymentStatus || '').toLowerCase();
    const computedPaid = (amountPaid > 0 && amountPaid >= total);
    const isPaid = storedStatus === 'paid' || (!storedStatus && computedPaid);
    
    // Vehicle info
    const regPlate = normalized.registrationPlate || normalized.regNumber || '';
    const makeModel = normalized.vehicleMakeModel || normalized.makeModel || '';
    
    // Payment meta row
    let paymentMeta = '';
    if (total > 0) {
        paymentMeta = `
            <div class="app-card__meta">
                <div class="app-card__vehicle">
                    ${regPlate ? `<span class="app-card__plate">${regPlate}</span>` : ''}
                    ${makeModel ? `<span class="app-card__model">${makeModel}</span>` : ''}
                </div>
                <div class="app-card__payment">
                    ${amountPaid > 0 ? `<span class="app-card__meta-paid">Paid: ${formatCurrencyGBP(amountPaid)}</span>` : ''}
                    ${balance > 0 ? `${amountPaid > 0 ? '<span class="app-card__meta-sep">•</span>' : ''}<span class="app-card__meta-due">Due: ${formatCurrencyGBP(balance)}</span>` : ''}
                </div>
            </div>
        `;
    }
    
    // Actions row: Invoice | Paid/Unpaid | Actions dropdown
    const canShowActions = normalized.status !== 'canceled';
    const hasAddress = normalized.address || normalized.clientAddress;
    
    const actionsHTML = canShowActions ? `
        <div class="app-card__bottom">
            <div class="app-card__actions-row">
                <button class="action-btn action-btn--primary" data-action="invoice" data-id="${apt.id}" aria-label="Invoice">
                    <i class="fas fa-file-invoice"></i><span>Invoice</span>
                </button>
                <button class="app-card__toggle-paid ${isPaid ? 'paid' : 'unpaid'}" 
                        data-id="${apt.id}" 
                        data-action="toggle-paid"
                        title="${isPaid ? 'Click to mark as Unpaid' : 'Click to mark as Paid'}"
                        aria-label="Toggle payment status">
                    ${isPaid ? '<i class="fas fa-check-circle"></i><span>Paid</span>' : '<i class="fas fa-circle"></i><span>Mark Paid</span>'}
                </button>
                <div class="app-card__actions-dropdown-wrapper">
                    <button class="app-card__actions-dropdown-btn" data-id="${apt.id}" data-action="toggle-actions-menu" aria-label="More actions">
                        <span>Actions</span>
                        <i class="fas fa-caret-down"></i>
                    </button>
                    <div class="app-card__actions-dropdown-menu" data-apt-id="${apt.id}">
                        ${hasAddress ? `<button class="app-card__dropdown-item" data-action="visit" data-id="${apt.id}">
                            <i class="fas fa-map-marker-alt"></i><span>Visit</span>
                        </button>` : ''}
                        <button class="app-card__dropdown-item" data-action="edit" data-id="${apt.id}">
                            <i class="fas fa-edit"></i><span>Edit</span>
                        </button>
                        <button class="app-card__dropdown-item" data-action="delete" data-id="${apt.id}">
                            <i class="fas fa-trash-alt"></i><span>Delete</span>
                        </button>
                        <button class="app-card__dropdown-item" data-action="history" data-id="${apt.id}">
                            <i class="fas fa-history"></i><span>History</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    ` : '';
    
    return `
        <div class="app-card" data-apt-id="${apt.id}">
            <div class="app-card__top">
                <h3 class="app-card__name">${normalized.customerName}</h3>
                ${isOverdue ? `<div class="app-card__badges"><span class="badge badge--overdue"><i class="fas fa-exclamation-triangle"></i></span></div>` : ''}
            </div>
            ${paymentMeta}
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
                    // Handle payment status toggle (from pill button)
                    console.log('[DIAG] Paid toggle clicked, appointment ID:', aptId);
                    await toggleAppointmentPaidStatus(aptId);
                    break;

                case 'toggle-actions-menu':
                    // Handle Actions dropdown toggle
                    console.log('[DIAG] Actions menu toggle clicked, appointment ID:', aptId);
                    toggleActionsMenu(target, aptId);
                    break;

                case 'visit':
                    // Close dropdown after selection
                    closeActionsDropdown(aptId);
                    if (appointmentHistory) {
                        const address = appointment?.address || appointment?.clientAddress || '';
                        await appointmentHistory.logLocationVisited(aptId, address);
                    }
                    await handleVisitAction(aptId, appointment, confirmModal);
                    break;

                case 'history':
                    // Close dropdown after selection
                    closeActionsDropdown(aptId);
                    // View appointment history/timeline
                    if (appointmentHistory) {
                        await appointmentHistory.logTimelineViewed(aptId);
                    }
                    // For now, just show a notification. Can extend to show full timeline modal
                    showNotification('📋 Appointment history feature coming soon', 'info');
                    break;

                case 'invoice':
                    try {
                        const { getOrCreateInvoiceForAppointment } = await import('./src/invoices/invoice-manager.js');
                        const invoiceId = await getOrCreateInvoiceForAppointment(aptId, appointment || {});
                        if (appointmentHistory) {
                            await appointmentHistory.logAppointmentInvoiced(aptId, invoiceId || appointment?.invoiceNumber || 'NEW');
                        }
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
                
                case 'edit':
                    // Close dropdown after selection
                    closeActionsDropdown(aptId);
                    await handleEditAction(aptId, appointment, openCustomModal);
                    break;

                case 'delete':
                    // Close dropdown after selection
                    closeActionsDropdown(aptId);
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
 */
async function toggleAppointmentPaidStatus(appointmentId) {
    try {
        if (!appointmentId) {
            showNotification('❌ Invalid appointment ID', 'error');
            return;
        }

        console.log('[TogglePaid] Toggling payment status for:', appointmentId);

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

        // Update appointment
        await updateDoc(appointmentRef, {
            paymentStatus: newPaymentStatus,
            paidAmount: newPaidAmount,
            balanceDue: newBalance,
            updatedAt: serverTimestamp()
        });

        console.log('[TogglePaid] ✅ Appointment payment status updated');

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

        // Show notification with new status
        const statusLabel = newPaymentStatus === 'paid' ? '✅ Marked as PAID' : '⏸️ Marked as UNPAID';
        showNotification(statusLabel, 'success');

    } catch (error) {
        console.error('[TogglePaid] Error:', error);
        showNotification('❌ Error toggling payment status: ' + error.message, 'error');
    }
}

/**
 * NEW: Toggle action dropdown menu for appointment card
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

/**
 * Portal Dropdown System - Appends to body to avoid clipping
 */
let activePortalMenu = null;

function createPortalMenu(anchorButton, appointmentId) {
    // Close existing portal menu
    closePortalMenu();
    
    const card = anchorButton.closest('.app-card');
    if (!card) return;
    
    // Find dropdown items from the card template
    const templateMenu = card.querySelector('.app-card__actions-dropdown-menu');
    if (!templateMenu) return;
    
    // Create portal menu
    const portalMenu = document.createElement('div');
    portalMenu.className = 'portal-dropdown-menu';
    portalMenu.innerHTML = templateMenu.innerHTML;
    
    // Position portal menu
    const rect = anchorButton.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    // Calculate if should open upward
    const menuHeight = 200; // estimated max height
    const spaceBelow = viewportHeight - rect.bottom;
    const openUpward = spaceBelow < menuHeight && rect.top > menuHeight;
    
    if (openUpward) {
        portalMenu.style.bottom = (viewportHeight - rect.top) + 'px';
    } else {
        portalMenu.style.top = (rect.bottom + 4) + 'px';
    }
    
    // Position horizontally (align to button)
    let leftPos = rect.left;
    const menuWidth = 160; // estimated width
    if (leftPos + menuWidth > viewportWidth) {
        leftPos = viewportWidth - menuWidth - 8;
    }
    portalMenu.style.left = Math.max(8, leftPos) + 'px';
    
    // Append to body
    document.body.appendChild(portalMenu);
    activePortalMenu = portalMenu;
    
    // ✅ FIX: Add event delegation to portal menu items
    portalMenu.addEventListener('click', async (e) => {
        const actionBtn = e.target.closest('[data-action]');
        if (!actionBtn) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const action = actionBtn.dataset.action;
        const id = actionBtn.dataset.id;
        
        console.log('[Portal] Menu action clicked:', { action, id });
        
        // Close portal menu before executing action
        closePortalMenu();
        
        // Execute the same action handlers as main delegation
        const appointment = appointments.find(a => a.id === id);
        const { confirmModal, openCustomModal } = await import('./src/shared/modal.js');
        
        try {
            switch (action) {
                case 'visit':
                    if (appointmentHistory) {
                        const address = appointment?.address || appointment?.clientAddress || '';
                        await appointmentHistory.logLocationVisited(id, address);
                    }
                    await handleVisitAction(id, appointment, confirmModal);
                    break;
                    
                case 'edit':
                    if (appointmentHistory) {
                        await appointmentHistory.logAppointmentEdited(id, 'edited_from_card');
                    }
                    await handleEditAction(id, appointment, openCustomModal);
                    break;
                    
                case 'delete':
                    if (appointmentHistory) {
                        await appointmentHistory.logAppointmentDeleted(id);
                    }
                    await handleDeleteAction(id, appointment, confirmModal);
                    break;
                    
                case 'history':
                    if (appointmentHistory) {
                        await appointmentHistory.logTimelineViewed(id);
                    }
                    showNotification('📋 Appointment history feature coming soon', 'info');
                    break;
            }
        } catch (error) {
            console.error('[Portal] Action error:', error);
            showNotification('❌ Error: ' + error.message, 'error');
        }
    });
    
    // Add open class for animation
    requestAnimationFrame(() => {
        portalMenu.classList.add('open');
    });
    
    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', handlePortalOutsideClick);
        document.addEventListener('scroll', closePortalMenu, true);
        window.addEventListener('resize', closePortalMenu);
    }, 0);
    
    // Mark button as active
    anchorButton.classList.add('open');
}

function closePortalMenu() {
    if (activePortalMenu) {
        activePortalMenu.remove();
        activePortalMenu = null;
        
        // Remove listeners
        document.removeEventListener('click', handlePortalOutsideClick);
        document.removeEventListener('scroll', closePortalMenu, true);
        window.removeEventListener('resize', closePortalMenu);
        
        // Remove open class from all buttons
        document.querySelectorAll('.app-card__actions-dropdown-btn.open').forEach(btn => {
            btn.classList.remove('open');
        });
    }
}

function handlePortalOutsideClick(e) {
    if (activePortalMenu && !activePortalMenu.contains(e.target) && !e.target.closest('.app-card__actions-dropdown-btn')) {
        closePortalMenu();
    }
}

/**
 * Toggle Actions dropdown menu (Visit, Edit, Delete, History)
 */
function toggleActionsMenu(button, appointmentId) {
    if (activePortalMenu) {
        closePortalMenu();
    } else {
        createPortalMenu(button, appointmentId);
    }
}

/**
 * Close Actions dropdown menu
 */
function closeActionsDropdown(appointmentId) {
    closePortalMenu();
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

        // Log to history service
        if (appointmentHistory) {
            if (actionType === 'delay') {
                await appointmentHistory.logAppointmentDelayed(
                    appointment.id,
                    baseDate.toISOString(),
                    targetDate.toISOString(),
                    `${reasonCode}${note ? ': ' + note : ''}`
                );
            } else {
                await appointmentHistory.logAppointmentRescheduled(
                    appointment.id,
                    baseDate.toISOString(),
                    targetDate.toISOString(),
                    `${reasonCode}${note ? ': ' + note : ''}`
                );
            }
        }

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
        
        // Log deletion to history before deleting
        if (appointmentHistory) {
            await appointmentHistory.logAppointmentDeleted(id, 'User deleted appointment');
        }
        
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
 * Filter and search invoices
 */
function filterInvoices() {
    console.log('🔍 [Invoices] filterInvoices() called - allInvoices.length:', allInvoices.length);
    const searchInput = document.getElementById('searchInvoices');
    const statusFilter = document.getElementById('filterInvoiceStatus');
    
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const statusValue = statusFilter ? statusFilter.value : 'all';
    
    let filtered = allInvoices;
    
    // Filter by status
    if (statusValue !== 'all') {
        filtered = filtered.filter(inv => inv.status === statusValue);
    }
    
    // Filter by search term
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
    }
    
    filteredInvoices = filtered;
    renderInvoicesStorage();
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
    
    // Determine payment status
    let paymentStatus = 'UNPAID';
    let paymentBadgeClass = 'badge';
    if (amountPaid > 0) {
        if (balanceDue <= 0) {
            paymentStatus = 'PAID';
            paymentBadgeClass = 'badge badge--done';
        } else {
            paymentStatus = 'PARTIAL';
            paymentBadgeClass = 'badge badge--overdue';
        }
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
                    <span class="${statusBadgeClass}">${status.toUpperCase()}</span>
                    <span class="${paymentBadgeClass}">${paymentStatus}</span>
                </div>
            </div>
            
            <div class="storage-card__line">
                <strong>${customerName}</strong>
                ${regPlate ? `<span class="app-card__meta-sep">•</span><span>${regPlate}</span>` : ''}
            </div>
            
            <div class="storage-card__line">
                <span>Total: <strong>£${total.toFixed(2)}</strong></span>
                ${amountPaid > 0 ? `<span class="app-card__meta-sep">•</span><span class="app-card__meta-paid">Paid: £${amountPaid.toFixed(2)}</span>` : ''}
                ${balanceDue > 0 ? `<span class="app-card__meta-sep">•</span><span class="app-card__meta-due">Due: £${balanceDue.toFixed(2)}</span>` : ''}
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





