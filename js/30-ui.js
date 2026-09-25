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
        const logo = getEl('sidebar-logo-text');
        const heroTitle = getEl('hero-title-text');
        const heroSub = getEl('hero-sub-text');
        if (workspace === 'design') {
            if (logo) logo.innerText = 'AXELR DESIGN';
            if (heroTitle) heroTitle.innerText = 'What are we designing today?';
            if (heroSub) heroSub.innerText = 'AI-powered UI/UX generation & live deployment.';
            if (promptInput) promptInput.placeholder = isMobile ? "Upload a mockup..." : "Upload a mockup or request a UI component...";
        } else if (workspace === 'core') {
            if (logo) logo.innerText = 'AXELR';
            if (heroTitle) heroTitle.innerText = 'What can I help you with?';
            if (heroSub) heroSub.innerText = 'Intelligence execution for any task – from code to creativity.';
            if (promptInput) promptInput.placeholder = isMobile ? "Ask anything..." : "Ask me anything – I\'m here to help...";
        } else {
            if (logo) logo.innerText = 'AXELR DATA';
            if (heroTitle) heroTitle.innerText = 'What are we building today?';
            if (heroSub) heroSub.innerText = 'AI-powered architecture and data execution.';
            if (promptInput) promptInput.placeholder = isMobile ? "Upload a receipt..." : "Upload a receipt, invoice, or CSV for extraction...";
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
        localStorage.setItem('Axelr_workspace', type);
        const ws = getEl('workspace-selector');
        if (ws) {
            ws.classList.remove('active');
            ws.style.display = 'none';
            ws.style.zIndex  = '';
        }
        activateWorkspace(type);
    }

    function activateWorkspace(type, isBoot = false) {
        if (mainWrapper) mainWrapper.classList.add('visible');
        document.body.classList.remove('workspace-data', 'workspace-design', 'workspace-core');
        document.body.classList.add(`workspace-${type}`);
        const isMobile = window.innerWidth <= 768;
        const logo = getEl('sidebar-logo-text');
        const heroTitle = getEl('hero-title-text');
        const heroSub = getEl('hero-sub-text');
        if (type === 'design') {
            if (logo) logo.innerText = 'AXELR DESIGN';
            if (heroTitle) heroTitle.innerText = 'What are we designing today?';
            if (heroSub) heroSub.innerText = 'AI-powered UI/UX generation & live deployment.';
            if (promptInput) promptInput.placeholder = isMobile ? "Upload a mockup..." : "Upload a mockup or request a UI component...";
        } else if (type === 'core') {
            if (logo) logo.innerText = 'AXELR';
            if (heroTitle) heroTitle.innerText = 'What can I help you with?';
            if (heroSub) heroSub.innerText = 'Intelligence execution for any task.';
            if (promptInput) promptInput.placeholder = isMobile ? "Ask anything..." : "Ask me anything – I\'m here to help...";
        } else {
            if (logo) logo.innerText = 'AXELR DATA';
            if (heroTitle) heroTitle.innerText = 'What are we building today?';
            if (heroSub) heroSub.innerText = 'AI-powered architecture and data execution.';
            if (promptInput) promptInput.placeholder = isMobile ? "Upload a receipt..." : "Upload a receipt, invoice, or CSV for extraction...";
        }
        resetToNewChat(isBoot);
        if (!isBoot && !st.isGuestMode && localStorage.getItem('google_auth_token') && window.Axelr.loadArchiveLogs) window.Axelr.loadArchiveLogs();
        if (window.Axelr.displaySuggestions) window.Axelr.displaySuggestions();
        if (window.Axelr.updateFeaturesMenu) window.Axelr.updateFeaturesMenu(type);
        if (window.currentUser) updateQuotaDisplay(window.currentUser);
        updateModelBranding(type, window.currentUser?.tier || 'free');
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
        if (st.viewportObserver) {
            st.viewportObserver.disconnect();
            st.viewportObserver = null;
        }
        if (!viewport) return;
        st.viewportObserver = new MutationObserver(() => {
            if (!st.isUserScrolling && st.observerActive) {
                const lastMessage = viewport.querySelector('.chat-bubble:last-child');
                if (lastMessage) {
                    const rect = lastMessage.getBoundingClientRect();
                    const viewportRect = viewport.getBoundingClientRect();
                    if (rect.bottom > viewportRect.bottom - 50) {
                        window.Axelr.scrollToBottom(true);
                    }
                }
            }
        });
        st.viewportObserver.observe(viewport, { childList: true, subtree: true, characterData: true, attributes: true });
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
    Object.assign(window.Axelr, {
        applyTheme, setTheme, toggleTheme,
        updateWorkspaceTheme, activateWorkspace, resetToNewChat,
        showWorkspaceSelector, selectWorkspace,
        loadModelConfig, renderModelDropdown, updateModelBranding, selectModel,
        getDailyLimit, updateQuotaDisplay, updateSettingsQuota,
        toggleSidebar, toggleAccountDropdown, toggleModelDropdown,
        toggleHistoryOptions, switchSidebarTab,
        openSearchOverlay, closeSearchOverlay, filterSearchOverlay,
        adjustCommandWrapperAndViewport, debouncedAdjust,
        setupViewportObserver, adjustViewportPadding,
        renderInlineWorkspaceCards, pickInlineWorkspace,
        MODEL_CONFIG: MODEL_CONFIG,  // reassigned at load
        getCurrentThemePreference: () => currentThemePreference,
    });
    Object.entries({
        applyTheme, setTheme, toggleTheme,
        updateWorkspaceTheme, activateWorkspace, resetToNewChat,
        showWorkspaceSelector, selectWorkspace,
        loadModelConfig, renderModelDropdown, updateModelBranding, selectModel,
        getDailyLimit, updateQuotaDisplay, updateSettingsQuota,
        toggleSidebar, toggleAccountDropdown, toggleModelDropdown,
        toggleHistoryOptions, switchSidebarTab,
        openSearchOverlay, closeSearchOverlay, filterSearchOverlay,
        adjustCommandWrapperAndViewport, adjustViewportPadding,
        renderInlineWorkspaceCards, pickInlineWorkspace,
    }).forEach(([k, v]) => { window[k] = v; });
})();