/**
 * Initialize Language - Translates static HTML elements on page load
 * Import this module in index.html after language.js
 */

import { t } from './language.js';

/**
 * Apply translations to data-i18n elements within a root element
 * @param {HTMLElement} root - The root element to search for translatable elements (defaults to document)
 */
function applyTranslations(root = document) {
    // Guard: ensure root is a valid DOM element
    if (!root || typeof root.querySelectorAll !== 'function') {
        console.warn('[Translation] Invalid root element passed to applyTranslations, using document instead', root);
        root = document;
    }
    
    // Translate elements with data-i18n attribute
    root.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = t(key);  // t() will read current language from localStorage
        
        // Handle different element types
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            if (el.placeholder) {
                el.placeholder = translation;
            }
        } else if (el.tagName === 'OPTION') {
            el.textContent = translation;
        } else {
            // For other elements, translate text content
            el.textContent = translation;
        }
    });
    
    // Translate elements with data-i18n-placeholder attribute
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
    });
    
    // Translate elements with data-i18n-aria attribute
    root.querySelectorAll('[data-i18n-aria]').forEach(el => {
        const key = el.getAttribute('data-i18n-aria');
        el.setAttribute('aria-label', t(key));
    });
    
    // Translate elements with data-i18n-title attribute
    root.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        el.setAttribute('title', t(key));
    });
}

/**
 * Translate static HTML elements by data-i18n attribute
 * @deprecated Use applyTranslations() instead
 */
function translateStaticElements() {
    applyTranslations(document);
}

/**
 * Initialize language on DOM ready
 */
function initLanguage() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', translateStaticElements);
    } else {
        translateStaticElements();
    }
}

// Auto-initialize
initLanguage();

// Expose globally for debugging and manual calls
window.applyTranslations = applyTranslations;

// Listen for language change events
window.addEventListener('languagechange', () => {
    console.log('[LANG] languagechange event received, re-applying translations');
    applyTranslations(document);
});

// Export for manual re-translation and language switching
export { applyTranslations, translateStaticElements, initLanguage };
