// js/30-ui.js
// AXELR AI — Theme, sidebar, search overlay, viewport, quota, model branding.
(function () {
    "use strict";
    const {
        getEl, showToast, escapeHtmlEntities, getWorkspace, getDraftKey,
        ICONS, SIDEBAR_ICONS, API_BASE_URL,
        promptInput, fileInput, viewport, historyListContainer,
        accountDropdownCard, modelDropdownCard, sidebarTriggerArea, sidebarNode,
        sendBtn, commandWrapper, mainWrapper, heroDisplay, mainBackBtn,
        MODEL_CONFIG: _mc,
    } = window.Axelr;
    const st = window.Axelr.state;

    // ── Theme ────────────────────────────────────────────────────────────
    let currentThemePreference = localStorage.getItem('axelr_theme') || 'system';
    let systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    function applyTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
            document.body.classList.add('light-theme');
        }
        document.querySelectorAll('.theme-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === currentThemePreference);
        });
        const desc = getEl('theme-desc');
        if (desc) {
            if (currentThemePreference === 'system') {
                desc.textContent = `Using system (${systemDark ? 'Dark' : 'Light'})`;
            } else {
                desc.textContent = currentThemePreference.charAt(0).toUpperCase() + currentThemePreference.slice(1);
            }
        }
    }

    function setTheme(pref) {
        currentThemePreference = pref;
        localStorage.setItem('axelr_theme', pref);
        if (pref === 'system') {
            systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            applyTheme(systemDark ? 'dark' : 'light');
        } else {
            applyTheme(pref);
        }
    }

    function toggleTheme() {
        document.body.classList.toggle('light-theme');
        localStorage.setItem('axelr_theme', document.body.classList.contains('light-theme') ? 'light' : 'dark');
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        systemDark = e.matches;
        if (currentThemePreference === 'system') applyTheme(systemDark ? 'dark' : 'light');
    });

    // ── Workspace theme ──────────────────────────────────────────────────
    function updateWorkspaceTheme(workspace) {
        document.body.classList.remove('workspace-data', 'workspace-design', 'workspace-core');
        if (workspace === 'design') {
            document.body.classList.add('workspace-design');
        } else if (workspace === 'core') {
            document.body.classList.add('workspace-core');
        } else {
            document.body.classList.add('workspace-data');
        }
        localStorage.setItem('Axelr_workspace', workspace);
        const isMobile = window.innerWidth <= 768;
        // Guest/Explorer Mode: Prepopulate read-only showcase chats if unauthenticated
        if (!window.currentUser) {
            prepopulateExplorerShowcase();
            // Persist pulsing CTA for unlock
            createUnlockCTA();
        }
        const logo = getEl('sidebar-logo-text');
        const heroTitle = getEl('hero-title-text');
        const heroSub = getEl('hero-sub-text');
        if (workspace === 'design') {
            if (logo) logo.innerText = 'AXELR DESIGN';
            if (heroTitle) heroTitle.innerText = window.currentUser ? 'What are we designing today?' : 'Try Our UI Generation Showcase';
            if (heroSub) heroSub.innerText = window.currentUser ? 'AI-powered UI/UX generation & live deployment.' : 'Unlock full capabilities to build live, production-ready UIs.';
            if (promptInput) promptInput.placeholder = isMobile ? "Upload a mockup..." : "Upload a mockup or request a UI component...";
            if (!window.currentUser) promptInput.disabled = true;
        } else if (workspace === 'core') {
            if (logo) logo.innerText = 'AXELR';
            if (heroTitle) heroTitle.innerText = window.currentUser ? 'What can I help you with?' : 'Explore Our Interactive Demo';
            if (heroSub) heroSub.innerText = window.currentUser ? 'Intelligence execution for any task – from code to creativity.' : 'Unlock full access to 40+ AI providers and advanced features.';
            if (promptInput) promptInput.placeholder = isMobile ? "Ask anything..." : "Ask me anything – I\'m here to help...";
            if (!window.currentUser) promptInput.disabled = true;
        } else {
            if (logo) logo.innerText = 'AXELR DATA';
            if (heroTitle) heroTitle.innerText = window.currentUser ? 'What are we building today?' : 'View Our Data Extraction Demo';
            if (heroSub) heroSub.innerText = window.currentUser ? 'AI-powered architecture and data execution.' : 'Unlock full capabilities to process receipts, invoices, and CSVs.';
            if (promptInput) promptInput.placeholder = isMobile ? "Upload a receipt..." : "Upload a receipt, invoice, or CSV for extraction...";
            if (!window.currentUser) promptInput.disabled = true;
        }
        // Explorer Mode: Prepopulate read-only showcase chats
        function prepopulateExplorerShowcase() {
            if (historyListContainer && !window.explorerShowcasePopulated) {
                const showcaseChats = [
                    {id: 'data-extraction', title: 'Data Extraction Demo', readOnly: true},
                    {id: 'ui-generation', title: 'UI Generation Showcase', readOnly: true},
                    {id: 'touch-fix', title: 'Touch-Fix Coding Demo', readOnly: true}
                ];
                showcaseChats.forEach(chat => {
                    const chatEl = document.createElement('div');
                    chatEl.className = 'history-item';
                    chatEl.innerHTML = `<span>${chat.title}</span><span class="read-only-badge">Demo</span>`;
                    chatEl.style.opacity = '0.9';
                    historyListContainer.appendChild(chatEl);
                });
                window.explorerShowcasePopulated = true;
            }
        }
        // Persistent pulsing unlock CTA
        function createUnlockCTA() {
            if (!getEl('unlock-cta')) {
                const cta = document.createElement('button');
                cta.id = 'unlock-cta';
                cta.textContent = 'Unlock Full Capabilities';
                cta.style.cssText = `
                    position: fixed;
                    bottom: 100px;
                    left: 50%;
                    transform: translateX(-50%);
                    padding: var(--space-3) var(--space-5);
                    background: var(--accent-primary);
                    color: var(--text-on-accent);
                    border: none;
                    border-radius: 9999px;
                    font-weight: 600;
                    z-index: var(--z-command-bar);
                    animation: pulse 2s infinite;
                    cursor: pointer;
                    transition: transform var(--transition-base);
                `;
                cta.addEventListener('click', () => document.getElementById('auth-wall').style.display = 'flex');
                cta.addEventListener('mouseenter', () => cta.style.transform = 'translateX(-50%) scale(1.05)');
                cta.addEventListener('mouseleave', () => cta.style.transform = 'translateX(-50%) scale(1)');
                document.body.appendChild(cta);
                // Add pulse keyframe to CSS
                if (!document.querySelector('#pulse-keyframe')) {
                    const style = document.createElement('style');
                    style.id = 'pulse-keyframe';
                    style.textContent = `
                        @keyframes pulse {
                            0%, 100% { box-shadow: 0 0 0 0 rgba(0, 242, 254, 0.7); }
                            50% { box-shadow: 0 0 0 10px rgba(0, 242, 254, 0); }
                        }
                        .read-only-badge {
                            font-size: var(--text-xs);
                            background: rgba(0,242,254,0.2);
                            padding: var(--space-1) var(--space-2);
                            border-radius: 4px;
                            color: var(--accent-primary);
                        }
                    `;
                    document.head.appendChild(style);
                }
            }
        }
        updateModelBranding(workspace, window.currentUser?.tier || 'free');
        if (window.Axelr.updateFeaturesMenu) window.Axelr.updateFeaturesMenu(workspace);
    }

    // ── Model branding / dropdown ────────────────────────────────────────
    let MODEL_CONFIG = { core: { models: [] }, data: { models: [] }, design: { models: [] } };

    async function loadModelConfig() {
        try {
            const resp = await fetch(`${API_BASE_URL}/api/model-config`);
            if (resp.ok) {
                MODEL_CONFIG = await resp.json();
                ['core', 'data', 'design'].forEach(w => {
                    if (!MODEL_CONFIG[w]) MODEL_CONFIG[w] = { models: [] };
                });
            }
        } catch (e) {
            console.warn('Using fallback model config');
            MODEL_CONFIG = window.Axelr.AXELR_MODEL_CONFIG;
        }
    }

    function renderModelDropdown(workspace) {
        const container = document.getElementById('model-dropdown-card');
        if (!container) return;
        const config = MODEL_CONFIG[workspace] || MODEL_CONFIG.core;
        const selectedId = localStorage.getItem('axelr_selected_model') || config.models[0]?.id || 'flash';

        container.innerHTML = config.models.map((m) => {
            const activeClass = (m.id === selectedId) ? 'active' : '';
            let tierClass = '';
            if (m.tier === 'pro') tierClass = 'pro';
            else if (m.tier === 'business') tierClass = 'designer';
            return `
                <div class="model-option ${activeClass} ${tierClass}" data-model-id="${m.id}" onclick="selectModel(event, '${m.id}')">
                    <div class="model-title">${m.label} <span style="background:rgba(0,242,254,0.1);color:var(--accent-glow);padding:2px 8px;border-radius:4px;font-size:9px;">${m.badge}</span></div>
                    <div class="model-desc">${m.desc}</div>
                </div>
            `;
        }).join('');

        const selectedModel = config.models.find(m => m.id === selectedId);
        if (selectedModel) {
            const modelText = document.getElementById('model-text-display');
            const modelBadge = document.getElementById('model-badge-display');
            if (modelText) modelText.innerText = selectedModel.label;
            if (modelBadge) modelBadge.innerText = selectedModel.badge;
        }
    }

    function updateModelBranding(workspace, tier) {
        const config = MODEL_CONFIG[workspace] || MODEL_CONFIG.core;
        let defaultModel = config.models.find(m => m.tier === tier) || config.models[0];
        if (!defaultModel) defaultModel = config.models[0];
        if (!defaultModel) return;
        const selectedId = defaultModel.id;
        localStorage.setItem('axelr_selected_model', selectedId);
        const modelText = document.getElementById('model-text-display');
        const modelBadge = document.getElementById('model-badge-display');
        if (modelText) modelText.innerText = defaultModel.label;
        if (modelBadge) modelBadge.innerText = defaultModel.badge;
        renderModelDropdown(workspace);
    }

    function selectModel(e, modelId) {
        if (e) e.stopPropagation();
        const workspace = getWorkspace();
        const config = MODEL_CONFIG[workspace] || MODEL_CONFIG.core;
        const model = config.models.find(m => m.id === modelId);
        if (model) {
            const modelText = document.getElementById('model-text-display');
            const modelBadge = document.getElementById('model-badge-display');
            if (modelText) modelText.innerText = model.label;
            if (modelBadge) modelBadge.innerText = model.badge;
            localStorage.setItem('axelr_selected_model', modelId);
            renderModelDropdown(workspace);
        }
        const dd = document.getElementById('model-dropdown-card');
        if (dd) dd.style.display = 'none';
    }

    // ── Quota display ────────────────────────────────────────────────────
    function getDailyLimit(tier, subTierOptions, workspace) {
        const hasData = subTierOptions?.hasDataAccess || false;
        const hasDesign = subTierOptions?.hasDesignAccess || false;
        const isDesign = workspace === 'design';
        if (tier === 'free' || tier === 'guest') {
            return isDesign ? 3 : 5;
        } else if (tier === 'pro') {
            if (hasData && hasDesign) return isDesign ? 15 : 20;
            if (hasData) return isDesign ? 0 : 19;
            if (hasDesign) return isDesign ? 13 : 0;
            return 0;
        } else if (tier === 'business') {
            if (hasData && hasDesign) return isDesign ? 25 : 30;
            if (hasData) return isDesign ? 0 : 28;
            if (hasDesign) return isDesign ? 20 : 0;
            return 0;
        }
        return isDesign ? 3 : 5;
    }

    function updateQuotaDisplay(data) {
        const workspace = getWorkspace();
        const limit = getDailyLimit(data.tier, data.subTierOptions, workspace);
        let used = 0;
        if (workspace === 'design') {
            used = data.quotas?.dailyGenerationsUsed || 0;
        } else {
            used = data.quotas?.dailyExtractionsUsed || 0;
        }
        const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
        const quotaCount = getEl('quota-numerical-count');
        const quotaFill = getEl('quota-progress-bar-fill');
        if (quotaCount) quotaCount.innerText = `${used}/${limit} Used (${Math.round(percentage)}%)`;
        if (quotaFill) quotaFill.style.width = `${percentage}%`;
        const settingsCount = getEl('settings-quota-count');
        const settingsFill = getEl('settings-quota-fill');
        if (settingsCount && quotaCount) settingsCount.innerText = quotaCount.innerText;
        if (settingsFill && quotaFill) settingsFill.style.width = quotaFill.style.width;
    }

    function updateSettingsQuota() {
        const quotaCount = getEl('quota-numerical-count');
        const quotaFill = getEl('quota-progress-bar-fill');
        const planBadge = getEl('sidebar-plan-badge');

        const settingsQuotaCount = getEl('settings-quota-count');
        const settingsQuotaFill = getEl('settings-quota-fill');
        const settingsPlanBadge = getEl('settings-plan-badge');

        if (quotaCount && settingsQuotaCount) {
            settingsQuotaCount.innerText = quotaCount.innerText;
        }
        if (quotaFill && settingsQuotaFill) {
            settingsQuotaFill.style.width = quotaFill.style.width;
        }
        if (planBadge && settingsPlanBadge) {
            settingsPlanBadge.innerText = planBadge.innerText;
            settingsPlanBadge.style.background = planBadge.style.background;
            settingsPlanBadge.style.color = planBadge.style.color;
        }
    }

    // ── Sidebar ──────────────────────────────────────────────────────────
    function toggleSidebar() {
        if (sidebarNode) sidebarNode.classList.toggle('open');
    }

    if (sidebarTriggerArea) {
        sidebarTriggerArea.addEventListener('click', (e) => {
            e.stopPropagation();
            if (sidebarNode) sidebarNode.classList.toggle('open');
        });
    }

    window.addEventListener('click', (e) => {
        if (st.ignoreSidebarClose || document.activeElement === getEl('sidebar-search-input')) return;
        if (e.target.closest('#sidebar-container-node')) return;
        if (e.target.closest('#sidebar-search-box') || e.target.closest('#sidebar-search-box input')) {
            e.stopPropagation();
            return;
        }
        if (sidebarNode && !sidebarNode.contains(e.target) && e.target !== sidebarTriggerArea) {
            sidebarNode.classList.remove('open');
        }
        if (accountDropdownCard && !document.querySelector('.account-hub')?.contains(e.target)) {
            accountDropdownCard.style.display = 'none';
        }
        if (modelDropdownCard && !document.querySelector('.model-hub')?.contains(e.target)) {
            modelDropdownCard.style.display = 'none';
        }
        if (!e.target.closest('.history-options-btn')) {
            document.querySelectorAll('.actions-dropdown-list').forEach(d => d.classList.remove('active'));
        }
    });

    const searchInput = getEl('sidebar-search-input');
    const searchBox = getEl('sidebar-search-box');
    [searchBox, searchInput].forEach(el => {
        if (!el) return;
        el.addEventListener('click', (e) => e.stopPropagation());
        el.addEventListener('touchstart', (e) => e.stopPropagation());
    });
    if (searchInput) {
        searchInput.addEventListener('focus', () => {
            st.ignoreSidebarClose = true;
            setTimeout(() => { st.ignoreSidebarClose = false; }, 500);
        });
        searchInput.addEventListener('blur', () => { st.ignoreSidebarClose = false; });
    }

    function toggleAccountDropdown(e) {
        e.stopPropagation();
        if (!accountDropdownCard) return;
        accountDropdownCard.style.display = accountDropdownCard.style.display === 'flex' ? 'none' : 'flex';
        if (modelDropdownCard) modelDropdownCard.style.display = 'none';
        document.querySelectorAll('.actions-dropdown-list').forEach(d => d.classList.remove('active'));
    }

    function toggleModelDropdown(e) {
        e.stopPropagation();
        if (!modelDropdownCard) return;
        modelDropdownCard.style.display = modelDropdownCard.style.display === 'flex' ? 'none' : 'flex';
        if (accountDropdownCard) accountDropdownCard.style.display = 'none';
        document.querySelectorAll('.actions-dropdown-list').forEach(d => d.classList.remove('active'));
    }

    function toggleHistoryOptions(e, id) {
        e.stopPropagation();
        document.querySelectorAll('.actions-dropdown-list').forEach(d => d.classList.remove('active'));
        const el = getEl(`options-${id}`);
        if (el) el.classList.add('active');
    }

    function switchSidebarTab(tab) {
        st.currentTab = tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const tabBtn = getEl(`tab-${tab}`);
        if (tabBtn) tabBtn.classList.add('active');
        if (window.Axelr.loadArchiveLogs) window.Axelr.loadArchiveLogs();
    }

    // ── Search overlay ───────────────────────────────────────────────────
    function openSearchOverlay() {
        const overlay = getEl('search-overlay');
        if (!overlay) return;
        overlay.classList.add('active');
        const input = getEl('search-overlay-input');
        if (input) {
            input.value = '';
            input.focus();
        }
        filterSearchOverlay();
    }

    function closeSearchOverlay() {
        const overlay = getEl('search-overlay');
        if (overlay) overlay.classList.remove('active');
    }

    function filterSearchOverlay() {
        const input = getEl('search-overlay-input');
        const resultsContainer = getEl('search-overlay-results');
        if (!input || !resultsContainer) return;
        const query = input.value.toLowerCase();
        const logs = (st.cachedLogHistory || []).filter(log => log.status === st.currentTab);
        const filtered = query ? logs.filter(log => log.filename.toLowerCase().includes(query)) : logs;
        if (filtered.length === 0) {
            resultsContainer.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:30px;">No matching chats</div>`;
            return;
        }
        resultsContainer.innerHTML = filtered.map(log => `
            <div class="search-result-item" onclick="viewPastLogById('${log._id}'); closeSearchOverlay();">
                <div class="title">${escapeHtmlEntities(log.filename)}</div>
                <div class="preview">${log.messages.length} messages • ${new Date(log.createdAt).toLocaleDateString()}</div>
            </div>
        `).join('');
    }

    const searchOverlayInput = getEl('search-overlay-input');
    if (searchOverlayInput) searchOverlayInput.addEventListener('input', filterSearchOverlay);

    if (searchInput) {
        searchInput.addEventListener('focus', function(e) {
            e.preventDefault();
            this.blur();
            openSearchOverlay();
        });
    }
    if (searchBox) {
        searchBox.addEventListener('click', function(e) {
            e.preventDefault();
            openSearchOverlay();
        });
    }

    // ── Workspace selector ───────────────────────────────────────────────
    function showWorkspaceSelector() {
        const settingsModal = getEl('settings-modal');
        if (settingsModal) settingsModal.classList.remove('active');

        if (accountDropdownCard) accountDropdownCard.style.display = 'none';
        if (modelDropdownCard)   modelDropdownCard.style.display = 'none';

        const ws = getEl('workspace-selector');
        if (!ws) return;

        ws.style.display  = 'flex';
        ws.style.zIndex   = '100000';
        ws.style.position = 'fixed';
        ws.classList.add('active');

        void ws.offsetWidth;
    }

    function selectWorkspace(type) {
    sessionStorage.setItem('axelr_ws_switched', '1');
        localStorage.setItem('Axelr_workspace', type);
        const ws = getEl('workspace-selector');
        if (ws) {
            ws.classList.remove('active');
            ws.style.display = 'none';
            ws.style.zIndex  = '';
        }
        activateWorkspace(type);
    }
function activateWorkspace(name, isBoot = false) {
    const validWorkspaces = ['core', 'data', 'design'];

    // Boot: force Core unless the user explicitly locked a different one.
    if (isBoot) {
        const isLocked = localStorage.getItem('axelr_ws_locked') === 'true';
        if (isLocked) {
            const stored = localStorage.getItem('Axelr_workspace');
            name = validWorkspaces.includes(stored) ? stored : 'core';
        } else {
            name = 'core';
        }
    }

    if (!validWorkspaces.includes(name)) name = 'core';

    // Mid-session lock guard
    const isLocked = localStorage.getItem('axelr_ws_locked') === 'true';
    if (isLocked && !isBoot) {
        showToast('Workspace is locked. Unlock in Profile Settings to switch.', 'warning');
        return;
    }

    updateWorkspaceTheme(name);
    localStorage.setItem('Axelr_workspace', name);
    sessionStorage.setItem('axelr_ws_interacted', 'true');

    updateModelBranding(name, window.currentUser?.tier || 'free');
    if (window.Axelr.updateFeaturesMenu) window.Axelr.updateFeaturesMenu(name);

    closeModals();
    if (sidebarNode) sidebarNode.classList.remove('open');

    if (!isBoot) {
        const label = name.charAt(0).toUpperCase() + name.slice(1);
        showToast(`Switched to ${label} workspace`, 'success');
    }

    resetToNewChat(isBoot);
    if (!isBoot && !st.isGuestMode && localStorage.getItem('google_auth_token') && window.Axelr.loadArchiveLogs) {
        window.Axelr.loadArchiveLogs();
    }
    if (window.Axelr.displaySuggestions) window.Axelr.displaySuggestions();
    if (window.currentUser) updateQuotaDisplay(window.currentUser);
}

    // Workspace lock functionality
    function toggleWorkspaceLock(locked) {
        localStorage.setItem('axelr_ws_locked', locked.toString());
        const lockDesc = getEl('lock-desc');
        if (lockDesc) {
            lockDesc.textContent = locked ? 'Workspace is locked, cannot switch automatically or manually' : 'Prevent automatic workspace switching';
        }
        showToast(`Workspace ${locked ? 'locked' : 'unlocked'}`, locked ? 'info' : 'success');
    }

    // Initialize workspace lock checkbox state on page load
    function initWorkspaceLock() {
        const toggle = getEl('workspace-lock-toggle');
        if (toggle) {
            toggle.checked = localStorage.getItem('axelr_ws_locked') === 'true';
            const lockDesc = getEl('lock-desc');
            if (lockDesc && toggle.checked) {
                lockDesc.textContent = 'Workspace is locked, cannot switch automatically or manually';
            }
        }
    }

    function resetToNewChat(isBoot = false) {
        if (st.viewportObserver) {
            st.viewportObserver.disconnect();
            st.viewportObserver = null;
        }
        st.activeSessionId = null;
        st.runningStructuredCache = null;
        if (st.stagedFiles.length > 0) {
            st.stagedFiles = [];
            if (window.Axelr.renderFileChips) window.Axelr.renderFileChips();
        }
        localStorage.removeItem('Axelr_active_session');
        if (viewport) {
            viewport.querySelectorAll('.chat-bubble').forEach(bubble => bubble.remove());
        }
        if (heroDisplay) heroDisplay.style.display = 'flex';
        if (!isBoot) {
            if (promptInput) {
                promptInput.value = '';
                promptInput.style.height = 'auto';
            }
            localStorage.removeItem(getDraftKey());
        } else {
            const savedDraft = localStorage.getItem(getDraftKey());
            if (savedDraft && promptInput) {
                promptInput.value = savedDraft;
                setTimeout(() => {
                    promptInput.style.height = 'auto';
                    promptInput.style.height = promptInput.scrollHeight + 'px';
                }, 10);
            }
        }
        if (window.Axelr.validateSendCommand) window.Axelr.validateSendCommand();
        if (window.innerWidth <= 768 && sidebarNode) sidebarNode.classList.remove('open');
        st.hasRegenerated = false;
        if (st.regenerateTimer) {
            clearTimeout(st.regenerateTimer);
            st.regenerateTimer = null;
        }
        if (mainBackBtn) mainBackBtn.style.display = 'none';
        if (window.Axelr.adjustViewportPadding) window.Axelr.adjustViewportPadding();
        setTimeout(() => { if (window.Axelr.setupViewportObserver) window.Axelr.setupViewportObserver(); }, 100);
    }

    // ── Viewport ─────────────────────────────────────────────────────────
    function adjustCommandWrapperAndViewport() {
        const vv = window.visualViewport;
        if (!vv || window.innerWidth > 768) return;
        const keyboardOffset = Math.max(0, window.innerHeight - vv.height);
        if (commandWrapper) {
            commandWrapper.style.bottom = keyboardOffset > 80 ? `${keyboardOffset}px` : '0px';
        }
        const offsetY = window.innerHeight - vv.height;
        const maxBottom = Math.min(offsetY, window.innerHeight * 0.4);
        const currentBottom = parseFloat(commandWrapper?.style.bottom || '0');
        if (Math.abs(currentBottom - maxBottom) > 3 && commandWrapper) {
            commandWrapper.style.bottom = maxBottom + 'px';
        }
        const fileChips = getEl('file-staging-container');
        const fileChipsHeight = fileChips && st.stagedFiles.length > 0 ? fileChips.offsetHeight : 0;
        const availableHeight = window.innerHeight - maxBottom - 20 - fileChipsHeight;
        if (commandWrapper) commandWrapper.style.maxHeight = Math.min(availableHeight, window.innerHeight * 0.8) + 'px';
        adjustViewportPadding();
    }

    let resizeTimeout2 = null;
    function debouncedAdjust() {
        if (resizeTimeout2) cancelAnimationFrame(resizeTimeout2);
        resizeTimeout2 = requestAnimationFrame(() => {
            adjustCommandWrapperAndViewport();
            resizeTimeout2 = null;
        });
    }

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', debouncedAdjust);
        window.visualViewport.addEventListener('scroll', debouncedAdjust);
    }

    function setupViewportObserver() {
        // Clean up any existing observers
        if (st.viewportObserver) {
            st.viewportObserver.disconnect();
            st.viewportObserver = null;
        }
        if (!viewport) return;
        
        // Create invisible intersection observer anchor at the bottom of the viewport
        let scrollAnchor = document.getElementById('viewport-scroll-anchor');
        if (!scrollAnchor) {
            scrollAnchor = document.createElement('div');
            scrollAnchor.id = 'viewport-scroll-anchor';
            scrollAnchor.style.height = '1px';
            scrollAnchor.style.width = '100%';
            scrollAnchor.style.position = 'relative';
            scrollAnchor.style.bottom = '0';
            viewport.appendChild(scrollAnchor);
        }
        
        // Use IntersectionObserver instead of MutationObserver to eliminate layout thrashing
        // Browser asynchronously notifies us when anchor exits viewport - zero synchronous layout costs
        st.viewportObserver = new IntersectionObserver((entries) => {
            const entry = entries[0];
            if (entry.isIntersecting && !st.isUserScrolling && st.observerActive) {
                // Anchor is in view - we're already at the bottom, no action needed
            } else if (!entry.isIntersecting && !st.isUserScrolling && st.observerActive) {
                // Anchor has exited viewport - user has scrolled up, disable auto-scroll
                // Or if we're actively streaming, maintain auto-scroll
                window.Axelr.scrollToBottom(true);
            }
        }, {
            root: viewport,
            threshold: 1.0 // Only trigger when anchor is fully out of view
        });
        
        st.viewportObserver.observe(scrollAnchor);
        
        // Add function to reposition anchor when new messages are added
        window.Axelr.repositionScrollAnchor = () => {
            if (scrollAnchor && viewport.lastChild !== scrollAnchor) {
                viewport.appendChild(scrollAnchor);
            }
        };
    }

    if (viewport) {
        viewport.addEventListener('scroll', () => {
            st.isUserScrolling = true;
            clearTimeout(st.scrollTimeout);
            st.scrollTimeout = setTimeout(() => { st.isUserScrolling = false; }, 500);
        }, { passive: true });
    }

    function adjustViewportPadding() {
        if (!commandWrapper) return;
        const wrapperHeight = commandWrapper.offsetHeight;
        const fileChips = getEl('file-staging-container');
        const chipsHeight = fileChips && st.stagedFiles.length > 0 ? fileChips.offsetHeight : 0;
        let totalPadding = wrapperHeight + 20;
        if (chipsHeight > 0) totalPadding += chipsHeight + 10;
        totalPadding = Math.max(totalPadding, 120);
        if (viewport) viewport.style.paddingBottom = totalPadding + 'px';
    }

    let resizeHandlerTimeout = null;
    let isResizeHandling = false;
    window.addEventListener('resize', () => {
        if (isResizeHandling) return;
        isResizeHandling = true;
        clearTimeout(resizeHandlerTimeout);
        resizeHandlerTimeout = setTimeout(() => {
            if (document.body.classList.contains('workspace-data') || document.body.classList.contains('workspace-design') || document.body.classList.contains('workspace-core')) {
                adjustViewportPadding();
                if (window.Axelr.renderFileChips) window.Axelr.renderFileChips();
            }
            isResizeHandling = false;
        }, 150);
    });

    // ── Inline workspace cards (settings) ────────────────────────────────
    function renderInlineWorkspaceCards() {
        const host = getEl('workspace-cards-inline');
        if (!host) return;

        const current = getWorkspace();
        const workspaces = [
            { id: 'data',   icon: 'database',     title: 'Data',   desc: 'Extract, analyse & transform' },
            { id: 'design', icon: 'palette',      title: 'Design', desc: 'UI/UX generation & deployment' },
            { id: 'core',   icon: 'auto_awesome', title: 'Core',   desc: 'Everyday AI assistance' },
        ];
        host.innerHTML = workspaces.map(w => `
            <div class="ws-card ${w.id === current ? 'active' : ''}"
                 onclick="pickInlineWorkspace('${w.id}')">
                <span class="material-symbols-rounded">${w.icon}</span>
                <div>
                    <div class="ws-card-title">${w.title}</div>
                    <div class="ws-card-desc">${w.desc}</div>
                </div>
                ${w.id === current ? '<span class="material-symbols-rounded ws-check">check_circle</span>' : ''}
            </div>
        `).join('');
    }

    function pickInlineWorkspace(type) {
        localStorage.setItem('Axelr_workspace', type);
        renderInlineWorkspaceCards();
        activateWorkspace(type, true);
        showToast(`Switched to ${type} workspace`, 'success');
    }

    // ── Publish ──────────────────────────────────────────────────────────
    // ── Explorer Mode (Guest Mode Demo Gateway) ─────────────────────────
    function prepopulateExplorerShowcase() {
        const historyListContainer = getEl('history-list-container');
        if (historyListContainer && !window.explorerShowcasePopulated) {
            const showcaseChats = [
                {id: 'data-extraction', title: 'Data Extraction Demo', readOnly: true},
                {id: 'ui-generation', title: 'UI Generation Showcase', readOnly: true},
                {id: 'touch-fix', title: 'Touch-Fix Coding Demo', readOnly: true}
            ];
            showcaseChats.forEach(chat => {
                const chatEl = document.createElement('div');
                chatEl.className = 'history-item';
                chatEl.innerHTML = `<span>${chat.title}</span><span class="read-only-badge">Demo</span>`;
                chatEl.style.opacity = '0.9';
                historyListContainer.appendChild(chatEl);
            });
            window.explorerShowcasePopulated = true;
        }
    }

    function createUnlockCTA() {
        if (!window.unlockCTACreated) {
            // Inject pulse animation CSS
            const style = document.createElement('style');
            style.textContent = `
                @keyframes unlockPulse {
                    0%,100% { box-shadow: 0 0 0 0 rgba(0, 242, 254, 0.7); transform: scale(1); }
                    50% { box-shadow: 0 0 0 12px rgba(0, 242, 254, 0); transform: scale(1.02); }
                }
                .unlock-cta {
                    position: fixed;
                    bottom: var(--space-8);
                    left: 50%;
                    transform: translateX(-50%);
                    padding: var(--space-4) var(--space-6);
                    background: var(--accent-primary);
                    color: var(--text-on-accent);
                    border: none;
                    border-radius: 12px;
                    font-family: var(--font-base);
                    font-weight: 600;
                    cursor: pointer;
                    z-index: var(--z-modal);
                    animation: unlockPulse 2s infinite;
                    transition: transform var(--transition-base);
                }
                .unlock-cta:hover {
                    transform: translateX(-50%) scale(1.05);
                }
                .read-only-badge {
                    margin-left: auto;
                    padding: 2px 8px;
                    background: rgba(0,242,254,0.1);
                    color: var(--accent-primary);
                    border-radius: 999px;
                    font-size: var(--text-xs);
                    font-weight: 600;
                }
                /* Disable prompt input for unauthenticated users */
                body.guest-mode #prompt-input {
                    pointer-events: none;
                    opacity: 0.6;
                }
            `;
            document.head.appendChild(style);
            
            // Create CTA button
            const cta = document.createElement('button');
            cta.className = 'unlock-cta';
            cta.textContent = 'Unlock Full Capabilities';
            cta.onclick = () => {
                document.getElementById('auth-wall').style.display = 'flex';
            };
            document.body.appendChild(cta);
            window.unlockCTACreated = true;
        }
    }

    // Initialize workspace lock checkbox state
    initWorkspaceLock();
    Object.assign(window.Axelr, {
        MODEL_CONFIG: MODEL_CONFIG, 
        applyTheme, setTheme, toggleTheme,
        updateWorkspaceTheme, activateWorkspace, resetToNewChat,
        toggleWorkspaceLock, initWorkspaceLock,
        showWorkspaceSelector, selectWorkspace,
        loadModelConfig, renderModelDropdown, updateModelBranding, selectModel,
        getDailyLimit, updateQuotaDisplay, updateSettingsQuota,
        toggleSidebar, toggleAccountDropdown, toggleModelDropdown,
        toggleHistoryOptions, switchSidebarTab,
        openSearchOverlay, closeSearchOverlay, filterSearchOverlay,
        adjustCommandWrapperAndViewport, debouncedAdjust,
        setupViewportObserver, adjustViewportPadding,
        renderInlineWorkspaceCards, pickInlineWorkspace,
        prepopulateExplorerShowcase, createUnlockCTA,
        MODEL_CONFIG: MODEL_CONFIG,  // reassigned at load
        getCurrentThemePreference: () => currentThemePreference,
    });
    Object.entries({
        applyTheme, setTheme, toggleTheme,
        updateWorkspaceTheme, activateWorkspace, resetToNewChat,
        toggleWorkspaceLock, initWorkspaceLock,
        showWorkspaceSelector, selectWorkspace,
        loadModelConfig, renderModelDropdown, updateModelBranding, selectModel,
        getDailyLimit, updateQuotaDisplay, updateSettingsQuota,
        toggleSidebar, toggleAccountDropdown, toggleModelDropdown,
        toggleHistoryOptions, switchSidebarTab,
        openSearchOverlay, closeSearchOverlay, filterSearchOverlay,
        adjustCommandWrapperAndViewport, adjustViewportPadding,
        renderInlineWorkspaceCards, pickInlineWorkspace,
        prepopulateExplorerShowcase, createUnlockCTA,
    }).forEach(([k, v]) => { window[k] = v; });
})();