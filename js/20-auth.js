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
    let googleAuthUserToken = localStorage.getItem('google_auth_token') || null;
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
            token = localStorage.getItem('google_auth_token');
            if (token) googleAuthUserToken = token;
        }
        if (!token) throw new Error('No token available');

        const expiry = getTokenExpiry(token);
        const now = Date.now();
        if (expiry - now < 5 * 60 * 1000) {
            try {
                const newToken = await refreshGoogleToken();
                googleAuthUserToken = newToken;
                localStorage.setItem('google_auth_token', newToken);
                return newToken;
            } catch (e) {
                console.warn('Token refresh failed:', e);
                localStorage.removeItem('google_auth_token');
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
                        localStorage.setItem('google_auth_token', newToken);
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
                if (error instanceof TypeError && error.message.includes('network')) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
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
        localStorage.setItem('google_auth_token', token);
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
            position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 99999;
            display: flex; align-items: center; justify-content: center;
            font-size: 18px; color: #fff; backdrop-filter: blur(4px);
        `;
        overlay.innerHTML = `<span class="material-symbols-rounded" style="font-size:48px; animation: spin 1s linear infinite;">sync</span> Signing in...`;
        document.body.appendChild(overlay);

        const start = () => {
            if (typeof google === 'undefined' || !google.accounts?.id) return false;
            google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: (response) => {
                    document.getElementById('google-loading-overlay')?.remove();
                    handleCredentialResponse(response);
                },
                cancel_on_tap_outside: false,
                context: 'signin',
                use_fedcm_for_prompt: false
            });
            google.accounts.id.prompt();
            return true;
        };
        if (!start()) {
            let attempts = 0;
            const retry = setInterval(() => {
                attempts += 1;
                if (start() || attempts >= 30) {
                    clearInterval(retry);
                    if (attempts >= 30) {
                        document.getElementById('google-loading-overlay')?.remove();
                        alert('Google Sign‑In could not start. Please refresh and try again.');
                    }
                }
            }, 100);
        }
    }

    // ── GitHub / Email / Passkey ─────────────────────────────────────────
    function triggerGitHubLogin() {
        window.location.href = `${API_BASE_URL}/api/auth/github`;
    }

    function showEmailLogin() {
        const email = prompt('Enter your email:');
        if (!email) return;
        const password = prompt('Enter your password:');
        if (!password) return;
        fetch(`${API_BASE_URL}/api/auth/email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        })
        .then(res => res.json())
        .then(data => {
            if (data.token) {
                localStorage.setItem('google_auth_token', data.token);
                location.reload();
            } else {
                alert(data.message || 'Login failed');
            }
        })
        .catch(err => alert('Network error: ' + err.message));
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
        .then(options => navigator.credentials.get({ publicKey: options }))
        .then(credential => {
            return fetch(`${API_BASE_URL}/api/auth/webauthn/login/finish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, credential })
            });
        })
        .then(res => res.json())
        .then(data => {
            if (data.token) {
                localStorage.setItem('google_auth_token', data.token);
                location.reload();
            } else {
                alert(data.message || 'Passkey authentication failed');
            }
        })
        .catch(err => alert('Passkey error: ' + err.message));
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
            const credential = await navigator.credentials.create({ publicKey: options });
            const finishResp = await fetch(`${API_BASE_URL}/api/auth/webauthn/register/finish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, credential })
            });
            const result = await finishResp.json();
            if (result.success) {
                alert('Passkey registered successfully!');
            } else {
                alert('Registration failed: ' + (result.message || 'Unknown error'));
            }
        } catch (err) {
            alert('Passkey error: ' + err.message);
        }
    }

    // GitHub callback handler
    (function handleGitHubCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        if (token) {
            localStorage.setItem('google_auth_token', token);
            window.location.href = window.location.origin + window.location.pathname;
        }
    })();

    // ── Guest mode ───────────────────────────────────────────────────────
    async function initGuestMode() {
        if (localStorage.getItem('google_auth_token')) {
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
        localStorage.removeItem('google_auth_token');
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
                if (!data.puter_enabled && !window.puterOptInShown) {
                    setTimeout(() => window.Axelr.showPuterOptIn && window.Axelr.showPuterOptIn(), 1500);
                } else if (data.puter_enabled && window.Axelr.loadPuterSDK) {
                    window.Axelr.loadPuterSDK();
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