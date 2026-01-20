// ==========================================
// MODAL COMPONENT - Reutilizabil & Stilizat
// ==========================================

// ==========================================
// HISTORY INTEGRATION - GLOBAL MODAL STACK
// ==========================================

/**
 * Modal stack - tracks all open modals for history management
 * Each entry: { overlay, close, hasUnsavedChanges }
 */
const modalStack = [];

/**
 * Check if any modal is currently open
 * @returns {boolean}
 */
function isAnyModalOpen() {
    return modalStack.length > 0;
}

/**
 * Close the top-most (most recently opened) modal
 * @param {boolean} skipUnsavedCheck - Skip unsaved changes confirmation
 * @returns {boolean} - true if closed, false if user cancelled
 */
async function closeTopModal(skipUnsavedCheck = false) {
    if (!isAnyModalOpen()) return false;

    const topModal = modalStack[modalStack.length - 1];
    
    // Check for unsaved changes
    if (!skipUnsavedCheck && topModal.hasUnsavedChanges) {
        const form = topModal.overlay.querySelector('form');
        if (form && isFormDirty(form)) {
            const confirmed = await confirmUnsavedChanges();
            if (!confirmed) {
                // User cancelled - re-push history state to prevent navigation
                history.pushState({ modal: true }, "", "#modal");
                return false;
            }
        }
    }

    // Close the modal
    topModal.close(false);
    return true;
}

/**
 * Check if form has unsaved changes
 * @param {HTMLFormElement} form
 * @returns {boolean}
 */
function isFormDirty(form) {
    const inputs = form.querySelectorAll('input, textarea, select');
    for (const input of inputs) {
        if (input.dataset.originalValue !== undefined) {
            if (input.value !== input.dataset.originalValue) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Show confirmation dialog for unsaved changes
 * @returns {Promise<boolean>}
 */
async function confirmUnsavedChanges() {
    return new Promise((resolve) => {
        const confirmed = window.confirm(
            'Ai modificări nesalvate. Sigur vrei să închizi acest formular?'
        );
        resolve(confirmed);
    });
}

/**
 * Register a modal in the stack and push history state
 * @param {HTMLElement} overlay - Modal overlay element
 * @param {Function} close - Close function
 * @param {boolean} hasUnsavedChanges - Track unsaved changes
 */
function registerModal(overlay, close, hasUnsavedChanges = false) {
    modalStack.push({ overlay, close, hasUnsavedChanges });
    
    // Push history state for browser Back button
    history.pushState({ modal: true }, "", "#modal");
}

/**
 * Unregister a modal from the stack
 * @param {HTMLElement} overlay - Modal overlay element
 */
function unregisterModal(overlay) {
    const index = modalStack.findIndex(m => m.overlay === overlay);
    if (index !== -1) {
        modalStack.splice(index, 1);
    }
}

/**
 * Initialize global popstate listener (call once on app startup)
 */
let popstateListenerInitialized = false;

function initializeHistoryIntegration() {
    if (popstateListenerInitialized) return;
    
    window.addEventListener("popstate", async (e) => {
        if (isAnyModalOpen()) {
            // Prevent default navigation
            e.preventDefault();
            
            // Close top modal
            const closed = await closeTopModal(false);
            
            if (closed) {
                // Restore clean URL after modal closes
                history.pushState(null, "", location.pathname);
            }
        }
        // If no modal is open, allow normal navigation
    });
    
    popstateListenerInitialized = true;
}

// Auto-initialize on module load
initializeHistoryIntegration();

// ==========================================
// MODAL FUNCTIONS
// ==========================================

/**
 * Deschide modal custom reutilizabil
 * @param {Object} options - Configurare modal
 * @param {string} options.title - Titlul modalului
 * @param {string} options.message - Mesajul principal
 * @param {string} [options.icon] - Icon FontAwesome (ex: 'fa-trash', 'fa-check')
 * @param {string} [options.iconColor] - Culoare icon (ex: '#ef4444')
 * @param {string} options.confirmText - Text buton confirmare
 * @param {string} [options.cancelText='Anulează'] - Text buton anulare
 * @param {string} [options.variant='primary'] - Varianta: 'primary', 'danger', 'success'
 * @returns {Promise<boolean>} - true dacă confirmă, false dacă anulează
 */
export function confirmModal({
    title = 'Confirmă acțiunea',
    message = 'Ești sigur că vrei să continui?',
    icon = null,
    iconColor = null,
    confirmText = 'Confirmă',
    cancelText = 'Anulează',
    variant = 'primary'
}) {
    return new Promise((resolve) => {
        // Creează overlay
        const overlay = document.createElement('div');
        overlay.className = 'modern-modal-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'modal-title');

        // Creează backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'modern-modal-backdrop';

        // Creează panel
        const panel = document.createElement('div');
        panel.className = `modern-modal-panel modern-modal-${variant}`;

        // Icon (optional)
        const iconHTML = icon ? `
            <div class="modern-modal-icon" ${iconColor ? `style="color: ${iconColor}"` : ''}>
                <i class="fas ${icon}"></i>
            </div>
        ` : '';

        // Content
        panel.innerHTML = `
            ${iconHTML}
            <div class="modern-modal-content">
                <h3 id="modal-title" class="modern-modal-title">${title}</h3>
                <p class="modern-modal-message">${message}</p>
            </div>
            <div class="modern-modal-actions">
                <button type="button" class="modern-modal-btn modern-modal-btn-cancel" data-action="cancel">
                    ${cancelText}
                </button>
                <button type="button" class="modern-modal-btn modern-modal-btn-confirm" data-action="confirm">
                    ${confirmText}
                </button>
            </div>
        `;

        // Asamblare
        overlay.appendChild(backdrop);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        // Body lock (previne scroll pe mobile)
        document.body.style.overflow = 'hidden';

        // Animație intrare
        requestAnimationFrame(() => {
            overlay.classList.add('modern-modal-show');
        });

        // Cleanup function
        let isClosing = false;
        const cleanup = (result) => {
            if (isClosing) return; // Prevent double-close
            isClosing = true;
            
            overlay.classList.remove('modern-modal-show');

            panel.querySelector('[data-action="confirm"]').removeEventListener('click', handleConfirm);
            panel.querySelector('[data-action="cancel"]').removeEventListener('click', handleCancel);
            backdrop.removeEventListener('click', handleBackdropClick);
            document.removeEventListener('keydown', handleEscape);
            
            // Unregister from modal stack
            unregisterModal(overlay);
            
            // Așteaptă animația de ieșire
            setTimeout(() => {
                // Safety check: only remove if still in DOM
                if (overlay.parentNode === document.body) {
                    document.body.removeChild(overlay);
                }
                document.body.style.overflow = '';
                resolve(result);
            }, 200);
        };

        // Event handlers
        const handleConfirm = () => cleanup(true);
        const handleCancel = () => cleanup(false);
        
        const handleBackdropClick = (e) => {
            if (e.target === backdrop) {
                handleCancel();
            }
        };

        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                handleCancel();
            }
        };

        // Attach listeners
        panel.querySelector('[data-action="confirm"]').addEventListener('click', handleConfirm);
        panel.querySelector('[data-action="cancel"]').addEventListener('click', handleCancel);
        backdrop.addEventListener('click', handleBackdropClick);
        document.addEventListener('keydown', handleEscape);

        // Register modal in stack (confirmModal typically doesn't have unsaved changes)
        registerModal(overlay, cleanup, false);

        // Focus pe butonul de cancel (safer default)
        setTimeout(() => {
            panel.querySelector('[data-action="cancel"]').focus();
        }, 100);
    });
}

/**
 * Deschide modal custom cu HTML content
 * @param {Object} options - Configurare
 * @param {string} options.title - Titlu
 * @param {string} options.content - HTML content
 * @param {Function} [options.onConfirm] - Callback confirmare
 * @param {Function} [options.onCancel] - Callback anulare
 * @param {string} [options.size='medium'] - Mărime: 'small', 'medium', 'large'
 * @param {boolean} [options.trackUnsavedChanges=false] - Track form changes for Back button
 * @returns {Object} - { close, panel } pentru control extern
 */
export function openCustomModal({
    title,
    content,
    onConfirm = null,
    onCancel = null,
    size = 'medium',
    trackUnsavedChanges = false
}) {
    // Creează overlay
    const overlay = document.createElement('div');
    overlay.className = 'modern-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    // Creează backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modern-modal-backdrop';

    // Creează panel
    const panel = document.createElement('div');
    panel.className = `modern-modal-panel-custom modern-modal-size-${size}`;
    panel.innerHTML = `
        <div class="modern-modal-header">
            <h3 class="modern-modal-title">${title}</h3>
            <button type="button" class="modern-modal-close" aria-label="Închide">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="modern-modal-body">
            ${content}
        </div>
    `;

    // Asamblare
    overlay.appendChild(backdrop);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Body lock
    document.body.style.overflow = 'hidden';

    // Animație intrare
    requestAnimationFrame(() => {
        overlay.classList.add('modern-modal-show');
    });

    // Track original form values if requested
    if (trackUnsavedChanges) {
        setTimeout(() => {
            const form = panel.querySelector('form');
            if (form) {
                const inputs = form.querySelectorAll('input, textarea, select');
                inputs.forEach(input => {
                    input.dataset.originalValue = input.value;
                });
            }
        }, 100);
    }

    // Cleanup function
    let isClosing = false;
    const close = async (isConfirmed = false) => {
        if (isClosing) return; // Prevent double-close
        isClosing = true;
        
        // Check for unsaved changes if this is a form modal
        if (!isConfirmed && trackUnsavedChanges) {
            const form = panel.querySelector('form');
            if (form && isFormDirty(form)) {
                const confirmed = await confirmUnsavedChanges();
                if (!confirmed) {
                    isClosing = false; // Reset flag if user cancels
                    return; // Don't close
                }
            }
        }

        overlay.classList.remove('modern-modal-show');

        backdrop.removeEventListener('click', handleBackdropClick);
        document.removeEventListener('keydown', handleEscape);
        panel.querySelector('.modern-modal-close').removeEventListener('click', handleClose);
        
        // Unregister from modal stack
        unregisterModal(overlay);
        
        setTimeout(() => {
            // Safety check: only remove if still in DOM
            if (overlay.parentNode === document.body) {
                document.body.removeChild(overlay);
            }
            document.body.style.overflow = '';
            
            if (isConfirmed && onConfirm) {
                onConfirm();
            } else if (!isConfirmed && onCancel) {
                onCancel();
            }
        }, 200);
    };

    // Event handlers
    const handleClose = () => close(false);
    const handleBackdropClick = (e) => {
        if (e.target === backdrop) {
            handleClose();
        }
    };
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            handleClose();
        }
    };

    // Attach listeners
    panel.querySelector('.modern-modal-close').addEventListener('click', handleClose);
    backdrop.addEventListener('click', handleBackdropClick);
    document.addEventListener('keydown', handleEscape);

    // Register modal in stack with unsaved changes tracking
    registerModal(overlay, close, trackUnsavedChanges);

    return { close, panel };
}
