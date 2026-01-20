/**
 * Invoice Renderer Module
 * Converts invoiceData objects into DOM-rendered invoices
 * Supports dynamic content, validation, and print-to-PDF via window.print()
 */

// ==========================================
// FIREBASE CONFIGURATION (Same as script.js)
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyDKyqAb198h6VdbHXZtciMdn_KIg-L2zZU",
    authDomain: "transvortexltdcouk.firebaseapp.com",
    projectId: "transvortexltdcouk",
    storageBucket: "transvortexltdcouk.firebasestorage.app",
    messagingSenderId: "980773899679",
    appId: "1:980773899679:web:1d741dd11f75cd238581aa",
    measurementId: "G-RL8PTZS34D"
};

// Firebase global instances
let app = null;
let auth = null;
let db = null;
let currentUser = null;

// Global state
let currentInvoiceData = null;

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
 * Initialize invoice page
 */
async function initInvoice() {
    console.log('📄 [Invoice] Page loaded, initializing...');
    
    // Set up event listeners
    setupEventListeners();

    // Read aptId from URL
    const params = new URLSearchParams(window.location.search);
    const aptId = params.get('aptId');

    console.log('📍 [Invoice] aptId from URL:', aptId);

    if (!aptId) {
        showValidationError(['Missing appointment ID']);
        disableDownloadButton();
        return;
    }

    try {
        // Initialize Firebase if not already done
        if (!db) {
            await initializeFirebase();
        }

        // Wait for user authentication
        await new Promise((resolve) => {
            if (currentUser) {
                resolve();
            } else {
                const unsubscribe = auth.onAuthStateChanged((user) => {
                    if (user) {
                        currentUser = user;
                        unsubscribe();
                        resolve();
                    }
                });
                // Timeout after 5 seconds if no auth
                setTimeout(() => {
                    unsubscribe();
                    resolve();
                }, 5000);
            }
        });

        // Check if user is authenticated
        if (!currentUser) {
            showValidationError(['You must be logged in to view invoices']);
            disableDownloadButton();
            return;
        }

        console.log('✅ [Invoice] User authenticated, setting up listener for appointment...');

        // Import Firestore functions
        const { doc, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        // Use onSnapshot for live updates
        unsubscribeInvoiceListener = onSnapshot(
            doc(db, 'appointments', aptId),
            (snap) => {
                if (snap.exists()) {
                    console.log('🔄 [Invoice] Appointment data received from Firestore');
                    const appointment = { id: snap.id, ...snap.data() };
                    const normalizedData = normalizeAppointmentData(appointment);
                    renderInvoiceFromAppointment(normalizedData);
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

    } catch (error) {
        console.error('❌ [Invoice] Error initializing:', error);
        showValidationError(['Error loading appointment. Check console.']);
        disableDownloadButton();
    }
}

/**
 * Initialize Firebase
 */
async function initializeFirebase() {
    try {
        // Import Firebase App module
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
        
        // Import Firebase Auth module
        const { getAuth, onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        
        // Import Firestore module
        const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        console.log("🔥 Firebase SDK: Initializing (Invoice)...");
        
        // Initialize Firebase App
        app = initializeApp(firebaseConfig);
        console.log("✅ Firebase App initialized");
        
        // Get Auth instance
        auth = getAuth(app);
        console.log("✅ Firebase Auth initialized");
        
        // Get Firestore instance
        db = getFirestore(app);
        console.log("✅ Firestore initialized");

        // Setup authentication state listener
        onAuthStateChanged(auth, async (user) => {
            currentUser = user;
            if (user) {
                console.log(`✅ User authenticated: ${user.email}`);
            } else {
                console.log("🔓 User logged out");
            }
        });

    } catch (error) {
        console.error("❌ Firebase initialization error:", error);
        showValidationError(['Firebase initialization failed']);
        disableDownloadButton();
    }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
    const downloadBtn = document.getElementById('downloadPdfBtn');
    const backBtn = document.getElementById('backBtn');

    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadPDF);
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

    // Helper: extract first non-empty value
    const getFirstValue = (...values) => {
        return values.find(v => v !== null && v !== undefined && v !== '') || '';
    };

    // Client data with fallback to multiple field names
    const client = {
        name: getFirstValue(apt.customerName, apt.clientName, apt.name || ''),
        phone: getFirstValue(apt.phone, apt.customerPhone, apt.tel, apt.telefon || ''),
        address: getFirstValue(apt.address, apt.location, apt.clientAddress || ''),
        vehicle: getFirstValue(
            apt.carMakeModel, 
            apt.vehicleMakeModel, 
            apt.makeModel,
            apt.make || ''
        ),
        regPlate: getFirstValue(
            apt.registrationPlate, 
            apt.regPlate, 
            apt.regNumber, 
            apt.plate,
            apt.registration || ''
        ),
        mileage: apt.mileage || apt.km || ''
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
                   (parseFloat(apt.extras) || 0);
    }

    // VAT handling
    if (apt.vatEnabled && apt.vatRate) {
        vatRate = (parseFloat(apt.vatRate) * 100) || 0;  // Convert 0.2 to 20%
        vatAmount = subtotal * (parseFloat(apt.vatRate));
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
        invoiceDate,
        subtotal,
        vatRate: vatRate ? Math.round(vatRate) : 0,  // Round to nearest integer for display
        vatAmount,
        total,
        paymentTerms: apt.paymentTerms || 'Due within 7 days',
        extras: parseFloat(apt.extras) || 0
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

    // Generate invoice metadata
    const invoiceNumber = generateInvoiceNumber();
    const dueDate = calculateDueDate(normalizedData.invoiceDate);

    // Store for later use
    currentInvoiceData = {
        invoiceNumber,
        invoiceDate: normalizedData.invoiceDate,
        dueDate,
        pin: generatePIN(),
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
