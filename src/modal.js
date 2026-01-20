// ==========================================
// MODAL COMPONENT - Reutilizabil & Stilizat
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
        const cleanup = (result) => {
            overlay.classList.remove('modern-modal-show');
            
            // Așteaptă animația de ieșire
            setTimeout(() => {
                document.body.removeChild(overlay);
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
 * @returns {Object} - { close, panel } pentru control extern
 */
export function openCustomModal({
    title,
    content,
    onConfirm = null,
    onCancel = null,
    size = 'medium'
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

    // Cleanup function
    const close = (isConfirmed = false) => {
        overlay.classList.remove('modern-modal-show');
        
        setTimeout(() => {
            document.body.removeChild(overlay);
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

    return { close, panel };
}
