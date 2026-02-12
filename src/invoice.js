/**
 * Invoice Renderer Module
 * Converts invoiceData objects into DOM-rendered invoices
 * Supports dynamic content, validation, and print-to-PDF via window.print()
 */

// Import AppointmentHistoryService
import AppointmentHistoryService from './services/historyService.js';
import { ADMIN_UIDS } from './config/firebase.config.js';

// ==========================================
// FIREBASE CONFIGURATION (Single Source)
// ==========================================
// Firebase config: src/config/firebase.config.js
// Firebase init: src/config/firebase.js
// Auth state: src/core/auth-state.js
// ==========================================

// Firebase instances will be assigned by initializeFirebase()
let app = null;
let auth = null;
let db = null;
let currentUser = null;
let isAdmin = false;

// Global state
let currentInvoiceData = null;

let invoiceInitialized = false;
let invoiceListenersBound = false;
let firebaseInitialized = false;

// ========== DIAGNOSTICS (Invoice) ==========
let invoiceListenerCount = 0;
// ==========================================

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
        
        if (writeTraces.length > 20) writeTraces.shift();
    }
    
    const { updateDoc: originalUpdateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    return originalUpdateDoc(ref, data);
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
    console.log('=== LAST WRITE (Invoice) ===');
    console.log('Type:', last.type);
    console.log('Reason:', last.reason);
    console.log('Path:', last.path);
    console.log('Time:', last.timestamp);
    console.log('Stack:', last.stack);
};
// ===================================================
/**
 * Format date to UK format (DD/MM/YYYY)
 */
function formatDateUK(date) {
    if (!date) return '—';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

/**
 * Format currency as GBP (£1,234.56)
 */
function formatCurrency(amount) {
    return '£' + (amount || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Generate a random PIN code (e.g., TVX-8342)
 */
function generatePIN() {
    const prefix = 'TVX';
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${prefix}-${random}`;
}

/**
 * Generate invoice number with timestamp + counter
 * Format: INV-[YYMMDDHHmm]-[counter]
 */
function generateInvoiceNumber() {
    const now = new Date();

    const pad = (n, size = 2) => n.toString().padStart(size, '0');
    
    const yy = pad(now.getFullYear() % 100);
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const hh = pad(now.getHours());
    const min = pad(now.getMinutes());
    
    // Simple counter (can be enhanced with localStorage)
    const counter = pad(Math.floor(Math.random() * 100), 3);
    
    return `INV-${yy}${mm}${dd}${hh}${min}-${counter}`;
}

/**
 * Calculate due date (7 days from invoice date)
 */
function calculateDueDate(invoiceDate) {
    const date = new Date(invoiceDate);
    date.setDate(date.getDate() + 7);
    return date;
}

/**
 * Validate invoice data
 * @param {object} data - Invoice data object
 * @returns {object} { isValid, errors }
 */
function validateInvoiceData(data) {
    const errors = [];
    if (!data) {
        errors.push('No invoice data provided');
        return { isValid: false, errors };
    }

    // Client name is required
    if (!data.client || !data.client.name || !data.client.name.trim()) {
        errors.push('Client name is required');
    }

    // Note: Items/Services not required on initial load (might be added during finalization)
    // Only validate if items exist
    if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item, index) => {
            if (!item.description || !item.description.trim()) {
                errors.push(`Item ${index + 1}: Description is required`);
            }
            if (typeof item.price !== 'number' || item.price < 0) {
                errors.push(`Item ${index + 1}: Price must be valid`);
            }
        });
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Render invoice meta section (number, dates, PIN)
 */
function renderInvoiceMeta() {
    const data = currentInvoiceData;
    if (!data) return;

    document.getElementById('invoiceNumber').textContent = data.invoiceNumber || '—';
    document.getElementById('invoiceDate').textContent = formatDateUK(data.invoiceDate);
    document.getElementById('dueDate').textContent = formatDateUK(data.dueDate);
    document.getElementById('pinCode').textContent = data.pin || '—';
}

/**
 * Render payment terms
 */
function renderPaymentTerms() {
    const data = currentInvoiceData;
    if (!data) return;
    
    const termsElement = document.getElementById('paymentTermsText');
    termsElement.textContent = data.paymentTerms || 'Due within 7 days';
}

/**
 * Show validation error message
 */
function showValidationError(errors) {
    const messageEl = document.getElementById('validationMessage');
    const message = errors.length > 0 ? errors[0] : 'Invalid invoice data';
    messageEl.textContent = '⚠️ ' + message;
    messageEl.style.display = 'block';
}

/**
 * Clear validation error message
 */
function clearValidationError() {
    const messageEl = document.getElementById('validationMessage');
    messageEl.textContent = '';
    messageEl.style.display = 'none';
}

/**
 * Enable download button
 */
function enableDownloadButton() {
    const btn = document.getElementById('downloadPdfBtn');
    if (btn) {
        btn.disabled = false;
    }
}

/**
 * Disable download button
 */
function disableDownloadButton() {
    const btn = document.getElementById('downloadPdfBtn');
    if (btn) {
        btn.disabled = true;
    }
}

/**
 * Handle PDF download (using window.print)
 */
function downloadPDF() {
    if (!currentInvoiceData) {
        showValidationError(['No invoice data to print']);
        return;
    }
    window.print();
}

/**
 * Handle Print action
 */
function handlePrint() {
    if (!currentInvoiceData) {
        showValidationError(['No invoice data to print']);
        return;
    }
    window.print();
}

/**
 * Sanitize phone number for WhatsApp (remove spaces, +44 to 0, etc)
 */
function sanitizePhoneForWhatsApp(phone) {
    if (!phone) return '';
    // Remove all spaces and non-digit characters except +
    let cleaned = phone.replace(/\s/g, '');
    // Keep + at start, but convert to 44 notation for WhatsApp
    if (cleaned.startsWith('+44')) {
        cleaned = '44' + cleaned.slice(3);
    } else if (cleaned.startsWith('0')) {
        cleaned = '44' + cleaned.slice(1);
    }
    return cleaned;
}

/**
 * Build invoice link with current aptId
 */
function buildInvoiceLink() {
    if (!currentAptId) return '';
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?aptId=${encodeURIComponent(currentAptId)}`;
}

/**
 * Build message text for sharing
 */
function buildShareMessage() {
    const invoiceNum = currentInvoiceData?.invoiceNumber || 'Invoice';
    const total = currentInvoiceData?.total ? formatCurrency(currentInvoiceData.total) : 'Amount TBA';
    const link = buildInvoiceLink();
    
    return `Hello,

Your invoice is ready!

📋 Invoice Number: ${invoiceNum}
💰 Total: ${total}

View your invoice online: ${link}

You can also download the PDF from the invoice page.

Thank you!`;
}

/**
 * Open Send to Client modal
 */
function openSendModal() {
    const modal = document.getElementById('sendModal');
    const backdrop = document.getElementById('sendModalBackdrop');
    
    // Pre-fill email and phone if available
    const emailInput = document.getElementById('clientEmailInput');
    const phoneInput = document.getElementById('clientPhoneInput');
    
    if (currentInvoiceData) {
        // Try to extract email from client data
        if (currentInvoiceData.clientEmail) {
            emailInput.value = currentInvoiceData.clientEmail;
        }
        // Try to extract phone from client data
        if (currentInvoiceData.clientPhone || currentInvoiceData.phone) {
            phoneInput.value = currentInvoiceData.clientPhone || currentInvoiceData.phone || '';
        }
    }
    
    if (modal) {
        modal.style.display = 'block';
    }
    if (backdrop) {
        backdrop.style.display = 'block';
    }
}

/**
 * Close Send to Client modal
 */
function closeSendModal() {
    const modal = document.getElementById('sendModal');
    const backdrop = document.getElementById('sendModalBackdrop');
    
    if (modal) {
        modal.style.display = 'none';
    }
    if (backdrop) {
        backdrop.style.display = 'none';
    }
}

/**
 * Send invoice via email
 */
function sendViaEmail() {
    const emailInput = document.getElementById('clientEmailInput');
    const email = emailInput.value.trim();
    
    if (!email) {
        showValidationError(['Please enter a valid email address']);
        return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showValidationError(['Please enter a valid email address']);
        return;
    }
    
    const invoiceNum = currentInvoiceData?.invoiceNumber || 'Invoice';
    const subject = encodeURIComponent(`Invoice ${invoiceNum} - Transvortex LTD`);
    const body = encodeURIComponent(buildShareMessage());
    
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    
    // Show confirmation
    setTimeout(() => {
        showValidationError([`✅ Email client opened for: ${email}`]);
    }, 100);
}

/**
 * Send invoice via WhatsApp
 */
function sendViaWhatsApp() {
    const phoneInput = document.getElementById('clientPhoneInput');
    const phone = phoneInput.value.trim();
    
    if (!phone) {
        showValidationError(['Please enter a valid phone number']);
        return;
    }
    
    const sanitized = sanitizePhoneForWhatsApp(phone);
    if (!sanitized || sanitized.length < 10) {
        showValidationError(['Please enter a valid phone number']);
        return;
    }
    
    const message = encodeURIComponent(buildShareMessage());
    const whatsappUrl = `https://wa.me/${sanitized}?text=${message}`;
    
    window.open(whatsappUrl, '_blank');
    showValidationError([`✅ WhatsApp opened for: ${phone}`]);
}

/**
 * Copy invoice link to clipboard
 */
async function copyInvoiceLink() {
    const link = buildInvoiceLink();
    
    if (!link) {
        showValidationError(['Could not generate invoice link']);
        return;
    }
    
    try {
        await navigator.clipboard.writeText(link);
        showValidationError([`✅ Invoice link copied to clipboard!`]);
        
        // Reset after 3 seconds
        setTimeout(() => {
            clearValidationError();
        }, 3000);
    } catch (error) {
        console.error('Error copying to clipboard:', error);
        
        // Fallback: show link in alert
        showValidationError([`🔗 Link: ${link}`]);
    }
}

/**
 * Load invoice data from sessionStorage
 * Returns null if no data found
 */
function loadInvoiceDataFromStorage() {
    try {
        const stored = sessionStorage.getItem('tvx.invoiceData') || sessionStorage.getItem('invoiceData');
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (error) {
        console.error('Error loading invoice data from storage:', error);
    }
    return null;
}

// Global unsubscribe function for Firestore listener
let unsubscribeInvoiceListener = null;


/**
 * Wait until Firebase Auth has resolved the current user (no arbitrary timeout).
 * Resolves with the user object (or null if logged out).
 */
/**
 * Wait for auth initialization from shared auth-state module
 * ⚠️ IMPORTANT: Do NOT create another onAuthStateChanged listener here
 * Use src/core/auth-state.js instead
 */
async function waitForAuth() {
    try {
        const { waitForAuthReady } = await import('./core/auth-state.js');
        const { user } = await waitForAuthReady();
        
        currentUser = user || null;
        if (user) {
            appointmentHistoryService = new AppointmentHistoryService(db, user);
        }
        return currentUser;
    } catch (error) {
        console.error('❌ Error waiting for auth:', error);
        return null;
    }
}


/**
 * Initialize invoice page
 */
async function initInvoice() {
    if (invoiceInitialized) return;
    invoiceInitialized = true;

    console.log('%c📄 INVOICE SYSTEM DIAGNOSTICS', 'font-size: 14px; font-weight: bold; color: #FF7A24;');
    console.log('Watch for these diagnostic messages:');
    console.log('- 📊 [DIAG] Invoice listener update count - tracks onSnapshot callbacks');
    console.log('- 🔐 [DIAG] Listener count status');
    console.log('- 🧹 [Invoice] Unsubscribe logs - shown when previous listener cleaned up');
    
    // ✅ Add WebChannel error diagnostics
    console.log('%c🔌 Firestore Connection Diagnostics', 'font-size: 12px; font-weight: bold; color: #0066cc;');
    console.log('If you see WebChannel 404/400 errors: This is Firebase SDK handling transport fallback.');
    console.log('The SDK will automatically use REST transport if WebChannel is unavailable.');
    console.log('This is normal on GitHub Pages and is being handled automatically.');
    console.log('---');

    console.log('📄 [Invoice] Page loaded, initializing...');
    
    // Set up event listeners
    setupEventListeners();

    // Read aptId from URL
    const params = new URLSearchParams(window.location.search);
    const aptId = params.get('aptId');
    currentAptId = aptId;

    console.log('📍 [Invoice] aptId from URL:', aptId);

    if (!aptId) {
        showValidationError(['Missing appointment ID']);
        disableDownloadButton();
        return;
    }

    try {
        // Initialize Firebase if not already done
        if (!db) {
            console.log('🔥 [Invoice] Initializing Firebase...');
            await initializeFirebase();
            console.log('✅ [Invoice] Firebase initialized');
        }

        // Wait for user authentication (first auth state resolution)
        console.log('⏳ [Invoice] Waiting for auth state resolution...');
        await waitForAuth();
        console.log('🔐 [Invoice] Auth state resolved');

        // Check if user is authenticated
        if (!currentUser) {
            console.error('❌ [Invoice] User not authenticated - Firestore will deny access');
            showValidationError(['You must be logged in to view invoices']);
            disableDownloadButton();
            return;
        }
        
        console.log('✅ [Invoice] User authenticated:', currentUser.email, 'UID:', currentUser.uid);

        // Double-check db is initialized
        if (!db) {
            console.error('❌ [Invoice] Firebase database not initialized');
            showValidationError(['Database connection failed']);
            disableDownloadButton();
            return;
        }

        console.log('✅ [Invoice] User authenticated, setting up listener for appointment...');

        // Log invoice opened - ONCE, before setting up the snapshot
        // (moved out of snapshot callback to prevent infinite loop from Firestore writes)
        if (appointmentHistoryService && !sessionStorage.getItem(`invoiceOpened_${aptId}`)) {
            // Use setTimeout(..., 0) instead of setImmediate (better browser compatibility)
            setTimeout(async () => {
                try {
                    await appointmentHistoryService.logEvent(aptId, 'INVOICE_OPENED', {
                        invoiceNumber: 'pending'
                    });
                    sessionStorage.setItem(`invoiceOpened_${aptId}`, 'true');
                    console.log('✅ [Invoice] History logged - INVOICE_OPENED');
                } catch (err) {
                    console.warn('⚠️ [Invoice] Could not log history event:', err);
                }
            }, 0);
        }

        // Import Firestore functions
        const { doc, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        // Use onSnapshot for live updates
        console.log('🔐 [Invoice] Setting up Firestore listener for aptId:', aptId, 'with user:', currentUser.uid);
        
        // CRITICAL FIX: Unsubscribe previous listener if it exists to prevent duplicate listeners
        if (unsubscribeInvoiceListener) {
            console.log('🧹 [Invoice] Unsubscribing from previous listener...');
            unsubscribeInvoiceListener();
            unsubscribeInvoiceListener = null;
            invoiceListenerCount = 0;
        }
        
        unsubscribeInvoiceListener = onSnapshot(
            doc(db, 'appointments', aptId),
            (snap) => {
                console.log('📊 [Invoice] onSnapshot fired - Firestore document received:', { exists: snap.exists(), id: snap.id });
                invoiceListenerCount++;
                console.log(`📊 [DIAG] Invoice listener update #${invoiceListenerCount}`);
                
                if (snap.exists()) {
                    console.log('✅ [Invoice] Appointment document found in Firestore');
                    const appointment = { id: snap.id, ...snap.data() };
                    const normalizedData = normalizeAppointmentData(appointment);
                    renderInvoiceFromAppointment(normalizedData);
                    
                    // 🔴 REMOVED: History logging from snapshot callback to prevent infinite loop
                    // History logging was causing updateDoc → updates document → triggers snapshot again
                    // History logging only belongs in explicit user action handlers, not in automatic Firestore updates
                } else {
                    console.error('❌ [Invoice] Appointment document does not exist');
                    showValidationError(['Appointment not found in database']);
                    disableDownloadButton();
                }
            },
            (error) => {
                console.error('❌ [Invoice] Firestore listener error:', error);
                showValidationError(['Error loading appointment: ' + error.message]);
                disableDownloadButton();
            }
        );
        
        console.log(`🔐 [DIAG] Invoice listener attached (ID: ${aptId}). Total listeners: 1`);

    } catch (error) {
        console.error('❌ [Invoice] Error initializing:', error);
        showValidationError(['Error loading appointment. Check console.']);
        disableDownloadButton();
    }
}

/**
 * Initialize Firebase (single source)
 */
async function initializeFirebase() {
    try {
        if (firebaseInitialized) {
            return;
        }

        const { initFirebase, logFirebaseStatus } = await import('./config/firebase.js');
        const { initAuthListener, onAuthStateChange } = await import('./core/auth-state.js');

        console.log("🔥 Firebase SDK: Initializing (Invoice, single source)...");

        const { app: fbApp, auth: fbAuth, db: fbDb } = initFirebase();

        app = fbApp;
        auth = fbAuth;
        db = fbDb;

        // Log Firebase status
        logFirebaseStatus();

        await initAuthListener();

        onAuthStateChange(async (user, isAdminFlag) => {
            currentUser = user;
            isAdmin = isAdminFlag || false;
            if (user) {
                console.log(`✅ User authenticated on invoice: ${user.email}`);
                console.log(`👑 Admin status: ${isAdmin}`);
                
                // Disable/enable edit button based on admin status
                const editBtn = document.getElementById('editBtn');
                if (editBtn) {
                    if (isAdmin) {
                        editBtn.disabled = false;
                        editBtn.title = 'Edit Invoice';
                    } else {
                        editBtn.disabled = true;
                        editBtn.title = 'Only administrators can edit invoices';
                        editBtn.style.opacity = '0.5';
                        editBtn.style.cursor = 'not-allowed';
                    }
                }
                
                // Invoice data loading is handled by initInvoice() snapshot listener
                // No need to call loadInvoiceData() here
            } else {
                console.log("🔓 User logged out (invoice)");
                isAdmin = false;
            }
        });

        firebaseInitialized = true;

    } catch (error) {
        console.error("❌ Firebase initialization error:", error);
        showValidationError(['Firebase initialization failed']);
        disableDownloadButton();
    }
}

/**
 * Set up event listeners
 */
// Global state for invoice editing
let isEditMode = false;
let currentAptId = null;
let appointmentHistoryService = null;
let originalInvoiceData = null;  // Deep clone for cancel/reset
let draftData = {};  // Working copy during edit mode

function setupEventListeners() {
    if (invoiceListenersBound) return;

    const downloadBtn = document.getElementById('downloadPdfBtn');
    const printBtn = document.getElementById('printBtn');
    const sendBtn = document.getElementById('sendBtn');
    const editBtn = document.getElementById('editBtn');
    const backBtn = document.getElementById('backBtn');
    
    // Send modal buttons
    const closeSendModalBtn = document.getElementById('closeSendModal');
    const closeSendModalFooterBtn = document.getElementById('closeSendModalFooter');
    const sendEmailBtn = document.getElementById('sendEmailBtn');
    const sendWhatsAppBtn = document.getElementById('sendWhatsAppBtn');
    const copyLinkBtn = document.getElementById('copyLinkBtn');
    const sendModalBackdrop = document.getElementById('sendModalBackdrop');

    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadPDF);
    }

    if (printBtn) {
        printBtn.addEventListener('click', handlePrint);
    }

    if (sendBtn) {
        sendBtn.addEventListener('click', openSendModal);
    }

    if (editBtn) {
        editBtn.addEventListener('click', toggleEditMode);
    }

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            // Clear invoice data
            sessionStorage.removeItem('tvx.invoiceData');
            sessionStorage.removeItem('invoiceData');
            // Go back to previous page or home
            window.history.back();
        });
    }

    // Send modal event listeners
    if (closeSendModalBtn) {
        closeSendModalBtn.addEventListener('click', closeSendModal);
    }

    if (closeSendModalFooterBtn) {
        closeSendModalFooterBtn.addEventListener('click', closeSendModal);
    }

    if (sendEmailBtn) {
        sendEmailBtn.addEventListener('click', sendViaEmail);
    }

    if (sendWhatsAppBtn) {
        sendWhatsAppBtn.addEventListener('click', sendViaWhatsApp);
    }

    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', copyInvoiceLink);
    }

    if (sendModalBackdrop) {
        sendModalBackdrop.addEventListener('click', closeSendModal);
    }

    // Keyboard shortcuts in send modal
    const emailInput = document.getElementById('clientEmailInput');
    const phoneInput = document.getElementById('clientPhoneInput');

    if (emailInput) {
        emailInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendViaEmail();
            }
        });
    }

    if (phoneInput) {
        phoneInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendViaWhatsApp();
            }
        });
    }

    invoiceListenersBound = true;
}

/**
 * Toggle edit mode
 */
/**
 * Toggle edit mode - Open edit form with mobile-friendly UI
 */
function toggleEditMode() {
    if (!isAdmin) {
        showValidationError(['Only administrators can edit invoices']);
        return;
    }

    if (isEditMode) {
        // Already in edit mode, don't toggle (use Cancel instead)
        return;
    }

    if (!currentInvoiceData) {
        showValidationError(['No invoice data to edit']);
        return;
    }

    isEditMode = true;
    
    // Deep clone current data for undo/cancel
    originalInvoiceData = JSON.parse(JSON.stringify(currentInvoiceData));
    
    // Initialize draft data from current invoice
    draftData = {
        client: {
            name: currentInvoiceData.client?.name || '',
            address: currentInvoiceData.client?.address || '',
            phone: currentInvoiceData.client?.phone || '',
            vehicle: currentInvoiceData.client?.vehicle || '',
            regPlate: currentInvoiceData.client?.regPlate || '',
            mileage: currentInvoiceData.client?.mileage || ''
        },
        services: (currentInvoiceData.services || []).map(s => ({
            description: s.description || '',
            qty: s.qty || 1,
            price: s.price || 0
        })),
        parts: (currentInvoiceData.parts || []).map(p => ({
            description: p.description || '',
            qty: p.qty || 1,
            price: p.price || 0
        })),
        notes: currentInvoiceData.notes || '',
        vatRate: currentInvoiceData.vatRate || 0,
        payment: {
            amountPaid: currentInvoiceData.amountPaid || 0,
            paymentMethod: currentInvoiceData.paymentMethod || '',
            paymentDate: currentInvoiceData.paymentDate || ''
        },
        total: currentInvoiceData.total || 0
    };

    // Show edit form
    const editOverlay = document.getElementById('editModeOverlay');
    const invoiceContainer = document.querySelector('.invoice-container');
    
    if (editOverlay) {
        editOverlay.style.display = 'block';
    }
    if (invoiceContainer) {
        invoiceContainer.style.display = 'none';
    }

    // Hide main action buttons
    const editBtn = document.getElementById('editBtn');
    const printBtn = document.getElementById('printBtn');
    const sendBtn = document.getElementById('sendBtn');
    const downloadBtn = document.getElementById('downloadPdfBtn');
    
    if (editBtn) editBtn.style.display = 'none';
    if (printBtn) printBtn.style.display = 'none';
    if (sendBtn) sendBtn.style.display = 'none';
    if (downloadBtn) downloadBtn.style.display = 'none';

    // Build and populate edit form
    buildEditForm();
    setupEditEventListeners();

    console.log('✏️ [Invoice] Edit mode enabled');
}

/**
 * Build edit form UI from draft data
 */
function buildEditForm() {
    // Populate client fields
    populateClientFields();
    
    // Populate services
    populateServicesSection();
    
    // Populate parts
    populatePartsSection();
    
    // Populate notes
    const notesInput = document.querySelector('[data-field="notes"]');
    if (notesInput) {
        notesInput.value = draftData.notes || '';
    }
    
    // Populate payment fields
    populatePaymentFields();
}

/**
 * Populate client fields in edit form
 */
function populateClientFields() {
    const clientFields = {
        'client.name': draftData.client?.name || '',
        'client.address': draftData.client?.address || '',
        'client.phone': draftData.client?.phone || '',
        'client.vehicle': draftData.client?.vehicle || '',
        'client.regPlate': draftData.client?.regPlate || '',
        'client.mileage': draftData.client?.mileage || ''
    };

    Object.entries(clientFields).forEach(([fieldName, value]) => {
        const input = document.querySelector(`[data-field="${fieldName}"]`);
        if (input) {
            input.value = value;
        }
    });
}

/**
 * Render service rows in edit form
 */
function populateServicesSection() {
    const container = document.getElementById('servicesEditContainer');
    if (!container) return;

    container.innerHTML = '';

    (draftData.services || []).forEach((service, index) => {
        const row = createEditItemRow('service', index, service);
        container.appendChild(row);
    });
}

/**
 * Render part rows in edit form
 */
function populatePartsSection() {
    const container = document.getElementById('partsEditContainer');
    if (!container) return;

    container.innerHTML = '';

    (draftData.parts || []).forEach((part, index) => {
        const row = createEditItemRow('part', index, part);
        container.appendChild(row);
    });
}

/**
 * Populate payment fields in edit form
 */
function populatePaymentFields() {
    const amountPaidInput = document.querySelector('[data-field="payment.amountPaid"]');
    const paymentMethodSelect = document.querySelector('[data-field="payment.paymentMethod"]');
    const paymentDateInput = document.querySelector('[data-field="payment.paymentDate"]');

    if (amountPaidInput) {
        amountPaidInput.value = draftData.payment?.amountPaid || 0;
    }
    if (paymentMethodSelect) {
        paymentMethodSelect.value = draftData.payment?.paymentMethod || '';
    }
    if (paymentDateInput) {
        paymentDateInput.value = draftData.payment?.paymentDate || '';
    }
}

/**
 * Mark invoice as fully paid
 */
function markInvoiceAsPaid() {
    if (!draftData.payment) {
        draftData.payment = {};
    }

    const total = draftData.total || 0;
    draftData.payment.amountPaid = total;
    draftData.payment.paymentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Update UI
    populatePaymentFields();
}

/**
 * Clear payment data
 */
function clearPaymentData() {
    if (!draftData.payment) {
        draftData.payment = {};
    }

    draftData.payment.amountPaid = 0;
    draftData.payment.paymentMethod = '';
    draftData.payment.paymentDate = '';

    // Update UI
    populatePaymentFields();
}

/**
 * Compute balance due
 */
function computeBalanceDue(total, amountPaid) {
    return Math.max(0, total - (amountPaid || 0));
}

/**
 * Compute payment status
 */
function computePaymentStatus(total, amountPaid) {
    const paid = amountPaid || 0;
    if (paid === 0) return 'Unpaid';
    if (paid >= total) return 'Paid';
    return 'Partially Paid';
}

/**
 * Create editable row for service or part
 */
function createEditItemRow(type, index, item) {
    const row = document.createElement('div');
    row.className = 'edit-item-row';
    row.dataset.type = type;
    row.dataset.index = index;

    row.innerHTML = `
        <div>
            <div class="edit-item-label">Description</div>
            <input type="text" data-item-field="description" value="${escapeHtml(item.description || '')}" class="edit-input" placeholder="Description">
        </div>
        <div>
            <div class="edit-item-label">Qty</div>
            <input type="number" data-item-field="qty" value="${item.qty || 1}" min="1" class="edit-input" style="width: 80px;">
        </div>
        <div>
            <div class="edit-item-label">Price (£)</div>
            <input type="number" data-item-field="price" value="${item.price || 0}" step="0.01" min="0" class="edit-input" style="width: 100px;">
        </div>
        <button type="button" class="edit-item-remove" data-remove-item>✕</button>
    `;

    // Remove button listener
    row.querySelector('[data-remove-item]').addEventListener('click', (e) => {
        e.preventDefault();
        const itemType = row.dataset.type === 'service' ? 'services' : 'parts';
        const itemIndex = parseInt(row.dataset.index);
        draftData[itemType].splice(itemIndex, 1);
        if (itemType === 'service') {
            populateServicesSection();
        } else {
            populatePartsSection();
        }
    });

    return row;
}

/**
 * Setup edit form event listeners (event delegation)
 */
function setupEditEventListeners() {
    const form = document.getElementById('invoiceEditForm');
    if (!form) return;

    // Input change listener for client fields
    form.addEventListener('change', (e) => {
        if (e.target.dataset.field) {
            updateDraftData(e.target.dataset.field, e.target.value);
        }
    });

    // Input listener for real-time editing (without waiting for blur)
    form.addEventListener('input', (e) => {
        if (e.target.dataset.field) {
            updateDraftData(e.target.dataset.field, e.target.value);
        }

        // Update services/parts from item inputs
        if (e.target.dataset.itemField) {
            const row = e.target.closest('.edit-item-row');
            if (row) {
                const type = row.dataset.type === 'service' ? 'services' : 'parts';
                const index = parseInt(row.dataset.index);
                const field = e.target.dataset.itemField;

                if (draftData[type][index]) {
                    if (field === 'qty' || field === 'price') {
                        draftData[type][index][field] = parseFloat(e.target.value) || 0;
                    } else {
                        draftData[type][index][field] = e.target.value;
                    }
                }
            }
        }
    });

    // Add service button
    const addServiceBtn = document.getElementById('addServiceBtn');
    if (addServiceBtn) {
        addServiceBtn.addEventListener('click', (e) => {
            e.preventDefault();
            draftData.services.push({ description: '', qty: 1, price: 0 });
            populateServicesSection();
        });
    }

    // Add part button
    const addPartBtn = document.getElementById('addPartBtn');
    if (addPartBtn) {
        addPartBtn.addEventListener('click', (e) => {
            e.preventDefault();
            draftData.parts.push({ description: '', qty: 1, price: 0 });
            populatePartsSection();
        });
    }

    // Save button
    const saveBtn = document.getElementById('editSaveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveInvoiceChanges);
    }

    // Cancel button
    const cancelBtn = document.getElementById('editCancelBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', cancelEditMode);
    }

    // Mark as Paid button
    const markAsPaidBtn = document.getElementById('markAsPaidBtn');
    if (markAsPaidBtn) {
        markAsPaidBtn.addEventListener('click', (e) => {
            e.preventDefault();
            markInvoiceAsPaid();
        });
    }

    // Clear Payment button
    const clearPaymentBtn = document.getElementById('clearPaymentBtn');
    if (clearPaymentBtn) {
        clearPaymentBtn.addEventListener('click', (e) => {
            e.preventDefault();
            clearPaymentData();
        });
    }
}

/**
 * Cancel edit mode without saving
 */
function cancelEditMode() {
    isEditMode = false;
    
    // Hide edit overlay
    const editOverlay = document.getElementById('editModeOverlay');
    const invoiceContainer = document.querySelector('.invoice-container');
    
    if (editOverlay) {
        editOverlay.style.display = 'none';
    }
    if (invoiceContainer) {
        invoiceContainer.style.display = 'block';
    }

    // Show main action buttons
    const editBtn = document.getElementById('editBtn');
    const printBtn = document.getElementById('printBtn');
    const sendBtn = document.getElementById('sendBtn');
    const downloadBtn = document.getElementById('downloadPdfBtn');
    
    if (editBtn && isAdmin) editBtn.style.display = 'inline-block';
    if (printBtn) printBtn.style.display = 'inline-block';
    if (sendBtn) sendBtn.style.display = 'inline-block';
    if (downloadBtn) downloadBtn.style.display = 'inline-block';

    // Clear edit state
    draftData = {};
    originalInvoiceData = null;

    clearValidationError();
    console.log('❌ [Invoice] Edit mode cancelled');
}

/**
 * Update draft data using dot notation path
 */
function updateDraftData(path, value) {
    const parts = path.split('.');
    let obj = draftData;

    for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]]) {
            obj[parts[i]] = {};
        }
        obj = obj[parts[i]];
    }

    obj[parts[parts.length - 1]] = value;
}

/**
 * Get data from dot notation path
 */
function getDraftData(path) {
    const parts = path.split('.');
    let obj = draftData;

    for (const part of parts) {
        obj = obj?.[part];
        if (obj === undefined) return undefined;
    }

    return obj;
}

/**
 * Escape HTML to prevent injection
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Save invoice changes to Firestore
 */
async function saveInvoiceChanges(e) {
    if (e) {
        e.preventDefault();
    }

    if (!currentAptId || !currentUser || !isAdmin) {
        showValidationError(['Not authenticated or not admin']);
        return;
    }

    try {
        const saveBtn = document.getElementById('editSaveBtn');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '💾 Saving...';
        }

        // Validate data
        const validation = validateEditData(draftData);
        if (!validation.isValid) {
            showValidationError(validation.errors);
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '💾 Save Changes';
            }
            return;
        }

        // Prepare update object
        const updateData = {
            // Client info
            name: draftData.client?.name || '',
            address: draftData.client?.address || '',
            phone: draftData.client?.phone || '',
            carMakeModel: draftData.client?.vehicle || '',
            regPlate: draftData.client?.regPlate || '',
            mileage: draftData.client?.mileage || '',
            
            // Services and parts
            services: draftData.services || [],
            parts: draftData.parts || [],
            
            // Notes
            notes: draftData.notes || '',
            
            // Payment info
            amountPaid: parseFloat(draftData.payment?.amountPaid) || 0,
            paymentMethod: draftData.payment?.paymentMethod || '',
            paymentDate: draftData.payment?.paymentDate || '',
            
            // Metadata
            invoiceUpdatedAt: new Date().toISOString(),
            invoiceUpdatedBy: currentUser.uid || currentUser.email
        };

        // Update Firestore
        const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        await updateDoc(doc(db, 'appointments', currentAptId), updateData);

        // Log to history
        if (appointmentHistoryService) {
            await appointmentHistoryService.logInvoiceUpdated(
                currentAptId,
                currentInvoiceData?.invoiceNumber,
                {
                    services: draftData.services?.length || 0,
                    parts: draftData.parts?.length || 0
                }
            );
        }

        // Success - exit edit mode
        showValidationError(['✅ Invoice saved successfully!']);
        
        setTimeout(() => {
            isEditMode = false;
            cancelEditMode();
            // The Firestore listener will update the view automatically
        }, 1000);

    } catch (error) {
        console.error('[Invoice] Save error:', error);
        showValidationError(['Error saving invoice: ' + (error.message || 'Unknown error')]);
    } finally {
        const saveBtn = document.getElementById('editSaveBtn');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '💾 Save Changes';
        }
    }
}

/**
 * Validate edit data
 */
function validateEditData(data) {
    const errors = [];

    if (!data.client?.name?.trim()) {
        errors.push('Client name is required');
    }

    if (!data.services || data.services.length === 0) {
        errors.push('At least one service is required');
    }

    // Validate services
    data.services.forEach((service, i) => {
        if (!service.description?.trim()) {
            errors.push(`Service ${i + 1}: Description is required`);
        }
        if (service.qty < 1) {
            errors.push(`Service ${i + 1}: Quantity must be at least 1`);
        }
        if (service.price < 0) {
            errors.push(`Service ${i + 1}: Price cannot be negative`);
        }
    });

    // Validate parts (optional but if present, validate)
    if (data.parts) {
        data.parts.forEach((part, i) => {
            if (part.description?.trim() && part.price < 0) {
                errors.push(`Part ${i + 1}: Price cannot be negative`);
            }
        });
    }

    // Validate payment (optional but if present, validate)
    if (data.payment) {
        const amountPaid = parseFloat(data.payment.amountPaid) || 0;
        if (amountPaid < 0) {
            errors.push('Amount paid cannot be negative');
        }
        // Note: We allow amountPaid > total for cases like overpayment or deposits
    }

    return {
        isValid: errors.length === 0,
        errors: errors.length === 0 ? ['All data valid'] : errors
    };
}

/**
 * Normalize and extract appointment data from Firestore
 * Supports multiple field name variations for compatibility
 * @param {object} apt - Raw appointment document
 * @returns {object} Normalized appointment data
 */
function normalizeAppointmentData(apt) {
    if (!apt) return null;

    console.log('📋 [Invoice] Raw appointment data:', apt);

    // Apply invoice overrides (from Invoice tab) if present
    const overrides = (apt && typeof apt === 'object' && apt.invoiceOverrides && typeof apt.invoiceOverrides === 'object')
        ? apt.invoiceOverrides
        : {};

    // Helper: extract first non-empty value
    const getFirstValue = (...values) => {
        return values.find(v => v !== null && v !== undefined && v !== '') || '';
    };

    // Client data with fallback to multiple field names
    const client = {
        name: getFirstValue(overrides.customerName, overrides.clientName, overrides.name, apt.customerName, apt.clientName, apt.name || ''),
        phone: getFirstValue(overrides.phone, overrides.customerPhone, overrides.tel, overrides.telefon, apt.phone, apt.customerPhone, apt.tel, apt.telefon || ''),
        address: getFirstValue(overrides.address, overrides.location, overrides.clientAddress, apt.address, apt.location, apt.clientAddress || ''),
        vehicle: getFirstValue(
            overrides.carMakeModel,
            overrides.vehicleMakeModel,
            overrides.makeModel,
            overrides.make,
            apt.carMakeModel, 
            apt.vehicleMakeModel, 
            apt.makeModel,
            apt.make || ''
        ),
        regPlate: getFirstValue(
            overrides.registrationPlate,
            overrides.regPlate,
            overrides.regNumber,
            overrides.plate,
            overrides.registration,
            apt.registrationPlate, 
            apt.regPlate, 
            apt.regNumber, 
            apt.plate,
            apt.registration || ''
        ),
        mileage: overrides.mileage || overrides.km || apt.mileage || apt.km || ''
    };

    // Services array - normalize from Firestore structure
    let services = [];
    if (Array.isArray(apt.services)) {
        services = apt.services
            .filter(s => s && (s.name || s.description))  // Filter out invalid items
            .map(s => ({
                description: s.name || s.description || 'Service',
                price: parseFloat(s.price) || 0,
                qty: 1  // Firestore structure uses price directly, not qty*unitPrice
            }))
            .filter(s => s.price > 0);  // Only include items with price > 0
    }

    // Parts array - normalize from Firestore structure
    let parts = [];
    if (Array.isArray(apt.parts)) {
        parts = apt.parts
            .filter(p => p && (p.name || p.description))
            .map(p => ({
                description: p.name || p.description || 'Part',
                price: parseFloat(p.price) || 0,
                qty: 1
            }))
            .filter(p => p.price > 0);
    }

    // Combine services and parts into items array for invoice template
    const items = [...services, ...parts];

    // Calculate totals
    let subtotal = 0;
    let vatRate = 0;
    let vatAmount = 0;
    let total = 0;

    // If appointment has pre-calculated totals, use them; otherwise compute
    if (typeof apt.subtotal === 'number') {
        subtotal = apt.subtotal;
    } else {
        subtotal = services.reduce((sum, s) => sum + s.price, 0) + 
                   parts.reduce((sum, p) => sum + p.price, 0) + 
                   (parseFloat(overrides.extras ?? apt.extras) || 0);
    }

    // VAT handling
    if ((overrides.vatEnabled ?? apt.vatEnabled) && (overrides.vatRate ?? apt.vatRate)) {
        const _vr = parseFloat(overrides.vatRate ?? apt.vatRate);
        vatRate = (_vr * 100) || 0;  // Convert 0.2 to 20%
        vatAmount = subtotal * _vr;
    } else if (typeof apt.vatAmount === 'number') {
        vatAmount = apt.vatAmount;
        if (subtotal > 0) {
            vatRate = (vatAmount / subtotal) * 100;
        }
    }

    if (typeof apt.total === 'number') {
        total = apt.total;
    } else {
        total = subtotal + vatAmount;
    }

    // Invoice dates
    let invoiceDate = null;
    if (apt.dateStr) {
        invoiceDate = apt.dateStr;
    } else if (apt.finalizedAt) {
        const d = apt.finalizedAt.toDate ? apt.finalizedAt.toDate() : new Date(apt.finalizedAt);
        invoiceDate = d.toISOString().split('T')[0];
    } else if (apt.createdAt) {
        const d = apt.createdAt.toDate ? apt.createdAt.toDate() : new Date(apt.createdAt);
        invoiceDate = d.toISOString().split('T')[0];
    } else {
        invoiceDate = new Date().toISOString().split('T')[0];
    }

    const normalized = {
        client,
        items,
        services,
        parts,
        invoiceNumber: apt.invoiceNumber || '',
        pin: apt.pin || '',
        invoiceDate,
        subtotal,
        vatRate: vatRate ? Math.round(vatRate) : 0,  // Round to nearest integer for display
        vatAmount,
        total,
        paymentTerms: overrides.paymentTerms || apt.paymentTerms || 'Due within 7 days',
        extras: parseFloat(overrides.extras ?? apt.extras) || 0,
        // Payment info
        amountPaid: parseFloat(apt.amountPaid) || 0,
        paymentMethod: apt.paymentMethod || '',
        paymentDate: apt.paymentDate || '',
        notes: apt.notes || ''
    };

    console.log('✅ [Invoice] Normalized data:', normalized);
    return normalized;
}

/**
 * Helper: Show/hide an element pair (label + value)
 * @param {string} valueId - ID of the value element
 * @param {string|null} value - The value to display
 * @param {boolean} required - If true, show "N/A" for empty values; if false, hide completely
 */
function setFieldVisibility(valueId, value, required = false) {
    const valueEl = document.getElementById(valueId);
    if (!valueEl) return;

    const labelEl = valueEl.previousElementSibling;

    const isEmpty = !value || (typeof value === 'string' && !value.trim());

    if (isEmpty) {
        if (required) {
            valueEl.textContent = 'N/A';
            if (labelEl) labelEl.style.display = '';
            valueEl.style.display = '';
        } else {
            if (labelEl) labelEl.style.display = 'none';
            valueEl.style.display = 'none';
        }
    } else {
        valueEl.textContent = value;
        if (labelEl) labelEl.style.display = '';
        valueEl.style.display = '';
    }
}

/**
 * Render invoice bill-to section with conditional field visibility
 */
function renderBillToOptimized(normalizedData) {
    if (!normalizedData || !normalizedData.client) return;

    const client = normalizedData.client;

    // Client name (required)
    setFieldVisibility('clientName', client.name, true);

    // Phone (optional)
    setFieldVisibility('clientPhone', client.phone, false);

    // Address (optional)
    setFieldVisibility('clientAddress', client.address, false);

    // Vehicle (optional)
    setFieldVisibility('vehicleMakeModel', client.vehicle, false);

    // Registration plate (optional)
    setFieldVisibility('vehicleRegPlate', client.regPlate, false);

    // Mileage (optional)
    setFieldVisibility('vehicleMileage', client.mileage, false);
}

/**
 * Render services table - only valid items, no empty rows
 */
function renderServicesOptimized(normalizedData) {
    const tbody = document.getElementById('servicesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const items = normalizedData && Array.isArray(normalizedData.items) 
        ? normalizedData.items.filter(item => item && item.price > 0)
        : [];

    if (items.length === 0) {
        // Hide services section entirely if no items
        const servicesSection = document.querySelector('.services-section');
        if (servicesSection) {
            servicesSection.style.display = 'none';
        }
        return;
    }

    // Show services section if there are items
    const servicesSection = document.querySelector('.services-section');
    if (servicesSection) {
        servicesSection.style.display = '';
    }

    items.forEach(item => {
        const row = document.createElement('tr');
        const price = parseFloat(item.price) || 0;

        row.innerHTML = `
            <td class="col-description">${item.description || 'Item'}</td>
            <td class="col-qty">1</td>
            <td class="col-unit-price">${formatCurrency(price)}</td>
            <td class="col-line-total">${formatCurrency(price)}</td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * Render totals with proper VAT handling
 */
function renderTotalsOptimized(normalizedData) {
    if (!normalizedData) return;

    const subtotal = parseFloat(normalizedData.subtotal) || 0;
    const vatRate = parseFloat(normalizedData.vatRate) || 0;
    const vatAmount = parseFloat(normalizedData.vatAmount) || 0;
    const total = parseFloat(normalizedData.total) || 0;

    // Render subtotal
    document.getElementById('subtotal').textContent = formatCurrency(subtotal);

    // Render total
    document.getElementById('total').textContent = formatCurrency(total);

    // Show/hide VAT row
    const vatRow = document.getElementById('vatRow');
    if (vatRate > 0 && vatAmount > 0) {
        vatRow.style.display = 'flex';
        document.getElementById('vatPercent').textContent = vatRate.toString();
        document.getElementById('vatAmount').textContent = formatCurrency(vatAmount);
    } else {
        vatRow.style.display = 'none';
    }

    // Payment information
    const amountPaid = parseFloat(normalizedData.amountPaid) || 0;
    const balanceDue = computeBalanceDue(total, amountPaid);
    const paymentStatus = computePaymentStatus(total, amountPaid);

    // Show/hide payment rows
    const amountPaidRow = document.getElementById('amountPaidRow');
    const balanceDueRow = document.getElementById('balanceDueRow');
    const paymentStatusRow = document.getElementById('paymentStatusRow');

    if (amountPaid > 0) {
        // Show payment info
        if (amountPaidRow) {
            amountPaidRow.style.display = 'flex';
            document.getElementById('amountPaid').textContent = formatCurrency(amountPaid);
        }
        if (balanceDueRow) {
            balanceDueRow.style.display = 'flex';
            document.getElementById('balanceDue').textContent = formatCurrency(balanceDue);
        }
        if (paymentStatusRow) {
            paymentStatusRow.style.display = 'flex';
            const statusBadge = document.getElementById('paymentStatus');
            if (statusBadge) {
                statusBadge.textContent = paymentStatus;
                // Remove all status classes
                statusBadge.classList.remove('status-unpaid', 'status-partial', 'status-paid');
                // Add appropriate status class
                if (paymentStatus === 'Unpaid') {
                    statusBadge.classList.add('status-unpaid');
                } else if (paymentStatus === 'Partially Paid') {
                    statusBadge.classList.add('status-partial');
                } else if (paymentStatus === 'Paid') {
                    statusBadge.classList.add('status-paid');
                }
            }
        }
    } else {
        // Hide payment rows if no payment
        if (amountPaidRow) amountPaidRow.style.display = 'none';
        if (balanceDueRow) balanceDueRow.style.display = 'none';
        if (paymentStatusRow) paymentStatusRow.style.display = 'none';
    }
}

/**
 * Render complete invoice from normalized appointment data
 */
function renderInvoiceFromAppointment(normalizedData) {
    if (!normalizedData) {
        showValidationError(['Failed to normalize appointment data']);
        disableDownloadButton();
        return;
    }

    // Use stored invoice identifiers if present
    const invoiceNumber = normalizedData.invoiceNumber || '';
    const dueDate = calculateDueDate(normalizedData.invoiceDate);

    // Store for later use
    currentInvoiceData = {
        invoiceNumber,
        invoiceDate: normalizedData.invoiceDate,
        dueDate,
        pin: normalizedData.pin || '',
        ...normalizedData
    };

    // Render sections
    renderInvoiceMeta();
    renderBillToOptimized(normalizedData);
    renderServicesOptimized(normalizedData);
    renderTotalsOptimized(normalizedData);
    renderPaymentTerms();

    // Enable buttons
    enableDownloadButton();
    clearValidationError();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initInvoice);

// Cleanup Firestore listener when page unloads
window.addEventListener('beforeunload', () => {
    if (unsubscribeInvoiceListener) {
        unsubscribeInvoiceListener();
        console.log('🧹 [Invoice] Firestore listener cleaned up');
    }
});
