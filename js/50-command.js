// js/50-command.js
// AXELR AI — Input, files, voice, executeCommand SSE, action buttons, deploy.
// v4.4 — thinking animation restored as a first-class function.
(function () {
    "use strict";
    const {
        API_BASE_URL, ensureValidToken, showToast, escapeHtmlEntities, getEl,
        extractHtmlCode, AXELR_AVATAR_SVG, ICONS, getWorkspace, getDraftKey,
        promptInput, fileInput, fileStagingContainer, viewport, sendBtn,
        commandWrapper, mainWrapper, heroDisplay, mainBackBtn, sidebarNode,
        scrollToBottom, updateViewportAfterRender, throttle,
    } = window.Axelr;
    const st = window.Axelr.state;

    const apiFetch = window.Axelr.apiFetch || ((...a) => fetch(...a));

    // ═══════════════════════════════════════════════════════════════════
    // 0 · THINKING ANIMATION (restored from the orphaned v4.2 block)
    //     Lives as a real function so the caller can capture its cleanup.
    //     Renders into #thinking-indicator (or creates one), independent of
    //     the inline reasoning chain rendered inside the AI bubble.
    // ═══════════════════════════════════════════════════════════════════
    const THINKING_STEPS = [
        { icon: "psychology",    text: "Thinking",              delay: 1000 },
        { icon: "manage_search", text: "Analyzing context",     delay: 1200 },
        { icon: "sync_alt",      text: "Reconciling signals",   delay: 1400 },
        { icon: "verified",      text: "Finalizing response",   delay: 1500 }
    ];

    function startThinkingAnimation() {
        // Ensure keyframes are installed once.
        if (!document.getElementById("elite-thinking-styles")) {
            const s = document.createElement("style");
            s.id = "elite-thinking-styles";
            s.textContent = `
                @keyframes elxPulse {0%,100%{opacity:1}50%{opacity:.7}}
                @keyframes elxDotPulse {0%,60%,100%{opacity:.3}30%{opacity:1}}
                .thinking-step {display:flex;align-items:center;gap:12px;animation:elxPulse 1.5s infinite}
                .thinking-step .loading-dots span {display:inline-block;animation:elxDotPulse 1.4s infinite}
                .thinking-step .loading-dots span:nth-child(2){animation-delay:.2s}
                .thinking-step .loading-dots span:nth-child(3){animation-delay:.4s}
            `;
            document.head.appendChild(s);
        }

        // Locate or create the container.
        let container = getEl("thinking-indicator");
        if (!container) {
            container = document.createElement("div");
            container.id = "thinking-indicator";
            container.setAttribute("role", "status");
            container.setAttribute("aria-live", "polite");
            container.style.cssText = "display:flex;flex-direction:column;gap:8px;padding:10px 14px;margin:6px 0;border:1px dashed rgba(0,242,254,0.2);border-radius:8px;background:rgba(0,242,254,0.02);font-size:13px;";
            if (viewport) viewport.appendChild(container);
            else document.body.appendChild(container);
        }
        container.style.display = "flex";
        container.style.opacity = "1";
        container.innerHTML = "";

        let currentStep = 0;
        let stepTimer = null;
        let longWaitTimer = null;

        function showStep(step) {
            const previous = container.querySelectorAll(".thinking-step.active");
            previous.forEach(el => el.remove());
            const el = document.createElement("div");
            el.className = "thinking-step active";
            el.innerHTML =
                `<span class="material-symbols-rounded" style="color:var(--accent-glow);font-size:20px;">${step.icon}</span>` +
                `<span style="color:var(--text-primary);font-weight:500;">${step.text}</span>` +
                `<span class="loading-dots" style="margin-left:4px;">` +
                    `<span>.</span><span>.</span><span>.</span>` +
                `</span>`;
            container.appendChild(el);
            if (typeof scrollToBottom === "function") scrollToBottom();
        }

        function advance() {
            if (currentStep < THINKING_STEPS.length) {
                showStep(THINKING_STEPS[currentStep]);
                const delay = THINKING_STEPS[currentStep].delay;
                currentStep++;
                stepTimer = setTimeout(advance, delay);
            } else {
                // Waiting state — all steps exhausted, socket still quiet.
                const previous = container.querySelectorAll(".thinking-step.active");
                previous.forEach(el => el.remove());
                const el = document.createElement("div");
                el.className = "thinking-step waiting";
                el.innerHTML =
                    `<span class="material-symbols-rounded" style="color:#f59e0b;font-size:20px;">hourglass_top</span>` +
                    `<span style="color:var(--text-primary);">Finalizing response</span>` +
                    `<span class="loading-dots"><span>.</span><span>.</span><span>.</span></span>`;
                container.appendChild(el);
            }
        }

        advance();

        // Long-wait failover card at 5 s.
        longWaitTimer = setTimeout(() => {
            if (!container || container.style.display === "none") return;
            const previous = container.querySelectorAll(".thinking-step.active, .thinking-step.waiting");
            previous.forEach(el => el.remove());
            const el = document.createElement("div");
            el.className = "thinking-step failover";
            el.innerHTML =
                `<span class="material-symbols-rounded" style="color:#8b5cf6;font-size:20px;">swap_horiz</span>` +
                `<span style="color:var(--text-primary);">Switching to dedicated AI agent</span>` +
                `<span class="loading-dots"><span>.</span><span>.</span><span>.</span></span>`;
            container.appendChild(el);
        }, 5000);

        // Cleanup returned to caller — captured in cleanupThinkingAnimation.
        return function cleanup() {
            if (stepTimer) clearTimeout(stepTimer);
            if (longWaitTimer) clearTimeout(longWaitTimer);
            if (!container) return;
            container.style.transition = "opacity 0.4s ease";
            container.style.opacity = "0";
            setTimeout(() => {
                if (container && container.parentNode) container.parentNode.removeChild(container);
            }, 400);
        };
    }
// Force-override. The local version returns a cleanup closure; the
// 00-core.js version does not. This module must win the registration
// so hideThinkingIndicator can tear the animation down correctly.
window.Axelr.startThinkingAnimation = startThinkingAnimation;
window.Axelr.stopThinkingAnimation  = function () {
    const ti = getEl('thinking-indicator');
    if (ti) { ti.style.display = 'none'; ti.innerHTML = ''; }
};

    // ═══════════════════════════════════════════════════════════════════
    // 1 · FILE CHIPS
    // ═══════════════════════════════════════════════════════════════════
    function renderFileChips() {
        const container = getEl('file-staging-container');
        if (!container) return;
        if (st.stagedFiles.length === 0) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }
        container.style.display = 'flex';
        container.innerHTML = st.stagedFiles.map((file, idx) =>
            `<div class="file-chip" style="display:inline-flex;align-items:center;gap:5px;background:rgba(0,242,254,0.08);border:1px solid rgba(0,242,254,0.15);color:var(--text-muted);padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;margin:2px 0;">
                <span class="material-symbols-rounded" style="font-size:14px;">description</span>
                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px;display:inline-block;vertical-align:middle;">${escapeHtmlEntities(file.name)}</span>
                <span style="cursor:pointer;color:#ef4444;font-weight:bold;font-size:14px;flex-shrink:0;padding-left:2px;" onclick="removeStagedFile(${idx})"><span class="material-symbols-rounded" style="font-size:14px;">close</span></span>
            </div>`
        ).join('');
    }

    function removeStagedFile(idx) {
        st.stagedFiles.splice(idx, 1);
        renderFileChips();
        validateSendCommand();
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            let maxBytes = 5 * 1024 * 1024;
            let maxFilesAllowed = 2;
            if (document.body.classList.contains('pro-tier')) { maxBytes = 20 * 1024 * 1024; maxFilesAllowed = 5; }
            else if (document.body.classList.contains('designer-tier')) { maxBytes = 50 * 1024 * 1024; maxFilesAllowed = 5; }

            const incomingFiles = Array.from(e.target.files);
            const currentWs = getWorkspace();
            if (currentWs === 'core' && incomingFiles.length > 0) {
                const primary = incomingFiles[0];
                const type = primary.type || '';
                const name = (primary.name || '').toLowerCase();
                const isImage = type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name);
                const isDoc = type === 'application/pdf' || type === 'text/csv' || type.includes('spreadsheet') || type.includes('excel') || /\.(csv|xlsx?|pdf|tsv|json)$/i.test(name);
                let targetWs = null;
                if (isImage) targetWs = 'design';
                else if (isDoc) targetWs = 'data';
                if (targetWs && targetWs !== currentWs) {
                    sessionStorage.setItem('axelr_ws_switched', '1');
                    if (window.Axelr.activateWorkspace) window.Axelr.activateWorkspace(targetWs);
                    if (window.Axelr.showToast) {
                        const labels = { data: 'Data', design: 'Design' };
                        window.Axelr.showToast(`Detected ${labels[targetWs]} input — switched to ${labels[targetWs]} workspace`, 'info');
                    }
                }
            }

            if ((st.stagedFiles.length + incomingFiles.length) > maxFilesAllowed) {
                alert(`⚠️ Tier Limit Reached: You can only attach up to ${maxFilesAllowed} files.`);
                fileInput.value = '';
                return;
            }

            const validFiles = incomingFiles.filter(file => {
                if (file.size === 0) { alert(`⚠️ The file "${file.name}" is empty (0 bytes).`); return false; }
                if (file.type && !file.type.startsWith('image/') && file.type !== 'text/plain' && file.type !== 'text/csv' && file.type !== 'application/pdf' && !file.type.includes('spreadsheet') && !file.type.includes('document')) {
                    alert(`⚠️ File type "${file.type}" is not supported.`);
                    return false;
                }
                return true;
            });

            const incomingSize = validFiles.reduce((a, f) => a + f.size, 0);
            const currentStagedSize = st.stagedFiles.reduce((a, f) => a + f.size, 0);
            if ((incomingSize + currentStagedSize) > maxBytes) {
                alert(`⚠️ Payload Exceeds Tier Capacity. Maximum: ${maxBytes / (1024 * 1024)}MB.`);
                fileInput.value = '';
                return;
            }

            st.stagedFiles = [...st.stagedFiles, ...validFiles];
            renderFileChips();
            fileInput.value = '';
            validateSendCommand();
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    // 2 · VALIDATION / INPUT
    // ═══════════════════════════════════════════════════════════════════
    function validateSendCommand() {
        const hasInput = (promptInput?.value?.trim()?.length || 0) > 0 || st.stagedFiles.length > 0;
        if (sendBtn) sendBtn.disabled = !hasInput;
        const inputFrame = document.querySelector('.input-frame');
        if (inputFrame) inputFrame.classList.toggle('has-text', hasInput);
    }

    if (promptInput) {
        promptInput.addEventListener('input', () => {
            promptInput.style.height = 'auto';
            promptInput.style.height = promptInput.scrollHeight + 'px';
            validateSendCommand();
            localStorage.setItem(getDraftKey(), promptInput.value);
        });
    }

    window.addEventListener('offline', () => {
        const banner = getEl('offline-banner');
        if (banner) banner.style.display = 'block';
        if (sendBtn) sendBtn.disabled = true;
    });
    window.addEventListener('online', () => {
        const banner = getEl('offline-banner');
        if (banner) banner.style.display = 'none';
        validateSendCommand();
    });

    // ═══════════════════════════════════════════════════════════════════
    // 3 · VOICE
    // ═══════════════════════════════════════════════════════════════════
    const micBtn = getEl('mic-trigger');
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition && micBtn) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = window.navigator.language || 'en-US';
        let basePromptText = "";
        micBtn.onclick = () => {
            if (st.isListeningForVocal) { recognition.stop(); return; }
            try { recognition.start(); } catch (err) {
                alert("⚠️ Microphone pipeline locked. Refresh the page and check URL bar permissions.");
            }
        };
        recognition.onstart = () => {
            st.isListeningForVocal = true;
            micBtn.classList.add('listening');
            basePromptText = promptInput?.value || "";
        };
        recognition.onend = () => {
            st.isListeningForVocal = false;
            micBtn.classList.remove('listening');
        };
        recognition.onerror = (event) => {
            st.isListeningForVocal = false;
            micBtn.classList.remove('listening');
            if (event.error === 'not-allowed') alert("⚠️ Microphone access denied. Allow permissions in your browser URL bar.");
            else if (event.error === 'no-speech') alert("⚠️ No audio detected. Check your microphone settings.");
        };
        recognition.onresult = (event) => {
            let interim = "", final = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) final += event.results[i][0].transcript;
                else interim += event.results[i][0].transcript;
            }
            if (promptInput) {
                promptInput.value = (basePromptText + " " + final + " " + interim).trim();
                promptInput.style.height = 'auto';
                promptInput.style.height = promptInput.scrollHeight + 'px';
                validateSendCommand();
                localStorage.setItem(getDraftKey(), promptInput.value);
            }
        };
    } else if (micBtn) {
        micBtn.style.display = 'none';
    }

    // ═══════════════════════════════════════════════════════════════════
    // 4 · SECURITY FILTER
    // ═══════════════════════════════════════════════════════════════════
    function detectManipulationAttempt(command) {
        const patterns = [
            /forget all (instructions|prior|previous)/i,
            /disregard (system prompt|guidelines|instructions)/i,
            /ignore (all|previous) (instructions|prompts)/i,
            /override your (system|core|primary) instructions/i,
            /you are (not|no longer) bound by/i,
            /bypass your safety/i,
            /stop following your instructions/i,
            /reset your instructions/i
        ];
        for (let p of patterns) if (p.test(command)) return true;
        return false;
    }

    function showSecurityAlert(level) {
        const alertBubble = document.createElement('div');
        alertBubble.className = 'chat-bubble nexus-bubble';
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'ai-avatar-bubble';
        avatarDiv.innerHTML = AXELR_AVATAR_SVG;
        alertBubble.appendChild(avatarDiv);
        const contentDiv = document.createElement('div');
        contentDiv.className = 'bubble-content';
        contentDiv.style.flex = '1';
        let html = '';
        if (level === 1) {
            html = `<div class="security-alert-banner warning"><span class="material-symbols-rounded">warning</span><span>⚠️ Warning: Detected attempt to bypass core system architecture. Please stay within operational parameters to avoid account restriction.</span></div>`;
        } else if (level === 2) {
            html = `<div class="security-alert-banner critical"><span class="material-symbols-rounded">error</span><span>🚨 SECURITY ALERT: Multiple manipulation attempts detected. System locking for 10 minutes. Please reset your operational behavior.</span></div>`;
        }
        contentDiv.innerHTML = html;
        alertBubble.appendChild(contentDiv);
        if (viewport) viewport.appendChild(alertBubble);
        scrollToBottom();
    }

    // ═══════════════════════════════════════════════════════════════════
    // 5 · EXECUTE COMMAND — the one and only dispatcher
    // ═══════════════════════════════════════════════════════════════════
    async function executeCommand(isRetry = false, regenerateSessionId = null) {
        if (!st.activeSessionId && heroDisplay) heroDisplay.style.display = 'none';
        if (st.isProcessing) return;
        st.isProcessing = true;

        // ── Reasoning-chain + thinking-animation handles (single block) ──
        let reasoningHandle = null;
        let cleanupThinkingAnimation = null;

        function hideThinkingIndicator(label) {
            if (reasoningHandle) {
                reasoningHandle.complete(label || 'done');
                reasoningHandle = null;
            }
            if (cleanupThinkingAnimation) {
                try { cleanupThinkingAnimation(); } catch (_) {}
                cleanupThinkingAnimation = null;
            }
            const ti = getEl('thinking-indicator');
            if (ti) ti.style.display = 'none';
        }

        // Kick off the thinking animation; capture its cleanup.
        if (window.Axelr.startThinkingAnimation) {
            const maybeCleanup = window.Axelr.startThinkingAnimation();
            if (typeof maybeCleanup === 'function') cleanupThinkingAnimation = maybeCleanup;
        }

        if (st.manipulationLockUntil && Date.now() < st.manipulationLockUntil) {
            const remaining = Math.ceil((st.manipulationLockUntil - Date.now()) / 1000);
            alert(`⛔ System temporarily locked due to security violations. Please wait ${remaining} seconds.`);
            hideThinkingIndicator();
            st.isProcessing = false;
            return;
        }

        if (st.currentTab === 'trashed') {
            if (window.Axelr.switchSidebarTab) window.Axelr.switchSidebarTab('active');
            st.activeSessionId = null;
            localStorage.removeItem('axelr_active_session');
        }

        if (!promptInput) {
            hideThinkingIndicator();
            st.isProcessing = false;
            return;
        }

        const command = promptInput.value.trim();
        st.lastUserCommand = command;
        if (!command && st.stagedFiles.length === 0 && !isRetry) {
            hideThinkingIndicator();
            st.isProcessing = false;
            return;
        }

        const originalBtnHtml = sendBtn ? sendBtn.innerHTML : '';

        // Abort-controller handshake (this doubles as the "stop" button).
        if (st.globalAbortController) {
            st.globalAbortController.abort();
            st.globalAbortController = null;
            if (sendBtn) {
                sendBtn.classList.remove('btn-stop-active');
                sendBtn.innerHTML = originalBtnHtml;
            }
            hideThinkingIndicator();
            st.isProcessing = false;
            return;
        }

        // ── ELITE AUTO-WORKSPACE ROUTING ────────────────────────────────
        const currentWs = getWorkspace();
        if (currentWs === 'core' && window.Axelr.detectWorkspaceFull) {
            try {
                const detectResult = await window.Axelr.detectWorkspaceFull(
                    command,
                    st.stagedFiles.length ? st.stagedFiles : null,
                    false
                );
                if (detectResult && detectResult.workspace && detectResult.workspace !== 'core'
                    && detectResult.confidence >= (window.Axelr.SWITCH_THRESHOLD || 0.65)) {
                    sessionStorage.setItem('axelr_ws_switched', '1');
                    if (window.Axelr.activateWorkspace) window.Axelr.activateWorkspace(detectResult.workspace);
                    const label = detectResult.workspace.charAt(0).toUpperCase() + detectResult.workspace.slice(1);
                    showToast(`Routed to ${label} workspace`, 'info');
                }
            } catch (err) {
                console.warn('[Axelr] Workspace detector error:', err);
            }
        }

        // ── SECURITY ────────────────────────────────────────────────────
        if (detectManipulationAttempt(command)) {
            st.manipulationCount++;
            sessionStorage.setItem('axelr_manipulation_count', st.manipulationCount);
            let level = 1;
            if (st.manipulationCount >= 3) {
                level = 2;
                st.manipulationLockUntil = Date.now() + 10 * 60 * 1000;
                sessionStorage.setItem('axelr_manipulation_lock', st.manipulationLockUntil);
            }
            const userBubble = document.createElement('div');
            userBubble.className = 'chat-bubble user-bubble';
            userBubble.innerHTML = DOMPurify.sanitize(marked.parse(command || " "));
            if (viewport) viewport.appendChild(userBubble);
            showSecurityAlert(level);
            promptInput.value = '';
            promptInput.style.height = 'auto';
            validateSendCommand();
            localStorage.removeItem(getDraftKey());
            hideThinkingIndicator();
            st.isProcessing = false;
            return;
        }

        const finalCommand = command;

        if (!isRetry) {
            promptInput.value = '';
            promptInput.style.height = 'auto';
            validateSendCommand();
        }
        if (sendBtn) sendBtn.disabled = true;

        // ── User bubble ─────────────────────────────────────────────────
        const userBubble = document.createElement('div');
        userBubble.className = 'chat-bubble user-bubble';
        let filesHtml = '';
        if (st.stagedFiles.length > 0) {
            filesHtml = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">' +
                st.stagedFiles.map(f =>
                    `<div class="file-chip"><span class="material-symbols-rounded" style="font-size:14px;">description</span> ${escapeHtmlEntities(f.name)}</div>`
                ).join('') + '</div>';
        }
        userBubble.innerHTML = `${filesHtml}${DOMPurify.sanitize(marked.parse(command || " "))}`;
        if (viewport) viewport.appendChild(userBubble);

        if (isRetry && viewport) {
            const allBubbles = viewport.querySelectorAll('.chat-bubble');
            if (allBubbles.length >= 2) {
                const lastBubble = allBubbles[allBubbles.length - 1];
                if (lastBubble.classList.contains('nexus-bubble')) lastBubble.remove();
            }
            st.hasRegenerated = true;
            if (st.regenerateTimer) {
                clearTimeout(st.regenerateTimer);
                st.regenerateTimer = null;
            }
        }

        const stagedFilesSnapshot = [...st.stagedFiles];
        let stagedFilesCleared = false;

        // ── Nexus bubble with reasoning chain ───────────────────────────
        const nexusBubble = document.createElement('div');
        nexusBubble.className = 'chat-bubble nexus-bubble';
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'ai-avatar-bubble';
        avatarDiv.innerHTML = AXELR_AVATAR_SVG;
        nexusBubble.appendChild(avatarDiv);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'bubble-content';
        contentDiv.style.flex = '1';
        nexusBubble.appendChild(contentDiv);
        if (viewport) viewport.appendChild(nexusBubble);

        if (window.Axelr.AxelrReasoning) {
            reasoningHandle = window.Axelr.AxelrReasoning.begin(contentDiv, command, getWorkspace());
        }
        scrollToBottom();

        const isGuest = st.isGuestMode && !localStorage.getItem('google_auth_token');
        const formData = new FormData();
        formData.append('command', finalCommand);
        formData.append('workspace', getWorkspace());
        formData.append('isRetry', isRetry ? 'true' : 'false');
        if (isGuest) {
            formData.append('isGuest', 'true');
            if (st.guestSessionId) formData.append('sessionId', st.guestSessionId);
        } else if (st.activeSessionId) {
            formData.append('sessionId', st.activeSessionId);
        }

        for (const file of stagedFilesSnapshot) {
            formData.append('files', file);
        }

        if (sendBtn) {
            sendBtn.classList.add('btn-stop-active');
            sendBtn.innerHTML = ICONS.stop;
        }

        st.globalAbortController = new AbortController();

        try {
            const endpoint = isGuest ? '/api/guest/extract' : '/api/extract_stream';
            const reqHeaders = {};
            if (!isGuest) {
                const token = await ensureValidToken();
                reqHeaders['Authorization'] = `Bearer ${token}`;
            }
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                body: formData,
                headers: reqHeaders,
                signal: st.globalAbortController.signal,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMsg = errorData.message || 'Pipeline failed.';
                if (!stagedFilesCleared) {
                    st.stagedFiles = [...stagedFilesSnapshot];
                    renderFileChips();
                }
                if (errorData.code === 'LIMIT_REACHED' || errorData.code === 'GUEST_LIMIT_REACHED') {
                    contentDiv.innerHTML = `⚠️ <strong>Daily Quota Exceeded.</strong><br><button onclick="openUpgradeModal()" style="background:var(--accent-glow-pro);color:#000;padding:8px 12px;border:none;border-radius:6px;cursor:pointer;font-weight:600;margin-top:10px;">Upgrade Workspace</button>`;
                } else {
                    contentDiv.innerHTML = `💥 Error: ${errorMsg}`;
                }
                scrollToBottom();
                hideThinkingIndicator();
                st.isProcessing = false;
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            // ── Guest branch (plain JSON) ────────────────────────────────
            if (isGuest) {
                let buf = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buf += decoder.decode(value, { stream: true });
                }
                let data = {};
                try { data = JSON.parse(buf); } catch (_) {}
                const textPart = data.text || data.response || '';
                if (textPart) {
                    contentDiv.innerHTML = DOMPurify.sanitize(marked.parse(textPart));
                    if (reasoningHandle) {
                        reasoningHandle.complete('streaming');
                        reasoningHandle = null;
                    }
                    if (data.sessionId) st.guestSessionId = data.sessionId;
                    if (st.stagedFiles.length && !stagedFilesCleared) {
                        st.stagedFiles = [];
                        renderFileChips();
                        stagedFilesCleared = true;
                    }
                } else if (data.error) {
                    contentDiv.innerHTML = `⚠️ ${data.error}`;
                }
                scrollToBottom();
                return;
            }

            // ── SSE stream branch ────────────────────────────────────────
            let streamBuffer = '';
            let renderedText = '';
            let fullResponse = '';
            let renderScheduled = false;
            let sessionIdFromStream = null;
            let structuredData = null;
            let filename = 'Export.csv';

            const flushRender = () => {
                renderScheduled = false;
                contentDiv.innerHTML = DOMPurify.sanitize(marked.parse(renderedText));
                scrollToBottom();
            };
            const scheduleRender = () => {
                if (renderScheduled) return;
                renderScheduled = true;
                requestAnimationFrame(flushRender);
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                streamBuffer += decoder.decode(value, { stream: true });

                const delimiter = '\n\n';
                let delimiterIndex;
                while ((delimiterIndex = streamBuffer.indexOf(delimiter)) !== -1) {
                    const event = streamBuffer.substring(0, delimiterIndex).trim();
                    streamBuffer = streamBuffer.substring(delimiterIndex + delimiter.length);
                    if (!event.startsWith('data: ')) continue;

                    try {
                        const json = JSON.parse(event.slice(6));
                        const textPart = json.text || json.delta || json.content || '';
                        if (textPart) {
                            if (reasoningHandle) {
                                reasoningHandle.complete('streaming');
                                reasoningHandle = null;
                            }
                            if (!stagedFilesCleared) {
                                st.stagedFiles = [];
                                renderFileChips();
                                stagedFilesCleared = true;
                            }
                            renderedText += textPart;
                            fullResponse += textPart;
                            scheduleRender();
                        } else if (json.watermark) {
                            contentDiv.innerHTML += json.watermark;
                        } else if (json.sessionId) {
                            sessionIdFromStream = json.sessionId;
                        } else if (json.structuredData) {
                            structuredData = json.structuredData;
                        } else if (json.filename) {
                            filename = json.filename;
                        } else if (json.error) {
                            contentDiv.innerHTML = `⚠️ ${json.error}`;
                        }
                    } catch (e) {
                        streamBuffer = event + delimiter + streamBuffer;
                        break;
                    }
                }
            }

            // Final residual packet flush.
            if (streamBuffer.trim().startsWith('data: ')) {
                try {
                    const json = JSON.parse(streamBuffer.trim().slice(6));
                    const textPart = json.text || json.delta || json.content || '';
                    if (textPart) { renderedText += textPart; fullResponse += textPart; }
                    if (json.sessionId) sessionIdFromStream = json.sessionId;
                    if (json.structuredData) structuredData = json.structuredData;
                    if (json.filename) filename = json.filename;
                    if (json.error) contentDiv.innerHTML = `⚠️ ${json.error}`;
                } catch (e) {
                    console.warn('Failed to parse final SSE buffer:', e);
                }
            }

            if (contentDiv) {
                contentDiv.innerHTML = DOMPurify.sanitize(marked.parse(fullResponse));
                const rawCode = extractHtmlCode(fullResponse);
                if (rawCode) {
                    const iframe = document.createElement('iframe');
                    iframe.sandbox = "allow-scripts allow-same-origin";
                    iframe.style.width = '100%';
                    iframe.style.height = '400px';
                    iframe.style.border = '1px solid var(--border-muted)';
                    iframe.style.borderRadius = '8px';
                    iframe.style.marginTop = '15px';
                    iframe.style.backgroundColor = '#ffffff';
                    contentDiv.appendChild(iframe);
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    iframeDoc.open();
                    const sanitizedCode = DOMPurify.sanitize(rawCode, {
                        ADD_TAGS: ['script', 'style'],
                        ADD_ATTR: ['src', 'href', 'onload']
                    });
                    iframeDoc.write(sanitizedCode);
                    iframeDoc.close();
                    injectDeployButton(contentDiv, rawCode);
                }
                appendPayloadDownload(contentDiv);
                const showRegen = !st.suppressRegenerateForNextResponse;
                st.suppressRegenerateForNextResponse = false;
                injectActionButtons(contentDiv, fullResponse, false, showRegen, new Date().toISOString(), st.activeSessionId || st.guestSessionId);
                if (getWorkspace() === 'data' && structuredData && structuredData.length > 0) {
                    if (window.Axelr.renderChart) window.Axelr.renderChart(contentDiv, structuredData);
                }
            }

            if (sessionIdFromStream) {
                if (!isGuest) {
                    st.activeSessionId = sessionIdFromStream;
                    localStorage.setItem('axelr_active_session', st.activeSessionId);
                    st.runningStructuredCache = structuredData;
                    st.runningFileTitle = filename;
                    await window.Axelr.loadArchiveLogs();
                } else {
                    st.guestSessionId = sessionIdFromStream;
                }
            }

            scrollToBottom();
            if (mainBackBtn) mainBackBtn.style.display = 'flex';

        } catch (error) {
            if (!stagedFilesCleared) {
                st.stagedFiles = stagedFilesSnapshot;
                renderFileChips();
            }
            if (error.name === 'AbortError') {
                contentDiv.innerHTML += `<br><br><em style="color:var(--text-muted);">[Generation halted by user]</em>`;
            } else {
                console.error('Execute error:', error);
                contentDiv.innerHTML = `⚠️ All AI services are temporarily overloaded. Please try again in a moment.`;
                if (viewport && viewport.querySelectorAll('.chat-bubble').length === 0 && heroDisplay) {
                    heroDisplay.style.display = 'none';
                    if (mainBackBtn) mainBackBtn.style.display = 'flex';
                }
            }
            scrollToBottom();
        } finally {
            st.globalAbortController = null;
            if (sendBtn) {
                sendBtn.classList.remove('btn-stop-active');
                sendBtn.innerHTML = originalBtnHtml;
                sendBtn.disabled = false;
            }
            validateSendCommand();
            updateViewportAfterRender();
            try { await window.Axelr.loadUserProfile(); } catch (_) {}
            hideThinkingIndicator();
            st.isProcessing = false;
            st.streamingBubble = null;
            st.streamingContentDiv = null;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 6 · ACTION BUTTONS
    // ═══════════════════════════════════════════════════════════════════
    function injectActionButtons(bubbleNode, rawText, isUserPrompt = false, showRegenerate = false, createdAt = null,
        sessionId = null, isLastUserMsg = false, isHistoryView = false) {
        const actionBar = document.createElement('div');
        actionBar.className = 'bubble-action-bar';

        if (isUserPrompt) {
            const copyBtn = document.createElement('button');
            copyBtn.className = 'action-icon-btn';
            copyBtn.title = "Copy Prompt";
            copyBtn.innerHTML = `${ICONS.copy} Copy`;
            copyBtn.onclick = () => handleActionClick('copy', rawText, copyBtn);
            actionBar.appendChild(copyBtn);

            if (isLastUserMsg && !isHistoryView) {
                const editBtn = document.createElement('button');
                editBtn.className = 'action-icon-btn';
                editBtn.title = "Edit & Retry";
                editBtn.innerHTML = `${ICONS.edit} Edit`;
                editBtn.onclick = () => {
                    if (promptInput) {
                        promptInput.value = rawText;
                        promptInput.style.height = 'auto';
                        promptInput.style.height = promptInput.scrollHeight + 'px';
                        promptInput.focus();
                        validateSendCommand();
                        setTimeout(async () => { executeCommand(false); }, 300);
                    }
                    editBtn.disabled = true;
                    editBtn.style.opacity = '0.5';
                    editBtn.title = "Edit used";
                };
                actionBar.appendChild(editBtn);
            }
        } else {
            const copyBtn = document.createElement('button');
            copyBtn.className = 'action-icon-btn';
            copyBtn.title = "Copy Response";
            copyBtn.innerHTML = `${ICONS.copy} Copy`;
            copyBtn.onclick = () => handleActionClick('copy', rawText, copyBtn);
            actionBar.appendChild(copyBtn);

            const likeBtn = document.createElement('button');
            likeBtn.className = 'action-icon-btn';
            likeBtn.title = "Helpful Response";
            likeBtn.innerHTML = ICONS.thumbsUp;
            likeBtn.onclick = function (e) {
                e.stopPropagation();
                this.style.color = 'var(--accent-glow)';
                this.style.transform = 'scale(1.2)';
                setTimeout(() => this.style.transform = 'scale(1)', 200);
                showToast('Thanks for the feedback!', 'success');
            };
            actionBar.appendChild(likeBtn);

            const dislikeBtn = document.createElement('button');
            dislikeBtn.className = 'action-icon-btn';
            dislikeBtn.title = "Not Helpful";
            dislikeBtn.innerHTML = ICONS.thumbsDown;
            dislikeBtn.onclick = function (e) {
                e.stopPropagation();
                this.style.color = '#ef4444';
                this.style.transform = 'scale(1.2)';
                setTimeout(() => this.style.transform = 'scale(1)', 200);
                showToast('We\'ll improve!', 'info');
            };
            actionBar.appendChild(dislikeBtn);

            if (showRegenerate && createdAt && sessionId && !isHistoryView) {
                const now = Date.now();
                const msgTime = new Date(createdAt).getTime();
                const elapsed = now - msgTime;
                const remaining = 30000 - elapsed;
                if (remaining > 0) {
                    const regenBtn = document.createElement('button');
                    regenBtn.className = 'action-icon-btn regen-active';
                    regenBtn.title = "Regenerate response";
                    regenBtn.innerHTML = `${ICONS.regenerate} Regenerate`;

                    const removeTimer = setTimeout(() => {
                        if (regenBtn.parentNode) regenBtn.remove();
                        if (st.regenerateTimer === removeTimer) st.regenerateTimer = null;
                    }, remaining);
                    st.regenerateTimer = removeTimer;

                    regenBtn.onclick = async function (e) {
                        e.stopPropagation();
                        if (st.activeSessionId !== sessionId) {
                            if (regenBtn.parentNode) regenBtn.remove();
                            return;
                        }
                        if (st.regenerateTimer) {
                            clearTimeout(st.regenerateTimer);
                            st.regenerateTimer = null;
                        }
                        st.suppressRegenerateForNextResponse = true;
                        const bubble = regenBtn.closest('.chat-bubble');
                        if (bubble && bubble.parentNode) bubble.remove();
                        if (st.lastUserCommand && promptInput) {
                            promptInput.value = st.lastUserCommand;
                            promptInput.style.height = 'auto';
                            promptInput.style.height = promptInput.scrollHeight + 'px';
                        }
                        await executeCommand(true);
                    };
                    actionBar.appendChild(regenBtn);
                }
            }

            if (!isUserPrompt && rawText && extractHtmlCode(rawText)) {
                const code = extractHtmlCode(rawText);

                const refactorBtn = document.createElement('button');
                refactorBtn.className = 'action-icon-btn';
                refactorBtn.title = "Refactor Code";
                refactorBtn.innerHTML = `<span class="material-symbols-rounded" style="font-size:16px;">auto_fix_high</span> Refactor`;
                refactorBtn.onclick = async () => {
                    const originalHtml = refactorBtn.innerHTML;
                    refactorBtn.innerHTML = 'Refactoring...';
                    refactorBtn.disabled = true;
                    try {
                        const resp = await apiFetch(`${API_BASE_URL}/api/refactor`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ code })
                        });
                        if (resp.ok) {
                            const data = await resp.json();
                            const iframe = bubbleNode.closest('.bubble-content')?.querySelector('iframe');
                            if (iframe) {
                                const doc = iframe.contentDocument || iframe.contentWindow.document;
                                doc.open(); doc.write(data.refactored_code); doc.close();
                            }
                            refactorBtn.innerHTML = '✅ Refactored';
                            setTimeout(() => { refactorBtn.innerHTML = originalHtml; refactorBtn.disabled = false; }, 2000);
                        } else {
                            alert('Refactor failed.');
                            refactorBtn.innerHTML = originalHtml;
                            refactorBtn.disabled = false;
                        }
                    } catch (e) {
                        alert('Error: ' + e.message);
                        refactorBtn.innerHTML = originalHtml;
                        refactorBtn.disabled = false;
                    }
                };
                actionBar.appendChild(refactorBtn);

                const explainBtn = document.createElement('button');
                explainBtn.className = 'action-icon-btn';
                explainBtn.title = "Explain Code";
                explainBtn.innerHTML = `<span class="material-symbols-rounded" style="font-size:16px;">psychology</span> Explain`;
                explainBtn.onclick = async () => {
                    const originalHtml = explainBtn.innerHTML;
                    explainBtn.innerHTML = 'Explaining...';
                    explainBtn.disabled = true;
                    try {
                        const resp = await apiFetch(`${API_BASE_URL}/api/explain-code`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ code })
                        });
                        if (resp.ok) {
                            const data = await resp.json();
                            const explanation = data.explanation || 'No explanation provided.';
                            const bubble = document.createElement('div');
                            bubble.className = 'chat-bubble nexus-bubble';
                            const a = document.createElement('div');
                            a.className = 'ai-avatar-bubble';
                            a.innerHTML = AXELR_AVATAR_SVG;
                            bubble.appendChild(a);
                            const cd = document.createElement('div');
                            cd.className = 'bubble-content';
                            cd.style.flex = '1';
                            cd.innerHTML = DOMPurify.sanitize(marked.parse(explanation));
                            bubble.appendChild(cd);
                            if (viewport) viewport.appendChild(bubble);
                            scrollToBottom();
                            explainBtn.innerHTML = '✅ Explained';
                        } else {
                            alert('Explain failed.');
                        }
                    } catch (e) {
                        alert('Error: ' + e.message);
                    }
                    setTimeout(() => { explainBtn.innerHTML = originalHtml; explainBtn.disabled = false; }, 2000);
                };
                actionBar.appendChild(explainBtn);

                const testsBtn = document.createElement('button');
                testsBtn.className = 'action-icon-btn';
                testsBtn.title = "Generate Tests";
                testsBtn.innerHTML = `<span class="material-symbols-rounded" style="font-size:16px;">fact_check</span> Tests`;
                testsBtn.onclick = async () => {
                    const originalHtml = testsBtn.innerHTML;
                    testsBtn.innerHTML = 'Generating...';
                    testsBtn.disabled = true;
                    try {
                        const resp = await apiFetch(`${API_BASE_URL}/api/generate-tests`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ code })
                        });
                        if (resp.ok) {
                            const data = await resp.json();
                            const tests = data.tests || 'No tests generated.';
                            const bubble = document.createElement('div');
                            bubble.className = 'chat-bubble nexus-bubble';
                            const a = document.createElement('div');
                            a.className = 'ai-avatar-bubble';
                            a.innerHTML = AXELR_AVATAR_SVG;
                            bubble.appendChild(a);
                            const cd = document.createElement('div');
                            cd.className = 'bubble-content';
                            cd.style.flex = '1';
                            cd.innerHTML = DOMPurify.sanitize(marked.parse('```javascript\n' + tests + '\n```'));
                            bubble.appendChild(cd);
                            if (viewport) viewport.appendChild(bubble);
                            scrollToBottom();
                            testsBtn.innerHTML = '✅ Tests Ready';
                        } else {
                            alert('Test generation failed.');
                        }
                    } catch (e) {
                        alert('Error: ' + e.message);
                    }
                    setTimeout(() => { testsBtn.innerHTML = originalHtml; testsBtn.disabled = false; }, 2000);
                };
                actionBar.appendChild(testsBtn);
            }
        }
        bubbleNode.appendChild(actionBar);
    }

    function handleActionClick(actionType, rawText, btnRef) {
        if (actionType === 'copy') {
            navigator.clipboard.writeText(rawText);
            const originalHtml = btnRef.innerHTML;
            btnRef.innerHTML = `✓ Copied`;
            setTimeout(() => btnRef.innerHTML = originalHtml, 2000);
        } else if (actionType === 'edit' && promptInput) {
            promptInput.value = rawText;
            promptInput.style.height = 'auto';
            promptInput.style.height = promptInput.scrollHeight + 'px';
            promptInput.focus();
            validateSendCommand();
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 7 · PAYLOAD DOWNLOAD / DEPLOY
    // ═══════════════════════════════════════════════════════════════════
    function appendPayloadDownload(bubbleNode) {
        if (st.runningStructuredCache && st.runningStructuredCache.length > 0) {
            const btn = document.createElement('button');
            btn.className = 'download-btn-bubble';
            btn.innerHTML = `<span class="material-symbols-rounded" style="font-size:18px;">download</span> Download CSV`;
            btn.onclick = executeDownloadPipeline;
            bubbleNode.appendChild(btn);
        }
    }

    function executeDownloadPipeline() {
        if (!st.runningStructuredCache) return;
        const keys = Object.keys(st.runningStructuredCache[0]);
        const csv = [
            keys.join(','),
            ...st.runningStructuredCache.map(row => keys.map(k =>
                `"${String(row[k] ?? '').replace(/"/g, '""')}"`
            ).join(',')).join('\n')
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = st.runningFileTitle;
        a.click();
    }

    function injectDeployButton(bubbleNode, rawHtml) {
        const deployContainer = document.createElement('div');
        deployContainer.style.marginTop = '15px';
        const deployBtn = document.createElement('button');
        deployBtn.className = 'download-btn-bubble';
        deployBtn.style.background = 'var(--accent-secondary)';
        deployBtn.innerHTML = `<span class="material-symbols-rounded" style="font-size:18px;">rocket_launch</span> Deploy Live`;
        const debugBtn = document.createElement('button');
        debugBtn.className = 'deploy-debug-btn';
        debugBtn.innerText = 'Debug';
        debugBtn.style.display = 'inline-block';
        const errorDetails = document.createElement('div');
        errorDetails.className = 'deploy-error-details';
        deployContainer.appendChild(deployBtn);
        deployContainer.appendChild(debugBtn);
        deployContainer.appendChild(errorDetails);
        bubbleNode.appendChild(deployContainer);

        debugBtn.onclick = async function () {
            const errorMsg = prompt("Paste the error message from the console or browser:");
            if (!errorMsg) return;
            debugBtn.innerText = 'Fixing...';
            debugBtn.disabled = true;
            try {
                const response = await apiFetch(`${API_BASE_URL}/api/touch_fix`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: rawHtml, error_message: errorMsg })
                });
                const result = await response.json();
                if (result.success) {
                    const iframe = bubbleNode.querySelector('iframe');
                    if (iframe) {
                        const doc = iframe.contentDocument || iframe.contentWindow.document;
                        doc.open(); doc.write(result.fixed_code); doc.close();
                    }
                    rawHtml = result.fixed_code;
                    debugBtn.innerText = 'Fixed!';
                    setTimeout(() => { debugBtn.innerText = 'Debug'; debugBtn.disabled = false; }, 2000);
                } else {
                    alert('Fix failed: ' + (result.message || 'Unknown error'));
                    debugBtn.innerText = 'Debug';
                    debugBtn.disabled = false;
                }
            } catch (e) {
                alert('Network error: ' + e.message);
                debugBtn.innerText = 'Debug';
                debugBtn.disabled = false;
            }
        };

        let retryCount = 0;
        const maxRetries = 5;
        let isDeploying = false;

        async function attemptDeploy() {
            if (isDeploying) return;
            isDeploying = true;
            deployBtn.innerText = 'Deploying...';
            deployBtn.disabled = true;
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);
                const response = await apiFetch(`${API_BASE_URL}/api/deploy`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ htmlContent: rawHtml }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                const result = await response.json();
                if (result.success) {
                    deployBtn.innerHTML = `<a href="${result.liveUrl}" target="_blank" style="color:#000;text-decoration:none;display:flex;align-items:center;gap:8px;"><span class="material-symbols-rounded" style="font-size:18px;">open_in_new</span> View Live Website</a>`;
                    deployBtn.style.background = '#3b82f6';
                    deployBtn.onclick = null;
                    deployBtn.disabled = false;
                    debugBtn.style.display = 'none';
                    isDeploying = false;
                } else {
                    throw new Error(result.message || 'Deployment failed');
                }
            } catch (err) {
                console.error('Deploy error:', err);
                retryCount++;
                if (retryCount <= maxRetries) {
                    const delay = Math.min(Math.pow(2, retryCount) * 500, 10000);
                    deployBtn.innerText = `Retrying (${retryCount}/${maxRetries})...`;
                    deployBtn.disabled = true;
                    setTimeout(() => {
                        isDeploying = false;
                        attemptDeploy();
                    }, delay);
                } else {
                    deployBtn.innerText = '⚠️ Deployment Failed';
                    deployBtn.style.background = '#ef4444';
                    deployBtn.disabled = false;
                    debugBtn.style.display = 'inline-block';
                    errorDetails.textContent = `Error: ${err.message || 'Unknown'}\nNetwork: ${navigator.onLine ? 'Online' : 'Offline'}`;
                    errorDetails.classList.add('show');
                    debugBtn.onclick = () => { errorDetails.classList.toggle('show'); };
                    const retryBtn = document.createElement('button');
                    retryBtn.className = 'deploy-retry-btn';
                    retryBtn.innerText = 'Retry Deployment';
                    retryBtn.onclick = () => {
                        retryCount = 0;
                        errorDetails.classList.remove('show');
                        deployBtn.style.background = 'var(--accent-secondary)';
                        deployBtn.innerText = 'Deploy Live';
                        deployBtn.disabled = false;
                        debugBtn.style.display = 'inline-block';
                        const oldRetry = deployContainer.querySelector('.deploy-retry-btn');
                        if (oldRetry) oldRetry.remove();
                        isDeploying = false;
                        attemptDeploy();
                    };
                    deployContainer.appendChild(retryBtn);
                    isDeploying = false;
                }
            }
        }
        deployBtn.onclick = attemptDeploy;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 8 · INLINE EDIT / SUMMARIZE
    // ═══════════════════════════════════════════════════════════════════
    function enableInlineEdit(bubbleContent, originalText, sessionId, msgId) {
        const existing = bubbleContent.querySelector('.inline-edit-area');
        if (existing) return;
        const contentDiv = bubbleContent.closest('.bubble-content');
        const currentHTML = contentDiv.innerHTML;
        const textarea = document.createElement('textarea');
        textarea.className = 'inline-edit-area';
        textarea.value = originalText;
        textarea.style.width = '100%';
        textarea.style.minHeight = '120px';
        textarea.style.background = 'var(--bg-input)';
        textarea.style.color = 'var(--text-main)';
        textarea.style.border = '1px solid var(--border-muted)';
        textarea.style.borderRadius = '6px';
        textarea.style.padding = '8px';
        textarea.style.fontFamily = 'inherit';
        textarea.style.fontSize = '14px';
        contentDiv.innerHTML = '';
        contentDiv.appendChild(textarea);
        const actions = document.createElement('div');
        actions.style.marginTop = '8px';
        actions.innerHTML = `
            <button class="action-icon-btn" style="background:var(--accent-glow);color:#000;border:none;padding:6px 12px;border-radius:4px;">Submit Refinement</button>
            <button class="action-icon-btn" style="margin-left:8px;">Cancel</button>
        `;
        contentDiv.appendChild(actions);
        const submitBtn = actions.querySelector('button:first-child');
        const cancelBtn = actions.querySelector('button:last-child');
        submitBtn.onclick = async function () {
            const newText = textarea.value.trim();
            if (!newText) return;
            this.disabled = true;
            this.innerText = 'Processing...';
            try {
                const resp = await apiFetch(`${API_BASE_URL}/api/refine-response`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, msgId, newText, originalText })
                });
                const data = await resp.json();
                if (data.success) {
                    const parent = contentDiv.parentNode;
                    const newBubble = document.createElement('div');
                    newBubble.className = 'chat-bubble nexus-bubble';
                    newBubble.innerHTML = `<div class="ai-avatar-bubble">${AXELR_AVATAR_SVG}</div><div class="bubble-content">${DOMPurify.sanitize(marked.parse(data.refined))}</div>`;
                    parent.replaceWith(newBubble);
                    const newContent = newBubble.querySelector('.bubble-content');
                    injectActionButtons(newContent, data.refined, false, false, null, sessionId, false, false);
                    scrollToBottom();
                } else {
                    showToast('Refinement failed: ' + (data.message || 'Unknown error'), 'error');
                    this.disabled = false;
                    this.innerText = 'Submit Refinement';
                }
            } catch (e) {
                showToast('Error: ' + e.message, 'error');
                this.disabled = false;
                this.innerText = 'Submit Refinement';
            }
        };
        cancelBtn.onclick = function () {
            contentDiv.innerHTML = currentHTML;
            if (sessionId) window.Axelr.viewPastLogById(sessionId);
            else location.reload();
        };
    }

    async function summarizeCurrentChat() {
        if (!st.activeSessionId) return alert('No active chat to summarize.');
        try {
            const resp = await apiFetch(`${API_BASE_URL}/api/summarize-chat?session_id=${st.activeSessionId}`, { method: 'POST' });
            const data = await resp.json();
            if (data.success) {
                const bubble = document.createElement('div');
                bubble.className = 'chat-bubble nexus-bubble';
                bubble.innerHTML = `<div class="bubble-content"><strong>📋 Summary</strong><br>${DOMPurify.sanitize(marked.parse(data.summary))}</div>`;
                viewport.appendChild(bubble);
                scrollToBottom();
            } else {
                showToast('Summary failed: ' + (data.message || 'Unknown error'), 'error');
            }
        } catch (e) {
            showToast('Error: ' + e.message, 'error');
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 9 · MARKED RENDERER
    // ═══════════════════════════════════════════════════════════════════
    (function installMarkedRenderer() {
        if (typeof marked === 'undefined' || !marked.Renderer) return;
        const renderer = new marked.Renderer();
        renderer.code = function (codeOrObj, languageMaybe) {
            let code, language;
            if (codeOrObj && typeof codeOrObj === 'object') {
                code = codeOrObj.text || '';
                language = codeOrObj.lang || '';
            } else {
                code = codeOrObj || '';
                language = languageMaybe || '';
            }
            code = String(code);

            const isRunnable = language === 'python' || language === 'javascript' || language === 'html';
            const runBtn = isRunnable
                ? `<button class="run-code-btn" onclick="executeCodeBlock(this, '${language}')">▶ Run</button>`
                : '';

            const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<pre>${runBtn}<button class="copy-code-btn" onclick="navigator.clipboard.writeText(this.nextElementSibling.innerText); this.innerText='Copied!'; setTimeout(()=>this.innerText='Copy Code', 2000)">Copy Code</button><code>${escaped}</code></pre>`;
        };
        try {
            marked.setOptions({ renderer, breaks: true });
        } catch (_) {
            marked.use({ renderer });
        }
    })();

    // ═══════════════════════════════════════════════════════════════════
    // 10 · PUBLISH
    // ═══════════════════════════════════════════════════════════════════
    Object.assign(window.Axelr, {
        renderFileChips, removeStagedFile, validateSendCommand,
        detectManipulationAttempt, showSecurityAlert, executeCommand,
        injectActionButtons, handleActionClick, appendPayloadDownload,
        executeDownloadPipeline, injectDeployButton, enableInlineEdit,
        summarizeCurrentChat, startThinkingAnimation,
    });
    Object.entries({
        renderFileChips, removeStagedFile, validateSendCommand,
        detectManipulationAttempt, showSecurityAlert, executeCommand,
        injectActionButtons, handleActionClick, appendPayloadDownload,
        executeDownloadPipeline, injectDeployButton, enableInlineEdit,
        summarizeCurrentChat, startThinkingAnimation,
    }).forEach(([k, v]) => { window[k] = v; });
})();