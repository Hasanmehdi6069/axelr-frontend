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
    if (trigger && menu) {
        trigger.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            menu.classList.toggle('open');
        });
        document.addEventListener('click', function(e) {
            if (!menu.contains(e.target) && e.target !== trigger) menu.classList.remove('open');
        });
        menu.addEventListener('click', function(e) { e.stopPropagation(); });
    }

    // ── Feature dispatcher ───────────────────────────────────────────────
    async function handleFeatureAction(feature) {
        switch (feature) {
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
            case 'brainstorm': {
                const topic = prompt('Enter a topic to brainstorm:');
                if (topic) await brainstorm(topic);
                break;
            }
            case 'multi-agent': {
                const task = prompt('Enter task for the agent collective:');
                if (task) await runMultiAgentStreaming(task);
                break;
            }
            case 'workflow':
                if (window.Axelr.openWorkflowModal) window.Axelr.openWorkflowModal();
                break;
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

    // ── Nexus bubble helper ──────────────────────────────────────────────
    function createNexusBubble(markdown) {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble nexus-bubble';
        const avatar = document.createElement('div');
        avatar.className = 'ai-avatar-bubble';
        avatar.innerHTML = AXELR_AVATAR_SVG;
        const content = document.createElement('div');
        content.className = 'bubble-content';
        content.innerHTML = DOMPurify.sanitize(marked.parse(markdown || ''));
        bubble.append(avatar, content);
        return bubble;
    }

    // ── Brainstorm ───────────────────────────────────────────────────────
    async function brainstorm(topic) {
        const resp = await apiFetch(`${API_BASE_URL}/api/brainstorm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: topic })
        });
        const data = await resp.json();
        if (data.success) {
            const bubble = document.createElement('div');
            bubble.className = 'chat-bubble nexus-bubble';
            bubble.innerHTML = `<div class="bubble-content">${DOMPurify.sanitize(marked.parse(data.ideas))}</div>`;
            viewport.appendChild(bubble);
            scrollToBottom();
        }
    }

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
        try {
            const resp = await apiFetch(`${API_BASE_URL}/api/personas/${personaId}`);
            if (!resp.ok) throw new Error('Persona not found');
            const persona = await resp.json();

            if (persona.system_prompt) {
                await apiFetch(`${API_BASE_URL}/api/user/instructions`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ instructions: persona.system_prompt })
                });
                showToast(`Persona "${persona.name}" applied successfully!`, 'success');
                await window.Axelr.loadUserProfile();
                window.Axelr.closeModals();
            } else {
                showToast('Persona has no system prompt to apply.', 'warning');
            }
        } catch (e) {
            showToast('Failed to apply persona: ' + e.message, 'error');
        }
    }

    async function loadPersonaList() {
        const resp = await apiFetch(`${API_BASE_URL}/api/personas`);
        const data = await resp.json();
        const container = document.getElementById('persona-list');
        if (container) {
            container.innerHTML = data.personas.map(p => `
                <div class="persona-item" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-muted);">
                    <div>
                        <strong>${escapeHtmlEntities(p.name)}</strong>
                        <div style="font-size:12px;color:var(--text-muted);">${escapeHtmlEntities(p.system_prompt?.slice(0,80))}…</div>
                    </div>
                    <button onclick="applyPersona('${p._id}')" style="padding:4px 12px;background:#3b82f6;color:#fff;border:none;border-radius:4px;">Apply</button>
                </div>
            `).join('');
        }
    }

    async function createPersona() {
        const name = prompt('Persona name:');
        if (!name) return;
        const prompt_text = prompt('System prompt for this persona:');
        if (!prompt_text) return;
        const isPublic = confirm('Make this persona public?');
        await apiFetch(`${API_BASE_URL}/api/personas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, system_prompt: prompt_text, is_public: isPublic })
        });
        loadPersonaList();
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
        const data = await (await apiFetch(`${API_BASE_URL}/api/personas`)).json();
        const container = document.getElementById('persona-select');
        if (!container) return;
        container.innerHTML = data.personas.map(p =>
            `<option value="${p._id}">${p.name}</option>`
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
            const resp = await apiFetch(`${API_BASE_URL}/api/enhance-prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ promptText: text }),
            });
            if (!resp.ok) {
                if (resp.status === 403) {
                    showToast('Daily enhancement limit reached. Upgrade for more.', 'warning');
                } else {
                    throw new Error(`HTTP ${resp.status}`);
                }
                return;
            }
            const result = await resp.json();
            if (!result.changed && result.note) {
                const msg = result.note === 'no_change'            ? 'Prompt already optimal.' :
                            result.note === 'provider_unavailable' ? 'Enhancer temporarily unavailable.' :
                            result.note === 'injection_blocked'    ? 'Input rejected for safety.' :
                                                                      'No changes applied.';
                showToast(msg, 'info');
                return;
            }
            if (!result.success) {
                showToast('Enhancer unavailable — try again shortly.', 'error');
                return;
            }
            if (!result.changed) {
                showToast('Prompt already optimal.', 'info');
                return;
            }
            openEnhanceReviewModal(result);
        } catch (e) {
            showToast('Prompt enhancer unavailable — try again shortly.', 'error');
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
        const deltaColor = delta > 0 ? '#10b981' : (delta < 0 ? '#ef4444' : '#94a3b8');
        const deltaSign  = delta > 0 ? '+' : '';

        const bullets = (result.rationale || [])
            .map(r => `<li style="margin:4px 0;color:var(--text-muted);font-size:13px;">${escapeHtmlEntities(r)}</li>`)
            .join('');

        const segments = (result.diff && result.diff.segments) || [];
        let diffHtml;
        if (segments.length === 0) {
            diffHtml = escapeHtmlEntities(result.enhanced);
        } else {
            diffHtml = segments.map(seg => {
                const txt = escapeHtmlEntities(seg.text);
                if (seg.op === 'equal')  return `<span>${txt}</span>`;
                if (seg.op === 'add')    return `<ins class="diff-add">${txt}</ins>`;
                if (seg.op === 'remove') return `<del class="diff-remove">${txt}</del>`;
                return txt;
            }).join('');
        }

        const scoreBar = (label, val) => `
            <div style="display:flex;align-items:center;gap:8px;margin:5px 0;">
                <span style="width:80px;font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">${label}</span>
                <div style="flex:1;height:6px;background:var(--border-muted);border-radius:3px;overflow:hidden;">
                    <div style="width:${Math.min(100, Math.max(0, val))}%;height:100%;background:var(--accent-glow);transition:width .4s ease;"></div>
                </div>
                <span style="width:30px;text-align:right;font-size:11px;color:var(--text-main);font-weight:600;">${val}</span>
            </div>`;

        modal.innerHTML = `
            <div class="modal-card" style="max-width:900px;width:95%;max-height:90vh;overflow-y:auto;">
                <div class="modal-header">
                    <div class="modal-title">
                        <span class="material-symbols-rounded">auto_awesome</span>
                        Enhanced Prompt
                        <span style="margin-left:8px;padding:2px 8px;border-radius:4px;background:rgba(0,242,254,0.1);color:var(--accent-glow);font-size:11px;font-weight:700;">${modeLabel}</span>
                        ${result.provider ? `<span style="margin-left:6px;font-size:11px;color:var(--text-muted);font-weight:500;">via ${escapeHtmlEntities(result.provider)}</span>` : ''}
                        <span style="margin-left:10px;font-size:13px;font-weight:700;color:${deltaColor};">${deltaSign}${delta} pts</span>
                    </div>
                    <button class="close-modal-btn" onclick="closeModals()">✕</button>
                </div>

                <div style="padding:14px 0;">
                    <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:var(--accent-glow);margin-bottom:6px;">
                        ENHANCED · inline diff
                    </div>
                    <div style="padding:14px;background:rgba(0,242,254,0.04);border:1px solid rgba(0,242,254,0.15);border-radius:10px;font-size:13.5px;color:var(--text-main);line-height:1.7;white-space:pre-wrap;max-height:280px;overflow-y:auto;">${diffHtml}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">
                        <span style="background:rgba(16,185,129,0.18);color:#6ee7b7;padding:1px 6px;border-radius:3px;">added</span>
                        <span style="background:rgba(239,68,68,0.18);color:#fca5a5;padding:1px 6px;border-radius:3px;margin-left:6px;text-decoration:line-through;">removed</span>
                    </div>
                </div>

                <details style="margin-bottom:12px;">
                    <summary style="cursor:pointer;font-size:12px;color:var(--text-muted);padding:6px 0;">View original</summary>
                    <div style="padding:12px;background:var(--bg-input);border:1px solid var(--border-muted);border-radius:8px;font-size:13px;color:var(--text-muted);line-height:1.6;white-space:pre-wrap;max-height:200px;overflow-y:auto;margin-top:6px;">${escapeHtmlEntities(result.original)}</div>
                </details>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:10px 0 14px;border-top:1px solid var(--border-muted);">
                    <div>
                        <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:var(--text-muted);margin-bottom:8px;">QUALITY SCORES</div>
                        ${scoreBar('Overall',     s.enhanced?.overall     ?? 0)}
                        ${scoreBar('Clarity',     s.enhanced?.clarity     ?? 0)}
                        ${scoreBar('Specificity', s.enhanced?.specificity ?? 0)}
                        ${scoreBar('Density',     s.enhanced?.density     ?? 0)}
                        ${scoreBar('Structure',   s.enhanced?.structure   ?? 0)}
                    </div>
                    <div>
                        <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:var(--text-muted);margin-bottom:8px;">WHAT CHANGED</div>
                        <ul style="margin:0;padding-left:18px;">${bullets}</ul>
                    </div>
                </div>

                <div style="display:flex;gap:10px;justify-content:flex-end;padding-top:14px;border-top:1px solid var(--border-muted);">
                    <button id="enhance-reject-btn" class="action-icon-btn" style="padding:10px 20px;">Keep Original</button>
                    <button id="enhance-accept-btn" class="action-icon-btn"
                            style="padding:10px 20px;background:var(--accent-glow);color:#000;font-weight:600;border:none;">
                        <span class="material-symbols-rounded" style="font-size:16px;vertical-align:middle;">check</span>
                        Use Enhanced
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
        brainstorm, saveKnowledge, loadKnowledgeList, loadKnowledge, deleteKnowledge,
        runWorkflow, runMultiAgentStreaming,
        applyPersona, loadPersonaList, createPersona, loadPersonas, loadPersonaDropdown,
        executeCodeBlock, touchFix, refactorCode, deployCodeBlock,
        openVisualDebugger, generateTests, explainCodeBlock, discoverSchema,
        generateStoryFromData, displayStory,
        enhanceUserPrompt, openEnhanceReviewModal,
    });
    Object.entries({
        updateFeaturesMenu, handleFeatureAction, createNexusBubble,
        brainstorm, saveKnowledge, loadKnowledgeList, loadKnowledge, deleteKnowledge,
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