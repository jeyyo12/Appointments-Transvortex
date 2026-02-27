/**
 * Invoice Renderer Module
 * Converts invoiceData objects into DOM-rendered invoices
 * Supports dynamic content, validation, and print-to-PDF via window.print()
 * 
 * LOADING FLOW (Prevents FOUC and double render):
 * 1. HTML loads with:
 *    - #invoiceLoading visible (loading overlay)
 *    - #invoiceApp hidden (.app-hidden class)
 * 2. DOMContentLoaded → initInvoice()
 * 3. Wait for Firebase auth resolution
 * 4. Set up Firestore onSnapshot listener
 * 5. First snapshot → renderInvoiceFromAppointment(data)
 * 6. After render → showInvoiceApp()
 *    - Fades out #invoiceLoading
 *    - Shows #invoiceApp (.app-ready class)
 * 7. Subsequent snapshots → update DOM (no re-show)
 * 
 * This ensures:
 * - No placeholder flash (INV-000000, dashes)
 * - Loading skeleton visible until data ready
 * - Single initial render
 * - Proper service worker cache handling
 */

import { ADMIN_UIDS } from './config/firebase.config.js';
import { COMPANY_ADDRESS } from './shared/company-settings.js';

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
let storage = null;
let currentUser = null;
let isAdmin = false;

// Global state
let currentInvoiceData = null;
let hasRenderedOnce = false; // Prevent double render
let currentInvoiceId = null; // ID of invoice being viewed/edited (from invoices collection)
let currentInvoiceEditMode = 'standard';

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

// Diagnostic function to check invoice data
window.debugInvoice = () => {
    if (!currentInvoiceData) {
        console.log('❌ No invoice data loaded yet');
        return;
    }
    console.log('=== INVOICE DATA DEBUG ===');
    console.log('Invoice Number:', currentInvoiceData.invoiceNumber);
    console.log('Client:', currentInvoiceData.client);
    console.log('Services:', currentInvoiceData.services);
    console.log('Parts:', currentInvoiceData.parts);
    console.log('Items:', currentInvoiceData.items);
    console.log('---');
    console.log('Subtotal:', currentInvoiceData.subtotal);
    console.log('VAT Rate:', currentInvoiceData.vatRate, '%');
    console.log('VAT Amount:', currentInvoiceData.vatAmount);
    console.log('TOTAL:', currentInvoiceData.total);
    console.log('---');
    console.log('Amount Paid:', currentInvoiceData.amountPaid);
    console.log('Payment Method:', currentInvoiceData.paymentMethod);
    console.log('Payment Date:', currentInvoiceData.paymentDate);
    console.log('---');
    const balanceDue = computeBalanceDue(currentInvoiceData.total, currentInvoiceData.amountPaid);
    const paymentStatus = computePaymentStatus(currentInvoiceData.total, currentInvoiceData.amountPaid);
    console.log('Balance Due:', balanceDue);
    console.log('Payment Status:', paymentStatus);
    console.log('================');
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
 * Alias for formatCurrency - formatGBP for clarity
 */
function formatGBP(value) {
    return formatCurrency(value);
}

function toDateValue(value) {
    if (!value) return null;
    if (value.toDate) return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value === 'string') {
        const parsed = new Date(value);
        return isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
}

function toISODateString(value) {
    const date = toDateValue(value);
    if (!date) return '';
    return date.toISOString().split('T')[0];
}

function normalizeVehicleFromInvoiceData(data = {}) {
    const normalizeText = (value) => (value === undefined || value === null ? '' : String(value).trim());
    const pick = (...values) => {
        for (const value of values) {
            const text = normalizeText(value);
            if (text) return text;
        }
        return '';
    };

    const regPlate = pick(data.regPlate, data.vehicleReg, data.client?.regPlate);
    const makeModel = pick(data.vehicleMakeModel, data.makeModel, data.client?.vehicle, data.client?.makeModel);
    const mileageRaw = data.mileage ?? data.client?.mileage ?? '';
    const mileage = normalizeText(mileageRaw);

    return { regPlate, makeModel, mileage };
}

function addDaysISO(baseDateISO, days) {
    const base = baseDateISO ? new Date(baseDateISO) : new Date();
    base.setDate(base.getDate() + days);
    return base.toISOString().split('T')[0];
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
 * Generate invoice number \u2014 canonical format matching invoice-manager.js.
 * Format: INV-{RANDOM}-{YYMMDD}
 * Note: invoice.js is standalone (loaded by invoice.html) so it cannot
 * import from invoice-manager. Keep in sync with the canonical format manually.
 */
function generateInvoiceNumberStandalone() {
    const now = new Date();
    const dateStr = now.toISOString().slice(2, 8).replace(/-/g, ''); // YYMMDD
    const random = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `INV-${random}-${dateStr}`;
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
 * Show invoice app and hide loading overlay
 */
function showInvoiceApp() {
    const loadingOverlay = document.getElementById('invoiceLoading');
    const invoiceApp = document.getElementById('invoiceApp');
    
    if (loadingOverlay && invoiceApp) {
        // Fade out loading overlay
        loadingOverlay.classList.add('fade-out');
        
        // Show invoice app
        invoiceApp.classList.remove('app-hidden');
        invoiceApp.classList.add('app-ready');
        
        // Remove loading overlay from DOM after transition
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
        }, 300);
        
        console.log('✅ [Invoice] App revealed, loading overlay hidden');
    }
}

/**
 * Render invoice meta section (number, dates, PIN, vehicle reg)
 */
function renderInvoiceMeta() {
    const data = currentInvoiceData;
    if (!data) return;

    document.getElementById('invoiceNumber').textContent = data.invoiceNumber || '—';
    document.getElementById('invoiceDate').textContent = formatDateUK(data.invoiceDate);
    document.getElementById('invoiceDue').textContent = formatDateUK(data.dueDate);
    document.getElementById('invoiceRef').textContent = data.refPin || data.pin || '—';
    
    const vehicle = normalizeVehicleFromInvoiceData({
        regPlate: data.regPlate,
        vehicleReg: data.vehicleReg,
        vehicleMakeModel: data.vehicleMakeModel,
        makeModel: data.makeModel,
        mileage: data.mileage ?? data.vehicleMileage,
        client: data.client
    });

    document.getElementById('vehicleReg').textContent = vehicle.regPlate || '—';
    const makeModelEl = document.getElementById('vehicleMakeModel');
    if (makeModelEl) makeModelEl.textContent = vehicle.makeModel || '—';
    const mileageEl = document.getElementById('vehicleMileage');
    if (mileageEl) mileageEl.textContent = vehicle.mileage || '—';
}

/**
 * Render payment terms
 */
function renderPaymentTerms() {
    const data = currentInvoiceData;
    if (!data) return;
    
    const termsElement = document.getElementById('paymentTermsText');
    if (termsElement) {
termsElement.textContent = data.paymentTerms || 'Due within 7 days';
    }
}

function isInvoiceROTabEnabled() {
    try {
        const params = new URLSearchParams(window.location.search || '');
        const queryFlag = params.get('ui.invoiceROTab');
        if (queryFlag === '0' || queryFlag === 'false') return false;
        if (queryFlag === '1' || queryFlag === 'true') return true;

        const localFlag = localStorage.getItem('ui.invoiceROTab');
        if (localFlag === '0' || localFlag === 'false') return false;
        if (localFlag === '1' || localFlag === 'true') return true;

        if (typeof window.ui?.invoiceROTab === 'boolean') {
            return window.ui.invoiceROTab;
        }

        return true;
    } catch (error) {
        return true;
    }
}

function applyInvoiceEditMode(mode = 'standard') {
    const form = document.getElementById('invoiceEditForm');
    const tabs = document.getElementById('invoiceModeTabs');
    const roSection = document.getElementById('legalProfileROSection');
    if (!form || !tabs || !roSection) return;

    const normalizedMode = mode === 'ro' ? 'ro' : 'standard';
    currentInvoiceEditMode = normalizedMode;

    tabs.querySelectorAll('.invoice-mode-tab').forEach(btn => {
        const isActive = btn.dataset.invoiceMode === normalizedMode;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    const allSections = Array.from(form.querySelectorAll('.edit-section'));
    const standardSections = allSections.filter(section => section.id !== 'legalProfileROSection');
    const showRO = normalizedMode === 'ro';

    standardSections.forEach(section => {
        section.style.display = showRO ? 'none' : '';
    });

    roSection.style.display = showRO ? '' : 'none';
}

function initInvoiceModeTabs() {
    const tabs = document.getElementById('invoiceModeTabs');
    const roSection = document.getElementById('legalProfileROSection');
    const form = document.getElementById('invoiceEditForm');
    if (!tabs || !roSection || !form) return;

    if (!isInvoiceROTabEnabled()) {
        tabs.style.display = 'none';
        form.querySelectorAll('.edit-section').forEach(section => {
            section.style.display = '';
        });
        return;
    }

    tabs.style.display = 'inline-flex';

    if (!tabs.dataset.bound) {
        tabs.addEventListener('click', (event) => {
            const btn = event.target.closest('.invoice-mode-tab');
            if (!btn) return;
            const mode = btn.dataset.invoiceMode || 'standard';
            applyInvoiceEditMode(mode);
        });
        tabs.dataset.bound = 'true';
    }

    const initialMode = draftData?.legalProfile?.enabled ? 'ro' : 'standard';
    applyInvoiceEditMode(initialMode);
}

function applyIssuerPreview(profile) {
    const companyNameEl = document.querySelector('.company-name');
    const companyInfoEl = document.querySelector('.company-info');
    if (!companyNameEl || !companyInfoEl) return;

    if (!companyNameEl.dataset.defaultText) {
        companyNameEl.dataset.defaultText = companyNameEl.textContent || '';
    }
    if (!companyInfoEl.dataset.defaultHtml) {
        companyInfoEl.dataset.defaultHtml = companyInfoEl.innerHTML || '';
    }

    if (profile?.type !== 'ro_company') {
        companyNameEl.textContent = companyNameEl.dataset.defaultText;
        companyInfoEl.innerHTML = companyInfoEl.dataset.defaultHtml;
        return;
    }

    const issuer = profile.issuer || {};
    const companyName = issuer.companyName || companyNameEl.dataset.defaultText;
    companyNameEl.textContent = companyName;

    const issuerLines = [
        issuer.address,
        issuer.cui ? `CUI: ${issuer.cui}` : '',
        issuer.regCom ? `RegCom: ${issuer.regCom}` : '',
        issuer.iban ? `IBAN: ${issuer.iban}` : '',
        issuer.bank ? `Bank: ${issuer.bank}` : '',
        issuer.vatStatusText || ''
    ].filter(Boolean);

    if (issuerLines.length === 0) {
        companyInfoEl.innerHTML = companyInfoEl.dataset.defaultHtml;
        return;
    }

    companyInfoEl.innerHTML = issuerLines
        .map(line => `<span>${escapeHtml(line)}</span>`)
        .join('');
}

/**
 * Render notes/work summary section
 */
function renderNotes() {
    const data = currentInvoiceData;
    if (!data) return;
    
    const notesElement = document.getElementById('notesText');
    if (notesElement && data.notes && data.notes.trim()) {
        notesElement.textContent = data.notes;
        notesElement.style.display = 'block';
    } else if (notesElement) {
        // Default text if no custom notes
        notesElement.textContent = 'Service carried out as agreed. Vehicle checked and tested. All work completed to manufacturer specifications.';
        // Show only if few items (handled by toggleWorkSummaryVisibility)
    }
}

function renderMechanicDetails(vm) {
    const card = document.getElementById('mechanicDetailsCard');
    if (!card) return;

    const setBlock = (blockId, textId, value) => {
        const block = document.getElementById(blockId);
        const textEl = document.getElementById(textId);
        if (!block || !textEl) return false;
        const text = (value || '').toString().trim();
        const hasText = text.length > 0;
        block.style.display = hasText ? 'block' : 'none';
        if (hasText) textEl.textContent = text;
        return hasText;
    };

    if (vm?.templateType !== 'mechanic') {
        card.style.display = 'none';
        return;
    }

    const details = vm.mechanicDetails || {};
    const termsText = [details.terms?.warrantyText, details.terms?.disclaimerText]
        .map(value => (value || '').toString().trim())
        .filter(Boolean)
        .join(' | ');

    const hasComplaint = setBlock('mechanicComplaintBlock', 'mechanicComplaintText', details.complaint);
    const hasDiagnosis = setBlock('mechanicDiagnosisBlock', 'mechanicDiagnosisText', details.diagnosis);
    const hasWork = setBlock('mechanicWorkBlock', 'mechanicWorkText', details.workPerformed);
    const hasRecommendations = setBlock('mechanicRecommendationsBlock', 'mechanicRecommendationsText', details.recommendations);
    const hasTerms = setBlock('mechanicTermsBlock', 'mechanicTermsText', termsText);

    const hasAny = hasComplaint || hasDiagnosis || hasWork || hasRecommendations || hasTerms;
    card.style.display = hasAny ? '' : 'none';
}

/**
 * Show validation error message
 */
function showValidationError(errors) {
    const messageEl = document.getElementById('validationMessage');
    const message = errors.length > 0 ? errors[0] : 'Invalid invoice data';
    messageEl.textContent = '⚠️ ' + message;
    messageEl.style.display = 'block';
    
    // Show invoice app even on error so user sees the error message
    if (!hasRenderedOnce) {
        hasRenderedOnce = true;
        showInvoiceApp();
        console.log('⚠️ [Invoice] Showing app with error state');
    }
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

function requestPrintSafe() {
    const logos = Array.from(document.querySelectorAll('.inv-logo'));
    const decodePromises = logos
        .filter(img => img && typeof img.decode === 'function')
        .map(img => img.decode().catch(() => {}));

    const settle = decodePromises.length
        ? Promise.race([
            Promise.all(decodePromises),
            new Promise(resolve => setTimeout(resolve, 250))
        ])
        : Promise.resolve();

    settle.finally(() => {
        requestAnimationFrame(() => {
            window.print();
        });
    });
}

/**
 * Handle PDF download (using window.print)
 */
function downloadPDF() {
    if (!currentInvoiceData) {
        showValidationError(['No invoice data to print']);
        return;
    }
    requestPrintSafe();
}

/**
 * Handle Print action
 */
function handlePrint() {
    if (!currentInvoiceData) {
        showValidationError(['No invoice data to print']);
        return;
    }
    requestPrintSafe();
}

/**
 * 💾 Save invoice PDF to Firebase Storage and update Firestore
 */
async function saveInvoiceToPDF() {
    if (!currentInvoiceData || !currentInvoiceId) {
        showValidationError(['No invoice data to save']);
        return;
    }

    if (!storage) {
        showValidationError(['Firebase Storage not initialized']);
        return;
    }

    const savePdfBtn = document.getElementById('savePdfBtn');
    if (savePdfBtn) {
        savePdfBtn.disabled = true;
        savePdfBtn.innerHTML = '⏳ Generating PDF...';
    }

    try {
        // Step 1: Generate PDF from invoice container
        console.log('📄 [Invoice] Generating PDF from invoice container...');
        const invoiceContainer = document.querySelector('.invoice-container');
        
        if (!invoiceContainer) {
            throw new Error('Invoice container not found in DOM');
        }

        // Use html2canvas and jsPDF from CDN
        const html2canvasScript = document.createElement('script');
        html2canvasScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        html2canvasScript.async = false;
        
        const jsPDFScript = document.createElement('script');
        jsPDFScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        jsPDFScript.async = false;

        // Load scripts dynamically
        await new Promise((resolve, reject) => {
            html2canvasScript.onload = () => {
                jsPDFScript.onload = resolve;
                jsPDFScript.onerror = reject;
                document.head.appendChild(jsPDFScript);
            };
            html2canvasScript.onerror = reject;
            document.head.appendChild(html2canvasScript);
        });

        if (savePdfBtn) {
            savePdfBtn.innerHTML = '⏳ Creating PDF...';
        }

        // Generate canvas from invoice container
        const canvas = await window.html2canvas(invoiceContainer, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff'
        });

        if (savePdfBtn) {
            savePdfBtn.innerHTML = '⏳ Uploading to Storage...';
        }

        // Create PDF
        const { jsPDF } = window.jspdf;
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const imgWidth = 210;  // A4 width in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);

        // Convert to blob
        const pdfBlob = pdf.output('blob');

        // Step 2: Upload to Firebase Storage
        console.log('📤 [Invoice] Uploading PDF to Firebase Storage...', {
            invoiceId: currentInvoiceId,
            size: (pdfBlob.size / 1024).toFixed(2) + ' KB'
        });

        const { ref, uploadBytes, getDownloadURL } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js');
        const storageRef = ref(storage, `invoices-pdf/${currentInvoiceId}.pdf`);

        const uploadTask = await uploadBytes(storageRef, pdfBlob);
        console.log('✅ [Invoice] PDF uploaded successfully:', uploadTask.ref.fullPath);

        // Step 3: Get download URL
        const pdfUrl = await getDownloadURL(storageRef);
        console.log('🔗 [Invoice] PDF download URL generated');

        // Step 4: Update Firestore document with PDF metadata
        console.log('💾 [Invoice] Updating Firestore with PDF metadata...');
        const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        await updateDoc(doc(db, 'invoices', currentInvoiceId), {
            pdfUrl: pdfUrl,
            pdfPath: `invoices-pdf/${currentInvoiceId}.pdf`,
            pdfUpdatedAt: serverTimestamp()
        });

        console.log('✅ [Invoice] Firestore updated with PDF metadata');

        // Step 5: Update UI
        showValidationError(['✅ PDF saved successfully! Storage updated.']);
        
        if (savePdfBtn) {
            savePdfBtn.disabled = false;
            savePdfBtn.innerHTML = '💾 PDF Saved';
            // After 2s, reset to allow re-save
            setTimeout(() => {
                savePdfBtn.innerHTML = '💾 Save PDF';
            }, 2000);
        }

    } catch (error) {
        console.error('[Invoice] PDF save error:', error);
        showValidationError(['Error saving PDF: ' + (error.message || 'Unknown error')]);
        
        if (savePdfBtn) {
            savePdfBtn.disabled = false;
            savePdfBtn.innerHTML = '💾 Save PDF';
        }
    }
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
    if (!currentInvoiceId) return '';
    return buildPreviewUrl(currentInvoiceId);
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
        if (currentInvoiceData.billToPhone || currentInvoiceData.clientPhone || currentInvoiceData.phone) {
            phoneInput.value = currentInvoiceData.billToPhone || currentInvoiceData.clientPhone || currentInvoiceData.phone || '';
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
    console.log('[InvoicePage] init loaded');
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

    // Read invoiceId from URL
    const params = new URLSearchParams(window.location.search);
    const invoiceId = params.get('invoiceId');
    const mode = params.get('mode') || 'view';
    // In view or preview mode, show read-only UI with only Print button
    const isViewOnlyMode = mode === 'view' || mode === 'preview';
    
    currentInvoiceId = invoiceId || null;

    console.log('📍 [Invoice] invoiceId from URL:', invoiceId);

    if (!invoiceId) {
        showValidationError(['Missing invoice ID']);
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

        console.log('✅ [Invoice] User authenticated, setting up listener for invoice...');

        if (isViewOnlyMode) {
            await loadInvoicePreview(invoiceId);
            return;
        }

        // Import Firestore functions
        const { doc, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        // Always listen to invoice document
        if (invoiceId) {
            const docRef = doc(db, 'invoices', invoiceId);
            const collectionName = 'invoices';
            const docId = invoiceId;

            // Use onSnapshot for live updates
            console.log(`🔐 [Invoice] Setting up Firestore listener for ${collectionName}/${docId} with user:`, currentUser.uid);
            
            // CRITICAL FIX: Unsubscribe previous listener if it exists to prevent duplicate listeners
            if (unsubscribeInvoiceListener) {
                console.log('🧹 [Invoice] Unsubscribing from previous listener...');
                unsubscribeInvoiceListener();
                unsubscribeInvoiceListener = null;
                invoiceListenerCount = 0;
            }
            
            unsubscribeInvoiceListener = onSnapshot(
                docRef,
                async (snap) => {
                    console.log(`📊 [Invoice] onSnapshot fired - Firestore document received from ${collectionName}:`, { exists: snap.exists(), id: snap.id });
                    invoiceListenerCount++;
                    console.log(`📊 [DIAG] Invoice listener update #${invoiceListenerCount}`);
                    
                    if (snap.exists()) {
                        console.log(`✅ [Invoice] Document found in ${collectionName} collection`);
                        const data = { id: snap.id, ...snap.data() };
                        await renderInvoiceFromStandalone(data);
                        
                        // 🔴 REMOVED: History logging from snapshot callback to prevent infinite loop
                        // History logging was causing updateDoc → updates document → triggers snapshot again
                        // History logging only belongs in explicit user action handlers, not in automatic Firestore updates
                    } else {
                        console.error(`❌ [Invoice] Document does not exist in ${collectionName} collection`);
                        showValidationError([`${collectionName === 'invoices' ? 'Invoice' : 'Appointment'} not found in database`]);
                        disableDownloadButton();
                    }
                },
                (error) => {
                    console.error(`❌ [Invoice] Firestore listener error from ${collectionName}:`, error);
                    showValidationError(['Error loading document: ' + error.message]);
                    disableDownloadButton();
                }
            );
            
            console.log(`🔐 [DIAG] Invoice listener attached (${collectionName}/${docId}). Total listeners: 1`);
        }


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

        const { app: fbApp, auth: fbAuth, db: fbDb, storage: fbStorage } = initFirebase();

        app = fbApp;
        auth = fbAuth;
        db = fbDb;
        storage = fbStorage;

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
let originalInvoiceData = null;  // Deep clone for cancel/reset
let draftData = {};  // Working copy during edit mode

function setupEventListeners() {
    if (invoiceListenersBound) {
        console.log('⚠️ [Invoice] Event listeners already bound, skipping');
        return;
    }

    console.log('🔌 [Invoice] Setting up event listeners...');

    const downloadBtn = document.getElementById('downloadPdfBtn');
    const printBtn = document.getElementById('printBtn');
    const sendBtn = document.getElementById('sendBtn');
    const editBtn = document.getElementById('editBtn');
    const backBtn = document.getElementById('backBtn');
    const savePdfBtn = document.getElementById('savePdfBtn');   // 💾 Save to Firebase Storage
    
    // Send modal buttons
    const closeSendModalBtn = document.getElementById('closeSendModal');
    const closeSendModalFooterBtn = document.getElementById('closeSendModalFooter');
    const sendEmailBtn = document.getElementById('sendEmailBtn');
    const sendWhatsAppBtn = document.getElementById('sendWhatsAppBtn');
    const copyLinkBtn = document.getElementById('copyLinkBtn');
    const sendModalBackdrop = document.getElementById('sendModalBackdrop');

    console.log('🔌 [Invoice] Buttons found:', {
        downloadBtn: !!downloadBtn,
        printBtn: !!printBtn,
        sendBtn: !!sendBtn,
        editBtn: !!editBtn,
        backBtn: !!backBtn,
        savePdfBtn: !!savePdfBtn
    });

    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadPDF);
        console.log('✅ [Invoice] Download button listener attached');
    }

    if (printBtn) {
        printBtn.addEventListener('click', handlePrint);
        console.log('✅ [Invoice] Print button listener attached');
    }

    if (sendBtn) {
        sendBtn.addEventListener('click', openSendModal);
        console.log('✅ [Invoice] Send button listener attached');
    }

    if (editBtn) {
        editBtn.addEventListener('click', toggleEditMode);
        console.log('✅ [Invoice] Edit button listener attached');
    }

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            console.log('🔙 [Invoice] Back button clicked');
            // Go back to previous page or home
            window.history.back();
        });
        console.log('✅ [Invoice] Back button listener attached');
    }

    if (savePdfBtn) {
        savePdfBtn.addEventListener('click', saveInvoiceToPDF);
        console.log('✅ [Invoice] Save PDF button listener attached');
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

    // View mode (read-only): Hide all buttons except Print
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode') || 'view';
    
    if (mode === 'view' || mode === 'preview') {
        console.log('📋 [Invoice] View/Preview mode detected - hiding non-essential buttons');
        
        // Hide all buttons except Print
        if (editBtn) editBtn.style.display = 'none';
        if (sendBtn) sendBtn.style.display = 'none';
        if (backBtn) backBtn.style.display = 'none';
        if (downloadBtn) downloadBtn.style.display = 'none';
        
        // Hide the print hint/tip message
        const printHint = document.querySelector('.print-hint');
        if (printHint) printHint.style.display = 'none';
        
        // Hide validation message container
        const validationMessage = document.getElementById('validationMessage');
        if (validationMessage) validationMessage.style.display = 'none';
        
        console.log('✅ [Invoice] View/Preview mode UI configured - only Print button visible');
    }

    invoiceListenersBound = true;
    console.log('✅ [Invoice] All event listeners set up successfully');
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
    const normalizedVehicle = normalizeVehicleFromInvoiceData({
        regPlate: currentInvoiceData.regPlate,
        vehicleReg: currentInvoiceData.vehicleReg,
        vehicleMakeModel: currentInvoiceData.vehicleMakeModel,
        makeModel: currentInvoiceData.makeModel,
        mileage: currentInvoiceData.mileage ?? currentInvoiceData.vehicleMileage,
        client: currentInvoiceData.client
    });

    draftData = {
        client: {
            name: currentInvoiceData.client?.name || '',
            address: currentInvoiceData.client?.address || '',
            phone: currentInvoiceData.client?.phone || '',
            vehicle: normalizedVehicle.makeModel || '',
            regPlate: normalizedVehicle.regPlate || '',
            mileage: normalizedVehicle.mileage || ''
        },
        services: (currentInvoiceData.services || []).map(s => ({
            description: s.description || '',
            qty: s.qty || 1,
            price: s.price ?? s.unitPrice ?? 0
        })),
        parts: (currentInvoiceData.parts || []).map(p => ({
            description: p.description || '',
            qty: p.qty || 1,
            price: p.price ?? p.unitPrice ?? 0
        })),
        notes: currentInvoiceData.notes || '',
        vatRate: currentInvoiceData.vatRate || 0,
        payment: {
            amountPaid: currentInvoiceData.amountPaid || 0,
            paymentMethod: currentInvoiceData.paymentMethod || '',
            paymentDate: currentInvoiceData.paymentDate || ''
        },
        legalProfile: {
            enabled: currentInvoiceData.legalProfile?.type === 'ro_company',
            issuer: {
                companyName: currentInvoiceData.legalProfile?.issuer?.companyName || '',
                cui: currentInvoiceData.legalProfile?.issuer?.cui || '',
                regCom: currentInvoiceData.legalProfile?.issuer?.regCom || '',
                address: currentInvoiceData.legalProfile?.issuer?.address || '',
                iban: currentInvoiceData.legalProfile?.issuer?.iban || '',
                bank: currentInvoiceData.legalProfile?.issuer?.bank || '',
                vatStatusText: currentInvoiceData.legalProfile?.issuer?.vatStatusText || ''
            },
            buyer: {
                companyName: currentInvoiceData.legalProfile?.buyer?.companyName || '',
                cui: currentInvoiceData.legalProfile?.buyer?.cui || '',
                regCom: currentInvoiceData.legalProfile?.buyer?.regCom || '',
                address: currentInvoiceData.legalProfile?.buyer?.address || '',
                email: currentInvoiceData.legalProfile?.buyer?.email || '',
                phone: currentInvoiceData.legalProfile?.buyer?.phone || ''
            },
            meta: {
                series: currentInvoiceData.legalProfile?.meta?.series || '',
                number: currentInvoiceData.legalProfile?.meta?.number || '',
                issueDate: currentInvoiceData.legalProfile?.meta?.issueDate || '',
                dueDate: currentInvoiceData.legalProfile?.meta?.dueDate || '',
                notes: currentInvoiceData.legalProfile?.meta?.notes || ''
            }
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
    initInvoiceModeTabs();

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

    // Populate optional legal profile fields
    populateLegalProfileFields();
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

function populateLegalProfileFields() {
    const legalFields = {
        'legalProfile.enabled': !!draftData.legalProfile?.enabled,
        'legalProfile.issuer.companyName': draftData.legalProfile?.issuer?.companyName || '',
        'legalProfile.issuer.cui': draftData.legalProfile?.issuer?.cui || '',
        'legalProfile.issuer.regCom': draftData.legalProfile?.issuer?.regCom || '',
        'legalProfile.issuer.address': draftData.legalProfile?.issuer?.address || '',
        'legalProfile.issuer.iban': draftData.legalProfile?.issuer?.iban || '',
        'legalProfile.issuer.bank': draftData.legalProfile?.issuer?.bank || '',
        'legalProfile.issuer.vatStatusText': draftData.legalProfile?.issuer?.vatStatusText || '',
        'legalProfile.buyer.companyName': draftData.legalProfile?.buyer?.companyName || '',
        'legalProfile.buyer.cui': draftData.legalProfile?.buyer?.cui || '',
        'legalProfile.buyer.regCom': draftData.legalProfile?.buyer?.regCom || '',
        'legalProfile.buyer.address': draftData.legalProfile?.buyer?.address || '',
        'legalProfile.buyer.email': draftData.legalProfile?.buyer?.email || '',
        'legalProfile.buyer.phone': draftData.legalProfile?.buyer?.phone || '',
        'legalProfile.meta.series': draftData.legalProfile?.meta?.series || '',
        'legalProfile.meta.number': draftData.legalProfile?.meta?.number || '',
        'legalProfile.meta.issueDate': draftData.legalProfile?.meta?.issueDate || '',
        'legalProfile.meta.dueDate': draftData.legalProfile?.meta?.dueDate || '',
        'legalProfile.meta.notes': draftData.legalProfile?.meta?.notes || ''
    };

    Object.entries(legalFields).forEach(([fieldName, value]) => {
        const input = document.querySelector(`[data-field="${fieldName}"]`);
        if (!input) return;
        if (input.type === 'checkbox') {
            input.checked = Boolean(value);
        } else {
            input.value = value;
        }
    });
}

function trimString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function hasAnyLegalProfileValue(profile) {
    if (!profile) return false;
    const issuer = profile.issuer || {};
    const buyer = profile.buyer || {};
    const meta = profile.meta || {};
    const values = [
        issuer.companyName, issuer.cui, issuer.regCom, issuer.address, issuer.iban, issuer.bank, issuer.vatStatusText,
        buyer.companyName, buyer.cui, buyer.regCom, buyer.address, buyer.email, buyer.phone,
        meta.series, meta.number, meta.issueDate, meta.dueDate, meta.notes
    ];
    return values.some(value => trimString(value) !== '');
}

function buildLegalProfileForSave(profile) {
    const source = profile || {};
    const issuer = {
        companyName: trimString(source.issuer?.companyName),
        cui: trimString(source.issuer?.cui),
        regCom: trimString(source.issuer?.regCom),
        address: trimString(source.issuer?.address),
        iban: trimString(source.issuer?.iban),
        bank: trimString(source.issuer?.bank),
        vatStatusText: trimString(source.issuer?.vatStatusText)
    };
    const buyer = {
        companyName: trimString(source.buyer?.companyName),
        cui: trimString(source.buyer?.cui),
        regCom: trimString(source.buyer?.regCom),
        address: trimString(source.buyer?.address),
        email: trimString(source.buyer?.email),
        phone: trimString(source.buyer?.phone)
    };
    const meta = {
        series: trimString(source.meta?.series),
        number: trimString(source.meta?.number),
        issueDate: trimString(source.meta?.issueDate),
        dueDate: trimString(source.meta?.dueDate),
        notes: trimString(source.meta?.notes)
    };

    const normalized = { type: 'ro_company', issuer, buyer, meta };
    const enabled = source.enabled === true || hasAnyLegalProfileValue(normalized);
    return enabled ? normalized : null;
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

    console.log('✅ [Invoice] Marked as paid, saving invoice...');
    saveInvoiceChanges();
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
 * Compute payment status with handling for inconsistent data
 */
function computePaymentStatus(total, amountPaid, remainingBalance = null) {
    const paid = n(amountPaid);
    const totalAmount = n(total);
    const remaining = remainingBalance === null || remainingBalance === undefined
        ? Math.max(0, totalAmount - paid)
        : n(remainingBalance);

    // ✅ Return lowercase for consistent storage
    if (remaining <= 0 || paid >= totalAmount) return 'paid';
    if (paid > 0 && remaining > 0) return 'partial';
    return 'unpaid';
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

    const editOverlay = document.getElementById('editModeOverlay');
    const actionsContainer = editOverlay || form;

    console.log('🔌 [Invoice] Binding edit form listeners');

    // Input change listener for client fields
    form.addEventListener('change', (e) => {
        if (e.target.dataset.field) {
            const fieldValue = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
            updateDraftData(e.target.dataset.field, fieldValue);
        }
    });

    // Input listener for real-time editing (without waiting for blur)
    form.addEventListener('input', (e) => {
        if (e.target.dataset.field) {
            const fieldValue = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
            updateDraftData(e.target.dataset.field, fieldValue);
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

    // Delegated action handlers for dynamic buttons
    if (!actionsContainer.dataset.actionsBound) {
        actionsContainer.addEventListener('click', (e) => {
            const actionEl = e.target.closest('[data-action]');
            if (!actionEl) return;

            const action = actionEl.dataset.action;

            switch (action) {
                case 'add-service':
                    e.preventDefault();
                    draftData.services.push({ description: '', qty: 1, price: 0 });
                    populateServicesSection();
                    break;

                case 'add-part':
                    e.preventDefault();
                    draftData.parts.push({ description: '', qty: 1, price: 0 });
                    populatePartsSection();
                    break;

                case 'save-draft':
                    e.preventDefault();
                    console.log('💾 [Invoice] Save requested (delegated)');
                    saveInvoiceChanges(e);
                    break;

                case 'cancel-edit':
                    e.preventDefault();
                    cancelEditMode();
                    break;

                case 'mark-paid':
                    e.preventDefault();
                    markInvoiceAsPaid();
                    break;

                case 'clear-payment':
                    e.preventDefault();
                    clearPaymentData();
                    break;

                default:
                    break;
            }
        });

        actionsContainer.dataset.actionsBound = 'true';
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

    // Show main action buttons (respect view mode)
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode') || 'view';
    
    const editBtn = document.getElementById('editBtn');
    const printBtn = document.getElementById('printBtn');
    const sendBtn = document.getElementById('sendBtn');
    const downloadBtn = document.getElementById('downloadPdfBtn');
    
    // In view/preview mode, only show Print button
    if (mode === 'view' || mode === 'preview') {
        if (editBtn) editBtn.style.display = 'none';
        if (printBtn) printBtn.style.display = 'inline-block';
        if (sendBtn) sendBtn.style.display = 'none';
        if (downloadBtn) downloadBtn.style.display = 'none';
    } else {
        // Normal mode: show all appropriate buttons
        if (editBtn && isAdmin) editBtn.style.display = 'inline-block';
        if (printBtn) printBtn.style.display = 'inline-block';
        if (sendBtn) sendBtn.style.display = 'inline-block';
        if (downloadBtn) downloadBtn.style.display = 'inline-block';
    }

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

    // Check authentication
    if (!currentUser || !isAdmin) {
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

        const jobs = (draftData.services || []).map(item => {
            const name = (item.description || item.name || '').trim();
            const qty = parseInt(item.qty, 10) || 1;
            const unitPrice = parseFloat(item.price ?? item.unitPrice ?? 0) || 0;
            const total = qty * unitPrice;
            return name ? { name, qty, unitPrice, total } : null;
        }).filter(Boolean);

        const parts = (draftData.parts || []).map(item => {
            const name = (item.description || item.name || '').trim();
            const qty = parseInt(item.qty, 10) || 1;
            const unitPrice = parseFloat(item.price ?? item.unitPrice ?? 0) || 0;
            const total = qty * unitPrice;
            return name ? { name, qty, unitPrice, total } : null;
        }).filter(Boolean);

        // Compute and save totals to ensure consistency
        const totals = computeTotals({
            jobs,
            parts,
            extras: n(draftData.extras)
        });

        const paidAmount = parseFloat(draftData.payment?.amountPaid) || 0;
        const balanceDue = Math.max(0, totals.total - paidAmount);
        // ✅ Use lowercase for consistent storage
        const paymentStatus = paidAmount > 0 && paidAmount >= totals.total ? 'paid' : 'unpaid';

        const vehicleForSave = normalizeVehicleFromInvoiceData({
            regPlate: draftData.client?.regPlate,
            vehicleMakeModel: draftData.client?.vehicle,
            mileage: draftData.client?.mileage,
            client: {}
        });

        console.debug('[Invoice][Vehicle] normalized payload:', vehicleForSave);

        // Prepare update object
        const updateData = {
            // Client info
            name: draftData.client?.name || '',
            address: draftData.client?.address || '',
            phone: draftData.client?.phone || '',
            carMakeModel: vehicleForSave.makeModel || '',
            vehicleMakeModel: vehicleForSave.makeModel || '',
            regPlate: vehicleForSave.regPlate || '',
            mileage: vehicleForSave.mileage || '',
            client: {
                name: draftData.client?.name || '',
                address: draftData.client?.address || '',
                phone: draftData.client?.phone || '',
                vehicle: vehicleForSave.makeModel || '',
                regPlate: vehicleForSave.regPlate || '',
                mileage: vehicleForSave.mileage || ''
            },
            
            // Jobs and parts
            jobs,
            parts,
            
            // Notes
            notes: draftData.notes || '',
            
            // Payment info
            paidAmount,
            balanceDue,
            paymentStatus,
            paymentMethod: draftData.payment?.paymentMethod || '',
            paymentDate: draftData.payment?.paymentDate || '',
            
            // Totals
            totals: {
                labour: totals.servicesSubtotal,
                parts: totals.partsSubtotal,
                subtotal: totals.subtotal,
                total: totals.total
            },
            
            // Metadata
            invoiceUpdatedAt: new Date().toISOString(),
            invoiceUpdatedBy: currentUser.uid || currentUser.email
        };

        console.log('[Invoice] Saving with computed totals:', {
            subtotal: totals.subtotal,
            total: totals.total,
            servicesCount: totals.servicesCount,
            partsCount: totals.partsCount
        });

        // Update Firestore (invoices or appointments collection)
        const { doc, updateDoc, collection, addDoc, getDoc, serverTimestamp, deleteField } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const roModeActive = currentInvoiceEditMode === 'ro';
        const legalProfileSource = {
            ...(draftData.legalProfile || {}),
            enabled: roModeActive
        };
        const legalProfileForSave = roModeActive ? buildLegalProfileForSave(legalProfileSource) : null;
        const hadExistingLegalProfile = currentInvoiceData?.legalProfile?.type === 'ro_company';
        const shouldClearLegalProfile = !roModeActive && (hadExistingLegalProfile || draftData.legalProfile?.enabled === true);
        
        if (currentInvoiceId) {
            // SCENARIO 1: Updating existing standalone invoice in invoices collection
            const invoiceUpdateData = {
                client: {
                    name: draftData.client?.name || '',
                    phone: draftData.client?.phone || '',
                    address: draftData.client?.address || '',
                    vehicle: vehicleForSave.makeModel || '',
                    regPlate: vehicleForSave.regPlate || '',
                    mileage: vehicleForSave.mileage || ''
                },
                customer: {
                    name: draftData.client?.name || '',
                    phone: draftData.client?.phone || '',
                    address: draftData.client?.address || ''
                },
                vehicle: {
                    makeModel: vehicleForSave.makeModel || '',
                    regPlate: vehicleForSave.regPlate || '',
                    mileage: vehicleForSave.mileage || ''
                },
                vehicleMakeModel: vehicleForSave.makeModel || '',
                regPlate: vehicleForSave.regPlate || '',
                mileage: vehicleForSave.mileage || '',
                jobs,
                parts,
                notes: draftData.notes || '',
                totals: {
                    labour: totals.servicesSubtotal,
                    parts: totals.partsSubtotal,
                    subtotal: totals.subtotal,
                    total: totals.total
                },
                paidAmount,
                balanceDue,
                paymentStatus,
                paymentMethod: draftData.payment?.paymentMethod || '',
                paymentDate: draftData.payment?.paymentDate || '',
                updatedAt: serverTimestamp()
            };

            if (legalProfileForSave) {
                invoiceUpdateData.legalProfile = legalProfileForSave;
            } else if (shouldClearLegalProfile) {
                invoiceUpdateData.legalProfile = deleteField();
            }

            console.debug('[Invoice][Vehicle] write keys (invoices):', {
                client: invoiceUpdateData.client,
                vehicleMakeModel: invoiceUpdateData.vehicleMakeModel,
                regPlate: invoiceUpdateData.regPlate,
                mileage: invoiceUpdateData.mileage
            });
            
            await updateDoc(doc(db, 'invoices', currentInvoiceId), invoiceUpdateData);
            console.log('✅ [Invoice] Updated invoice in invoices collection:', currentInvoiceId);
            
        } else if (currentAptId) {
            // SCENARIO 2: Updating appointment in appointments collection
            if (legalProfileForSave) {
                updateData.legalProfile = legalProfileForSave;
            } else if (shouldClearLegalProfile) {
                updateData.legalProfile = deleteField();
            }
            console.debug('[Invoice][Vehicle] write keys (appointments):', {
                client: updateData.client,
                vehicleMakeModel: updateData.vehicleMakeModel,
                regPlate: updateData.regPlate,
                mileage: updateData.mileage
            });
            await updateDoc(doc(db, 'appointments', currentAptId), updateData);
            console.log('✅ [Invoice] Updated appointment:', currentAptId);
            
        } else {
            // SCENARIO 3: Creating NEW invoice (no invoiceId, no aptId)
            // NOTE: With new flow, invoices are created immediately in Firestore by handleCreateInvoice()
            // This scenario should rarely be reached - only if someone opens invoice.html directly without IDs
            console.warn('⚠️ [Invoice] SCENARIO 3: Creating new invoice (this should not happen with normal flow)');
            console.warn('⚠️ [Invoice] Invoices should be created via handleCreateInvoice() before opening editor');
            
            // Generate invoice number
            const invoiceNumber = generateInvoiceNumberStandalone();
            
            const newInvoiceData = {
                invoiceNumber: invoiceNumber,
                status: 'draft',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                
                // Customer info
                customerName: draftData.client?.name || '',
                phone: draftData.client?.phone || '',
                address: draftData.client?.address || '',
                
                // Vehicle info
                client: {
                    name: draftData.client?.name || '',
                    phone: draftData.client?.phone || '',
                    address: draftData.client?.address || '',
                    vehicle: vehicleForSave.makeModel || '',
                    regPlate: vehicleForSave.regPlate || '',
                    mileage: vehicleForSave.mileage || ''
                },
                vehicleMakeModel: vehicleForSave.makeModel || '',
                regPlate: vehicleForSave.regPlate || '',
                mileage: vehicleForSave.mileage || '',
                
                // Jobs/parts
                jobs,
                parts,
                
                // Totals
                totals: {
                    labour: totals.servicesSubtotal,
                    parts: totals.partsSubtotal,
                    subtotal: totals.subtotal,
                    total: totals.total
                },
                
                // Payment
                paidAmount,
                balanceDue,
                paymentStatus,
                paymentMethod: draftData.payment?.paymentMethod || '',
                paymentDate: draftData.payment?.paymentDate || '',
                
                // Notes
                notes: draftData.notes || '',

                // Optional legal profile
                ...(legalProfileForSave ? { legalProfile: legalProfileForSave } : {}),
                
                // User tracking
                createdBy: currentUser.uid
            };
            
            // Create invoice document
            const invoiceRef = await addDoc(collection(db, 'invoices'), newInvoiceData);
            console.log('✅ [Invoice] Created new invoice:', invoiceRef.id, 'Number:', invoiceNumber);
            console.log('📦 [Invoice] Invoice data:', newInvoiceData);
            
            // Verify invoice was saved by reading it back
            try {
                const verifyRef = doc(db, 'invoices', invoiceRef.id);
                const verifySnap = await getDoc(verifyRef);
                console.log('🔁 [Invoice] Readback verification - exists:', verifySnap.exists());
                if (verifySnap.exists()) {
                    console.log('🔁 [Invoice] Readback data:', verifySnap.data());
                } else {
                    console.error('❌ [Invoice] Readback FAILED - invoice not found in Firestore!');
                }
            } catch (readbackError) {
                console.error('❌ [Invoice] Readback error:', readbackError);
            }
            
            // Update current invoice ID for this session
            currentInvoiceId = invoiceRef.id;
            
            // Redirect to the newly created invoice for viewing
            setTimeout(() => {
                window.location.href = `invoice.html?invoiceId=${invoiceRef.id}&mode=view`;
            }, 1500);
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
 * Safe number parsing - handles null, undefined, strings, and non-finite values
 * @param {*} x - Value to parse as number
 * @returns {number} Parsed number or 0
 */
function n(x) {
    if (x === null || x === undefined) return 0;
    if (typeof x === 'number') return isFinite(x) ? x : 0;
    if (typeof x === 'string') {
        const cleaned = x.replace(/[^0-9.-]/g, '');
        const v = parseFloat(cleaned);
        return isFinite(v) ? v : 0;
    }
    return 0;
}

/**
 * Compute totals with robust fallback logic
 * Priority: stored totals > computed from arrays
 * @param {object} data - Raw appointment data
 * @returns {object} { subtotal, vatRate, vatAmount, total, source }
 */
function computeTotals(data) {
    // Extract stored totals (try multiple field names)
    const storedTotal = n(data.totals?.total ?? data.total ?? data.totalAmount ?? data.grandTotal ?? data.invoiceTotal);
    const storedSubtotal = n(data.totals?.subtotal ?? data.subtotal ?? data.subTotal);
    const storedVatAmount = n(data.vatAmount ?? data.vat);
    
    // Extract services and parts arrays
    const services = Array.isArray(data.jobs) ? data.jobs : (Array.isArray(data.services) ? data.services : []);
    const parts = Array.isArray(data.parts) ? data.parts : [];
    
    // Calculate totals from arrays
    const servicesSubtotal = services.reduce((sum, s) => {
        if (!s) return sum;
        // Try multiple field patterns: lineTotal, qty*unitPrice, price
        const lineTotal = n(s.total ?? s.lineTotal);
        if (lineTotal > 0) return sum + lineTotal;
        
        const qty = n(s.qty ?? s.quantity ?? 1);
        const unitPrice = n(s.unitPrice ?? s.price ?? 0);
        return sum + (qty * unitPrice);
    }, 0);
    
    const partsSubtotal = parts.reduce((sum, p) => {
        if (!p) return sum;
        const lineTotal = n(p.total ?? p.lineTotal);
        if (lineTotal > 0) return sum + lineTotal;
        
        const qty = n(p.qty ?? p.quantity ?? 1);
        const unitPrice = n(p.unitPrice ?? p.price ?? 0);
        return sum + (qty * unitPrice);
    }, 0);
    
    const extras = n(data.extras);
    const computedSubtotal = servicesSubtotal + partsSubtotal + extras;
    
    // Determine which subtotal to use
    let subtotal;
    let source;
    if (storedSubtotal > 0) {
        subtotal = storedSubtotal;
        source = 'stored-subtotal';
    } else if (computedSubtotal > 0) {
        subtotal = computedSubtotal;
        source = 'computed-from-arrays';
    } else {
        subtotal = 0;
        source = 'zero-no-data';
    }
    
    // VAT calculation
    let vatRate = n(data.vatRate ?? data.vatPercent ?? data.vat);
    // Handle if vatRate is stored as decimal (0.2) instead of percent (20)
    if (vatRate > 0 && vatRate < 1) {
        vatRate = vatRate * 100;
    }
    
    let vatAmount;
    if (storedVatAmount > 0) {
        vatAmount = storedVatAmount;
    } else if (vatRate > 0 && subtotal > 0) {
        vatAmount = subtotal * (vatRate / 100);
    } else {
        vatAmount = 0;
    }
    
    // Total calculation
    let total;
    if (storedTotal > 0) {
        total = storedTotal;
        source = 'stored-total';
    } else if (subtotal > 0) {
        total = subtotal + vatAmount;
    } else {
        total = 0;
    }
    
    return {
        subtotal,
        vatRate,
        vatAmount,
        total,
        source,
        servicesCount: services.length,
        partsCount: parts.length,
        servicesSubtotal,
        partsSubtotal
    };
}

function generateRefPin(invoiceId, appointmentId, invoiceDateISO) {
    const seed = (invoiceId || appointmentId || '').toString();
    const suffix = seed ? seed.slice(-4).toUpperCase() : '0000';
    const baseDate = invoiceDateISO ? new Date(invoiceDateISO) : new Date();
    const dd = String(baseDate.getDate()).padStart(2, '0');
    const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
    const yy = String(baseDate.getFullYear()).slice(-2);
    return `TVX-${suffix}-${dd}${mm}${yy}`;
}

function normalizeInvoiceItems(items) {
    if (!Array.isArray(items)) return [];
    return items
        .filter(item => item && (item.description || item.name || item.service))
        .map(item => {
            const qty = Math.max(1, n(item.qty ?? item.quantity ?? 1));
            const unitPrice = n(item.unitPrice ?? item.price ?? item.cost ?? item.rate ?? 0);
            const lineTotal = n(item.total ?? item.lineTotal ?? 0) || (unitPrice * qty);
            return {
                description: item.description || item.name || item.service || 'Service',
                qty,
                unitPrice,
                lineTotal
            };
        });
}

function appendPostcodeToAddress(address, postcode) {
    const normalizedAddress = (address || '').toString().trim();
    const normalizedPostcode = (postcode || '').toString().trim();

    if (!normalizedPostcode) return normalizedAddress;
    if (!normalizedAddress) return normalizedPostcode;
    if (normalizedAddress.toLowerCase().includes(normalizedPostcode.toLowerCase())) return normalizedAddress;

    return `${normalizedAddress}\n${normalizedPostcode}`;
}

function normalizeMechanicDetails(data = {}, appointment = {}) {
    const source = data.mechanicDetails || {};
    const vehicleSource = source.vehicle || {};
    const termsSource = source.terms || {};

    const toText = (value) => value === undefined || value === null ? '' : String(value).trim();

    const vehicle = {};
    const vehicleVin = toText(vehicleSource.vin || data.vin || appointment.vin || appointment.vehicle?.vin);
    const vehicleMileage = toText(vehicleSource.mileage || data.mileage || appointment.mileage || appointment.vehicle?.mileage);
    if (vehicleVin) vehicle.vin = vehicleVin;
    if (vehicleMileage) vehicle.mileage = vehicleMileage;

    const terms = {};
    const warrantyText = toText(termsSource.warrantyText);
    const disclaimerText = toText(termsSource.disclaimerText);
    if (warrantyText) terms.warrantyText = warrantyText;
    if (disclaimerText) terms.disclaimerText = disclaimerText;

    const mechanicDetails = {};
    const complaint = toText(source.complaint || data.notes || appointment.notes);
    const diagnosis = toText(source.diagnosis);
    const workPerformed = toText(source.workPerformed);
    const recommendations = toText(source.recommendations);

    if (complaint) mechanicDetails.complaint = complaint;
    if (diagnosis) mechanicDetails.diagnosis = diagnosis;
    if (workPerformed) mechanicDetails.workPerformed = workPerformed;
    if (recommendations) mechanicDetails.recommendations = recommendations;
    if (Object.keys(vehicle).length > 0) mechanicDetails.vehicle = vehicle;
    if (Object.keys(terms).length > 0) mechanicDetails.terms = terms;

    return mechanicDetails;
}

function normalizeInvoiceData(raw, invoiceId, appointmentFallback = null) {
    const data = raw || {};
    const appointment = appointmentFallback || {};
    const getFirst = (...values) => values.find(v => v !== undefined && v !== null && v !== '') || '';
    const legalProfile = data.legalProfile?.type === 'ro_company' ? data.legalProfile : null;

    const invoiceDateISO = toISODateString(data.invoiceDate || data.createdAt || new Date());
    const dueDateISO = data.dueDate ? toISODateString(data.dueDate) : addDaysISO(invoiceDateISO, 7);

    const jobsSource = Array.isArray(data.jobs) ? data.jobs : [];
    const partsSource = Array.isArray(data.parts) ? data.parts : [];
    const itemsFromJobsParts = normalizeInvoiceItems([...jobsSource, ...partsSource]);
    const fallbackItemsSource = data.items || data.services || data.lineItems || data.workItems || [];
    const items = itemsFromJobsParts.length > 0 ? itemsFromJobsParts : normalizeInvoiceItems(fallbackItemsSource);

    const rawSubtotal = n(data.totals?.subtotal ?? data.subtotal);
    const rawVatRate = n(data.vatRate ?? data.vatPercent ?? data.vat);
    const rawVatAmount = n(data.vatAmount ?? data.totals?.vatAmount);
    const rawTotal = n(data.totals?.total ?? data.total);

    const computedSubtotal = items.reduce((sum, item) => sum + n(item.lineTotal), 0);
    const subtotal = rawSubtotal > 0 ? rawSubtotal : computedSubtotal;

    let vatRate = rawVatRate;
    if (vatRate > 0 && vatRate < 1) vatRate = vatRate * 100;
    const vatAmount = rawVatAmount > 0 ? rawVatAmount : (vatRate > 0 ? subtotal * (vatRate / 100) : 0);

    const total = rawTotal > 0 ? rawTotal : (subtotal + vatAmount);
    const amountPaid = n(data.paidAmount ?? data.amountPaid ?? data.payment?.amountPaid);
    const remainingBalance = n(data.balanceDue ?? data.remainingBalance ?? data.totals?.balanceDue) || Math.max(0, total - amountPaid);

    const rawStatus = data.paymentStatus ? String(data.paymentStatus).toLowerCase() : '';
    const paymentStatus = rawStatus || computePaymentStatus(total, amountPaid, remainingBalance);

    const customerName = getFirst(
        legalProfile?.buyer?.companyName,
        data.customerName,
        data.customer?.name,
        data.name,
        appointment.customerName,
        appointment.clientName,
        appointment.name
    ) || '—';

    const customerAddress = getFirst(
        legalProfile?.buyer?.address,
        data.customerAddress,
        data.address,
        data.customer?.address,
        appointment.address
    ) || COMPANY_ADDRESS || '—';

    const customerPostcode = getFirst(
        data.postcode,
        data.customer?.postcode,
        data.customerPostcode,
        appointment.postcode
    );

    const customerPhone = getFirst(
        legalProfile?.buyer?.phone,
        data.phone,
        data.customerPhone,
        data.customer?.phone,
        appointment.phone,
        appointment.customerPhone
    );

    const legalIssueDate = legalProfile?.meta?.issueDate ? toISODateString(legalProfile.meta.issueDate) : '';
    const legalDueDate = legalProfile?.meta?.dueDate ? toISODateString(legalProfile.meta.dueDate) : '';
    const templateType = data.templateType === 'mechanic' ? 'mechanic' : 'standard';
    const mechanicDetails = templateType === 'mechanic'
        ? normalizeMechanicDetails(data, appointment)
        : null;

    const vehicleData = normalizeVehicleFromInvoiceData({
        regPlate: getFirst(data.regPlate, data.registrationPlate, data.vehicle?.regPlate, appointment.regPlate, appointment.registrationPlate),
        vehicleReg: getFirst(data.vehicleReg, appointment.vehicleReg),
        vehicleMakeModel: getFirst(data.vehicleMakeModel, data.vehicle?.makeModel, data.carMakeModel, appointment.vehicleMakeModel, appointment.carMakeModel),
        makeModel: getFirst(data.makeModel, appointment.makeModel),
        mileage: data.mileage ?? data.vehicle?.mileage ?? appointment.mileage ?? '',
        client: {
            regPlate: getFirst(data.client?.regPlate, appointment.client?.regPlate),
            vehicle: getFirst(data.client?.vehicle, appointment.client?.vehicle),
            makeModel: getFirst(data.client?.makeModel, appointment.client?.makeModel),
            mileage: data.client?.mileage ?? appointment.client?.mileage ?? ''
        }
    });

    return {
        id: invoiceId || data.id || '',
        appointmentId: data.appointmentId || appointment.id || '',
        invoiceNumber: data.invoiceNumber || '—',
        invoiceDate: legalIssueDate || invoiceDateISO,
        dueDate: legalDueDate || dueDateISO,
        refPin: data.refPin || data.pin || '',
        paymentTerms: data.paymentTerms || 'Due within 7 days',
        notes: data.notes || '',
        billToName: customerName || '—',
        billToAddress: customerAddress,
        postcode: customerPostcode || '',
        billToPhone: customerPhone || '',
        vehicleMakeModel: vehicleData.makeModel || '',
        vehicleReg: vehicleData.regPlate || '',
        vehicleMileage: vehicleData.mileage || '',
        items,
        subtotal,
        vatRate,
        vatAmount,
        total,
        amountPaid,
        remainingBalance,
        paymentStatus,
        legalProfile,
        templateType,
        mechanicDetails
    };
}

function setTextById(id, value, fallback = '—') {
    const el = document.getElementById(id);
    if (!el) return;
    const text = value === undefined || value === null || value === '' ? fallback : value;
    el.textContent = text;
}

function populatePreview(vm) {
    if (!vm) return;

    const vehicle = normalizeVehicleFromInvoiceData({
        regPlate: vm.regPlate,
        vehicleReg: vm.vehicleReg,
        vehicleMakeModel: vm.vehicleMakeModel,
        makeModel: vm.makeModel,
        mileage: vm.mileage ?? vm.vehicleMileage,
        client: vm.client
    });

    applyIssuerPreview(vm.legalProfile);

    setTextById('invoiceNumber', vm.invoiceNumber);
    setTextById('invoiceDate', formatDateUK(vm.invoiceDate));
    setTextById('invoiceDue', formatDateUK(vm.dueDate));
    setTextById('invoiceRef', vm.refPin || '—');
    setTextById('vehicleReg', vehicle.regPlate || '—');

    setTextById('billToName', vm.billToName || '—');
    const billToAddress = appendPostcodeToAddress(vm.billToAddress || '', vm.postcode || '');
    setTextById('billToAddress', billToAddress || '—');
    setTextById('billToPhone', vm.billToPhone || '');
    const billToPhoneEl = document.getElementById('billToPhone');
    if (billToPhoneEl) {
        billToPhoneEl.style.display = vm.billToPhone ? '' : 'none';
    }

    setTextById('vehicleMakeModel', vehicle.makeModel || '—');
    const mileageText = vehicle.mileage ? vehicle.mileage : '—';
    setTextById('vehicleMileage', mileageText);

    setTextById('summarySubtotal', formatCurrency(vm.subtotal));
    setTextById('summaryTotal', formatCurrency(vm.total));

    const vatRow = document.getElementById('vatRow');
    if (vm.vatRate > 0 && vm.vatAmount > 0) {
        if (vatRow) vatRow.style.display = 'flex';
        setTextById('vatPercent', vm.vatRate.toString(), '0');
        setTextById('summaryVat', formatCurrency(vm.vatAmount));
    } else if (vatRow) {
        vatRow.style.display = 'none';
    }

    const amountPaidRow = document.getElementById('amountPaidRow');
    if (amountPaidRow) amountPaidRow.style.display = 'flex';
    setTextById('amountPaid', formatCurrency(vm.amountPaid));

    const balanceDueRow = document.getElementById('balanceDueRow');
    if (balanceDueRow) balanceDueRow.style.display = 'flex';
    setTextById('balanceDue', formatCurrency(vm.remainingBalance));

    // ===== POPULATE PRINT-OPTIMIZED FIELDS =====
    setTextById('pInvNo', vm.invoiceNumber);
    setTextById('pInvDate', formatDateUK(vm.invoiceDate));
    setTextById('pInvDue', formatDateUK(vm.dueDate));
    setTextById('pInvRef', vm.refPin || '—');
    setTextById('pInvReg', vehicle.regPlate || '—');
    
    setTextById('pBillName', vm.billToName || '—');
    setTextById('pBillPhone', vm.billToPhone || '—');
    setTextById('pVehMake', vehicle.makeModel || '—');
    setTextById('pVehReg', vehicle.regPlate || '—');
    setTextById('pMileage', vehicle.mileage || '—');
    
    setTextById('pTotal', formatCurrency(vm.total));
    setTextById('pPaid', formatCurrency(vm.amountPaid));
    setTextById('pBal', formatCurrency(vm.remainingBalance));
}

function renderServices(items) {
    const tbody = document.getElementById('servicesTbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const normalized = Array.isArray(items) ? items : [];
    if (normalized.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td class="inv-col-desc" colspan="4">No jobs/services added</td>';
        tbody.appendChild(row);
        toggleWorkSummaryVisibility(0);
        return;
    }

    normalized.forEach(item => {
        const qty = parseInt(item.qty) || 1;
        const unitPrice = n(item.unitPrice ?? item.price ?? 0);
        const lineTotal = n(item.total ?? item.lineTotal) || (unitPrice * qty);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="col-description">${item.description || item.name || 'Item'}</td>
            <td class="col-qty">${qty}</td>
            <td class="col-unit-price">${formatCurrency(unitPrice)}</td>
            <td class="col-line-total">${formatCurrency(lineTotal)}</td>
        `;
        tbody.appendChild(row);
    });

    toggleWorkSummaryVisibility(normalized.length);
}

function buildPreviewUrl(invoiceId) {
    const basePath = window.location.pathname.replace(/[^/]+$/, '');
    // Always use canonical invoice.html with mode=view for consistent read-only viewing
    return `${basePath}invoice.html?invoiceId=${encodeURIComponent(invoiceId)}&mode=view`;
}

async function loadInvoicePreview(invoiceId) {
    if (!invoiceId) {
        showValidationError(['Missing invoice ID']);
        disableDownloadButton();
        return;
    }

    const { doc, getDoc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    const invoiceRef = doc(db, 'invoices', invoiceId);
    const invoiceSnap = await getDoc(invoiceRef);

    if (!invoiceSnap.exists()) {
        showValidationError(['Invoice not found in database']);
        disableDownloadButton();
        return;
    }

    const rawInvoice = { id: invoiceSnap.id, ...invoiceSnap.data() };
    let appointmentData = null;

    if (rawInvoice.appointmentId) {
        const aptRef = doc(db, 'appointments', rawInvoice.appointmentId);
        const aptSnap = await getDoc(aptRef);
        if (aptSnap.exists()) {
            appointmentData = { id: aptSnap.id, ...aptSnap.data() };
            const canonicalInvoiceId = appointmentData.invoiceId;
            if (canonicalInvoiceId && canonicalInvoiceId !== invoiceId) {
                window.location.replace(buildPreviewUrl(canonicalInvoiceId));
                return;
            }
        }
    }

    const normalized = normalizeInvoiceData(rawInvoice, invoiceId, appointmentData);
    if (typeof DEBUG !== 'undefined' && DEBUG) {
        console.log('[DEBUG][InvoiceRender]', {
            invoiceId,
            postcode: normalized.postcode || ''
        });
    }

    if (!normalized.refPin) {
        const refPin = generateRefPin(invoiceId, rawInvoice.appointmentId, normalized.invoiceDate);
        normalized.refPin = refPin;
        try {
            await updateDoc(invoiceRef, { refPin });
        } catch (error) {
            console.warn('⚠️ [Invoice] Failed to persist refPin:', error);
        }
    }

    currentInvoiceData = normalized;
    currentInvoiceId = invoiceId;
    currentAptId = rawInvoice.appointmentId || null;

    populatePreview(normalized);
    renderServices(normalized.items);
    renderTotalsOptimized(normalized);
    renderPaymentTerms();
    renderNotes();
    renderMechanicDetails(normalized);

    if (!hasRenderedOnce) {
        hasRenderedOnce = true;
        showInvoiceApp();
    }

    enableDownloadButton();
    clearValidationError();
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

    // Services/Items array - normalize from Firestore structure
    // STEP 3: Read jobs array from appointment document (new schema: name, qty, price)
    let services = [];
    let parts = [];
    
    // First check for new schema: jobs[] and parts[] arrays
    if (Array.isArray(apt.jobs) && apt.jobs.length > 0) {
        console.log('🔍 [Invoice] Reading jobs from Firestore (new schema):', apt.jobs);
        services = apt.jobs
            .filter(item => item && item.name)  // Filter out invalid items
            .map(item => ({
                description: item.name,
                name: item.name,
                unitPrice: parseFloat(item.unitPrice ?? item.price) || 0,
                qty: parseInt(item.qty, 10) || 1,
                lineTotal: (parseFloat(item.total) || 0) || ((parseFloat(item.unitPrice ?? item.price) || 0) * (parseInt(item.qty, 10) || 1))
            }));
        console.log('✅ [Invoice] Normalized jobs:', services);
    }
    
    if (Array.isArray(apt.parts) && apt.parts.length > 0) {
        console.log('🔍 [Invoice] Reading parts from Firestore (new schema):', apt.parts);
        parts = apt.parts
            .filter(item => item && item.name)  // Filter out invalid items
            .map(item => ({
                description: item.name,
                name: item.name,
                unitPrice: parseFloat(item.unitPrice ?? item.price) || 0,
                qty: parseInt(item.qty, 10) || 1,
                lineTotal: (parseFloat(item.total) || 0) || ((parseFloat(item.unitPrice ?? item.price) || 0) * (parseInt(item.qty, 10) || 1))
            }));
        console.log('✅ [Invoice] Normalized parts:', parts);
    }
    
    // Fallback to legacy schema if new schema is empty
    if (services.length === 0 && parts.length === 0) {
        console.log('📋 [Invoice] New schema empty, trying legacy schema...');
        
        // Try legacy jobs array with type field
        const jobsData = Array.isArray(apt.jobs) ? apt.jobs : [];
        const serviceFallback = jobsData.filter(item => item?.type === 'labour');
        const partsFallback = jobsData.filter(item => item?.type === 'part');
        
        const servicesData = apt.invoiceItems
            || (Array.isArray(apt.services) && apt.services.length > 0 ? apt.services : null)
            || (serviceFallback.length > 0 ? serviceFallback : null)
            || apt.lineItems
            || apt.serviceLineItems
            || apt.items
            || [];
        
        // Also check for amountPaid which might be filled separately (when no services entered)
        const amountPaidValue = apt.payment?.amountPaid ?? apt.amountPaid ?? 0;
        
        if (Array.isArray(servicesData) && servicesData.length > 0) {
            console.log('🔍 [Invoice] Raw line items from Firestore (legacy):', servicesData);
            services = servicesData
                .filter(s => s && (s.name || s.description || s.service))  // Filter out completely invalid items
                .map(s => ({
                    description: s.description || s.name || s.service || 'Service',
                    price: parseFloat(s.unitPrice ?? s.price ?? s.cost ?? 0) || 0,
                    qty: parseInt(s.qty ?? s.quantity ?? 1) || 1
                }));
                // Don't filter out zero prices - display them so user can see missing data
            console.log('✅ [Invoice] Normalized line items (legacy):', services);
        } else {
            // No services array found - create default from problem description if available
            if (apt.problemDescription) {
                console.log('📝 [Invoice] Creating default item from problemDescription:', apt.problemDescription);
                
                // If amountPaid exists but no stored total/subtotal, use it as the line price
                const linePrice = (amountPaidValue > 0 && !apt.total && !apt.subtotal) ? amountPaidValue : 0;
                
                if (linePrice > 0) {
                    console.log('💰 [Invoice] Using amountPaid (' + amountPaidValue + ') as line item price (no stored total/subtotal found)');
                }
                
                services = [{
                    description: apt.problemDescription,
                    price: linePrice,
                    qty: 1
                }];
            } else {
                console.warn('⚠️ [Invoice] No line items found in appointment data');
            }
        }
    
        // Parts array - legacy schema
        const partsData = (Array.isArray(apt.parts) && apt.parts.length > 0 ? apt.parts : null)
            || (partsFallback.length > 0 ? partsFallback : null)
            || apt.partsList
            || apt.parts_list
            || [];
        
        if (Array.isArray(partsData) && partsData.length > 0) {
            console.log('🔍 [Invoice] Raw parts from Firestore (legacy):', partsData);
            parts = partsData
                .filter(p => p && (p.name || p.description))
                .map(p => ({
                    description: p.description || p.name || 'Part',
                    price: parseFloat(p.unitPrice ?? p.price ?? p.cost ?? 0) || 0,
                    qty: parseInt(p.qty ?? p.quantity ?? 1) || 1
                }));
                // Don't filter out zero prices - display them so user can see missing data
            console.log('✅ [Invoice] Normalized parts (legacy):', parts);
        }
    }

    // Combine services and parts into items array for invoice template
    const items = [...services, ...parts];

    // Use robust totals computation
    const totals = computeTotals({
        ...apt,
        services,
        parts,
        extras: n(overrides.extras ?? apt.extras)
    });

    // Add diagnostic logging
    console.log('[Invoice DIAG] Totals source:', {
        source: totals.source,
        storedTotal: n(apt.total ?? apt.totalAmount ?? apt.grandTotal),
        storedSubtotal: n(apt.subtotal ?? apt.subTotal),
        storedAmountPaid: n(apt.payment?.amountPaid ?? apt.amountPaid),
        servicesCount: totals.servicesCount,
        partsCount: totals.partsCount,
        servicesSubtotal: totals.servicesSubtotal,
        partsSubtotal: totals.partsSubtotal,
        computedSubtotal: totals.subtotal,
        vatAmount: totals.vatAmount,
        finalTotal: totals.total
    });

    // Payment handling - ensure amountPaid doesn't exceed or get confused with total
    let amountPaid = 0;
    if (apt.payment && typeof apt.payment.amountPaid === 'number') {
        amountPaid = apt.payment.amountPaid;
    } else if (typeof apt.paidAmount === 'number') {
        amountPaid = apt.paidAmount;
    } else if (typeof apt.amountPaid === 'number') {
        amountPaid = apt.amountPaid;
    }
    
    // Validate payment status - prefer Firestore status, fallback to computed
    let paymentStatus = '';
    let adjustedTotal = totals.total;
    
    // First check if paymentStatus is stored in Firestore
    if (apt.paymentStatus) {
        paymentStatus = String(apt.paymentStatus).toLowerCase();
        console.log('📋 [Invoice] Using stored paymentStatus from Firestore:', paymentStatus);
    } else if (totals.total === 0 && amountPaid > 0) {
        console.warn('[Invoice WARN] Total is 0 but amountPaid is', amountPaid, '- using amountPaid as fallback total');
        // Use amountPaid as fallback total when stored total is missing
        adjustedTotal = amountPaid;
        paymentStatus = 'paid'; // ✅ lowercase
        console.log('💰 [Invoice FIX] Adjusted total from', totals.total, 'to', adjustedTotal);
    } else if (totals.total > 0 && amountPaid > 0) {
        // Total was computed from line items, but verify amountPaid makes sense
        console.log('💳 [Invoice] Total computed from line items:', totals.total, 'Amount Paid:', amountPaid);
        if (Math.abs(totals.total - amountPaid) < 0.01) {
            paymentStatus = 'paid'; // ✅ lowercase
        } else if (amountPaid > totals.total) {
            console.warn('[Invoice WARN] Amount Paid (' + amountPaid + ') exceeds computed Total (' + totals.total + ')');
            paymentStatus = 'paid'; // ✅ lowercase
        } else if (amountPaid > 0) {
            paymentStatus = 'partial'; // ✅ lowercase
        }
    }
    
    console.log('💳 [Invoice] Payment status:', paymentStatus, '| Amount Paid:', amountPaid, '| Computed Total:', totals.total, '| Adjusted Total:', adjustedTotal);


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
        subtotal: totals.subtotal || adjustedTotal,  // Use adjusted total if subtotal is 0
        vatRate: totals.vatRate && totals.vatRate > 0 ? Math.round(totals.vatRate) : 0,  // Only use VAT if explicitly stored
        vatAmount: totals.vatAmount,
        total: adjustedTotal,  // Use adjusted total (may be recovered from amountPaid)
        paymentTerms: overrides.paymentTerms || apt.paymentTerms || 'Due within 7 days',
        extras: n(overrides.extras ?? apt.extras),
        // Payment info - from payment object or legacy field
        amountPaid: amountPaid,
        paymentMethod: (apt.payment && apt.payment.paymentMethod) || apt.paymentMethod || '',
        paymentDate: (apt.payment && apt.payment.paymentDate) || apt.paymentDate || '',
        notes: apt.notes || '',
        // Include payment status (primary field) and override for backward compatibility
        paymentStatus: paymentStatus,
        _paymentStatusOverride: paymentStatus
    };

    console.log('✅ [Invoice] Normalized data:', normalized);
    console.log('📊 [Invoice] Final totals - Subtotal:', normalized.subtotal, 'Total:', normalized.total, 'Items:', normalized.items.length);
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
    const vehicle = normalizeVehicleFromInvoiceData({
        regPlate: normalizedData.regPlate,
        vehicleReg: normalizedData.vehicleReg,
        vehicleMakeModel: normalizedData.vehicleMakeModel,
        makeModel: normalizedData.makeModel,
        mileage: normalizedData.mileage ?? normalizedData.vehicleMileage,
        client
    });

    // Client name (required)
    setFieldVisibility('billToName', client.name, true);

    // Phone (optional)
    setFieldVisibility('billToPhone', client.phone, false);

    // Address (fallback to company address)
    const billToAddress = client.address || COMPANY_ADDRESS || '';
    setFieldVisibility('billToAddress', billToAddress, false);

    // Vehicle (optional) - support both client.vehicle and direct vehicleMake field
    const vehicleMake = vehicle.makeModel || '';
    setFieldVisibility('vehicleMakeModel', vehicleMake, false);

    // Mileage (optional) - support both formats
    const mileage = vehicle.mileage || '';
    const mileageText = mileage ? (typeof mileage === 'number' ? mileage.toLocaleString() + ' mi' : mileage) : '';
    setFieldVisibility('vehicleMileage', mileageText, false);
}

/**
 * Render services table - only valid items, no empty rows
 */
function renderServicesOptimized(normalizedData) {
    const tbody = document.getElementById('servicesTbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    // Get all items (services + parts), support both 'items' and 'services' keys for compatibility
    const items = (normalizedData && Array.isArray(normalizedData.items))
        ? normalizedData.items
        : (normalizedData && Array.isArray(normalizedData.services))
        ? normalizedData.services
        : [];

    if (items.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td class="inv-col-desc" colspan="4">No jobs/services added</td>';
        tbody.appendChild(row);
        toggleWorkSummaryVisibility(0);
        console.log('⚠️ [Invoice] No items to display in services table');
        return;
    }

    items.forEach(item => {
        const row = document.createElement('tr');
        const qty = parseInt(item.qty) || 1;
        const unitPrice = parseFloat(item.unitPrice ?? item.price) || 0;
        const lineTotal = parseFloat(item.total ?? item.lineTotal) || (unitPrice * qty);

        row.innerHTML = `
            <td class="col-description">${item.description || item.name || 'Item'}</td>
            <td class="col-qty">${qty}</td>
            <td class="col-unit-price">${formatCurrency(unitPrice)}</td>
            <td class="col-line-total">${formatCurrency(lineTotal)}</td>
        `;
        tbody.appendChild(row);
    });

    // Toggle Work Summary visibility based on item count
    toggleWorkSummaryVisibility(items.length);
}

/**
 * Show/hide Work Summary based on number of items
 * Shows notes when items are few (< 3) to fill print space
 */
function toggleWorkSummaryVisibility(itemCount) {
    const noteTextElement = document.querySelector('.inv-work .sec-text');
    if (!noteTextElement) return;
    
    if (itemCount < 3) {
        noteTextElement.style.display = 'block';
    } else {
        noteTextElement.style.display = 'none';
    }
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
    const amountPaid = parseFloat(normalizedData.amountPaid) || 0;

    // Show helpful warning if totals were recovered from payment data
    if (total > 0 && subtotal === 0 && total === amountPaid) {
        console.info('[Invoice] Total recovered from payment data (original invoice items may be missing prices)');
    } else if (total === 0 && subtotal === 0 && amountPaid === 0) {
        console.warn('[Invoice] Total and subtotal are both 0 - no items or missing data');
    }

    // Render subtotal
    document.getElementById('summarySubtotal').textContent = formatCurrency(subtotal);

    // Render total
    document.getElementById('summaryTotal').textContent = formatCurrency(total);

    // Show/hide VAT row
    const vatRow = document.getElementById('vatRow');
    if (vatRate > 0 && vatAmount > 0) {
        vatRow.style.display = 'flex';
        document.getElementById('vatPercent').textContent = vatRate.toString();
        document.getElementById('summaryVat').textContent = formatCurrency(vatAmount);
    } else {
        vatRow.style.display = 'none';
    }

    // Payment information (amountPaid already declared above)
    // Prefer Firestore paymentStatus over computed status
    const paymentStatus = 
        (normalizedData.paymentStatus && String(normalizedData.paymentStatus).toLowerCase()) ||
        normalizedData._paymentStatusOverride ||
        computePaymentStatus(total, amountPaid, balanceDue);
    
    // Handle "paid" status with zero amountPaid - show total as paid amount
    let displayAmountPaid = amountPaid;
    let balanceDue = computeBalanceDue(total, amountPaid);
    
    if (paymentStatus && paymentStatus.toLowerCase() === 'paid' && amountPaid === 0 && total > 0) {
        displayAmountPaid = total;
        balanceDue = 0;
        console.log('💳 [Invoice] Adjusted display for PAID status with zero amountPaid:', { total, displayAmountPaid, balanceDue });
    }

    // 🐛 DEBUG: Log payment computation
    console.log('🔍 [Invoice] Payment Status Computation:', {
        fromFirestore: normalizedData.paymentStatus || '(none)',
        fromOverride: normalizedData._paymentStatusOverride || '(none)',
        computed: computeBalanceDue(total, amountPaid) === 0 ? 'paid' : (amountPaid > 0 ? 'partial' : 'unpaid'),
        final: paymentStatus,
        total: total,
        amountPaid: amountPaid,
        displayAmountPaid: displayAmountPaid,
        balanceDue: balanceDue
    });

    const amountPaidRow = document.getElementById('amountPaidRow');
    const balanceDueRow = document.getElementById('balanceDueRow');

    if (amountPaidRow) {
        amountPaidRow.style.display = 'flex';
        document.getElementById('amountPaid').textContent = formatCurrency(displayAmountPaid);
    }
    if (balanceDueRow) {
        balanceDueRow.style.display = 'flex';
        const balanceDueEl = document.getElementById('balanceDue');
        balanceDueEl.textContent = formatCurrency(balanceDue);
        balanceDueRow.classList.remove('fully-paid', 'has-balance');
        if (balanceDue <= 0) {
            balanceDueRow.classList.add('fully-paid');
        } else {
            balanceDueRow.classList.add('has-balance');
        }
    }

    // Payment status badge removed (visual display only)
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
    
    // Show invoice app on first render
    if (!hasRenderedOnce) {
        hasRenderedOnce = true;
        showInvoiceApp();
        console.log('✅ [Invoice] First render complete, invoice visible');
    }

    // Use stored invoice identifiers if present
    const invoiceNumber = normalizedData.invoiceNumber || '';
    const dueDate = calculateDueDate(normalizedData.invoiceDate);

    // Store for later use
    currentInvoiceData = {
        invoiceNumber,
        invoiceDate: normalizedData.invoiceDate,
        dueDate,
        refPin: normalizedData.refPin || normalizedData.pin || '',
        pin: normalizedData.pin || '',
        ...normalizedData
    };

    // Render sections
    renderInvoiceMeta();
    renderBillToOptimized(normalizedData);
    renderServicesOptimized(normalizedData);
    renderTotalsOptimized(normalizedData);
    renderPaymentTerms();
    renderNotes();
    renderMechanicDetails(normalizedData);

    // Enable buttons
    enableDownloadButton();
    clearValidationError();
}

/**
 * Render standalone invoice from invoices collection
 * Fetches linked appointment data for live mileage sync
 */
async function renderInvoiceFromStandalone(invoiceData) {
    if (!invoiceData) {
        showValidationError(['Failed to load standalone invoice']);
        disableDownloadButton();
        return;
    }
    
    // Show invoice app on first render
    if (!hasRenderedOnce) {
        hasRenderedOnce = true;
        showInvoiceApp();
        console.log('✅ [Invoice] First render complete, standalone invoice visible');
    }
    
    // 🔄 LIVE MILEAGE SYNC: Fetch appointment data if appointmentId exists
    let appointmentData = null;
    if (invoiceData.appointmentId) {
        try {
            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            const aptRef = doc(db, 'appointments', invoiceData.appointmentId);
            const aptSnap = await getDoc(aptRef);
            if (aptSnap.exists()) {
                appointmentData = { id: aptSnap.id, ...aptSnap.data() };
                console.log('🔄 [Invoice] Fetched linked appointment for mileage sync:', {
                    aptId: appointmentData.id,
                    mileage: appointmentData.mileage
                });
            } else {
                console.warn('⚠️ [Invoice] Linked appointment not found:', invoiceData.appointmentId);
            }
        } catch (error) {
            console.error('❌ [Invoice] Error fetching appointment data:', error);
        }
    }

    // 🔄 Use normalizeInvoiceData for consistent mileage handling
    // This function properly merges invoice + appointment data with appointment.mileage taking priority
    const normalized = normalizeInvoiceData(invoiceData, invoiceData.id, appointmentData);
    if (typeof DEBUG !== 'undefined' && DEBUG) {
        console.log('[DEBUG][InvoiceRender]', {
            invoiceId: invoiceData.id,
            postcode: normalized.postcode || ''
        });
    }
    
    console.log('📊 [Invoice] Normalized data with mileage:', {
        invoiceMileage: invoiceData.mileage || invoiceData.vehicle?.mileage,
        appointmentMileage: appointmentData?.mileage,
        finalMileage: normalized.vehicleMileage
    });
    
    // Add client structure for edit mode compatibility
    normalized.client = {
        name: normalized.billToName,
        phone: normalized.billToPhone,
        address: normalized.billToAddress,
        vehicle: normalized.vehicleMakeModel,
        regPlate: normalized.vehicleReg,
        mileage: normalized.vehicleMileage
    };
    
    // Add services/parts arrays for edit mode compatibility
    const jobs = Array.isArray(invoiceData.jobs) ? invoiceData.jobs : [];
    const parts = Array.isArray(invoiceData.parts) ? invoiceData.parts : [];
    normalized.services = (jobs.length > 0 ? jobs : normalized.items).map(item => ({
        description: item.description || item.name || '',
        qty: parseInt(item.qty, 10) || 1,
        price: parseFloat(item.unitPrice ?? item.price ?? 0) || 0
    }));
    normalized.parts = parts.map(item => ({
        description: item.description || item.name || '',
        qty: parseInt(item.qty, 10) || 1,
        price: parseFloat(item.unitPrice ?? item.price ?? 0) || 0
    }));
    
    // Add totals structure for compatibility
    if (!normalized.totals) {
        normalized.totals = {
            subtotal: normalized.subtotal,
            total: normalized.total,
            vatAmount: normalized.vatAmount,
            vatRate: normalized.vatRate
        };
    }

    // Store for later use
    currentInvoiceData = normalized;

    // Render sections
    renderInvoiceMeta();
    renderBillToOptimized(normalized);
    renderServicesOptimized(normalized);
    renderTotalsOptimized(normalized);
    renderPaymentTerms();
    renderNotes();
    renderMechanicDetails(normalized);

    // Enable buttons
    enableDownloadButton();
    clearValidationError();
}
// Initialize on page load
document.addEventListener('DOMContentLoaded', initInvoice);

// Service Worker: Auto-reload on controller change (new version activated)
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('🔄 [Service Worker] New version activated, reloading page...');
        window.location.reload();
    });
}

/**
 * Apply URL prefill parameters to form fields
 * Called when creating a new invoice from appointment form
 */
function applyUrlPrefill(prefillData) {
    if (!prefillData) return;
    
    const fieldMap = {
        customerName: 'billToName',
        phone: 'billToPhone',
        address: 'billToAddress',
        vehicleMakeModel: 'vehicleMakeModel',
        regPlate: 'vehicleReg',
        mileage: 'vehicleMileage',
        notes: 'notesText'
    };

    Object.entries(fieldMap).forEach(([urlParam, fieldId]) => {
        if (prefillData[urlParam]) {
            const el = document.getElementById(fieldId);
            if (el) {
                if ('value' in el) {
                    el.value = prefillData[urlParam];
                } else {
                    el.textContent = prefillData[urlParam];
                }
                console.log(`📝 [Invoice] Prefilled ${fieldId} from URL: ${prefillData[urlParam]}`);
            }
        }
    });
    
    // Prefill applied successfully
    if (Object.values(prefillData).some(v => v)) {
        console.log('✏️ [Invoice] Form prefilled from URL parameters');
    }
}

// Cleanup Firestore listener when page unloads
window.addEventListener('beforeunload', () => {
    if (unsubscribeInvoiceListener) {
        unsubscribeInvoiceListener();
        console.log('🧹 [Invoice] Firestore listener cleaned up');
    }
});
