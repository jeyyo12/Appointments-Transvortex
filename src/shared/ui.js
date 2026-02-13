/**
 * UI Utilities
 * Toast notifications, modals, loading states
 */

import { createElement, qs, addClass, removeClass } from './dom.js';

/**
 * Show toast notification
 * @param {string} message - Message text
 * @param {string} type - 'success' | 'error' | 'warning' | 'info'
 * @param {number} duration - Duration in ms (default: 3000)
 */
export function showToast(message, type = 'info', duration = 3000) {
  // Check if toast container exists
  let container = qs('#toast-container');
  if (!container) {
    container = createElement('div', {
      attributes: { id: 'toast-container' }
    });
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;
    document.body.appendChild(container);
  }
  
  // Create toast element
  const toast = createElement('div', {
    className: `toast toast-${type}`,
    text: message
  });
  
  toast.style.cssText = `
    padding: 12px 20px;
    background: ${getToastColor(type)};
    color: white;
    border-radius: 6px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    font-size: 14px;
    max-width: 350px;
    animation: slideIn 0.3s ease-out;
  `;
  
  container.appendChild(toast);
  
  // Auto-remove after duration
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Get toast background color based on type
 */
function getToastColor(type) {
  const colors = {
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6'
  };
  return colors[type] || colors.info;
}

/**
 * Show notification (alias for showToast)
 */
export function showNotification(message, type = 'info', duration = 3000) {
  showToast(message, type, duration);
}

/**
 * Show loading state on element
 * @param {Element} element - Target element
 * @param {string} message - Loading message
 */
export function showLoading(element, message = 'Loading...') {
  if (!element) return;
  
  element.disabled = true;
  element.dataset.originalText = element.textContent;
  element.textContent = message;
  addClass(element, 'loading');
}

/**
 * Hide loading state on element
 * @param {Element} element - Target element
 */
export function hideLoading(element) {
  if (!element) return;
  
  element.disabled = false;
  if (element.dataset.originalText) {
    element.textContent = element.dataset.originalText;
    delete element.dataset.originalText;
  }
  removeClass(element, 'loading');
}

/**
 * Show modal
 * @param {string} modalId - Modal element ID
 */
export function showModal(modalId) {
  const modal = qs(`#${modalId}`);
  if (modal) {
    removeClass(modal, 'hidden');
    addClass(document.body, 'modal-open');
  }
}

/**
 * Hide modal
 * @param {string} modalId - Modal element ID
 */
export function hideModal(modalId) {
  const modal = qs(`#${modalId}`);
  if (modal) {
    addClass(modal, 'hidden');
    removeClass(document.body, 'modal-open');
  }
}

/**
 * Confirm dialog (uses native browser confirm)
 * @param {string} message - Confirmation message
 * @returns {boolean} User's choice
 */
export function confirm(message) {
  return window.confirm(message);
}

/**
 * Alert dialog (uses native browser alert)
 * @param {string} message - Alert message
 */
export function alert(message) {
  window.alert(message);
}

/**
 * Prompt dialog (uses native browser prompt)
 * @param {string} message - Prompt message
 * @param {string} defaultValue - Default value
 * @returns {string|null} User input or null if cancelled
 */
export function prompt(message, defaultValue = '') {
  return window.prompt(message, defaultValue);
}

// Add CSS animations if not already present
if (!qs('#toast-animations-style')) {
  const style = createElement('style', {
    attributes: { id: 'toast-animations-style' },
    html: `
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      @keyframes slideOut {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(400px);
          opacity: 0;
        }
      }
    `
  });
  document.head.appendChild(style);
}
