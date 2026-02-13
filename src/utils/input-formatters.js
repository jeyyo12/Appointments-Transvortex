/**
 * Input Formatting Utilities
 * 
 * Smart formatting for vehicle-related inputs: mileage and registration plate
 * Handles cursor stability, real-time formatting, and data preservation
 */

import { formatNumberWithCommas, numberToWordsEN, formatUKPlate } from './formatters.js';

/**
 * Keep caret at stable position after reformatting
 * @param {HTMLInputElement} input - Input element
 * @param {string} oldValue - Previous value
 * @param {string} newValue - New formatted value
 */
function keepCaretStable(input, oldValue, newValue) {
  const cursorPos = input.selectionStart || 0;
  
  // Count non-comma characters before cursor in old value
  let nonCommaCount = 0;
  for (let i = 0; i < Math.min(cursorPos, oldValue.length); i++) {
    if (oldValue[i] !== ',') nonCommaCount++;
  }
  
  // Find position in new value where we've read nonCommaCount non-comma characters
  let newCursorPos = 0;
  let readCount = 0;
  for (let i = 0; i < newValue.length; i++) {
    if (newValue[i] !== ',') readCount++;
    if (readCount === nonCommaCount) {
      newCursorPos = i + 1;
      break;
    }
  }
  
  // If we couldn't find the position (e.g., all commas removed), place at end
  if (newCursorPos === 0) newCursorPos = newValue.length;
  
  setTimeout(() => {
    try {
      input.setSelectionRange(newCursorPos, newCursorPos);
    } catch (e) {
      // Ignore errors in setSelectionRange
    }
  }, 0);
}

/**
 * Format mileage input with commas and update hint
 * @param {HTMLInputElement} input - Mileage input element
 */
function formatMileageInput(input) {
  const oldValue = input.value;
  
  // Extract only digits
  const digitsOnly = oldValue.replace(/\D/g, '');
  
  // Parse as number
  const num = digitsOnly ? Number(digitsOnly) : 0;
  
  // Store raw numeric value in dataset
  input.dataset.rawMileage = String(num);
  
  // Format with commas
  const formatted = formatNumberWithCommas(num);
  
  // Update input only if value changed
  if (input.value !== formatted) {
    keepCaretStable(input, oldValue, formatted);
    input.value = formatted;
  }
  
  // Update hint text with English words
  const hintEl = document.getElementById('mileage-hint');
  if (hintEl) {
    if (num > 0) {
      const words = numberToWordsEN(num);
      hintEl.textContent = `${formatted} miles (${words})`;
    } else {
      hintEl.textContent = 'Enter miles (numbers only)';
    }
  }
}

/**
 * Format registration plate input with UK formatting
 * @param {HTMLInputElement} input - Registration input element
 */
function formatPlateInput(input) {
  const oldValue = input.value;
  
  // Remove illegal characters (keep only alphanumerics)
  let cleaned = oldValue.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  
  // Apply UK plate formatting
  const formatted = formatUKPlate(cleaned);
  
  // Update input only if value changed
  if (input.value !== formatted) {
    // Keep cursor stable (account for spaces added)
    const cursorPos = input.selectionStart || 0;
    
    // Find cursor position accounting for spaces
    let positionMap = [];
    let displayPos = 0;
    for (let i = 0; i < cleaned.length; i++) {
      // Map from cleaned position to formatted position
      if (formatted[displayPos] === ' ') displayPos++;
      positionMap[i] = displayPos;
      displayPos++;
    }
    
    input.value = formatted;
    
    // Try to maintain reasonable cursor position
    const oldCursorInCleaned = Math.min(cursorPos, cleaned.length);
    const newCursorPos = positionMap[oldCursorInCleaned] || formatted.length;
    
    setTimeout(() => {
      try {
        input.setSelectionRange(newCursorPos, newCursorPos);
      } catch (e) {
        // Ignore errors
      }
    }, 0);
  }
}

/**
 * Initialize vehicle section input formatting
 * Sets up event listeners for mileage and registration plate inputs
 */
export function initializeVehicleFormatting() {
  const mileageInput = document.getElementById('mileage');
  const plateInput = document.getElementById('regNumber');
  
  if (mileageInput) {
    // Initialize raw value
    const initialNum = mileageInput.value.replace(/\D/g, '');
    mileageInput.dataset.rawMileage = initialNum || '0';
    
    mileageInput.addEventListener('input', () => formatMileageInput(mileageInput));
    mileageInput.addEventListener('blur', () => {
      // Ensure raw value is updated on blur
      const num = mileageInput.value.replace(/\D/g, '');
      mileageInput.dataset.rawMileage = num || '0';
    });
  }
  
  if (plateInput) {
    plateInput.addEventListener('input', () => formatPlateInput(plateInput));
  }
}

/**
 * Get raw numeric mileage value for data submission
 * @returns {number} Raw mileage value (0 if empty)
 */
export function getRawMileage() {
  const input = document.getElementById('mileage');
  if (!input) return 0;
  const raw = input.dataset.rawMileage || '0';
  return Number(raw);
}

/**
 * Get formatted registration plate value
 * @returns {string} Plate value (e.g., "AB12 XYZ")
 */
export function getRegistrationPlate() {
  const input = document.getElementById('regNumber');
  return input ? input.value.trim() : '';
}

/**
 * Refresh formatting for all vehicle inputs (useful after programmatically setting values)
 * @returns {void}
 */
export function refreshVehicleFormatting() {
  const mileageInput = document.getElementById('mileage');
  if (mileageInput && mileageInput.value) {
    formatMileageInput(mileageInput);
  }
  
  const plateInput = document.getElementById('regNumber');
  if (plateInput && plateInput.value) {
    formatPlateInput(plateInput);
  }
}
