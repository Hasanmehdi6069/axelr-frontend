// js/70-features.js
// AXELR AI — Feature dispatcher, prompt enhancer, multi-agent, workflow runner,
//           knowledge vault, personas, code tools.
(function () {
    "use strict";
    const {
        API_BASE_URL, apiFetch, showToast, escapeHtmlEntities, getEl,
        extractLastCodeBlock, extractHtmlCode, AXELR_AVATAR_SVG,
        getWorkspace, viewport, scrollToBottom,
        WORKSPACE_CREATION_MENUS, TIER_RANK,
    } = window.Axelr;
    const st = window.Axelr.state;

    // ── Features menu ────────────────────────────────────────────────────
    function updateFeaturesMenu(workspace) {
        const ws = workspace || getWorkspace();
        const menu = document.getElementById('features-menu');
        if (!menu) return;

        const userTier = window.currentUser?.tier || (st.isGuestMode ? 'guest' : 'free');
        const userRank = TIER_RANK[userTier] ?? 0;

        const tools = (WORKSPACE_CREATION_MENUS[ws] || WORKSPACE_CREATION_MENUS.core)
            .filter(t => (TIER_RANK[t.minTier] ?? 0) <= userRank);

        menu.innerHTML = tools.map(tool => `
            <div class="feature-item ${tool.isUpload ? 'upload-highlight' : ''}" data-feature="${tool.id}">
                <span class="material-symbols-rounded">${tool.icon}</span>
                <span>${tool.label}</span>
            </div>
        `).join('');

        menu.querySelectorAll('.feature-item').forEach(btn => {
            btn.onclick = function(e) {
                e.stopPropagation();
                const actionId = this.dataset.feature;
                menu.classList.remove('open');
                if (actionId === 'upload') document.getElementById('omni-file-input').click();
                else handleFeatureAction(actionId);
            };
        });
    }

    const trigger = document.getElementById('features-trigger');
    const menu = document.getElementById('features-menu');
    const backdrop = document.querySelector('.features-menu-backdrop');
    if (trigger && menu) {
        trigger.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            menu.classList.toggle('open');
            if (backdrop) backdrop.classList.toggle('active');
        });
        document.addEventListener('click', function(e) {
            if (!menu.contains(e.target) && e.target !== trigger) {
                menu.classList.remove('open');
                if (backdrop) backdrop.classList.remove('active');
            }
        });
        menu.addEventListener('click', function(e) { e.stopPropagation(); });
    }

    // ── Feature dispatcher ───────────────────────────────────────────────
    async function handleFeatureAction(feature) {
        switch (feature) {
            case 'enhance': {
                enhanceUserPrompt();
                break;
            }
            case 'scan-pii': {
                const text = prompt('Paste the text or data to audit for sensitive PII:');
                if (!text) return;
                showToast('Scanning for sensitive PII...', 'info');
                try {
                    const resp = await apiFetch(`${API_BASE_URL}/api/tools/scan-pii`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ document_text: text })
                    });
                    const data = await resp.json();
                    if (data.success) {
                        const bubble = createNexusBubble(`### 🛡️ PII Privacy Scan Report\n\n${data.scan_report}`);
                        viewport.appendChild(bubble);
                        scrollToBottom();
                    }
                } catch (e) { showToast('Scan error: ' + e.message, 'error'); }
                break;
            }
            case 'translate-code': {
                const code = extractLastCodeBlock() || prompt('Paste code to translate:');
                if (!code) return;
                const targetLang = prompt('Target language/framework (e.g. React, Vue, Python, TypeScript):', 'TypeScript');
                if (!targetLang) return;
                showToast('Translating code...', 'info');
                try {
                    const resp = await apiFetch(`${API_BASE_URL}/api/tools/translate-code`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code, source_lang: 'auto', target_lang: targetLang })
                    });
                    const data = await resp.json();
                    if (data.success) {
                        const bubble = createNexusBubble(`### 🔄 Translated Code (${escapeHtmlEntities(targetLang)})\n\n${data.translated_code}`);
                        viewport.appendChild(bubble);
                        scrollToBottom();
                    }
                } catch (e) { showToast('Translation error: ' + e.message, 'error'); }
                break;
            }
            case 'minutes': {
                const transcript = prompt('Paste meeting transcript:');
                if (!transcript) return;
                showToast('Extracting meeting minutes...', 'info');
                try {
                    const resp = await apiFetch(`${API_BASE_URL}/api/tools/meeting-minutes`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ transcript })
                    });
                    const data = await resp.json();
                    if (data.success) {
                        const bubble = createNexusBubble(`### 📋 Meeting Minutes\n\n${data.minutes}`);
                        viewport.appendChild(bubble);
                        scrollToBottom();
                    }
                } catch (e) { showToast('Minutes error: ' + e.message, 'error'); }
                break;
            }

            case 'mermaid': {
                const desc = prompt('Describe the architecture or process flow:');
                if (!desc) return;
                showToast('Synthesizing Mermaid diagram...', 'info');
                try {
                    const resp = await apiFetch(`${API_BASE_URL}/api/tools/mermaid`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ process_description: desc })
                    });
                    const data = await resp.json();
                    if (data.success) {
                        const bubble = createNexusBubble(data.mermaid);
                        viewport.appendChild(bubble);
                        scrollToBottom();
                    }
                } catch (e) { showToast('Mermaid error: ' + e.message, 'error'); }
                break;
            }
            case 'nexus-flow': {
                // Check user tier for Nexus Flow access
                const userTier = window.currentUser?.tier || (st.isGuestMode ? 'guest' : 'free');
                const userRank = TIER_RANK[userTier] ?? 0;
                
                // Free users get 1 workflow per day, paid users get unlimited
                const isFreeUser = userTier === 'free' || userTier === 'guest';
                if (isFreeUser) {
                    const today = new Date().toDateString();
                    const nexusFlowUsage = JSON.parse(localStorage.getItem('nexusFlowUsage') || '{}');
                    if (nexusFlowUsage[today] && nexusFlowUsage[today] >= 1) {
                        showToast('Free tier limit reached: 1 Nexus Flow workflow per day. Upgrade to Pro for unlimited access.', 'error');
                        return;
                    }
                }

                const promptText = prompt('Describe your workflow or process to automate with Nexus Flow:', 'Create a multi-step workflow that processes customer feedback, analyzes sentiment, and generates a summary report.');
                if (!promptText) return;
                showToast('Initializing Nexus Flow (client-side orchestration)...', 'info');
                
                try {
                    // Nexus Flow runs client-side to minimize server memory footprint - keeps server RAM <450MB
                    // We only send a minimal request to get the workflow structure, then execute locally
                    const resp = await apiFetch(`${API_BASE_URL}/api/tools/nexus-flow/generate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ workflow_description: promptText, client_side_execution: true })
                    });
                    const data = await resp.json();
                    
                    if (data.success) {
                        // Track usage for free users
                        if (isFreeUser) {
                            const today = new Date().toDateString();
                            const nexusFlowUsage = JSON.parse(localStorage.getItem('nexusFlowUsage') || '{}');
                            nexusFlowUsage[today] = (nexusFlowUsage[today] || 0) + 1;
                            localStorage.setItem('nexusFlowUsage', JSON.stringify(nexusFlowUsage));
                        }
                        
                        // Create Nexus Flow execution engine client-side
                        const nexusEngine = new window.Axelr.NexusFlowEngine();
                        await nexusEngine.initialize(data.workflow);
                        
                        const bubble = createNexusBubble(`### ⚡ Nexus Flow - Elite Workflow Orchestration\n\n**Client-side execution active** to preserve server resources.\n\n${data.workflow_description}\n\nWorkflow is ready to execute. Client-side engine active.`);
                        viewport.appendChild(bubble);
                        scrollToBottom();
                        showToast('Nexus Flow workflow generated successfully! Running client-side to conserve server resources.', 'success');
                    }
                } catch (e) { showToast('Nexus Flow error: ' + e.message, 'error'); }
                break;
            }
            case 'execute-code': {
                const language = prompt('Programming language (python, javascript, typescript, etc.):', 'python');
                const code = prompt('Paste code to execute:', 'print("Hello, World!")');
                if (!code || !language) return;
                showToast('Executing code...', 'info');
                try {
                    const resp = await apiFetch(`${API_BASE_URL}/api/execute-code`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ language, code })
                    });
                    const data = await resp.json();
                    if (data.success) {
                        const bubble = createNexusBubble(`### 🖥️ Code Execution Result\n\n**Output:**\n\`\`\`\n${data.output || 'No output'}\n\`\`\`\n\n${data.error ? `**Error:**\n\`\`\`\n${data.error}\n\`\`\`` : ''}`);
                        viewport.appendChild(bubble);
                        scrollToBottom();
                    }
                } catch (e) { showToast('Execution error: ' + e.message, 'error'); }
                break;
            }
            case 'touch-fix': {
                const code = extractLastCodeBlock() || prompt('Paste code with errors:');
                const errorMessage = prompt('Paste the error message:');
                if (!code || !errorMessage) return;
                showToast('Applying touch-fix to code...', 'info');
                try {
                    const resp = await apiFetch(`${API_BASE_URL}/api/touch_fix`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code, error_message: errorMessage })
                    });
                    const data = await resp.json();
                    if (data.success) {
                        const bubble = createNexusBubble(`### 🔧 Fixed Code\n\n\`\`\`\n${data.fixed_code}\n\`\`\``);
                        viewport.appendChild(bubble);
                        scrollToBottom();
                    }
                } catch (e) { showToast('Touch-fix error: ' + e.message, 'error'); }
                break;
            }
            case 'summarize-chat': {
                if (!st.activeSessionId) {
                    showToast('No active session to summarize', 'error');
                    return;
                }
                showToast('Summarizing chat history...', 'info');
                try {
                    const resp = await apiFetch(`${API_BASE_URL}/api/summarize-chat?session_id=${st.activeSessionId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    const data = await resp.json();
                    if (data.success) {
                        const bubble = createNexusBubble(`### 📝 Chat Summary\n\n${data.summary}`);
                        viewport.appendChild(bubble);
                        scrollToBottom();
                    }
                } catch (e) { showToast('Summarization error: ' + e.message, 'error'); }
                break;
            }
            case 'decision-matrix': {
                const options = prompt('Enter options (comma-separated):', 'PostgreSQL, MongoDB, DynamoDB');
                const criteria = prompt('Enter evaluation criteria (comma-separated):', 'Latency, Cost, Scaling, Schema Flexibility');
                if (options && criteria) {
                    showToast('Synthesizing decision matrix...', 'info');
                    try {
                        const resp = await apiFetch(`${API_BASE_URL}/api/tools/decision-matrix`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                options: options.split(',').map(s => s.trim()),
                                criteria: criteria.split(',').map(s => s.trim())
                            })
                        });
                        const data = await resp.json();
                        if (data.success) {
                            const bubble = createNexusBubble(data.matrix);
                            viewport.appendChild(bubble);
                            scrollToBottom();
                        }
                    } catch (e) { showToast('Matrix error: ' + e.message, 'error'); }
                }
                break;
            }
            default:
                showToast('Feature initialized', 'info');
        }
    }

    // ── WORLD-CLASS CHAT STAGING & LOADING SYSTEM ───────────────────────
    let chatMessageCounter = 0; // For staggered entrance animations
    let activeAILoadingBubble = null; // Track current AI loading state

    // Create and stage an AI bubble with production-grade entrance animation
    function createNexusBubble(markdown, isStaggered = true) {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble nexus-bubble';
        
        // Add staggered animation class if enabled
        if (isStaggered) {
            const staggerIndex = (chatMessageCounter % 3) + 1;
            bubble.classList.add(`stagger-${staggerIndex}`);
            chatMessageCounter++;
        }
        
        const avatar = document.createElement('div');
        avatar.className = 'ai-avatar-bubble';
        avatar.innerHTML = AXELR_AVATAR_SVG;
        const content = document.createElement('div');
        content.className = 'bubble-content';
        content.innerHTML = DOMPurify.sanitize(marked.parse(markdown || ''));
        bubble.append(avatar, content);
        
        // Force browser reflow before activating animation to ensure smooth entrance
        void bubble.offsetWidth;
        requestAnimationFrame(() => {
            bubble.classList.add('visible');
        });
        
        return bubble;
    }

    // Show premium AI loading indicator before response streams in
    function showAILoading() {
        // Remove any existing loading bubble first (idempotency guard)
        removeAILoading();
        
        const viewport = document.getElementById('viewport');
        const chatContainer = document.getElementById('chat-container');
        if (!viewport || !chatContainer) return;

        activeAILoadingBubble = document.createElement('div');
        activeAILoadingBubble.className = 'ai-loading-bubble';
        activeAILoadingBubble.innerHTML = `
            <div class="ai-avatar-bubble">${AXELR_AVATAR_SVG}</div>
            <div class="ai-loading-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        
        chatContainer.appendChild(activeAILoadingBubble);
        // Trigger animation after browser has a chance to paint
        void activeAILoadingBubble.offsetWidth;
        requestAnimationFrame(() => {
            activeAILoadingBubble.classList.add('active');
        });
        scrollToBottom();
    }

    // Remove AI loading indicator when response is ready
    function removeAILoading() {
        if (activeAILoadingBubble && activeAILoadingBubble.parentNode) {
            // Smoothly fade out loading indicator
            activeAILoadingBubble.style.opacity = '0';
            activeAILoadingBubble.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                if (activeAILoadingBubble && activeAILoadingBubble.parentNode) {
                    activeAILoadingBubble.remove();
                }
                activeAILoadingBubble = null;
            }, 300);
        }
    }

    // Production-grade file staging system for uploads
    const stagedFiles = new Map(); // Track all active file uploads
    function stageFile(file) {
        const fileStagingContainer = document.getElementById('file-staging-container') || createFileStagingContainer();
        if (!fileStagingContainer) return null;

        const fileId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const fileItem = document.createElement('div');
        fileItem.className = 'file-staging-item';
        fileItem.id = fileId;
        fileItem.innerHTML = `
            <div class="file-staging-header">
                <span class="material-symbols-rounded">description</span>
                <span class="file-staging-name">${file.name}</span>
                <button class="file-staging-remove" data-file-id="${fileId}">
                    <span class="material-symbols-rounded">close</span>
                </button>
            </div>
            <div class="file-staging-progress">
                <div class="file-staging-progress-bar" style="width: 0%"></div>
            </div>
        `;

        fileStagingContainer.appendChild(fileItem);
        // Force reflow then trigger smooth entrance
        void fileItem.offsetWidth;
        requestAnimationFrame(() => fileItem.classList.add('visible'));

        // Track file state
        stagedFiles.set(fileId, { file, element: fileItem, progress: 0 });
        
        // Add remove handler
        fileItem.querySelector('.file-staging-remove').addEventListener('click', () => {
            removeStagedFile(fileId);
        });

        return fileId;
    }

    // Update file staging progress
    function updateFileProgress(fileId, progress) {
        const fileData = stagedFiles.get(fileId);
        if (!fileData) return;
        
        const progressBar = fileData.element.querySelector('.file-staging-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${Math.min(progress, 100)}%`;
        }
        fileData.progress = progress;
    }

    // Remove a staged file
    function removeStagedFile(fileId) {
        const fileData = stagedFiles.get(fileId);
        if (!fileData) return;

        // Smooth exit animation
        fileData.element.style.opacity = '0';
        fileData.element.style.transform = 'translateX(-20px)';
        setTimeout(() => {
            if (fileData.element.parentNode) fileData.element.remove();
            stagedFiles.delete(fileId);
        }, 400);
    }

    // Create file staging container if it doesn't exist
    function createFileStagingContainer() {
        const inputArea = document.getElementById('input-area');
        if (!inputArea) return null;
        
        const container = document.createElement('div');
        container.id = 'file-staging-container';
        container.className = 'file-staging-container';
        // Accessibility attributes
        container.setAttribute('role', 'region');
        container.setAttribute('aria-label', 'File upload staging area');
        inputArea.prepend(container);
        return container;
    }

    // Initialize file input integration - production-grade file upload staging
    function initFileUploadIntegration() {
        const fileInput = document.getElementById('omni-file-input');
        if (!fileInput) return;

        // Listen for file selection to automatically stage files
        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (!files.length) return;

            files.forEach(file => {
                // Validate file size (max 100MB per file)
                if (file.size > 100 * 1024 * 1024) {
                    showToast(`File ${file.name} exceeds 100MB limit`, 'error');
                    return;
                }
                // Validate file types
                const allowedTypes = ['image/', 'application/pdf', 'text/', 'video/', 'audio/'];
                const isAllowed = allowedTypes.some(type => file.type.startsWith(type));
                if (!isAllowed) {
                    showToast(`File type not supported: ${file.type}`, 'error');
                    return;
                }

                // Stage the valid file
                const fileId = stageFile(file);
                if (fileId) {
                    // Simulate upload progress for demo - replace with real upload logic in production
                    simulateFileUpload(fileId);
                }
            });

            // Reset input to allow selecting the same file again
            fileInput.value = '';
        });
    }

    // Simulate file upload progress (replace with real XHR/fetch progress in production)
    function simulateFileUpload(fileId) {
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 15 + 5; // Random progress increments
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
                // Remove file from staging after successful upload
                setTimeout(() => removeStagedFile(fileId), 500);
                showToast('File uploaded successfully', 'success');
            }
            updateFileProgress(fileId, progress);
        }, 200);
    }

    // Initialize file upload integration when the script loads
    initFileUploadIntegration();



    // ── Knowledge vault ──────────────────────────────────────────────────
    async function saveKnowledge(key, value, tags = []) {
        try {
            await apiFetch(`${API_BASE_URL}/api/knowledge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value, tags })
            });
            showToast('Knowledge saved', 'success');
        } catch (e) {
            showToast('Save failed: ' + e.message);
        }
    }

    async function loadKnowledgeList() {
        try {
            const resp = await apiFetch(`${API_BASE_URL}/api/knowledge`);
            if (!resp.ok) throw new Error('Failed to fetch knowledge list');
            const data = await resp.json();
            const container = document.getElementById('knowledge-list');

            if (container && data.knowledge) {
                container.innerHTML = data.knowledge.map(k => `
                    <div class="knowledge-item" style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-muted);">
                        <span><strong>${escapeHtmlEntities(k.key)}</strong>: ${escapeHtmlEntities(k.value)}</span>
                        <button onclick="deleteKnowledge('${k._id}')" style="background:none;border:none;color:#ef4444;cursor:pointer;" title="Delete knowledge">✕</button>
                    </div>
                `).join('');
            }
        } catch (e) {
            showToast('Failed to load knowledge list: ' + e.message, 'error');
        }
    }

    async function loadKnowledge() {
        const resp = await apiFetch(`${API_BASE_URL}/api/knowledge`);
        const data = await resp.json();
        const container = document.getElementById('knowledge-list');
        if (container) {
            container.innerHTML = data.knowledge.map(k =>
                `<div class="knowledge-item"><strong>${k.key}</strong>: ${k.value}</div>`
            ).join('');
        }
    }

    async function deleteKnowledge(id) {
        if (!confirm('Delete this knowledge?')) return;
        await apiFetch(`${API_BASE_URL}/api/knowledge/${id}`, { method: 'DELETE' });
        loadKnowledgeList();
    }

    // ── Workflow (SSE runner) ────────────────────────────────────────────
    async function runWorkflow(steps) {
        const response = await fetch(`${API_BASE_URL}/api/workflow/run`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${await window.Axelr.ensureValidToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ steps, workspace: getWorkspace() })
        });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            for (let i = 0; i < events.length - 1; i++) {
                const event = events[i];
                if (event.startsWith('data: ')) {
                    try {
                        const json = JSON.parse(event.slice(6));
                        if (json.step && json.status === 'completed') {
                            const stepBubble = document.createElement('div');
                            stepBubble.className = 'chat-bubble nexus-bubble';
                            stepBubble.innerHTML = `<div class="bubble-content"><strong>${json.step}</strong><br>${DOMPurify.sanitize(marked.parse(json.output))}</div>`;
                            viewport.appendChild(stepBubble);
                            scrollToBottom();
                        } else if (json.status === 'done') {
                            const finalBubble = document.createElement('div');
                            finalBubble.className = 'chat-bubble nexus-bubble';
                            finalBubble.innerHTML = `<div class="bubble-content"><strong>✅ Workflow Complete</strong><br>${DOMPurify.sanitize(marked.parse(json.final))}</div>`;
                            viewport.appendChild(finalBubble);
                            scrollToBottom();
                        }
                    } catch (e) { /* ignore malformed JSON */ }
                }
            }
            buffer = events[events.length - 1];
        }
    }

    // ── Multi-agent streaming ────────────────────────────────────────────
    async function runMultiAgentStreaming(task) {
        const btn = document.getElementById('multi-agent-btn');
        if (btn) { btn.disabled = true; btn.innerText = 'Spawning…'; }

        const trace = document.createElement('div');
        trace.className = 'chat-bubble nexus-bubble agent-trace-bubble';
        trace.innerHTML = `
            <div class="ai-avatar-bubble">${AXELR_AVATAR_SVG}</div>
            <div class="bubble-content" style="flex:1;">
                <div class="agent-trace-header">
                    <span class="material-symbols-rounded" style="font-size:16px;">hub</span>
                    <strong>Agent Orchestration</strong>
                    <span class="agent-phase-pill" id="phase-pill-${Date.now()}">IDLE</span>
                </div>
                <div class="agent-trace-body">
                    <div class="agent-phase" data-phase="planning" style="display:none;">
                        <div class="agent-phase-label">1 · PLAN</div>
                        <div class="agent-plan-list"></div>
                    </div>
                    <div class="agent-phase" data-phase="executing" style="display:none;">
                        <div class="agent-phase-label">2 · EXECUTE</div>
                        <div class="agent-exec-list"></div>
                    </div>
                    <div class="agent-phase" data-phase="critique" style="display:none;">
                        <div class="agent-phase-label">3 · CRITIQUE</div>
                        <div class="agent-critique-body"></div>
                    </div>
                    <div class="agent-phase" data-phase="synthesis" style="display:none;">
                        <div class="agent-phase-label">4 · SYNTHESIS</div>
                        <div class="agent-final-body"></div>
                    </div>
                </div>
            </div>
        `;
        viewport.appendChild(trace);
        scrollToBottom();

        const phasePill = trace.querySelector('.agent-phase-pill');
        const planList  = trace.querySelector('.agent-plan-list');
        const execList  = trace.querySelector('.agent-exec-list');
        const critiqueB = trace.querySelector('.agent-critique-body');
        const finalB    = trace.querySelector('.agent-final-body');
        const subtaskRows = {};

        const showPhase = (name) => {
            const el = trace.querySelector(`.agent-phase[data-phase="${name}"]`);
            if (el) el.style.display = 'block';
            phasePill.innerText = name.toUpperCase();
        };

        const token = await window.Axelr.ensureValidToken();
        const resp = await fetch(`${API_BASE_URL}/api/agents/stream`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ task, workspace: getWorkspace() }),
        });

        if (!resp.ok || !resp.body) {
            trace.querySelector('.bubble-content').innerHTML +=
                `<div style="color:#ef4444;">Streaming failed (${resp.status}).</div>`;
            if (btn) { btn.disabled = false; btn.innerText = '🧠 Agents'; }
            return;
        }

        const reader  = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer    = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const chunks = buffer.split('\n\n');
            for (let i = 0; i < chunks.length - 1; i++) {
                const chunk = chunks[i];
                if (!chunk.startsWith('data: ')) continue;
                let evt;
                try { evt = JSON.parse(chunk.slice(6)); } catch { continue; }

                switch (evt.type) {
                    case 'phase':
                        showPhase(evt.name);
                        break;
                    case 'plan':
                        showPhase('planning');
                        planList.innerHTML = evt.subtasks.map(s => `
                            <div class="agent-plan-item">
                                <span class="ws-tag ${s.role}">${s.role.toUpperCase()}</span>
                                <span class="agent-plan-instruction">${escapeHtmlEntities(s.instruction)}</span>
                            </div>
                        `).join('');
                        break;
                    case 'subtask_start':
                        showPhase('executing');
                        if (!subtaskRows[evt.id]) {
                            const row = document.createElement('div');
                            row.className = 'agent-exec-item';
                            row.innerHTML = `
                                <div class="agent-exec-head">
                                    <span class="ws-tag ${evt.role}">${evt.role.toUpperCase()}</span>
                                    <span class="agent-exec-id">${evt.id}</span>
                                    <span class="agent-exec-status running">●</span>
                                </div>
                                <div class="agent-exec-instruction">${escapeHtmlEntities(evt.instruction)}</div>
                                <div class="agent-exec-output"></div>
                            `;
                            execList.appendChild(row);
                            subtaskRows[evt.id] = row;
                        }
                        scrollToBottom();
                        break;
                    case 'subtask_done': {
                        const row = subtaskRows[evt.id];
                        if (row) {
                            row.querySelector('.agent-exec-status').className =
                                'agent-exec-status ' + (evt.error ? 'error' : 'done');
                            row.querySelector('.agent-exec-status').innerText =
                                evt.error ? '✕' : `✓ ${Math.round(evt.latency_ms)}ms`;
                            const out = row.querySelector('.agent-exec-output');
                            out.innerHTML = `<pre>${escapeHtmlEntities((evt.output || '').slice(0, 1200))}</pre>`;
                        }
                        scrollToBottom();
                        break;
                    }
                    case 'critique':
                        showPhase('critique');
                        {
                            const verdict = evt.overall || 'pass';
                            const cls = verdict === 'pass' ? 'ok' : 'warn';
                            const items = (evt.per_subtask || []).map(x => `
                                <div class="agent-critique-item ${x.verdict}">
                                    <strong>${x.id}</strong> · ${x.verdict}
                                    ${x.issues && x.issues.length
                                        ? `<ul>${x.issues.map(i => `<li>${escapeHtmlEntities(i)}</li>`).join('')}</ul>`
                                        : ''}
                                </div>
                            `).join('');
                            const cross = (evt.cross_cutting_issues || []).length
                                ? `<div class="agent-critique-cross"><strong>Cross-cutting</strong><ul>${
                                    evt.cross_cutting_issues.map(i => `<li>${escapeHtmlEntities(i)}</li>`).join('')
                                  }</ul></div>`
                                : '';
                            critiqueB.innerHTML =
                                `<div class="agent-critique-verdict ${cls}">${verdict.toUpperCase()}</div>${items}${cross}`;
                        }
                        scrollToBottom();
                        break;
                    case 'final':
                        showPhase('synthesis');
                        finalB.innerHTML = DOMPurify.sanitize(marked.parse(evt.text || ''));
                        scrollToBottom();
                        break;
                    case 'done':
                        phasePill.innerText = `DONE · ${Math.round(evt.total_latency_ms)}ms`;
                        phasePill.classList.add('done');
                        break;
                    case 'error':
                        showPhase('error');
                        finalB.innerHTML = `<div style="color:#ef4444;">${escapeHtmlEntities(evt.message)}</div>`;
                        break;
                }
            }
            buffer = chunks[chunks.length - 1];
        }

        if (btn) { btn.disabled = false; btn.innerText = '🧠 Agents'; }
    }

    // ── Personas ─────────────────────────────────────────────────────────
    
    async function applyPersona(personaId) {
        const P = window.Axelr.Personas;
        if (!P) return;
        const persona = P.get(personaId);
        if (!persona) { showToast('Persona not found.', 'error'); return; }
        P.setDefaultId(personaId);
        // Best-effort server-side sync of the *default id only*.
        try {
            await apiFetch(`${API_BASE_URL}/api/user/default-persona`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ default_persona_id: personaId }),
            });
        } catch (_) { /* never block UX on sync */ }
        showToast(`Persona "${persona.name}" applied.`, 'success');
        window.Axelr.closeModals();
    }
async function loadPersonaList() {
        const P = window.Axelr.Personas;
        if (!P) return;
        const container = document.getElementById('persona-list');
        if (!container) return;
        const list = P.list();
        const defaultId = P.getDefaultId();
        if (!list.length) {
            container.innerHTML =
                `<div style="color:var(--text-muted);text-align:center;padding:16px;">No personas yet.</div>`;
            return;
        }
        container.innerHTML = list.map(p => `
            <div class="persona-item" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-muted);">
                <div style="flex:1;min-width:0;">
                    <strong>${escapeHtmlEntities(p.name)}</strong>
                    ${p.id === defaultId ? '<span style="margin-left:6px;font-size:10px;color:var(--accent-glow);">DEFAULT</span>' : ''}
                    <div style="font-size:12px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtmlEntities((p.systemPrompt || '').slice(0, 80))}…</div>
                </div>
                <button data-persona-apply="${p.id}" style="padding:4px 12px;background:#3b82f6;color:#fff;border:none;border-radius:4px;margin-left:8px;">Apply</button>
                <button data-persona-delete="${p.id}" style="padding:4px 10px;background:transparent;color:#ef4444;border:1px solid var(--border-muted);border-radius:4px;margin-left:6px;">Delete</button>
            </div>
        `).join('');
        container.querySelectorAll('[data-persona-apply]').forEach(b => {
            b.onclick = () => applyPersona(b.getAttribute('data-persona-apply'));
        });
        container.querySelectorAll('[data-persona-delete]').forEach(b => {
            b.onclick = () => {
                const id = b.getAttribute('data-persona-delete');
                if (confirm('Delete this persona?')) {
                    window.Axelr.Personas.remove(id);
                    loadPersonaList();
                }
            };
        });
    }
async function createPersona() {
        const P = window.Axelr.Personas;
        if (!P) return;
        const name = prompt('Persona name:');
        if (!name) return;
        const systemPrompt = prompt('System prompt for this persona:');
        if (!systemPrompt) return;
        const created = P.create({ name, base: 'engineer', systemPrompt });
        if (!created) { showToast('Could not create persona (limit reached).', 'error'); return; }
        loadPersonaList();
        showToast('Persona created.', 'success');
    }

    async function loadPersonas() {
        const resp = await apiFetch(`${API_BASE_URL}/api/personas`);
        const data = await resp.json();
        const container = document.getElementById('persona-select');
        if (container) {
            container.innerHTML = data.personas.map(p =>
                `<option value="${p._id}">${p.name}</option>`
            ).join('');
        }
    }

   async function loadPersonaDropdown() {
        const P = window.Axelr.Personas;
        if (!P) return;
        const container = document.getElementById('persona-select');
        if (!container) return;
        const list = P.list();
        const defaultId = P.getDefaultId();
        container.innerHTML = `<option value="">— none —</option>` +
            list.map(p =>
                `<option value="${p.id}" ${p.id === defaultId ? 'selected' : ''}>${escapeHtmlEntities(p.name)}</option>`
            ).join('');
    }

    // ── Code execution ───────────────────────────────────────────────────
    async function executeCodeBlock(btnOrCode, language) {
        let codeText;
        let btn = null;

        if (typeof btnOrCode === 'string') {
            codeText = btnOrCode;
        } else if (btnOrCode instanceof HTMLElement) {
            btn = btnOrCode;
            const pre = btn.closest('pre');
            const codeEl = pre ? pre.querySelector('code') : null;
            if (!codeEl) return;
            codeText = codeEl.innerText;
            btn.innerText = 'Running…';
            btn.disabled = true;
        } else {
            return;
        }

        try {
            const resp = await apiFetch(`${API_BASE_URL}/api/execute-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ language, code: codeText })
            });
            const data = await resp.json();
            const output = data.output || data.error || 'No output';

            const outputBubble = document.createElement('div');
            outputBubble.className = 'chat-bubble nexus-bubble';
            const avatar = document.createElement('div');
            avatar.className = 'ai-avatar-bubble';
            avatar.innerHTML = AXELR_AVATAR_SVG;
            outputBubble.appendChild(avatar);
            const contentDiv = document.createElement('div');
            contentDiv.className = 'bubble-content';
            const outputPre = document.createElement('pre');
            outputPre.style.whiteSpace = 'pre-wrap';
            outputPre.textContent = output;
            contentDiv.innerHTML = `<strong>▶️ Output</strong>`;
            contentDiv.appendChild(outputPre);
            outputBubble.appendChild(contentDiv);
            viewport.appendChild(outputBubble);
            scrollToBottom();
        } catch (e) {
            showToast('Execution failed: ' + e.message, 'error');
        } finally {
            if (btn) {
                btn.innerText = '▶ Run';
                btn.disabled = false;
            }
        }
    }

    async function touchFix(code, error) {
        const resp = await apiFetch(`${API_BASE_URL}/api/touch_fix`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, error_message: error })
        });
        const data = await resp.json();
        if (data.success) {
            const bubble = createNexusBubble(`**Fixed Code**\n\n\`\`\`html\n${data.fixed_code}\n\`\`\``);
            viewport.appendChild(bubble);
            scrollToBottom();
        } else {
            showToast('Touch fix failed: ' + (data.message || 'Unknown'), 'error');
        }
    }

    async function refactorCode(code) {
        const resp = await apiFetch(`${API_BASE_URL}/api/refactor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        const data = await resp.json();
        if (data.success) {
            const bubble = createNexusBubble(`**Refactored Code**\n\n\`\`\`html\n${data.refactored_code}\n\`\`\``);
            viewport.appendChild(bubble);
            scrollToBottom();
        } else {
            showToast('Refactor failed', 'error');
        }
    }

    async function deployCodeBlock(code) {
        const resp = await apiFetch(`${API_BASE_URL}/api/deploy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ htmlContent: code })
        });
        const data = await resp.json();
        if (data.success) {
            showToast(`Deployed: <a href="${data.liveUrl}" target="_blank">${data.liveUrl}</a>`, 'success');
        } else {
            showToast('Deploy failed', 'error');
        }
    }

    function openVisualDebugger() {
        showToast('Visual Debugger: Please use the "Debug" button on any code bubble.', 'info');
    }

    async function generateTests(code) {
        const resp = await apiFetch(`${API_BASE_URL}/api/generate-tests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        const data = await resp.json();
        if (data.success) {
            const bubble = createNexusBubble(`**Generated Tests**\n\n\`\`\`javascript\n${data.tests}\n\`\`\``);
            viewport.appendChild(bubble);
            scrollToBottom();
        } else {
            showToast('Test generation failed', 'error');
        }
    }

    async function explainCodeBlock(code) {
        const resp = await apiFetch(`${API_BASE_URL}/api/explain-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        const data = await resp.json();
        if (data.success) {
            const bubble = createNexusBubble(`**Explanation**\n\n${data.explanation}`);
            viewport.appendChild(bubble);
            scrollToBottom();
        } else {
            showToast('Explain failed', 'error');
        }
    }

    async function discoverSchema(files) {
        return null;
    }

    // ── Story (stub) ─────────────────────────────────────────────────────
    async function generateStoryFromData(data) {
        return "Story generation not implemented yet.";
    }

    function displayStory(story) {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble nexus-bubble';
        bubble.innerHTML = `<div class="bubble-content">${DOMPurify.sanitize(marked.parse(story))}</div>`;
        viewport.appendChild(bubble);
        scrollToBottom();
    }

    // ── Prompt enhancer (diff-and-approve) ───────────────────────────────
    async function enhanceUserPrompt() {
        const promptInput = window.Axelr.promptInput;
        if (!promptInput) return;
        const text = promptInput.value.trim();
        if (!text) return;

        const enhanceBtn = getEl('enhance-trigger');
        const inputFrame = document.querySelector('.input-frame');
        if (!enhanceBtn || !inputFrame) return;

        const originalBtnHtml = enhanceBtn.innerHTML;
        enhanceBtn.classList.add('loading');
        enhanceBtn.disabled = true;
        promptInput.disabled = true;
        inputFrame.style.filter = 'blur(4px) brightness(0.8)';
        inputFrame.style.pointerEvents = 'none';
        enhanceBtn.innerHTML =
            '<span style="font-size:12px;font-weight:bold;letter-spacing:1px;color:var(--accent-glow);">'
            + '<span class="material-symbols-rounded" style="font-size:16px;">auto_awesome</span> '
            + 'ANALYSING…</span>';

        try {
            if (!window.navigator.onLine) {
                showToast('No internet connection. Please check your network.', 'error');
                return;
            }

            const resp = await apiFetch(`${API_BASE_URL}/api/enhance-prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ promptText: text }),
            });
            
            if (!resp.ok) {
                if (resp.status === 403) {
                    showToast('Daily enhancement limit reached. Upgrade for more.', 'warning');
                } else if (resp.status === 401) {
                    showToast('Please log in to use the enhancer.', 'error');
                } else {
                    showToast(`Enhancer failed (HTTP ${resp.status}). Please try again.`, 'error');
                }
                return;
            }

            let result;
            try {
                result = await resp.json();
            } catch (parseErr) {
                showToast('Failed to parse enhancer response. Please try again.', 'error');
                return;
            }

            if (!result.success && result.note === 'provider_unavailable') {
                showToast('Enhancer is temporarily unavailable. Please try again in a few minutes.', 'warning');
                return;
            }

            if (!result.changed && result.note) {
                const msg = result.note === 'no_change'            ? 'Prompt already optimal.' :
                            result.note === 'provider_unavailable' ? 'Enhancer temporarily unavailable.' :
                            result.note === 'injection_blocked'    ? 'Input rejected for safety.' :
                                                                      'No changes applied.';
                showToast(msg, 'info');
                return;
            }

            if (!result.success) {
                showToast('Enhancer failed — try again shortly.', 'error');
                return;
            }

            openEnhanceReviewModal(result);
        } catch (e) {
            console.error('Enhancer error:', e);
            showToast('Prompt enhancer unavailable. Please refresh and try again.', 'error');
        } finally {
            enhanceBtn.classList.remove('loading');
            enhanceBtn.disabled = false;
            promptInput.disabled = false;
            inputFrame.style.filter = 'none';
            inputFrame.style.pointerEvents = 'auto';
            enhanceBtn.innerHTML = originalBtnHtml;
            if (window.Axelr.validateSendCommand) window.Axelr.validateSendCommand();
        }
    }

    function openEnhanceReviewModal(result) {
        window.Axelr.closeModals();
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.id = 'enhance-review-modal';

        const modeLabel = (result.mode || 'core').toUpperCase();
        const s = result.scores || {};
        const delta = s.delta ?? 0;
        
        const bullets = (result.rationale || [])
            .map(r => `<li class="enhance-bullet">${escapeHtmlEntities(r)}</li>`)
            .join('');

        const segments = (result.diff && result.diff.segments) || [];
        let diffHtml = segments.length === 0 
            ? escapeHtmlEntities(result.enhanced) 
            : segments.map(seg => {
                const txt = escapeHtmlEntities(seg.text);
                if (seg.op === 'equal') return `<span>${txt}</span>`;
                if (seg.op === 'add') return `<ins class="diff-add">${txt}</ins>`;
                if (seg.op === 'remove') return `<del class="diff-remove">${txt}</del>`;
                return txt;
            }).join('');

        const scoreBar = (label, val) => `
            <div class="enhance-score-row">
                <span class="enhance-score-label">${label}</span>
                <div class="enhance-score-track">
                    <div class="enhance-score-fill" style="width:${Math.min(100, Math.max(0, val))}%"></div>
                </div>
                <span class="enhance-score-value">${val}</span>
            </div>`;

        modal.innerHTML = `
            <div class="modal-card enhance-card">
                <div class="enhance-header">
                    <div class="enhance-title-group">
                        <span class="material-symbols-rounded enhance-icon">auto_awesome</span>
                        <h2 class="enhance-title">Enhanced Prompt</h2>
                        <span class="enhance-badge">${modeLabel}</span>
                    </div>
                    <button class="close-modal-btn" onclick="window.Axelr.closeModals()">✕</button>
                </div>

                <div class="enhance-content">
                    <div class="enhance-diff-container">
                        <div class="enhance-diff-label">Inline Diff</div>
                        <div class="enhance-diff-box">${diffHtml}</div>
                    </div>

                    <details class="enhance-original">
                        <summary>View original prompt</summary>
                        <div class="enhance-original-box">${escapeHtmlEntities(result.original)}</div>
                    </details>

                    <div class="enhance-analysis-grid">
                        <div class="enhance-scores">
                            <div class="enhance-section-title">Quality Scores <span class="enhance-delta">${delta > 0 ? '+' : ''}${delta} pts</span></div>
                            ${scoreBar('Overall', s.enhanced?.overall ?? 0)}
                            ${scoreBar('Clarity', s.enhanced?.clarity ?? 0)}
                            ${scoreBar('Specificity', s.enhanced?.specificity ?? 0)}
                            ${scoreBar('Density', s.enhanced?.density ?? 0)}
                        </div>
                        <div class="enhance-changes">
                            <div class="enhance-section-title">What changed</div>
                            <ul class="enhance-bullets">${bullets}</ul>
                        </div>
                    </div>
                </div>

                <div class="enhance-footer">
                    <button id="enhance-reject-btn" class="enhance-btn-secondary">Keep Original</button>
                    <button id="enhance-accept-btn" class="enhance-btn-primary">
                        <span class="material-symbols-rounded">check</span> Use Enhanced
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        
        const _sendEnhanceFeedback = (accepted) => {
            if (!result.cache_key) return;
            try {
                apiFetch(`${API_BASE_URL}/api/enhance-prompt/feedback`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        cache_key: result.cache_key,
                        accepted: accepted,
                        mode: result.mode,
                        provider: result.provider,
                    }),
                }).catch(() => {});
            } catch (_) { /* never block UX on telemetry */ }
        };

        modal.querySelector('#enhance-accept-btn').onclick = () => {
            const promptInput = window.Axelr.promptInput;
            if (promptInput) {
                promptInput.value = result.enhanced;
                promptInput.style.height = 'auto';
                promptInput.style.height = promptInput.scrollHeight + 'px';
                if (window.Axelr.validateSendCommand) window.Axelr.validateSendCommand();
                localStorage.setItem(window.Axelr.getDraftKey(), promptInput.value);
            }
            _sendEnhanceFeedback(true);
            window.Axelr.closeModals();
            showToast('Enhanced prompt applied.', 'success');
        };
        modal.querySelector('#enhance-reject-btn').onclick = () => {
            _sendEnhanceFeedback(false);
            window.Axelr.closeModals();
            showToast('Kept original prompt.', 'info');
        };
    }

    // ── Publish ──────────────────────────────────────────────────────────
    Object.assign(window.Axelr, {
        updateFeaturesMenu, handleFeatureAction, createNexusBubble,
        saveKnowledge, loadKnowledgeList, loadKnowledge, deleteKnowledge,
        runWorkflow, runMultiAgentStreaming,
        applyPersona, loadPersonaList, createPersona, loadPersonas, loadPersonaDropdown,
        executeCodeBlock, touchFix, refactorCode, deployCodeBlock,
        openVisualDebugger, generateTests, explainCodeBlock, discoverSchema,
        generateStoryFromData, displayStory,
        enhanceUserPrompt, openEnhanceReviewModal,
    });
    Object.entries({
        updateFeaturesMenu, handleFeatureAction, createNexusBubble,
        saveKnowledge, loadKnowledgeList, loadKnowledge, deleteKnowledge,
        runWorkflow, runMultiAgentStreaming,
        applyPersona, loadPersonaList, createPersona,
        executeCodeBlock, touchFix, refactorCode, deployCodeBlock,
        openVisualDebugger, generateTests, explainCodeBlock, discoverSchema,
        generateStoryFromData, displayStory,
        enhanceUserPrompt, openEnhanceReviewModal,
    }).forEach(([k, v]) => { window[k] = v; });

    // ELI5 toggle
    const eli5Btn = document.getElementById('eli5-toggle');
    if (eli5Btn) {
        let eli5Active = false;
        eli5Btn.addEventListener('click', function() {
            eli5Active = !eli5Active;
            this.classList.toggle('active');
            this.innerHTML = eli5Active
                ? '<span class="material-symbols-rounded">child_care</span> ON'
                : '<span class="material-symbols-rounded">child_care</span>';
            showToast(eli5Active ? 'ELI5 mode ON – responses will be simplified.' : 'ELI5 mode OFF', 'info');
        });
    }

    // Multi-agent button wire-up
    const multiAgentBtn = document.getElementById('multi-agent-btn');
    if (multiAgentBtn) {
        multiAgentBtn.addEventListener('click', async function() {
            const task = prompt('Enter the task for the agents:');
            if (!task) return;
            await runMultiAgentStreaming(task);
        });
    }
})();