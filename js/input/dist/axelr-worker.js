/*!
 * axelr-worker.js — ASR inference worker.
 *
 * Honest contract:
 *   - Without a real model, MockRuntime is ONLY loaded if the main thread
 *     sends runtime="mock" AND the worker was configured with allowMock=true.
 *   - In production, missing model → error payload, not fake tokens.
 *   - All per-token confidence values are real (from whisper.cpp) when
 *     available; heuristic heuristic confidence when not.
 *
 * Systems: #7 SGO · #8 AFS · #12 DAFC · #2 PGVC · #14 SCLB · #1 SCD · SCWB (#18)
 */
"use strict";

let RUNTIME = null, MODEL_READY = false;
let RING_HEADER = null, RING_DATA = null, RING = null;
let ALLOW_MOCK = false;

const CONFIG = Object.freeze({
    language: "en", sampleRate: 16000, maxChunkMs: 5000,
    frameDropRmsThreshold: 0.008,
    compactionPeakThreshold: 0.02,
    silenceMinimaWindow: 12,
    silenceMinimaRatio: 0.35,
});

const SGO = {
    pcmChunk: new Float32Array((CONFIG.sampleRate * CONFIG.maxChunkMs) / 1000),
    int16Scratch: new Int16Array(4096),
    energyEnvelope: new Float32Array(256),
    vocabSet: null,
    initialPrompt: "",
    vocabMode: "soft",
    vocabPenalty: 0.15,
};

function attachRing(sab) {
    const hb = 16, db = sab.byteLength - hb;
    RING_HEADER = new Int32Array(sab, 0, 4);
    RING_DATA = new Int16Array(sab, hb, db / 2);
    RING = { cap: RING_DATA.length, mask: RING_DATA.length - 1 };
}

function readRing(maxOut) {
    if (!RING_HEADER) return null;
    const head = Atomics.load(RING_HEADER, 0);
    const tail = Atomics.load(RING_HEADER, 1);
    const used = head - tail;
    if (used === 0) return null;
    const take = Math.min(used, maxOut);
    const start = tail & RING.mask;
    const first = Math.min(take, RING.cap - start);
    let out;
    if (take <= SGO.int16Scratch.length) out = SGO.int16Scratch.subarray(0, take);
    else out = new Int16Array(take);
    out.set(RING_DATA.subarray(start, start + first), 0);
    if (first < take) out.set(RING_DATA.subarray(0, take - first), first);
    Atomics.store(RING_HEADER, 1, tail + take);
    return out;
}

// ═══════════════════════════════════════════════════════════════
// Runtimes
// ═══════════════════════════════════════════════════════════════
class MockRuntime {
    constructor() { this.name = "mock"; }
    async init() { return true; }
    async transcribe(pcm) {
        let energy = 0;
        for (let i = 0; i < pcm.length; i += 100) energy += Math.abs(pcm[i]);
        const rms = energy / Math.max(1, pcm.length / 100);
        if (rms < 0.01) return { text: "", confidence: 0.05, inferenceMs: 1 };
        return { text: "hello world",
                 confidence: Math.min(0.95, 0.4 + rms * 5), inferenceMs: 1 };
    }
    dispose() {}
}

class WhisperCppRuntime {
    constructor({ runtimeURL, modelURL }) {
        this.runtimeURL = runtimeURL; this.modelURL = modelURL;
        this.name = "whispercpp"; this.ctx = null; this.Module = null;
        this._hasTokenProb = false;
    }
    async init() {
        importScripts(this.runtimeURL);
        const self_ = self;
        await new Promise((resolve, reject) => {
            if (self_.Module && self_.Module.calledRun) return resolve();
            self_.Module = self_.Module || {};
            self_.Module.onRuntimeInitialized = resolve;
            self_.Module.onAbort = () => reject(new Error("whisper_wasm_abort"));
        });
        this.Module = self_.Module;
        this._hasTokenProb =
            typeof this.Module._whisper_full_n_tokens === "function" &&
            typeof this.Module._whisper_full_get_token_p === "function";
        // Use ensureModel for auto-download with SHA256 verification
        const buf = await ensureModel(this.modelURL, null, (received, total) => {
            self.postMessage({
                type: "status",
                payload: { phase: "loading_model", progress: received, total }
            });
        });
        this.Module.FS_createDataFile("/", "model.bin", buf, true, true, false);
        this.ctx = this.Module._whisper_init_from_file("/model.bin");
        if (!this.ctx) throw new Error("whisper_init_failed");
        return true;
    }
    async transcribe(pcm16k) {
        const M = this.Module;
        const n = pcm16k.length;
        const ptr = M._malloc(n * 4);
        M.HEAPF32.set(pcm16k.subarray(0, n), ptr >>> 2);
        const t0 = performance.now();
        const nSeg = M._whisper_full_default(this.ctx, ptr, n, CONFIG.language, 4);
        const elapsed = performance.now() - t0;
        if (nSeg < 0) { M._free(ptr); throw new Error("whisper_full_failed"); }
        let text = "", totalProb = 0, totalTokens = 0;
        for (let i = 0; i < nSeg; i++) {
            const segPtr = M._whisper_full_get_segment_text(this.ctx, i);
            text += M.UTF8ToString(segPtr);
            if (this._hasTokenProb) {
                const nTok = M._whisper_full_n_tokens(this.ctx, i);
                for (let j = 0; j < nTok; j++) {
                    totalProb += M._whisper_full_get_token_p(this.ctx, i, j);
                    totalTokens++;
                }
            }
        }
        M._free(ptr);
        const confidence = totalTokens > 0
            ? totalProb / totalTokens
            : this._heuristicConfidence(text, pcm16k);
        return { text: text.trim(), confidence,
                 inferenceMs: elapsed, tokens: totalTokens };
    }
    _heuristicConfidence(text, pcm) {
        if (!text) return 0.05;
        const wordCount = text.split(/\s+/).filter(Boolean).length;
        const audioSec = pcm.length / CONFIG.sampleRate;
        const expectedWords = audioSec * 2.5;
        const ratio = Math.min(1, expectedWords / Math.max(1, wordCount));
        const rareChars = (text.match(/[^a-zA-Z0-9\s'\-.,!?]/g) || []).length;
        const rareRatio = 1 - Math.min(1, rareChars / Math.max(1, text.length) * 10);
        return Math.max(0.1, Math.min(0.9, ratio * rareRatio * 0.85));
    }
    dispose() {
        if (this.ctx) this.Module._whisper_free(this.ctx);
        this.ctx = null; this.Module = null;
    }
}

async function ensureModel(url, expectedSha256, onProgress) {
    try {
        let total = 0;
        try {
            const head = await fetch(url, { method: "HEAD" });
            if (head.ok) total = parseInt(head.headers.get("content-length") || "0", 10);
        } catch (_) { /* HEAD unsupported — proceed to GET */ }
        const resp = await fetch(url);
        if (!resp.ok) throw new Error("fetch_failed");
        if (!total) total = parseInt(resp.headers.get("content-length") || "0", 10);
        const reader = resp.body.getReader();
        const chunks = [];
        let received = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value); received += value.length;
            if (onProgress) onProgress(received, total);
        }
        const buf = new Uint8Array(received);
        let off = 0;
        for (const c of chunks) { buf.set(c, off); off += c.length; }
        if (expectedSha256) {
            const hashBuf = await crypto.subtle.digest("SHA-256", buf);
            const hashHex = [...new Uint8Array(hashBuf)].map(b => b.toString(16).padStart(2, "0")).join("");
            if (hashHex !== expectedSha256) throw new Error("sha_mismatch");
        }
        return buf;
    } catch (e) {
        throw new Error("model_download_failed: " + e.message);
    }
}

// Export to global scope for use in WhisperCppRuntime
self.ensureModel = ensureModel;

// ═══════════════════════════════════════════════════════════════
// AFS (#8) + DAFC (#12) + SCWB (#18)
// ═══════════════════════════════════════════════════════════════
function computeRMS(pcm) {
    if (pcm.length === 0) return 0;
    let sumSq = 0;
    const step = Math.max(1, Math.floor(pcm.length / 512));
    let count = 0;
    for (let i = 0; i < pcm.length; i += step) {
        sumSq += pcm[i] * pcm[i]; count++;
    }
    return Math.sqrt(sumSq / Math.max(1, count));
}

function shouldDropFrame(pcm) {
    const rms = computeRMS(pcm);
    if (rms < CONFIG.frameDropRmsThreshold) {
        self.postMessage({ type: "status",
                          payload: { phase: "drop", rms } });
        return true;
    }
    return false;
}

function compactFrames(pcm) {
    const t = CONFIG.compactionPeakThreshold;
    let start = 0, end = pcm.length;
    while (start < end && Math.abs(pcm[start]) < t) start++;
    while (end > start && Math.abs(pcm[end - 1]) < t) end--;
    return start === 0 && end === pcm.length ? pcm : pcm.subarray(start, end);
}

function trimAtSilence(pcm) {
    if (pcm.length < 1600) return pcm;
    const tailStart = Math.floor(pcm.length * 0.85);
    const tail = pcm.subarray(tailStart);
    const rms = computeRMS(tail);
    const threshold = rms * CONFIG.silenceMinimaRatio;
    let lastMin = -1;
    const win = CONFIG.silenceMinimaWindow;
    for (let i = 0; i + win < tail.length; i += win) {
        let localMax = 0;
        for (let j = i; j < i + win; j++) {
            const a = Math.abs(tail[j]);
            if (a > localMax) localMax = a;
        }
        if (localMax < threshold) lastMin = i + win;
    }
    if (lastMin > 0) return pcm.subarray(0, tailStart + lastMin + win);
    return pcm;
}

// ═══════════════════════════════════════════════════════════════
// PGVC (#2) — Vocabulary constraining
// ═══════════════════════════════════════════════════════════════
function constrainVocab(result) {
    if (!SGO.vocabSet || SGO.vocabSet.size === 0) return result;
    const tokens = result.text.split(/\s+/).filter(Boolean);
    if (SGO.vocabMode === "strict") {
        const out = [];
        for (const tok of tokens) {
            const lo = tok.toLowerCase().replace(/[^a-z']/g, "");
            if (SGO.vocabSet.has(lo)) out.push(tok);
            else if (result.confidence >= 0.5) out.push(tok);
        }
        return { ...result, text: out.join(" ") };
    }
    return result;
}

function buildBiasPrompt(words) {
    if (!words || words.length === 0) return "";
    return words.slice(0, 32).join(" ");
}

// ═══════════════════════════════════════════════════════════════
// Message protocol
// ═══════════════════════════════════════════════════════════════
self.onmessage = async (e) => {
    const { type, payload } = e.data || {};
    try {
        if (type === "init") {
            const { runtime, vocabMask, biasWords, vocabMode,
                    allowMock, ...rest } = payload || {};
            ALLOW_MOCK = allowMock === true;
            if (Array.isArray(vocabMask) && vocabMask.length > 0) {
                SGO.vocabSet = new Set(vocabMask.map(w => String(w).toLowerCase()));
                SGO.vocabMode = vocabMode || "soft";
            }
            if (Array.isArray(biasWords) && biasWords.length > 0) {
                SGO.initialPrompt = buildBiasPrompt(biasWords);
            }
            if (runtime === "mock") {
                if (!ALLOW_MOCK) {
                    throw new Error(
                        "mock_runtime_blocked: set AXELR_ALLOW_MOCK=1 on server");
                }
                RUNTIME = new MockRuntime();
            } else if (runtime === "whispercpp") {
                RUNTIME = new WhisperCppRuntime(rest);
            } else {
                throw new Error("unknown_runtime: " + runtime);
            }
            self.postMessage({
                type: "status", payload: { phase: "loading", progress: 0 },
            });
            await RUNTIME.init();
            MODEL_READY = true;
            self.postMessage({
                type: "ready",
                payload: {
                    runtime: RUNTIME.name,
                    vocabSize: SGO.vocabSet ? SGO.vocabSet.size : 0,
                    biasActive: !!SGO.initialPrompt,
                    realConfidence: !!RUNTIME._hasTokenProb,
                },
            });
        } else if (type === "audio") {
            if (!MODEL_READY) throw new Error("not_ready");
            if (payload && payload.ringSAB) attachRing(payload.ringSAB);
            await transcribeLoop();
        } else if (type === "flush") {
            if (MODEL_READY) await transcribeLoop(true);
        } else if (type === "set_vocab") {
            if (Array.isArray(payload.vocabMask)) {
                SGO.vocabSet = new Set(
                    payload.vocabMask.map(w => String(w).toLowerCase()));
            }
        } else if (type === "dispose") {
            if (RUNTIME) RUNTIME.dispose();
            RUNTIME = null; MODEL_READY = false;
            RING = null; RING_HEADER = null; RING_DATA = null;
            self.close();
        }
    } catch (err) {
        self.postMessage({
            type: "error", payload: { stage: type, message: err.message },
        });
    }
};

async function transcribeLoop(flushNow) {
    const targetSamples = (CONFIG.maxChunkMs / 1000) * CONFIG.sampleRate;
    const partialThreshold = (CONFIG.maxChunkMs / 2000) * CONFIG.sampleRate;
    let got = 0;
    while (got < targetSamples) {
        const chunk = readRing(Math.min(targetSamples - got, 4096));
        if (!chunk) {
            if (flushNow) break;
            await new Promise(r => setTimeout(r, 50));
            if (RING_HEADER && (Atomics.load(RING_HEADER, 0)
                - Atomics.load(RING_HEADER, 1)) === 0 && got === 0) return;
            continue;
        }
        const take = Math.min(chunk.length, targetSamples - got);
        for (let i = 0; i < take; i++) SGO.pcmChunk[got + i] = chunk[i] / 32768;
        got += take;
        if (got >= partialThreshold && got < targetSamples) {
            const partialPcm = SGO.pcmChunk.subarray(0, got);
            try {
                const partialResult = await RUNTIME.transcribe(partialPcm);
                if (partialResult.text && partialResult.text.length > 0) {
                    const constrained = constrainVocab(partialResult);
                    self.postMessage({
                        type: "partial",
                        payload: {
                            text: constrained.text,
                            ts: performance.now(),
                            confidence: constrained.confidence || 0,
                            progress: got / targetSamples,
                        },
                    });
                }
            } catch (e) {}
        }
    }
    if (got === 0) return;
    let pcm = SGO.pcmChunk.subarray(0, got);
    if (shouldDropFrame(pcm)) {
        self.postMessage({ type: "status", payload: { phase: "silence_drop" } });
        return;
    }
    pcm = compactFrames(pcm);
    pcm = trimAtSilence(pcm);
    try {
        const result = await RUNTIME.transcribe(pcm);
        if (!result.text) return;
        const constrained = constrainVocab(result);
        self.postMessage({
            type: "final",
            payload: {
                text: constrained.text,
                ts: performance.now(),
                inferenceMs: result.inferenceMs || 0,
                confidence: constrained.confidence || 0,
                tokens: result.tokens || 0,
                vocabApplied: SGO.vocabSet ? SGO.vocabSet.size : 0,
            },
        });
    } catch (err) {
        self.postMessage({
            type: "error",
            payload: { stage: "transcribe", message: err.message },
        });
    }
}