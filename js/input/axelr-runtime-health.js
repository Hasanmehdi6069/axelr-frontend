/*!
 * axelr-runtime-health.js — Wires elite-v2 features to the running engine.
 *
 * Wires: WorkerLivenessProbe → ASR worker · GLContextRecovery → CharCNN
 *        StorageQuotaGuard → SettingsRegistry · CrossTabCoordinator → singleton
 *        MemoryGradientMonitor → real performance.memory sampling
 *        LatencyBudget → real per-op tracking
 *
 * Load order: after elite-v2, before setup, before orchestrator.
 * Cost: ~2 KB + 1 sampler interval.
 */
(function (global) {
    "use strict";
    const NS = global.AxelrInput;
    if (!NS || !NS.READY) { console.warn("axelr-runtime-health: core required"); return; }
    const log = NS.log || function () {};
    const telemetry = NS.telemetry || { count() {} };
    const metrics = NS.metrics || { inc() {}, set() {}, observe() {} };

    // ══════════════════════════════════════════════════════════════════
    // §1 — RuntimeHealth singleton — the wiring orchestrator
    // ══════════════════════════════════════════════════════════════════
    class RuntimeHealth {
        constructor() {
            this.workerProbe = null;
            this.glRecovery = null;
            this.storageGuard = null;
            this.tabCoordinator = null;
            this.memoryMonitor = null;
            this.latencyBudget = null;
            this._timer = null;
            this._disposed = false;
            this._workerTarget = null;
            this._canvasTarget = null;
            this._startedAt = 0;
            this._lastSampleRss = 0;
        }

        // ── ASR worker probe ─────────────────────────────────────────
        attachWorker(worker, opts = {}) {
            if (!NS.WorkerLivenessProbe) { log(2, "WorkerLivenessProbe missing"); return; }
            this._workerTarget = worker;
            this.workerProbe = new NS.WorkerLivenessProbe(worker, {
                intervalMs: opts.intervalMs || 5000,
                timeoutMs: opts.timeoutMs || 2000,
                onDead: () => {
                    telemetry.count("health.worker_dead");
                    metrics.inc("axelr_worker_dead_total");
                    log(1, "worker died — calling restart hook");
                    if (typeof opts.onDead === "function") {
                        try { opts.onDead(); } catch (_) {}
                    }
                },
            });
            log(3, "worker probe attached");
        }

        // ── WebGL context recovery ──────────────────────────────────
        attachGL(canvas, opts = {}) {
            if (!NS.GLContextRecovery) { log(2, "GLContextRecovery missing"); return; }
            this._canvasTarget = canvas;
            this.glRecovery = new NS.GLContextRecovery(canvas);
            this.glRecovery.attach(
                () => {
                    metrics.inc("axelr_gl_context_lost_total");
                    if (typeof opts.onLost === "function") try { opts.onLost(); } catch (_) {}
                },
                () => {
                    metrics.inc("axelr_gl_context_restored_total");
                    if (typeof opts.onRestored === "function") try { opts.onRestored(); } catch (_) {}
                }
            );
            log(3, "GL context recovery attached");
        }

        // ── Storage quota guard ─────────────────────────────────────
        attachStorage(storage, opts = {}) {
            if (!NS.StorageQuotaGuard) { log(2, "StorageQuotaGuard missing"); return; }
            this.storageGuard = NS.StorageQuotaGuard;
            const usage = this.storageGuard.usage(storage);
            metrics.set("axelr_storage_bytes", usage.bytes);
            metrics.set("axelr_storage_entries", usage.entries);
            log(3, `storage attached: ${usage.bytes}B / ${usage.entries} entries`);
        }

        // ── Cross-tab leader ────────────────────────────────────────
        attachCrossTab(channelName = "axelr-tabs") {
            if (!NS.CrossTabCoordinator) { log(2, "CrossTabCoordinator missing"); return; }
            this.tabCoordinator = new NS.CrossTabCoordinator(channelName);
            const isLeader = this.tabCoordinator.tryBecomeLeader();
            metrics.set("axelr_tab_leader", isLeader ? 1 : 0);
            log(3, `cross-tab: ${isLeader ? "leader" : "follower"}`);
            return this.tabCoordinator;
        }

        // ── Memory monitor ──────────────────────────────────────────
        startMemoryMonitor(opts = {}) {
            if (!NS.MemoryGradientMonitor) { log(2, "MemoryGradientMonitor missing"); return; }
            this.memoryMonitor = new NS.MemoryGradientMonitor({
                thresholdMbPerMin: opts.thresholdMbPerMin || 2.0,
                sampleCount: opts.sampleCount || 20,
            });
            const self = this;
            this._timer = setInterval(() => {
                if (self._disposed) return;
                const mem = (typeof performance !== "undefined" && performance.memory);
                if (!mem) return;
                const rssMb = mem.usedJSHeapSize / 1048576;
                const alarmed = self.memoryMonitor.sample(rssMb);
                metrics.set("axelr_heap_mb", rssMb);
                metrics.set("axelr_heap_ratio", mem.usedJSHeapSize / mem.jsHeapSizeLimit);
                if (alarmed) {
                    telemetry.count("health.memory_gradient_alarm");
                    metrics.inc("axelr_memory_alarm_total");
                    log(2, `memory gradient alarm: ${rssMb.toFixed(1)}MB`);
                    if (typeof opts.onAlarm === "function") try { opts.onAlarm(rssMb); } catch (_) {}
                }
            }, opts.sampleMs || 5000);
        }

        // ── Latency budget ──────────────────────────────────────────
        startLatencyBudget(budgets) {
            if (!NS.LatencyBudget) { log(2, "LatencyBudget missing"); return; }
            this.latencyBudget = new NS.LatencyBudget(budgets || {
                asr_infer: 500, correct: 5, polish: 5, ipc_send: 100,
            });
        }
        recordLatency(op, ms) {
            if (this.latencyBudget) this.latencyBudget.record(op, ms);
            metrics.observe(`axelr_latency_${op}_ms`, ms);
        }
        checkLatency() {
            if (!this.latencyBudget) return { backpressure: false };
            const r = this.latencyBudget.check();
            if (r.backpressure) metrics.inc("axelr_latency_backpressure_total");
            return r;
        }

        // ── Full snapshot ───────────────────────────────────────────
        snapshot() {
            return {
                uptimeMs: this._startedAt ? (Date.now() - this._startedAt) : 0,
                workerAlive: this.workerProbe ? this.workerProbe.isAlive() : null,
                glLost: this.glRecovery ? this.glRecovery.lost : null,
                tabLeader: this.tabCoordinator ? this.tabCoordinator.isLeader : null,
                memory: this.memoryMonitor ? this.memoryMonitor.stats() : null,
                latency: this.latencyBudget ? this.latencyBudget.check() : null,
            };
        }

        dispose() {
            this._disposed = true;
            if (this._timer) { clearInterval(this._timer); this._timer = null; }
            if (this.workerProbe) { try { this.workerProbe.dispose(); } catch (_) {} this.workerProbe = null; }
            if (this.glRecovery) { try { this.glRecovery.detach(); } catch (_) {} this.glRecovery = null; }
            if (this.tabCoordinator) { try { this.tabCoordinator.dispose(); } catch (_) {} this.tabCoordinator = null; }
            this.memoryMonitor = null;
            this.latencyBudget = null;
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // §2 — Global singleton wired to the engine on autoAttach
    // ══════════════════════════════════════════════════════════════════
    const _health = new RuntimeHealth();

    NS.health = _health;
    NS.attachHealthToEngine = (engine) => {
        if (!engine || engine._disposed) return;
        _health._startedAt = Date.now();
        // Wire GL recovery to the CNN if GPU backend exists
        if (engine.cnn && engine.cnn.backend && engine.cnn.backend.canvas) {
            _health.attachGL(engine.cnn.backend.canvas, {
                onLost: () => {
                    // Drop GPU backend, fall back to CPU on next score()
                    if (engine.cnn.backend) {
                        try { engine.cnn.backend.dispose(); } catch (_) {}
                        engine.cnn.backend = null;
                    }
                },
                onRestored: () => { log(3, "GL restored; will recreate backend on next score"); },
            });
        }
        // Wire worker probe to the LocalASR worker if present
        const local = engine.asrRouter && engine.asrRouter._local;
        if (local && local._workers) {
            _health.attachWorker(local._workers, {
                onDead: () => {
                    telemetry.count("asr.worker_restart");
                    try { local.dispose(); } catch (_) {}
                    if (engine.asrRouter) engine.asrRouter._local = null;
                },
            });
        }
        // Wire cross-tab leader election
        _health.attachCrossTab("axelr-input-sync-v2");
        // Start memory monitor
        _health.startMemoryMonitor({
            onAlarm: () => {
                if (NS.JSDegradationLadder && engine.degrade) {
                    try { engine.degrade("memory_gradient"); } catch (_) {}
                }
            },
        });
        // Latency budget
        _health.startLatencyBudget();
        log(3, "runtime health wired to engine");
    };

    // ══════════════════════════════════════════════════════════════════
    // §3 — Health endpoint snapshot (for dashboards)
    // ══════════════════════════════════════════════════════════════════
    NS.getHealthSnapshot = () => {
        const base = _health.snapshot();
        const engine = NS._engine;
        return {
            ...base,
            engine: engine ? (engine.snapshot ? engine.snapshot() : { active: true }) : null,
            metrics: NS.getMetricsSnapshot ? NS.getMetricsSnapshot() : null,
            ready: !!NS.READY,
        };
    };

    // ══════════════════════════════════════════════════════════════════
    // §4 — Auto-wire on pagehide for cleanup
    // ══════════════════════════════════════════════════════════════════
    if (typeof global.addEventListener === "function") {
        global.addEventListener("pagehide", () => { try { _health.dispose(); } catch (_) {} });
    }

    log(3, "runtime-health v4.1 loaded (wiring active)");
})(typeof window !== "undefined" ? window : self);