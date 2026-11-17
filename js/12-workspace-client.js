// js/12-workspace-client.js
// AXELR AI — workspace client v1.0
//
// This file contains NO detector.  The single source of truth is
// api/workspace_detector.py.  Parity is guaranteed by construction:
// there is exactly one implementation.
//
// Anything in this file that touches detection is a network shim.
// The only client-side logic retained is hysteresis (routeWorkspace /
// routeEx), which is a pure UI concern and is documented in the Python
// module's public surface so the two cannot drift.
(function () {
    "use strict";
    window.Axelr = window.Axelr || {};

    const DETECT_URL = "/api/workspace/detect";
    const PRIME_URL  = "/api/workspace/prime";
    const CLEAR_URL  = "/api/workspace/clear";
    const SWITCH_THRESHOLD = 0.65;
    const STICKY_THRESHOLD = 0.45;

    const _inflight = new Map();   // dedupe identical concurrent calls

    async function _post(url, payload) {
        const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            credentials: "same-origin",
        });
        if (!r.ok) throw new Error("workspace api: HTTP " + r.status);
        return r.json();
    }

    function _normalizeFiles(files) {
        if (!files || !files.length) return [];
        const out = [];
        for (const f of files) {
            const n = f && (f.filename || f.name);
            if (n) out.push({ filename: String(n) });
        }
        return out;
    }

    // ── Async detection (the ONLY way to get a workspace) ───────────────
    async function detectWorkspaceFull(prompt, files, sessionId) {
        const payload = {
            prompt: String(prompt || "").slice(0, 500),
            files: _normalizeFiles(files),
            session_id: sessionId || "",
        };
        const key = JSON.stringify(payload);
        let p = _inflight.get(key);
        if (p) return p;
        p = _post(DETECT_URL, payload).finally(() => _inflight.delete(key));
        _inflight.set(key, p);
        return p;
        // Resolves to: {workspace, confidence, method, signals, scores}
    }

    async function detectWorkspace(prompt, files, sessionId) {
        return (await detectWorkspaceFull(prompt, files, sessionId)).workspace;
    }

    // ── Client-only hysteresis (no network, no config drift) ────────────
    // These mirror route() / route_ex() in workspace_detector.py and are
    // frozen constants there; if the server thresholds ever change, this
    // file must change too — that is the only parity surface left.
    function routeWorkspace(current, result, threshold) {
        const t = threshold === undefined ? SWITCH_THRESHOLD : threshold;
        if (result.confidence >= t && result.workspace !== current)
            return result.workspace;
        return current;
    }
    function routeEx(current, result, previous, threshold, sticky) {
        const t = threshold === undefined ? SWITCH_THRESHOLD : threshold;
        const s = sticky   === undefined ? STICKY_THRESHOLD : sticky;
        if (result.workspace === current) return [current, "no_change"];
        if (result.confidence >= t)       return [result.workspace, "switch"];
        if (previous && result.workspace === previous && result.confidence >= s)
            return [result.workspace, "revert"];
        return [current, "below_threshold"];
    }

    // ── Session cache lives server-side only ────────────────────────────
    async function primeSession(workspace, sessionId) {
        if (!sessionId) return;
        await _post(PRIME_URL, { workspace, session_id: sessionId });
    }
    async function clearSession(sessionId) {
        if (!sessionId) return;
        await _post(CLEAR_URL, { session_id: sessionId });
    }

    Object.assign(window.Axelr, {
        detectWorkspace,
        detectWorkspaceFull,
        routeWorkspace,
        routeEx,
        primeSession,
        clearSession,
        SWITCH_THRESHOLD,
        STICKY_THRESHOLD,
    });
    window.detectWorkspace  = detectWorkspace;
    window.routeWorkspace   = routeWorkspace;

    /* ══════════════════════════════════════════════════════════════
       The following three blocks are UNCHANGED from 12-elite.js.
       They are genuinely UI concerns (auth, DOM, storage default) and
       have nothing to do with workspace detection.
       ══════════════════════════════════════════════════════════════ */

    // ── Google sign-in cancel button ────────────────────────────────────
    function _installGoogleCancel() {
        const orig = window.Axelr.triggerGoogleLogin;
        if (typeof orig !== "function" || orig.__patched) return;
        const patched = function () {
            const overlay = document.createElement("div");
            overlay.id = "google-loading-overlay";
            overlay.style.cssText =
                "position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:99999;" +
                "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;" +
                "backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);";
            overlay.innerHTML =
                '<div style="display:flex;flex-direction:column;align-items:center;gap:14px;' +
                    'background:var(--bg-card);padding:32px 40px;border-radius:20px;' +
                    'border:1px solid var(--border-muted);max-width:90%;">' +
                    '<span class="material-symbols-rounded" style="font-size:44px;color:var(--accent-glow);animation:spin 1s linear infinite;">sync</span>' +
                    '<div style="font-size:15px;color:var(--text-main);font-weight:600;">Signing in…</div>' +
                    '<div style="font-size:12.5px;color:var(--text-muted);text-align:center;max-width:260px;">Waiting for Google to respond.</div>' +
                    '<button id="google-cancel-btn" style="margin-top:6px;padding:9px 22px;border:1px solid var(--border-muted);' +
                        'border-radius:10px;background:transparent;color:var(--text-main);cursor:pointer;' +
                        'font-size:13px;font-weight:600;font-family:Inter,sans-serif;">Cancel</button>' +
                '</div>';
            document.body.appendChild(overlay);
            let poll = null, hardTimeout = null;
            const cleanup = () => {
                const el = document.getElementById("google-loading-overlay");
                if (el) el.remove();
                if (poll) clearInterval(poll);
                if (hardTimeout) clearTimeout(hardTimeout);
            };
            document.getElementById("google-cancel-btn").onclick = cleanup;
            poll = setInterval(() => {
                if (localStorage.getItem("google_auth_token")) cleanup();
            }, 500);
            hardTimeout = setTimeout(cleanup, 45000);
            const start = () => {
                if (typeof google === "undefined" || !google.accounts?.id) return false;
                google.accounts.id.initialize({
                    client_id: window.Axelr.GOOGLE_CLIENT_ID,
                    callback: (resp) => {
                        cleanup();
                        if (window.Axelr.handleCredentialResponse)
                            window.Axelr.handleCredentialResponse(resp);
                    },
                    cancel_on_tap_outside: false,
                    context: "signin",
                    use_fedcm_for_prompt: false,
                });
                google.accounts.id.prompt();
                return true;
            };
            if (!start()) {
                let n = 0;
                const r = setInterval(() => {
                    n++;
                    if (start() || n >= 30) {
                        clearInterval(r);
                        if (n >= 30) {
                            cleanup();
                            alert("Google Sign-In could not start. Please refresh.");
                        }
                    }
                }, 100);
            }
        };
        patched.__patched = true;
        window.Axelr.triggerGoogleLogin = patched;
        window.triggerGoogleLogin = patched;
    }

    // ── Default to Core on arrival & logout ─────────────────────────────
    function _installCoreDefault() {
        const stored = localStorage.getItem("Axelr_workspace");
        if (!stored || !["core","data","design"].includes(stored)) {
            localStorage.setItem("Axelr_workspace", "core");
        }
        const origLogout = window.Axelr.executeGlobalLogout;
        if (typeof origLogout === "function" && !origLogout.__patched) {
            const p = function () {
                origLogout.apply(this, arguments);
                localStorage.setItem("Axelr_workspace", "core");
                document.body.classList.remove("workspace-data","workspace-design");
                document.body.classList.add("workspace-core");
            };
            p.__patched = true;
            window.Axelr.executeGlobalLogout = p;
            window.executeGlobalLogout = p;
        }
        const origShowAuth = window.Axelr.showAuthWall;
        if (typeof origShowAuth === "function" && !origShowAuth.__patched) {
            const p = function () {
                localStorage.setItem("Axelr_workspace", "core");
                origShowAuth.apply(this, arguments);
            };
            p.__patched = true;
            window.Axelr.showAuthWall = p;
            window.showAuthWall = p;
        }
    }

    // ── Auth button resilience ──────────────────────────────────────────
    function _installAuthResilience() {
        document.addEventListener("click", (e) => {
            const btn = e.target.closest(".auth-provider-btn");
            if (!btn || btn.getAttribute("onclick")) return;
            e.preventDefault();
            const which = btn.classList.contains("google")  ? "google"
                        : btn.classList.contains("github")  ? "github"
                        : btn.classList.contains("email")   ? "email"
                        : btn.classList.contains("passkey") ? "passkey"
                        : null;
            if (!which) return;
            try {
                if (which === "google")  window.Axelr.triggerGoogleLogin?.();
                if (which === "github")  window.Axelr.triggerGitHubLogin?.();
                if (which === "email")   window.Axelr.showEmailLogin?.();
                if (which === "passkey") window.Axelr.triggerPasskeyLogin?.();
            } catch (err) { console.warn("Auth fallback error:", err); }
        }, true);
    }

    document.addEventListener("DOMContentLoaded", () => {
        setTimeout(() => {
            _installGoogleCancel();
            _installCoreDefault();
            _installAuthResilience();
        }, 60);
    });
})();