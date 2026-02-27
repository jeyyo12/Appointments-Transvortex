/**
 * Notification System
 * 
 * Centralized notification and toast message system for user feedback.
 */

import { NOTIFICATION_TYPES, UI_DEFAULTS } from '../config/constants.js';

/**
 * Show notification (legacy style, top-right corner)
 * @param {string} message - Message to display
 * @param {string} type - Notification type: 'success', 'error', 'warning', 'info'
 */
export function showNotification(message, type = NOTIFICATION_TYPES.INFO) {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    background: ${getNotificationColor(type)};
    color: white;
    padding: 15px 25px;
    border-radius: 8px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    z-index: 999;
    animation: slideIn 0.3s ease;
  `;
  notification.innerHTML = `
    <i class="fas fa-${getNotificationIcon(type)}"></i>
    ${message}
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, UI_DEFAULTS.NOTIFICATION_DURATION);
}

/**
 * Show toast notification (design system style)
 * @param {string} message - Message to display
 * @param {string} type - Toast type: 'success', 'error', 'warning', 'info'
 */
export function showToast(message, type = NOTIFICATION_TYPES.SUCCESS) {
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
  
  toast.innerHTML = `
    <i class="fas fa-${getNotificationIcon(type)}"></i>
    <span>${message}</span>
  `;
  
  toastContainer.appendChild(toast);
  
  // Auto-remove after duration
  setTimeout(() => {
    toast.style.animation = 'tvToastSlideOut 0.3s ease forwards';
    setTimeout(() => {
      toast.remove();
      // Remove container if empty
      if (toastContainer.children.length === 0) {
        toastContainer.remove();
      }
    }, UI_DEFAULTS.ANIMATION_DURATION);
  }, UI_DEFAULTS.NOTIFICATION_DURATION);
}

/**
 * Show success notification
 * @param {string} message - Success message
 */
export function showSuccess(message) {
  showToast(message, NOTIFICATION_TYPES.SUCCESS);
}

/**
 * Show error notification
 * @param {string} message - Error message
 */
export function showError(message) {
  showToast(message, NOTIFICATION_TYPES.ERROR);
}

/**
 * Show warning notification
 * @param {string} message - Warning message
 */
export function showWarning(message) {
  showToast(message, NOTIFICATION_TYPES.WARNING);
}

/**
 * Show info notification
 * @param {string} message - Info message
 */
export function showInfo(message) {
  showToast(message, NOTIFICATION_TYPES.INFO);
}

/**
 * Get notification background color based on type
 * @private
 * @param {string} type - Notification type
 * @returns {string} CSS color
 */
function getNotificationColor(type) {
  const colors = {
    [NOTIFICATION_TYPES.SUCCESS]: '#10b981',
    [NOTIFICATION_TYPES.ERROR]: '#ef4444',
    [NOTIFICATION_TYPES.WARNING]: '#f59e0b',
    [NOTIFICATION_TYPES.INFO]: '#3b82f6'
  };
  return colors[type] || colors[NOTIFICATION_TYPES.INFO];
}

/**
 * Get notification icon based on type
 * @private
 * @param {string} type - Notification type
 * @returns {string} FontAwesome icon name
 */
function getNotificationIcon(type) {
  const icons = {
    [NOTIFICATION_TYPES.SUCCESS]: 'check-circle',
    [NOTIFICATION_TYPES.ERROR]: 'exclamation-circle',
    [NOTIFICATION_TYPES.WARNING]: 'exclamation-triangle',
    [NOTIFICATION_TYPES.INFO]: 'info-circle'
  };
  return icons[type] || icons[NOTIFICATION_TYPES.INFO];
}

/**
 * Highlight and scroll to an appointment in the list
 * @param {string} appointmentId - Appointment ID
 * @param {{ userInitiated?: boolean }} [opts] - Scroll behavior options
 */
export function highlightAndScrollToAppointment(appointmentId, opts = {}) {
  const aptRow = document.querySelector(`.aptRow[data-apt-id="${appointmentId}"]`);
  
  if (!aptRow) {
    console.warn(`⚠️ Appointment row not found for ID: ${appointmentId}`);
    return;
  }
  
  // Add highlight class
  aptRow.classList.add('tvHighlight');
  
  // Scroll to appointment (smooth only for explicit user actions)
  const isUserNav = !!window.__TVX_USER_NAV;
  const fromUser = opts.userInitiated === true || isUserNav;
  if (window.TVX_SCROLL_DEBUG === true) {
    console.debug('[TVX:SCROLL]', 'utils-notifications:appointment-highlight', {
      appointmentId,
      fromUser,
      isUserNav,
    });
  }
  if (fromUser) {
    aptRow.scrollIntoView?.({
      behavior: 'auto',
      block: 'center',
      inline: 'nearest'
    });
  }
  
  // Remove highlight after animation
  setTimeout(() => {
    aptRow.classList.remove('tvHighlight');
  }, 2000);
}

/**
 * Show confirmation dialog
 * @param {string} message - Confirmation message
 * @param {string} confirmText - Confirm button text (default: 'Confirm')
 * @param {string} cancelText - Cancel button text (default: 'Cancel')
 * @returns {Promise<boolean>} True if confirmed, false if cancelled
 */
export function showConfirmation(message, confirmText = 'Confirm', cancelText = 'Cancel') {
  return new Promise((resolve) => {
    const dialog = document.createElement('div');
    dialog.className = 'tvConfirmDialog';
    dialog.innerHTML = `
      <div class="tvConfirmDialog__backdrop"></div>
      <div class="tvConfirmDialog__content">
        <p class="tvConfirmDialog__message">${message}</p>
        <div class="tvConfirmDialog__actions">
          <button class="tvBtn tvBtn--secondary" data-action="cancel">${cancelText}</button>
          <button class="tvBtn tvBtn--primary" data-action="confirm">${confirmText}</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    const cleanup = () => {
      dialog.remove();
    };
    
    dialog.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'confirm') {
        cleanup();
        resolve(true);
      } else if (action === 'cancel' || e.target.classList.contains('tvConfirmDialog__backdrop')) {
        cleanup();
        resolve(false);
      }
    });
  });
}

/**
 * Show loading indicator
 * @param {string} message - Loading message (optional)
 * @returns {Function} Function to hide the loading indicator
 */
export function showLoading(message = 'Se încarcă...') {
  const loader = document.createElement('div');
  loader.className = 'tvLoadingOverlay';
  loader.innerHTML = `
    <div class="tvLoadingSpinner"></div>
    <p class="tvLoadingMessage">${message}</p>
  `;
  
  document.body.appendChild(loader);
  document.body.classList.add('modal-open');
  
  // Return function to hide loader
  return () => {
    loader.remove();
    document.body.classList.remove('modal-open');
  };
}

/**
 * Debounce function - limits how often a function can be called
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait = UI_DEFAULTS.DEBOUNCE_DELAY) {
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

/**
 * Throttle function - ensures function is called at most once per interval
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, limit = UI_DEFAULTS.DEBOUNCE_DELAY) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}
