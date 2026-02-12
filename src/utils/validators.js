/**
 * Validation Utilities
 * 
 * Centralized validation functions for forms, fields, and data throughout the application.
 */

import { VALIDATION_PATTERNS } from '../config/constants.js';

/**
 * Validate UK mobile phone number
 * Accepts formats:
 * - National: 07XXX XXX XXX (11 digits starting with 07)
 * - International: +447XXX XXX XXX (12 digits: 44 + 10 digits starting with 7)
 * @param {string} value - Phone number to validate
 * @returns {boolean} True if valid
 */
export function validatePhoneNumber(value) {
  if (!value) return false;
  
  const digits = value.replace(/\D/g, '');
  
  // International format: +447XXX XXX XXX
  if (digits.startsWith('44')) {
    return digits.length === 12 && digits[2] === '7';
  }
  
  // National format: 07XXX XXX XXX
  if (digits.startsWith('0')) {
    return digits.length === 11 && digits[1] === '7';
  }
  
  return false;
}

/**
 * Validate email address
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
export function validateEmail(email) {
  if (!email) return false;
  return VALIDATION_PATTERNS.EMAIL.test(email.trim());
}

/**
 * Validate UK postcode
 * @param {string} postcode - Postcode to validate
 * @returns {boolean} True if valid
 */
export function validatePostcode(postcode) {
  if (!postcode) return false;
  return VALIDATION_PATTERNS.UK_POSTCODE.test(postcode.trim());
}

/**
 * Validate UK registration plate
 * @param {string} regPlate - Registration plate to validate
 * @returns {boolean} True if valid
 */
export function validateRegPlate(regPlate) {
  if (!regPlate) return false;
  return VALIDATION_PATTERNS.UK_REG_PLATE.test(regPlate.trim());
}

/**
 * Validate a single form field
 * @param {HTMLElement} input - Input element to validate
 * @param {boolean} showError - Whether to show error UI (default: true)
 * @returns {boolean} True if valid
 */
export function validateField(input, showError = true) {
  const isRequired = input.hasAttribute('required') || input.classList.contains('tv-required');
  const value = input.value.trim();
  let isValid = !isRequired || value.length > 0;
  
  // Special validation for phone field
  if ((input.id === 'editPhone' || input.id === 'customerPhone') && value.length > 0) {
    isValid = validatePhoneNumber(value);
  }
  
  // Special validation for email field
  if ((input.type === 'email' || input.id === 'customerEmail') && value.length > 0) {
    isValid = validateEmail(value);
  }
  
  // Special validation for registration plate
  if ((input.id === 'regNumber' || input.id === 'editRegNumber') && value.length > 0) {
    isValid = value.length >= 6; // Basic length check
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

/**
 * Validate field using design system error display
 * @param {string} fieldId - ID of field to validate
 * @returns {boolean} True if valid
 */
export function validateFieldWithDesignSystem(fieldId) {
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
  } else if ((fieldId === 'customerPhone' || fieldId === 'editPhone') && value && !validatePhoneNumber(value)) {
    isValid = false;
    errorMsg = 'Număr telefon invalid';
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

/**
 * Validate all required fields in a form
 * @param {HTMLFormElement} form - Form element to validate
 * @returns {Object} { isValid: boolean, errors: string[] }
 */
export function validateAllFields(form) {
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

/**
 * Validate appointment data object
 * @param {Object} data - Appointment data
 * @returns {Object} { isValid: boolean, errors: Object }
 */
export function validateAppointmentData(data) {
  const errors = {};
  let isValid = true;
  
  if (!data.customerName || data.customerName.trim().length === 0) {
    errors.customerName = 'Numele clientului este obligatoriu';
    isValid = false;
  }
  
  if (!data.customerPhone || data.customerPhone.trim().length === 0) {
    errors.customerPhone = 'Telefonul este obligatoriu';
    isValid = false;
  } else if (!validatePhoneNumber(data.customerPhone)) {
    errors.customerPhone = 'Număr telefon invalid';
    isValid = false;
  }
  
  if (!data.dateStr || data.dateStr.trim().length === 0) {
    errors.dateStr = 'Data este obligatorie';
    isValid = false;
  }
  
  if (!data.time || data.time.trim().length === 0) {
    errors.time = 'Ora este obligatorie';
    isValid = false;
  }
  
  if (!data.registrationPlate || data.registrationPlate.trim().length < 6) {
    errors.registrationPlate = 'Înmatriculare invalidă';
    isValid = false;
  }
  
  if (!data.problemDescription || data.problemDescription.trim().length === 0) {
    errors.problemDescription = 'Problema/serviciul este obligatoriu';
    isValid = false;
  }
  
  return { isValid, errors };
}

/**
 * Validate invoice data
 * @param {Object} data - Invoice data
 * @returns {Object} { isValid: boolean, errors: Object }
 */
export function validateInvoiceData(data) {
  const errors = {};
  let isValid = true;
  
  if (!data.customerName || data.customerName.trim().length === 0) {
    errors.customerName = 'Customer name is required';
    isValid = false;
  }
  
  if (!data.registrationPlate || data.registrationPlate.trim().length === 0) {
    errors.registrationPlate = 'Registration plate is required';
    isValid = false;
  }
  
  // Validate mileage if provided
  if (data.mileage && isNaN(parseInt(data.mileage))) {
    errors.mileage = 'Mileage must be a number';
    isValid = false;
  }
  
  return { isValid, errors };
}

/**
 * Check if value is empty (null, undefined, empty string, or whitespace)
 * @param {*} value - Value to check
 * @returns {boolean} True if empty
 */
export function isEmpty(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim().length === 0);
}

/**
 * Check if value is a valid number
 * @param {*} value - Value to check
 * @returns {boolean} True if valid number
 */
export function isValidNumber(value) {
  if (isEmpty(value)) return false;
  const num = Number(value);
  return Number.isFinite(num);
}

/**
 * Check if date is in the past
 * @param {string|Date} date - Date to check
 * @returns {boolean} True if in the past
 */
export function isPastDate(date) {
  const checkDate = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  return checkDate < now;
}

/**
 * Check if two dates are the same day
 * @param {Date} d1 - First date
 * @param {Date} d2 - Second date
 * @returns {boolean} True if same day
 */
export function isSameDay(d1, d2) {
  return d1 && d2 && 
    d1.getFullYear() === d2.getFullYear() && 
    d1.getMonth() === d2.getMonth() && 
    d1.getDate() === d2.getDate();
}
