/**
 * Multi-Language Support File
 * Transvortex Appointments Management System
 * Supports: EN (English), RO (Romanian)
 */

// ==========================================
// ENGLISH DICTIONARY
// ==========================================
export const LANG_EN = {
    // App General
    appTitle: "My Appointments",
    connected: "Connected",
    connectToStart: "🔓 Connect to continue",
    logout: "Logout",
    login: "Login",
    
    // Tabs & Navigation
    tabPages: "Pages",
    tabAppointments: "Appointments",
    tabInvoice: "Invoice",
    tabScheduled: "Scheduled",
    tabFinalized: "Finalized",
    tabCompleted: "Completed",
    tabCanceled: "Canceled",
    back: "Back",
    
    // Actions
    btnDetails: "Details",
    btnFinalize: "Finalize",
    btnDelay: "Delay / Reschedule",
    btnVisit: "Visit",
    btnInvoice: "Invoice",
    btnWhatsApp: "WhatsApp",
    btnEdit: "Edit",
    btnHistory: "History",
    btnDelete: "Delete",
    btnSave: "Save",
    btnCancel: "Cancel",
    btnConfirm: "Confirm",
    btnClose: "Close",
    btnSaveAppointment: "Save Appointment",
    btnSaveChanges: "Save Changes",
    btnSaveDetails: "Save Details",
    btnReset: "Reset",
    btnResetOverride: "Reset (clear override)",
    btnRefresh: "Refresh",
    btnDownloadPdf: "Download PDF",
    btnPrint: "Print",
    btnSendToClient: "Send to Client",
    btnEditInvoice: "Edit Invoice",
    btnMarkAsPaid: "Mark as Paid",
    btnClearPayment: "Clear Payment",
    
    // Filter & Search
    filterLabel: "Filter:",
    searchLabel: "Search:",
    searchPlaceholder: "Search client or vehicle...",
    filterAll: "All",
    filterScheduled: "Scheduled",
    filterFinalized: "Finalized",
    filterCanceled: "Canceled",
    
    // Status
    statusScheduled: "Scheduled",
    statusFinalized: "Finalized",
    statusCompleted: "Completed",
    statusCanceled: "Canceled",
    statusDelayed: "Delayed",
    statusRescheduled: "Rescheduled",
    statusDone: "Done",
    statusPosted: "Posted",
    statusActiveNotScheduled: "Active - Not Scheduled",
    statusInactiveSuggestDelete: "Inactive - Suggest Deletion",
    
    // Time
    today: "Today",
    tomorrow: "Tomorrow",
    
    // Form Fields
    clientName: "Client Name",
    customerName: "Customer Name",
    name: "Name",
    phone: "Phone",
    phoneNumber: "Phone Number",
    address: "Address",
    location: "Location",
    vehicle: "Vehicle",
    vehicleMakeModel: "Vehicle Make/Model",
    makeModel: "Make / Model",
    registration: "Registration",
    registrationPlate: "Registration Plate",
    regNumber: "Reg Number",
    carNumber: "Car Number",
    mileage: "Mileage",
    date: "Date",
    time: "Time",
    serviceType: "Service Type",
    serviceLocation: "Service Location",
    atGarage: "At garage",
    atClient: "At client",
    contactPreference: "Contact Preference",
    contactPrefPhone: "Phone",
    contactPrefSMS: "SMS",
    contactPrefWhatsApp: "WhatsApp",
    problem: "Problem",
    problemDescription: "Problem / Service Requested",
    serviceDetails: "Service Details",
    notes: "Notes",
    notesAdditional: "Additional Notes",
    notesInternal: "Internal notes...",
    status: "Status",
    shortNote: "Short note",
    optional: "optional",
    required: "required",
    
    // Payment
    payment: "Payment",
    paymentInfo: "Payment Information",
    amountPaid: "Amount Paid",
    balanceDue: "Balance Due",
    paymentMethod: "Payment Method",
    paymentDate: "Payment Date",
    paymentNote: "Payment Note",
    paymentStatus: "Payment Status",
    paymentMethodCash: "Cash",
    paymentMethodCard: "Card",
    paymentMethodBankTransfer: "Bank Transfer",
    paymentMethodOther: "Other",
    unpaid: "Unpaid",
    partiallyPaid: "Partially Paid",
    paid: "Paid",
    
    // Invoice
    invoice: "Invoice",
    invoiceDetails: "Invoice - Details",
    invoiceNumber: "Invoice Number",
    invoiceDate: "Invoice Date",
    dueDate: "Due Date",
    reference: "Reference",
    billTo: "Bill To",
    services: "Services",
    parts: "Parts",
    qty: "Qty",
    quantity: "Quantity",
    description: "Description",
    unitPrice: "Unit Price",
    price: "Price",
    lineTotal: "Line Total",
    subtotal: "Subtotal",
    vat: "VAT",
    total: "Total",
    chooseAppointment: "Choose Appointment (Finalized):",
    selectOption: "-- Select --",
    
    // Modals
    modalDetailsTitle: "Details:",
    modalEditTitle: "Edit:",
    modalFinalizeTitle: "Quick Finalize",
    modalAppointmentDetails: "Appointment Details",
    modalClientInfo: "Client",
    modalDateTime: "Date & Time",
    modalVehicleInfo: "Vehicle",
    modalLocationService: "Location & Service",
    modalServiceDetails: "Service Details",
    modalStatusInfo: "Status",
    modalPaymentInfo: "Payment Information",
    closeDetails: "Close details",
    
    // Messages & Notifications
    msgNoAppointmentsScheduled: "You have no scheduled appointments yet.",
    msgNoAppointmentsFinalized: "You have no finalized jobs yet.",
    msgDraftFound: "Unsaved draft found",
    msgDraftFoundDesc: "We found an unsaved draft for this appointment. Do you want to recover it?",
    msgDraftRecovered: "📝 Draft recovered",
    msgDraftDeleted: "🗑️ Draft deleted",
    msgIgnore: "Ignore",
    msgRecover: "Recover",
    msgDeleteDraft: "Delete draft",
    msgUnsavedChanges: "Unsaved changes",
    msgUnsavedChangesConfirm: "You have unsaved changes. Are you sure you want to cancel them?",
    msgYesCancel: "Yes, cancel",
    msgNoStay: "No, stay",
    msgAppointmentUpdated: "✅ Appointment successfully updated",
    msgAppointmentFinalized: "✅ Appointment finalized! Open invoice for complete details.",
    msgAppointmentCanceled: "✅ Appointment canceled",
    msgSavingChanges: "Saving...",
    msgSaving: "Saving...",
    msgCongratulations: "🎉 Congratulations! You've posted to all scheduled pages.",
    
    // Errors & Validation
    errorRequiredFields: "⚠️ Missing required fields:",
    errorRequiredName: "Name required",
    errorRequiredPhone: "Phone required (ex: 07700 900 123)",
    errorRequiredDate: "Date required",
    errorRequiredTime: "Time required",
    errorRequiredReg: "Registration plate required",
    errorRequiredProblem: "Problem description is required",
    errorInvalidPhone: "Invalid format (ex: 07700 900 123)",
    errorNegativeAmount: "⚠️ Amount paid cannot be negative",
    errorCompleteNameAndReg: "⚠️ Complete client name and car number",
    errorSaving: "❌ Error saving:",
    errorDeleting: "❌ Error deleting:",
    errorLoading: "Error loading",
    errorNoAppointmentId: "Appointment has no ID",
    errorAppointmentNotFound: "Appointment not found",
    
    // Confirmations
    confirmDeleteTitle: "Delete appointment?",
    confirmDeleteMsg: "This action cannot be undone.",
    confirmDeletePage: "Delete page? This action cannot be undone.",
    
    // CSV Export
    csv: "CSV",
    exportCSV: "Export CSV",
    
    // Firestore Note
    firestoreNote: "Note: these fields are saved in Firestore at",
    
    // Days of week
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
    
    // Misc
    client: "Client",
    or: "or",
    of: "of",
    at: "at",
    on: "on",
    appointmentScheduling: "Appointment",
    appointmentSummary: "Appointment Summary",
    scheduled: "scheduled",
    finalized: "finalized",
    
    // Header
    headerManager: "Manager",
    headerCompany: "Company",
    headerTransvortex: "Transvortex",
    headerSubtitle1: "Organize",
    headerSubtitle2: "your appointments and posts",
    headerSubtitle3: "for your company",
    
    // Tab Navigation
    tabPagesFacebook: "Facebook Pages",
    tabInvoices: "Invoices",
    
    // Pages Tab
    addNewPage: "Add New Page",
    pageName: "Page Name",
    pageNamePlaceholder: "e.g., Transvortex LTD Official",
    pageUrl: "Facebook Page URL",
    pageUrlPlaceholder: "https://facebook.com/...",
    pageAvatar: "Avatar URL (optional)",
    pageAvatarPlaceholder: "https://... (logo or profile pic)",
    btnAddPage: "Add Page",
    statsPostedTo: "Posted to",
    statsPostedToOf: "of",
    statsPostedToScheduled: "scheduled",
    noScheduledPages: "No scheduled pages",
    markAllPosted: "Mark all as posted",
    removeFromWeek: "Remove from this week",
    
    // Stats Cards
    statsTotalAppointments: "Total Appointments",
    statsToday: "Today",
    statsUpcoming: "Upcoming",
    statsCompleted: "Finalized",
    
    // Add Appointment Form
    addNewAppointment: "Add New Appointment",
    formSubtitle: "Fill in the form to schedule a new repair",
    sectionClient: "Client",
    fieldName: "Name",
    fieldNamePlaceholder: "e.g., John Smith",
    fieldPhone: "Phone",
    fieldPhonePlaceholder: "e.g., +44 7700 900 123",
    errorNameRequired: "Name is required",
    errorPhoneRequired: "Phone is required",
    sectionVehicle: "Vehicle",
    fieldMakeModel: "Make/Model (optional)",
    fieldMakeModelPlaceholder: "e.g., Dacia Logan",
    fieldRegNumber: "Registration Number",
    fieldRegNumberPlaceholder: "e.g., AB-12-XYZ",
    errorRegRequired: "Registration number is required",
    sectionDateTime: "Date & Time",
    fieldDate: "Date",
    fieldTime: "Time",
    sectionProblem: "Problem / Service",
    fieldProblem: "Problem Description",
    fieldProblemPlaceholder: "Describe the issue or service needed...",
    fieldShortNote: "Short note (optional)",
    fieldShortNotePlaceholder: "Additional details...",
    
    // Empty State
    emptyStateAppointments: "Add your first appointment using the form on the left."
};

// ==========================================
// ROMANIAN DICTIONARY
// ==========================================
export const LANG_RO = {
    // App General
    appTitle: "Programările Mele",
    connected: "Conectat",
    connectToStart: "🔓 Conectează-te pentru a continua",
    logout: "Deconectare",
    login: "Autentificare",
    
    // Tabs & Navigation
    tabPages: "Pagini",
    tabAppointments: "Programări",
    tabInvoice: "Factură",
    tabScheduled: "Programate",
    tabFinalized: "Finalizate",
    tabCompleted: "Finalizate",
    tabCanceled: "Anulate",
    back: "Înapoi",
    
    // Actions
    btnDetails: "Detalii",
    btnFinalize: "Finalizează",
    btnDelay: "Întârzie / Reprogramează",
    btnVisit: "Vizitează",
    btnInvoice: "Factură",
    btnWhatsApp: "WhatsApp",
    btnEdit: "Editează",
    btnHistory: "Istoric",
    btnDelete: "Șterge",
    btnSave: "Salvează",
    btnCancel: "Anulează",
    btnConfirm: "Confirmă",
    btnClose: "Închide",
    btnSaveAppointment: "Salvează Programarea",
    btnSaveChanges: "Salvează Modificări",
    btnSaveDetails: "Salvează Detaliile",
    btnReset: "Resetează",
    btnResetOverride: "Resetează (șterge override)",
    btnRefresh: "Reîncarcă",
    btnDownloadPdf: "Descarcă PDF",
    btnPrint: "Printează",
    btnSendToClient: "Trimite la Client",
    btnEditInvoice: "Editează Factura",
    btnMarkAsPaid: "Marchează Plătit",
    btnClearPayment: "Șterge Plata",
    
    // Filter & Search
    filterLabel: "Filtrează:",
    searchLabel: "Caută:",
    searchPlaceholder: "Caută client sau mașină...",
    filterAll: "Toate",
    filterScheduled: "Programate",
    filterFinalized: "Finalizate",
    filterCanceled: "Anulate",
    
    // Status
    statusScheduled: "Programat",
    statusFinalized: "Finalizat",
    statusCompleted: "Finalizat",
    statusCanceled: "Anulat",
    statusDelayed: "Întârziat",
    statusRescheduled: "Reprogramat",
    statusDone: "Finalizat",
    statusPosted: "Postat",
    statusActiveNotScheduled: "Activ - Neprogramat",
    statusInactiveSuggestDelete: "Inactiv - Sugestie Ștergere",
    
    // Time
    today: "Astăzi",
    tomorrow: "Mâine",
    
    // Form Fields
    clientName: "Nume Client",
    customerName: "Nume Client",
    name: "Nume",
    phone: "Telefon",
    phoneNumber: "Număr Telefon",
    address: "Adresă",
    location: "Locație",
    vehicle: "Vehicul",
    vehicleMakeModel: "Marca/Modelul Mașinii",
    makeModel: "Marca / Model",
    registration: "Înmatriculare",
    registrationPlate: "Număr Înmatriculare",
    regNumber: "Nr. Înmatriculare",
    carNumber: "Număr Mașină",
    mileage: "Kilometraj",
    date: "Data",
    time: "Ora",
    serviceType: "Tip Serviciu",
    serviceLocation: "Locație Serviciu",
    atGarage: "La garaj",
    atClient: "La client",
    contactPreference: "Preferință Contact",
    contactPrefPhone: "Telefon",
    contactPrefSMS: "SMS",
    contactPrefWhatsApp: "WhatsApp",
    problem: "Problemă",
    problemDescription: "Problemă / Serviciu Solicitat",
    serviceDetails: "Detalii Serviciu",
    notes: "Notițe",
    notesAdditional: "Notițe Adiționale",
    notesInternal: "Notițe interne...",
    status: "Status",
    shortNote: "Notă scurtă",
    optional: "opțional",
    required: "obligatoriu",
    
    // Payment
    payment: "Plată",
    paymentInfo: "Informații Plată",
    amountPaid: "Suma Plătită",
    balanceDue: "Sold Restant",
    paymentMethod: "Metodă Plată",
    paymentDate: "Data Plății",
    paymentNote: "Notă Plată",
    paymentStatus: "Status Plată",
    paymentMethodCash: "Numerar",
    paymentMethodCard: "Card",
    paymentMethodBankTransfer: "Transfer Bancar",
    paymentMethodOther: "Altă metodă",
    unpaid: "Neplătit",
    partiallyPaid: "Plătit Parțial",
    paid: "Plătit",
    
    // Invoice
    invoice: "Factură",
    invoiceDetails: "Factură - Detalii",
    invoiceNumber: "Număr Factură",
    invoiceDate: "Data Facturii",
    dueDate: "Data Scadentă",
    reference: "Referință",
    billTo: "Facturat Către",
    services: "Servicii",
    parts: "Piese",
    qty: "Cant",
    quantity: "Cantitate",
    description: "Descriere",
    unitPrice: "Preț Unitar",
    price: "Preț",
    lineTotal: "Total Linie",
    subtotal: "Subtotal",
    vat: "TVA",
    total: "Total",
    chooseAppointment: "Alege Programarea (Finalizate):",
    selectOption: "-- Selectează --",
    
    // Modals
    modalDetailsTitle: "Detalii:",
    modalEditTitle: "Editează:",
    modalFinalizeTitle: "Finalizare Rapidă",
    modalAppointmentDetails: "Detalii Programare",
    modalClientInfo: "Client",
    modalDateTime: "Data & Ora",
    modalVehicleInfo: "Vehicul",
    modalLocationService: "Locație & Serviciu",
    modalServiceDetails: "Detalii Serviciu",
    modalStatusInfo: "Status",
    modalPaymentInfo: "Informații Plată",
    closeDetails: "Închide detalii",
    
    // Messages & Notifications
    msgNoAppointmentsScheduled: "Nu ai programări programate încă.",
    msgNoAppointmentsFinalized: "Nu ai lucrări finalizate încă.",
    msgDraftFound: "Draft nesalvat găsit",
    msgDraftFoundDesc: "Am găsit un draft nesalvat pentru această programare. Vrei să îl recuperezi?",
    msgDraftRecovered: "📝 Draft recuperat",
    msgDraftDeleted: "🗑️ Draft șters",
    msgIgnore: "Ignoră",
    msgRecover: "Recuperează",
    msgDeleteDraft: "Șterge draft",
    msgUnsavedChanges: "Modificări nesalvate",
    msgUnsavedChangesConfirm: "Ai modificări nesalvate. Sigur vrei să le anulezi?",
    msgYesCancel: "Da, anulează",
    msgNoStay: "Nu, rămân",
    msgAppointmentUpdated: "✅ Programare actualizată cu succes",
    msgAppointmentFinalized: "✅ Programare finalizată! Deschide factura pentru detalii complete.",
    msgAppointmentCanceled: "✅ Programare anulată",
    msgSavingChanges: "Se salvează...",
    msgSaving: "Se salvează...",
    msgCongratulations: "🎉 Felicitări! Ai postat în toate paginile programate.",
    
    // Errors & Validation
    errorRequiredFields: "⚠️ Câmpuri obligatorii lipsă:",
    errorRequiredName: "Nume obligatoriu",
    errorRequiredPhone: "Telefon obligatoriu (ex: 07700 900 123)",
    errorRequiredDate: "Data obligatorie",
    errorRequiredTime: "Ora obligatorie",
    errorRequiredReg: "Număr înmatriculare obligatoriu",
    errorRequiredProblem: "Descrierea problemei este obligatorie",
    errorInvalidPhone: "Format invalid (ex: 07700 900 123)",
    errorNegativeAmount: "⚠️ Suma plătită nu poate fi negativă",
    errorCompleteNameAndReg: "⚠️ Completează nume client și număr mașină",
    errorSaving: "❌ Eroare la salvare:",
    errorDeleting: "❌ Eroare la ștergere:",
    errorLoading: "Eroare la încărcare",
    errorNoAppointmentId: "Programarea nu are ID",
    errorAppointmentNotFound: "Programarea nu a fost găsită",
    
    // Confirmations
    confirmDeleteTitle: "Șterge programarea?",
    confirmDeleteMsg: "Această acțiune nu poate fi anulată.",
    confirmDeletePage: "Șterge pagina? Această acțiune nu poate fi anulată.",
    
    // CSV Export
    csv: "CSV",
    exportCSV: "Exportă CSV",
    
    // Firestore Note
    firestoreNote: "Notă: aceste câmpuri se salvează în Firestore la",
    
    // Days of week
    monday: "Luni",
    tuesday: "Marți",
    wednesday: "Miercuri",
    thursday: "Joi",
    friday: "Vineri",
    saturday: "Sâmbătă",
    sunday: "Duminică",
    
    // Misc
    client: "Client",
    or: "sau",
    of: "din",
    at: "la",
    on: "pe",
    appointmentScheduling: "Programare",
    appointmentSummary: "Sumar Programare",
    scheduled: "programată",
    finalized: "finalizată",
    
    // Header
    headerManager: "Manager",
    headerCompany: "Companie",
    headerTransvortex: "Transvortex",
    headerSubtitle1: "Organizează-ți",
    headerSubtitle2: "programările și postările",
    headerSubtitle3: "pentru compania ta",
    
    // Tab Navigation
    tabPagesFacebook: "Pagini Facebook",
    tabInvoices: "Facturi",
    
    // Pages Tab
    addNewPage: "Adaugă Pagină Nouă",
    pageName: "Nume Pagină",
    pageNamePlaceholder: "ex: Transvortex LTD Official",
    pageUrl: "URL Pagină Facebook",
    pageUrlPlaceholder: "https://facebook.com/...",
    pageAvatar: "URL Avatar (opțional)",
    pageAvatarPlaceholder: "https://... (logo sau poză de profil)",
    btnAddPage: "Adaugă Pagină",
    statsPostedTo: "Postat în",
    statsPostedToOf: "din",
    statsPostedToScheduled: "programate",
    noScheduledPages: "Nicio pagină programată",
    markAllPosted: "Marchează toate ca postate",
    removeFromWeek: "Elimină din săptămâna aceasta",
    
    // Stats Cards
    statsTotalAppointments: "Total Programări",
    statsToday: "Astăzi",
    statsUpcoming: "Următoarele",
    statsCompleted: "Finalizate",
    
    // Add Appointment Form
    addNewAppointment: "Adaugă Programare Nouă",
    formSubtitle: "Completează formularul pentru a programa o nouă reparație",
    sectionClient: "Client",
    fieldName: "Nume",
    fieldNamePlaceholder: "ex: Ion Popescu",
    fieldPhone: "Telefon",
    fieldPhonePlaceholder: "ex: +44 7700 900 123",
    errorNameRequired: "Numele este obligatoriu",
    errorPhoneRequired: "Telefonul este obligatoriu",
    sectionVehicle: "Vehicul",
    fieldMakeModel: "Marca/Model (opțional)",
    fieldMakeModelPlaceholder: "ex: Dacia Logan",
    fieldRegNumber: "Nr. Înmatriculare",
    fieldRegNumberPlaceholder: "ex: AB-12-XYZ",
    errorRegRequired: "Nr. înmatriculare este obligatoriu",
    sectionDateTime: "Data & Ora",
    fieldDate: "Data",
    fieldTime: "Ora",
    sectionProblem: "Problemă / Serviciu",
    fieldProblem: "Descriere Problemă",
    fieldProblemPlaceholder: "Descrie problema sau serviciul necesar...",
    fieldShortNote: "Notă scurtă (opțional)",
    fieldShortNotePlaceholder: "Detalii adiționale...",
    
    // Empty State
    emptyStateAppointments: "Adaugă prima ta programare folosind formularul din stânga."
};

// ==========================================
// LANGUAGE STATE MANAGEMENT
// ==========================================

const STORAGE_KEY = 'tv_lang';
const DEFAULT_LANG = 'en';

/**
 * Get current language from localStorage
 * @returns {string} Current language code ('en' or 'ro')
 */
export function getLanguage() {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
}

/**
 * Set current language and persist to localStorage
 * @param {string} lang - Language code ('en' or 'ro')
 */
export function setLanguage(lang) {
    if (lang !== 'en' && lang !== 'ro') {
        console.warn(`[Language] Invalid language code: ${lang}. Defaulting to 'en'.`);
        lang = 'en';
    }
    localStorage.setItem(STORAGE_KEY, lang);
    console.log(`[Language] Language set to: ${lang}`);
}

/**
 * Translation function - retrieves text by key in current language
 * @param {string} key - The translation key
 * @returns {string} The translated text or the key if not found
 */
export function t(key) {
    const lang = getLanguage();
    const dict = lang === 'ro' ? LANG_RO : LANG_EN;
    
    // Try current language, fallback to English, then fallback to key
    return dict[key] ?? LANG_EN[key] ?? key;
}

// Default export for convenience
export default { LANG_EN, LANG_RO, t, getLanguage, setLanguage };
