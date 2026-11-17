/*!
 * axelr-ux.js — ShadowTyping · FixItOverlay · VelocityAdaptor · VisualFeedback · SHISHotkeyManager (#5 SHIS)
 * Load order: after context, before orchestrator.
 * Memory: ≈8 KB + hotkey registry.
 */
(function (global) {
    "use strict";
    const NS = global.AxelrInput;
    if (!NS || !NS.READY) { console.warn("axelr-ux: core required"); return; }
    const { log, telemetry } = NS;

    // ══════════════════════════════════════════════════════════════════
    // §1 — ShadowTyping
    // ══════════════════════════════════════════════════════════════════
    class ShadowTyping {
        constructor(inputEl, ghostEl, capacity = 50) {
            this.input = inputEl; this.ghost = ghostEl;
            this.cap = capacity;
            this.history = new Array(capacity).fill("");
            this.ptr = 0; this.len = 0;
            this.abort = new AbortController();
            inputEl.addEventListener("input", () => this._update(), { signal: this.abort.signal, passive: true });
            inputEl.addEventListener("keydown", (e) => {
                if (e.key === "Tab" && this.ghost.textContent) {
                    e.preventDefault();
                    inputEl.value += this.ghost.textContent;
                    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
                    this.ghost.textContent = "";
                }
            }, { signal: this.abort.signal });
        }
        record(command) {
            if (!command) return;
            this.history[this.ptr] = command;
            this.ptr = (this.ptr + 1) % this.cap;
            if (this.len < this.cap) this.len++;
        }
        _update() {
            const v = this.input.value;
            if (!v) { this.ghost.textContent = ""; return; }
            let best = "";
            for (let i = 0; i < this.len; i++) {
                const c = this.history[i];
                if (c.length > v.length && c.startsWith(v)) {
                    if (best === "" || c.length < best.length) best = c;
                }
            }
            this.ghost.textContent = best ? best.slice(v.length) : "";
        }
        dispose() { this.abort.abort(); this.history.fill(""); this.input = null; this.ghost = null; }
    }
    NS.ShadowTyping = ShadowTyping;

    // ══════════════════════════════════════════════════════════════════
    // §2 — FixItOverlay
    // ══════════════════════════════════════════════════════════════════
    const SWAP_RE = /(?:swap|replace|change)\s+(?:the\s+word\s+)?["']?(\w+)["']?\s+(?:with|to|for)\s+["']?(\w+)["']?/i;
    const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    class FixItOverlay {
        constructor(inputEl, voice) {
            this.input = inputEl; this.voice = voice;
            this.abort = new AbortController();
            this.frozen = false; this._disposed = false;
            global.addEventListener("keydown", (e) => this._onKey(e), { signal: this.abort.signal, passive: false });
        }
        _onKey(e) {
            if (!this.voice || !this.input || this.frozen) return;
            if (!e.ctrlKey || !e.shiftKey || (e.key !== "X" && e.key !== "x")) return;
            e.preventDefault();
            this.frozen = true;
            const prev = this.input.value;
            this.input.readOnly = true;
            telemetry.count("fixit.trigger");
            this.voice.once().then((cmd) => {
                if (this._disposed) return;
                this.frozen = false;
                this.input.readOnly = false;
                if (!cmd) return;
                const m = SWAP_RE.exec(cmd);
                if (!m) return;
                const [, from, to] = m;
                const re = new RegExp(`\\b${escapeRe(from)}\\b`, "g");
                const next = prev.replace(re, to);
                if (next === prev) return;
                this.input.value = next;
                this.input.dispatchEvent(new Event("input", { bubbles: true }));
                this.input.dispatchEvent(new CustomEvent("axelr:corrected", { detail: { prev, next, undoMs: 500 } }));
                telemetry.count("fixit.applied");
            }).catch(() => { this.frozen = false; this.input.readOnly = false; });
        }
        dispose() {
            this._disposed = true;
            this.abort.abort();
            this.frozen = false;
            if (this.input) this.input.readOnly = false;
            this.input = null; this.voice = null;
        }
    }
    NS.FixItOverlay = FixItOverlay;

    // ══════════════════════════════════════════════════════════════════
    // §3 — VelocityAdaptor
    // ══════════════════════════════════════════════════════════════════
    class VelocityAdaptor {
        constructor(targetEl, onAggressive, opts = {}) {
            this.target = targetEl;
            this.cb = onAggressive;
            this.windowMs = opts.windowMs || 5000;
            this.aggressiveWpm = opts.aggressiveWpm || 90;
            this.cap = opts.capacity || 128;
            this.mask = this.cap - 1;
            this.times = new Float64Array(this.cap);
            this.ptr = 0; this.len = 0;
            this.aggressive = false; this._enabled = true;
            // Injectable clock for testability, defaults to real time
            this._clock = opts.clock || { now: () => performance.now() };
            this.abort = new AbortController();
            targetEl.addEventListener("keydown", () => this._onKey(), { signal: this.abort.signal, passive: true });
        }
        /** Public test helper to record keypress at specific timestamp (for synthetic tests) */
        recordKeypressAt(ts) {
            if (this._enabled) this._onKey(ts);
        }
        setEnabled(on) {
            if (on === false) {
                this._enabled = false;
                if (this.abort) this.abort.abort();
                this.abort = new AbortController();
                this.times.fill(0); this.len = 0; this.ptr = 0;
                this.aggressive = false;
                if (this.cb) this.cb(false, 0);
            } else {
                this._enabled = true;
                if (this.target) {
                    this.target.addEventListener("keydown", () => this._onKey(), { signal: this.abort.signal, passive: true });
                }
            }
        }
        _onKey(customTs = null) {
            if (!this._enabled) return;
            const now = customTs !== null ? customTs : this._clock.now();
            this.times[this.ptr] = now;
            this.ptr = (this.ptr + 1) & this.mask;
            if (this.len < this.cap) this.len++;
            const wpm = this.getWPM();
            const next = wpm >= this.aggressiveWpm;
            if (next !== this.aggressive) {
                this.aggressive = next;
                if (this.cb) this.cb(next, wpm);
                telemetry.count(next ? "velocity.on" : "velocity.off");
            }
        }
        getWPM() {
            if (this.len === 0) return 0;
            const now = this._clock.now();
            let n = 0;
            for (let i = 0; i < this.len; i++) {
                const idx = (this.ptr - 1 - i) & this.mask;
                if (now - this.times[idx] > this.windowMs) break;
                n++;
            }
            return (n / 5) * (60000 / this.windowMs);
        }
        isAggressive() { return this.aggressive; }
        dispose() { this.abort.abort(); this.times.fill(0); this.target = null; this.cb = null; }
    }
    NS.VelocityAdaptor = VelocityAdaptor;

    // ══════════════════════════════════════════════════════════════════
    // §4 — VisualFeedback
    // ══════════════════════════════════════════════════════════════════
    const STYLE_ID = "axelr-input-vfx";
    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const s = document.createElement("style");
        s.id = STYLE_ID;
        s.textContent = `.axelr-input-corrected{background-color:rgba(46,204,113,0.28)!important;transition:background-color 500ms ease-out;border-radius:3px}.axelr-input-ghost{color:var(--text-muted,#94a3b8);opacity:0.55;font-style:italic;pointer-events:none;user-select:none}`;
        document.head.appendChild(s);
    }
    class VisualFeedback {
        constructor(targetEl, inputEl) {
            this.target = targetEl; this.input = inputEl;
            this._cleanup = null; this._timer = null;
            ensureStyles();
        }
        flash(previousValue, onUndo) {
            const target = this.target, input = this.input;
            if (!target) return;
            if (this._cleanup) this._cleanup();
            if (this._timer) { clearTimeout(this._timer); this._timer = null; }
            target.classList.add("axelr-input-corrected");
            const handleUndo = (e) => {
                if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
                    e.preventDefault(); e.stopPropagation();
                    if (input) { input.value = previousValue; input.dispatchEvent(new Event("input", { bubbles: true })); }
                    if (onUndo) try { onUndo(); } catch (_) {}
                    cleanup();
                }
            };
            const cleanup = () => {
                global.removeEventListener("keydown", handleUndo, true);
                target.classList.remove("axelr-input-corrected");
                if (this._cleanup === cleanup) this._cleanup = null;
                if (this._timer) { clearTimeout(this._timer); this._timer = null; }
            };
            this._cleanup = cleanup;
            global.addEventListener("keydown", handleUndo, true);
            this._timer = setTimeout(cleanup, 500);
            telemetry.count("vfx.flash");
        }
        dispose() { if (this._cleanup) this._cleanup(); this.target = null; this.input = null; }
    }
    NS.VisualFeedback = VisualFeedback;

    // ══════════════════════════════════════════════════════════════════
    // §5 — SHISHotkeyManager (#5 SHIS)
    // Intercepts keydown in capture phase BEFORE engine listeners; allows
    // registering global hotkeys with modifiers, chording, and per-app
    // scoping. Conflicts are surfaced via a diagnostics map.
    // ══════════════════════════════════════════════════════════════════
    class SHISHotkeyManager {
        constructor() {
            this._bindings = new Map();      // "ctrl+shift+x" → { fn, scope, id }
            this._conflicts = [];
            this._abort = new AbortController();
            this._active = true;
            global.addEventListener("keydown", (e) => this._onKey(e), {
                signal: this._abort.signal, capture: true, passive: false
            });
        }
        /**
         * @param {string} combo - "ctrl+shift+x", "meta+k", "alt+ArrowUp"
         * @param {Function} fn
         * @param {object} [opts] - { scope?: string, id?: string }
         * @returns {Function} unsubscribe
         */
        register(combo, fn, opts = {}) {
            const key = this._normalize(combo);
            if (!key) throw new Error("invalid combo: " + combo);
            if (this._bindings.has(key)) {
                const existing = this._bindings.get(key);
                this._conflicts.push({ combo: key, existing: existing.id, incoming: opts.id });
                telemetry.count("shis.conflict");
            }
            this._bindings.set(key, { fn, scope: opts.scope || null, id: opts.id || null });
            return () => { this._bindings.delete(key); };
        }
        unregister(combo) { return this._bindings.delete(this._normalize(combo)); }
        _normalize(combo) {
            const parts = String(combo || "").toLowerCase().split("+").map(p => p.trim()).filter(Boolean);
            if (!parts.length) return null;
            const mods = [], key = [];
            for (const p of parts) {
                if (p === "ctrl" || p === "control") mods.push("ctrl");
                else if (p === "shift") mods.push("shift");
                else if (p === "alt" || p === "option") mods.push("alt");
                else if (p === "meta" || p === "cmd" || p === "command") mods.push("meta");
                else key.push(p);
            }
            mods.sort();
            return mods.join("+") + (mods.length && key.length ? "+" : "") + key.join("+");
        }
        _onKey(e) {
            if (!this._active) return;
            const parts = [];
            if (e.ctrlKey) parts.push("ctrl");
            if (e.shiftKey) parts.push("shift");
            if (e.altKey) parts.push("alt");
            if (e.metaKey) parts.push("meta");
            const k = String(e.key || "").toLowerCase();
            if (k.length === 1 || ["arrowup","arrowdown","arrowleft","arrowright","tab","enter","escape","backspace","delete"," "].includes(k)) parts.push(k);
            else if (k.startsWith("f") && k.length <= 3) parts.push(k);
            const combo = parts.join("+");
            const binding = this._bindings.get(combo);
            if (binding) {
                e.preventDefault(); e.stopPropagation();
                try { binding.fn(e); } catch (err) { log(1, "hotkey:", err); telemetry.count("shis.error"); }
            }
        }
        list() { return [...this._bindings.entries()].map(([k, v]) => ({ combo: k, scope: v.scope, id: v.id })); }
        conflicts() { return [...this._conflicts]; }
        enable() { this._active = true; }
        disable() { this._active = false; }
        dispose() {
            this._active = false;
            this._abort.abort();
            this._bindings.clear();
            this._conflicts = [];
        }
    }
    NS.SHISHotkeyManager = SHISHotkeyManager;

    // ══════════════════════════════════════════════════════════════════
    // §6 — AccessibilityProxy (#8 E8)
    // Returns real accessibility snapshot when platform supports it;
    // returns null otherwise, never fabricates data.
    // ══════════════════════════════════════════════════════════════════
    function accessibilityProxy() {
        try {
            // Verify all required APIs exist before attempting to access them
            if (typeof window.getSelection !== "function" || 
                typeof document.activeElement === "undefined" ||
                typeof navigator.accessibility === "undefined") {
                // Platform doesn't expose required APIs, return clean null
                return null;
            }

            const selection = window.getSelection();
            const activeElement = document.activeElement;
            
            // Build snapshot only with verifiable data
            const snapshot = {
                selection: selection ? {
                    text: selection.toString().substring(0, 1024), // Cap at 1KB to avoid large payloads
                    rangeCount: selection.rangeCount,
                    isCollapsed: selection.isCollapsed
                } : null,
                activeElement: activeElement ? {
                    tagName: activeElement.tagName?.toLowerCase(),
                    id: activeElement.id || null,
                    isInput: /input|textarea|editable/.test(activeElement.tagName?.toLowerCase() || ""),
                    ariaRole: activeElement.getAttribute?.("role") || null
                } : null,
                accessibility: { ...navigator.accessibility }, // Shallow copy to avoid reference leaks
                timestamp: performance.now()
            };

            // Validate snapshot before returning - never return partial garbage
            if (!snapshot.selection && !snapshot.activeElement) return null;
            return snapshot;
        } catch (e) {
            // Any unexpected error (permission denied, etc.) return null
            log(2, "accessibility-proxy: failed to capture snapshot", e);
            telemetry.count("accessibility.snapshot_failed");
            return null;
        }
    }
    NS.accessibilityProxy = accessibilityProxy;

    log(3, "ux loaded (SHIS + accessibility proxy)");
})(typeof window !== "undefined" ? window : self);