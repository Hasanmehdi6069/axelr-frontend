/*! axelr-adaptive-confidence.js — Bayesian per-condition threshold calibration */
(function (global) {
    "use strict";
    const NS = global.AxelrInput;
    if (!NS || !NS.READY) { console.warn("adaptive-confidence: core required"); return; }

    class AdaptiveConfidenceCalibrator {
        constructor(opts = {}) {
            this._priors = new Map();
            this._default = { α: 2, β: 2 };
            this._minSamples = opts.minSamples || 20;
            this._conditionBuckets = opts.conditionBuckets || 4;
            this._tMax = opts.tMax || 0.85;
            this._tMin = opts.tMin || 0.20;
            this._decayMs = opts.decayMs || 3600000;
        }

        _conditionKey(noiseRms) {
            const r = Math.max(0, Math.min(1, Number(noiseRms) || 0));
            return Math.min(this._conditionBuckets - 1, Math.floor(r * this._conditionBuckets));
        }

        record(conditionNoiseRms, confidence, wasAccepted) {
            if (typeof confidence !== "number" || !isFinite(confidence)) return;
            const c = this._conditionKey(conditionNoiseRms);
            let s = this._priors.get(c);
            if (!s) { s = { α: this._default.α, β: this._default.β, samples: 0, lastUpdate: 0 }; this._priors.set(c, s); }
            s.samples++;
            if (wasAccepted) s.α += 1; else s.β += 1;
            s.lastUpdate = Date.now();
        }

        _decay(s) {
            const now = Date.now();
            if (!s.lastUpdate) { s.lastUpdate = now; return; }
            const age = now - s.lastUpdate;
            if (age < this._decayMs) return;
            const factor = Math.pow(0.5, age / this._decayMs);
            s.α = this._default.α + (s.α - this._default.α) * factor;
            s.β = this._default.β + (s.β - this._default.β) * factor;
            s.lastUpdate = now;
        }

        threshold(conditionNoiseRms) {
            const c = this._conditionKey(conditionNoiseRms);
            const s = this._priors.get(c) || this._default;
            this._decay(s);
            const mean = s.α / (s.α + s.β);
            const n = s.α + s.β;
            const variance = (s.α * s.β) / (n * n * (n + 1));
            const ci = 1.96 * Math.sqrt(variance);
            const threshold = Math.max(this._tMin, Math.min(this._tMax, mean - ci));
            return {
                threshold,
                mean,
                ci: [Math.max(0, mean - ci), Math.min(1, mean + ci)],
                samples: s.samples,
                condition: c,
                calibrated: s.samples >= this._minSamples,
            };
        }

        snapshot() {
            const out = { conditions: [], default: this._default };
            for (const [c, s] of this._priors.entries()) {
                this._decay(s);
                const n = s.α + s.β;
                out.conditions.push({
                    condition: c, α: +s.α.toFixed(2), β: +s.β.toFixed(2),
                    mean: +(s.α / n).toFixed(3), samples: s.samples,
                });
            }
            return out;
        }

        dispose() { this._priors.clear(); }
    }

    NS.AdaptiveConfidenceCalibrator = AdaptiveConfidenceCalibrator;
    NS.log(3, "adaptive-confidence loaded (Bayesian per-condition)");
})(typeof window !== "undefined" ? window : globalThis);