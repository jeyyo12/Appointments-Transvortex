/**
 * Progressive Web App (PWA) Registration
 * Handles service worker registration and update logic
 */

/**
 * Register service worker for PWA support
 */
async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.log('[PWA] Service Workers not supported');
        return;
    }
    
    try {
        console.log('[PWA] Registering service worker...');
        
        const registration = await navigator.serviceWorker.register('./service-worker.js', {
            scope: './'
        });
        
        console.log('[PWA] Service Worker registered:', registration);
        
        // Check for updates regularly
        setInterval(() => {
            registration.update().catch(err => {
                console.warn('[PWA] Failed to check for updates:', err);
            });
        }, 60000); // Check every 60 seconds
        
        // Handle new service worker
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            
            if (!newWorker) return;
            
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
                    console.log('[PWA] New service worker available, refresh to update');
                    
                    // Notify user of update (optional)
                    // You can show a toast/notification here
                    const event = new CustomEvent('serviceWorkerUpdate', {
                        detail: { registration }
                    });
                    window.dispatchEvent(event);
                }
            });
        });
        
    } catch (error) {
        console.error('[PWA] Service Worker registration failed:', error);
    }
}

/**
 * Check if app is installed as PWA
 */
function isInstalledAsPWA() {
    // Check for iOS
    if (window.navigator.standalone === true) {
        return true;
    }
    
    // Check for Android
    if (window.matchMedia('(display-mode: standalone)').matches) {
        return true;
    }
    
    // Check for Windows
    if (window.matchMedia('(display-mode: window-controls-overlay)').matches) {
        return true;
    }
    
    return false;
}

/**
 * Get the PWA install state
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
 * Detect platform
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
 * Handle install promotion event (Android)
 */
function setupInstallPrompt() {
    let deferredPrompt = null;
    
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent mini-infobar from appearing
        e.preventDefault();
        
        // Stash the event for later use
        deferredPrompt = e;
        
        console.log('[PWA] Install prompt available');
        
        // Show install button or message (optional)
        const event = new CustomEvent('pwaInstallPromptAvailable', {
            detail: { prompt: deferredPrompt }
        });
        window.dispatchEvent(event);
    });
    
    window.addEventListener('appinstalled', () => {
        console.log('[PWA] App installed successfully');
        deferredPrompt = null;
        
        const event = new CustomEvent('pwaInstalled');
        window.dispatchEvent(event);
    });
}

/**
 * Handle window blur/focus for app state
 */
function setupAppStateTracking() {
    window.addEventListener('focus', () => {
        console.log('[PWA] App focused');
    });
    
    window.addEventListener('blur', () => {
        console.log('[PWA] App blurred');
    });
}

/**
 * Initialize PWA features
 * Call this after DOM is ready
 */
window.initPWA = function() {
    console.log('[PWA] Initializing...');
    
    registerServiceWorker();
    setupInstallPrompt();
    setupAppStateTracking();
    
    const state = getPWAInstallState();
    console.log('[PWA] State:', state);
    
    // Log PWA capabilities
    if (state.installed) {
        console.log('[PWA] ✅ App is installed as PWA (display-mode: standalone)');
    } else if (state.standalone) {
        console.log('[PWA] ✅ App is installed on home screen (iOS)');
    } else {
        console.log('[PWA] App is running in browser (not installed)');
    }
};

// Export for external use
window.PWA = {
    isInstalled: isInstalledAsPWA,
    getState: getPWAInstallState,
    getPlatform: getPlatform
};
