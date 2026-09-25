// js/60-modals.js
// AXELR AI — All modals (settings, help, privacy, workflow, knowledge, personas, admin, etc.).
(function () {
    "use strict";
    const { getEl, apiFetch, showToast, escapeHtmlEntities, API_BASE_URL } = window.Axelr;
    const st = window.Axelr.state;

    function closeModals() {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    }

    function openUpgradeModal() {
        closeModals();
        const modal = getEl('upgrade-modal');
        if (modal) modal.classList.add('active');
    }

    function openProfileModal() {
        closeModals();
        const modal = getEl('profile-modal');
        if (modal) modal.classList.add('active');
    }

    function openInstructionsModal() {
        closeModals();
        const modal = getEl('instructions-modal');
        if (modal) modal.classList.add('active');
    }

    function openFeedbackModal() {
        closeModals();
        const modal = getEl('feedback-modal');
        if (modal) modal.classList.add('active');
    }

    function openSettingsModal() {
        closeModals();
        const modal = getEl('settings-modal');
        if (modal) modal.classList.add('active');
        if (window.Axelr.updateSettingsQuota) window.Axelr.updateSettingsQuota();
        if (window.Axelr.renderInlineWorkspaceCards) window.Axelr.renderInlineWorkspaceCards();
        const currentThemePref = window.Axelr.getCurrentThemePreference ? window.Axelr.getCurrentThemePreference() : 'system';
        document.querySelectorAll('.theme-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === currentThemePref);
        });
    }

    async function openAdminModal() {
        closeModals();
        const modal = getEl('admin-modal');
        if (modal) modal.classList.add('active');
        const container = getEl('admin-metrics-container');
        if (!container) return;
        try {
            const resp = await apiFetch(`${API_BASE_URL}/api/admin/metrics`);
            if (resp.ok) {
                const data = await resp.json();
                let providerRows = '';
                for (const [p, status] of Object.entries(data.providerStatus || {})) {
                    const daily = data.aiQuota?.[`daily${p.charAt(0).toUpperCase() + p.slice(1)}`] || 0;
                    const total = data.aiQuota?.[p] || 0;
                    const limit = data.aiQuota?.[`${p}Limit`] || 'N/A';
                    providerRows += `
                        <div class="profile-stat-row">
                            <span class="profile-stat-label">${p.toUpperCase()}</span>
                            <span class="profile-stat-value">Daily: ${daily}/${limit} | Total: ${total} | Status: ${status.status}</span>
                        </div>
                    `;
                }
                container.innerHTML = `
                    <div style="margin-bottom:10px;font-weight:600;color:var(--text-main);">AI Provider Usage</div>
                    ${providerRows}
                    <div style="border-top:1px solid var(--border-muted);margin:10px 0;"></div>
                    <div class="profile-stat-row"><span class="profile-stat-label">Total Users</span><span class="profile-stat-value">${data.totalUsers}</span></div>
                    <div class="profile-stat-row"><span class="profile-stat-label">Pro Subscribers</span><span class="profile-stat-value" style="color:var(--accent-glow-pro)">${data.proUsers}</span></div>
                    <div class="profile-stat-row"><span class="profile-stat-label">Business Subscribers</span><span class="profile-stat-value" style="color:var(--accent-glow-designer)">${data.businessUsers}</span></div>
                    <div class="profile-stat-row"><span class="profile-stat-label">Total Chats</span><span class="profile-stat-value">${data.totalChats}</span></div>
                    <div class="profile-stat-row"><span class="profile-stat-label">Today's Queries</span><span class="profile-stat-value">${data.dailyQueries || 0}</span></div>
                    <div class="profile-stat-row"><span class="profile-stat-label">Total Storage Used</span><span class="profile-stat-value">${data.metrics?.totalBytesMB || 0} MB</span></div>
                    <div class="profile-stat-row"><span class="profile-stat-label">Last Updated</span><span class="profile-stat-value" style="font-size:12px;">${new Date(data.timestamp).toLocaleString()}</span></div>
                `;
            } else {
                container.innerHTML = `<div style="color:#ef4444;text-align:center;">Unauthorized or service unavailable.</div>`;
            }
        } catch (e) {
            console.error('Admin fetch error:', e);
            container.innerHTML = `<div style="color:#ef4444;text-align:center;">Network error. Check your connection.</div>`;
        }
    }

    async function saveCustomInstructions() {
        const input = getEl('instructions-input');
        if (!input) return;
        const btn = document.querySelector('#instructions-modal .modal-submit-btn');
        if (!btn) return;
        const originalText = btn.innerText;
        btn.innerText = "Saving...";
        btn.disabled = true;
        try {
            await apiFetch(`${API_BASE_URL}/api/user/instructions`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instructions: input.value })
            });
            btn.innerText = "Saved!";
            btn.style.borderColor = "var(--accent-glow)";
            setTimeout(() => {
                closeModals();
                btn.innerText = originalText;
                btn.style.borderColor = "";
                btn.disabled = false;
            }, 800);
        } catch (error) {
            showToast("Failed to save instructions: " + error.message, "error");
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }

    async function submitTelemetryReport() {
        const typeSelect = getEl('report-type');
        const descInput = getEl('feedback-input');
        if (!typeSelect || !descInput) return;
        const type = typeSelect.value;
        const description = descInput.value.trim();
        if (!description) return;
        const btn = document.querySelector('#feedback-modal .modal-submit-btn');
        if (!btn) return;
        const originalText = btn.innerText;
        btn.innerText = "Dispatching...";
        btn.disabled = true;
        try {
            const response = await apiFetch(`${API_BASE_URL}/api/reports`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, description })
            });
            if (response.ok) {
                btn.innerText = "Log Secured";
                btn.style.background = "var(--accent-secondary)";
                btn.style.color = "#fff";
                setTimeout(() => {
                    closeModals();
                    descInput.value = '';
                    btn.innerText = originalText;
                    btn.style.background = "#fff";
                    btn.style.color = "#000";
                    btn.disabled = false;
                }, 1500);
            }
        } catch (error) {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }

    function openPrivacyModal() {
        closeModals();
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.id = 'privacy-modal';
        modal.innerHTML = `
            <div class="modal-card">
                <div class="modal-header">
                    <div class="modal-title">Privacy &amp; Security</div>
                    <button class="close-modal-btn" onclick="closeModals()">✕</button>
                </div>
                <div style="padding:10px 0;">
                    <h4 style="color:var(--text-main);margin-bottom:6px;">Data Protection</h4>
                    <p style="color:var(--text-muted);font-size:14px;line-height:1.6;">Your data is encrypted and never shared with third parties.</p>
                    <hr style="border-color:var(--border-muted);margin:14px 0;">
                    <h4 style="color:var(--text-main);margin-bottom:6px;">Cookies</h4>
                    <p style="color:var(--text-muted);font-size:14px;line-height:1.6;">We use essential cookies only. Manage in your browser settings.</p>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    function openHelpCenter() {
        closeModals();
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.id = 'help-modal';
        modal.innerHTML = `
            <div class="modal-card">
                <div class="modal-header">
                    <div class="modal-title">Help Center</div>
                    <button class="close-modal-btn" onclick="closeModals()">✕</button>
                </div>
                <div style="padding:10px 0;">
                    <details style="margin-bottom:12px;color:var(--text-main);"><summary style="font-weight:600;cursor:pointer;padding:8px 0;">How do I upload files?</summary><p style="color:var(--text-muted);padding:8px 0 0 16px;">Use the attach button next to the input box.</p></details>
                    <details style="margin-bottom:12px;color:var(--text-main);"><summary style="font-weight:600;cursor:pointer;padding:8px 0;">What is the free tier limit?</summary><p style="color:var(--text-muted);padding:8px 0 0 16px;">5 extractions/generations per day.</p></details>
                    <details style="margin-bottom:12px;color:var(--text-main);"><summary style="font-weight:600;cursor:pointer;padding:8px 0;">How to upgrade?</summary><p style="color:var(--text-muted);padding:8px 0 0 16px;">Go to Settings → Workspace Plan.</p></details>
                    <details style="margin-bottom:12px;color:var(--text-main);"><summary style="font-weight:600;cursor:pointer;padding:8px 0;">Contact Support</summary><p style="color:var(--text-muted);padding:8px 0 0 16px;">Email: support@axelr.in</p></details>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    function addAnotherAccount() {
        if (confirm('Switch to another Google account?')) {
            localStorage.removeItem('google_auth_token');
            location.reload();
        }
    }

    function syncTierMatrixEngine(tierGroup, subTierSelection, derivedCostValue) {
        const targetOutputNode = getEl(`${tierGroup}-base-price-output`);
        if (targetOutputNode) {
            targetOutputNode.innerHTML = `$${derivedCostValue}<span style="font-size:14px;color:#555;font-weight:400;">/mo</span>`;
        }
    }

    // ── Workflow builder modal ───────────────────────────────────────────
    function openWorkflowModal() {
        closeModals();
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.id = 'workflow-modal';
        modal.innerHTML = `
            <div class="modal-card" style="max-width:600px;">
                <div class="modal-header">
                    <div class="modal-title">Auto‑Workflow</div>
                    <button class="close-modal-btn" onclick="closeModals()">✕</button>
                </div>
                <div style="padding:10px 0;">
                    <div id="workflow-steps">
                        <div class="workflow-step">
                            <input placeholder="Step name" class="wf-step-name" value="Extract data">
                            <textarea placeholder="Prompt (use {context} for previous output)" class="wf-step-prompt" rows="2">Extract all numbers and dates from the context.</textarea>
                            <button class="remove-step-btn" onclick="this.parentElement.remove()">✕</button>
                        </div>
                    </div>
                    <button class="add-step-btn" onclick="addWorkflowStep()">+ Add Step</button>
                    <button class="modal-submit-btn" onclick="runWorkflowFromModal()">▶ Run Workflow</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    function addWorkflowStep() {
        const container = document.getElementById('workflow-steps');
        const step = document.createElement('div');
        step.className = 'workflow-step';
        step.innerHTML = `
            <input placeholder="Step name" class="wf-step-name" value="Step ${container.children.length + 1}">
            <textarea placeholder="Prompt (use {context})" class="wf-step-prompt" rows="2">Write your prompt here...</textarea>
            <button class="remove-step-btn" onclick="this.parentElement.remove()">✕</button>
        `;
        container.appendChild(step);
    }

    async function runWorkflowFromModal() {
        const steps = [];
        document.querySelectorAll('.workflow-step').forEach(el => {
            const name = el.querySelector('.wf-step-name').value.trim() || 'Step';
            const prompt = el.querySelector('.wf-step-prompt').value.trim();
            if (prompt) steps.push({ name, prompt, temperature: 0.2 });
        });
        if (steps.length === 0) return alert('Add at least one step.');
        closeModals();
        await window.Axelr.runWorkflow(steps);
    }

    // ── Knowledge Vault modal ────────────────────────────────────────────
    function openKnowledgePanel() {
        closeModals();
        let modal = getEl('knowledge-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'knowledge-modal';
            modal.className = 'modal-overlay active';
            modal.innerHTML = `
                <div class="modal-card knowledge-modal-card">
                    <div class="modal-header">
                        <div class="modal-title"><span class="material-symbols-rounded">bookmark</span> Knowledge Vault</div>
                        <button class="close-modal-btn" onclick="closeModals()"><span class="material-symbols-rounded">close</span></button>
                    </div>
                    <p class="knowledge-modal-intro">Save reusable context for future workspaces and search it when needed.</p>
                    <div class="knowledge-form">
                        <input id="knowledge-key" placeholder="Key or topic">
                        <input id="knowledge-value" placeholder="Context to remember">
                        <button class="modal-submit-btn" onclick="saveKnowledgeFromUI()">Save</button>
                    </div>
                    <input id="knowledge-search" class="knowledge-search-input" placeholder="Search saved knowledge..." oninput="searchKnowledge(this.value)">
                    <div id="knowledge-list" class="knowledge-list"></div>
                </div>`;
            document.body.appendChild(modal);
        } else {
            modal.classList.add('active');
        }
        if (window.Axelr.loadKnowledgeList) window.Axelr.loadKnowledgeList();
    }

    async function saveKnowledgeFromUI() {
        const key = document.getElementById('knowledge-key')?.value.trim();
        const value = document.getElementById('knowledge-value')?.value.trim();
        if (!key || !value) return alert('Enter both key and value.');
        await window.Axelr.saveKnowledge(key, value, []);
        document.getElementById('knowledge-key').value = '';
        document.getElementById('knowledge-value').value = '';
        if (window.Axelr.loadKnowledgeList) window.Axelr.loadKnowledgeList();
    }

    async function searchKnowledge(query) {
        if (!query.trim()) {
            if (window.Axelr.loadKnowledgeList) window.Axelr.loadKnowledgeList();
            return;
        }
        const resp = await apiFetch(`${API_BASE_URL}/api/knowledge/search?q=${encodeURIComponent(query)}`);
        const data = await resp.json();
        const container = document.getElementById('knowledge-list');
        if (container) {
            container.innerHTML = data.results.map(k => `
                <div class="knowledge-item" style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-muted);">
                    <span><strong>${escapeHtmlEntities(k.key)}</strong>: ${escapeHtmlEntities(k.value)}</span>
                </div>
            `).join('');
        }
    }

    // ── Persona modal ────────────────────────────────────────────────────
    function openPersonaSelector() {
        closeModals();
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.id = 'persona-modal';
        modal.innerHTML = `
            <div class="modal-card" style="max-width:500px;">
                <div class="modal-header">
                    <div class="modal-title">🧑‍💼 Persona Library</div>
                    <button class="close-modal-btn" onclick="closeModals()">✕</button>
                </div>
                <div style="padding:10px 0;">
                    <div id="persona-list"></div>
                    <button onclick="createPersona()" style="margin-top:10px;padding:6px 12px;background:var(--accent-glow);color:#000;border:none;border-radius:4px;">+ New Persona</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        if (window.Axelr.loadPersonaList) window.Axelr.loadPersonaList();
    }

    // ── Puter opt-in modal ───────────────────────────────────────────────
    function showPuterOptIn() {
        if (window.puterOptInShown) return;
        window.puterOptInShown = true;

        const optIn = document.createElement('div');
        optIn.className = 'modal-overlay active';
        optIn.id = 'puter-optin-modal';
        optIn.innerHTML = `
            <div class="modal-card" style="max-width:420px;">
                <div class="modal-header">
                    <div class="modal-title">
                        <span class="material-symbols-rounded">bolt</span> Enable Puter AI
                    </div>
                    <button class="close-modal-btn" onclick="document.getElementById('puter-optin-modal').remove()">✕</button>
                </div>
                <p style="color:var(--text-muted);font-size:14px;line-height:1.6;margin:8px 0 18px;">
                    Unlock an extra free AI provider with one click. Puter runs on your own
                    browser session and never shares your prompts with Axelr.
                </p>
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button class="action-icon-btn" onclick="document.getElementById('puter-optin-modal').remove()">Not now</button>
                    <button class="action-icon-btn" style="background:var(--accent-glow);color:#000;font-weight:600;"
                            onclick="togglePuter(true); document.getElementById('puter-optin-modal').remove();">
                        Enable Puter
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(optIn);
    }

    // ── Publish ──────────────────────────────────────────────────────────
    Object.assign(window.Axelr, {
        closeModals, openUpgradeModal, openProfileModal, openInstructionsModal,
        openFeedbackModal, openSettingsModal, openAdminModal,
        saveCustomInstructions, submitTelemetryReport,
        openPrivacyModal, openHelpCenter, addAnotherAccount, syncTierMatrixEngine,
        openWorkflowModal, addWorkflowStep, runWorkflowFromModal,
        openKnowledgePanel, saveKnowledgeFromUI, searchKnowledge,
        openPersonaSelector, showPuterOptIn,
    });
    Object.entries({
        closeModals, openUpgradeModal, openProfileModal, openInstructionsModal,
        openFeedbackModal, openSettingsModal, openAdminModal,
        saveCustomInstructions, submitTelemetryReport,
        openPrivacyModal, openHelpCenter, addAnotherAccount,
        openWorkflowModal, addWorkflowStep, runWorkflowFromModal,
        openKnowledgePanel, saveKnowledgeFromUI, searchKnowledge,
        openPersonaSelector, showPuterOptIn,
    }).forEach(([k, v]) => { window[k] = v; });
})();