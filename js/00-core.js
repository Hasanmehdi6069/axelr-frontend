// js/00-core.js
// AXELR AI — Core namespace, constants, DOM refs, state, pure utils.
(function () {
    "use strict";

    // ── Namespace ────────────────────────────────────────────────────────
    window.Axelr = window.Axelr || {};

    // ── Configuration ────────────────────────────────────────────────────
    const API_BASE_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        ? "http://localhost:8000"
        : "https://axelr-backend.onrender.com";

    const GOOGLE_CLIENT_ID = "474929925590-kfpurq4aou35pkscf6gbr963vf4hfa7g.apps.googleusercontent.com";

    const AXELR_MODEL_CONFIG = {
        "data": {
            "models": [
                {"id": "flash", "label": "AXELR‑FLASH", "badge": "DATA", "desc": "Lightning‑fast extractions & analysis", "tier": "free"},
                {"id": "pro", "label": "AXELR‑PRO DATA", "badge": "PRO", "desc": "Advanced extraction with higher limits", "tier": "pro"},
                {"id": "business", "label": "AXELR‑ENTERPRISE", "badge": "ENTERPRISE", "desc": "Massive throughput & custom pipelines", "tier": "business"}
            ]
        },
        "design": {
            "models": [
                {"id": "flash", "label": "AXELR‑ARCHITECT", "badge": "BUILDER", "desc": "Instant UI/UX components", "tier": "free"},
                {"id": "pro", "label": "AXELR‑STUDIO", "badge": "PRO", "desc": "Complex interactions & design systems", "tier": "pro"},
                {"id": "business", "label": "AXELR‑DESIGN OPS", "badge": "DESIGN OPS", "desc": "Team‑scale design & deployment", "tier": "business"}
            ]
        },
        "core": {
            "models": [
                {"id": "flash", "label": "AXELR‑FLASH", "badge": "FREE", "desc": "Instant answers for everyday questions", "tier": "free"},
                {"id": "pro", "label": "AXELR‑HYPER", "badge": "HYPER", "desc": "Deep reasoning & code generation", "tier": "pro"},
                {"id": "business", "label": "AXELR‑OMNI", "badge": "OMNI", "desc": "Unlimited context & multi‑agent orchestration", "tier": "business"}
            ]
        }
    };

    const AXELR_AVATAR_SVG =
        `<svg viewBox="0 0 100 100" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M50 15 L20 32.5 L20 67.5 L50 85" stroke="#ffffff" stroke-width="6" stroke-linejoin="bevel" fill="rgba(255,255,255,0.05)"/><path d="M50 15 L80 32.5 L50 50 L80 67.5 L50 85" stroke="currentColor" stroke-width="6" stroke-linejoin="bevel" fill="none"/><path d="M20 32.5 L50 50 L20 67.5" stroke="#ffffff" stroke-width="3" stroke-linejoin="bevel" opacity="0.5"/></svg>`;

    const ICONS = {
        copy: `<span class="material-symbols-rounded" style="font-size:16px;">content_copy</span>`,
        edit: `<span class="material-symbols-rounded" style="font-size:16px;">edit</span>`,
        thumbsUp: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`,
        thumbsDown: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V6h-11.28a2 2 0 0 0-2 1.7L6.34 17a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"/></svg>`,
        regenerate: `<span class="material-symbols-rounded" style="font-size:16px;">refresh</span>`,
        stop: `<span class="material-symbols-rounded" style="font-size:16px;">stop</span>`,
        moreVertical: `<span class="material-symbols-rounded" style="font-size:18px;">more_vert</span>`,
        leftArrow: `<span class="material-symbols-rounded" style="font-size:16px;">chevron_left</span>`,
        rightArrow: `<span class="material-symbols-rounded" style="font-size:16px;">chevron_right</span>`,
    };

    const SIDEBAR_ICONS = {
        push_pin: `<span class="material-symbols-rounded" style="font-size:14px;">push_pin</span>`,
        edit: `<span class="material-symbols-rounded" style="font-size:14px;">edit</span>`,
        link: `<span class="material-symbols-rounded" style="font-size:14px;">link</span>`,
        inventory: `<span class="material-symbols-rounded" style="font-size:14px;">inventory</span>`,
        delete: `<span class="material-symbols-rounded" style="font-size:14px;">delete</span>`,
        undo: `<span class="material-symbols-rounded" style="font-size:14px;">undo</span>`,
        restore: `<span class="material-symbols-rounded" style="font-size:14px;">restore</span>`,
        delete_forever: `<span class="material-symbols-rounded" style="font-size:14px;">delete_forever</span>`,
    };

    // ── DOM refs ─────────────────────────────────────────────────────────
    function getEl(id) {
        return document.getElementById(id);
    }

    const promptInput = getEl('prompt-input');
    const fileInput = getEl('omni-file-input');
    const fileStagingContainer = getEl('file-staging-container');
    const viewport = getEl('viewport');
    const historyListContainer = getEl('history-list-container');
    const accountDropdownCard = getEl('account-dropdown-card');
    const modelDropdownCard = getEl('model-dropdown-card');
    const sidebarTriggerArea = getEl('sidebar-trigger-area');
    const sidebarNode = getEl('sidebar-container-node');
    const sendBtn = getEl('send-trigger');
    const commandWrapper = getEl('command-wrapper');
    const mainWrapper = getEl('content-mask');
    const authWall = getEl('auth-wall');
    const heroDisplay = getEl('hero-display');
    const mainBackBtn = getEl('main-back-btn');

    // ── State ────────────────────────────────────────────────────────────
    let stagedFiles = [];
    let cachedLogHistory = [];
    let activeSessionId = null;
    let runningStructuredCache = null;
    let runningFileTitle = 'Export.csv';
    let isListeningForVocal = false;
    let currentTab = 'active';
    let isInitialAppLoad = true;
    let globalAbortController = null;
    let lastUserCommand = '';
    let regenerateTimer = null;
    let hasRegenerated = false;
    let currentUserId = null;
    let isProcessing = false;
    let isUserScrolling = false;
    let scrollTimeout = null;
    let viewportObserver = null;
    let observerActive = true;
    let ignoreSidebarClose = false;
    let manipulationCount = parseInt(sessionStorage.getItem('axelr_manipulation_count')) || 0;
    let manipulationLockUntil = parseInt(sessionStorage.getItem('axelr_manipulation_lock')) || 0;
    let suppressRegenerateForNextResponse = false;
    let appInitialized = false;
    let isGuestMode = false;
    let guestSessionId = null;
    let streamingBubble = null;
    let streamingContentDiv = null;
    let streamingBuffer = '';
    let throttledRender = null;

    // Global user shape — safe defaults so gated UI never throws before profile loads
    window.currentUser = window.currentUser || { tier: 'free', subTierOptions: { hasDataAccess: false, hasDesignAccess: false } };

    window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled rejection:', event.reason);
        if (window.Axelr.showToast) window.Axelr.showToast('An unexpected error occurred. Please refresh.', 'error');
        event.preventDefault();
    });

    // ── Pure utilities ───────────────────────────────────────────────────
    function escapeHtmlEntities(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(String(str)));
        return div.innerHTML;
    }

    function extractHtmlCode(text) {
        if (!text) return null;
        const htmlBlockRegex = /```html\s*([\s\S]*?)```/i;
        let match = text.match(htmlBlockRegex);
        if (match) return match[1].trim();
        const genericBlockRegex = /```(?:\w+)?\s*([\s\S]*?)```/g;
        let block;
        while ((block = genericBlockRegex.exec(text)) !== null) {
            const content = block[1].trim();
            if (content.startsWith("<") && (content.includes("<html") || content.includes("<!DOCTYPE") || content.includes("<div") || content.includes("<body"))) {
                return content;
            }
        }
        const htmlTagRegex = /(<!DOCTYPE html>|<html>|<html[\s\S]*?>)/i;
        const startMatch = text.match(htmlTagRegex);
        if (startMatch) {
            const startIndex = startMatch.index;
            const endMatch = text.match(/<\/html>/i);
            if (endMatch) {
                const endIndex = endMatch.index + endMatch[0].length;
                return text.substring(startIndex, endIndex).trim();
            } else {
                return text.substring(startIndex).trim();
            }
        }
        return null;
    }

    function getWorkspace() {
        return localStorage.getItem('Axelr_workspace') || 'data';
    }

    function getDraftKey() {
        return `Axelr_prompt_draft_${currentUserId || 'anonymous'}`;
    }

    function throttle(fn, wait = 100) {
        let last = 0;
        let timer = null;
        return function throttled(...args) {
            const now = Date.now();
            const remaining = wait - (now - last);
            if (remaining <= 0) {
                if (timer) { clearTimeout(timer); timer = null; }
                last = now;
                fn.apply(this, args);
            } else if (!timer) {
                timer = setTimeout(() => {
                    last = Date.now();
                    timer = null;
                    fn.apply(this, args);
                }, remaining);
            }
        };
    }

    function extractLastCodeBlock() {
        const codeBlocks = viewport.querySelectorAll('pre code');
        if (codeBlocks.length === 0) return null;
        return codeBlocks[codeBlocks.length - 1].innerText;
    }

    function scrollToBottom(smooth = true) {
        if (!viewport || isUserScrolling) return;
        const lastMessage = viewport.querySelector('.chat-bubble:last-child');
        if (lastMessage) {
            try {
                lastMessage.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
            } catch (_) {
                viewport.scrollTop = viewport.scrollHeight;
            }
        }
    }

    function updateViewportAfterRender() {
        if (window._viewportUpdateId) cancelAnimationFrame(window._viewportUpdateId);
        window._viewportUpdateId = requestAnimationFrame(() => {
            if (!isUserScrolling) scrollToBottom(true);
            if (window.Axelr.adjustViewportPadding) window.Axelr.adjustViewportPadding();
            window._viewportUpdateId = null;
        });
    }

    // ── Workspace feature tables (used by features / command menus) ─────
    const WORKSPACE_FEATURES = {
        core: [
            { id: 'summarize', icon: 'summarize', label: 'Summarize Chat' },
            { id: 'brainstorm', icon: 'lightbulb', label: 'Brainstorm' },
            { id: 'multi-agent', icon: 'groups', label: 'Multi-Agent' },
            { id: 'workflow', icon: 'flowchart', label: 'Workflow' },
            { id: 'knowledge', icon: 'bookmark', label: 'Knowledge Vault' },
            { id: 'personas', icon: 'person', label: 'Personas' },
            { id: 'eli5', icon: 'child_care', label: 'Explain Like I\'m 5' },
            { id: 'decision-matrix', icon: 'table_view', label: 'Decision Matrix' },
            { id: 'minutes', icon: 'assignment', label: 'Meeting Minutes' }
        ],
        data: [
            { id: 'summarize', icon: 'summarize', label: 'Summarize Data' },
            { id: 'storyteller', icon: 'auto_stories', label: 'Data Storyteller' },
            { id: 'export', icon: 'download', label: 'Export CSV' },
            { id: 'chart', icon: 'bar_chart', label: 'Generate Chart' },
            { id: 'workflow', icon: 'flowchart', label: 'Workflow' },
            { id: 'knowledge', icon: 'bookmark', label: 'Knowledge Vault' },
            { id: 'schema', icon: 'table_chart', label: 'Schema Discovery' },
            { id: 'scan-pii', icon: 'shield_person', label: 'PII Privacy Scan' },
            { id: 'mermaid', icon: 'account_tree', label: 'Mermaid Diagram' }
        ],
        design: [
            { id: 'touch-fix', icon: 'build', label: 'Touch & Fix' },
            { id: 'refactor', icon: 'code', label: 'Refactor Code' },
            { id: 'deploy', icon: 'rocket_launch', label: 'One-Click Deploy' },
            { id: 'visual-debug', icon: 'visibility', label: 'Visual Debugger' },
            { id: 'tests', icon: 'fact_check', label: 'Generate Tests' },
            { id: 'explain', icon: 'psychology', label: 'Explain Code' },
            { id: 'knowledge', icon: 'bookmark', label: 'Knowledge Vault' },
            { id: 'personas', icon: 'person', label: 'Personas' },
            { id: 'translate-code', icon: 'translate', label: 'Code Translator' },
            { id: 'mermaid', icon: 'account_tree', label: 'Generate Mermaid Diagram' }
        ]
    };

    const TIER_RANK = { free: 0, guest: 0, pro: 1, business: 2, enterprise: 3 };

    const WORKSPACE_CREATION_MENUS = {
        data: [
            { id: 'upload',           icon: 'attach_file',   label: 'Attach Data (CSV, Excel, PDF)', isUpload: true, minTier: 'free' },
            { id: 'scan-pii',         icon: 'shield_person', label: 'Scan Document for PII',                        minTier: 'pro' },
            { id: 'decision-matrix',  icon: 'table_view',    label: 'Synthesize Decision Matrix',                   minTier: 'pro' },
            { id: 'workflow',         icon: 'flowchart',     label: 'Automated Data Pipeline',                      minTier: 'business' }
        ],
        design: [
            { id: 'upload',           icon: 'attach_file',   label: 'Attach Mockup / Image',        isUpload: true, minTier: 'free' },
            { id: 'translate-code',   icon: 'translate',     label: 'Translate Code Component',                     minTier: 'pro' },
            { id: 'brainstorm',       icon: 'lightbulb',     label: 'Brainstorm UI Architecture',                   minTier: 'pro' },
            { id: 'mermaid',          icon: 'account_tree',  label: 'Generate Mermaid Diagram',                     minTier: 'business' }
        ],
        core: [
            { id: 'upload',           icon: 'attach_file',   label: 'Attach Assets / Data',         isUpload: true, minTier: 'free' },
            { id: 'brainstorm',       icon: 'lightbulb',     label: 'Brainstorm Ideas',                             minTier: 'free' },
            { id: 'multi-agent',      icon: 'groups',        label: 'Multi-Agent Orchestrator',                     minTier: 'pro' },
            { id: 'mermaid',          icon: 'account_tree',  label: 'Generate Mermaid Chart',                       minTier: 'pro' },
            { id: 'decision-matrix',  icon: 'table_view',    label: 'Synthesize Decision Matrix',                   minTier: 'pro' },
            { id: 'minutes',          icon: 'assignment',    label: 'Extract Meeting Minutes',                      minTier: 'pro' },
            { id: 'workflow',         icon: 'flowchart',     label: 'Automated Pipeline',                           minTier: 'business' }
        ]
    };

    // ── Publish ──────────────────────────────────────────────────────────
    Object.assign(window.Axelr, {
        API_BASE_URL, GOOGLE_CLIENT_ID, AXELR_MODEL_CONFIG, AXELR_AVATAR_SVG,
        ICONS, SIDEBAR_ICONS,
        getEl,
        promptInput, fileInput, fileStagingContainer, viewport,
        historyListContainer, accountDropdownCard, modelDropdownCard,
        sidebarTriggerArea, sidebarNode, sendBtn, commandWrapper,
        mainWrapper, authWall, heroDisplay, mainBackBtn,
        WORKSPACE_FEATURES, TIER_RANK, WORKSPACE_CREATION_MENUS,
        escapeHtmlEntities, extractHtmlCode, getWorkspace, getDraftKey,
        throttle, extractLastCodeBlock, scrollToBottom, updateViewportAfterRender,
    });

    // Cross-module mutable state accessors (getters + setters).
    // Modules that need to read/write these use window.Axelr.state.x.
    window.Axelr.state = {
        get stagedFiles() { return stagedFiles; },
        set stagedFiles(v) { stagedFiles = v; },
        get cachedLogHistory() { return cachedLogHistory; },
        set cachedLogHistory(v) { cachedLogHistory = v; },
        get activeSessionId() { return activeSessionId; },
        set activeSessionId(v) { activeSessionId = v; },
        get runningStructuredCache() { return runningStructuredCache; },
        set runningStructuredCache(v) { runningStructuredCache = v; },
        get runningFileTitle() { return runningFileTitle; },
        set runningFileTitle(v) { runningFileTitle = v; },
        get isListeningForVocal() { return isListeningForVocal; },
        set isListeningForVocal(v) { isListeningForVocal = v; },
        get currentTab() { return currentTab; },
        set currentTab(v) { currentTab = v; },
        get isInitialAppLoad() { return isInitialAppLoad; },
        set isInitialAppLoad(v) { isInitialAppLoad = v; },
        get globalAbortController() { return globalAbortController; },
        set globalAbortController(v) { globalAbortController = v; },
        get lastUserCommand() { return lastUserCommand; },
        set lastUserCommand(v) { lastUserCommand = v; },
        get regenerateTimer() { return regenerateTimer; },
        set regenerateTimer(v) { regenerateTimer = v; },
        get hasRegenerated() { return hasRegenerated; },
        set hasRegenerated(v) { hasRegenerated = v; },
        get currentUserId() { return currentUserId; },
        set currentUserId(v) { currentUserId = v; },
        get isProcessing() { return isProcessing; },
        set isProcessing(v) { isProcessing = v; },
        get isUserScrolling() { return isUserScrolling; },
        set isUserScrolling(v) { isUserScrolling = v; },
        get scrollTimeout() { return scrollTimeout; },
        set scrollTimeout(v) { scrollTimeout = v; },
        get viewportObserver() { return viewportObserver; },
        set viewportObserver(v) { viewportObserver = v; },
        get observerActive() { return observerActive; },
        set observerActive(v) { observerActive = v; },
        get ignoreSidebarClose() { return ignoreSidebarClose; },
        set ignoreSidebarClose(v) { ignoreSidebarClose = v; },
        get manipulationCount() { return manipulationCount; },
        set manipulationCount(v) { manipulationCount = v; },
        get manipulationLockUntil() { return manipulationLockUntil; },
        set manipulationLockUntil(v) { manipulationLockUntil = v; },
        get suppressRegenerateForNextResponse() { return suppressRegenerateForNextResponse; },
        set suppressRegenerateForNextResponse(v) { suppressRegenerateForNextResponse = v; },
        get appInitialized() { return appInitialized; },
        set appInitialized(v) { appInitialized = v; },
        get isGuestMode() { return isGuestMode; },
        set isGuestMode(v) { isGuestMode = v; },
        get guestSessionId() { return guestSessionId; },
        set guestSessionId(v) { guestSessionId = v; },
        get streamingBubble() { return streamingBubble; },
        set streamingBubble(v) { streamingBubble = v; },
        get streamingContentDiv() { return streamingContentDiv; },
        set streamingContentDiv(v) { streamingContentDiv = v; },
        get streamingBuffer() { return streamingBuffer; },
        set streamingBuffer(v) { streamingBuffer = v; },
        get throttledRender() { return throttledRender; },
        set throttledRender(v) { throttledRender = v; },
    };

    // Legacy global aliases (kept for backward-compat with the old single-file scope).
    Object.entries({
        API_BASE_URL, GOOGLE_CLIENT_ID, AXELR_MODEL_CONFIG, AXELR_AVATAR_SVG,
        ICONS, SIDEBAR_ICONS,
        getEl, promptInput, fileInput, fileStagingContainer, viewport,
        historyListContainer, accountDropdownCard, modelDropdownCard,
        sidebarTriggerArea, sidebarNode, sendBtn, commandWrapper,
        mainWrapper, authWall, heroDisplay, mainBackBtn,
        WORKSPACE_FEATURES, TIER_RANK, WORKSPACE_CREATION_MENUS,
        escapeHtmlEntities, extractHtmlCode, getWorkspace, getDraftKey,
        throttle, extractLastCodeBlock, scrollToBottom, updateViewportAfterRender,
    }).forEach(([k, v]) => { window[k] = v; });
})();
