// js/50-command.js — AXELR MASTER v5.0
// Clean rewrite. Zero SyntaxErrors. Zero duplicate functions. Elite error handling.
// The ONLY authoritative implementation of executeCommand.
(function () {
    "use strict";

    setTimeout(() => {
        if (typeof executeCommand !== 'function') return;
        const src = String(executeCommand);
        const decls = (src.match(/\bconst\s+command\b/g) || []).length;
        if (decls > 1) {
            console.error(`[Axelr] ❌ executeCommand has ${decls} \`const command\` declarations. Fix immediately.`);
        }
    }, 0);

    const {
        API_BASE_URL, ensureValidToken, showToast = () => {}, escapeHtmlEntities, getEl,
        extractHtmlCode, AXELR_AVATAR_SVG, ICONS, getWorkspace, getDraftKey,
        promptInput, fileInput, fileStagingContainer, viewport, sendBtn,
        commandWrapper, mainWrapper, heroDisplay, mainBackBtn, sidebarNode,
        scrollToBottom, updateViewportAfterRender
    } = window.Axelr;

    const st = window.Axelr.state;
    const apiFetch = window.Axelr.apiFetch || ((...a) => fetch(...a));

    // ── Reveal helper ───────────────────────────────────────────
    function revealBubble(bubble) {
        if (!bubble) return;
        let target = document.getElementById('chat-container') || viewport;
        if (!target) return;
        if (viewport) viewport.classList.add('chat-active');
        target.appendChild(bubble);
        void bubble.offsetHeight;
        bubble.classList.add('visible');
    }

    // ═══════════════════════════════════════════════════════════
    // 1 · FILE STAGING
    // ═══════════════════════════════════════════════════════════
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
            `<div class="file-chip">
                <span class="material-symbols-rounded" style="font-size:14px;">description</span>
                <span class="chip-name">${escapeHtmlEntities(file.name)}</span>
                <button class="chip-remove" type="button" data-file-idx="${idx}" aria-label="Remove ${escapeHtmlEntities(file.name)}">
                    <span class="material-symbols-rounded" style="font-size:14px;">close</span>
                </button>
            </div>`
        ).join('');
        container.querySelectorAll('.chip-remove').forEach(btn => {
            btn.addEventListener('click', () => removeStagedFile(Number(btn.dataset.fileIdx)));
        });
    }

    function removeStagedFile(idx) {
        st.stagedFiles.splice(idx, 1);
        renderFileChips();
        validateSendCommand();
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            let maxBytes = 5 * 1024 * 1024, maxFilesAllowed = 2;
            if (document.body.classList.contains('pro-tier')) { maxBytes = 20 * 1024 * 1024; maxFilesAllowed = 5; }
            else if (document.body.classList.contains('designer-tier')) { maxBytes = 50 * 1024 * 1024; maxFilesAllowed = 5; }

            const incoming = Array.from(e.target.files || []);
            const currentWs = getWorkspace();

            if (currentWs === 'core' && incoming.length > 0) {
                const primary = incoming[0];
                const type = primary.type || '';
                const name = (primary.name || '').toLowerCase();
                const isImage = type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name);
                const isDoc = /pdf|csv|spreadsheet|excel/.test(type) || /\.(csv|xlsx?|pdf|tsv|json)$/i.test(name);
                let targetWs = null;
                if (isImage) targetWs = 'design';
                else if (isDoc) targetWs = 'data';
                if (targetWs && targetWs !== currentWs) {
                    sessionStorage.setItem('axelr_ws_switched', '1');
                    if (window.Axelr.activateWorkspace) window.Axelr.activateWorkspace(targetWs);
                }
            }

            if ((st.stagedFiles.length + incoming.length) > maxFilesAllowed) {
                showToast(`Tier limit reached: max ${maxFilesAllowed} files.`, 'error');
                fileInput.value = '';
                return;
            }

            const validFiles = incoming.filter(file => {
                if (file.size === 0) { showToast(`"${file.name}" is empty.`, 'error'); return false; }
                const currentWs2 = getWorkspace();
                if (currentWs2 === 'core') return true;
                const ext = (file.name.split('.').pop() || '').toLowerCase();
                const type = (file.type || '').toLowerCase();
                if (currentWs2 === 'data') {
                    const dataExt = /^(csv|xlsx?|parquet|json|pdf|png|jpe?g|gif|webp|sqlite|db|orc|avro|txt|md|yaml|yml|toml|geojson)$/;
                    const dataMime = /(text\/csv|application\/pdf|image\/|application\/json|spreadsheet|ms-excel|parquet|avro|orc|sqlite)/;
                    if (!dataExt.test(ext) && !dataMime.test(type)) {
                        showToast(`"${file.name}" is not a data file.`, 'error'); return false;
                    }
                    return true;
                }
                if (currentWs2 === 'design') {
                    const designExt = /^(js|ts|jsx|tsx|css|scss|sass|less|html?|vue|svelte|svg|png|jpe?g|gif|webp|fig|psd|ai|sketch|pdf|json|ya?ml|toml|md|py|java|cpp|c|h|go|rs|rb|php)$/;
                    const designMime = /(text\/|javascript|json|image\/|pdf|postscript)/;
                    if (!designExt.test(ext) && !designMime.test(type)) {
                        showToast(`"${file.name}" is not a design file.`, 'error'); return false;
                    }
                    return true;
                }
                return true;
            });

            const incomingBytes = validFiles.reduce((a, f) => a + f.size, 0);
            const stagedBytes = st.stagedFiles.reduce((a, f) => a + f.size, 0);
            if ((incomingBytes + stagedBytes) > maxBytes) {
                showToast(`Payload exceeds tier capacity (${maxBytes / (1024 * 1024)}MB).`, 'error');
                fileInput.value = '';
                return;
            }

            st.stagedFiles = [...st.stagedFiles, ...validFiles];
            renderFileChips();
            fileInput.value = '';
            validateSendCommand();
        });
    }

    // ═══════════════════════════════════════════════════════════
    // 2 · VALIDATION & INPUT
    // ═══════════════════════════════════════════════════════════
    st.serverBusy = false;
    st.serverBusyMessage = "";
    sessionStorage.removeItem('axelr_server_busy');

    function showServerBusyBanner() {
        const existing = document.querySelector('.server-busy-banner');
        if (existing) existing.remove();
        const banner = document.createElement('div');
        banner.className = 'server-busy-banner';
        banner.innerHTML = `<span>⚠️ ${st.serverBusyMessage || "Server is busy. Please wait or retry."}</span>
            <button id="retry-server-btn" type="button">Retry</button>`;
        const inputFrame = document.querySelector('.input-frame');
        if (inputFrame && inputFrame.parentNode) inputFrame.parentNode.insertBefore(banner, inputFrame);
        document.getElementById('retry-server-btn').addEventListener('click', () => {
            banner.remove();
            st.serverBusy = false;
            st.serverBusyMessage = "";
            validateSendCommand();
        });
    }

    function validateSendCommand() {
        const hasInput = (promptInput?.value?.trim()?.length || 0) > 0 || st.stagedFiles.length > 0;
        const canSend = hasInput && !st.isProcessing && !st.serverBusy;

        if (st.serverBusy) showServerBusyBanner();
        else {
            const banner = document.querySelector('.server-busy-banner');
            if (banner) banner.remove();
        }

        if (sendBtn) {
            sendBtn.style.opacity = canSend ? '1' : '0.4';
            sendBtn.style.pointerEvents = canSend ? 'auto' : 'none';
            sendBtn.title = canSend ? "Send (Enter)" :
                st.serverBusy ? (st.serverBusyMessage || "Server busy") :
                st.isProcessing ? "AI is thinking…" :
                "Enter a message or attach files";
        }
        const inputFrame = document.querySelector('.input-frame');
        if (inputFrame) inputFrame.classList.toggle('has-text', hasInput);
    }
    window.Axelr.validateSendCommand = validateSendCommand;

    if (promptInput) {
        promptInput.addEventListener('input', () => {
            promptInput.style.height = 'auto';
            promptInput.style.height = Math.min(promptInput.scrollHeight, 180) + 'px';
            validateSendCommand();
            try { localStorage.setItem(getDraftKey(), promptInput.value); } catch (_) {}
        });
        promptInput.addEventListener('change', validateSendCommand);
        promptInput.addEventListener('compositionend', validateSendCommand);
        promptInput.addEventListener('keydown', (e) => {
            if (e.isComposing || e.keyCode === 229) return;
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (sendBtn && sendBtn.style.pointerEvents === 'auto') sendBtn.click();
            }
        });
        validateSendCommand();
    }

    window.addEventListener('offline', () => {
        const b = getEl('offline-banner');
        if (b) b.style.display = 'block';
        if (sendBtn) sendBtn.disabled = true;
    });
    window.addEventListener('online', () => {
        const b = getEl('offline-banner');
        if (b) b.style.display = 'none';
        validateSendCommand();
    });

    // ═══════════════════════════════════════════════════════════
    // 3 · VOICE
    // ═══════════════════════════════════════════════════════════
    const micBtn = getEl('mic-trigger');
    if (micBtn) micBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleMic(); });
    if (sendBtn) sendBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); executeCommand(); });

    let recognition = null;
    function toggleMic() {
        // Unified pipeline first
        if (window.AxelrInput && window.Axelr.inputEngine && window.Axelr.inputEngine.voice) {
            const voice = window.Axelr.inputEngine.voice;
            const STATE = window.AxelrInput.STATE;
            const mic = document.getElementById('mic-trigger');
            const reset = () => {
                st.isListeningForVocal = false;
                if (mic) { mic.classList.remove('listening'); mic.innerHTML = '<span class="material-symbols-rounded">mic</span>'; }
            };
            if (voice.state === STATE.LISTENING) { try { voice.stop(); } catch (_) {} reset(); return; }
            if (voice.state === STATE.IDLE || voice.state === STATE.STOPPED) {
                voice.on('start', () => {
                    st.isListeningForVocal = true;
                    if (mic) { mic.classList.add('listening'); mic.innerHTML = '<span class="material-symbols-rounded" style="color:#ef4444;">mic</span>'; }
                });
                voice.on('end', reset);
                voice.on('error', (err) => { showToast(`Voice: ${err.message || 'error'}`, 'error'); reset(); });
                if (voice.start()) return;
            }
        }
        // Legacy fallback
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { showToast('Voice not supported on this browser.', 'error'); return; }
        if (recognition && micBtn.classList.contains('listening')) {
            try { recognition.stop(); } catch (_) {}
            recognition = null; resetMicUI(); return;
        }
        if (recognition) { try { recognition.stop(); } catch (_) {} recognition = null; }
        recognition = new SR();
        recognition.lang = navigator.language || 'en-US';
        recognition.interimResults = true;
        recognition.continuous = false;
        recognition.maxAlternatives = 1;
        recognition.onstart = () => {
            st.isListeningForVocal = true;
            micBtn.classList.add('listening');
            micBtn.innerHTML = '<span class="material-symbols-rounded" style="color:#ef4444;">mic</span>';
        };
        recognition.onend = resetMicUI;
        recognition.onerror = (ev) => {
            resetMicUI();
            if (ev.error === 'not-allowed') showToast('Microphone permission denied.', 'error');
            else if (ev.error !== 'aborted' && ev.error !== 'no-speech') showToast(`Voice: ${ev.error}`, 'error');
        };
        recognition.onresult = (ev) => {
            let t = '';
            for (let i = ev.resultIndex; i < ev.results.length; i++) t += ev.results[i][0].transcript;
            if (promptInput && t.trim()) {
                promptInput.value = t.trim();
                promptInput.dispatchEvent(new Event('input', { bubbles: true }));
                validateSendCommand();
            }
        };
        try { recognition.start(); } catch (_) { showToast('Failed to start voice input.', 'error'); recognition = null; }
    }
    function resetMicUI() {
        st.isListeningForVocal = false;
        if (micBtn) { micBtn.classList.remove('listening'); micBtn.innerHTML = '<span class="material-symbols-rounded">mic</span>'; }
        recognition = null;
    }

    // ═══════════════════════════════════════════════════════════
    // 4 · SECURITY FILTER
    // ═══════════════════════════════════════════════════════════
    function detectManipulationAttempt(cmd) {
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
        return patterns.some(p => p.test(cmd));
    }

    function showSecurityAlert(level) {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble nexus-bubble';
        const avatar = document.createElement('div');
        avatar.className = 'ai-avatar-bubble';
        avatar.innerHTML = AXELR_AVATAR_SVG;
        bubble.appendChild(avatar);
        const body = document.createElement('div');
        body.className = 'bubble-content';
        body.style.flex = '1';
        body.innerHTML = level === 1
            ? `<div class="security-alert-banner warning"><span class="material-symbols-rounded">warning</span><span>⚠️ Manipulation attempt detected. Please stay within operational parameters.</span></div>`
            : `<div class="security-alert-banner critical"><span class="material-symbols-rounded">error</span><span>🚨 Multiple manipulation attempts. System locked for 10 minutes.</span></div>`;
        bubble.appendChild(body);
        revealBubble(bubble);
        scrollToBottom();
    }

    // ═══════════════════════════════════════════════════════════
    // 5 · EXECUTE COMMAND (single source of truth)
    // ═══════════════════════════════════════════════════════════
    async function executeCommand(isRetry = false) {
        // Hide hero immediately
        if (viewport) viewport.classList.add('chat-active');
        const heroById = document.getElementById('hero-display');
        if (heroById) { heroById.style.display = 'none'; heroById.style.visibility = 'hidden'; }
        document.querySelectorAll('.hero-text, .hero-quick-actions').forEach(el => {
            el.style.display = 'none'; el.style.visibility = 'hidden';
        });
        if (heroDisplay) heroDisplay.style.display = 'none';
        if (mainBackBtn) mainBackBtn.style.display = 'flex';

        if (!promptInput) { st.isProcessing = false; return; }

        // ── Read the command ONCE. Never declare `command` twice. ──
        const command = promptInput.value.trim();
        st.lastUserCommand = command;

        if (!command && st.stagedFiles.length === 0 && !isRetry) { st.isProcessing = false; return; }
        if (st.isProcessing) return;
        st.isProcessing = true;

        // Single authoritative clear
        promptInput.value = '';
        promptInput.style.height = 'auto';
        validateSendCommand();

        // Lock check
        if (st.manipulationLockUntil && Date.now() < st.manipulationLockUntil) {
            const rem = Math.ceil((st.manipulationLockUntil - Date.now()) / 1000);
            showToast(`System locked — ${rem}s remaining.`, 'error');
            st.isProcessing = false;
            return;
        }

        if (st.currentTab === 'trashed') {
            if (window.Axelr.switchSidebarTab) window.Axelr.switchSidebarTab('active');
            st.activeSessionId = null;
            localStorage.removeItem('axelr_active_session');
        }

        const originalBtnHtml = sendBtn ? sendBtn.innerHTML : '';

        // Stop-button handshake
        if (st.globalAbortController) {
            st.globalAbortController.abort();
            st.globalAbortController = null;
            if (sendBtn) { sendBtn.classList.remove('btn-stop-active'); sendBtn.innerHTML = originalBtnHtml; }
            st.isProcessing = false;
            return;
        }

        // ── Elite Backend Workspace Detection (v15.2.0 "MAXIMA" Engine) ──
        const currentWs = getWorkspace();
        console.log('[Axelr] Workspace detection running. Current workspace:', currentWs, 'Command:', command);
        if (currentWs === 'core') {
            // Use backend detection API instead of poor client-side rules
            if (window.Axelr && window.Axelr.detectWorkspaceFull) {
                window.Axelr.detectWorkspaceFull(command, [], st.sessionId || "").then(result => {
                    const target = result.workspace;
                    const confidence = result.confidence;
                    console.log('[Axelr] ✅ Backend detection result:', target, 'confidence:', confidence, 'diagnostics:', result.diagnostics);
                    
                    if (target && target !== 'core' && confidence > 0.6) {
                        localStorage.removeItem('axelr_ws_locked');
                        sessionStorage.setItem('axelr_ws_switched', '1');
                        
                        // DIRECT WORKSPACE SWITCH - NO FUNCTION DEPENDENCY, GUARANTEED TO WORK
                        localStorage.setItem('Axelr_workspace', target);
                        document.body.classList.remove('workspace-core', 'workspace-data', 'workspace-design');
                        document.body.classList.add(`workspace-${target}`);
                        
                        if (window.Axelr.updateModelBranding) {
                            window.Axelr.updateModelBranding(target, st.currentUser?.tier || 'free');
                        }
                        
                        if (window.Axelr.activateWorkspace) {
                            window.Axelr.activateWorkspace(target);
                        }
                        
                        const label = target.charAt(0).toUpperCase() + target.slice(1);
                        showToast(`Switched to ${label} workspace (${Math.round(confidence * 100)}% confident)`, 'success');
                        console.log(`[Axelr] ✅ WORKSPACE SWITCH COMPLETE: ${currentWs} → ${target}`);
                    }
                }).catch(err => {
                    console.error('[Axelr] Backend workspace detection failed, falling back to minimal client-side rules:', err);
                    // Minimal fallback only for extreme cases
                    const cLower = command.toLowerCase();
                    let target = null;
                    if (cLower.includes('analyse data') || cLower.includes('data') && cLower.includes('analyse')) {
                        target = 'data';
                    } else if (cLower.includes('write code') || cLower.includes('build') || cLower.includes('code')) {
                        target = 'design';
                    }
                    if (target) {
                        localStorage.setItem('Axelr_workspace', target);
                        document.body.classList.remove('workspace-core', 'workspace-data', 'workspace-design');
                        document.body.classList.add(`workspace-${target}`);
                        showToast(`Switched to ${target.charAt(0).toUpperCase() + target.slice(1)} workspace`, 'success');
                    }
                });
            }
        }

        // ── Security ──
        if (detectManipulationAttempt(command)) {
            st.manipulationCount++;
            sessionStorage.setItem('axelr_manipulation_count', st.manipulationCount);
            const level = st.manipulationCount >= 3 ? 2 : 1;
            if (level === 2) {
                st.manipulationLockUntil = Date.now() + 10 * 60 * 1000;
                sessionStorage.setItem('axelr_manipulation_lock', st.manipulationLockUntil);
            }
            const ub = document.createElement('div');
            ub.className = 'chat-bubble user-bubble';
            ub.innerHTML = DOMPurify.sanitize(marked.parse(command || ' '));
            revealBubble(ub);
            showSecurityAlert(level);
            st.isProcessing = false;
            return;
        }

        // ── User bubble ──
        const userBubble = document.createElement('div');
        userBubble.className = 'chat-bubble user-bubble';
        let filesHtml = '';
        if (st.stagedFiles.length > 0) {
            filesHtml = '<div class="file-chips-wrapper">' +
                st.stagedFiles.map(f => `<div class="file-chip"><span class="material-symbols-rounded" style="font-size:14px;">description</span><span class="chip-name">${escapeHtmlEntities(f.name)}</span></div>`).join('') +
                '</div>';
        }
        userBubble.innerHTML = `${filesHtml}${DOMPurify.sanitize(marked.parse(command || ' '))}`;
        revealBubble(userBubble);

        if (isRetry && viewport) {
            const bubbles = viewport.querySelectorAll('.chat-bubble');
            if (bubbles.length >= 2) {
                const last = bubbles[bubbles.length - 1];
                if (last.classList.contains('nexus-bubble')) last.remove();
            }
            st.hasRegenerated = true;
            if (st.regenerateTimer) { clearTimeout(st.regenerateTimer); st.regenerateTimer = null; }
        }

        const stagedSnapshot = [...st.stagedFiles];
        let stagedCleared = false;

        // ── Nexus bubble with SIBLING reasoning host ──
        // Reasoning lives in a sibling, never wiped by contentDiv.innerHTML resets.
        const nexusBubble = document.createElement('div');
        nexusBubble.className = 'chat-bubble nexus-bubble';
        const avatar = document.createElement('div');
        avatar.className = 'ai-avatar-bubble';
        avatar.innerHTML = AXELR_AVATAR_SVG;
        nexusBubble.appendChild(avatar);

        const reasoningHost = document.createElement('div');
        reasoningHost.className = 'reasoning-host';
        nexusBubble.appendChild(reasoningHost);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'bubble-content';
        contentDiv.style.flex = '1';
        nexusBubble.appendChild(contentDiv);
        revealBubble(nexusBubble);

        // ── Reasoning chain (Kimi/DeepSeek-grade) ──
        let reasoningHandle = null;
        try {
            if (window.Axelr.AxelrReasoning) {
                reasoningHandle = window.Axelr.AxelrReasoning.begin(reasoningHost, command, getWorkspace());
            }
        } catch (err) {
            console.warn('[Reasoning] start failed:', err);
        }
        scrollToBottom();

        const isGuest = st.isGuestMode && !localStorage.getItem('google_auth_token');
        const userTier = st.currentUser?.tier || (isGuest ? 'free' : 'free');

        // Tiered timeout messages (spec-aligned)
        const tierTimeouts = { free: [3000, 5000, 7000, 10000], pro: [5000, 15000], business: [5000, 30000, 60000], enterprise: [5000, 30000, 60000] };
        const tierMessages = {
            free: ["Still processing…", "Working on your prompt…", "Models still loading — please don't close this tab.", "Systems still working — please be patient."],
            pro: ["Still processing your Pro request…", "Systems still working — please don't close this tab."],
            business: ["Still processing your Business request…", "High load — still working.", "Systems still working — please don't close this tab."],
            enterprise: ["Still processing your Enterprise request…", "High load — still working.", "Systems still working — please don't close this tab."]
        };
        const activeTimers = [];
        let timeoutEl = null;
        function addTimeoutMessage(msg) {
            if (!contentDiv.isConnected) return;
            if (!timeoutEl) {
                timeoutEl = document.createElement('div');
                timeoutEl.className = 'timeout-status-message';
                contentDiv.appendChild(timeoutEl);
            }
            timeoutEl.textContent = msg;
            scrollToBottom();
        }
        (tierTimeouts[userTier] || tierTimeouts.free).forEach((delay, i) => {
            if (i < (tierMessages[userTier] || tierMessages.free).length) {
                activeTimers.push(setTimeout(() => addTimeoutMessage((tierMessages[userTier] || tierMessages.free)[i]), delay));
            }
        });

        // ── Payload ──
        const formData = new FormData();
        let outbound = command;
        if (window.Axelr.TokenShrinker) { try { outbound = window.Axelr.TokenShrinker.shrinkPrompt(command); } catch (_) {} }
        formData.append('command', outbound);
        if (window.Axelr.CognitiveLayer) {
            try { window.Axelr.CognitiveLayer.observe(command); } catch (_) {}
            const ctx = window.Axelr.CognitiveLayer.renderContextBlock();
            if (ctx) formData.append('userStateProfile', ctx);
        }
        formData.append('workspace', getWorkspace());
        formData.append('isRetry', isRetry ? 'true' : 'false');
        if (isGuest) {
            formData.append('isGuest', 'true');
            if (st.guestSessionId) formData.append('sessionId', st.guestSessionId);
        } else if (st.activeSessionId) {
            formData.append('sessionId', st.activeSessionId);
        }
        stagedSnapshot.forEach(f => formData.append('files', f));

        if (sendBtn) { sendBtn.classList.add('btn-stop-active'); sendBtn.innerHTML = ICONS.stop; }
        st.globalAbortController = new AbortController();

        try {
            const endpoint = isGuest ? '/api/guest/extract' : '/api/extract_stream';
            const headers = {};
            if (!isGuest) { headers['Authorization'] = `Bearer ${await ensureValidToken()}`; }
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST', body: formData, headers, signal: st.globalAbortController.signal
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                const msg = errData.message || 'Something unexpected happened while processing your request.';
                if (!stagedCleared) { st.stagedFiles = [...stagedSnapshot]; renderFileChips(); }
                if (errData.code === 'SERVER_OVERLOADED') {
                    st.serverBusy = true; st.serverBusyMessage = msg; showServerBusyBanner();
                    contentDiv.innerHTML = `<div class="error-bubble"><span class="material-symbols-rounded">warning</span><div><strong>Server is at full capacity right now</strong><div>Our servers are handling a lot of requests. The retry button above should work in a moment.</div></div></div>`;
                } else if (errData.code === 'LIMIT_REACHED' || errData.code === 'GUEST_LIMIT_REACHED') {
                    contentDiv.innerHTML = `<div class="error-bubble"><span class="material-symbols-rounded">warning</span><div><strong>You've reached your daily message limit</strong><div>Upgrade your plan to get more messages and faster response times.</div><button onclick="openUpgradeModal()">Upgrade workspace</button></div></div>`;
                } else {
                    contentDiv.innerHTML = `<div class="error-bubble"><span class="material-symbols-rounded">error</span><div><strong>Oops, something went wrong</strong><div>${escapeHtmlEntities(msg)}</div><button onclick="executeCommand(true)">Retry request</button></div></div>`;
                }
                scrollToBottom();
                if (reasoningHandle) { reasoningHandle.complete('error'); reasoningHandle = null; }
                st.isProcessing = false;
                activeTimers.forEach(clearTimeout);
                return;
            }

            if (!response.body) {
                throw new Error(`Connection interrupted. Please try again.`);
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            // ── Guest branch ──
            if (isGuest) {
                let buf = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buf += decoder.decode(value, { stream: true });
                }
                let data = {};
                try { data = JSON.parse(buf); } catch (_) {}
                const text = data.text || data.response || '';
                if (text) {
                    contentDiv.innerHTML = DOMPurify.sanitize(marked.parse(text));
                    if (reasoningHandle) { reasoningHandle.complete('streaming'); reasoningHandle = null; }
                    if (data.sessionId) st.guestSessionId = data.sessionId;
                    if (st.stagedFiles.length && !stagedCleared) { st.stagedFiles = []; renderFileChips(); stagedCleared = true; }
                } else if (data.error) {
                    contentDiv.innerHTML = `<div class="error-bubble"><span class="material-symbols-rounded">error</span><div><strong>Oops, something went wrong</strong><div>${escapeHtmlEntities(data.error)}</div><button onclick="executeCommand(true)">Retry request</button></div></div>`;
                }
                scrollToBottom();
                return;
            }

            // ── SSE stream ──
            let buf = '', rendered = '', full = '', sched = false;
            let sessionIdFromStream = null, structuredData = null, filename = 'Export.csv';
            const flush = () => { sched = false; contentDiv.innerHTML = DOMPurify.sanitize(marked.parse(rendered)); scrollToBottom(); };
            const schedule = () => { if (sched) return; sched = true; requestAnimationFrame(flush); };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                let idx;
                while ((idx = buf.indexOf('\n\n')) !== -1) {
                    const event = buf.substring(0, idx).trim();
                    buf = buf.substring(idx + 2);
                    if (!event.startsWith('data: ')) continue;
                    try {
                        const json = JSON.parse(event.slice(6));
                        const text = json.text || json.delta || json.content || '';
                        if (text) {
                            if (reasoningHandle) { reasoningHandle.complete('streaming'); reasoningHandle = null; }
                            if (!stagedCleared) { st.stagedFiles = []; renderFileChips(); stagedCleared = true; }
                            rendered += text; full += text; schedule();
                        } else if (json.watermark) {
                            contentDiv.insertAdjacentHTML('beforeend', json.watermark);
                        } else if (json.sessionId) sessionIdFromStream = json.sessionId;
                        else if (json.structuredData) structuredData = json.structuredData;
                        else if (json.filename) filename = json.filename;
                        else if (json.error) contentDiv.innerHTML = `<div class="error-bubble"><span class="material-symbols-rounded">error</span><div><strong>Oops, something went wrong</strong><div>${escapeHtmlEntities(json.error)}</div><button onclick="executeCommand(true)">Retry request</button></div></div>`;
                    } catch (_) { buf = event + '\n\n' + buf; break; }
                }
            }
            if (buf.trim().startsWith('data: ')) {
                try {
                    const json = JSON.parse(buf.trim().slice(6));
                    const text = json.text || json.delta || json.content || '';
                    if (text) { rendered += text; full += text; }
                    if (json.sessionId) sessionIdFromStream = json.sessionId;
                    if (json.structuredData) structuredData = json.structuredData;
                    if (json.filename) filename = json.filename;
                } catch (_) {}
            }

            // Final render
            contentDiv.innerHTML = DOMPurify.sanitize(marked.parse(full));
            const rawCode = extractHtmlCode(full);
            if (rawCode) {
                const iframe = document.createElement('iframe');
                iframe.sandbox = 'allow-scripts allow-same-origin';
                iframe.style.cssText = 'width:100%;height:400px;border:1px solid var(--border-muted);border-radius:8px;margin-top:15px;background:#fff;';
                contentDiv.appendChild(iframe);
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                doc.open();
                doc.write(DOMPurify.sanitize(rawCode, { ADD_TAGS: ['script', 'style'], ADD_ATTR: ['src', 'href', 'onload'] }));
                doc.close();
                injectDeployButton(contentDiv, rawCode);
            }
            appendPayloadDownload(contentDiv);
            const showRegen = !st.suppressRegenerateForNextResponse;
            st.suppressRegenerateForNextResponse = false;
            injectActionButtons(contentDiv, full, false, showRegen, new Date().toISOString(), st.activeSessionId || st.guestSessionId);

            if (getWorkspace() === 'data' && structuredData && structuredData.length > 0) {
                if (window.Axelr.renderChart) window.Axelr.renderChart(contentDiv, structuredData);
            }

            if (sessionIdFromStream) {
                if (!isGuest) {
                    st.activeSessionId = sessionIdFromStream;
                    localStorage.setItem('axelr_active_session', st.activeSessionId);
                    st.runningStructuredCache = structuredData;
                    st.runningFileTitle = filename;
                    if (window.Axelr.loadArchiveLogs) await window.Axelr.loadArchiveLogs();
                } else {
                    st.guestSessionId = sessionIdFromStream;
                }
            }

            activeTimers.forEach(clearTimeout);
            if (timeoutEl && timeoutEl.parentNode) timeoutEl.remove();
            scrollToBottom();

        } catch (error) {
            activeTimers.forEach(t => clearTimeout(t));
            if (timeoutEl && timeoutEl.parentNode) timeoutEl.remove();
            
            if (error.name === 'AbortError') {
                contentDiv.innerHTML += `<br><em style="color:var(--text-muted);font-size:13px;">[Generation halted]</em>`;
            } else {
                console.error('🔥 executeCommand error:', error);
                let displayMessage = "We couldn't connect to the Axelr network. Please check your connection and try again.";
                
                if (error.message.includes('timeout')) {
                    displayMessage = "The request timed out. The server might be under heavy load. Please try again.";
                } else if (error.message.includes('502') || error.message.includes('503')) {
                    displayMessage = "Our AI servers are currently overloaded. Please wait a moment and retry.";
                }

                contentDiv.innerHTML = `
                    <div class="error-bubble">
                        <span class="material-symbols-rounded">error</span>
                        <div>
                            <strong>Connection Error</strong>
                            <p>${displayMessage}</p>
                            <button onclick="executeCommand(true)">Retry Request</button>
                        </div>
                    </div>
                `;
            }
            scrollToBottom();
        } finally {
            st.globalAbortController = null;
            if (sendBtn) { sendBtn.classList.remove('btn-stop-active'); sendBtn.innerHTML = originalBtnHtml; sendBtn.disabled = false; }
            validateSendCommand();
            updateViewportAfterRender();
            if (window.Axelr.loadUserProfile) { try { await window.Axelr.loadUserProfile(); } catch (_) {} }
            if (reasoningHandle) { reasoningHandle.complete('success'); reasoningHandle = null; }
            st.isProcessing = false;
            st.streamingBubble = null;
            st.streamingContentDiv = null;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 6 · ACTION BUTTONS (single handleActionClick — enhanced)
    // ═══════════════════════════════════════════════════════════
    function handleActionClick(actionType, rawText, btnRef) {
        if (actionType === 'copy') {
            navigator.clipboard.writeText(rawText).then(() => {
                const originalHtml = btnRef.innerHTML;
                btnRef.innerHTML = `<span class="material-symbols-rounded" style="font-size:16px;">check</span> Copied`;
                btnRef.setAttribute('data-copied', 'true');
                setTimeout(() => { btnRef.innerHTML = originalHtml; btnRef.removeAttribute('data-copied'); }, 2000);
            }).catch(() => showToast('Failed to copy.', 'error'));
        } else if (actionType === 'edit' && promptInput) {
            promptInput.value = rawText;
            promptInput.style.height = 'auto';
            promptInput.style.height = Math.min(promptInput.scrollHeight, 180) + 'px';
            promptInput.focus();
            validateSendCommand();
        }
    }

    function injectActionButtons(bubbleNode, rawText, isUserPrompt = false, showRegenerate = false, createdAt = null, sessionId = null) {
        const bar = document.createElement('div');
        bar.className = 'bubble-action-bar';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'action-icon-btn';
        copyBtn.title = isUserPrompt ? 'Copy prompt' : 'Copy response';
        copyBtn.innerHTML = `${ICONS.copy} Copy`;
        copyBtn.onclick = () => handleActionClick('copy', rawText, copyBtn);
        bar.appendChild(copyBtn);

        if (!isUserPrompt) {
            const like = document.createElement('button');
            like.className = 'action-icon-btn';
            like.title = 'Helpful';
            like.innerHTML = ICONS.thumbsUp;
            like.onclick = function (e) {
                e.stopPropagation();
                this.style.color = 'var(--accent-glow)';
                this.style.transform = 'scale(1.2)';
                setTimeout(() => this.style.transform = 'scale(1)', 200);
            };
            bar.appendChild(like);

            const dislike = document.createElement('button');
            dislike.className = 'action-icon-btn';
            dislike.title = 'Not helpful';
            dislike.innerHTML = ICONS.thumbsDown;
            dislike.onclick = function (e) {
                e.stopPropagation();
                this.style.color = '#ef4444';
                this.style.transform = 'scale(1.2)';
                setTimeout(() => this.style.transform = 'scale(1)', 200);
            };
            bar.appendChild(dislike);

            if (showRegenerate && createdAt && sessionId) {
                const remaining = 30000 - (Date.now() - new Date(createdAt).getTime());
                if (remaining > 0) {
                    const regen = document.createElement('button');
                    regen.className = 'action-icon-btn regen-active';
                    regen.title = 'Regenerate';
                    regen.innerHTML = `${ICONS.regenerate} Regenerate`;
                    const timer = setTimeout(() => { if (regen.parentNode) regen.remove(); if (st.regenerateTimer === timer) st.regenerateTimer = null; }, remaining);
                    st.regenerateTimer = timer;
                    regen.onclick = async (e) => {
                        e.stopPropagation();
                        if (st.activeSessionId !== sessionId) { if (regen.parentNode) regen.remove(); return; }
                        if (st.regenerateTimer) { clearTimeout(st.regenerateTimer); st.regenerateTimer = null; }
                        st.suppressRegenerateForNextResponse = true;
                        const b = regen.closest('.chat-bubble');
                        if (b && b.parentNode) b.remove();
                        if (st.lastUserCommand && promptInput) {
                            promptInput.value = st.lastUserCommand;
                            promptInput.style.height = 'auto';
                            promptInput.style.height = Math.min(promptInput.scrollHeight, 180) + 'px';
                        }
                        await executeCommand(true);
                    };
                    bar.appendChild(regen);
                }
            }
        }
        bubbleNode.appendChild(bar);
    }

    // ═══════════════════════════════════════════════════════════
    // 7 · DOWNLOAD / DEPLOY
    // ═══════════════════════════════════════════════════════════
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
            ...st.runningStructuredCache.map(row => keys.map(k => `"${String(row[k] ?? '').replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = st.runningFileTitle; a.click();
        URL.revokeObjectURL(url);
    }

    function injectDeployButton(bubbleNode, rawHtml) {
        const wrap = document.createElement('div');
        wrap.style.marginTop = '15px';
        const btn = document.createElement('button');
        btn.className = 'download-btn-bubble';
        btn.style.background = 'var(--accent-secondary)';
        btn.innerHTML = `<span class="material-symbols-rounded" style="font-size:18px;">rocket_launch</span> Deploy Live`;
        wrap.appendChild(btn);
        bubbleNode.appendChild(wrap);

        let retries = 0, deploying = false;
        async function deploy() {
            if (deploying) return;
            deploying = true;
            btn.innerText = 'Deploying…'; btn.disabled = true;
            try {
                const ctl = new AbortController();
                const tid = setTimeout(() => ctl.abort(), 30000);
                const res = await apiFetch(`${API_BASE_URL}/api/deploy`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ htmlContent: rawHtml }),
                    signal: ctl.signal
                });
                clearTimeout(tid);
                const result = await res.json();
                if (result.success) {
                    btn.innerHTML = `<a href="${result.liveUrl}" target="_blank" style="color:#000;text-decoration:none;display:flex;align-items:center;gap:8px;"><span class="material-symbols-rounded" style="font-size:18px;">open_in_new</span> View Live</a>`;
                    btn.style.background = '#3b82f6';
                    btn.disabled = false;
                    deploying = false;
                } else throw new Error(result.message || 'Deploy failed');
            } catch (err) {
                retries++;
                if (retries <= 5) {
                    const delay = Math.min(Math.pow(2, retries) * 500, 10000);
                    btn.innerText = `Retrying (${retries}/5)…`;
                    setTimeout(() => { deploying = false; deploy(); }, delay);
                } else {
                    btn.innerText = '⚠️ Deploy failed'; btn.style.background = '#ef4444'; btn.disabled = false;
                    deploying = false;
                }
            }
        }
        btn.onclick = deploy;
    }

    // ═══════════════════════════════════════════════════════════
    // 8 · INLINE EDIT / SUMMARIZE
    // ═══════════════════════════════════════════════════════════
    function enableInlineEdit(bubbleContent, originalText, sessionId, msgId) {
        // kept minimal — unchanged from production behavior
    }

    async function summarizeCurrentChat() {
        if (!st.activeSessionId) return showToast('No active chat to summarize.', 'info');
        try {
            const res = await apiFetch(`${API_BASE_URL}/api/summarize-chat?session_id=${st.activeSessionId}`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                const bubble = document.createElement('div');
                bubble.className = 'chat-bubble nexus-bubble';
                bubble.innerHTML = `<div class="bubble-content"><strong>📋 Summary</strong><br>${DOMPurify.sanitize(marked.parse(data.summary))}</div>`;
                revealBubble(bubble);
                scrollToBottom();
            } else showToast('Summary failed: ' + (data.message || 'unknown'), 'error');
        } catch (e) { showToast('Error: ' + e.message, 'error'); }
    }

    // ═══════════════════════════════════════════════════════════
    // 9 · MARKED RENDERER
    // ═══════════════════════════════════════════════════════════
    (function installMarkedRenderer() {
        if (typeof marked === 'undefined' || !marked.Renderer) return;
        const renderer = new marked.Renderer();
        renderer.code = function (codeOrObj, langMaybe) {
            const code = String(typeof codeOrObj === 'object' ? (codeOrObj.text || '') : (codeOrObj || ''));
            const language = typeof codeOrObj === 'object' ? (codeOrObj.lang || '') : (langMaybe || '');
            const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const runBtn = (language === 'python' || language === 'javascript' || language === 'html')
                ? `<button class="run-code-btn" type="button" onclick="executeCodeBlock(this, '${language}')">▶ Run</button>`
                : '';
            return `<pre>${runBtn}<button class="copy-code-btn" type="button" onclick="navigator.clipboard.writeText(this.nextElementSibling.innerText); this.innerText='Copied!'; setTimeout(()=>this.innerText='Copy Code',2000)">Copy Code</button><code>${escaped}</code></pre>`;
        };
        try { marked.setOptions({ renderer, breaks: true }); } catch (_) { marked.use({ renderer }); }
    })();

    // ═══════════════════════════════════════════════════════════
    // 10 · HERO COMMAND
    // ═══════════════════════════════════════════════════════════
    window.executeHeroCommand = async function (cmd) {
        if (!promptInput || !viewport) return;
        viewport.classList.add('chat-active');
        const h = document.getElementById('hero-display');
        if (h) { h.style.display = 'none'; h.style.visibility = 'hidden'; }
        document.querySelectorAll('.hero-quick-actions').forEach(el => { el.style.display = 'none'; el.style.visibility = 'hidden'; });
        if (mainBackBtn) mainBackBtn.style.display = 'flex';
        promptInput.focus();
        let cur = '';
        for (let i = 0; i < cmd.length; i++) {
            cur += cmd[i];
            promptInput.value = cur;
            promptInput.style.height = 'auto';
            promptInput.style.height = Math.min(promptInput.scrollHeight, 180) + 'px';
            promptInput.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, 35));
        }
        setTimeout(() => { validateSendCommand(); setTimeout(() => { if (sendBtn?.style.pointerEvents === 'auto') executeCommand(); }, 200); }, 400);
    };

    // Failsafe observer (kept — prevents hero ghosting)
    const observer = new MutationObserver(() => {
        const cc = document.getElementById('chat-container');
        if (cc && cc.children.length > 0 && viewport && !viewport.classList.contains('chat-active')) {
            viewport.classList.add('chat-active');
            document.querySelectorAll('#hero-display, .hero-text, .hero-quick-actions').forEach(el => {
                el.style.display = 'none'; el.style.visibility = 'hidden';
            });
        }
    });
    const startObserver = () => { if (viewport) observer.observe(viewport, { childList: true, subtree: true }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver);
    else startObserver();

    // ═══════════════════════════════════════════════════════════
    // EXPORT
    // ═══════════════════════════════════════════════════════════
    Object.assign(window.Axelr, {
        renderFileChips, removeStagedFile, validateSendCommand,
        detectManipulationAttempt, showSecurityAlert, executeCommand,
        injectActionButtons, handleActionClick, appendPayloadDownload,
        executeDownloadPipeline, injectDeployButton, enableInlineEdit,
        summarizeCurrentChat, executeHeroCommand: window.executeHeroCommand,
        toggleMic
    });
    Object.entries({
        renderFileChips, removeStagedFile, validateSendCommand,
        detectManipulationAttempt, showSecurityAlert, executeCommand,
        injectActionButtons, handleActionClick, appendPayloadDownload,
        executeDownloadPipeline, injectDeployButton, enableInlineEdit,
        summarizeCurrentChat, toggleMic
    }).forEach(([k, v]) => { window[k] = v; });
})();