/**
 * PWA Initialization - SINGLE SOURCE OF TRUTH
 * Handles service worker registration, updates, and PWA lifecycle
 * 
 * ⚠️ CRITICAL: Only used in ONE place (index.html + invoice.html)
 * Do NOT double-register with pwa.js and sw-update.js
 * 
 * Include this on pages that need PWA support:
 * <script src="./pwa-init.js"></script>
 */

const PWA_CONFIG = {
    SW_PATH: './service-worker.js',
    SCOPE: './',
    UPDATE_CHECK_INTERVAL: 60000, // 1 minute
    MAX_RELOAD_ATTEMPTS: 1, // Prevent reload loops
};

let reloadAttempts = 0;
let updatePending = false;

/**
 * Initialize PWA features
 * Call this once on page load
 */
function initPWA() {
    console.log('[PWA-Init] Starting PWA initialization...');
    
    if (!('serviceWorker' in navigator)) {
        console.log('[PWA-Init] Service Workers not supported');
        return;
    }
    
    setupInstallPrompt();
    registerServiceWorker();
    setupAppStateTracking();
    
    const state = getPWAInstallState();
    console.log('[PWA-Init] PWA State:', state);
}

/**
 * Register service worker with SAFE update handling
 * Prevents infinite reload loops
 */
async function registerServiceWorker() {
    try {
        console.log('[PWA-Init] Registering Service Worker...');
        
        const registration = await navigator.serviceWorker.register(
            PWA_CONFIG.SW_PATH, 
            { scope: PWA_CONFIG.SCOPE }
        );
        
        console.log('[PWA-Init] Service Worker registered successfully');
        
        // Setup update checking
        setupUpdateChecking(registration);
        
        // Setup update notification
        setupUpdateNotification(registration);
        
        // Setup reload on activation (but safely)
        setupSafeReloadOnActivation();
        
    } catch (error) {
        console.error('[PWA-Init] Service Worker registration failed:', error);
    }
}

/**
 * Setup periodic update checking
 */
function setupUpdateChecking(registration) {
    // Check for updates on page load
    registration.update().catch(err => {
        console.warn('[PWA-Init] Update check on load failed:', err);
    });
    
    // Check for updates periodically
    setInterval(() => {
        registration.update().catch(err => {
            console.warn('[PWA-Init] Periodic update check failed:', err);
        });
    }, PWA_CONFIG.UPDATE_CHECK_INTERVAL);
    
    console.log('[PWA-Init] Update checking enabled');
}

/**
 * Setup notification when update is found
 * Shows a toast to user without auto-reloading immediately
 */
function setupUpdateNotification(registration) {
    registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        
        if (!newWorker) return;
        
        console.log('[PWA-Init] Update found, new SW installing...');
        
        newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed') {
                // Only notify if there's already a controller (not first install)
                if (navigator.serviceWorker.controller) {
                    console.log('[PWA-Init] New version available');
                    updatePending = true;
                    
                    // Show user-friendly toast notification
                    showUpdateNotification();
                    
                    // Tell new SW to skip waiting (but don't reload yet)
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                } else {
                    console.log('[PWA-Init] First SW installation complete');
                }
            }
        });
    });
}

/**
 * Setup SAFE reload when new SW takes control
 * Only reload ONCE per session to prevent loops
 */
function setupSafeReloadOnActivation() {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[PWA-Init] New service worker activated');
        
        // Only reload if:
        // 1. Update was pending (user approved)
        // 2. Haven't already reloaded once this session
        if (updatePending && reloadAttempts < PWA_CONFIG.MAX_RELOAD_ATTEMPTS) {
            reloadAttempts++;
            console.log('[PWA-Init] Reloading page to get new version (attempt ' + reloadAttempts + ')');
            
            // Small delay to ensure SW is ready
            setTimeout(() => {
                window.location.reload();
            }, 100);
        } else if (!updatePending) {
            console.log('[PWA-Init] Controller changed but no update pending - skipping reload');
        } else {
            console.log('[PWA-Init] Max reload attempts reached - skipping reload to prevent loop');
        }
    });
}

/**
 * Show friendly toast notification for update
 */
function showUpdateNotification() {
    // Try to show browser notification if supported
    if (Notification && Notification.permission === 'granted') {
        new Notification('Transvortex Update Available', {
            body: '✅ New version will be loaded on next refresh',
            icon: './icons/icon-192x192.png',
            badge: './icons/icon-maskable-192x192.png',
            tag: 'pwa-update'
        });
    }
    
    // Show in-app toast
    showInAppToast('🔄 Update available → Refresh to load new version');
    
    // Dispatch custom event for UI listeners
    window.dispatchEvent(new CustomEvent('pwuUpdateAvailable', {
        detail: { message: 'New version available' }
    }));
}

/**
 * Show in-app toast notification
 */
function showInAppToast(message) {
    // Only show if not already showing
    if (document.querySelector('.pwa-toast')) {
        return;
    }
    
    const toast = document.createElement('div');
    toast.className = 'pwa-toast';
    toast.innerHTML = `
        <div class="pwa-toast-content">
            ${message}
        </div>
        <button class="pwa-toast-close" onclick="this.parentElement.remove()">✕</button>
    `;
    
    document.body.appendChild(toast);
    
    // Auto-remove after 8 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 8000);
}

/**
 * Handle install promotion (Android)
 */
function setupInstallPrompt() {
    let deferredPrompt = null;
    
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        console.log('[PWA-Init] Install prompt available');
        
        // Dispatch event so UI can show install button
        window.dispatchEvent(new CustomEvent('pwInstallPromptAvailable', {
            detail: { prompt: deferredPrompt }
        }));
    });
    
    window.addEventListener('appinstalled', () => {
        console.log('[PWA-Init] App installed successfully');
        deferredPrompt = null;
        
        window.dispatchEvent(new CustomEvent('pwInstalled'));
    });
}

/**
 * Track app focus/blur for state management
 */
function setupAppStateTracking() {
    window.addEventListener('focus', () => {
        console.log('[PWA-Init] App focused');
        window.dispatchEvent(new CustomEvent('pwAppFocused'));
    });
    
    window.addEventListener('blur', () => {
        console.log('[PWA-Init] App blurred');
        window.dispatchEvent(new CustomEvent('pwAppBlurred'));
    });
}

/**
 * Check if installed as PWA
 */
function isInstalledAsPWA() {
    // iOS
    if (window.navigator.standalone === true) {
        return true;
    }
    
    // Android
    if (window.matchMedia('(display-mode: standalone)').matches) {
        return true;
    }
    
    // Windows
    if (window.matchMedia('(display-mode: window-controls-overlay)').matches) {
        return true;
    }
    
    return false;
}

/**
 * Get PWA installation state
 */
function getPWAInstallState() {
    return {
        installed: isInstalledAsPWA(),
        standalone: window.navigator.standalone === true,
        displayMode: window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser',
        platform: getPlatform()
    };
}

/**
 * Detect device platform
 */
function getPlatform() {
    const ua = navigator.userAgent;
    
    if (/android/i.test(ua)) return 'android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
    if (/windows/i.test(ua)) return 'windows';
    if (/mac/i.test(ua)) return 'mac';
    if (/linux/i.test(ua)) return 'linux';
    
    return 'unknown';
}

/**
 * Manually check for updates (for "Check for updates" button)
 */
async function checkForUpdates() {
    if (!('serviceWorker' in navigator)) {
        return false;
    }
    
    try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
            await registration.update();
            console.log('[PWA-Init] Manual update check completed');
            return true;
        }
    } catch (error) {
        console.error('[PWA-Init] Manual update check failed:', error);
    }
    
    return false;
}

/**
 * Unregister service worker (for debugging/cleanup)
 */
async function unregisterServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        return false;
    }
    
    try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
            await registration.unregister();
            console.log('[PWA-Init] Service Worker unregistered');
            window.location.reload();
            return true;
        }
    } catch (error) {
        console.error('[PWA-Init] Unregister failed:', error);
    }
    
    return false;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPWA);
} else {
    initPWA();
}

// Add styles for toast notifications
const style = document.createElement('style');
style.textContent = `
    .pwa-toast {
        position: fixed;
        bottom: 2rem;
        left: 1rem;
        right: 1rem;
        max-width: 400px;
        margin-left: auto;
        margin-right: auto;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 1rem;
        border-radius: 8px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        z-index: 10000;
        animation: slideUp 0.3s ease-out;
    }
    
    .pwa-toast-content {
        flex: 1;
        font-weight: 500;
        font-size: 0.95rem;
    }
    
    .pwa-toast-close {
        background: rgba(255, 255, 255, 0.2);
        color: white;
        border: none;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 1.2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }
    
    .pwa-toast-close:hover {
        background: rgba(255, 255, 255, 0.3);
    }
    
    @keyframes slideUp {
        from {
            transform: translateY(100px);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }
    
    @media (max-width: 480px) {
        .pwa-toast {
            left: 0.5rem;
            right: 0.5rem;
            bottom: 1rem;
        }
    }
`;
document.head.appendChild(style);

// Export functions for use in other scripts
window.PWA = {
    init: initPWA,
    checkForUpdates: checkForUpdates,
    unregister: unregisterServiceWorker,
    getState: getPWAInstallState,
    isInstalled: isInstalledAsPWA,
    getPlatform: getPlatform
};

console.log('[PWA-Init] Loaded - use window.PWA for manual control');
