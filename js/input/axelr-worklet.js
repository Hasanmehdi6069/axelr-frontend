/*!
 * axelr-worklet.js — AudioWorkletProcessor: mic → Int16 → SAB ring + inline VAD.
 * v3.1.1: matches audio.js SPSC discipline — writer advances head only.
 */
class AxelrAudioWorklet extends AudioWorkletProcessor {
    constructor(options) {
        super();
        const o = (options && options.processorOptions) || {};
        this.ringSAB = o.ringSAB;
        this.sampleRate = o.sampleRate || 16000;
        this.silenceMs = o.silenceMs || 300;
        this.minSpeechMs = o.minSpeechMs || 150;
        this.zcrMin = o.zcrMin || 0.02;
        this.zcrMax = o.zcrMax || 0.35;
        if (this.ringSAB) {
            const headerBytes = 16;
            const dataBytes = this.ringSAB.byteLength - headerBytes;
            this.header = new Int32Array(this.ringSAB, 0, 4);
            this.data = new Int16Array(this.ringSAB, headerBytes, dataBytes / 2);
            this.cap = this.data.length;
            this.mask = this.cap - 1;
        } else {
            this.header = null; this.data = null; this.cap = 0; this.mask = 0;
        }
        this._int16Buf = new Int16Array(2048);
        this.vadState = "idle";
        this.speechFrames = 0;
        this.silenceFrames = 0;
        this.silenceFramesNeeded = Math.ceil(this.silenceMs / 10);
        this.minSpeechFrames = Math.ceil(this.minSpeechMs / 10);
        this.envelope = 0;
        this.noiseMean = 0.01;
        this.noiseSamples = 0;
        this._healthCounter = 0;
        this.port.postMessage({ type: "ready" });
    }
    _emitRingHealth() {
        if (!this.header) return;
        const head = Atomics.load(this.header, 0);
        const tail = Atomics.load(this.header, 1);
        const used = head - tail;
        this.port.postMessage({
            type: "ring-health",
            used: used,
            cap: this.cap,
            utilization: used / this.cap,
            state: this.vadState
        });
    }

    /**
     * SPSC-safe write. Writer advances head only; drops NEW samples on overflow.
     * Mirrors axelr-audio.js#AudioRing.write().
     */
    _writeRing(samples) {
        if (!this.header) return;
        const n = samples.length;
        if (n === 0) return;
        const head = Atomics.load(this.header, 0);
        const tail = Atomics.load(this.header, 1);
        const free = this.cap - (head - tail);
        if (free <= 0) return;                     // ring full — drop whole write
        const write = Math.min(n, free);
        const start = head & this.mask;
        const first = Math.min(write, this.cap - start);
        this.data.set(samples.subarray(0, first), start);
        if (first < write) this.data.set(samples.subarray(first, write), 0);
        Atomics.store(this.header, 0, head + write);
        Atomics.notify(this.header, 0);
    }

    process(inputs) {
        const input = inputs[0];
        if (!input || !input[0]) return true;
        const frame = input[0];
        const n = frame.length;
        if (n === 0) return true;
        if (this._int16Buf.length < n) this._int16Buf = new Int16Array(n * 2);
        const buf = this._int16Buf;
        let sumSq = 0, peak = 0, zc = 0, lastSign = 0;
        for (let i = 0; i < n; i++) {
            const v = frame[i];
            const clamped = v < -1 ? -1 : v > 1 ? 1 : v;
            buf[i] = (clamped * 32767) | 0;
            const abs = clamped < 0 ? -clamped : clamped;
            if (abs > peak) peak = abs;
            sumSq += clamped * clamped;
            const sign = clamped >= 0 ? 1 : -1;
            if (lastSign !== 0 && sign !== lastSign) zc++;
            lastSign = sign;
        }
        this._writeRing(buf.subarray(0, n));
        const rms = Math.sqrt(sumSq / n);
        const zcr = zc / n;
        const attack = 0.5, release = 0.05;
        if (rms > this.envelope) this.envelope = attack * rms + (1 - attack) * this.envelope;
        else this.envelope = release * rms + (1 - release) * this.envelope;
        this.noiseSamples++;
        const alpha = Math.min(0.001, 1 / this.noiseSamples);
        this.noiseMean = (1 - alpha) * this.noiseMean + alpha * rms;
        const threshold = Math.max(0.005, this.noiseMean * 3);
        const isSpeech = this.envelope > threshold && peak > 0.05 && zcr >= this.zcrMin && zcr <= this.zcrMax;
        if (isSpeech) {
            this.speechFrames++;
            this.silenceFrames = 0;
            if (this.vadState === "idle" && this.speechFrames >= 2) {
                this.vadState = "active";
                this.port.postMessage({ type: "speech-start", ts: currentTime * 1000 });
            }
        } else if (this.vadState === "active") {
            this.silenceFrames++;
            if (this.silenceFrames >= this.silenceFramesNeeded) {
                this.vadState = "idle";
                if (this.speechFrames >= this.minSpeechFrames) {
                    this.port.postMessage({ type: "speech-end", ts: currentTime * 1000, speechMs: this.speechFrames * 10 });
                }
                this.speechFrames = 0;
            }
        }
        this._healthCounter++;
        if (this._healthCounter >= 100) {
            this._emitRingHealth();
            this._healthCounter = 0;
        }
        return true;
    }
}
registerProcessor("axelr-audio-worklet", AxelrAudioWorklet);