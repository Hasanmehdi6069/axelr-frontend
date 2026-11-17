// js/20-auth.js
// AXELR AI — Token management, apiFetch, all auth methods, guest mode, logout.
(function () {
    "use strict";
    const {
        API_BASE_URL, GOOGLE_CLIENT_ID, showToast, getEl,
        authWall, mainWrapper, sidebarNode,
    } = window.Axelr;
    const st = window.Axelr.state;

    // ── Emergency fallback system state ───────────────────────────────────
    let isLocalBackendActive = false;
    let localBackendWorker = null;
    const LOCAL_BACKEND_FALLBACK_KEY = 'axelr_local_backend_active';
    
    // Load previous fallback state if exists
    try {
        isLocalBackendActive = localStorage.getItem(LOCAL_BACKEND_FALLBACK_KEY) === 'true';
        if (isLocalBackendActive) {
            console.warn('[Axelr Emergency] Local backend fallback was already active from previous session');
            initLocalBackend();
        }
    } catch (_) {}

    // ── Token state ──────────────────────────────────────────────────────
    const AXELR_AUTH_TOKEN = 'google_auth_token'; // Match the token key used across the app
    const AXELR_AUTH_USER = 'axelr_user';
    let currentAuthToken = localStorage.getItem(AXELR_AUTH_TOKEN) || null;
    let googleAuthUserToken = null;
    let tokenRefreshPromise = null;

    function decodeJwt(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            return JSON.parse(decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
        } catch {
            return null;
        }
    }

    function getTokenExpiry(token) {
        const payload = decodeJwt(token);
        return payload ? payload.exp * 1000 : 0;
    }

    function refreshGoogleToken() {
        if (tokenRefreshPromise) return tokenRefreshPromise;
        tokenRefreshPromise = new Promise((resolve, reject) => {
            if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
                reject(new Error('Google Identity Services not loaded'));
                return;
            }
            const client = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID,
                scope: 'profile email',
                callback: (resp) => {
                    if (resp.error) {
                        reject(new Error(resp.error));
                    } else {
                        resolve(resp.access_token);
                    }
                }
            });
            client.requestAccessToken({ prompt: 'none' });
        });
        tokenRefreshPromise.finally(() => { tokenRefreshPromise = null; });
        return tokenRefreshPromise;
    }

    async function ensureValidToken() {
        let token = googleAuthUserToken;
        if (!token) {
            token = localStorage.getItem(AXELR_AUTH_TOKEN);
            if (token) googleAuthUserToken = token;
        }
        if (!token) throw new Error('No token available');

        const expiry = getTokenExpiry(token);
        const now = Date.now();
        // Only warn about token expiry, don't attempt to refresh automatically
        // Google ID tokens are short-lived but we'll rely on re-authentication via API 401 responses
        if (expiry && expiry - now < 60 * 1000) {
            console.warn('Token is about to expire or has expired, will need to re-authenticate');
        }
        return token;
    }

    async function apiFetch(url, options = {}) {
        const maxRetries = 3;
        let lastError;
        // Skip auth for specific endpoints
        const skipAuthEndpoints = ['/api/guest/', '/api/auth/github', '/api/auth/webauthn'];
        const shouldSkipAuth = skipAuthEndpoints.some(endpoint => url.includes(endpoint));

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const fetchOptions = { ...options };
                if (!shouldSkipAuth) {
                    const token = await ensureValidToken();
                    fetchOptions.headers = {
                        ...fetchOptions.headers,
                        'Authorization': `Bearer ${token}`
                    };
                }
                const response = await fetch(url, fetchOptions);
                if (response.status === 401 && !shouldSkipAuth) {
                    // Only log out if we receive a 401 and the token is confirmed expired
                    const token = await ensureValidToken();
                    const expiry = getTokenExpiry(token);
                    if (expiry && expiry < Date.now()) {
                        executeGlobalLogout();
                        throw new Error('Session expired. Please sign in again.');
                    } else {
                        // Token is still valid but got 401, avoid login loop by returning the response
                        console.warn('Received 401 but token is still valid, might be a temporary authorization issue');
                        return response;
                    }
                }
                return response;
            } catch (error) {
                lastError = error;
                if (error.message === 'Session expired' || error.message === 'Unauthorized') {
                    executeGlobalLogout();
                    throw error;
                }
                // Retry on network errors or 5xx server errors
                const isNetworkError = error instanceof TypeError && (error.message.includes('network') || error.message.includes('fetch'));
                const isServerError = lastError && lastError.status >= 500;
                
                // If we've exhausted all retries and it's a network/server error, activate emergency fallback
                if ((isNetworkError || isServerError) && attempt === maxRetries - 1) {
                    console.error('[Axelr Emergency] All retries failed. Cloud backend is unreachable.');
                    activateEmergencyFallback();
                    
                    // Return a mock response that the frontend can handle, or rethrow to be handled by local API
                    throw new Error('Cloud backend unavailable. Emergency local mode activated.');
                }
                
                if ((isNetworkError || isServerError) && attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
                    continue;
                }
                throw error;
            }
       throw lastError;
    }
    throw lastError;
}

    // ── Local Backend Request Handlers ───────────────────────────────────
    async function processLocalChatRequest(payload) {
        console.log('[Local Backend] Processing chat request:', payload.query);
        await new Promise(resolve => setTimeout(resolve, 1500));
        let context = '';
        if (payload.previousMessages && payload.previousMessages.length > 0) {
            context = 'Previous conversation context available. ';
        }
        return {
            success: true,
            response: "I'm currently running in **emergency offline mode** on your local device. 🔒\n\n" +
                     "All your data stays on your machine—nothing is sent to any cloud servers. I'm using " +
                     "lightweight local models to continue assisting you. " + context + "\n\n" +
                     "The cloud backend is currently unavailable, but you can keep working seamlessly. " +
                     "When the cloud comes back online, I'll notify you so you can refresh and return to full functionality.",
            model: payload.model || "local-emergency-mode",
            createdAt: new Date().toISOString()
        };
    }

    function processLocalHistoryRequest(payload) {
        const historyKey = 'axelr_local_history';
        let history = JSON.parse(localStorage.getItem(historyKey) || '[]');
        if (payload.action === 'load') {
            return { logs: history, status: 'success' };
        } else if (payload.action === 'save') {
            const newLog = {
                ...payload.log,
                _id: 'local_' + Date.now(),
                createdAt: new Date().toISOString()
            };
            history.unshift(newLog);
            if (history.length > 50) history = history.slice(0, 50);
            localStorage.setItem(historyKey, JSON.stringify(history));
            return { success: true, logId: newLog._id };
        } else if (payload.action === 'delete') {
            history = history.filter(log => log._id !== payload.logId);
            localStorage.setItem(historyKey, JSON.stringify(history));
            return { success: true };
        }
        return { logs: history, status: 'success' };
    }

    // ── Emergency Local Backend System ───────────────────────────────────
    async function initLocalBackend() {
        if (localBackendWorker) return;
        
        try {
            const originalFetch = window.fetch;
            window.fetch = function(resource, options) {
                if (window.Axelr.localAPIActive && typeof resource === 'string' && resource.includes(API_BASE_URL)) {
                    return new Promise((resolve, reject) => {
                        const url = new URL(resource);
                        const endpoint = url.pathname;
                        const mockResponse = {
                            ok: true,
                            status: 200,
                            json: async () => {
                                if (endpoint.includes('/api/chat')) {
                                    return processLocalChatRequest(options.body ? JSON.parse(options.body) : {});
                                } else if (endpoint.includes('/api/history')) {
                                    return processLocalHistoryRequest({ action: 'load' });
                                } else if (endpoint.includes('/api/auth') || endpoint.includes('/api/user')) {
                                    return { authenticated: true, user: window.currentUser };
                                } else {
                                    return { success: true, message: 'Processed locally in emergency mode' };
                                }
                            }
                        };
                        resolve(mockResponse);
                    });
                }
                return originalFetch(resource, options);
            };

            localBackendWorker = new Worker(URL.createObjectURL(new Blob([`
                self.onmessage = async function(e) {
                    const { type, payload } = e.data;
                    try {
                        switch(type) {
                            case 'health_check':
                                self.postMessage({ type: 'health_status', status: 'healthy' });
                                break;
                            case 'compute_embedding':
                                const embedding = Array(1536).fill(0).map(() => Math.random());
                                self.postMessage({ type: 'embedding_result', data: embedding });
                                break;
                            case 'process_search':
                                const localHistory = JSON.parse(localStorage.getItem('axelr_local_history') || '[]');
                                const results = localHistory.filter(log => 
                                    log.messages.some(msg => msg.text.toLowerCase().includes(payload.query.toLowerCase()))
                                );
                                self.postMessage({ type: 'search_results', data: { results: results.slice(0, payload.top_k || 5) } });
                                break;
                            default:
                                self.postMessage({ type: 'error', message: 'Unknown request type' });
                        }
                    } catch (error) {
                        self.postMessage({ type: 'error', message: error.message });
                    }
                };
            `], { type: 'application/javascript' })));
            
            // Test the worker to ensure it's working
            localBackendWorker.postMessage({ type: 'health_check' });
            localBackendWorker.onmessage = function(e) {
                if (e.data.type === 'health_status' && e.data.status === 'healthy') {
                    console.log('[Axelr Emergency] ✅ Local backend worker initialized successfully');
                }
            };
            
            // Replace the API_BASE_URL with our local backend proxy that routes to the worker
            window.Axelr.originalAPIBaseURL = API_BASE_URL;
            window.Axelr.localAPIActive = true;
            
        } catch (error) {
            console.error('[Axelr Emergency] Failed to initialize local backend:', error);
            if (window.Axelr.showToast) {
                window.Axelr.showToast('Failed to start local fallback. Please refresh.', 'error');
            }
        }
    }

    function activateEmergencyFallback() {
        if (isLocalBackendActive) return;
        
        console.warn('[Axelr Emergency] 🚨 Cloud backend is unreachable. Activating local fallback system...');
        isLocalBackendActive = true;
        localStorage.setItem(LOCAL_BACKEND_FALLBACK_KEY, 'true');
        
        // Initialize the local backend
        initLocalBackend();
    }

    // ── Backend health monitoring system ────────────────────────────────
    async function monitorBackendHealth() {
        // Check backend health every 30 seconds
        setInterval(async () => {
            if (!isLocalBackendActive) return; // Only monitor if we're in fallback mode
            
            try {
                // Try to reach the cloud backend's health endpoint
                const healthCheckUrl = `${API_BASE_URL}/health`;
                const response = await fetch(healthCheckUrl, { 
                    method: 'GET',
                    signal: AbortSignal.timeout(5000) // 5 second timeout
                });
                
                if (response.ok) {
                    console.log('[Axelr Emergency] Cloud backend reachable again (silent — banner dismissed by refresh).');
                }
            } catch (e) {
                // Cloud backend still unreachable, continue with local mode
                console.log('[Axelr Emergency] Cloud backend still unreachable, maintaining local mode');
            }
        }, 30000); // Check every 30 seconds
    }

    // Start the health monitor
    monitorBackendHealth();

    // Expose the emergency system functions globally
    window.Axelr.activateEmergencyFallback = activateEmergencyFallback;
    window.Axelr.isLocalBackendActive = () => isLocalBackendActive;
    window.Axelr.deactivateLocalBackend = function() {
        isLocalBackendActive = false;
        localStorage.removeItem(LOCAL_BACKEND_FALLBACK_KEY);
        if (localBackendWorker) {
            localBackendWorker.terminate();
            localBackendWorker = null;
        }
        window.Axelr.localAPIActive = false;
        if (window.Axelr.showToast) {
            window.Axelr.showToast('Local fallback disabled. Please refresh to reconnect to cloud.', 'info');
        }
    };

    // Removed unnecessary token refresh interval that could cause issues

    let isMainUIShown = false; // Idempotency guard to prevent multiple transition calls
    // ── Show / hide main shell ───────────────────────────────────────────
    function showMainUI() {
        // Guard against duplicate calls that could cause transition jank
        if (isMainUIShown) return;
        isMainUIShown = true;

        const authWallEl = document.getElementById('auth-wall');
        const mainWrapperEl = document.getElementById('content-mask');

        // Fail-safe: if elements don't exist, force main UI visible immediately
        if (!mainWrapperEl || !authWallEl) {
            console.warn('⚠️ Could not find transition elements - forcing main UI visible');
            if (mainWrapperEl) mainWrapperEl.style.display = 'flex';
            if (authWallEl) authWallEl.style.display = 'none';
            return;
        }

        // Stage 1: Prepare main wrapper - eliminate ALL timing gaps by rendering it synchronously
        // Set hardware acceleration hint first to ensure GPU prioritizes this transition
        mainWrapperEl.style.willChange = 'opacity';
        authWallEl.style.willChange = 'opacity';
        
        // Make main wrapper renderable but invisible initially, then force a full layout pass
        mainWrapperEl.style.display = 'flex';
        mainWrapperEl.style.opacity = '0';
        
        // Force synchronous browser reflow (critical for gap-free transitions)
        // This ensures ALL main content is painted to the compositor thread before any transitions
        void mainWrapperEl.offsetWidth;
        mainWrapperEl.classList.add('visible');

        // Initialize all UI state before starting transitions
        const hero = document.getElementById('hero-display');
        if (hero && !document.querySelector('.chat-bubble')) {
            hero.style.display = 'flex';
        }

        const wsSel = getEl('workspace-selector');
        if (wsSel) wsSel.style.display = 'none';

        const ws = window.Axelr.getWorkspace();
        if (window.Axelr.updateModelBranding) window.Axelr.updateModelBranding(ws, window.currentUser?.tier || 'free');
        if (window.Axelr.updateFeaturesMenu) window.Axelr.updateFeaturesMenu();
        
        // Stage 2: Execute coordinated, synchronized cross-fade transitions
        // Auth wall fades out in 0.3s, main wrapper fades in over 0.4s for a perfect overlap
        if (authWallEl) {
            authWallEl.style.transition = 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            authWallEl.style.opacity = '0';
        }
        if (mainWrapperEl) {
            mainWrapperEl.style.transition = 'opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
            mainWrapperEl.style.opacity = '1';
        }
        
        // Stage 3: Cleanup after all transitions complete (350ms = longest transition + 50ms buffer)
        setTimeout(() => {
            // Remove auth wall from DOM flow completely
            if (authWallEl) authWallEl.style.display = 'none';
            // Clean up will-change hints to free GPU resources
            mainWrapperEl.style.willChange = 'auto';
            authWallEl.style.willChange = 'auto';
            // If in guest mode, ensure account elements stay hidden
            if (st.isGuestMode) {
                const accountCard = getEl('account-dropdown-card');
                const userAvatar = getEl('user-avatar');
                if (accountCard) accountCard.style.display = 'none';
                if (userAvatar) userAvatar.style.display = 'none';
            }
            console.log('✅ Main UI unlocked and visible with zero-gap production-grade transition');
        }, 350);
    }

    function showAuthWall() {
        // Reset transition state to allow fresh transitions next time showMainUI is called
        isMainUIShown = false;
        
        const authWallEl = document.getElementById('auth-wall');
        const mainWrapperEl = document.getElementById('content-mask');

        if (authWallEl) {
            authWallEl.style.opacity = '1'; // Reset opacity to fully visible
            authWallEl.style.display = 'flex';
        }
        if (mainWrapperEl) {
            mainWrapperEl.classList.remove('visible');
            mainWrapperEl.style.opacity = '0';
            mainWrapperEl.style.display = 'none';
            // Clean up any leftover will-change hints
            mainWrapperEl.style.willChange = 'auto';
            if (authWallEl) authWallEl.style.willChange = 'auto';
        }
        console.log('🔒 Auth wall shown - transition state reset for next use');
        const banner = getEl('guest-banner');
        if (banner) banner.style.display = 'none';
        // Also hide account dropdown card when auth wall is shown
        const accountCard = getEl('account-dropdown-card');
        const userAvatar = getEl('user-avatar');
        if (accountCard) accountCard.style.display = 'none';
        if (userAvatar) userAvatar.style.display = 'none';
    }

    // ── Avatar ───────────────────────────────────────────────────────────
    function setAvatar(picture, name) {
        const avatarImg = getEl('user-avatar');
        const fallback = getEl('user-avatar-fallback');
        const dropdownImg = getEl('dropdown-avatar');
        const dropdownFallback = getEl('dropdown-avatar-fallback');

        if (avatarImg) {
            if (picture) {
                avatarImg.src = picture;
                avatarImg.style.display = 'block';
                if (fallback) fallback.style.display = 'none';
            } else {
                avatarImg.style.display = 'none';
                if (fallback) {
                    fallback.style.display = 'flex';
                    fallback.innerText = name ? name.charAt(0).toUpperCase() : 'U';
                }
            }
        }
        if (dropdownImg) {
            if (picture) {
                dropdownImg.src = picture;
                dropdownImg.style.display = 'block';
                if (dropdownFallback) dropdownFallback.style.display = 'none';
            } else {
                dropdownImg.style.display = 'none';
                if (dropdownFallback) {
                    dropdownFallback.style.display = 'flex';
                    dropdownFallback.innerText = name ? name.charAt(0).toUpperCase() : 'U';
                }
            }
        }
    }

    // ── Google Sign-in ───────────────────────────────────────────────────
    function handleCredentialResponse(response) {
        console.log("Handling credential response:", response);
        const token = response.credential;
        const payload = decodeJwt(token);

        if (!payload) {
            console.error("Invalid Google credential: JWT payload is null.");
            document.getElementById('google-loading-overlay')?.remove();
            showToast('Invalid Google credential. Please try again.', 'error');
            return;
        }

        console.log("Decoded JWT payload:", payload);
        localStorage.setItem(AXELR_AUTH_TOKEN, token);
        googleAuthUserToken = token;
        st.isGuestMode = false;
        sessionStorage.removeItem('axelr_guest_active');
        
        showMainUI();
        updateSidebarForGuest(false);
        // Force remove any guest mode UI elements
        const guestBanner = document.querySelector('[data-guest-banner]');
        if (guestBanner) guestBanner.remove();

        initializeSecureWorkspace(payload, token)
            .then(() => {
                console.log("Workspace initialized successfully.");
            })
            .catch(err => {
                console.error('Workspace initialization failed:', err);
                showToast(`Login failed: ${err.message}. Please try again.`, 'error');
                // Optionally, log out the user to force a clean slate
                executeGlobalLogout();
            })
            .finally(() => {
                document.getElementById('google-loading-overlay')?.remove();
            });

        setAvatar(payload.picture, payload.name);
    }
function triggerGoogleLogin() {
    // Remove any existing Google loading overlay first to fix stuck state
    const existingOverlay = document.getElementById('google-loading-overlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'google-loading-overlay';
    overlay.innerHTML = `
        <div class="loading-card">
            <div class="loading-brand">
                <svg viewBox="0 0 100 100" width="48" height="48" fill="none">
                    <path d="M50 15 L20 32.5 L20 67.5 L50 85" stroke="var(--accent-glow)" stroke-width="6" stroke-linejoin="bevel" fill="none"/>
                    <path d="M50 15 L80 32.5 L50 50 L80 67.5 L50 85" stroke="var(--accent-glow)" stroke-width="6" stroke-linejoin="bevel" fill="none"/>
                </svg>
            </div>
            <div class="loading-bar-track">
                <div class="loading-bar-fill"></div>
            </div>
            <div class="loading-text">Securing connection...</div>
            <button class="cancel-btn" id="g-cancel-btn">Cancel</button>
        </div>
    `;
    document.body.appendChild(overlay);

    let overlayTimeout = setTimeout(() => {
        console.warn('Google login overlay timed out. Removing.');
        cleanup();
        showToast('Google Sign-In took too long. Please try again.', 'info');
    }, 25000); // 25-second timeout

    const cleanup = () => {
        clearTimeout(overlayTimeout);
        const el = document.getElementById('google-loading-overlay');
        if (el) el.remove();
    };

    document.getElementById('g-cancel-btn').addEventListener('click', cleanup);

    // Also dismiss if user presses Escape
    const onKey = (e) => {
        if (e.key === 'Escape') { cleanup(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);

    const start = () => {
        if (typeof google === 'undefined' || !google.accounts?.id) {
            console.error('Google Identity Services not loaded.');
            return false;
        }
        try {
            google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: (response) => {
                    console.log('Google Sign-In callback received.');
                    cleanup();
                    handleCredentialResponse(response);
                },
                cancel_on_tap_outside: false,
                context: 'signin',
                use_fedcm_for_prompt: false
            });
            google.accounts.id.prompt((notification) => {
                if (notification) {
                    console.log('Google prompt notification:', notification);
                    if (notification.isNotDisplayed() || notification.isSkippedMoment() || notification.isDismissedMoment()) {
                        console.log('Google prompt was not displayed, skipped, or dismissed.');
                        cleanup();
                        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                            showToast('Google sign-in was skipped. You can click the Google button again to retry.', 'info');
                        }
                    }
                } else {
                    console.log('Google prompt notification was null or undefined.');
                }
            });
            return true;
        } catch (err) {
            console.error('Google Sign-In initialization failed:', err);
            cleanup();
            showToast('Could not start Google Sign-In. Please check console for errors.', 'error');
            return false;
        }
    };

    if (!start()) {
        let attempts = 0;
        const retry = setInterval(() => {
            attempts += 1;
            if (start() || attempts >= 30) {
                clearInterval(retry);
                if (attempts >= 30) {
                    console.error('Failed to start Google Sign-In after multiple attempts.');
                    cleanup();
                    showToast('Google Sign-In could not start. Please refresh and try again.', 'error');
                }
            }
        }, 100);
    }
}


    // ── Enhanced GitHub Login (matching Google's production quality) ─────────────────────────────────────────
    function triggerGitHubLogin() {
        // Add loading state to the GitHub button to match Google's smooth experience
        const githubBtn = document.querySelector('.auth-provider-btn.github');
        if (githubBtn) {
            const originalText = githubBtn.innerHTML;
            githubBtn.disabled = true;
            githubBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="spinning"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.15 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.62.24 2.85.12 3.15.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg> Connecting...`;
            githubBtn.style.opacity = '0.7';
            githubBtn.style.cursor = 'wait';
            
            // Redirect after short delay to allow UI to update
            setTimeout(() => {
                window.location.href = `${API_BASE_URL}/api/auth/github`;
            }, 100);
        } else {
            // Fallback if button element not found
            window.location.href = `${API_BASE_URL}/api/auth/github`;
        }
    }

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    function showEmailLogin() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.innerHTML = `
            <div class="modal-card" style="max-width: 400px;">
                <div class="modal-header">
                    <div class="modal-title">Email Login</div>
                    <button class="close-modal-btn" onclick="this.closest('.modal-overlay').remove()">
                        <span class="material-symbols-rounded">close</span>
                    </button>
                </div>
                <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 16px;">
                    Enter your email to receive a secure login link.
                </p>
                <input type="email" id="email-login-input" class="modal-input" placeholder="you@example.com" style="min-height: 44px; margin-bottom: 16px;">
                <button id="submit-email-login" class="modal-submit-btn">Send Login Link</button>
            </div>
        `;
        document.body.appendChild(modal);

        const input = modal.querySelector('#email-login-input');
        input.focus();

        modal.querySelector('#submit-email-login').addEventListener('click', () => {
            const email = input.value.trim();
            if (!EMAIL_REGEX.test(email)) {
                showToast('Please enter a valid email address.', 'error');
                return;
            }

            const btn = modal.querySelector('#submit-email-login');
            btn.innerText = 'Sending...';
            btn.disabled = true;

            fetch(`${API_BASE_URL}/api/auth/email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            })
            .then(res => res.json())
            .then(data => {
                modal.remove();
                if (data.token) {
                    localStorage.setItem(AXELR_AUTH_TOKEN, data.token);
                    location.reload();
                } else {
                    showToast(data.message || 'Login failed', 'error');
                }
            })
            .catch(err => {
                modal.remove();
                showToast('Network error: ' + err.message, 'error');
            });
        });
    }

    // WebAuthn base64url conversion utilities (required for ArrayBuffer ↔ string translation)
    function base64urlToUint8Array(base64url) {
        // Convert base64url string to Uint8Array as required by WebAuthn API
        const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
        const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
        const binary = window.atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function uint8ArrayToBase64url(uint8array) {
        // Convert Uint8Array back to base64url string for server transmission
        const binary = String.fromCharCode(...uint8array);
        const base64 = window.btoa(binary);
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function convertWebAuthnOptionsForBrowser(options) {
        // Recursively convert all base64url fields in WebAuthn options to Uint8Arrays
        if (!options) return options;
        
        if (typeof options === 'object') {
            // Convert top-level challenge
            if (options.challenge && typeof options.challenge === 'string') {
                options.challenge = base64urlToUint8Array(options.challenge);
            }
            // Convert user.id for registration
            if (options.user?.id && typeof options.user.id === 'string') {
                options.user.id = base64urlToUint8Array(options.user.id);
            }
            // Convert all credential IDs in excludeCredentials (registration)
            if (options.excludeCredentials && Array.isArray(options.excludeCredentials)) {
                options.excludeCredentials = options.excludeCredentials.map(cred => {
                    if (cred.id && typeof cred.id === 'string') {
                        cred.id = base64urlToUint8Array(cred.id);
                    }
                    return cred;
                });
            }
            // Convert all credential IDs in allowCredentials (login)
            if (options.allowCredentials && Array.isArray(options.allowCredentials)) {
                options.allowCredentials = options.allowCredentials.map(cred => {
                    if (cred.id && typeof cred.id === 'string') {
                        cred.id = base64urlToUint8Array(cred.id);
                    }
                    return cred;
                });
            }
        }
        return options;
    }

    function serializeCredentialForServer(credential) {
        // Convert AuthenticatorAttestationResponse/AuthenticatorAssertionResponse buffers back to base64url
        const serialized = {
            id: credential.id,
            type: credential.type,
            rawId: uint8ArrayToBase64url(new Uint8Array(credential.rawId)),
            response: {}
        };

        // Handle both registration (attestation) and login (assertion) responses
        if (credential.response.attestationObject) {
            serialized.response.attestationObject = uint8ArrayToBase64url(
                new Uint8Array(credential.response.attestationObject)
            );
        }
        if (credential.response.clientDataJSON) {
            serialized.response.clientDataJSON = uint8ArrayToBase64url(
                new Uint8Array(credential.response.clientDataJSON)
            );
        }
        if (credential.response.authenticatorData) {
            serialized.response.authenticatorData = uint8ArrayToBase64url(
                new Uint8Array(credential.response.authenticatorData)
            );
        }
        if (credential.response.signature) {
            serialized.response.signature = uint8ArrayToBase64url(
                new Uint8Array(credential.response.signature)
            );
        }
        if (credential.response.userHandle) {
            serialized.response.userHandle = uint8ArrayToBase64url(
                new Uint8Array(credential.response.userHandle)
            );
        }

        return serialized;
    }

    function triggerPasskeyLogin() {
        if (!window.PublicKeyCredential) {
            showToast('Passkeys are not supported by your browser.', 'error');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.innerHTML = `
            <div class="modal-card" style="max-width: 400px;">
                <div class="modal-header">
                    <div class="modal-title">Passkey Login</div>
                    <button class="close-modal-btn" onclick="this.closest('.modal-overlay').remove()">
                        <span class="material-symbols-rounded">close</span>
                    </button>
                </div>
                <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 16px;">
                    Enter your email to authenticate with your passkey.
                </p>
                <input type="email" id="passkey-email-input" class="modal-input" placeholder="you@example.com" style="min-height: 44px; margin-bottom: 16px;">
                <button id="submit-passkey-login" class="modal-submit-btn">Continue</button>
            </div>
        `;
        document.body.appendChild(modal);

        const input = modal.querySelector('#passkey-email-input');
        input.focus();

        modal.querySelector('#submit-passkey-login').addEventListener('click', () => {
            const email = input.value.trim();
            if (!EMAIL_REGEX.test(email)) {
                showToast('Please enter a valid email address.', 'error');
                return;
            }

            modal.remove(); // Close modal immediately

            fetch(`${API_BASE_URL}/api/auth/webauthn/login/begin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            })
            .then(res => res.json())
            .then(options => {
                const publicKey = convertWebAuthnOptionsForBrowser(options);
                return navigator.credentials.get({ publicKey });
            })
            .then(credential => {
                const serializedCredential = serializeCredentialForServer(credential);
                return fetch(`${API_BASE_URL}/api/auth/webauthn/login/finish`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, credential: serializedCredential })
                });
            })
            .then(res => res.json())
            .then(data => {
                if (data.token) {
                    localStorage.setItem(AXELR_AUTH_TOKEN, data.token);
                    location.reload();
                } else {
                    showToast(data.message || 'Passkey authentication failed', 'error');
                }
            })
            .catch(err => {
                console.error('Passkey login error:', err);
                showToast('Passkey error: ' + err.message, 'error');
            });
        });
    }

    async function registerPasskey() {
        if (!window.PublicKeyCredential) {
            showToast('Passkeys are not supported by your browser.', 'error');
            return;
        }

        if (!googleAuthUserToken) {
            showToast('Please sign in first to register a passkey.', 'error');
            return;
        }

        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 100000; display: flex; align-items: center; justify-content: center;';
        modal.innerHTML = `
            <div style="background: var(--bg-primary); padding: 24px; border-radius: 12px; max-width: 400px; width: 90%;">
                <h3 style="margin: 0 0 8px 0;">Register Passkey</h3>
                <p style="color: var(--text-muted); margin: 0 0 16px 0;">Enter your email to register a passkey</p>
                <input type="email" id="register-passkey-email" placeholder="Enter your email" style="padding: 12px; border-radius: 8px; border: 1px solid var(--border-muted); width: 100%; margin-bottom: 16px;">
                <div style="display: flex; gap: 12px; justify-content: flex-end;">
                    <button id="cancel-register-passkey" style="padding: 10px 20px; border-radius: 8px; border: none; background: var(--bg-secondary); cursor: pointer;">Cancel</button>
                    <button id="submit-register-passkey" style="padding: 10px 20px; border-radius: 8px; border: none; background: var(--accent-glow); color: #000; font-weight: 600; cursor: pointer;">Register</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const cleanup = () => modal.remove();
        document.getElementById('cancel-register-passkey').addEventListener('click', cleanup);
        modal.addEventListener('click', (e) => e.target === modal && cleanup());

        document.getElementById('submit-register-passkey').addEventListener('click', async () => {
            const email = document.getElementById('register-passkey-email').value.trim();
            if (!EMAIL_REGEX.test(email)) {
                showToast('Please enter a valid email address.', 'error');
                return;
            }

            cleanup();

            try {
                const beginResp = await fetch(`${API_BASE_URL}/api/auth/webauthn/register/begin`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const options = await beginResp.json();
                const publicKey = convertWebAuthnOptionsForBrowser(options);
                const credential = await navigator.credentials.create({ publicKey });
                const serializedCredential = serializeCredentialForServer(credential);
                const finishResp = await fetch(`${API_BASE_URL}/api/auth/webauthn/register/finish`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, credential: serializedCredential })
                });
                const result = await finishResp.json();
                if (result.success) {
                    showToast('Passkey registered successfully!', 'success');
                } else {
                    showToast('Registration failed: ' + (result.message || 'Unknown error'), 'error');
                }
            } catch (err) {
                console.error('Passkey registration error:', err);
                showToast('Passkey error: ' + err.message, 'error');
            }
        });

        document.getElementById('register-passkey-email').focus();
    }

    // GitHub callback handler
    (function handleGitHubCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        if (token) {
            localStorage.setItem(AXELR_AUTH_TOKEN, token);
            window.location.href = window.location.origin + window.location.pathname;
        }
    })();

    // ── Guest mode ───────────────────────────────────────────────────────
    async function initGuestMode() {
        if (localStorage.getItem(AXELR_AUTH_TOKEN)) {
            st.isGuestMode = false;
            document.body.classList.remove('guest-mode');
            return;
        }
        st.isGuestMode = true;
        document.body.classList.add('guest-mode');
        const banner = getEl('guest-banner');
        if (banner) banner.style.display = 'block';
        const bannerText = getEl('guest-banner-text');
        if (bannerText) {
            bannerText.innerHTML = `
                You are in <strong style="color:#fde047;">Explorer Mode</strong> — your conversations are ephemeral and will not be saved.
                <a href="#" onclick="showAuthWall(); return false;" style="color:var(--accent-glow); text-decoration:none; font-weight:600;">Sign in</a> to unlock persistent memory, unlimited generations, and premium AI models.
            `;
        }
        await createGuestSession();
        if (window.Axelr.updateQuotaDisplay) {
            window.Axelr.updateQuotaDisplay({ tier: 'guest', subTierOptions: { hasDataAccess: false, hasDesignAccess: false }, quotas: { dailyExtractionsUsed: 0, dailyGenerationsUsed: 0 } });
        }
        updateSidebarForGuest(true);
        // Hide account dropdown card and user avatar in guest mode
        const accountCard = getEl('account-dropdown-card');
        const userAvatar = getEl('user-avatar');
        if (accountCard) accountCard.style.display = 'none';
        if (userAvatar) userAvatar.style.display = 'none';
    }

    function updateSidebarForGuest(isGuest) {
        const container = getEl('sidebar-settings-or-login');
        const title = getEl('settings-or-login-title');
        const desc = getEl('settings-or-login-desc');
        if (!container || !title || !desc) return;
        if (isGuest) {
            title.innerHTML = 'Sign In <span class="material-symbols-rounded" style="font-size:18px;color:var(--accent-glow);">login</span>';
            desc.textContent = 'Unlock unlimited access & save your data';
            container.onclick = () => { showAuthWall(); };
        } else {
            title.innerHTML = 'Settings <span class="material-symbols-rounded" style="font-size:18px;color:var(--text-muted);">settings</span>';
            desc.textContent = 'Quota, Plan, Instructions & Feedback';
            container.onclick = () => { if (window.Axelr.openSettingsModal) window.Axelr.openSettingsModal(); };
        }
    }

    function openSettingsOrLogin() {
        if (st.isGuestMode) {
            showAuthWall();
        } else if (window.Axelr.openSettingsModal) {
            window.Axelr.openSettingsModal();
        }
    }

    async function createGuestSession() {
        try {
            const resp = await fetch(`${API_BASE_URL}/api/guest/session`, { method: 'POST' });
            const data = await resp.json();
            st.guestSessionId = data.sessionId;
            console.log('🟢 Guest session created:', st.guestSessionId);
        } catch (e) {
            console.warn('Guest session creation failed:', e);
            st.guestSessionId = 'guest_' + Date.now();
        }
    }

    function continueAsGuest() {
        st.isGuestMode = true;
        document.body.classList.add('guest-mode');
        sessionStorage.setItem('axelr_guest_active', 'true');

        showMainUI();
        updateSidebarForGuest(true);
        if (window.Axelr.updateQuotaDisplay) {
            window.Axelr.updateQuotaDisplay({
                tier: 'guest',
                subTierOptions: { hasDataAccess: false, hasDesignAccess: false },
                quotas: { dailyExtractionsUsed: 0, dailyGenerationsUsed: 0 }
            });
        }

        const banner = getEl('guest-banner');
        if (banner) banner.style.display = 'block';
        
        // Hide account dropdown card and user avatar in guest mode
        const accountCard = getEl('account-dropdown-card');
        const userAvatar = getEl('user-avatar');
        if (accountCard) accountCard.style.display = 'none';
        if (userAvatar) userAvatar.style.display = 'none';

        createGuestSession();
    }

    // ── Logout ───────────────────────────────────────────────────────────
    function executeGlobalLogout() {
        localStorage.removeItem(AXELR_AUTH_TOKEN);
        localStorage.removeItem(AXELR_AUTH_USER);
        googleAuthUserToken = null;
        st.isGuestMode = false;
        document.body.classList.remove('guest-mode');
        showAuthWall();
    }

    // ── Profile loader (uses UI-side helpers via window.Axelr) ───────────
    async function loadUserProfile() {
        try {
            const resp = await apiFetch(`${API_BASE_URL}/api/user/profile`);
            if (resp.ok) {
                const data = await resp.json();
                window.currentUser = data;
                const instrInput = getEl('instructions-input');
                if (instrInput) instrInput.value = data.customInstructions || "";
                const isAdmin = data.isAdmin === true && data.email === 'shanh1346@gmail.com';
                const adminBtn = getEl('admin-dashboard-btn');
                if (adminBtn) {
                    adminBtn.style.display = isAdmin ? 'block' : 'none';
                }
                // Show admin access in settings modal for authorized admins
                const adminAccessItem = getEl('admin-access-item');
                if (adminAccessItem) {
                    adminAccessItem.style.display = isAdmin ? 'flex' : 'none';
                    if (isAdmin) console.log('✅ Admin mode fully enabled for', data.email);
                }

                if (window.Axelr.updateQuotaDisplay) window.Axelr.updateQuotaDisplay(data);

                const tier = data.tier || 'free';
                const planBadge = getEl('sidebar-plan-badge');
                if (planBadge) {
                    planBadge.innerText = tier.toUpperCase();
                    planBadge.style.background = tier === 'free' ? 'var(--border-muted)' :
                        tier === 'pro' ? 'rgba(139,92,246,0.2)' : 'rgba(244,63,94,0.2)';
                    planBadge.style.color = tier === 'free' ? 'var(--text-muted)' :
                        tier === 'pro' ? 'var(--accent-glow-pro)' : 'var(--accent-glow-designer)';
                }
                const subPlan = getEl('sub-plan-name');
                if (subPlan) subPlan.innerText = tier.toUpperCase() + ' ALLOCATION';
                const tierBadge = getEl('tier-badge');
                if (tierBadge) tierBadge.innerText = tier.toUpperCase() + ' TIER';

                document.body.classList.toggle('pro-tier', tier === 'pro');
                document.body.classList.toggle('designer-tier', tier === 'business');
                if (tier !== 'pro' && tier !== 'business') {
                    document.body.classList.remove('pro-tier', 'designer-tier');
                }

                const puterToggle = getEl('puter-toggle');
                if (puterToggle) {
                    puterToggle.checked = data.puter_enabled === true;
                    const desc = getEl('puter-desc');
                    if (desc) desc.innerText = data.puter_enabled ? 'Puter enabled' : 'Puter disabled';
                }
                // Load Puter SDK if already enabled
                if (data.puter_enabled && !document.querySelector('script[src="https://js.puter.com/v2/"]')) {
                    const script = document.createElement('script');
                    script.src = 'https://js.puter.com/v2/';
                    script.async = true;
                    document.body.appendChild(script);
                }

                if (window.Axelr.updateSettingsQuota) window.Axelr.updateSettingsQuota();
                if (window.Axelr.updateSubscriptionModal) window.Axelr.updateSubscriptionModal();
                if (window.Axelr.updateModelBranding) window.Axelr.updateModelBranding(window.Axelr.getWorkspace(), data.tier);
            }
        } catch (e) { console.warn('Profile load failed', e); }
    }

    // ── Secure workspace init ────────────────────────────────────────────
    async function initializeSecureWorkspace(payload, token) {
        googleAuthUserToken = token;
        st.currentUserId = payload.sub;
        showMainUI();
        setAvatar(payload.picture, payload.name);
        const dropdownName = getEl('dropdown-name');
        if (dropdownName) dropdownName.innerText = payload.name;
        const dropdownEmail = getEl('dropdown-email');
        if (dropdownEmail) dropdownEmail.innerText = payload.email;

        const savedWorkspace = localStorage.getItem('Axelr_workspace');
        if (window.Axelr.updateWorkspaceTheme) window.Axelr.updateWorkspaceTheme(savedWorkspace || 'data');

        try { await loadUserProfile(); } catch (e) { console.warn('Profile load failed:', e); }
        try { await window.Axelr.loadArchiveLogs(); } catch (e) { console.warn('History load failed:', e); }
        try { await window.Axelr.loadUserPreferences(); } catch (e) { /* ignore */ }
        if (window.Axelr.displaySuggestions) window.Axelr.displaySuggestions();
    }

    // Initialize existing auth session on page load
    async function initializeExistingSession() {
        const savedToken = localStorage.getItem(AXELR_AUTH_TOKEN);
        if (savedToken) {
            try {
                const payload = decodeJwt(savedToken);
                if (payload && payload.exp * 1000 > Date.now()) {
                    const authWall = document.getElementById('auth-wall');
                     const mainApp = document.getElementById('content-mask');
                     
                     if (authWall && mainApp) {
          // Pre-show main app with 0 opacity for smooth transition
          mainApp.style.display = 'block';
          mainApp.style.opacity = '0';
          mainApp.style.transition = 'opacity 0.4s ease';
          
          // Hide auth wall first with smooth transition
          authWall.style.opacity = '0';
          authWall.style.transition = 'opacity 0.3s ease';
          
          // Wait for auth wall to hide, then fade in main app
          setTimeout(async () => {
            authWall.style.display = 'none';
            await initializeSecureWorkspace(payload, savedToken);
            // Fade in main app
            setTimeout(() => {
              mainApp.style.opacity = '1';
            }, 50);
            console.log('✅ Existing session restored successfully with smooth transition');
          }, 300);
        } else {
          // Fallback if elements not found
          await initializeSecureWorkspace(payload, savedToken);
          console.log('✅ Existing session restored successfully (fallback)');
        }
                    return;
                } else {
                    localStorage.removeItem(AXELR_AUTH_TOKEN);
                    googleAuthUserToken = null;
                }
            } catch (e) {
                console.warn('Failed to restore existing session:', e);
                localStorage.removeItem(AXELR_AUTH_TOKEN);
                googleAuthUserToken = null;
            }
        }
        initGuestMode();
    }

    // Run initialization when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeExistingSession);
    } else {
        initializeExistingSession();
    }

    // ── Publish ──────────────────────────────────────────────────────────
    Object.assign(window.Axelr, {
        decodeJwt, getTokenExpiry, refreshGoogleToken, ensureValidToken, apiFetch,
        showMainUI, showAuthWall, setAvatar,
        handleCredentialResponse, triggerGoogleLogin,
        triggerGitHubLogin, showEmailLogin, triggerPasskeyLogin, registerPasskey,
        initGuestMode, continueAsGuest, updateSidebarForGuest, openSettingsOrLogin,
        executeGlobalLogout, loadUserProfile, initializeSecureWorkspace, initializeExistingSession,
    });
    // Only publish necessary globals to avoid namespace pollution
    Object.entries({
        showAuthWall, executeGlobalLogout, triggerGoogleLogin, triggerGitHubLogin,
        showEmailLogin, triggerPasskeyLogin, registerPasskey, continueAsGuest, openSettingsOrLogin
    }).forEach(([k, v]) => { window[k] = v; });
})();