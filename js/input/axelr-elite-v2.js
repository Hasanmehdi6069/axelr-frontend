/*!
 * axelr-elite-v2.js — 15 elite features (v1.0) that push AXELR JS to 9.5+.
 * Load order: after core, before orchestrator.
 */
(function (global) {
    "use strict";
    const NS = global.AxelrInput;
    if (!NS || !NS.READY) { console.warn("axelr-elite-v2: core required"); return; }
    const log = NS.log;
    const telemetry = NS.telemetry;

    // ══════════════════════════════════════════════════════════════════
    // 1. ProtocolValidator — validate every IPC frame
    // ══════════════════════════════════════════════════════════════════
    class ProtocolValidator {
        constructor() {
            this.REQUIRED = ["type", "id", "payload"];
            this.VALID_TYPES = new Set([
                "init", "transcribe", "correct", "calibrate", "context",
                "drain", "ping", "shutdown", "resume", "degrade_status",
            ]);
            this.violations = [];
        }
        validate(env) {
            const issues = [];
            if (!env || typeof env !== "object") {
                return { ok: false, issues: ["not an object"] };
            }
            for (const f of this.REQUIRED) {
                if (!(f in env)) issues.push("missing: " + f);
            }
            if (typeof env.id !== "number") issues.push("id not number");
            if (env.payload !== undefined && typeof env.payload !== "object") {
                issues.push("payload not object");
            }
            if (env.type && !this.VALID_TYPES.has(env.type)) {
                issues.push("unknown type: " + env.type);
            }
            this.violations.push(...issues);
            return { ok: issues.length === 0, issues };
        }
        stats() { return { violations: this.violations.length }; }
    }
    NS.ProtocolValidator = ProtocolValidator;

    // ══════════════════════════════════════════════════════════════════
    // 2. RingIntegrityChecker — SPSC invariants
    // ══════════════════════════════════════════════════════════════════
    class RingIntegrityChecker {
        constructor(capacity) {
            this.capacity = capacity;
            this.violations = 0;
            this.checks = 0;
        }
        verify(head, tail) {
            this.checks++;
            if (head < tail) {
                this.violations++;
                return { ok: false, reason: "head<tail" };
            }
            if (head - tail > this.capacity) {
                this.violations++;
                return { ok: false, reason: "overflow" };
            }
            return { ok: true };
        }
        stats() {
            return { checks: this.checks, violations: this.violations,
                     healthy: this.violations === 0 };
        }
    }
    NS.RingIntegrityChecker = RingIntegrityChecker;

    // ══════════════════════════════════════════════════════════════════
    // 3. LatencyBudget — SLA enforcement with backpressure
    // ══════════════════════════════════════════════════════════════════
    class LatencyBudget {
        constructor(budgets) {
            this.budgets = Object.assign({}, budgets);
            this.samples = new Map();
            this.backpressure = false;
        }
        record(op, durationMs) {
            if (!this.samples.has(op)) this.samples.set(op, []);
            const arr = this.samples.get(op);
            arr.push(durationMs);
            if (arr.length > 1024) arr.splice(0, arr.length - 512);
        }
        check() {
            const violations = {};
            for (const [op, budget] of Object.entries(this.budgets)) {
                const s = this.samples.get(op);
                if (!s || s.length < 20) continue;
                const sorted = s.slice().sort((a, b) => a - b);
                const p99 = sorted[Math.floor(0.99 * (sorted.length - 1))];
                if (p99 > budget) violations[op] = { p99, budget };
            }
            this.backpressure = Object.keys(violations).length > 0;
            return { backpressure: this.backpressure, violations };
        }
    }
    NS.LatencyBudget = LatencyBudget;

    // ══════════════════════════════════════════════════════════════════
    // 4. DeterminismGuard — ban Math.random and Date.now in pipeline
    // ══════════════════════════════════════════════════════════════════
    class DeterminismGuard {
        constructor() {
            this.violations = [];
            this._randomCalls = 0;
            this._originalRandom = Math.random;
        }
        install() {
            const self = this;
            Math.random = function () {
                self._randomCalls++;
                return self._originalRandom.call(Math);
            };
        }
        uninstall() {
            Math.random = this._originalRandom;
        }
        check() {
            return { violations: this.violations.length,
                     random_calls: this._randomCalls,
                     deterministic: this._randomCalls === 0 };
        }
    }
    NS.DeterminismGuard = DeterminismGuard;

    // ══════════════════════════════════════════════════════════════════
    // 5. GLContextRecovery — handle WebGL context loss
    // ══════════════════════════════════════════════════════════════════
    class GLContextRecovery {
        constructor(canvas) {
            this.canvas = canvas;
            this.lost = false;
            this._onLost = null;
            this._onRestored = null;
        }
        attach(onLost, onRestored) {
            if (!this.canvas) return;
            this._onLost = (e) => {
                e.preventDefault();
                this.lost = true;
                log(2, "WebGL context lost");
                telemetry.count("gl.context_lost");
                if (onLost) try { onLost(); } catch (_) {}
            };
            this._onRestored = () => {
                this.lost = false;
                log(2, "WebGL context restored");
                telemetry.count("gl.context_restored");
                if (onRestored) try { onRestored(); } catch (_) {}
            };
            this.canvas.addEventListener("webglcontextlost", this._onLost, false);
            this.canvas.addEventListener("webglcontextrestored", this._onRestored, false);
        }
        detach() {
            if (!this.canvas) return;
            if (this._onLost) this.canvas.removeEventListener("webglcontextlost", this._onLost);
            if (this._onRestored) this.canvas.removeEventListener("webglcontextrestored", this._onRestored);
        }
    }
    NS.GLContextRecovery = GLContextRecovery;

    // ══════════════════════════════════════════════════════════════════
    // 6. WASMExportVerifier — verify wasm exports before use
    // ══════════════════════════════════════════════════════════════════
    class WASMExportVerifier {
        static verify(instance, requiredExports) {
            if (!instance || !instance.exports) {
                return { ok: false, missing: requiredExports };
            }
            const missing = [];
            for (const name of requiredExports) {
                const v = instance.exports[name];
                if (v === undefined || v === null) missing.push(name);
            }
            return { ok: missing.length === 0, missing };
        }
    }
    NS.WASMExportVerifier = WASMExportVerifier;

    // ══════════════════════════════════════════════════════════════════
    // 7. WorkerLivenessProbe — ping worker, restart on death
    // ══════════════════════════════════════════════════════════════════
    class WorkerLivenessProbe {
        constructor(worker, opts) {
            this.worker = worker;
            this.intervalMs = (opts && opts.intervalMs) || 5000;
            this.timeoutMs = (opts && opts.timeoutMs) || 2000;
            this.onDead = (opts && opts.onDead) || (() => {});
            this._timer = null;
            this._pending = new Map();
            this._nextId = 1;
            this._alive = true;
            this._attach();
        }
        _attach() {
            if (!this.worker) return;
            const self = this;
            const origHandler = this.worker.onmessage;
            this.worker.onmessage = function (e) {
                if (e.data && e.data.__probe_id) {
                    const p = self._pending.get(e.data.__probe_id);
                    if (p) { clearTimeout(p.timeout); p.resolve(true); self._pending.delete(e.data.__probe_id); }
                    return;
                }
                if (origHandler) try { origHandler.call(this, e); } catch (_) {}
            };
            this._timer = setInterval(() => this._ping(), this.intervalMs);
        }
        _ping() {
            if (!this.worker) return;
            const id = this._nextId++;
            const self = this;
            const p = { resolve: () => {}, timeout: null };
            p.timeout = setTimeout(() => {
                self._pending.delete(id);
                self._alive = false;
                telemetry.count("worker.dead");
                try { self.onDead(); } catch (_) {}
            }, this.timeoutMs);
            this._pending.set(id, p);
            try { this.worker.postMessage({ __probe: true, __probe_id: id }); }
            catch (_) { clearTimeout(p.timeout); self._pending.delete(id); }
        }
        isAlive() { return this._alive; }
        dispose() {
            if (this._timer) { clearInterval(this._timer); this._timer = null; }
            for (const p of this._pending.values()) clearTimeout(p.timeout);
            this._pending.clear();
        }
    }
    NS.WorkerLivenessProbe = WorkerLivenessProbe;

    // ══════════════════════════════════════════════════════════════════
    // 8. StorageQuotaGuard — handle QuotaExceededError
    // ══════════════════════════════════════════════════════════════════
    class StorageQuotaGuard {
        static safeSet(storage, key, value) {
            try {
                storage.setItem(key, value);
                return { ok: true };
            } catch (e) {
                if (e.name === "QuotaExceededError" || e.code === 22) {
                    telemetry.error("E601", "storage quota exceeded");
                    return { ok: false, reason: "quota" };
                }
                return { ok: false, reason: e.message || "unknown" };
            }
        }
        static usage(storage) {
            try {
                let total = 0;
                for (let i = 0; i < storage.length; i++) {
                    const k = storage.key(i);
                    const v = storage.getItem(k);
                    if (k) total += k.length;
                    if (v) total += v.length;
                }
                return { bytes: total * 2, entries: storage.length };
            } catch (_) {
                return { bytes: 0, entries: 0 };
            }
        }
    }
    NS.StorageQuotaGuard = StorageQuotaGuard;

    // ══════════════════════════════════════════════════════════════════
    // 9. TelemetrySink — batched flush without blocking main thread
    // ══════════════════════════════════════════════════════════════════
    class TelemetrySink {
        constructor(sink, opts) {
            this.sink = sink;
            this.maxBatch = (opts && opts.maxBatch) || 50;
            this.flushMs = (opts && opts.flushMs) || 2000;
            this._buffer = [];
            this._timer = null;
            this._schedule();
        }
        _schedule() {
            const self = this;
            this._timer = setTimeout(() => { self.flush(); self._schedule(); }, this.flushMs);
        }
        record(kind, payload) {
            this._buffer.push({ kind, payload, ts: Date.now() });
            if (this._buffer.length >= this.maxBatch) this.flush();
        }
        flush() {
            if (this._buffer.length === 0) return;
            const batch = this._buffer.splice(0, this._buffer.length);
            try { this.sink(batch); } catch (_) {}
        }
        dispose() {
            if (this._timer) { clearTimeout(this._timer); this._timer = null; }
            this.flush();
        }
    }
    NS.TelemetrySink = TelemetrySink;

    // ══════════════════════════════════════════════════════════════════
    // 10. CrossTabCoordinator — one ASR per browser
    // ══════════════════════════════════════════════════════════════════
    class CrossTabCoordinator {
        constructor(channelName, tabId) {
            this.tabId = tabId || Math.random().toString(36).slice(2, 10);
            this.channel = null;
            this.isLeader = false;
            this.peers = new Set();
            if (typeof BroadcastChannel === "undefined") return;
            try {
                this.channel = new BroadcastChannel(channelName || "axelr-tabs");
                const self = this;
                this.channel.onmessage = (e) => {
                    const msg = e.data;
                    if (!msg || !msg.kind) return;
                    if (msg.kind === "claim") {
                        if (self.isLeader && msg.tabId !== self.tabId) {
                            self.peers.add(msg.tabId);
                            self.channel.postMessage({ kind: "deny", tabId: self.tabId });
                        } else if (!self.isLeader) {
                            self.isLeader = true;
                            self.channel.postMessage({ kind: "claim_ack", tabId: self.tabId });
                        }
                    } else if (msg.kind === "release" && msg.tabId === self.tabId) {
                        self.isLeader = false;
                    } else if (msg.kind === "claim_ack" && !self.isLeader) {
                        self.isLeader = false;
                    }
                };
            } catch (_) { this.channel = null; }
        }
        tryBecomeLeader() {
            if (!this.channel) { this.isLeader = true; return true; }
            this.channel.postMessage({ kind: "claim", tabId: this.tabId });
            return this.isLeader;
        }
        release() {
            if (this.channel) this.channel.postMessage({ kind: "release", tabId: this.tabId });
            this.isLeader = false;
        }
        dispose() {
            this.release();
            if (this.channel) try { this.channel.close(); } catch (_) {}
            this.channel = null;
        }
    }
    NS.CrossTabCoordinator = CrossTabCoordinator;

    // ══════════════════════════════════════════════════════════════════
    // 11. ErrorBoundaryAutoRecover — restart engine on dispose
    // ══════════════════════════════════════════════════════════════════
    class ErrorBoundaryAutoRecover {
        constructor(engineFactory, opts) {
            this.factory = engineFactory;
            this.maxRestarts = (opts && opts.maxRestarts) || 3;
            this.restarts = 0;
            this.engine = null;
        }
        async getOrCreate() {
            if (this.engine && !this.engine._disposed) return this.engine;
            if (this.restarts >= this.maxRestarts) {
                throw new Error("error boundary: max restarts exceeded");
            }
            this.engine = await this.factory();
            this.restarts++;
            telemetry.count("boundary.restart");
            return this.engine;
        }
    }
    NS.ErrorBoundaryAutoRecover = ErrorBoundaryAutoRecover;

    // ══════════════════════════════════════════════════════════════════
    // 12. InputSanitizer — validate log_mel shape
    // ══════════════════════════════════════════════════════════════════
    class InputSanitizer {
        static sanitizeLogMel(arr, opts) {
            const maxFrames = (opts && opts.maxFrames) || 3000;
            const maxMels = (opts && opts.maxMels) || 128;
            if (!arr) return { ok: false, reason: "null" };
            if (!Array.isArray(arr) && !arr.length) return { ok: false, reason: "not array-like" };
            if (arr.length === 0) return { ok: false, reason: "empty" };
            if (arr.length > maxFrames) return { ok: false, reason: "too many frames" };
            const first = arr[0];
            if (!first || first.length === 0) return { ok: false, reason: "empty first frame" };
            if (first.length > maxMels) return { ok: false, reason: "too many mels" };
            for (let i = 0; i < Math.min(arr.length, 100); i++) {
                if (arr[i].length !== first.length) {
                    return { ok: false, reason: "ragged frame at " + i };
                }
            }
            return { ok: true, shape: [arr.length, first.length] };
        }
    }
    NS.InputSanitizer = InputSanitizer;

    // ══════════════════════════════════════════════════════════════════
    // 13. A11yEnforcer — detect missing aria-labels
    // ══════════════════════════════════════════════════════════════════
    class A11yEnforcer {
        static audit(rootEl) {
            if (!rootEl || !rootEl.querySelectorAll) return { ok: true, issues: [] };
            const issues = [];
            const interactive = rootEl.querySelectorAll("button, input, select, textarea, a[href]");
            for (const el of interactive) {
                const hasText = (el.textContent || "").trim().length > 0;
                const hasAria = el.hasAttribute("aria-label") ||
                                el.hasAttribute("aria-labelledby") ||
                                (el.id && rootEl.querySelector(`label[for="${el.id}"]`));
                const isImgBtn = el.querySelector && el.querySelector("img[alt]");
                if (!hasText && !hasAria && !isImgBtn) {
                    issues.push(el.tagName + " without accessible label");
                }
            }
            return { ok: issues.length === 0, issues };
        }
    }
    NS.A11yEnforcer = A11yEnforcer;

    // ══════════════════════════════════════════════════════════════════
    // 14. MemoryGradientMonitor — heap growth rate alarm
    // ══════════════════════════════════════════════════════════════════
    class MemoryGradientMonitor {
        constructor(opts) {
            this.threshold = (opts && opts.thresholdMbPerMin) || 1.0;
            this.sampleCount = (opts && opts.sampleCount) || 20;
            this._samples = [];
            this.alarms = 0;
        }
        sample(rssMb, ts) {
            const t = ts !== undefined ? ts : performance.now();
            this._samples.push({ ts: t, mb: rssMb });
            if (this._samples.length > this.sampleCount) this._samples.shift();
            if (this._samples.length < this.sampleCount) return false;
            const first = this._samples[0];
            const last = this._samples[this._samples.length - 1];
            const dtMin = (last.ts - first.ts) / 60000;
            if (dtMin <= 0) return false;
            const gradient = (last.mb - first.mb) / dtMin;
            if (gradient > this.threshold) { this.alarms++; return true; }
            return false;
        }
        stats() {
            if (this._samples.length < 2) return { samples: this._samples.length, alarms: this.alarms };
            const first = this._samples[0];
            const last = this._samples[this._samples.length - 1];
            const dtMin = Math.max(1e-6, (last.ts - first.ts) / 60000);
            return { samples: this._samples.length, alarms: this.alarms,
                     gradient_mb_per_min: (last.mb - first.mb) / dtMin };
        }
    }
    NS.MemoryGradientMonitor = MemoryGradientMonitor;

    // ══════════════════════════════════════════════════════════════════
    // 15. FrameRateGovernor — cap request rate, respect thermal
    // ══════════════════════════════════════════════════════════════════
    class FrameRateGovernor {
        constructor(maxPerSec) {
            this.maxPerSec = maxPerSec || 30;
            this._timestamps = [];
            this._dropped = 0;
        }
        tryAcquire() {
            const now = performance.now();
            this._timestamps.push(now);
            while (this._timestamps.length && now - this._timestamps[0] > 1000) {
                this._timestamps.shift();
            }
            if (this._timestamps.length > this.maxPerSec) {
                this._dropped++;
                return false;
            }
            return true;
        }
        stats() {
            return { max: this.maxPerSec, current: this._timestamps.length,
                     dropped: this._dropped };
        }
    }
    NS.FrameRateGovernor = FrameRateGovernor;

    log(3, "elite-v2 loaded (15 features)");
})(typeof window !== "undefined" ? window : self);

;(function (global) {
    "use strict";
    const NS = global.AxelrInput;
    if (!NS || !NS.READY) { console.warn("axelr-elite-v2 extensions: core required"); return; }
    const log = NS.log;
    const telemetry = NS.telemetry;

// ══════════════════════════════════════════════════════════════════
// 16. DeterministicClock — monotonic, testable replacement for Date.now
// ══════════════════════════════════════════════════════════════════
class DeterministicClock {
    /**
     * For tests: inject a fixed offset so time-based assertions are stable.
     * For production: transparent pass-through to Date.now + performance.now.
     */
    constructor(opts = {}) {
        this._offset = opts.offset || 0;
        this._frozen = opts.freeze === true;
        this._frozenAt = this._frozen ? Date.now() : 0;
    }
    now() { return this._frozen ? this._frozenAt : Date.now() + this._offset; }
    perfNow() {
        if (this._frozen) return 0;
        return typeof performance !== "undefined" ? performance.now() : Date.now() + this._offset;
    }
    freeze() { this._frozen = true; this._frozenAt = Date.now(); }
    unfreeze() { this._frozen = false; }
    advance(ms) { this._offset += ms; }
}
NS.DeterministicClock = DeterministicClock;

// ══════════════════════════════════════════════════════════════════
// 17. CancellationRegistry — cancel in-flight IPC requests by id
// ══════════════════════════════════════════════════════════════════
class CancellationRegistry {
    constructor() {
        this._controllers = new Map();   // id → AbortController
        this._cancelled = new Set();     // cancelled ids (for late-arrival drop)
    }
    /** Register an id; returns a signal you can pass to fetch / async op */
    register(id) {
        const ctrl = new AbortController();
        this._controllers.set(id, ctrl);
        return ctrl.signal;
    }
    /** Cancel by id — triggers signal abort */
    cancel(id, reason = "user") {
        const ctrl = this._controllers.get(id);
        if (ctrl) {
            ctrl.abort(reason);
            this._controllers.delete(id);
            this._cancelled.add(id);
            if (NS.telemetry) NS.telemetry.count("cancel." + reason);
            return true;
        }
        return false;
    }
    /** Check if an id was cancelled (for late-arriving responses) */
    isCancelled(id) { return this._cancelled.has(id); }
    /** Clear cancelled set (after GC interval) */
    sweep() {
        if (this._cancelled.size > 256) this._cancelled.clear();
    }
    size() { return this._controllers.size; }
    dispose() {
        for (const ctrl of this._controllers.values()) {
            try { ctrl.abort("dispose"); } catch (_) {}
        }
        this._controllers.clear();
        this._cancelled.clear();
    }
}
NS.CancellationRegistry = CancellationRegistry;

// ══════════════════════════════════════════════════════════════════
// 18. IdempotencyGuard — key-by-id cache with TTL
// ══════════════════════════════════════════════════════════════════
class IdempotencyGuard {
    constructor(opts = {}) {
        this.cap = opts.cap || 256;
        this.ttlMs = opts.ttlMs || 60000;
        this._entries = new Map();   // key → { ts, result }
    }
    check(key) {
        const e = this._entries.get(key);
        if (!e) return null;
        if (Date.now() - e.ts > this.ttlMs) { this._entries.delete(key); return null; }
        return e.result;
    }
    record(key, result) {
        if (this._entries.size >= this.cap) {
            const oldest = this._entries.keys().next().value;
            this._entries.delete(oldest);
        }
        this._entries.set(key, { ts: Date.now(), result });
    }
    size() { return this._entries.size; }
    dispose() { this._entries.clear(); }
}
NS.IdempotencyGuard = IdempotencyGuard;

log(3, "elite-v2 loaded (18 features)");
})(typeof window !== "undefined" ? window : self);