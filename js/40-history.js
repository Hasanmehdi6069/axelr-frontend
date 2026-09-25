// js/40-history.js
// AXELR AI — History CRUD, variants, charts, export.
(function () {
    "use strict";
    const {
        getEl, apiFetch, showToast, escapeHtmlEntities, extractHtmlCode,
        AXELR_AVATAR_SVG, SIDEBAR_ICONS, ICONS, API_BASE_URL,
        historyListContainer, viewport, heroDisplay, mainBackBtn, sidebarNode,
    } = window.Axelr;
    const st = window.Axelr.state;

    async function loadArchiveLogs() {
        try {
            const currentWorkspace = window.Axelr.getWorkspace();
            const response = await apiFetch(
                `${API_BASE_URL}/api/history?status=${st.currentTab}&workspace=${currentWorkspace}`
            );
            if (response.status === 401) return window.Axelr.executeGlobalLogout();
            st.cachedLogHistory = (await response.json()).logs;
            if (!historyListContainer) return;
            if (st.cachedLogHistory.length === 0) {
                historyListContainer.innerHTML = `<div style="color:#4b5563;font-size:12px;text-align:center;padding:15px;">No ${st.currentTab} chats.</div>`;
                return;
            }
            historyListContainer.innerHTML = st.cachedLogHistory.map(log => `
                <div class="history-item" onclick="viewPastLogById('${log._id}')">
                    <div class="history-info"><div class="history-title" id="title-${log._id}">${log.isPinned ? '<span style="display:inline-flex;align-items:center;vertical-align:middle;">' + SIDEBAR_ICONS.push_pin + '</span>' : ''}${escapeHtmlEntities(log.filename)}</div></div>
                    <button class="history-options-btn" onclick="toggleHistoryOptions(event, '${log._id}')">${ICONS.moreVertical}</button>
                    <div class="actions-dropdown-list" id="options-${log._id}">
                        ${st.currentTab === 'active' ? `
                            <div class="action-list-item" onclick="renameChat('${log._id}', '${escapeHtmlEntities(log.filename)}', event)"><span style="display:inline-flex;align-items:center;vertical-align:middle;">${SIDEBAR_ICONS.edit}</span> Rename</div>
                            <div class="action-list-item" onclick="pinChat('${log._id}', event)"><span style="display:inline-flex;align-items:center;vertical-align:middle;">${SIDEBAR_ICONS.push_pin}</span> ${log.isPinned ? 'Unpin' : 'Pin'}</div>
                            <div class="action-list-item" onclick="shareChat('${log._id}', event)"><span style="display:inline-flex;align-items:center;vertical-align:middle;">${SIDEBAR_ICONS.link}</span> Share Text</div>
                            <div class="action-list-item" onclick="exportChat('${log._id}', event)"><span style="display:inline-flex;align-items:center;vertical-align:middle;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></span> Export Chat</div>
                            <div class="action-list-item" onclick="changeChatStatus('${log._id}', 'archived', event)"><span style="display:inline-flex;align-items:center;vertical-align:middle;">${SIDEBAR_ICONS.inventory}</span> Archive</div>
                            <div class="action-list-item danger" onclick="changeChatStatus('${log._id}', 'trashed', event)"><span style="display:inline-flex;align-items:center;vertical-align:middle;">${SIDEBAR_ICONS.delete}</span> Trash</div>
                        ` : ''}
                        ${st.currentTab === 'archived' ? `<div class="action-list-item" onclick="changeChatStatus('${log._id}', 'active', event)"><span style="display:inline-flex;align-items:center;vertical-align:middle;">${SIDEBAR_ICONS.undo}</span> Unarchive</div><div class="action-list-item danger" onclick="changeChatStatus('${log._id}', 'trashed', event)"><span style="display:inline-flex;align-items:center;vertical-align:middle;">${SIDEBAR_ICONS.delete}</span> Trash</div>` : ''}
                        ${st.currentTab === 'trashed' ? `<div class="action-list-item" onclick="changeChatStatus('${log._id}', 'active', event)"><span style="display:inline-flex;align-items:center;vertical-align:middle;">${SIDEBAR_ICONS.restore}</span> Restore</div><div class="action-list-item danger" onclick="deleteLogPermanently('${log._id}', event)"><span style="display:inline-flex;align-items:center;vertical-align:middle;">${SIDEBAR_ICONS.delete_forever}</span> Delete Forever</div>` : ''}
                    </div>
                </div>`).join('');
            if (st.isInitialAppLoad) {
                st.isInitialAppLoad = false;
                const savedSession = localStorage.getItem('axelr_active_session');
                if (savedSession && st.cachedLogHistory.some(l => l._id === savedSession)) {
                    viewPastLogById(savedSession);
                }
                const savedDraft = localStorage.getItem(window.Axelr.getDraftKey());
                const pi = window.Axelr.promptInput;
                if (savedDraft && pi) {
                    pi.value = savedDraft;
                    pi.style.height = 'auto';
                    pi.style.height = pi.scrollHeight + 'px';
                    if (window.Axelr.validateSendCommand) window.Axelr.validateSendCommand();
                }
            }
        } catch (e) { console.warn('Failed to load history:', e); }
    }

    async function exportChat(logId, e) {
        e.stopPropagation();
        document.querySelectorAll('.actions-dropdown-list').forEach(d => d.classList.remove('active'));
        const log = st.cachedLogHistory.find(l => l._id === logId);
        if (!log) return;
        let md = `# Axelr Chat Export\n\n**Chat:** ${log.filename}\n**Date:** ${new Date(log.createdAt).toLocaleString()}\n**Workspace:** ${log.workspace}\n\n`;
        log.messages.forEach(msg => {
            const role = msg.role === 'user' ? '**User**' : '**Axelr**';
            const timestamp = msg.createdAt ? new Date(msg.createdAt).toLocaleString() : '';
            md += `### ${role} ${timestamp ? '– ' + timestamp : ''}\n\n${msg.text}\n\n`;
            if (msg.attachedFiles && msg.attachedFiles.length) {
                md += `*Attached: ${msg.attachedFiles.join(', ')}*\n\n`;
            }
        });
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${log.filename.replace(/\s+/g, '_')}.md`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function renameChat(logId, currentName, e) {
        e.stopPropagation();
        document.querySelectorAll('.actions-dropdown-list').forEach(d => d.classList.remove('active'));
        const newName = prompt('Rename chat:', currentName);
        if (!newName || newName.trim() === '') return;
        const item = e.target.closest('.history-item');
        const originalTitle = item?.querySelector('.history-title')?.innerHTML;
        if (item) {
            const titleEl = item.querySelector('.history-title');
            if (titleEl) titleEl.innerHTML = `<span class="spinner"></span> Renaming...`;
        }
        try {
            const resp = await apiFetch(`${API_BASE_URL}/api/history/${logId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'rename', payload: newName.trim() })
            });
            if (resp.ok) loadArchiveLogs();
            else if (item && originalTitle) item.querySelector('.history-title').innerHTML = originalTitle;
        } catch (e) {
            console.error('Rename failed:', e);
            if (item && originalTitle) item.querySelector('.history-title').innerHTML = originalTitle;
        }
    }

    async function pinChat(logId, e) {
        e.stopPropagation();
        document.querySelectorAll('.actions-dropdown-list').forEach(d => d.classList.remove('active'));
        const item = e.target.closest('.history-item');
        const originalTitle = item?.querySelector('.history-title')?.innerHTML;
        if (item) {
            const titleEl = item.querySelector('.history-title');
            if (titleEl) titleEl.innerHTML = `<span class="spinner"></span> Updating...`;
        }
        try {
            const resp = await apiFetch(`${API_BASE_URL}/api/history/${logId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'pin' })
            });
            if (resp.ok) loadArchiveLogs();
            else if (item && originalTitle) item.querySelector('.history-title').innerHTML = originalTitle;
        } catch (e) {
            if (item && originalTitle) item.querySelector('.history-title').innerHTML = originalTitle;
        }
    }

    async function shareChat(logId, e) {
        e.stopPropagation();
        document.querySelectorAll('.actions-dropdown-list').forEach(d => d.classList.remove('active'));
        const log = st.cachedLogHistory.find(l => l._id === logId);
        if (!log) return;
        let shareText = `Axelr Intel Report: ${log.filename}\n\n`;
        log.messages.forEach(m => { shareText += `[${m.role.toUpperCase()}]: ${m.text}\n\n`; });
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(shareText);
            alert("✓ Chat copied securely to clipboard.");
        } else {
            const textArea = document.createElement("textarea");
            textArea.value = shareText;
            document.body.appendChild(textArea);
            textArea.select();
            try { document.execCommand('copy'); alert("✓ Chat copied to clipboard."); } catch (err) { alert("⚠️ Browser security blocked clipboard access."); }
            document.body.removeChild(textArea);
        }
    }

    async function changeChatStatus(logId, status, e) {
        e.stopPropagation();
        document.querySelectorAll('.actions-dropdown-list').forEach(d => d.classList.remove('active'));
        const item = e.target.closest('.history-item');
        const originalTitle = item?.querySelector('.history-title')?.innerHTML;
        if (item) {
            const titleEl = item.querySelector('.history-title');
            if (titleEl) titleEl.innerHTML = `<span class="spinner"></span> Moving...`;
        }
        try {
            const resp = await apiFetch(`${API_BASE_URL}/api/history/${logId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            if (resp.ok) {
                if (st.activeSessionId === logId && status === 'trashed') window.Axelr.resetToNewChat();
                loadArchiveLogs();
            } else if (item && originalTitle) item.querySelector('.history-title').innerHTML = originalTitle;
        } catch (e) {
            if (item && originalTitle) item.querySelector('.history-title').innerHTML = originalTitle;
        }
    }

    async function deleteLogPermanently(logId, e) {
        e.stopPropagation();
        document.querySelectorAll('.actions-dropdown-list').forEach(d => d.classList.remove('active'));
        if (!confirm("Delete permanently? This cannot be undone.")) return;
        const item = e.target.closest('.history-item');
        const originalTitle = item?.querySelector('.history-title')?.innerHTML;
        if (item) {
            const titleEl = item.querySelector('.history-title');
            if (titleEl) titleEl.innerHTML = `<span class="spinner"></span> Deleting...`;
        }
        try {
            const resp = await apiFetch(`${API_BASE_URL}/api/history/${logId}`, { method: 'DELETE' });
            if (resp.ok) {
                if (st.activeSessionId === logId) window.Axelr.resetToNewChat();
                loadArchiveLogs();
            } else if (item && originalTitle) item.querySelector('.history-title').innerHTML = originalTitle;
        } catch (e) {
            if (item && originalTitle) item.querySelector('.history-title').innerHTML = originalTitle;
        }
    }

    async function deleteAllChats() {
        if (!confirm("⚠️ Are you sure you want to permanently delete ALL your chat history? This cannot be undone.")) return;
        try {
            const response = await apiFetch(`${API_BASE_URL}/api/history/delete-all`, { method: 'DELETE' });
            if (response.ok) {
                alert("All chats have been permanently deleted.");
                window.Axelr.resetToNewChat();
                loadArchiveLogs();
            } else {
                alert("Failed to delete chats. Please try again.");
            }
        } catch (e) {
            alert("Network error. Please check your connection.");
        }
    }

    async function deleteAccount() {
        if (!confirm("⚠️ Do you really want to delete your account? This will permanently remove all your data and cannot be reversed.")) return;
        if (!confirm("Are you absolutely sure? This action is irreversible.")) return;
        try {
            const response = await apiFetch(`${API_BASE_URL}/api/user/delete`, { method: 'DELETE' });
            if (response.ok) {
                alert("Your account has been deleted. You will be logged out.");
                window.Axelr.executeGlobalLogout();
            } else {
                alert("Failed to delete account. Please try again.");
            }
        } catch (e) {
            alert("Network error. Please check your connection.");
        }
    }

    function viewPastLogById(logId) {
        if (st.regenerateTimer) {
            clearTimeout(st.regenerateTimer);
            st.regenerateTimer = null;
        }
        const log = st.cachedLogHistory.find(l => l._id === logId);
        if (!log) return;
        if (heroDisplay) heroDisplay.style.display = 'none';

        if (st.activeSessionId !== logId) {
            if (viewport) viewport.querySelectorAll('.chat-bubble').forEach(b => b.remove());
        }
        st.activeSessionId = logId;
        localStorage.setItem('axelr_active_session', st.activeSessionId);
        st.runningFileTitle = log.filename;
        st.runningStructuredCache = log.structuredData;
        if (mainBackBtn) mainBackBtn.style.display = 'flex';
        if (st.currentTab === 'trashed' && viewport) {
            const trashMsg = document.createElement('div');
            trashMsg.className = 'chat-bubble';
            trashMsg.style.cssText = "background:rgba(239,68,68,0.1);color:#ef4444;padding:15px;text-align:center;border-radius:8px;margin-bottom:20px;width:100%;";
            trashMsg.innerHTML = `<span class="material-symbols-rounded" style="font-size:20px;">delete</span> This chat is in the trash. Restore it to continue chatting.`;
            viewport.appendChild(trashMsg);
        }
        st.hasRegenerated = false;
        if (st.regenerateTimer) {
            clearTimeout(st.regenerateTimer);
            st.regenerateTimer = null;
        }
        log.messages.forEach((msg, idx) => {
            if (!msg.variants || !Array.isArray(msg.variants)) {
                msg.variants = [msg.text];
            }
            if (msg.activeVariant === undefined || msg.activeVariant === null) {
                msg.activeVariant = 0;
            }
            const bubble = document.createElement('div');
            bubble.className = `chat-bubble ${msg.role === 'user' ? 'user-bubble' : 'nexus-bubble'}`;
            if (msg.role === 'user') {
                let filesHtml = '';
                if (msg.attachedFiles && msg.attachedFiles.length > 0) {
                    filesHtml = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">' + msg.attachedFiles.map(f =>
                        `<div class="file-chip"><span class="material-symbols-rounded" style="font-size:14px;">description</span> ${escapeHtmlEntities(f)}</div>`
                    ).join('') + '</div>';
                }
                const contentDiv = document.createElement('div');
                contentDiv.className = 'bubble-content';
                contentDiv.style.flex = '1';
                contentDiv.innerHTML = `${filesHtml}${DOMPurify.sanitize(marked.parse(msg.text || ""))}`;
                bubble.appendChild(contentDiv);
                let lastUserIdx = -1;
                log.messages.forEach((m, i) => { if (m.role === 'user') lastUserIdx = i; });
                const isLastUser = (msg.role === 'user' && idx === lastUserIdx);
                if (window.Axelr.injectActionButtons) window.Axelr.injectActionButtons(contentDiv, msg.text, true, false, null, null, isLastUser, true);
            } else {
                let rawResponse = msg.text || "";
                const avatarDiv = document.createElement('div');
                avatarDiv.className = 'ai-avatar-bubble';
                avatarDiv.innerHTML = AXELR_AVATAR_SVG;
                bubble.appendChild(avatarDiv);
                const contentDiv = document.createElement('div');
                contentDiv.className = 'bubble-content';
                contentDiv.style.flex = '1';
                contentDiv.innerHTML = DOMPurify.sanitize(marked.parse(rawResponse));
                bubble.appendChild(contentDiv);
                if (window.Axelr.appendPayloadDownload) window.Axelr.appendPayloadDownload(contentDiv);
                const rawCode = extractHtmlCode(rawResponse);
                if (rawCode) {
                    const iframe = document.createElement('iframe');
                    iframe.style.width = '100%';
                    iframe.style.height = '400px';
                    iframe.style.border = '1px solid var(--border-muted)';
                    iframe.style.borderRadius = '8px';
                    iframe.style.marginTop = '15px';
                    iframe.style.backgroundColor = '#ffffff';
                    contentDiv.appendChild(iframe);
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    iframeDoc.open();
                    iframeDoc.write(rawCode);
                    iframeDoc.close();
                    if (window.Axelr.injectDeployButton) window.Axelr.injectDeployButton(contentDiv, rawCode);
                }
                const isLast = idx === log.messages.length - 1;
                const isActive = log.status === 'active';
                let showRegenerate = false;
                if (isLast && isActive) {
                    if (msg.canRegenerate === true) {
                        if (!msg.variants || msg.variants.length <= 1) {
                            const msgDate = msg.createdAt ? new Date(msg.createdAt) : new Date(log.createdAt);
                            const now = new Date();
                            if (!isNaN(msgDate.getTime()) && (now - msgDate) < 30000) {
                                showRegenerate = true;
                            }
                        }
                    }
                }
                if (window.Axelr.injectActionButtons) window.Axelr.injectActionButtons(contentDiv, rawResponse, false, showRegenerate, msg.createdAt || log.createdAt, log._id, false, true);
                if (msg.variants && msg.variants.length > 1) {
                    const currentIdx = msg.activeVariant || 0;
                    const variantBar = document.createElement('div');
                    variantBar.style.cssText = "display:flex;align-items:center;gap:12px;margin-top:15px;padding-top:10px;border-top:1px solid var(--border-muted);font-size:12px;color:var(--text-muted);font-weight:600;";
                    const prevBtn = document.createElement('button');
                    prevBtn.innerHTML = ICONS.leftArrow;
                    prevBtn.style.cssText = `background:transparent;border:none;cursor:${currentIdx === 0 ? 'default' : 'pointer'};color:${currentIdx === 0 ? 'var(--border-muted)' : 'var(--text-main)'};font-size:14px;`;
                    if (currentIdx > 0) prevBtn.onclick = () => switchVariant(logId, msg._id, currentIdx - 1);
                    const nextBtn = document.createElement('button');
                    nextBtn.innerHTML = ICONS.rightArrow;
                    nextBtn.style.cssText = `background:transparent;border:none;cursor:${currentIdx === msg.variants.length - 1 ? 'default' : 'pointer'};color:${currentIdx === msg.variants.length - 1 ? 'var(--border-muted)' : 'var(--text-main)'};font-size:14px;`;
                    if (currentIdx < msg.variants.length - 1) nextBtn.onclick = () => switchVariant(logId, msg._id, currentIdx + 1);
                    variantBar.appendChild(prevBtn);
                    const countSpan = document.createElement('span');
                    countSpan.innerText = `${currentIdx + 1} / ${msg.variants.length}`;
                    variantBar.appendChild(countSpan);
                    variantBar.appendChild(nextBtn);
                    contentDiv.appendChild(variantBar);
                }
            }
            if (viewport) viewport.appendChild(bubble);
        });
        window.Axelr.updateViewportAfterRender();
        if (window.innerWidth <= 768 && sidebarNode) sidebarNode.classList.remove('open');
        if (log.workspace === 'data' && log.structuredData && log.structuredData.length > 0) {
            const lastBubble = viewport?.querySelector('.chat-bubble:last-child .bubble-content');
            if (lastBubble) renderChart(lastBubble, log.structuredData);
        }
    }

    function renderChart(container, data) {
        if (!data || data.length === 0) return;
        const canvas = document.createElement('canvas');
        canvas.id = `chart-${Date.now()}`;
        canvas.style.width = '100%';
        canvas.style.height = '300px';
        canvas.style.marginTop = '15px';
        container.appendChild(canvas);
        const keys = Object.keys(data[0]);
        const numericKeys = keys.filter(k => data.every(row => !isNaN(parseFloat(row[k]))));
        if (numericKeys.length === 0) return;
        const labelKey = keys.find(k => !numericKeys.includes(k)) || keys[0];
        const chartData = {
            labels: data.map(row => String(row[labelKey] || '')),
            datasets: numericKeys.slice(0, 2).map((k, i) => ({
                label: k,
                data: data.map(row => parseFloat(row[k]) || 0),
                borderColor: i === 0 ? '#00f2fe' : '#8b5cf6',
                backgroundColor: i === 0 ? 'rgba(0,242,254,0.2)' : 'rgba(139,92,246,0.2)',
                fill: true,
                tension: 0.2
            }))
        };
        const ctx = canvas.getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: chartData,
            options: {
                responsive: true,
                plugins: { legend: { labels: { color: getComputedStyle(document.body).getPropertyValue('--text-main') } } },
                scales: {
                    x: { ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-muted') } },
                    y: { ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-muted') } }
                }
            }
        });
    }

    function renderChartInViewport(data) {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble nexus-bubble';
        const content = document.createElement('div');
        content.className = 'bubble-content';
        bubble.appendChild(content);
        viewport.appendChild(bubble);
        renderChart(content, data);
        window.Axelr.scrollToBottom();
    }

    async function switchVariant(logId, msgId, newIndex) {
        try {
            await apiFetch(`${API_BASE_URL}/api/history/${logId}/variant`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ msgId, variantIndex: newIndex })
            });
            const log = st.cachedLogHistory.find(l => l._id === logId);
            if (log) {
                const msg = log.messages.find(m => m._id === msgId);
                if (msg) {
                    msg.activeVariant = newIndex;
                    msg.text = msg.variants[newIndex];
                }
            }
            viewPastLogById(logId);
        } catch (e) { console.error("Switch failed", e); }
    }

    // ── Publish ──────────────────────────────────────────────────────────
    Object.assign(window.Axelr, {
        loadArchiveLogs, exportChat, renameChat, pinChat, shareChat,
        changeChatStatus, deleteLogPermanently, deleteAllChats, deleteAccount,
        viewPastLogById, renderChart, renderChartInViewport, switchVariant,
    });
    Object.entries({
        loadArchiveLogs, exportChat, renameChat, pinChat, shareChat,
        changeChatStatus, deleteLogPermanently, deleteAllChats, deleteAccount,
        viewPastLogById, renderChart, renderChartInViewport, switchVariant,
    }).forEach(([k, v]) => { window[k] = v; });
})();