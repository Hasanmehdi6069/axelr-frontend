/*!
 * axelr-asr.js — LocaleRegistry · PolyfillPredictor · VoicePipeline · LocalASR · AsrRouter ·
 *                ConfidenceGate · SLCP (#19 Session Personalization)
 * Load order: after audio, before correction.
 */
(function (global) {
    "use strict";
    const NS = global.AxelrInput;
    if (!NS || !NS.READY) { console.warn("axelr-asr: core required"); return; }
    const { log, telemetry, ERR, TokenRing, IntentFilter } = NS;

    // ── LocaleRegistry ──────────────────────────────────────────────
    const LOCALE_MAP = Object.freeze({
        "en-US": { label: "English (US)", fallback: "en-GB" }, "en-GB": { label: "English (UK)", fallback: "en-US" },
        "en-AU": { label: "English (AU)", fallback: "en-GB" }, "en-IN": { label: "English (IN)", fallback: "en-GB" },
        "es-ES": { label: "Spanish (ES)", fallback: "es-MX" }, "es-MX": { label: "Spanish (MX)", fallback: "es-ES" },
        "fr-FR": { label: "French (FR)", fallback: "en-US" }, "fr-CA": { label: "French (CA)", fallback: "fr-FR" },
        "de-DE": { label: "German", fallback: "en-US" }, "it-IT": { label: "Italian", fallback: "en-US" },
        "pt-BR": { label: "Portuguese (BR)", fallback: "en-US" }, "pt-PT": { label: "Portuguese (PT)", fallback: "pt-BR" },
        "nl-NL": { label: "Dutch", fallback: "en-GB" }, "pl-PL": { label: "Polish", fallback: "en-US" },
        "ru-RU": { label: "Russian", fallback: "en-US" }, "tr-TR": { label: "Turkish", fallback: "en-US" },
        "ja-JP": { label: "Japanese", fallback: "en-US" }, "ko-KR": { label: "Korean", fallback: "en-US" },
        "zh-CN": { label: "Chinese (CN)", fallback: "en-US" }, "zh-TW": { label: "Chinese (TW)", fallback: "zh-CN" },
        "hi-IN": { label: "Hindi", fallback: "en-IN" }, "ar-SA": { label: "Arabic", fallback: "en-US" }
    });
    function normalizeTag(tag) {
        const s = String(tag || "").replace(/_/g, "-").trim();
        const parts = s.split("-");
        return parts.length === 2 ? parts[0].toLowerCase() + "-" + parts[1].toUpperCase() : s;
    }
    class LocaleRegistry {
        constructor(defaultTag = "en-US") { this.defaultTag = normalizeTag(defaultTag); this.current = this.defaultTag; this.autoDetected = false; this._detect(); }
        _detect() {
            try {
                const nav = global.navigator;
                const cands = (nav.languages && nav.languages.length) ? [...nav.languages] : [nav.language || "en-US"];
                for (const c of cands) {
                    const n = normalizeTag(c);
                    if (LOCALE_MAP[n]) { this.current = n; this.autoDetected = true; return; }
                    const lang = n.split("-")[0];
                    for (const k of Object.keys(LOCALE_MAP)) if (k.split("-")[0] === lang) { this.current = k; this.autoDetected = true; return; }
                }
            } catch (_) {}
        }
        set(tag) { const n = normalizeTag(tag); if (!LOCALE_MAP[n]) { log(2, "unknown locale:", tag); return false; } this.current = n; this.autoDetected = false; telemetry.count("voice.locale." + n); return true; }
        list() { return Object.keys(LOCALE_MAP).map(k => ({ tag: k, label: LOCALE_MAP[k].label, active: k === this.current })); }
    }
    NS.LocaleRegistry = LocaleRegistry;

    // ── PolyfillPredictor ───────────────────────────────────────────
    const TRI_BUCKETS = 2048, TRI_MASK = TRI_BUCKETS - 1;
    const SEED_TRIGRAMS = ["the","and","ing","ion","tio","ent","ati","for","her","ter","hat","tha","ere","ate","his","con","res","ver","all","ons"];
    class PolyfillPredictor {
        constructor() { this.table = new Uint16Array(TRI_BUCKETS * 3); this._lastCtx = ""; this._lastPred = ""; for (const tri of SEED_TRIGRAMS) { const b = this._hash(tri.slice(0, 2)) * 3; this.table[b] = tri.charCodeAt(2); } }
        _hash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = ((h ^ s.charCodeAt(i)) * 0x01000193) | 0; return (h >>> 0) & TRI_MASK; }
        predict(ctx) {
            if (ctx.length < 2) return "";
            const c = ctx.slice(-2); if (c === this._lastCtx) return this._lastPred;
            const b = this._hash(c) * 3; let out = "";
            for (let i = 0; i < 3; i++) { const ch = this.table[b + i]; if (!ch) break; out += String.fromCharCode(ch); }
            this._lastCtx = c; this._lastPred = out;
            return out;
        }
        dispose() { this.table = null; }
    }
    NS.PolyfillPredictor = PolyfillPredictor;

    // ── VoicePipeline ───────────────────────────────────────────────
    const SR_CTOR = global.SpeechRecognition || global.webkitSpeechRecognition;
    const HAS_SR = !!SR_CTOR;
    const STATE = Object.freeze({ IDLE: 0, LISTENING: 1, DEGRADED: 2, STOPPED: 3 });
    NS.STATE = STATE;
    class VoicePipeline {
        constructor(ring, intent, callbacks, locale) {
            if (!(ring instanceof TokenRing)) throw new TypeError("ring required");
            if (!(intent instanceof IntentFilter)) throw new TypeError("intent required");
            this.ring = ring; this.intent = intent;
            this.cb = callbacks || {}; this.locale = locale || new LocaleRegistry();
            this.rec = null; this.state = STATE.IDLE;
            this.preferLocal = true; this._errors = []; this._lastResultTs = 0;
            this._lastInterim = ""; this._watchdog = null; this._disposed = false;
            this._listeners = new Map();
            this._lastInterimTs = 0;
            if (HAS_SR) this._build();
        }
        on(ev, fn) { if (!this._listeners.has(ev)) this._listeners.set(ev, []); this._listeners.get(ev).push(fn); }
        off(ev, fn) { const a = this._listeners.get(ev); if (a) { const i = a.indexOf(fn); if (i !== -1) a.splice(i, 1); } }
        _emit(ev, d) { const a = this._listeners.get(ev); if (a) for (const fn of a) try { fn(d); } catch (e) { log(1, "emit:", e); } }
        setLanguage(tag) { if (!this.locale.set(tag)) return false; if (this.rec) try { this.rec.lang = this.locale.current; } catch (_) {} return true; }
        start() {
            if (this._disposed || !this.rec) return false;
            try { this.rec.lang = this.locale.current; this.rec.start(); this.state = STATE.LISTENING; this._armWatchdog(); this._emit("start", {}); return true; }
            catch (e) { log(2, "voice start:", e.message); this._emit("error", { message: e.message, code: "start_failed" }); this._degrade("start_failed"); return false; }
        }
        stop() { if (this.rec) try { this.rec.stop(); } catch (_) {} this.state = STATE.STOPPED; this._disarmWatchdog(); }
        hotSwapLanguage(tag) { const was = this.state === STATE.LISTENING; if (was) this.stop(); const ok = this.setLanguage(tag); if (ok && was) setTimeout(() => { if (!this._disposed) this.start(); }, 100); return ok; }
        once() {
            if (!this.rec || this._disposed) return Promise.resolve("");
            return new Promise((resolve) => {
                const wasListening = this.state === STATE.LISTENING;
                if (wasListening) try { this.rec.stop(); } catch (_) {}
                const prevR = this.rec.onresult, prevE = this.rec.onend, prevS = this.rec.onstart;
                let captured = "";
                const restore = () => {
                    this.rec.onresult = prevR; this.rec.onend = prevE; this.rec.onstart = prevS;
                    this._lastInterim = "";
                    if (wasListening && !this._disposed) setTimeout(() => { if (!this._disposed && this.state !== STATE.LISTENING) this.start(); }, 50);
                    else this.state = STATE.IDLE;
                };
                this.rec.onresult = (ev) => { for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) captured = ev.results[i][0].transcript.trim(); };
                this.rec.onend = () => { restore(); resolve(captured); };
                try { this.rec.start(); this.state = STATE.LISTENING; } catch (_) { restore(); resolve(""); }
            });
        }
        _build() {
            const r = new SR_CTOR();
            r.lang = this.locale.current; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
            if (this.preferLocal && "processLocally" in r) try { r.processLocally = true; } catch (_) {}
            r.onresult = (e) => this._onResult(e);
            r.onerror = (e) => this._onError(e);
            r.onend = () => this._onEnd();
            r.onstart = () => { this.state = STATE.LISTENING; };
            this.rec = r;
        }
        _onResult(ev) {
    this._lastResultTs = performance.now();
    let finalChunk = "", interimChunk = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i], txt = r[0].transcript.trim();
        if (!txt) continue;
        if (r.isFinal) finalChunk += (finalChunk ? " " : "") + txt;
        else interimChunk = txt;
    }
    const now = performance.now();
    if (interimChunk && interimChunk === this._lastInterim && (now - (this._lastInterimTs || 0)) < 1500) interimChunk = "";
    if (interimChunk) { this._lastInterim = interimChunk; this._lastInterimTs = now; }
    if (finalChunk) {
        const result = this.intent.applyFinal(finalChunk);
        telemetry.count("voice.final");
        this._lastInterim = "";           // ← bug fix: clear on final
        this._lastInterimTs = 0;
        if (this.cb.onToken) this.cb.onToken(finalChunk, result);
    }
    if (interimChunk && this.cb.onInterim) this.cb.onInterim(interimChunk, this.ring.join() + " " + interimChunk);
}
        _onError(ev) {
            if (this._disposed) return;
            const now = performance.now();
            this._errors.push(now);
            while (this._errors.length && now - this._errors[0] > 5000) this._errors.shift();
            telemetry.count("voice.error." + ev.error);
            this._emit("error", { message: ev.error, code: ev.error });
            if (this._errors.length >= 2) this._degrade(ev.error || "multiple_errors");
        }
        _onEnd() {
            if (this._disposed) return;
            this._emit("end", {});
            if (this.state === STATE.LISTENING) try { this.rec.start(); this.state = STATE.LISTENING; return; } catch (_) {}
            this.state = STATE.IDLE;
        }
        _armWatchdog() { this._disarmWatchdog(); this._watchdog = global.setInterval(() => { if (this.state !== STATE.LISTENING) return; const now = performance.now(); if (this._lastResultTs && now - this._lastResultTs > 3000) { this._degrade("silent_timeout"); this._lastResultTs = now; } }, 1000); }
        _disarmWatchdog() { if (this._watchdog) { global.clearInterval(this._watchdog); this._watchdog = null; } }
        _degrade(r) { telemetry.count("voice.degrade." + r); this.state = STATE.DEGRADED; if (this.cb.onDegrade) this.cb.onDegrade(r); }
        isAvailable() { return HAS_SR; }
        isListening() { return this.state === STATE.LISTENING; }
        dispose() {
            this._disposed = true; this._disarmWatchdog();
            if (this._listeners) { this._listeners.clear(); this._listeners = null; }
            if (this.rec) { try { this.rec.abort(); } catch (_) {} this.rec.onresult = null; this.rec.onerror = null; this.rec.onend = null; this.rec.onstart = null; this.rec = null; }
            this.ring = null; this.intent = null; this.cb = {}; this._lastInterim = "";
        }
    }
    NS.VoicePipeline = VoicePipeline;

    // ── LocalASR (with SLCP feedback loop) ──────────────────────────
    const HAS_WORKLET = typeof AudioWorkletNode !== "undefined";
    class LocalASR {
        constructor(opts = {}) {
            this.opts = opts;
            this.language = opts.language || "en";
            this.runtime = opts.runtime || (NS.HAS_SAB && HAS_WORKLET ? "whispercpp" : "mock");
            this.modelURL = opts.modelURL || "/models/ggml-tiny.en-q4_0.bin";
            this.runtimeURL = opts.runtimeURL || "/models/whisper.runtime.js";
            this.sampleRate = opts.sampleRate || 16000;
            this.ringMs = opts.ringMs || 800;
            this._workers = null; this._ring = null;
            this._audioCtx = null; this._worklet = null;
            this._source = null; this._stream = null;
            this._state = "idle";
            this._listeners = new Map();
            this._fallback = null;
            this._disposed = false;
            this._readyPromise = null;
            this._acceptedConfidences = [];   // for calibration
            this._rejectedConfidences = [];
        }
        on(ev, fn) { if (!this._listeners.has(ev)) this._listeners.set(ev, new Set()); this._listeners.get(ev).add(fn); return () => this._listeners.get(ev).delete(fn); }
        _emit(ev, d) { const s = this._listeners.get(ev); if (s) for (const fn of s) try { fn(d); } catch (_) {} }
        init() {
            if (this._readyPromise) return this._readyPromise;
            this._state = "loading";
            this._readyPromise = this._initInner().catch((err) => {
                log(1, "LocalASR init:", err.message);
                telemetry.error(ERR.E_ASR_INIT, err.message);
                this._state = "degraded";
                this._emit("error", { stage: "init", message: err.message });
                return this._fallbackToWebSpeech();
            });
            return this._readyPromise;
        }
        async _initInner() {
            if (!NS.HAS_SAB) { telemetry.error(ERR.E_ASR_INIT, "SAB unavailable"); throw new Error("SharedArrayBuffer unavailable"); }
            const workerURL = this.opts.workerURL || "axelr-worker.js";
            this._workers = new Worker(workerURL);
            this._workers.onmessage = (e) => this._onWorkerMessage(e);
            this._workers.onerror = (e) => {
                log(1, "ASR worker error:", e.message);
                telemetry.error(ERR.E_WORKER_MSG, e.message);
                this._state = "degraded";
                this._emit("error", { stage: "worker", message: e.message });
                this._fallbackToWebSpeech();
            };
            this._ring = new NS.AudioRing(Math.pow(2, Math.ceil(Math.log2((this.ringMs / 1000) * this.sampleRate))));
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("model load timeout")), 15000);
                const off = this.on("ready", () => { clearTimeout(timeout); off(); resolve(); });
                const offErr = this.on("error", ({ stage, message }) => { if (stage === "init") { clearTimeout(timeout); offErr(); reject(new Error(message)); } });
                this._workers.postMessage({
                    type: "init",
                    payload: {
                        runtime: this.runtime, runtimeURL: this.runtimeURL, modelURL: this.modelURL, language: this.language,
                        vocabMask: this.opts.vocabMask || [], biasWords: this.opts.biasWords || [], vocabMode: this.opts.vocabMode || "soft"
                    }
                });
            });
            this._state = "ready";
            telemetry.count("asr.ready");
        }
        /** Feedback for ACX tuning */
        recordOutcome(confidence, wasAccepted) {
            if (typeof confidence !== "number") return;
            if (wasAccepted) { this._acceptedConfidences.push(confidence); if (this._acceptedConfidences.length > 200) this._acceptedConfidences.shift(); }
            else { this._rejectedConfidences.push(confidence); if (this._rejectedConfidences.length > 200) this._rejectedConfidences.shift(); }
        }
        /** Computes optimal confidence threshold from history */
        suggestThreshold() {
            if (this._acceptedConfidences.length < 20 || this._rejectedConfidences.length < 20) return 0.35;
            const sorted = [...this._rejectedConfidences].sort((a, b) => a - b);
            const p90 = sorted[Math.floor(sorted.length * 0.9)];
            return Math.min(0.7, Math.max(0.2, p90));
        }
        async _fallbackToWebSpeech() {
            if (this.runtime === "mock") return;
            const SR = global.SpeechRecognition || global.webkitSpeechRecognition;
            if (!SR) { this._state = "degraded"; return; }
            this._fallback = new SR();
            this._fallback.lang = this.language; this._fallback.continuous = true; this._fallback.interimResults = true;
            this._fallback.onresult = (ev) => {
                let interim = "", final = "";
                for (let i = ev.resultIndex; i < ev.results.length; i++) {
                    const r = ev.results[i];
                    if (r.isFinal) final += r[0].transcript;
                    else interim += r[0].transcript;
                }
                if (final) this._emit("final", { text: final, ts: performance.now(), confidence: 1 });
                if (interim) this._emit("partial", { text: interim, ts: performance.now() });
            };
            this._fallback.onerror = (e) => { telemetry.error(ERR.E_ASR_INIT, "webspeech:" + e.error); this._emit("error", { stage: "webspeech", message: e.error }); };
            this._state = "degraded";
            telemetry.count("asr.fallback");
        }
        _onWorkerMessage(e) {
            const { type, payload } = e.data || {};
            switch (type) {
                case "ready": this._emit("ready", payload); break;
                case "partial": this._emit("partial", payload); break;
                case "final": telemetry.count("asr.final"); this._emit("final", payload); break;
                case "error": log(1, "ASR worker error:", payload); telemetry.error(ERR.E_WORKER_MSG, payload.stage + ":" + payload.message); this._emit("error", payload); break;
                case "status": this._emit("status", payload); break;
            }
        }
        async start() {
            if (this._disposed) return false;
            if (this._state === "loading") await this._readyPromise;
            if (this._state === "degraded" && this._fallback) { try { this._fallback.start(); this._state = "ready"; return true; } catch (_) { return false; } }
            if (this._state !== "ready") return false;
            try {
                this._stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: this.sampleRate } });
                const AC = global.AudioContext || global.webkitAudioContext;
                this._audioCtx = new AC();
                await this._audioCtx.audioWorklet.addModule(this.opts.workletURL || "axelr-worklet.js");
                this._worklet = new AudioWorkletNode(this._audioCtx, "axelr-audio-worklet", {
                    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
                    processorOptions: { ringSAB: this._ring ? this._ring.sab : null, sampleRate: this._audioCtx.sampleRate, silenceMs: 300 }
                });
                this._worklet.port.onmessage = (e) => this._onWorkletMessage(e);
                this._source = this._audioCtx.createMediaStreamSource(this._stream);
                this._source.connect(this._worklet);
                const silentGain = this._audioCtx.createGain();
                silentGain.gain.value = 0;
                this._worklet.connect(silentGain);
                silentGain.connect(this._audioCtx.destination);
                if (this._workers && this._ring) this._workers.postMessage({ type: "audio", payload: { ringSAB: this._ring.sab, startTs: performance.now() } });
                telemetry.count("asr.start");
                this._emit("start", {});
                return true;
            } catch (err) {
                log(1, "LocalASR start:", err.message);
                telemetry.error(ERR.E_AUDIO_MIC, err.message);
                this._emit("error", { stage: "start", message: err.message });
                return false;
            }
        }
        _onWorkletMessage(e) {
            const { type } = e.data || {};
            if (type === "speech-start") this._emit("speech-start", e.data);
            else if (type === "speech-end") { this._emit("speech-end", e.data); if (this._workers) this._workers.postMessage({ type: "flush" }); }
        }
        stop() {
            if (this._fallback) try { this._fallback.stop(); } catch (_) {}
            if (this._source) { try { this._source.disconnect(); } catch (_) {} this._source = null; }
            if (this._worklet) { try { this._worklet.disconnect(); } catch (_) {} this._worklet = null; }
            if (this._stream) { for (const t of this._stream.getTracks()) try { t.stop(); } catch (_) {} this._stream = null; }
            if (this._audioCtx && this._audioCtx.state !== "closed") { try { this._audioCtx.close(); } catch (_) {} this._audioCtx = null; }
            telemetry.count("asr.stop");
            this._emit("stop", {});
        }
        dispose() {
            if (this._disposed) return;
            this._disposed = true; this.stop();
            if (this._fallback) { try { this._fallback.abort(); } catch (_) {} this._fallback = null; }
            if (this._workers) { try { this._workers.postMessage({ type: "dispose" }); } catch (_) {} try { this._workers.terminate(); } catch (_) {} this._workers = null; }
            if (this._ring) { this._ring.dispose(); this._ring = null; }
            if (this._listeners) { this._listeners.clear(); this._listeners = null; }
            this._state = "disposed";
        }
        get state() { return this._state; }
        get isLocal() { return this._state === "ready" && !this._fallback; }
    }
    NS.LocalASR = LocalASR;

    // ── ConfidenceGate ──────────────────────────────────────────────
    class ConfidenceGate {
        constructor(threshold = 0.35) { this.threshold = threshold; this.rejected = 0; this.accepted = 0; }
        filter(result) {
            if (!result || typeof result.confidence !== "number") { this.accepted++; return result; }
            if (result.confidence < this.threshold) { this.rejected++; telemetry.count("gate.reject"); return null; }
            this.accepted++; return result;
        }
        stats() { return { accepted: this.accepted, rejected: this.rejected }; }
        setThreshold(t) { this.threshold = Math.min(0.9, Math.max(0.05, t)); }
    }
    NS.ConfidenceGate = ConfidenceGate;

    // ── SLCP (#19): Session-Level Continuous Personalization ───────
    /**
     * Tracks user-vocab learning across sessions. When FixItOverlay fires
     * or user reverts a correction:
     *   - reverted correction → reject signal → ACX.recordRevert
     *   - accepted correction → accept signal → ACX.recordAccept + acoustic.record
     *   - user writes word manually after miss → LPGN boost
     * Persists in localStorage; loaded on next session start.
     */
    class SLCP {
        constructor(opts = {}) {
            this.storageKey = "axelr.slcp.v1";
            this.maxWords = 500;
            this._accepted = new Map();   // word → count
            this._rejected = new Map();
            this._acx = opts.acx || null;
            this._acoustic = opts.acoustic || null;
            this._lpgn = opts.lpgn || null;
            this._symspell = opts.symspell || null;
            this._lang = opts.language || "en-US";
            this._dirty = false;
            this._persistTimer = null;
            this._load();
        }
        _load() {
            try {
                const raw = global.localStorage.getItem(this.storageKey);
                if (!raw) return;
                const parsed = JSON.parse(raw);
                if (parsed.accepted) for (const [w, c] of parsed.accepted) this._accepted.set(w, c);
                if (parsed.rejected) for (const [w, c] of parsed.rejected) this._rejected.set(w, c);
            } catch (_) {}
        }
        _schedulePersist() {
            if (this._persistTimer) return;
            this._persistTimer = setTimeout(() => { this._persistTimer = null; this._persist(); }, 30000);
        }
        _persist() {
            if (!this._dirty) return;
            try {
                global.localStorage.setItem(this.storageKey, JSON.stringify({
                    accepted: [...this._accepted],
                    rejected: [...this._rejected],
                    v: 1
                }));
                this._dirty = false;
            } catch (_) {}
        }
        /** User accepted correction (survived 5s without revert) */
        recordAccepted(original, corrected) {
            if (!original || !corrected) return;
            const key = corrected.toLowerCase();
            this._accepted.set(key, (this._accepted.get(key) | 0) + 1);
            while (this._accepted.size > this.maxWords) this._accepted.delete(this._accepted.keys().next().value);
            // Feed acoustic map
            if (this._acoustic && original !== corrected) this._acoustic.record(original, corrected);
            // Feed LPGN if seen multiple times
            if (this._lpgn && this._accepted.get(key) >= 3) this._lpgn.addWord(corrected);
            // Feed SymSpell for user vocab
            if (this._symspell && this._accepted.get(key) >= 2) this._symspell.addCustomWord(corrected);
            // ACX tune
            if (this._acx) this._acx.recordAccept(this._lang);
            this._dirty = true; this._schedulePersist();
            telemetry.count("slcp.accepted");
        }
        /** User reverted correction */
        recordReverted(original, wrongCorrection) {
            if (!wrongCorrection) return;
            const key = wrongCorrection.toLowerCase();
            this._rejected.set(key, (this._rejected.get(key) | 0) + 1);
            while (this._rejected.size > this.maxWords) this._rejected.delete(this._rejected.keys().next().value);
            // If rejected many times, add to SymSpell as "do not correct"
            if (this._symspell && this._rejected.get(key) >= 3) this._symspell.addCustomWord(wrongCorrection, 0);
            if (this._acx) this._acx.recordRevert(this._lang);
            this._dirty = true; this._schedulePersist();
            telemetry.count("slcp.reverted");
        }
        /** User manually typed a word that was missed by ASR */
        recordMissed(word) {
            if (!word || word.length < 3) return;
            const key = word.toLowerCase();
            if (this._lpgn) this._lpgn.addWord(word);
            if (this._acx) this._acx.recordMissed(this._lang);
            this._dirty = true; this._schedulePersist();
            telemetry.count("slcp.missed");
        }
        /** Get all accepted user-vocab words */
        getLearnedVocab() { return [...this._accepted.keys()]; }
        size() { return this._accepted.size; }
        dispose() { if (this._persistTimer) clearTimeout(this._persistTimer); this._persist(); this._accepted.clear(); this._rejected.clear(); }
    }
    NS.SLCP = SLCP;

    // ── AsrRouter ───────────────────────────────────────────────────
    class AsrRouter {
        constructor(ring, intent, callbacks, locale, opts = {}) {
            this.ring = ring; this.intent = intent; this.cb = callbacks || {};
            this.locale = locale; this.opts = opts;
            this.mode = opts.mode || "auto";
            this.backend = null; this._disposed = false;
            this._local = null; this._cloud = null;
            this._gate = new ConfidenceGate(opts.confidenceGateThreshold ?? 0.7);
            this._capability = this._probe();
            this._localFailures = 0;
            this._localBackoffUntil = 0;
        }
        _probe() {
            const HAS_WORKLET = typeof AudioWorkletNode !== "undefined";
            const HAS_WASM = typeof WebAssembly !== "undefined";
            const HAS_WORKER = typeof Worker !== "undefined";
            const HAS_WEBSR = !!(global.webkitSpeechRecognition || global.SpeechRecognition);
            const HAS_MIC = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
            return { local: NS.HAS_SAB && HAS_WORKLET && HAS_WASM && HAS_WORKER && HAS_MIC, cloud: HAS_WEBSR && HAS_MIC, text: true };
        }
        capability() { return { ...this._capability }; }
        async start() {
            if (this._disposed) return false;
            const tier = this._selectTier();
            if (tier === "text") { this.backend = "text"; this._emit("tier", { tier }); return false; }
            if (tier === "local") {
                if (Date.now() < this._localBackoffUntil) {
                    telemetry.count("asr.local_backoff");
                } else {
                    if (await this._startLocal()) {
                        this.backend = "local";
                        this._emit("tier", { tier });
                        this._localFailures = 0;
                        return true;
                    }
                    this._localFailures++;
                    if (this._localFailures >= 3) {
                        this._localBackoffUntil = Date.now() + 60000 * 5; // 5 minutes
                        telemetry.error(ERR.E_ASR_INIT, "local backoff");
                    }
                    telemetry.count("asr.local_fallback");
                }
            }
            if (tier === "cloud" || this._capability.cloud) {
                if (this._startCloud()) { this.backend = "cloud"; this._emit("tier", { tier: "cloud" }); return true; }
            }
            this.backend = "text"; this._emit("tier", { tier: "text" });
            return false;
        }
        stop() { if (this._local && this._local.stop) this._local.stop(); if (this._cloud && this._cloud.stop) this._cloud.stop(); }
        _selectTier() {
            const c = this._capability, m = this.mode;
            if (m === "text") return "text";
            if (m === "cloud") return c.cloud ? "cloud" : "text";
            if (m === "local") return c.local ? "local" : (c.cloud ? "cloud" : "text");
            if (c.local) return "local"; if (c.cloud) return "cloud"; return "text";
        }
        async _startLocal() {
            if (!NS.LocalASR) return false;
            try {
                this._local = new NS.LocalASR({
                    language: this.locale.current,
                    modelURL: this.opts.modelURL, runtimeURL: this.opts.runtimeURL,
                    workerURL: this.opts.workerURL, workletURL: this.opts.workletURL,
                    sampleRate: 16000, ringMs: 800,
                    vocabMask: this.opts.vocabMask, biasWords: this.opts.biasWords,
                    vocabMode: this.opts.vocabMode || "soft"
                });
                this._local.on("final", (p) => this._onFinal(p));
                this._local.on("partial", (p) => this._onPartial(p));
                this._local.on("error", (e) => this._onError(e));
                await this._local.init();
                return await this._local.start();
            } catch (e) {
                log(2, "AsrRouter local:", e.message);
                telemetry.error(ERR.E_ASR_INIT, e.message);
                if (this._local) { try { this._local.dispose(); } catch (_) {} this._local = null; }
                return false;
            }
        }
        _startCloud() {
            if (!NS.VoicePipeline) return false;
            try {
                this._cloud = new NS.VoicePipeline(this.ring, this.intent, {
                    onToken: (t, r) => this._onFinal({ text: t, buffer: r.buffer, confidence: 1 }),
                    onInterim: (i, b) => this._onPartial({ text: i, buffer: b }),
                    onDegrade: (r) => this._onError({ message: r, stage: "cloud_degrade" })
                }, this.locale);
                return this._cloud.start();
            } catch (e) { log(2, "AsrRouter cloud:", e.message); return false; }
        }
        _onFinal({ text, buffer, confidence }) {
            // Route through confidence gate
            const gated = this._gate.filter({ text, confidence });
            if (!gated) { telemetry.count("asr.confidence_reject"); return; }
            let result;
            if (buffer != null) result = { kind: "tokens", buffer, confidence };
            else result = { ...this.intent.applyFinal(text), confidence };
            if (this.cb.onToken) this.cb.onToken(text, result);
        }
        _onPartial({ text, buffer }) { if (this.cb.onInterim) this.cb.onInterim(text, buffer || (this.ring.join() + " " + text)); }
        _onError(evt) { telemetry.error(ERR.E_ASR_TIMEOUT, String(evt.message || evt)); if (this.cb.onDegrade) this.cb.onDegrade(evt.message || evt); }
        _emit(ev, d) { const fn = this.cb["on" + ev[0].toUpperCase() + ev.slice(1)]; if (fn) try { fn(d); } catch (_) {} }
        async setMode(mode) { const was = !!this.backend && this.backend !== "text"; this.stop(); this.mode = mode; this.backend = null; return was ? await this.start() : false; }
        setLanguage(tag) { if (this._cloud && this._cloud.hotSwapLanguage) this._cloud.hotSwapLanguage(tag); return true; }
        /** Update vocab (called by orchestrator after SLCP learns new words) */
        setVocab(vocab, biasWords) {
            if (this._local && this._local._workers) {
                this._local._workers.postMessage({ type: "set_vocab", payload: { vocabMask: vocab } });
                if (biasWords) this.opts.biasWords = biasWords;
            }
        }
        dispose() {
            this._disposed = true;
            if (this._local) { try { this._local.dispose(); } catch (_) {} this._local = null; }
            if (this._cloud) { try { this._cloud.dispose(); } catch (_) {} this._cloud = null; }
            this.ring = null; this.intent = null; this.cb = {};
        }
    }
    NS.AsrRouter = AsrRouter;

    // CharCNN is defined once, in axelr-cnn.js — the single source of truth.
    // GLBackend is exported here so correction.js's CharCNN can use GPU acceleration.
    // (GLBackend lives in asr.js because that's where it was migrated to first;
    //  the shader sources + V/TRI_SIZE/MAX_WORD constants live inside GLBackend's closure.)
    log(3, "asr loaded (SLCP, ConfidenceGate)");
})(typeof window !== "undefined" ? window : null);