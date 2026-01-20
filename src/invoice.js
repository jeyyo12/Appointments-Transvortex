/**
 * Invoice Renderer Module
 * Converts invoiceData objects into DOM-rendered invoices
 * Supports dynamic content, validation, and print-to-PDF via window.print()
 */

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

    // Client validation
    if (!data.client || !data.client.name || !data.client.name.trim()) {
        errors.push('Client name is required');
    }

    // Services validation
    if (!data.items || data.items.length === 0) {
        errors.push('At least one service item is required');
    }

    // Items validation
    if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item, index) => {
            if (!item.description || !item.description.trim()) {
                errors.push(`Item ${index + 1}: Description is required`);
            }
            if (!item.qty || item.qty <= 0) {
                errors.push(`Item ${index + 1}: Quantity must be greater than 0`);
            }
            if (!item.unitPrice || item.unitPrice < 0) {
                errors.push(`Item ${index + 1}: Unit price must be valid`);
            }
        });
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Render invoice from data object
 * @param {object} invoiceData - Complete invoice data
 */
function renderInvoice(invoiceData) {
    // Validate data
    const validation = validateInvoiceData(invoiceData);
    if (!validation.isValid) {
        showValidationError(validation.errors);
        disableDownloadButton();
        return;
    }

    // Store for later use
    currentInvoiceData = {
        ...invoiceData,
        invoiceNumber: invoiceData.invoiceNumber || generateInvoiceNumber(),
        invoiceDate: invoiceData.invoiceDate || new Date().toISOString().split('T')[0],
        pin: invoiceData.pin || generatePIN(),
        paymentTerms: invoiceData.paymentTerms || 'Due within 7 days'
    };

    // Calculate due date if not provided
    if (!currentInvoiceData.dueDate) {
        currentInvoiceData.dueDate = calculateDueDate(currentInvoiceData.invoiceDate);
    }

    // Render sections
    renderInvoiceMeta();
    renderBillTo();
    renderServices();
    renderTotals();
    renderPaymentTerms();

    // Enable buttons
    enableDownloadButton();
    clearValidationError();
}

/**
 * Render invoice meta section (number, dates, PIN)
 */
function renderInvoiceMeta() {
    const data = currentInvoiceData;

    document.getElementById('invoiceNumber').textContent = data.invoiceNumber || '—';
    document.getElementById('invoiceDate').textContent = formatDateUK(data.invoiceDate);
    document.getElementById('dueDate').textContent = formatDateUK(data.dueDate);
    document.getElementById('pinCode').textContent = data.pin || '—';
}

/**
 * Render Bill To section
 */
function renderBillTo() {
    const data = currentInvoiceData;
    const client = data.client || {};

    // Client details - always show name and phone (required), conditionally show address
    document.getElementById('clientName').textContent = client.name || '—';
    document.getElementById('clientPhone').textContent = client.phone || '—';
    
    // Conditionally render address
    const addressLabel = document.querySelector('#clientAddress').previousElementSibling;
    const addressValue = document.getElementById('clientAddress');
    if (client.address && client.address.trim()) {
        addressLabel.style.display = '';
        addressValue.style.display = '';
        addressValue.textContent = client.address;
    } else {
        addressLabel.style.display = 'none';
        addressValue.style.display = 'none';
    }

    // Vehicle details - conditionally render each field
    const vehicleLabel = document.querySelector('#vehicleMakeModel').previousElementSibling;
    const vehicleValue = document.getElementById('vehicleMakeModel');
    if (client.vehicle && client.vehicle.trim()) {
        vehicleLabel.style.display = '';
        vehicleValue.style.display = '';
        vehicleValue.textContent = client.vehicle;
    } else {
        vehicleLabel.style.display = 'none';
        vehicleValue.style.display = 'none';
    }
    
    const regLabel = document.querySelector('#vehicleRegPlate').previousElementSibling;
    const regValue = document.getElementById('vehicleRegPlate');
    if (client.regPlate && client.regPlate.trim()) {
        regLabel.style.display = '';
        regValue.style.display = '';
        regValue.textContent = client.regPlate;
    } else {
        regLabel.style.display = 'none';
        regValue.style.display = 'none';
    }
    
    const mileageLabel = document.querySelector('#vehicleMileage').previousElementSibling;
    const mileageValue = document.getElementById('vehicleMileage');
    if (client.mileage) {
        mileageLabel.style.display = '';
        mileageValue.style.display = '';
        mileageValue.textContent = client.mileage;
    } else {
        mileageLabel.style.display = 'none';
        mileageValue.style.display = 'none';
    }
}

/**
 * Render services table
 */
function renderServices() {
    const data = currentInvoiceData;
    const tbody = document.getElementById('servicesTableBody');
    tbody.innerHTML = '';

    if (!data.items || data.items.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `
            <td colspan="4" style="text-align: center; padding: 2rem; color: var(--color-grey);">
                No services added
            </td>
        `;
        tbody.appendChild(emptyRow);
        showValidationError(['No services added']);
        return;
    }

    let warnings = [];

    data.items.forEach((item) => {
        const row = document.createElement('tr');
        let qty = Number(item.qty);
        let unitPrice = Number(item.unitPrice);

        const qtyValid = Number.isFinite(qty) && qty >= 0;
        const unitPriceValid = Number.isFinite(unitPrice) && unitPrice >= 0;

        if (!qtyValid || !unitPriceValid) {
            warnings.push('Some services have invalid qty/unit price');
            qty = qtyValid ? qty : 0;
            unitPrice = unitPriceValid ? unitPrice : 0;
            row.style.backgroundColor = '#fff3cd';
        }

        const lineTotal = qty * unitPrice;

        row.innerHTML = `
            <td class="col-description">${item.description || '—'}</td>
            <td class="col-qty">${qty}</td>
            <td class="col-unit-price">${formatCurrency(unitPrice)}</td>
            <td class="col-line-total">${formatCurrency(lineTotal)}</td>
        `;
        tbody.appendChild(row);
    });

    if (warnings.length > 0) {
        showValidationError([warnings[0]]);
    } else {
        clearValidationError();
    }
}

/**
 * Calculate and render totals
 */
function renderTotals() {
    const data = currentInvoiceData;

    const computedSubtotal = (data.items || []).reduce((sum, item) => {
        const qty = Number(item.qty) || 0;
        const unitPrice = Number(item.unitPrice) || 0;
        return sum + (qty * unitPrice);
    }, 0);

    const subtotal = typeof data.subtotal === 'number' ? data.subtotal : computedSubtotal;

    // Calculate VAT
    const vatPercent = data.vatPercent || 0;
    const vatAmount = vatPercent > 0 ? subtotal * (vatPercent / 100) : 0;
    const total = typeof data.total === 'number' ? data.total : subtotal + vatAmount;

    // Render
    document.getElementById('subtotal').textContent = formatCurrency(subtotal);
    document.getElementById('total').textContent = formatCurrency(total);

    // Show/hide VAT row
    const vatRow = document.getElementById('vatRow');
    if (vatPercent > 0) {
        vatRow.style.display = 'flex';
        document.getElementById('vatPercent').textContent = vatPercent.toString();
        document.getElementById('vatAmount').textContent = formatCurrency(vatAmount);
    } else {
        vatRow.style.display = 'none';
    }
}

/**
 * Render payment terms
 */
function renderPaymentTerms() {
    const data = currentInvoiceData;
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

/**
 * Initialize invoice page
 */
async function initInvoice() {
    // Set up event listeners
    setupEventListeners();

    // Read aptId from URL
    const params = new URLSearchParams(window.location.search);
    const aptId = params.get('aptId');

    if (!aptId) {
        showValidationError(['Missing appointment ID']);
        disableDownloadButton();
        return;
    }

    try {
        const { db } = await import('../../firebase/firebase-init.js');
        const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        const snap = await getDoc(doc(db, 'appointments', aptId));
        if (!snap.exists()) {
            showValidationError(['Appointment not found']);
            disableDownloadButton();
            return;
        }

        const appointment = { id: snap.id, ...snap.data() };
        const invoiceData = mapFirestoreAppointmentToInvoiceData(appointment);
        renderInvoice(invoiceData);
    } catch (error) {
        console.error('Error loading appointment invoice:', error);
        showValidationError(['Error loading appointment']);
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
 * Helper: Create invoice data from appointment object
 * Used by the main app to prepare invoice data
 */
function mapFirestoreAppointmentToInvoiceData(appointment) {
    if (!appointment) return null;

    const company = {
        name: 'Transvortex LTD',
        address: '81 Foley Rd, Birmingham B8 2JT',
        website: 'https://transvortexltd.co.uk/',
        facebook: 'https://www.facebook.com/profile.php?id=61586007316302',
        call: 'Iulian +44 7478280954',
        emergency: 'Mihai +44 7440787527'
    };

    // Normalize vehicle fields (support both old and new keys)
    const vehicleMakeModel = appointment.vehicleMakeModel 
        || appointment.makeModel 
        || (typeof appointment.car === 'string' ? appointment.car.split(',')[0].trim() : '')
        || '';

    const regPlate = appointment.registrationPlate 
        || appointment.regNumber 
        || (typeof appointment.car === 'string' && appointment.car.includes(',') 
            ? appointment.car.split(',')[1].trim() 
            : '')
        || '';

    const client = {
        name: appointment.customerName || '',
        address: appointment.address || '',
        phone: appointment.phone || appointment.customerPhone || '',
        vehicle: vehicleMakeModel,
        regPlate: regPlate,
        mileage: appointment.mileage || ''
    };

    const items = Array.isArray(appointment.services)
        ? appointment.services.map(s => ({
            description: s.description || '',
            qty: Number(s.qty),
            unitPrice: Number(s.unitPrice)
        }))
        : [];

    return {
        company,
        client,
        items,
        invoiceNumber: null,
        invoiceDate: appointment.dateStr || new Date().toISOString().split('T')[0],
        dueDate: null,
        pin: null,
        paymentTerms: 'Due within 7 days',
        vatPercent: appointment.vatPercent || 0,
        subtotal: typeof appointment.subtotal === 'number' ? appointment.subtotal : undefined,
        total: typeof appointment.total === 'number' ? appointment.total : undefined
    };
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initInvoice);
