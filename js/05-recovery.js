// js/05-recovery.js
// Handles: stuck state, corrupt state, double-load guard, refresh recovery.
(function () {
    "use strict";

    // 1. Prevent double-boot (some browsers run scripts twice on refresh)
    if (window.__axelr_booted) {
        console.warn('[Axelr] Duplicate boot detected — aborting.');
        return;
    }
    window.__axelr_booted = true;

    // 2. Clear stuck flags at boot — these are session-only states
    //    that could get stuck if the tab was killed mid-action.
    try {
        sessionStorage.removeItem('axelr_guest_active');
        sessionStorage.removeItem('axelr_ws_switched');
        // Keep 'axelr_ws_interacted' — legitimate preference
    } catch (_) {}

    // 3. Guard against corrupted localStorage user/token
    try {
        const raw = localStorage.getItem('axelr_user');
        if (raw) JSON.parse(raw);
    } catch (_) {
        localStorage.removeItem('axelr_user');
    }

    // 4. Global error → offer recovery (but do not auto-reload loop)
    let recoveryOfferedAt = 0;
    window.addEventListener('error', (e) => {
        if (Date.now() - recoveryOfferedAt < 30000) return;
        recoveryOfferedAt = Date.now();
        console.error('[Axelr fatal]', e.error || e.message);
        // Show a subtle toast only
        if (window.Axelr?.showToast) {
            window.Axelr.showToast('Something went wrong. Try refreshing.', 'error');
        }
    });

    // 5. Manual recovery hook — bind to nothing, just expose it
    window.AxelrRecover = function (hard = false) {
        try {
            if (hard) {
                localStorage.clear();
                sessionStorage.clear();
            } else {
                // Soft: clear only ephemeral session state
                sessionStorage.clear();
            }
            if ('caches' in window) {
                caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
            }
            location.reload();
        } catch (e) {
            location.reload();
        }
    };

    // 6. Warn user before closing while a request is in-flight (optional safety net)
    window.addEventListener('beforeunload', (e) => {
        if (window.Axelr?.state?.isProcessing) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    console.log('[Axelr] Recovery module loaded.');
})();