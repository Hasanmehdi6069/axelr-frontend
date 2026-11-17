/*!
 * axelr-bridge-elite.js — Circuit breaker · Protocol validation · Idempotency.
 *
 * Wraps UnifiedIPCBridge (from axelr-bridge.js) without replacing it.
 * Exposes `NS.createEliteBridge(opts)` — the recommended bridge for production.
 *
 * Load order: after bridge, before runtime-health.
 */
(function (global) {
    "use strict";
    const NS = global.AxelrInput;
    if (!NS || !NS.READY) { console.warn("axelr-bridge-elite: core required"); return; }
    const log = NS.log || function () {};
    const telemetry = NS.telemetry || { count() {}, error() {} };
    const metrics = NS.metrics || { inc() {}, set() {}, observe() {} };
    const ERR = NS.ERR || { E_BRIDGE_WS: "E900", E_BRIDGE_FALLBACK: "E901" };

    // ══════════════════════════════════════════════════════════════════
    // §1 — Circuit breaker (independent of reconnect)
    // ══════════════════════════════════════════════════════════════════
    class BridgeCircuitBreaker {
        constructor(opts = {}) {
            this.threshold = opts.threshold || 5;
            this.recoveryMs = opts.recoveryMs || 30000;
            this.state = "closed";          // closed | open | half_open
            this._failures = 0;
            this._openedAt = 0;
            this._halfOpenStarted = 0;
            this._halfOpenTimeoutMs = opts.halfOpenTimeoutMs || 5000;
        }
        allow() {
            const now = Date.now();
            if (this.state === "closed") return true;
            if (this.state === "open") {
                if (now - this._openedAt >= this.recoveryMs) {
                    this.state = "half_open";
                    this._halfOpenStarted = now;
                    telemetry.count("bridge.circuit_half_open");
                    return true;
                }
                return false;
            }
            // half_open — allow one attempt, timeout reopens
            if (now - this._halfOpenStarted > this._halfOpenTimeoutMs) {
                this._open("half_open_timeout");
                return false;
            }
            return true;
        }
        recordSuccess() {
            if (this.state === "half_open" || this.state === "closed") {
                this.state = "closed";
                this._failures = 0;
                telemetry.count("bridge.circuit_closed");
            }
        }
        recordFailure() {
            this._failures++;
            if (this._failures >= this.threshold || this.state === "half_open") {
                this._open("failure_threshold");
            }
        }
        _open(reason) {
            this.state = "open";
            this._openedAt = Date.now();
            telemetry.count("bridge.circuit_open");
            metrics.inc("axelr_circuit_open_total");
            log(2, `bridge circuit OPEN (${reason})`);
        }
        snapshot() {
            return {
                state: this.state, failures: this._failures,
                threshold: this.threshold, openedAt: this._openedAt,
            };
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // §2 — Protocol validator (spec-compliant with protocol.json v1.0.0)
    // ══════════════════════════════════════════════════════════════════
    const VALID_TYPES = new Set([
        "init", "transcribe", "transcribe_pcm", "correct", "calibrate", "context",
        "drain", "ping", "shutdown", "resume", "degrade_status",
        "cancel", "config",
    ]);

    function validateEnvelope(env) {
        const issues = [];
        if (!env || typeof env !== "object") return { ok: false, issues: ["not an object"] };
        for (const f of ["type", "id", "payload"]) {
            if (!(f in env)) issues.push(`missing: ${f}`);
        }
        if (typeof env.id !== "number" || !Number.isInteger(env.id)) {
            issues.push("id must be an integer");
        }
        if (env.payload !== undefined && (typeof env.payload !== "object" || Array.isArray(env.payload))) {
            issues.push("payload must be a plain object");
        }
        if (env.type && !VALID_TYPES.has(env.type)) {
            issues.push(`unknown type: ${env.type}`);
        }
        return { ok: issues.length === 0, issues };
    }

    // ══════════════════════════════════════════════════════════════════
    // §3 — Idempotency (dedup on id)
    // ══════════════════════════════════════════════════════════════════
    class IdempotencyCache {
        constructor(cap = 128, ttlMs = 60000) {
            this.cap = cap;
            this.ttlMs = ttlMs;
            this._seen = new Map();     // id → { ts, result }
        }
        check(id) {
            const entry = this._seen.get(id);
            if (!entry) return null;
            if (Date.now() - entry.ts > this.ttlMs) {
                this._seen.delete(id);
                return null;
            }
            return entry.result;
        }
        record(id, result) {
            if (this._seen.size >= this.cap) {
                const oldest = this._seen.keys().next().value;
                this._seen.delete(oldest);
            }
            this._seen.set(id, { ts: Date.now(), result });
        }
        stats() { return { size: this._seen.size, cap: this.cap }; }
    }

    // ══════════════════════════════════════════════════════════════════
    // §4 — EliteBridge — the wrapper
    // ══════════════════════════════════════════════════════════════════
    class EliteBridge {
        constructor(opts = {}) {
            if (!NS.UnifiedIPCBridge) throw new Error("UnifiedIPCBridge missing (load bridge.js first)");
            this.inner = new NS.UnifiedIPCBridge(opts);
            this.circuit = new BridgeCircuitBreaker(opts.circuit || {});
            this.dedup = new IdempotencyCache(opts.dedupCap || 128, opts.dedupTtlMs || 60000);
            this._invalidDrops = 0;
            this._protocolErrors = 0;
            this._nextId = 1;
            this._listeners = new Map();
            this._disposed = false;
        }

        // ── connect (delegates + wires onmessage) ───────────────────
        async connect() {
            if (this._disposed) return false;
            if (!this.circuit.allow()) {
                telemetry.count("bridge.blocked_by_circuit");
                return false;
            }
            try {
                const ok = await this.inner.connect();
                metrics.set("axelr_bridge_connected", ok ? 1 : 0);
                if (ok) {
                    this.circuit.recordSuccess();
                    this._hookInner();
                } else {
                    this.circuit.recordFailure();
                }
                return ok;
            } catch (e) {
                this.circuit.recordFailure();
                telemetry.error(ERR.E_BRIDGE_WS, e.message);
                return false;
            }
        }

        // ── send with validation + circuit + dedup ──────────────────
        async send(type, payload = {}, opts = {}) {
            if (this._disposed) return null;
            if (!this.circuit.allow()) {
                telemetry.count("bridge.send_blocked_circuit");
                return null;
            }
            const id = opts.id != null ? opts.id : ++this._nextId;
            const envelope = { type, id, payload };

            // Idempotency: return cached result if we've seen this id
            if (opts.idempotent) {
                const cached = this.dedup.check(id);
                if (cached !== null) {
                    metrics.inc("axelr_bridge_dedup_total");
                    telemetry.count("bridge.dedup_hit");
                    return cached;
                }
            }

            // Validation
            const v = validateEnvelope(envelope);
            if (!v.ok) {
                this._invalidDrops++;
                metrics.inc("axelr_bridge_invalid_total");
                telemetry.count("bridge.invalid_envelope");
                log(2, "invalid envelope:", v.issues.join(", "));
                return null;
            }

            // Send with latency tracking
            const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
            try {
                metrics.inc("axelr_bridge_sends_total");
                const result = await this.inner.send(type, payload);
                const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
                metrics.observe("axelr_ipc_roundtrip_ms", elapsed);
                if (result === null) {
                    this.circuit.recordFailure();
                    telemetry.count("bridge.send_null");
                } else {
                    this.circuit.recordSuccess();
                    if (opts.idempotent) this.dedup.record(id, result);
                }
                return result;
            } catch (e) {
                this.circuit.recordFailure();
                metrics.inc("axelr_bridge_errors_total");
                telemetry.error(ERR.E_BRIDGE_WS, "send:" + e.message);
                return null;
            }
        }

        // ── subscription model on top of inner.onmessage ────────────
        on(eventType, handler) {
            if (!this._listeners.has(eventType)) this._listeners.set(eventType, new Set());
            this._listeners.get(eventType).add(handler);
            return () => this._listeners.get(eventType).delete(handler);
        }

        _hookInner() {
            // The inner bridge resolves requests via pendingRequests; we
            // also want to relay unsolicited events (ready, error, partial) to listeners.
            const ws = this.inner.ws;
            if (!ws) return;
            const origOnMessage = ws.onmessage;
            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg && typeof msg.type === "string") {
                        const set = this._listeners.get(msg.type);
                        if (set) for (const fn of set) {
                            try { fn(msg.payload || {}, msg); } catch (_) {}
                        }
                    }
                } catch (_) {}
                if (origOnMessage) try { origOnMessage(event); } catch (_) {}
            };
        }

        // ── proxy methods ───────────────────────────────────────────
        isConnected() { return this.inner.isConnected(); }
        get sessionId() { return this.inner.sessionId; }
        get connected() { return this.inner.connected; }

        stats() {
            return {
                connected: this.isConnected(),
                circuit: this.circuit.snapshot(),
                dedup: this.dedup.stats(),
                invalidDrops: this._invalidDrops,
                protocolErrors: this._protocolErrors,
                sessionId: this.sessionId,
            };
        }

        dispose() {
            this._disposed = true;
            if (this.inner) { try { this.inner.dispose(); } catch (_) {} }
            this._listeners.clear();
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // §5 — Factory
    // ══════════════════════════════════════════════════════════════════
    NS.EliteBridge = EliteBridge;
    NS.BridgeCircuitBreaker = BridgeCircuitBreaker;
    NS.validateEnvelope = validateEnvelope;
    NS.createEliteBridge = (opts) => new EliteBridge(opts);

    log(3, "bridge-elite v4.1 loaded (circuit + validation + dedup)");
})(typeof window !== "undefined" ? window : self);