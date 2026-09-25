// js/80-billing.js
// AXELR AI — Pricing tiers, checkout, portal, subscription modal, Stripe return handling.
(function () {
    "use strict";
    const { API_BASE_URL, apiFetch, showToast, getEl, getWorkspace } = window.Axelr;
    const st = window.Axelr.state;

    // ── State ────────────────────────────────────────────────────────────
    let currentBillingCycle = 'monthly';
    const selectedSubtiers = { pro: 'full', business: 'full' };

    const PRICING_CATALOG = {
        pro: {
            full:   { monthly: 15, annualMo: 12, annualTotal: 144, quota: '50 Actions/Day' },
            data:   { monthly: 9,  annualMo: 7,  annualTotal: 84,  quota: '45 Actions/Day' },
            design: { monthly: 10, annualMo: 8,  annualTotal: 96,  quota: '40 Actions/Day' }
        },
        business: {
            full:   { monthly: 35, annualMo: 28, annualTotal: 336, quota: '150 Actions/Day' },
            data:   { monthly: 22, annualMo: 18, annualTotal: 216, quota: '130 Actions/Day' },
            design: { monthly: 24, annualMo: 19, annualTotal: 228, quota: '120 Actions/Day' }
        }
    };

    const TIER_CONTENT = {
        free: {
            label: 'Explorer',
            limits: ['7 Actions/Day', '5 RPM · 10k TPM', '2 Providers · 2 Models'],
            models: {
                header: 'ACTIVE ENGINES (2 PROVIDERS · 2 MODELS)',
                rows: [
                    { ws: 'data',    name: 'Axelr Flash 3.5 Data Matrix', via: 'Groq' },
                    { ws: 'design',  name: 'Axelr Flash 3.5 Architect',   via: 'Groq' },
                    { ws: 'core', name: 'Axelr Flash 3.5 Core',        via: 'OpenRouter' }
                ]
            },
            features: {
                full: [
                    { on: true,  text: 'All 3 Workspaces (Data · Design · Core)' },
                    { on: true,  text: 'Basic CSV & PDF Extractions' },
                    { on: true,  text: 'Single File Upload (5 MB max)' },
                    { on: true,  text: '3 Prompt Enhancements / month' },
                    { on: false, text: 'Touch & Fix Code Diffs' },
                    { on: false, text: 'Persistent Knowledge Memory' }
                ]
            }
        },
        pro: {
            label: 'Pro Architect',
            limits: {
                full:   ['50 Actions/Day', '20 RPM · 60k TPM', '4 Providers · 4 Models'],
                data:   ['45 Actions/Day (Data)', '20 RPM · 60k TPM', '4 Providers · 4 Models'],
                design: ['40 Actions/Day (Design)', '20 RPM · 60k TPM', '4 Providers · 4 Models']
            },
            models: {
                header: 'DUAL ENGINES (4 PROVIDERS · 4 MODELS)',
                rows: [
                    { ws: 'data',    name: 'Axelr Flash 3.5 + Hyper 4.2',  via: 'Groq + OpenRouter' },
                    { ws: 'design',  name: 'Axelr Flash 3.5 + Studio 4.5', via: 'Groq + OpenRouter' },
                    { ws: 'core', name: 'Axelr Flash 3.5 + Cortex Pro', via: 'Groq + OpenRouter' }
                ]
            },
            features: {
                full: [
                    { on: true,  text: 'High-volume Flash + Priority Hyper engine' },
                    { on: true,  text: 'Touch & Fix surgical code diffs' },
                    { on: true,  text: 'One-click live Netlify deployment' },
                    { on: true,  text: 'Persistent Knowledge Vault (100 items)' },
                    { on: true,  text: '7 Enhancements/month · 20 MB multi-file' }
                ],
                data: [
                    { on: true,  text: 'Data Workspace only — higher Data quota (25/day)' },
                    { on: true,  text: 'Advanced schema discovery + CSV/Excel pipelines' },
                    { on: true,  text: 'PII scanning & structured extraction' },
                    { on: true,  text: 'Persistent Knowledge Vault (100 items)' },
                    { on: true,  text: 'Priority Groq + OpenRouter routing' },
                    { on: false, text: 'Design / UI generation (0 quota)' },
                    { on: false, text: 'Touch & Fix code diffs' },
                    { on: false, text: 'Live Netlify deployment' }
                ],
                design: [
                    { on: true,  text: 'Design Workspace only — higher UI quota (20/day)' },
                    { on: true,  text: 'Visual Debugger (mockup → code)' },
                    { on: true,  text: 'Touch & Fix surgical code diffs' },
                    { on: true,  text: 'One-click live Netlify deployment' },
                    { on: true,  text: 'Generate Tests & Explain Code' },
                    { on: false, text: 'Data extraction pipelines (0 quota)' },
                    { on: false, text: 'PII scanning' },
                    { on: false, text: 'Persistent Knowledge Vault' }
                ]
            }
        },
        business: {
            label: 'Business Collective',
            limits: {
                full:   ['150 Actions/Day', '45 RPM · 180k TPM', '40+ Providers · All Models'],
                data:   ['130 Actions/Day (Data Ops)', '45 RPM · 180k TPM', '40+ Providers · All Models'],
                design: ['120 Actions/Day (Studio)', '45 RPM · 180k TPM', '40+ Providers · All Models']
            },
            models: {
                header: 'CLUSTER ENGINES (40+ PROVIDERS · ALL MODELS)',
                rows: [
                    { ws: 'data',    name: 'Axelr Omni 5.0 + DeepV3 + LPU Cluster', via: 'All 40+ Providers' },
                    { ws: 'design',  name: 'Axelr DesignOps + Claude + Q-Coder',    via: 'All 40+ Providers' },
                    { ws: 'core', name: 'Axelr Master Core + Dynamic Failover',  via: 'All 40+ Providers' }
                ]
            },
            features: {
                full: [
                    { on: true, text: 'Autonomous Multi-Agent Orchestrator' },
                    { on: true, text: 'Automated multi-step pipelines' },
                    { on: true, text: 'Visual Debugger + live mockup auditor' },
                    { on: true, text: '25 Enhancements/month · 50 MB file limit' },
                    { on: true, text: 'Latency-aware failover across 40+ providers' },
                    { on: true, text: 'Priority routing + extended context' }
                ],
                data: [
                    { on: true,  text: 'Data Ops Heavy — highest Data quota (70/day)' },
                    { on: true,  text: 'Automated multi-step data pipelines' },
                    { on: true,  text: 'PII scanning + schema discovery' },
                    { on: true,  text: 'Autonomous Multi-Agent Orchestrator' },
                    { on: true,  text: 'Latency-aware failover cluster' },
                    { on: false, text: 'Design / UI generation (0 quota)' },
                    { on: false, text: 'Touch & Fix code diffs' }
                ],
                design: [
                    { on: true,  text: 'Design Studio — highest UI quota (60/day)' },
                    { on: true,  text: 'Visual Debugger + mockup auditor' },
                    { on: true,  text: 'Touch & Fix surgical code diffs' },
                    { on: true,  text: 'One-click Netlify deployment' },
                    { on: true,  text: 'Code translator + Mermaid diagrams' },
                    { on: true,  text: 'Latency-aware failover cluster' },
                    { on: false, text: 'Data extraction pipelines (0 quota)' }
                ]
            }
        }
    };

    function renderFeatureList(tier, subTier) {
        const cfg = TIER_CONTENT[tier];
        if (!cfg) return;
        const features = cfg.features || {};
        let list = features[subTier] || features.full || [];
        if (!Array.isArray(list) || list.length === 0) return;

        const el = document.getElementById(`${tier}-feature-list`);
        if (!el) return;
        el.innerHTML = list.map(f => `
            <li class="${f.on ? '' : 'disabled'}">
                <span class="material-symbols-rounded ${f.on ? 'check' : 'cross'}">${f.on ? 'check' : 'close'}</span>
                ${f.text}
            </li>
        `).join('');
    }

    function renderModelSection(tier) {
        const cfg = TIER_CONTENT[tier];
        if (!cfg) return;
        const el = document.getElementById(`${tier}-models-section`);
        if (!el) return;
        el.innerHTML = `
            <div class="model-section-title">${cfg.models.header}</div>
            ${cfg.models.rows.map(r => `
                <div class="workspace-model-row">
                    <span class="ws-tag ${r.ws}">${r.ws.toUpperCase()}</span>
                    <span class="provider-pill">${r.name}
                        <small class="infra-pill">via ${r.via}</small>
                    </span>
                </div>
            `).join('')}
        `;
    }

    function renderLimitChips(tier, subTier) {
        const cfg = TIER_CONTENT[tier];
        if (!cfg) return;
        let chips = cfg.limits;
        if (typeof chips === 'object' && !Array.isArray(chips)) {
            chips = chips[subTier] || chips.full;
        }
        const box = document.querySelector(`.tier-card-modern.tier-${tier} .tier-limits-box`);
        if (!box) return;
        box.innerHTML = chips.map((c, i) =>
            `<span class="limit-chip ${i === 0 ? 'highlight' : ''}">${c}</span>`
        ).join('');
    }

    function refreshTierCardPrices() {
        const isAnnual = currentBillingCycle === 'annual';

        const proSub = selectedSubtiers.pro;
        const proCfg = PRICING_CATALOG.pro[proSub];
        const proPrice = document.getElementById('pro-price-output');
        const proTerm  = document.getElementById('pro-term-output');
        const proLimit = document.getElementById('pro-limit-chip');
        if (proPrice) proPrice.innerText = isAnnual ? proCfg.annualMo : proCfg.monthly;
        if (proTerm)  proTerm.innerText = isAnnual ? `/mo ($${proCfg.annualTotal}/yr)` : '/mo';
        if (proLimit) proLimit.innerText = proCfg.quota;

        ['full','data','design'].forEach(t => {
            const el = document.getElementById(`pro-sub-${t}-price`);
            if (el) {
                const c = PRICING_CATALOG.pro[t];
                el.innerText = isAnnual ? `$${c.annualMo}/mo` : `$${c.monthly}/mo`;
            }
        });

        const bizSub = selectedSubtiers.business;
        const bizCfg = PRICING_CATALOG.business[bizSub];
        const bizPrice = document.getElementById('business-price-output');
        const bizTerm  = document.getElementById('business-term-output');
        const bizLimit = document.getElementById('business-limit-chip');
        if (bizPrice) bizPrice.innerText = isAnnual ? bizCfg.annualMo : bizCfg.monthly;
        if (bizTerm)  bizTerm.innerText = isAnnual ? `/mo ($${bizCfg.annualTotal}/yr)` : '/mo';
        if (bizLimit) bizLimit.innerText = bizCfg.quota;

        ['full','data','design'].forEach(t => {
            const el = document.getElementById(`biz-sub-${t}-price`);
            if (el) {
                const c = PRICING_CATALOG.business[t];
                el.innerText = isAnnual ? `$${c.annualMo}/mo` : `$${c.monthly}/mo`;
            }
        });

        renderFeatureList('free');
        renderFeatureList('pro', proSub);
        renderFeatureList('business', bizSub);
        renderModelSection('free');
        renderModelSection('pro');
        renderModelSection('business');
        renderLimitChips('pro', proSub);
        renderLimitChips('business', bizSub);
    }

    function setPricingPeriod(period) {
        currentBillingCycle = period;
        const m = document.getElementById('btn-period-monthly');
        const a = document.getElementById('btn-period-annual');
        if (m) m.classList.toggle('active', period === 'monthly');
        if (a) a.classList.toggle('active', period === 'annual');
        refreshTierCardPrices();
    }

    function updateTierSelection(tier, subtier) {
        selectedSubtiers[tier] = subtier;
        refreshTierCardPrices();
    }

    // ── Stripe loading overlay ───────────────────────────────────────────
    function showStripeLoading(onCancel) {
        const overlay = document.createElement('div');
        overlay.id = 'stripe-loading';
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.7);
            display: flex; align-items: center; justify-content: center;
            z-index: 99999; backdrop-filter: blur(4px);
        `;
        overlay.innerHTML = `
            <div style="background: var(--bg-card); padding: 30px 40px; border-radius: 16px; text-align: center; border: 1px solid var(--border-muted); position: relative; max-width: 90%;">
                <button onclick="hideStripeLoading(); if (typeof onCancel === 'function') onCancel();" style="position: absolute; top: 10px; right: 15px; background: none; border: none; font-size: 24px; color: var(--text-muted); cursor: pointer;">&times;</button>
                <span class="material-symbols-rounded" style="font-size: 48px; color: var(--accent-glow); animation: spin 1s linear infinite;">sync</span>
                <div style="margin-top: 15px; color: var(--text-main); font-weight: 600;">Redirecting to Stripe...</div>
                <div style="font-size: 13px; color: var(--text-muted);">Please wait</div>
                <button onclick="hideStripeLoading(); if (typeof onCancel === 'function') onCancel();" style="margin-top: 20px; padding: 8px 20px; border: 1px solid var(--border-muted); border-radius: 8px; background: transparent; color: var(--text-main); cursor: pointer;">Cancel</button>
            </div>
        `;
        document.body.appendChild(overlay);
        window._stripeCancelCallback = onCancel || null;
    }

    function hideStripeLoading() {
        const el = getEl('stripe-loading');
        if (el) el.remove();
        if (typeof window._stripeCancelCallback === 'function') {
            window._stripeCancelCallback();
            window._stripeCancelCallback = null;
        }
    }

    // ── Checkout pipeline ────────────────────────────────────────────────
    async function dispatchCheckoutPipeline(targetBaseTier) {
        if (st.isGuestMode || !localStorage.getItem('google_auth_token')) {
            showToast('Please sign in to upgrade your plan.', 'info');
            window.Axelr.showAuthWall();
            return;
        }
        if (!['pro', 'business'].includes(targetBaseTier)) {
            showToast('Invalid tier selected.', 'error');
            return;
        }

        const subTier = selectedSubtiers[targetBaseTier] || 'full';
        const period  = currentBillingCycle || 'monthly';

        const checkoutBtn = document.querySelector(`.tier-${targetBaseTier} .tier-cta-btn`);
        const originalText = checkoutBtn ? checkoutBtn.innerText : '';
        if (checkoutBtn) {
            checkoutBtn.innerText = 'Connecting to Stripe…';
            checkoutBtn.disabled = true;
        }

        let cancelled = false;
        showStripeLoading(() => { cancelled = true; });

        const restore = () => {
            hideStripeLoading();
            if (checkoutBtn) {
                checkoutBtn.innerText = originalText;
                checkoutBtn.disabled = false;
            }
        };

        try {
            const response = await apiFetch(`${API_BASE_URL}/api/billing/checkout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tier: targetBaseTier, subTier, period }),
            });

            let data = {};
            try { data = await response.json(); } catch (_) {}

            if (cancelled) { restore(); return; }

            if (response.ok && data.url) {
                setTimeout(() => { window.location.href = data.url; }, 250);
                return;
            }

            let msg = data.detail || data.message || 'Checkout failed. Please try again.';
            if (response.status === 409) {
                msg = 'You are already on this plan. Open the billing portal to change it.';
            } else if (response.status === 503) {
                msg = 'Billing is temporarily unavailable. Please try again shortly.';
            } else if (response.status === 401) {
                msg = 'Your session expired. Please sign in again.';
                window.Axelr.executeGlobalLogout();
                return;
            }
            showToast(msg, 'error');
            restore();
        } catch (e) {
            if (cancelled) return;
            console.error('Checkout error:', e);
            showToast('Network error — could not reach Stripe. Please retry.', 'error');
            restore();
        }
    }

    // ── Billing portal ───────────────────────────────────────────────────
    async function openBillingPortal() {
        if (st.isGuestMode || !localStorage.getItem('google_auth_token')) {
            window.Axelr.showAuthWall();
            return;
        }
        try {
            const resp = await apiFetch(`${API_BASE_URL}/api/billing/portal`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ returnUrl: window.location.href }),
            });
            const data = await resp.json().catch(() => ({}));
            if (resp.ok && data.url) {
                window.location.href = data.url;
            } else {
                showToast(data.detail || 'Unable to open billing portal.', 'error');
            }
        } catch (e) {
            showToast('Network error opening billing portal.', 'error');
        }
    }

    // ── Subscription modal ───────────────────────────────────────────────
    function openBillingFlow() {
        window.Axelr.closeModals();
        const modal = getEl('subscription-modal');
        if (modal) modal.classList.add('active');
        updateSubscriptionModal();
    }

    function openSubscriptionModal() {
        window.Axelr.closeModals();
        const modal = getEl('subscription-modal');
        if (!modal) return;
        const planName = getEl('sub-plan-name')?.innerText || 'Free';
        const isFree = planName.toLowerCase().includes('free');
        const content = getEl('subscription-content');
        if (content) {
            if (isFree) {
                content.innerHTML = `
                    <div style="padding:20px 0;text-align:center;">
                        <span class="material-symbols-rounded" style="font-size:48px;color:var(--accent-glow);">rocket_launch</span>
                        <h3 style="color:var(--text-main);margin:12px 0;">You are on the Free Plan</h3>
                        <p style="color:var(--text-muted);font-size:14px;">Unlock unlimited extractions, UI generations, and priority support.</p>
                    </div>
                `;
            } else {
                content.innerHTML = `
                    <div style="display:flex;flex-direction:column;gap:12px;">
                        <div class="profile-stat-row">
                            <span class="profile-stat-label">Current Plan</span>
                            <span class="profile-stat-value" style="color:var(--text-main);">${planName}</span>
                        </div>
                        <button onclick="openBillingPortal()"
                            style="margin-top:8px;padding:10px 16px;border:none;border-radius:8px;
                                   background:var(--accent-glow);color:#000;font-weight:600;cursor:pointer;">
                            Manage Billing &amp; Invoices
                        </button>
                    </div>
                `;
            }
        }
        modal.classList.add('active');
        updateSubscriptionModal();
    }

    function updateSubscriptionModal() {
        const planName = getEl('sub-plan-name')?.innerText || 'Free';
        const freeMsg = getEl('free-tier-message');
        const paidMsg = getEl('paid-tier-message');
        const paidName = getEl('paid-tier-name');
        const detailsSpan = getEl('subscription-details');
        if (planName.toLowerCase().includes('free')) {
            if (freeMsg) freeMsg.style.display = 'block';
            if (paidMsg) paidMsg.style.display = 'none';
        } else {
            if (freeMsg) freeMsg.style.display = 'none';
            if (paidMsg) paidMsg.style.display = 'block';
            if (paidName) paidName.innerText = planName.replace(' ALLOCATION', '');
            if (detailsSpan) detailsSpan.innerText = 'Active subscription. Manage your plan via Stripe.';
        }
    }

    // ── Billing return handler ───────────────────────────────────────────
    (function handleBillingReturn() {
        const params = new URLSearchParams(window.location.search);
        const billing = params.get('billing');
        if (!billing) return;

        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);

        if (billing === 'success') {
            showToast('🎉 Subscription activated! Refreshing your account…', 'success');
            let attempts = 0;
            const poll = setInterval(async () => {
                attempts += 1;
                try { await window.Axelr.loadUserProfile(); } catch (_) {}
                if (window.currentUser?.tier && window.currentUser.tier !== 'free') {
                    clearInterval(poll);
                    showToast(`Welcome to ${window.currentUser.tier.toUpperCase()}!`, 'success');
                } else if (attempts >= 10) {
                    clearInterval(poll);
                }
            }, 1500);
        } else if (billing === 'cancelled') {
            showToast('Checkout cancelled — no charge was made.', 'info');
        } else if (billing === 'portal_return') {
            window.Axelr.loadUserProfile().catch(() => {});
        }
    })();

    // ── Kick off initial card render ─────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(refreshTierCardPrices, 200);
    });

    // ── Publish ──────────────────────────────────────────────────────────
    Object.assign(window.Axelr, {
        PRICING_CATALOG, TIER_CONTENT,
        renderFeatureList, renderModelSection, renderLimitChips,
        refreshTierCardPrices, setPricingPeriod, updateTierSelection,
        showStripeLoading, hideStripeLoading,
        dispatchCheckoutPipeline, openBillingPortal,
        openBillingFlow, openSubscriptionModal, updateSubscriptionModal,
        getCurrentBillingCycle: () => currentBillingCycle,
        getSelectedSubtiers: () => selectedSubtiers,
    });
    Object.entries({
        renderFeatureList, renderModelSection, renderLimitChips,
        refreshTierCardPrices, setPricingPeriod, updateTierSelection,
        showStripeLoading, hideStripeLoading,
        dispatchCheckoutPipeline, openBillingPortal,
        openBillingFlow, openSubscriptionModal, updateSubscriptionModal,
    }).forEach(([k, v]) => { window[k] = v; });
})();