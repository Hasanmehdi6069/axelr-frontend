/*!
 * axelr-resources.js — MemoryBudget + JSDegradationLadder (v4.0.0).
 *
 * Enhanced with:
 *   - EWMA trend predictor (anticipates pressure before it crosses)
 *   - forceShed / forceReinstate for manual override
 *   - per-rung shed statistics
 *   - hard ceiling enforcement at 250 MB
 *
 * Load order: after core, before elite-v2.
 */
(function (global) {
    "use strict";
    const NS = global.AxelrInput;
    if (!NS || !NS.READY) { console.warn("axelr-resources: core required"); return; }
    const log = typeof NS.log === "function" ? NS.log : function () {};
    const telemetry = NS.telemetry || { count() {}, record() {} };

    const TIERS = {
        low:      { heapCapMB: 15,  totalCapMB: 50,  wantWebGL: false, wantWasm: false },
        standard: { heapCapMB: 55,  totalCapMB: 115, wantWebGL: true,  wantWasm: true  },
        high:     { heapCapMB: 80,  totalCapMB: 150, wantWebGL: true,  wantWasm: true  },
        max:      { heapCapMB: 110, totalCapMB: 200, wantWebGL: true,  wantWasm: true  },
    };
    const HARD_CEILING_MB = 250;
    const RUNGS = ["streaming_rerank", "structured_repair",
                   "phonetic_ensemble", "cloud_fallback", "warmup"];

    class MemoryBudget {
        constructor(tierName = "standard", opts = {}) {
            this.tierName = TIERS[tierName] ? tierName : "standard";
            this.tier = TIERS[this.tierName];
            this.highMark = opts.highMark || 0.85;
            this.lowMark = opts.lowMark || 0.65;
            this.sustainMs = opts.sustainMs || 30000;
            this.sampleMs = opts.sampleMs || 500;
            this.ewmaAlpha = opts.ewmaAlpha || 0.2;
            this._shed = new Set();
            this._lowSince = 0;
            this._highSince = 0;
            this._timer = null;
            this._listeners = [];
            this._peakHeap = 0;
            this._samples = 0;
            this._ewma = 0;                 // EWMA of used bytes
            this._shedCount = {};
            this._reinstateCount = {};
            this._disposed = false;
        }
        get capBytes() { return this.tier.heapCapMB * 1024 * 1024; }
        get hardCeilingBytes() { return HARD_CEILING_MB * 1024 * 1024; }

        _sample() {
            const mem = (typeof performance !== "undefined" && performance.memory);
            if (!mem || typeof mem.usedJSHeapSize !== "number") return 0;
            const used = mem.usedJSHeapSize;
            if (used > this._peakHeap) this._peakHeap = used;
            this._ewma = this._ewma === 0
                ? used
                : this.ewmaAlpha * used + (1 - this.ewmaAlpha) * this._ewma;
            this._samples++;
            return used;
        }

        _emit(name, active) {
            for (const cb of this._listeners) {
                try { cb(name, active); }
                catch (e) { log(2, "budget listener: " + e.message); }
            }
        }

        onChange(cb) {
            if (typeof cb === "function") this._listeners.push(cb);
        }

        start() {
            if (this._timer || this._disposed) return;
            this._timer = setInterval(() => this._tick(), this.sampleMs);
        }
        stop() {
            if (this._timer) { clearInterval(this._timer); this._timer = null; }
        }

        _tick() {
            if (this._disposed) return;
            const used = this._sample();
            if (used === 0) return;

            if (used > this.hardCeilingBytes) {
                telemetry.record("memory_hard_ceiling_hit",
                                 { used, ceiling: this.hardCeilingBytes });
                log(1, "memory: HARD CEILING " +
                    (used / 1048576).toFixed(1) + "MB");
                this._shedAll();
                return;
            }

            // Enhanced: use EWMA for earlier trigger
            const ewmaRatio = this._ewma / this.capBytes;
            const rawRatio = used / this.capBytes;
            const ratio = Math.max(rawRatio, ewmaRatio);
            const now = Date.now();

            if (ratio >= this.highMark) {
                if (!this._highSince) this._highSince = now;
                if (now - this._highSince > 2000) this._shedOne();
                this._lowSince = 0;
            } else if (ratio <= this.lowMark && this._shed.size > 0) {
                this._highSince = 0;
                if (!this._lowSince) this._lowSince = now;
                else if (now - this._lowSince >= this.sustainMs) {
                    this._reinstateOne();
                    this._lowSince = 0;
                }
            } else {
                this._highSince = 0;
            }
        }

        _shedOne() {
            for (const name of RUNGS) {
                if (!this._shed.has(name)) {
                    this._shed.add(name);
                    this._shedCount[name] = (this._shedCount[name] || 0) + 1;
                    telemetry.count("memory.shed." + name);
                    log(3, "memory shed: " + name);
                    this._emit(name, false);
                    return true;
                }
            }
            return false;
        }

        _reinstateOne() {
            for (let i = RUNGS.length - 1; i >= 0; i--) {
                const name = RUNGS[i];
                if (this._shed.has(name)) {
                    this._shed.delete(name);
                    this._reinstateCount[name] = (this._reinstateCount[name] || 0) + 1;
                    telemetry.count("memory.reinstate." + name);
                    log(3, "memory reinstate: " + name);
                    this._emit(name, true);
                    return true;
                }
            }
            return false;
        }

        _shedAll() {
            for (const name of RUNGS) {
                if (!this._shed.has(name)) {
                    this._shed.add(name);
                    this._shedCount[name] = (this._shedCount[name] || 0) + 1;
                    this._emit(name, false);
                }
            }
        }

        // Manual control API
        forceShed(name) {
            if (!RUNGS.includes(name) || this._shed.has(name)) return false;
            this._shed.add(name);
            this._shedCount[name] = (this._shedCount[name] || 0) + 1;
            this._emit(name, false);
            return true;
        }

        forceReinstate(name) {
            if (!this._shed.has(name)) return false;
            this._shed.delete(name);
            this._reinstateCount[name] = (this._reinstateCount[name] || 0) + 1;
            this._emit(name, true);
            return true;
        }

        isActive(rung) { return !this._shed.has(rung); }

        stats() {
            return {
                tier: this.tierName,
                capMB: this.tier.heapCapMB,
                hardCeilingMB: HARD_CEILING_MB,
                peakHeapMB: +(this._peakHeap / 1048576).toFixed(2),
                ewmaMB: +(this._ewma / 1048576).toFixed(2),
                samples: this._samples,
                shed: [...this._shed],
                shed_count: this._shed.size,
                shed_history: { ...this._shedCount },
                reinstate_history: { ...this._reinstateCount },
            };
        }

        snapshot() {
            const mem = (typeof performance !== "undefined" && performance.memory);
            const used = mem ? mem.usedJSHeapSize : 0;
            return {
                tier: this.tierName,
                usedMB: +(used / 1048576).toFixed(2),
                capMB: this.tier.heapCapMB,
                ratio: used ? +(used / this.capBytes).toFixed(3) : 0,
                ewmaRatio: this._ewma ? +(this._ewma / this.capBytes).toFixed(3) : 0,
                shed_count: this._shed.size,
                rungs: RUNGS.map(n => ({
                    name: n,
                    active: !this._shed.has(n),
                    shed_count: this._shedCount[n] || 0,
                })),
            };
        }

        dispose() {
            this._disposed = true;
            this.stop();
            this._listeners.length = 0;
            this._shed.clear();
        }
    }

    class JSDegradationLadder {
        constructor(budgetMB = 55) {
            this.budgetBytes = budgetMB * 1024 * 1024;
            this.high = 0.85;
            this.low = 0.65;
            this.sustainMs = 30000;
            this._shed = new Set();
            this._lowSince = 0;
            this._timer = null;
            this._onChange = null;
            this._ewma = 0;
            this._ewmaAlpha = 0.2;
        }
        onChange(cb) { this._onChange = cb; }
        start() {
            if (this._timer) return;
            this._timer = setInterval(() => this._sample(), 500);
        }
        stop() {
            if (this._timer) { clearInterval(this._timer); this._timer = null; }
        }
        _sample() {
            const mem = (typeof performance !== "undefined" && performance.memory)
                ? performance.memory.usedJSHeapSize : 0;
            if (!mem) return;
            this._ewma = this._ewma === 0
                ? mem
                : this._ewmaAlpha * mem + (1 - this._ewmaAlpha) * this._ewma;
            const ratio = Math.max(mem, this._ewma) / this.budgetBytes;
            if (ratio >= this.high) {
                for (const name of RUNGS) {
                    if (!this._shed.has(name)) {
                        this._shed.add(name);
                        telemetry.count("js.degrade.shed." + name);
                        if (this._onChange) try { this._onChange(name, false); } catch (_) {}
                        break;
                    }
                }
                this._lowSince = 0;
            } else if (ratio <= this.low && this._shed.size > 0) {
                const now = Date.now();
                if (!this._lowSince) this._lowSince = now;
                else if (now - this._lowSince >= this.sustainMs) {
                    const name = RUNGS.slice().reverse().find(n => this._shed.has(n));
                    if (name) {
                        this._shed.delete(name);
                        telemetry.count("js.degrade.reinstate." + name);
                        if (this._onChange) try { this._onChange(name, true); } catch (_) {}
                    }
                    this._lowSince = 0;
                }
            }
        }
        state() {
            return {
                shed_count: this._shed.size,
                rungs: RUNGS.map(name => ({
                    name, active: !this._shed.has(name),
                })),
            };
        }
        dispose() {
            this.stop();
            this._shed.clear();
            this._onChange = null;
        }
    }

    // Tier mapping functions to unify JS and Python tier names
    // JS uses "low", Python uses "low_ram"
    function mapPythonTierToJS(pythonTier) {
        const tierMapping = {
            "low_ram": "low",
            "standard": "standard",
            "high_end": "high"
        };
        return tierMapping[pythonTier.toLowerCase()] || "standard";
    }

    function mapJSTierToPython(jsTier) {
        const tierMapping = {
            "low": "low_ram",
            "standard": "standard",
            "high": "high_end",
            "max": "high_end"  // Map JS's 'max' to Python's high_end
        };
        return tierMapping[jsTier.toLowerCase()] || "standard";
    }

    NS.MemoryBudget = MemoryBudget;
    NS.JSDegradationLadder = JSDegradationLadder;
    NS.MEMORY_TIERS = Object.freeze(TIERS);
    NS.MEMORY_RUNGS = Object.freeze(RUNGS.slice());
    NS.MEMORY_HARD_CEILING_MB = HARD_CEILING_MB;
    NS.mapPythonTierToJS = mapPythonTierToJS;
    NS.mapJSTierToPython = mapJSTierToPython;

    NS._budget = new MemoryBudget("standard", {
        highMark: 0.85, lowMark: 0.65, sampleMs: 500,
    });
    NS._budget.start();

    log(3, "resources loaded (ceiling " + HARD_CEILING_MB + "MB)");
})(typeof window !== "undefined" ? window : self);