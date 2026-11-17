/*!
 * axelr-audio.js — AudioRing (SPSC-safe) · VAD · VADCalibrator
 * v3.1.1: single-producer/single-consumer ring, no cross-thread tail advance.
 * Load order: after core, before asr.
 */
(function (global) {
    "use strict";
    const NS = global.AxelrInput;
    if (!NS || !NS.READY) { console.warn("axelr-audio: core required"); return; }
    const { log, telemetry, ERR } = NS;
    const HAS_SAB = NS.HAS_SAB;

    // ── AudioRing: strict SPSC discipline ────────────────────────
    // Layout: [head:i32][tail:i32][pad:i32][pad:i32][samples:i16...]
    // RULE: writer only advances head; reader only advances tail.
    // Overflow: writer drops NEW samples (never touches tail).
    class AudioRing {
        constructor(capSamples = 8192) {
            if ((capSamples & (capSamples - 1)) !== 0) throw new Error("AudioRing: power-of-two capacity required");
            this.cap = capSamples; this.mask = capSamples - 1;
            const HEADER = 16;
            const totalBytes = HEADER + capSamples * 2;
            this.sab = HAS_SAB ? new SharedArrayBuffer(totalBytes) : null;
            const buffer = HAS_SAB ? this.sab : new ArrayBuffer(totalBytes);
            this.header = new Int32Array(buffer, 0, 4);
            this.data = new Int16Array(buffer, HEADER, capSamples);
            this._buffer = buffer;
            this.dropped = 0;
        }
        /** Writer (worklet) — advances head only. Drops NEW samples on overflow. */
        write(int16) {
            if (!int16 || int16.length === 0) return 0;
            const head = Atomics.load(this.header, 0);
            const tail = Atomics.load(this.header, 1);
            const free = this.cap - (head - tail);
            if (free <= 0) { this.dropped += int16.length; return 0; }
            const n = Math.min(int16.length, free);
            if (n < int16.length) this.dropped += int16.length - n;
            const start = head & this.mask;
            const first = Math.min(n, this.cap - start);
            this.data.set(int16.subarray(0, first), start);
            if (first < n) this.data.set(int16.subarray(first, n), 0);
            Atomics.store(this.header, 0, head + n);
            Atomics.notify(this.header, 0);
            return n;
        }
        read(maxOut) {
            const head = Atomics.load(this.header, 0);
            const tail = Atomics.load(this.header, 1);
            const used = head - tail;
            if (used === 0) return null;
            const take = Math.min(used, maxOut);
            const out = new Int16Array(take);
            const start = tail & this.mask;
            const first = Math.min(take, this.cap - start);
            out.set(this.data.subarray(start, start + first), 0);
            if (first < take) out.set(this.data.subarray(0, take - first), first);
            Atomics.store(this.header, 1, tail + take);
            return out;
        }
        peek(maxOut) {
            const head = Atomics.load(this.header, 0);
            const tail = Atomics.load(this.header, 1);
            const used = head - tail;
            if (used === 0) return null;
            const take = Math.min(used, maxOut);
            const out = new Int16Array(take);
            const start = tail & this.mask;
            const first = Math.min(take, this.cap - start);
            out.set(this.data.subarray(start, start + first), 0);
            if (first < take) out.set(this.data.subarray(0, take - first), first);
            return out;
        }
        available() { return Atomics.load(this.header, 0) - Atomics.load(this.header, 1); }
        reset() { Atomics.store(this.header, 0, 0); Atomics.store(this.header, 1, 0); this.data.fill(0); }
        dispose() { this.data = null; this.header = null; this.sab = null; this._buffer = null; }
    }
    NS.AudioRing = AudioRing;

    // ── VAD (main-thread) ────────────────────────────────────────────
    /**
     * Energy + ZCR gate with adaptive noise floor. Consumes NS.VADConfig
     * (populated by calibrator or settings registry) at start-time only;
     * changes to VADConfig take effect on next restart.
     */
    class VAD {
        constructor(opts = {}) {
            this.silenceMs = opts.silenceMs;
            this.speechThreshold = opts.speechThreshold;
            this.autoThreshold = opts.autoThreshold;
            this.attack = opts.attack; this.release = opts.release;
            this.minPeak = opts.minPeak;
            this.zcrMin = opts.zcrMin; this.zcrMax = opts.zcrMax;
            this.audioCtx = null; this.stream = null; this.analyser = null; this.source = null;
            this.buf = null; this.running = false; this.speaking = false;
            this.lastVoiceTs = 0; this.silenceSince = 0; this.envelope = 0;
            this.noiseRing = new Float32Array(40);
            this.noisePtr = 0; this.noiseCount = 0;
            this._rafId = null; this._disposed = false;
            this.onSpeechStart = opts.onSpeechStart || null;
            this.onSpeechEnd = opts.onSpeechEnd || null;
            this.onLevel = opts.onLevel || null;
        }
        async start() {
            if (this._disposed || this.running) return false;
            const cfg = NS.VADConfig || {};
            this.silenceMs       = this.silenceMs       ?? cfg.silenceMs       ?? 300;
            this.speechThreshold = this.speechThreshold ?? cfg.speechThreshold ?? 0.015;
            this.autoThreshold   = this.autoThreshold   ?? (cfg.autoThreshold !== false);
            this.attack          = this.attack          ?? cfg.attack          ?? 0.5;
            this.release         = this.release         ?? cfg.release         ?? 0.05;
            this.minPeak         = this.minPeak         ?? cfg.minPeak         ?? 0.10;
            this.zcrMin          = this.zcrMin          ?? cfg.zcrMin          ?? 0.02;
            this.zcrMax          = this.zcrMax          ?? cfg.zcrMax          ?? 0.35;
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                telemetry.error(ERR.E_AUDIO_MIC, "getUserMedia unavailable");
                return false;
            }
            try {
                this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
                const Ctx = global.AudioContext || global.webkitAudioContext;
                if (!Ctx) { telemetry.error(ERR.E_AUDIO_CTX, "AudioContext unavailable"); return false; }
                this.audioCtx = new Ctx();
                this.analyser = this.audioCtx.createAnalyser();
                this.analyser.fftSize = 512;
                this.source = this.audioCtx.createMediaStreamSource(this.stream);
                this.source.connect(this.analyser);
                this.buf = new Uint8Array(this.analyser.fftSize);
                this.running = true;
                this._tick();
                return true;
            } catch (e) {
                telemetry.error(ERR.E_AUDIO_MIC, e.message);
                return false;
            }
        }
        stop() {
            this.running = false;
            if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
            if (this.source) { try { this.source.disconnect(); } catch (_) {} this.source = null; }
            if (this.analyser) { try { this.analyser.disconnect(); } catch (_) {} this.analyser = null; }
            if (this.stream) { try { this.stream.getTracks().forEach(t => t.stop()); } catch (_) {} this.stream = null; }
            if (this.audioCtx && this.audioCtx.state !== "closed") { try { this.audioCtx.close(); } catch (_) {} this.audioCtx = null; }
            this.speaking = false; this.envelope = 0;
        }
        _tick() {
            if (!this.running || this._disposed) return;
            const now = performance.now();
            this.analyser.getByteTimeDomainData(this.buf);
            let sumSq = 0, peak = 0, zc = 0, lastSign = 0;
            const len = this.buf.length;
            for (let i = 0; i < len; i++) {
                const v = (this.buf[i] - 128) / 128;
                const abs = v < 0 ? -v : v;
                if (abs > peak) peak = abs;
                sumSq += v * v;
                const sign = v >= 0 ? 1 : -1;
                if (lastSign !== 0 && sign !== lastSign) zc++;
                lastSign = sign;
            }
            const rms = Math.sqrt(sumSq / len);
            const zcr = zc / len;
            this.envelope = rms > this.envelope
                ? this.attack * rms + (1 - this.attack) * this.envelope
                : this.release * rms + (1 - this.release) * this.envelope;
            this.noiseRing[this.noisePtr] = rms;
            this.noisePtr = (this.noisePtr + 1) % this.noiseRing.length;
            if (this.noiseCount < this.noiseRing.length) this.noiseCount++;
            const cfg = NS.VADConfig || {};
            const calibratedFloor = (typeof cfg.noiseFloor === "number" && cfg.noiseFloor > 0) ? cfg.noiseFloor : 0;
            const sensitivity = (typeof cfg.sensitivity === "number") ? cfg.sensitivity : 0.5;
            let threshold = calibratedFloor > 0 ? calibratedFloor * 2.5 : this.speechThreshold;
            if (this.autoThreshold && this.noiseCount >= 10) {
                let mean = 0;
                for (let i = 0; i < this.noiseCount; i++) mean += this.noiseRing[i];
                threshold = Math.max(threshold, (mean / this.noiseCount) * 4);
            }
            threshold *= 1 + (0.5 - sensitivity) * 0.8;
            const isVoiced = zcr >= this.zcrMin && zcr <= this.zcrMax;
            const speech = isVoiced && this.envelope > threshold && peak > this.minPeak;
            if (speech) {
                this.lastVoiceTs = now; this.silenceSince = 0;
                if (!this.speaking) {
                    this.speaking = true;
                    if (this.onSpeechStart) try { this.onSpeechStart(); } catch (_) {}
                    telemetry.count("vad.start");
                }
            } else if (this.speaking) {
                if (!this.silenceSince) this.silenceSince = now;
                if (now - this.silenceSince >= this.silenceMs) {
                    this.speaking = false;
                    if (this.onSpeechEnd) try { this.onSpeechEnd(); } catch (_) {}
                    telemetry.count("vad.end");
                    this.silenceSince = 0;
                }
            }
            if (this.onLevel) try { this.onLevel(rms, this.envelope, zcr); } catch (_) {}
            this._rafId = requestAnimationFrame(() => this._tick());
        }
        isSpeaking() { return this.speaking; }
        getLevel() { return this.envelope; }
        dispose() { this._disposed = true; this.stop(); this.noiseRing.fill(0); }
    }
    NS.VAD = VAD;

    // ── VADCalibrator ────────────────────────────────────────────────
    const STORAGE_KEY = "axelr.vad.calibration.v1";
    const STORAGE_SCHEMA = 1;
    const MAX_CALIBRATION_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    class VADCalibrator {
        constructor(registry, hooks = {}) {
            this.registry = registry; this.hooks = hooks;
            this.state = "idle";
            this._stream = null; this._ctx = null; this._analyser = null;
            this._raf = 0; this._buf = null;
            // Hydrate from localStorage on init if available and valid
            this._hydrateFromStorage();
        }
        _hydrateFromStorage() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) return false;
                const stored = JSON.parse(raw);
                if (stored.schema_version !== STORAGE_SCHEMA) {
                    log(3, "vad-calibration: schema mismatch, recalibrating");
                    return false;
                }
                const age = performance.now() - (stored.timestamp || 0);
                if (age > MAX_CALIBRATION_AGE_MS) {
                    log(3, "vad-calibration: stored calibration expired, recalibrating");
                    return false;
                }
                if (typeof stored.noiseFloor === "number" && typeof stored.vadSensitivity === "number") {
                    if (this.registry) {
                        this.registry.set("noiseFloor", stored.noiseFloor);
                        this.registry.set("vadSensitivity", stored.vadSensitivity);
                    }
                    NS.VADConfig = NS.VADConfig || {};
                    NS.VADConfig.noiseFloor = stored.noiseFloor;
                    NS.VADConfig.sensitivity = stored.vadSensitivity;
                    log(3, "vad-calibration: loaded valid stored values");
                    telemetry.count("calibration.loaded");
                    return true;
                }
            } catch (e) {
                log(2, "vad-calibration: failed to load storage", e);
            }
            return false;
        }
        _persistToStorage(noiseFloor, vadSensitivity) {
            try {
                const data = {
                    schema_version: STORAGE_SCHEMA,
                    timestamp: performance.now(),
                    noiseFloor,
                    vadSensitivity
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                telemetry.count("calibration.persisted");
                log(3, "vad-calibration: persisted to localStorage");
            } catch (e) {
                log(2, "vad-calibration: failed to persist", e);
            }
        }
        _setState(s, detail) {
            this.state = s;
            if (this.hooks.onStateChange) try { this.hooks.onStateChange(s, detail); } catch (_) {}
        }
        async calibrate(durationMs = 3000) {
            if (this.state === "sampling" || this.state === "requesting-permission") return { ok: false, reason: "busy" };
            this._setState("requesting-permission");
            try {
                this._stream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
                });
            } catch (e) {
                this._setState("error", "permission-denied");
                telemetry.error(ERR.E_PERM_DENIED, "calibration");
                return { ok: false, reason: "permission-denied" };
            }
            this._setState("sampling");
            try {
                const AC = global.AudioContext || global.webkitAudioContext;
                this._ctx = new AC();
                const src = this._ctx.createMediaStreamSource(this._stream);
                this._analyser = this._ctx.createAnalyser();
                this._analyser.fftSize = 2048;
                src.connect(this._analyser);
                this._buf = new Float32Array(this._analyser.fftSize);
                let sumSq = 0, crossings = 0, samples = 0;
                const t0 = performance.now();
                await new Promise((resolve) => {
                    const tick = () => {
                        this._analyser.getFloatTimeDomainData(this._buf);
                        let prev = this._buf[0] >= 0;
                        for (let i = 0; i < this._buf.length; i++) {
                            const v = this._buf[i];
                            sumSq += v * v;
                            const pos = v >= 0;
                            if (pos !== prev) { crossings++; prev = pos; }
                        }
                        samples += this._buf.length;
                        if (performance.now() - t0 >= durationMs) return resolve();
                        this._raf = requestAnimationFrame(tick);
                    };
                    this._raf = requestAnimationFrame(tick);
                });
                this._setState("computing");
                const rms = Math.sqrt(sumSq / Math.max(1, samples));
                const zcr = crossings / Math.max(1, (performance.now() - t0) / 1000);
                const noiseFloor = Math.min(0.3, Math.max(0.005, rms * 2.5));
                const vadSensitivity = Math.min(1, Math.max(0.1, 1 - (noiseFloor / 0.3)));
                if (this.registry) {
                    this.registry.set("noiseFloor", noiseFloor);
                    this.registry.set("vadSensitivity", vadSensitivity);
                }
                NS.VADConfig = NS.VADConfig || {};
                NS.VADConfig.noiseFloor = noiseFloor;
                NS.VADConfig.sensitivity = vadSensitivity;
                // Persist newly calibrated values
                this._persistToStorage(noiseFloor, vadSensitivity);
                const result = { ok: true, noiseFloor, vadSensitivity, rms, zcr, sampleRate: this._ctx.sampleRate || 48000 };
                this._setState("complete", result);
                telemetry.count("calibration.complete");
                if (this.hooks.onCalibrationComplete) try { this.hooks.onCalibrationComplete(result); } catch (_) {}
                return result;
            } catch (e) {
                this._setState("error", e.message);
                return { ok: false, reason: e.message };
            } finally { this._teardown(); }
        }
        _teardown() {
            if (this._raf) { try { cancelAnimationFrame(this._raf); } catch (_) {} this._raf = 0; }
            if (this._buf) { this._buf.fill(0); this._buf = null; }
            if (this._analyser) { try { this._analyser.disconnect(); } catch (_) {} this._analyser = null; }
            if (this._stream) { for (const t of this._stream.getTracks()) try { t.stop(); } catch (_) {} this._stream = null; }
            if (this._ctx) { try { this._ctx.close(); } catch (_) {} this._ctx = null; }
        }
        dispose() { this._teardown(); this.registry = null; this.hooks = null; }
    }
    NS.VADCalibrator = VADCalibrator;

    // NOTE: §4–6 (LocaleRegistry, PolyfillPredictor, VoicePipeline) REMOVED.
    // Those are correctly owned by axelr-asr.js. Keeping them here caused
    // cross-file duplication that changed behavior between test and prod.

    log(3, "audio loaded (SAB=" + HAS_SAB + ", SPSC-safe)");
})(typeof window !== "undefined" ? window : self);