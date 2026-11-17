/*!
 * axelr-core.js — Namespace · Config · Logging · Telemetry · TokenRing · IntentFilter · KVCache
 * Systems: base infrastructure for #1–#15. Load order: FIRST (before all others).
 * Memory: ≈18 KB + TokenRing (256 KB) + KVCache (≤64 KB).
 */
(function (global) {
    "use strict";
    const NS = global.AxelrInput = global.AxelrInput || {};
    NS.VERSION = "3.0.0";
    NS.CODENAME = "HALO-T0-ELITE";

    /** @typedef {"off"|"error"|"warn"|"info"|"debug"} LogLevel */
    const CONFIG = Object.freeze({
        RING_CAPACITY: 256,
        RING_MAX_TOKEN_BYTES: 1024,
        INTENT_MAX_PROMPT: 800,
        TELEMETRY_CAPACITY: 2048,
        LOG_LEVEL: 0,
        CPS_WINDOW_MS: 2000,
        CPS_RING: 256,
        KVCACHE_CAPACITY: 128,           // session state slots
        KVCACHE_MAX_TOKEN: 64,           // chars per stored token
        ERROR_TAXONOMY: true
    });
    NS.CONFIG = CONFIG;

    // ── Environment probes ────────────────────────────────────────────
    const HAS_SAB = (() => {
        if (typeof SharedArrayBuffer === "undefined") return false;
        if (typeof global.crossOriginIsolated !== "undefined" && !global.crossOriginIsolated) return false;
        try { new SharedArrayBuffer(8); return true; } catch (_) { return false; }
    })();
    NS.HAS_SAB = HAS_SAB;

    // Singletons — created once, reused forever
    const ENC = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
    const DEC = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;
    NS.ENC = ENC;
    NS.DEC = DEC;

    // ── Structured error taxonomy (elite: dashboards filter by category) ─
    const ERR = Object.freeze({
        OK: "ok",
        // categories → numeric bands (aligned with HTTP where sensible)
        ASR: 1, AUDIO: 2, CORRECTION: 3, CONTEXT: 4, UX: 5,
        INFRA: 6, PERMISSION: 7, WORKER: 8, BRIDGE: 9,
        // named codes
        E_ASR_INIT: "E100", E_ASR_TIMEOUT: "E101", E_ASR_MODEL: "E102",
        E_AUDIO_MIC: "E200", E_AUDIO_CTX: "E201", E_AUDIO_WORKLET: "E202",
        E_CNN_OOM: "E300", E_SYMSPELL_BUILD: "E301", E_REVISOR_RAF: "E302", E_CORRECT_CNN: "E303",
        E_CTX_SCRAPE: "E400", E_CTX_TRIE: "E401",
        E_UX_VELOCITY: "E500",
        E_INFRA_DISPOSE: "E600", E_INFRA_OVERFLOW: "E601",
        E_PERM_DENIED: "E700",
        E_WORKER_SPAWN: "E800", E_WORKER_MSG: "E801",
        E_BRIDGE_WS: "E900", E_BRIDGE_FALLBACK: "E901"
    });
    NS.ERR = ERR;

    // ── Logger ────────────────────────────────────────────────────────
    const TAGS = ["[off]", "[err]", "[warn]", "[info]", "[dbg]"];
    /**
     * @param {number} level 0=off 1=error 2=warn 3=info 4=debug
     * @param {...any} args
     */
    function log(level, ...args) {
        if (level > CONFIG.LOG_LEVEL) return;
        const fn = level === 1 ? console.error
                 : level === 2 ? console.warn
                 : level === 4 ? (console.debug || console.log)
                 : console.info;
        try { fn.call(console, TAGS[level] || "[?]", ...args); } catch (_) {}
    }
    NS.log = log;

    // ── Disposal registry ─────────────────────────────────────────────
    const _disposers = [];
    function registerDisposable(fn, label) {
        _disposers.push({ fn, label: label || "anon" });
        return fn;
    }
    NS.registerDisposable = registerDisposable;
    function disposeAll() {
        while (_disposers.length) {
            const d = _disposers.pop();
            try { d.fn(); } catch (e) { log(1, "dispose failed:", d.label, e); }
        }
    }
    NS.disposeAll = disposeAll;

    // ── Telemetry (structured counters + ring) ────────────────────────
    class Telemetry {
        constructor(cap) {
            this.cap = cap | 0;
            this.events = new Array(cap);
            this.head = 0;
            this.eventCount = 0;
            this.counters = Object.create(null);
            this.errors = Object.create(null);      // structured errors
            this._startedAt = (typeof performance !== "undefined" ? performance.now() : Date.now());
        }
        /** @param {string} name */
        count(name) { this.counters[name] = (this.counters[name] | 0) + 1; }
        /** @param {string} code @param {string} msg @param {object} [meta] */
        error(code, msg, meta) {
            this.errors[code] = (this.errors[code] | 0) + 1;
            if (this.events) {
                this.events[this.head] = { ts: performance.now(), kind: "error", code, msg, meta };
                this.head = (this.head + 1) & (this.cap - 1);
                if (this.eventCount < this.cap) this.eventCount++;
            }
        }
        record(kind, payload) {
            this.events[this.head] = { ts: performance.now(), kind, payload };
            this.head = (this.head + 1) & (this.cap - 1);
            if (this.eventCount < this.cap) this.eventCount++;
        }
        snapshot() {
            const out = new Array(this.eventCount);
            const start = (this.head - this.eventCount + this.cap) & (this.cap - 1);
            for (let i = 0; i < this.eventCount; i++) out[i] = this.events[(start + i) & (this.cap - 1)];
            return {
                version: NS.VERSION,
                uptimeMs: Math.round(performance.now() - this._startedAt),
                counters: { ...this.counters },
                errors: { ...this.errors },
                events: out.slice(-64)   // tail only — dashboard use
            };
        }
        /**
         * Render Prometheus text format (text/plain) for metrics scraping.
         * Generates standard # HELP / # TYPE comments + counter/error metric lines.
         * Does not include performance.memory polling - that lives in axelr-memory.js.
         */
        render() {
            const lines = [];
            const now = performance.now();
            
            // Counters metadata and values
            lines.push('# HELP axelr_events_total Total number of events by type');
            lines.push('# TYPE axelr_events_total counter');
            for (const [name, value] of Object.entries(this.counters)) {
                lines.push(`axelr_events_total{type="${name.replace(/"/g, '\\"')}"} ${value} ${Math.round(now)}`);
            }
            
            // Errors metadata and values
            lines.push('# HELP axelr_errors_total Total number of errors by code');
            lines.push('# TYPE axelr_errors_total counter');
            for (const [code, value] of Object.entries(this.errors)) {
                lines.push(`axelr_errors_total{code="${code.replace(/"/g, '\\"')}"} ${value} ${Math.round(now)}`);
            }
            
            // Uptime gauge
            lines.push('# HELP axelr_uptime_ms Total uptime in milliseconds');
            lines.push('# TYPE axelr_uptime_ms gauge');
            lines.push(`axelr_uptime_ms ${Math.round(now - this._startedAt)}`);
            
            return lines.join('\n');
        }
        dispose() { this.events.fill(null); this.events = null; }
    }
    NS.telemetry = new Telemetry(CONFIG.TELEMETRY_CAPACITY);
    registerDisposable(() => NS.telemetry.dispose(), "telemetry");

    // ── ThroughputTracker (CPS) ───────────────────────────────────────
    class ThroughputTracker {
        constructor(windowMs = CONFIG.CPS_WINDOW_MS, cap = CONFIG.CPS_RING) {
            this.windowMs = windowMs;
            this.cap = cap; this.mask = cap - 1;
            this.ts = new Float64Array(cap);
            this.chars = new Uint16Array(cap);
            this.ptr = 0; this.len = 0;
            this.totalChars = 0; this.totalSamples = 0;
            this.peakCPS = 0;
        }
        record(n) {
            if (n <= 0) return;
            this.ts[this.ptr] = performance.now();
            this.chars[this.ptr] = Math.min(65535, n);
            this.ptr = (this.ptr + 1) & this.mask;
            if (this.len < this.cap) this.len++;
            this.totalChars += n; this.totalSamples++;
            const c = this.getCPS();
            if (c > this.peakCPS) this.peakCPS = c;
        }
        getCPS() {
            if (this.len === 0) return 0;
            const now = performance.now();
            let sum = 0, span = 0;
            for (let i = 0; i < this.len; i++) {
                const idx = (this.ptr - 1 - i) & this.mask;
                if (now - this.ts[idx] > this.windowMs) break;
                sum += this.chars[idx];
                if (span === 0) span = now - this.ts[idx];
            }
            if (span < 100) span = 100;
            return (sum * 1000) / span;
        }
        getStats() { return { cps: Math.round(this.getCPS()), peakCPS: Math.round(this.peakCPS), totalChars: this.totalChars, totalSamples: this.totalSamples }; }
        dispose() { this.ts.fill(0); this.chars.fill(0); this.len = 0; }
    }
    NS.throughput = new ThroughputTracker();
    registerDisposable(() => NS.throughput.dispose(), "throughput");

    // ── TokenRing (SAB-backed, zero-alloc hot path) ──────────────────
    class TokenRing {
        constructor(cap = CONFIG.RING_CAPACITY) {
            if ((cap & (cap - 1)) !== 0 || cap <= 0) throw new Error("power-of-two required");
            this.cap = cap; this.mask = cap - 1;
            this.maxBytes = CONFIG.RING_MAX_TOKEN_BYTES;
            this.totalBytes = cap * this.maxBytes;
            const dataBuf = HAS_SAB ? new SharedArrayBuffer(this.totalBytes) : new ArrayBuffer(this.totalBytes);
            const metaBuf = HAS_SAB ? new SharedArrayBuffer(cap * 8) : new ArrayBuffer(cap * 8);
            this.data = new Uint8Array(dataBuf);
            this.meta = new Uint32Array(metaBuf);   // [len, pad] per slot
            this.head = 0; this.count = 0; this.dropped = 0;
            this._slotView = new Uint8Array(this.maxBytes);   // reused subarray view
        }
        push(token) {
            if (typeof token !== "string" || token.length === 0) return false;
            if (token.length > this.maxBytes) { this.dropped++; return false; }
            const slotOff = this.head * this.maxBytes;
            let written = 0;
            if (ENC) {
                const r = ENC.encodeInto(token, this.data.subarray(slotOff, slotOff + this.maxBytes));
                written = r.written;
                if (r.read < token.length) { this.dropped++; return false; }
            } else {
                for (let i = 0; i < token.length; i++) {
                    const c = token.charCodeAt(i);
                    if (c < 0x80) this.data[slotOff + written++] = c;
                    else if (c < 0x800) { this.data[slotOff + written++] = 0xC0 | (c >> 6); this.data[slotOff + written++] = 0x80 | (c & 0x3F); }
                    else { this.data[slotOff + written++] = 0xE0 | (c >> 12); this.data[slotOff + written++] = 0x80 | ((c >> 6) & 0x3F); this.data[slotOff + written++] = 0x80 | (c & 0x3F); }
                    if (written >= this.maxBytes) break;
                }
            }
            this.meta[this.head * 2] = written;
            this.head = (this.head + 1) & this.mask;
            if (this.count < this.cap) this.count++;
            else { this.dropped++; NS.telemetry.error(ERR.E_INFRA_OVERFLOW, "ring full"); }
            NS.telemetry.count("ring.push");
            NS.throughput.record(written);
            return true;
        }
        pop() {
            if (this.count === 0) return null;
            this.head = (this.head - 1 + this.cap) & this.mask;
            const off = this.head * this.maxBytes;
            const len = this.meta[this.head * 2];
            this.meta[this.head * 2] = 0;
            this.count--;
            NS.telemetry.count("ring.pop");
            if (len === 0) return "";
            if (DEC) return DEC.decode(this.data.subarray(off, off + len));
            let s = "";
            for (let i = off; i < off + len; i++) s += String.fromCharCode(this.data[i]);
            return s;
        }
        popN(n) { const out = []; for (let i = 0; i < n && this.count > 0; i++) { const t = this.pop(); if (t === null) break; out.push(t); } return out.reverse(); }
        peek(offset = 0) {
            if (offset < 0 || offset >= this.count) return null;
            const idx = (this.head - 1 - offset + this.cap) & this.mask;
            const off = idx * this.maxBytes, len = this.meta[idx * 2];
            if (len === 0) return "";
            return DEC ? DEC.decode(this.data.subarray(off, off + len)) : "";
        }
        join(sep = " ") {
            if (this.count === 0) return "";
            const start = (this.head - this.count + this.cap) & this.mask;
            const parts = new Array(this.count);
            for (let i = 0; i < this.count; i++) {
                const idx = (start + i) & this.mask;
                const off = idx * this.maxBytes, len = this.meta[idx * 2];
                parts[i] = len > 0 && DEC ? DEC.decode(this.data.subarray(off, off + len)) : "";
            }
            return parts.join(sep);
        }
        clear() { this.meta.fill(0); this.head = 0; this.count = 0; }
        size() { return this.count; }
        isEmpty() { return this.count === 0; }
        dispose() { 
            // ELITE: Zero out memory before releasing references for security
            if (this.data) { this.data.fill(0); this.data = null; }
            if (this.meta) { this.meta.fill(0); this.meta = null; }
            if (this._slotView) { this._slotView.fill(0); this._slotView = null; }
            this._disposed = true;
        }
        // ELITE: Use-after-dispose protection
        _checkDisposed() {
            if (this._disposed) throw new Error("TokenRing: Cannot use disposed instance");
        }
    }
    // Store original methods first, then wrap with dispose checks
    const originalPush = TokenRing.prototype.push;
    const originalPop = TokenRing.prototype.pop;
    const originalPopN = TokenRing.prototype.popN;
    const originalPeek = TokenRing.prototype.peek;
    const originalJoin = TokenRing.prototype.join;
    const originalClear = TokenRing.prototype.clear;
    const originalSize = TokenRing.prototype.size;
    const originalIsEmpty = TokenRing.prototype.isEmpty;

    // ELITE: Wrap all public methods to include dispose check
    TokenRing.prototype.push = function(token) { this._checkDisposed(); return originalPush.call(this, token); };
    TokenRing.prototype.pop = function() { this._checkDisposed(); return originalPop.call(this); };
    TokenRing.prototype.popN = function(n) { this._checkDisposed(); return originalPopN.call(this, n); };
    TokenRing.prototype.peek = function(offset = 0) { this._checkDisposed(); return originalPeek.call(this, offset); };
    TokenRing.prototype.join = function(sep = " ") { this._checkDisposed(); return originalJoin.call(this, sep); };
    TokenRing.prototype.clear = function() { this._checkDisposed(); return originalClear.call(this); };
    TokenRing.prototype.size = function() { this._checkDisposed(); return originalSize.call(this); };
    TokenRing.prototype.isEmpty = function() { this._checkDisposed(); return originalIsEmpty.call(this); };
    NS.TokenRing = TokenRing;

    // ── IntentFilter (deterministic command parsing) ─────────────────
    const INTENT = Object.freeze({
        SCRATCH: /^(?:wait[,\s]+)?(?:scratch that|scratch this|forget (?:that|it|everything)|never ?mind|cancel that|ignore that|disregard that|start over|reset)$/i,
        DELETE_WORDS: /^(?:no,?\s+)?(?:delete|remove|erase|drop)\s+(?:the\s+)?(?:last\s+)?(\d+)?\s*words?$/i,
        DELETE_SENTENCE: /^(?:no,?\s+)?(?:delete|remove|erase|drop)\s+(?:the\s+)?(?:last\s+)?sentence$/i,
        DELETE_AFTER: /^(?:delete|remove|erase)\s+everything\s+(?:after|following)\s+(?:the\s+)?(\d+|first|second|third)\s+words?$/i,
        REPLACE: /^(?:actually[,\s]+)?(?:change|swap|replace|make|set)\s+(?:that|it|the last \w+|the last \d+ words?)\s+(?:to|with|into)\s+(.+)$/i,
        ACTUALLY: /^(?:no[,\s]+wait[,\s]+|actually[,\s]+)(?:say|tell (?:him|her|them)|write)\s+(.+)$/i
    });
    const NUM_WORDS = Object.freeze({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, first: 1, second: 2, third: 3 });
    function parseCount(raw) {
        if (!raw) return 1;
        const n = parseInt(raw, 10);
        if (!isNaN(n) && n > 0) return Math.min(n, 50);
        return NUM_WORDS[String(raw).toLowerCase()] || 1;
    }
    class IntentFilter {
        constructor(ring) {
            if (!(ring instanceof TokenRing)) throw new TypeError("ring required");
            this.ring = ring; this.hits = Object.create(null);
        }
        applyFinal(transcript) {
            const text = String(transcript || "").trim();
            if (!text) return { kind: "empty", applied: 0, buffer: this.ring.join() };
            const scanned = text.length > CONFIG.INTENT_MAX_PROMPT ? text.slice(0, CONFIG.INTENT_MAX_PROMPT) : text;
            if (INTENT.SCRATCH.test(scanned)) {
                const dropped = this.ring.size(); this.ring.clear(); this._hit("scratch");
                return { kind: "scratch", applied: dropped, buffer: "" };
            }
            let m = INTENT.DELETE_WORDS.exec(scanned);
            if (m) { const n = parseCount(m[1]); this._hit("delete_words"); return { kind: "delete_words", applied: this.ring.popN(n).length, buffer: this.ring.join() }; }
            if (INTENT.DELETE_SENTENCE.test(scanned)) {
                this._hit("delete_sentence"); const dropped = [];
                for (let i = 0; i < this.ring.size(); i++) { const t = this.ring.pop(); if (t === null) break; dropped.push(t); if (/[.!?]$/.test(t)) break; }
                return { kind: "delete_sentence", applied: dropped.length, buffer: this.ring.join() };
            }
            m = INTENT.DELETE_AFTER.exec(scanned);
            if (m) { const keep = parseCount(m[1]); this._hit("delete_after"); while (this.ring.size() > keep) this.ring.pop(); return { kind: "delete_after", applied: 0, buffer: this.ring.join() }; }
            m = INTENT.REPLACE.exec(scanned);
            if (m) { this._hit("replace"); this.ring.pop(); this.ring.push(m[1].trim()); return { kind: "replace", applied: 1, buffer: this.ring.join() }; }
            m = INTENT.ACTUALLY.exec(scanned);
            if (m) { this._hit("actually"); const prev = this.ring.pop(); this.ring.push(m[1].trim()); return { kind: "actually", applied: prev ? 1 : 0, buffer: this.ring.join() }; }
            this.ring.push(scanned);
            return { kind: "tokens", applied: 0, buffer: this.ring.join() };
        }
        _hit(n) { this.hits[n] = (this.hits[n] | 0) + 1; }
        stats() { return { ...this.hits }; }
        dispose() { this.ring = null; }
    }
    NS.IntentFilter = IntentFilter;

    // ── KVCache (#9: eviction-bounded session state) ─────────────────
    /**
     * LRU-bounded key-value store used for orchestrator session state.
     * Unlike AcousticMap (Word→Word corrections), this stores arbitrary
     * session values (e.g., "last_command", "asr_tier", "warmup_ts")
     * and evicts oldest when full. Not persisted.
     */
    class KVCache {
        constructor(cap = CONFIG.KVCACHE_CAPACITY) {
            this.cap = cap | 0;
            this.map = new Map();
            this.hits = 0; this.misses = 0;
        }
        /** @param {string} key @param {*} value */
        set(key, value) {
            const k = String(key).slice(0, CONFIG.KVCACHE_MAX_TOKEN);
            this.map.delete(k);
            this.map.set(k, value);
            while (this.map.size > this.cap) {
                const oldest = this.map.keys().next().value;
                this.map.delete(oldest);
                NS.telemetry.count("kvcache.evict");
            }
        }
        get(key) {
            const k = String(key).slice(0, CONFIG.KVCACHE_MAX_TOKEN);
            if (!this.map.has(k)) { this.misses++; return undefined; }
            const v = this.map.get(k);
            this.map.delete(k); this.map.set(k, v);   // LRU touch
            this.hits++;
            return v;
        }
        has(key) { return this.map.has(String(key).slice(0, CONFIG.KVCACHE_MAX_TOKEN)); }
        delete(key) { return this.map.delete(String(key).slice(0, CONFIG.KVCACHE_MAX_TOKEN)); }
        size() { return this.map.size; }
        clear() { this.map.clear(); }
        dispose() { 
            // ELITE: Clear all entries and zero out for security
            this.map.clear(); 
            this.map = null; 
            this._disposed = true;
        }
        // ELITE: Use-after-dispose protection
        _checkDisposed() {
            if (this._disposed) throw new Error("KVCache: Cannot use disposed instance");
        }
    }
    // Store original methods first, then wrap with dispose checks
    const originalSet = KVCache.prototype.set;
    const originalGet = KVCache.prototype.get;
    const originalHas = KVCache.prototype.has;
    const originalDelete = KVCache.prototype.delete;
    const kvcacheOriginalSize = KVCache.prototype.size;
    const kvcacheOriginalClear = KVCache.prototype.clear;

    // ELITE: Wrap all public methods to include dispose check
    KVCache.prototype.set = function(key, value) { this._checkDisposed(); return originalSet.call(this, key, value); };
    KVCache.prototype.get = function(key) { this._checkDisposed(); return originalGet.call(this, key); };
    KVCache.prototype.has = function(key) { this._checkDisposed(); return originalHas.call(this, key); };
    KVCache.prototype.delete = function(key) { this._checkDisposed(); return originalDelete.call(this, key); };
    KVCache.prototype.size = function() { this._checkDisposed(); return kvcacheOriginalSize.call(this); };
    KVCache.prototype.clear = function() { this._checkDisposed(); return kvcacheOriginalClear.call(this); };
    NS.KVCache = KVCache;

    // ── SessionFingerprint (elite: skip warmup on repeat device) ─────
    /**
     * Derives a short hash of (locale, hw concurrency, first 3 user-agent chars)
     * so warmup can be skipped when returning within 24h (stored in localStorage).
     */
    class SessionFingerprint {
        constructor() {
            const parts = [
                String((global.navigator && global.navigator.language) || "en").slice(0, 8),
                String((global.navigator && global.navigator.hardwareConcurrency) || 4),
                String(global.navigator && global.navigator.userAgent || "").slice(0, 3)
            ].join("|");
            let h = 0x811c9dc5;
            for (let i = 0; i < parts.length; i++) h = ((h ^ parts.charCodeAt(i)) * 0x01000193) | 0;
            this.hash = (h >>> 0).toString(16).padStart(8, "0");
        }
        /** @returns {boolean} true if warmup can be skipped */
        isWarm() {
            try {
                const raw = global.localStorage.getItem("axelr.fp.warm");
                if (!raw) return false;
                const { hash, ts } = JSON.parse(raw);
                return hash === this.hash && (Date.now() - ts) < 86400000;
            } catch (_) { return false; }
        }
        markWarm() {
            try { global.localStorage.setItem("axelr.fp.warm", JSON.stringify({ hash: this.hash, ts: Date.now() })); } catch (_) {}
        }
    }
    NS.SessionFingerprint = SessionFingerprint;
    // ── SSDR (#new): Session State Diff Replay ─────────────────────
    /**
     * Append-only event log with bounded memory (512 events max). Each
     * event stores: {seq, t, op, args}. Enables deterministic replay of
     * any session by iterating events and applying. Oldest dropped when
     * full. Emits to telemetry.
     */
    class SSDR {
        constructor(cap = 512) {
            this.cap = cap;
            this.buffer = new Array(cap);
            this.head = 0;
            this.count = 0;
            this.seq = 0;
            this._replaying = false;
        }
        /** @param {string} op @param {object} [args] */
        log(op, args) {
            if (this._replaying) return;
            this.buffer[this.head] = { seq: this.seq++, t: performance.now(), op, args: args || {} };
            this.head = (this.head + 1) & (this.cap - 1);
            if (this.count < this.cap) this.count++;
        }
        /** @param {(event) => void} handler */
        replay(handler) {
            if (!handler) return;
            this._replaying = true;
            try {
                const start = (this.head - this.count + this.cap) & (this.cap - 1);
                for (let i = 0; i < this.count; i++) {
                    const ev = this.buffer[(start + i) & (this.cap - 1)];
                    try { handler(ev); } catch (e) { log(1, "ssdr replay:", e); }
                }
            } finally { this._replaying = false; }
        }
        /** @returns {object[]} */
        export() {
            const out = new Array(this.count);
            const start = (this.head - this.count + this.cap) & (this.cap - 1);
            for (let i = 0; i < this.count; i++) out[i] = this.buffer[(start + i) & (this.cap - 1)];
            return out;
        }
        size() { return this.count; }
        clear() { this.buffer.fill(null); this.head = 0; this.count = 0; }
        dispose() { this.clear(); this.buffer = null; }
    }
    NS.SSDR = SSDR;

    // ── LazyConsent (GDPR-compliant consent management) ──────────────
    const CONSENT_STORAGE_KEY = "axelr.consent.v1";
    const REQUIRED_CONSENTS = Object.freeze([
        "data_processing",
        "analytics",
        "crash_reporting",
        "personalization"
    ]);
    const CONSENT_METADATA = Object.freeze({
        data_processing: { required: true, description: "Necessary for core functionality" },
        analytics: { required: false, description: "Help improve product usage" },
        crash_reporting: { required: false, description: "Send anonymous crash logs" },
        personalization: { required: false, description: "Enable personalized experiences" }
    });

    class LazyConsent {
        constructor() {
            this._consents = new Map();
            this._listeners = new Map();
            this._storageAvailable = this._probeStorage();
            this._hydrate();
        }

        _probeStorage() {
            try { global.localStorage.setItem("__c__", "1"); global.localStorage.removeItem("__c__"); return true; }
            catch (_) { return false; }
        }

        _hydrate() {
            if (!this._storageAvailable) return;
            let raw; try { raw = global.localStorage.getItem(CONSENT_STORAGE_KEY); } catch (_) { return; }
            if (!raw) return;
            let parsed; try { parsed = JSON.parse(raw); } catch (_) { return; }
            if (typeof parsed !== "object") return;
            for (const [key, value] of Object.entries(parsed)) {
                if (REQUIRED_CONSENTS.includes(key) && typeof value === "boolean") {
                    this._consents.set(key, value);
                }
            }
        }

        _persist() {
            if (!this._storageAvailable) return;
            const data = {};
            for (const [key, value] of this._consents.entries()) {
                data[key] = value;
            }
            try { global.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(data)); }
            catch (e) { log(2, "consent persist:", e.message); }
        }

        check(consentKey) {
            if (!REQUIRED_CONSENTS.includes(consentKey)) return false;
            // Required consents are implicitly granted
            if (CONSENT_METADATA[consentKey].required) return true;
            return this._consents.get(consentKey) === true;
        }

        checkAll(consentKeys) {
            return consentKeys.every(key => this.check(key));
        }

        getMissingRequired() {
            const missing = [];
            for (const key of REQUIRED_CONSENTS) {
                if (CONSENT_METADATA[key].required && !this._consents.has(key)) {
                    missing.push(key);
                }
            }
            return missing;
        }

        grant(consentKey) {
            if (!REQUIRED_CONSENTS.includes(consentKey)) return false;
            if (this._consents.get(consentKey) !== true) {
                this._consents.set(consentKey, true);
                this._persist();
                this._emit(consentKey, true);
            }
            return true;
        }

        deny(consentKey) {
            if (!REQUIRED_CONSENTS.includes(consentKey)) return false;
            if (this._consents.get(consentKey) !== false) {
                this._consents.set(consentKey, false);
                this._persist();
                this._emit(consentKey, false);
            }
            return true;
        }

        grantAll() {
            for (const key of REQUIRED_CONSENTS) { this.grant(key); }
        }

        _emit(key, value) {
            const set = this._listeners.get(key);
            if (set) for (const fn of set) try { fn(value); } catch (_) {}
        }

        onChange(key, fn) {
            if (!this._listeners.has(key)) this._listeners.set(key, new Set());
            this._listeners.get(key).add(fn);
            return () => this._listeners.get(key).delete(fn);
        }

        getMetadata() { return CONSENT_METADATA; }
        getAll() {
            const res = {};
            for (const key of REQUIRED_CONSENTS) { res[key] = this.check(key); }
            return res;
        }
        dispose() {
            if (this._listeners) { this._listeners.clear(); this._listeners = null; }
            this._consents.clear();
        }
    }
    // Expose LazyConsent to global namespace (core is canonical owner)
    if (!NS.LazyConsent) NS.LazyConsent = LazyConsent;
    if (!NS.CONSENT_STORAGE_KEY) NS.CONSENT_STORAGE_KEY = CONSENT_STORAGE_KEY;
    if (!NS.REQUIRED_CONSENTS) NS.REQUIRED_CONSENTS = REQUIRED_CONSENTS;
    if (!NS.CONSENT_METADATA) NS.CONSENT_METADATA = CONSENT_METADATA;

    // Elite production extensions
    // Add memory watchdog for production leak protection
    const _memTimer = setInterval(() => {
        const used = performance.memory?.usedJSHeapSize || 0;
        if (used > 0.8 * (performance.memory?.jsHeapSizeLimit || Infinity)) {
            // Trigger cleanup when memory pressure is high
            NS.telemetry.record('memory_pressure', { used, limit: performance.memory.jsHeapSizeLimit });
            // Explicitly hint at garbage collection
            if (typeof global?.gc === 'function') global.gc();
        }
    }, 30000);
    registerDisposable(() => clearInterval(_memTimer), "memory-watchdog");

    NS.selfCheck = function () {
        const required = [
            ["TokenRing", NS.TokenRing], ["IntentFilter", NS.IntentFilter],
            ["KVCache", NS.KVCache], ["SSDR", NS.SSDR], ["LazyConsent", NS.LazyConsent],
            ["MetricsRegistry", NS.MetricsRegistry],
            ["AudioRing", NS.AudioRing], ["VAD", NS.VAD], ["VADCalibrator", NS.VADCalibrator],
            ["CharCNN", NS.CharCNN], ["GLBackend", NS.GLBackend],
            ["SymSpell", NS.SymSpell], ["levenshtein", NS.levenshtein],
            ["PhoneticCorrector", NS.PhoneticCorrector], ["HomophoneMatrix", NS.HomophoneMatrix],
            ["LPGN", NS.LPGN], ["Metaphone", NS.Metaphone],
            ["BBE", NS.BBE], ["ACX", NS.ACX], ["polish", NS.polish],
            ["LocaleRegistry", NS.LocaleRegistry], ["VoicePipeline", NS.VoicePipeline],
            ["LocalASR", NS.LocalASR], ["AsrRouter", NS.AsrRouter], ["SLCP", NS.SLCP],
            ["DoubleArrayTrie", NS.DoubleArrayTrie], ["RuntimeLexicon", NS.RuntimeLexicon],
            ["AcousticMap", NS.AcousticMap], ["ContextScraper", NS.ContextScraper],
            ["ShadowTyping", NS.ShadowTyping], ["FixItOverlay", NS.FixItOverlay],
            ["VelocityAdaptor", NS.VelocityAdaptor], ["VisualFeedback", NS.VisualFeedback],
            ["SHISHotkeyManager", NS.SHISHotkeyManager],
            ["MemoryBudget", NS.MemoryBudget], ["JSDegradationLadder", NS.JSDegradationLadder],
            ["ProtocolValidator", NS.ProtocolValidator], ["LatencyBudget", NS.LatencyBudget],
            ["DeterminismGuard", NS.DeterminismGuard], ["InputSanitizer", NS.InputSanitizer],
            ["UnifiedIPCBridge", NS.UnifiedIPCBridge], ["EliteBridge", NS.EliteBridge],
            ["LeaderElection", NS.LeaderElection],
            ["SettingsRegistry", NS.SettingsRegistry], ["LicenseVerifier", NS.LicenseVerifier],
            ["WarmupOrchestrator", NS.WarmupOrchestrator], ["ZTPSPermissionManager", NS.ZTPSPermissionManager],
            ["Setup", NS.Setup], ["RuntimeHealth", NS.health],
            ["InputEngine", NS.InputEngine],
            ["DeterministicClock", NS.DeterministicClock],
            ["CancellationRegistry", NS.CancellationRegistry],
            ["IdempotencyGuard", NS.IdempotencyGuard],
        ];
        const modules = {};
        let healthy = true;
        const missing = [];
        for (const [name, ref] of required) {
            const ok = ref !== undefined && ref !== null;
            modules[name] = ok;
            if (!ok) { healthy = false; missing.push(name); }
        }
        return {
            version: NS.VERSION,
            ready: NS.READY,
            sab: NS.HAS_SAB,
            webgl2: NS.CharCNNUtils ? NS.CharCNNUtils.HAS_WEBGL2 : false,
            healthy,
            missing,
            modules,
        };
    };

    NS.panicReset = function (opts = {}) {
        const cleared = [];
        try { if (NS._engine && NS._engine.dispose) NS._engine.dispose(); cleared.push("engine"); } catch (_) {}
        NS._engine = null;
        try { if (NS.health && NS.health.dispose) NS.health.dispose(); cleared.push("health"); } catch (_) {}
        try { if (NS._shis) NS._shis.dispose(); cleared.push("hotkeys"); } catch (_) {}
        try { if (NS._budget) NS._budget.dispose(); cleared.push("budget"); } catch (_) {}
        try { NS.disposeAll(); cleared.push("disposables"); } catch (_) {}
        if (opts.preserveLicense !== true) {
            try { localStorage.removeItem("axelr.license.v1"); cleared.push("license"); } catch (_) {}
        }
        if (opts.preserveSettings !== true) {
            try { localStorage.removeItem("axelr.settings.v1"); cleared.push("settings"); } catch (_) {}
        }
        if (opts.preserveCalibration !== true) {
            try { localStorage.removeItem("axelr.vad.calibration.v1"); cleared.push("calibration"); } catch (_) {}
        }
        if (NS.log) NS.log(2, "panic reset complete: " + cleared.join(", "));
        return { ok: true, cleared };
    };

    NS.READY = true;
    log(3, `core v${NS.VERSION} loaded (SAB=${HAS_SAB})`);
})(typeof window !== "undefined" ? window : globalThis);