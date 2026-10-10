// js/20-auth.js
// AXELR AI — Token management, apiFetch, all auth methods, guest mode, logout.
(function () {
    "use strict";
    const {
        API_BASE_URL, GOOGLE_CLIENT_ID, showToast, getEl,
        authWall, mainWrapper, sidebarNode,
    } = window.Axelr;
    const st = window.Axelr.state;

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
        if (expiry - now < 5 * 60 * 1000) {
            try {
                const newToken = await refreshGoogleToken();
                googleAuthUserToken = newToken;
                localStorage.setItem(AXELR_AUTH_TOKEN, newToken);
                return newToken;
            } catch (e) {
                console.warn('Token refresh failed:', e);
                localStorage.removeItem(AXELR_AUTH_TOKEN);
                googleAuthUserToken = null;
                throw new Error('Session expired. Please sign in again.');
            }
        }
        return token;
    }

    async function apiFetch(url, options = {}) {
        const maxRetries = 3;
        let lastError;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                if (url.includes('/api/guest/') || url.includes('/api/auth/github') || url.includes('/api/auth/webauthn')) {
                    return fetch(url, options);
                }
                let token = await ensureValidToken();
                options.headers = {
                    ...options.headers,
                    'Authorization': `Bearer ${token}`
                };
                const response = await fetch(url, options);
                if (response.status === 401) {
                    try {
                        const newToken = await refreshGoogleToken();
                        googleAuthUserToken = newToken;
                        localStorage.setItem(AXELR_AUTH_TOKEN, newToken);
                        options.headers['Authorization'] = `Bearer ${newToken}`;
                        const retryResponse = await fetch(url, options);
                        if (retryResponse.status === 401) {
                            throw new Error('Unauthorized');
                        }
                        return retryResponse;
                    } catch (refreshError) {
                        executeGlobalLogout();
                        throw new Error('Session expired');
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
                if (isNetworkError || isServerError) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
                    continue;
                }
                throw error;
            }
        }
        throw lastError;
    }

    setInterval(async () => {
        try {
            await ensureValidToken();
        } catch (_) { /* silent */ }
    }, 10 * 60 * 1000);

    // ── Show / hide main shell ───────────────────────────────────────────
    function showMainUI() {
        const authWallEl = document.getElementById('auth-wall');
        const mainWrapperEl = document.getElementById('content-mask');

        if (authWallEl) authWallEl.style.display = 'none';
        if (mainWrapperEl) {
            mainWrapperEl.classList.add('visible');
            mainWrapperEl.style.display = 'flex';
        }

        const hero = document.getElementById('hero-display');
        if (hero && !document.querySelector('.chat-bubble')) {
            hero.style.display = 'flex';
        }

        const wsSel = getEl('workspace-selector');
        if (wsSel) wsSel.style.display = 'none';

        const ws = window.Axelr.getWorkspace();
        if (window.Axelr.updateModelBranding) window.Axelr.updateModelBranding(ws, window.currentUser?.tier || 'free');
        if (window.Axelr.updateFeaturesMenu) window.Axelr.updateFeaturesMenu();
        console.log('✅ Main UI unlocked and visible');
    }

    function showAuthWall() {
        if (authWall) authWall.style.display = 'flex';
        if (mainWrapper) {
            mainWrapper.classList.remove('visible');
            mainWrapper.style.display = 'none';
        }
        console.log('🔒 Auth wall shown');
        const banner = getEl('guest-banner');
        if (banner) banner.style.display = 'none';
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
        const token = response.credential;
        const payload = decodeJwt(token);
        if (!payload) {
            document.getElementById('google-loading-overlay')?.remove();
            alert('Invalid Google credential. Please try again.');
            return;
        }
        localStorage.setItem(AXELR_AUTH_TOKEN, token);
        googleAuthUserToken = token;
        st.isGuestMode = false;
        showMainUI();
        updateSidebarForGuest(false);
        initializeSecureWorkspace(payload, token)
            .catch(err => {
                console.error('Workspace init failed:', err);
                const hero = document.getElementById('hero-display');
                if (hero) {
                    hero.innerHTML = `<div style="color:#ef4444;">Failed to load workspace. Please refresh.</div>`;
                }
            })
            .finally(() => {
                document.getElementById('google-loading-overlay')?.remove();
            });
        setAvatar(payload.picture, payload.name);
    }
function triggerGoogleLogin() {
    const overlay = document.createElement('div');
    overlay.id = 'google-loading-overlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.72); z-index: 99999;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        font-size: 16px; color: #fff; backdrop-filter: blur(6px);
        font-family: 'Inter', sans-serif;
    `;
    overlay.innerHTML = `
        <span class="material-symbols-rounded" style="font-size:48px; animation: spin 1s linear infinite; color: #00f2fe;">sync</span>
        <div style="margin-top: 14px; font-weight: 600;">Signing in with Google…</div>
        <div style="margin-top: 6px; font-size: 13px; color: #a1b5cc;">Complete the Google prompt</div>
        <button class="g-cancel-btn" id="g-cancel-btn" style="margin-top: 22px;">Cancel</button>
    `;
    document.body.appendChild(overlay);

    const cleanup = () => {
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
        if (typeof google === 'undefined' || !google.accounts?.id) return false;
        try {
            google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: (response) => {
                    cleanup();
                    handleCredentialResponse(response);
                },
                cancel_on_tap_outside: false,
                context: 'signin',
                use_fedcm_for_prompt: false
            });
            google.accounts.id.prompt((notification) => {
                // If Google returns "not displayed" / "skipped", remove overlay so
                // the user can retry. This is the root cause of the stuck spinner.
                if (
                    notification &&
                    (notification.isNotDisplayed?.() || notification.isSkippedMoment?.())
                ) {
                    cleanup();
                    showToast('Google sign-in unavailable. Please try again or use another method.', 'info');
                }
                if (notification && notification.isDismissedMoment?.()) {
                    cleanup();
                }
            });
            return true;
        } catch (err) {
            console.warn('Google init failed:', err);
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

    function showEmailLogin() {
        const email = prompt('Enter your email:');
        if (!email) return;
        fetch(`${API_BASE_URL}/api/auth/email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        })
        .then(res => res.json())
        .then(data => {
            if (data.token) {
                localStorage.setItem(AXELR_AUTH_TOKEN, data.token);
                location.reload();
            } else {
                alert(data.message || 'Login failed');
            }
        })
        .catch(err => alert('Network error: ' + err.message));
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
        const email = prompt('Enter your email for passkey login:');
        if (!email) return;
        fetch(`${API_BASE_URL}/api/auth/webauthn/login/begin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        })
        .then(res => res.json())
        .then(options => {
            // Convert all base64url strings to Uint8Arrays before passing to WebAuthn API
            const publicKey = convertWebAuthnOptionsForBrowser(options);
            return navigator.credentials.get({ publicKey });
        })
        .then(credential => {
            // Convert credential buffers back to base64url for server transmission
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
                alert(data.message || 'Passkey authentication failed');
            }
        })
        .catch(err => {
            console.error('Passkey login error:', err);
            alert('Passkey error: ' + err.message);
        });
    }

    async function registerPasskey() {
        const email = prompt('Enter your email to register a passkey:');
        if (!email) return;
        try {
            const beginResp = await fetch(`${API_BASE_URL}/api/auth/webauthn/register/begin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const options = await beginResp.json();
            // Convert all base64url strings to Uint8Arrays before passing to WebAuthn API
            const publicKey = convertWebAuthnOptionsForBrowser(options);
            const credential = await navigator.credentials.create({ publicKey });
            // Convert credential buffers back to base64url for server transmission
            const serializedCredential = serializeCredentialForServer(credential);
            const finishResp = await fetch(`${API_BASE_URL}/api/auth/webauthn/register/finish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, credential: serializedCredential })
            });
            const result = await finishResp.json();
            if (result.success) {
                alert('Passkey registered successfully!');
            } else {
                alert('Registration failed: ' + (result.message || 'Unknown error'));
            }
        } catch (err) {
            console.error('Passkey registration error:', err);
            alert('Passkey error: ' + err.message);
        }
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
            return;
        }
        st.isGuestMode = true;
        const banner = getEl('guest-banner');
        if (banner) banner.style.display = 'block';
        const bannerText = getEl('guest-banner-text');
        if (bannerText) {
            bannerText.innerHTML = `
                You are in <strong style="color:#fde047;">Explorer Mode</strong> — your conversations are ephemeral and will not be saved.
                <a href="#" onclick="showAuthWall(); return false;" style="color:var(--accent-glow); text-decoration:none; font-weight:600;">Sign in</a> to unlock persistent memory, unlimited generations, and premium AI models.
            `;
        }
        try {
            const resp = await fetch(`${API_BASE_URL}/api/guest/session`, { method: 'POST' });
            const data = await resp.json();
            st.guestSessionId = data.sessionId;
            console.log('🟢 Guest session created:', st.guestSessionId);
        } catch (e) {
            console.warn('Guest session creation failed:', e);
        }
        if (window.Axelr.updateQuotaDisplay) {
            window.Axelr.updateQuotaDisplay({ tier: 'guest', subTierOptions: { hasDataAccess: false, hasDesignAccess: false }, quotas: { dailyExtractionsUsed: 0, dailyGenerationsUsed: 0 } });
        }
        updateSidebarForGuest(true);
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

    function continueAsGuest() {
        st.isGuestMode = true;
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

        fetch(`${API_BASE_URL}/api/guest/session`, { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data && data.sessionId) {
                    st.guestSessionId = data.sessionId;
                    console.log('🟢 Guest session active:', st.guestSessionId);
                }
            })
            .catch(err => {
                console.warn('Backend waking up; ephemeral session active:', err);
                st.guestSessionId = 'guest_' + Date.now();
            });
    }

    // ── Logout ───────────────────────────────────────────────────────────
    function executeGlobalLogout() {
        localStorage.removeItem(AXELR_AUTH_TOKEN);
        localStorage.removeItem(AXELR_AUTH_USER);
        googleAuthUserToken = null;
        st.isGuestMode = false;
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
                    if (isAdmin) console.log('✅ Admin mode enabled for', data.email);
                }

                if (window.Axelr.updateQuotaDisplay) window.Axelr.updateQuotaDisplay(data);

                const planBadge = getEl('sidebar-plan-badge');
                if (planBadge) {
                    planBadge.innerText = data.tier.toUpperCase();
                    planBadge.style.background = data.tier === 'free' ? 'var(--border-muted)' :
                        data.tier === 'pro' ? 'rgba(139,92,246,0.2)' : 'rgba(244,63,94,0.2)';
                    planBadge.style.color = data.tier === 'free' ? 'var(--text-muted)' :
                        data.tier === 'pro' ? 'var(--accent-glow-pro)' : 'var(--accent-glow-designer)';
                }
                const subPlan = getEl('sub-plan-name');
                if (subPlan) subPlan.innerText = data.tier.toUpperCase() + ' ALLOCATION';
                const tierBadge = getEl('tier-badge');
                if (tierBadge) tierBadge.innerText = data.tier.toUpperCase() + ' TIER';

                document.body.classList.toggle('pro-tier', data.tier === 'pro');
                document.body.classList.toggle('designer-tier', data.tier === 'business');
                if (data.tier !== 'pro' && data.tier !== 'business') {
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

    // ── Publish ──────────────────────────────────────────────────────────
    Object.assign(window.Axelr, {
        decodeJwt, getTokenExpiry, refreshGoogleToken, ensureValidToken, apiFetch,
        showMainUI, showAuthWall, setAvatar,
        handleCredentialResponse, triggerGoogleLogin,
        triggerGitHubLogin, showEmailLogin, triggerPasskeyLogin, registerPasskey,
        initGuestMode, continueAsGuest, updateSidebarForGuest, openSettingsOrLogin,
        executeGlobalLogout, loadUserProfile, initializeSecureWorkspace,
    });
    Object.entries({
        apiFetch, ensureValidToken, showMainUI, showAuthWall, setAvatar,
        handleCredentialResponse, triggerGoogleLogin, triggerGitHubLogin,
        showEmailLogin, triggerPasskeyLogin, registerPasskey,
        initGuestMode, continueAsGuest, updateSidebarForGuest, openSettingsOrLogin,
        executeGlobalLogout, loadUserProfile, initializeSecureWorkspace,
    }).forEach(([k, v]) => { window[k] = v; });
})();