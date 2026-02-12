/**
 * Data Normalization Utilities
 * 
 * Centralized functions for transforming and normalizing data from Firestore
 * and user inputs into consistent formats throughout the application.
 */

/**
 * Coalesce mileage value from multiple possible field names
 * @param {Object} apt - Appointment object
 * @returns {number|string|null} Mileage value or null
 */
export function coalesceMileageValue(apt) {
  if (!apt) return null;
  const candidate = apt.mileage ?? apt.mileageFinal ?? apt.finalMileage ?? apt.kmFinal ?? apt.finalKm ?? apt.odometer;
  if (candidate === undefined || candidate === null || candidate === '') return null;
  const asNumber = Number(candidate);
  return Number.isFinite(asNumber) ? asNumber : candidate;
}

/**
 * Normalize appointment mileage field
 * Consolidates legacy field names into single 'mileage' field
 * @param {Object} apt - Appointment object
 * @returns {Object} Normalized appointment
 */
export function normalizeAppointmentMileage(apt) {
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

/**
 * Parse vehicle field to extract make/model and registration plate
 * Handles formats like "BMW X5 • ABC123" or "OPEL VIVARA (BV66HKE)"
 * @param {string} vehicleStr - Combined vehicle string
 * @returns {Object} { make: string, plate: string }
 */
export function parseVehicleField(vehicleStr) {
  if (!vehicleStr) return { make: '', plate: '' };
  const parts = vehicleStr.split('•').map(p => p.trim());
  return {
    make: parts[0] || '',
    plate: parts[1] || ''
  };
}

/**
 * Split vehicle and registration plate from various input formats
 * @param {string} inputString - Input like "OPEL VIVARA (BV66HKE)" or "OPEL VIVARA - BV66HKE"
 * @returns {Object} { vehicleMakeModel: string, regPlate: string }
 */
export function splitVehicleAndReg(inputString) {
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

/**
 * Normalize appointment fields with fallbacks for legacy Firestore keys
 * SINGLE SOURCE OF TRUTH - Used by all flows (Add/Edit/Finalize/Invoice)
 * @param {Object} apt - Raw appointment object from Firestore
 * @returns {Object} Normalized appointment
 */
export function normalizeAppointment(apt) {
  if (!apt) return {};
  
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

/**
 * Ensure scheduled date/time fields are present
 * @param {Object} apt - Appointment object
 * @returns {Object} Appointment with ensured fields
 */
export function ensureScheduledFields(apt) {
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

/**
 * Get scheduled timestamp from appointment
 * @param {Object} apt - Appointment object
 * @returns {Object|null} Firestore Timestamp or null
 */
export function getScheduledTimestamp(apt) {
  return apt?.scheduledDateTime || apt?.startAt || null;
}

/**
 * Get scheduled date as JavaScript Date
 * @param {Object} apt - Appointment object
 * @returns {Date|null} JavaScript Date or null
 */
export function getScheduledDate(apt) {
  const ts = getScheduledTimestamp(apt);
  if (ts?.toDate) return ts.toDate();
  if (apt?.dateStr && apt?.time) return new Date(`${apt.dateStr}T${apt.time}`);
  if (apt?.dateStr) return new Date(apt.dateStr);
  return null;
}

/**
 * Get original date (before reschedule) as JavaScript Date
 * @param {Object} apt - Appointment object
 * @returns {Date|null} JavaScript Date or null
 */
export function getOriginalDate(apt) {
  const ts = apt?.originalDateTime;
  if (ts?.toDate) return ts.toDate();
  return null;
}

/**
 * Format date to ISO string (YYYY-MM-DD)
 * @param {Date} date - JavaScript Date
 * @returns {string} ISO date string
 */
function formatISODate(date) {
  return date ? date.toISOString().split('T')[0] : '';
}

/**
 * Format time to HH:MM
 * @param {Date} date - JavaScript Date
 * @returns {string} Time string
 */
function formatHHMM(date) {
  if (!date) return '';
  return date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Get event type label for timeline display
 * @param {string} eventType - Event type code
 * @returns {string} Human-readable label (Romanian)
 */
export function getTimelineEventLabel(eventType) {
  const typeMap = {
    'DELAY_MODAL_OPENED': 'A deschis fereastra Întârziere/Reprogramare',
    'DELAYED': 'Întârziere',
    'RESCHEDULED': 'Reprogramare',
    'FINALIZED': 'Finalizat',
    'FINALIZE_QUICK': 'Finalizare Rapidă',
    'FINALIZE_MODAL_OPENED': 'A deschis fereastra Finalizare',
    'EDITED': 'Editat',
    'CREATED': 'Creat',
    'CANCELLED': 'Anulat',
    'DELETED': 'Șters',
    'INVOICE_UPDATED': 'Factură actualizată'
  };
  return typeMap[eventType] || eventType;
}

/**
 * Get reason code label for display
 * @param {string} code - Reason code
 * @returns {string} Human-readable label (Romanian)
 */
export function getReasonCodeLabel(code) {
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
