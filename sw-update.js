/**
 * Service Worker Update Manager
 * Centralized logic for handling SW updates across all pages
 * Import this on any page that needs automatic SW update handling
 */

/**
 * Initialize service worker update handling
 * Registers SW, checks for updates, and forces reload when new version activates
 */
export function initServiceWorkerUpdates() {
    if (!('serviceWorker' in navigator)) {
        console.log('[SW Update] Service Workers not supported');
        return;
    }

    // Register service worker
    navigator.serviceWorker.register('./service-worker.js', { scope: './' })
        .then((registration) => {
            console.log('[SW Update] Service Worker registered');

            // Check for updates on page load
            registration.update().catch(err => {
                console.warn('[SW Update] Update check failed:', err);
            });

            // Check for updates every 60 seconds
            setInterval(() => {
                registration.update().catch(err => {
                    console.warn('[SW Update] Update check failed:', err);
                });
            }, 60000);

            // Handle new service worker installation
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                
                if (!newWorker) return;
                
                console.log('[SW Update] New service worker found, installing...');
                
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed') {
                        if (navigator.serviceWorker.controller) {
                            // New SW installed, tell it to skip waiting
                            console.log('[SW Update] New version available, activating...');
                            newWorker.postMessage({ type: 'SKIP_WAITING' });
                            
                            // Optionally show a notification to user
                            showUpdateNotification();
                        } else {
                            // No controller means first install
                            console.log('[SW Update] Service Worker installed for first time');
                        }
                    }
                    
                    if (newWorker.state === 'activated') {
                        console.log('[SW Update] New service worker activated');
                    }
                });
            });
        })
        .catch((error) => {
            console.error('[SW Update] Service Worker registration failed:', error);
        });

    // CRITICAL: Auto-reload when new service worker takes control
    // This ensures users get the new version immediately
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[SW Update] New service worker activated, reloading page for fresh assets...');
        
        // Small delay to ensure SW is fully ready
        setTimeout(() => {
            window.location.reload();
        }, 100);
    });
}

/**
 * Optional: Show a notification when update is available
 * You can customize this to show a toast/snackbar
 */
function showUpdateNotification() {
    // Dispatch custom event that UI can listen to
    const event = new CustomEvent('swUpdateAvailable', {
        detail: { message: 'New version available, updating...' }
    });
    window.dispatchEvent(event);
    
    // Optional: Log to console
    console.log('[SW Update] 🔄 App update available, will reload automatically...');
}

/**
 * Manually check for updates
 * Useful for "Check for updates" button
 */
export async function checkForUpdates() {
    if (!('serviceWorker' in navigator)) {
        return false;
    }

    try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
            await registration.update();
            console.log('[SW Update] Manual update check completed');
            return true;
        }
    } catch (error) {
        console.error('[SW Update] Manual update check failed:', error);
    }
    
    return false;
}

/**
 * Unregister service worker (for debugging)
 * Use during development if you need to disable caching
 */
export async function unregisterServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        return false;
    }

    try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
            await registration.unregister();
            console.log('[SW Update] Service Worker unregistered');
            return true;
        }
    } catch (error) {
        console.error('[SW Update] Unregister failed:', error);
    }
    
    return false;
}

// Auto-initialize on import (can be disabled if manual control needed)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initServiceWorkerUpdates);
} else {
    initServiceWorkerUpdates();
}
