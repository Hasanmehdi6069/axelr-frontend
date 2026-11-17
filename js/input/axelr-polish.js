/*!
 * axelr-polish.js — BBE · ACX · Polish utilities · StreamingPartialRevisor.
 * Split from axelr-correction.js v4.0.1 for size compliance.
 * Load order: after phonetic, before asr.
 */
(function (global) {
    "use strict";
    const NS = global.AxelrInput;
    if (!NS || !NS.READY) { console.warn("axelr-polish: core required"); return; }
    const telemetry = NS.telemetry || { count() {} };
    const RAF = NS.CharCNNUtils.RAF;
    const CAF = NS.CharCNNUtils.CAF;

    class BBE {
        constructor(beamWidth = 5) {
            this.beamWidth = Math.max(1, Math.min(32, beamWidth));
            this.models = [];
            this.weights = [];
            this._weightSum = 0;
            this.vocab = new Map();
        }
        addModel(model, weight) {
            if (!model || typeof model.predict !== "function" || typeof weight !== "number" || weight <= 0) return false;
            this.models.push(model);
            this.weights.push(weight);
            this._weightSum += weight;
            return true;
        }
        predict(input, k = 0) {
            k = Math.min(this.beamWidth, Math.max(1, k || this.beamWidth));
            const scores = new Map();
            for (let m = 0; m < this.models.length; m++) {
                const modelScores = this.models[m].predict(input);
                if (!Array.isArray(modelScores)) continue;
                for (const s of modelScores) {
                    if (!s || typeof s.word !== "string" || typeof s.score !== "number") continue;
                    const w = (s.score * this.weights[m]) / this._weightSum;
                    scores.set(s.word, (scores.get(s.word) || 0) + w);
                }
            }
            for (const [word, boost] of this.vocab.entries()) {
                if (scores.has(word)) scores.set(word, scores.get(word) + boost);
            }
            const ranked = [];
            for (const [word, score] of scores.entries()) ranked.push({ word, score });
            ranked.sort((a, b) => b.score - a.score);
            return ranked.slice(0, k);
        }
        boost(word, amount = 0.1) {
            const w = String(word || "").toLowerCase().trim();
            if (!w || w.length > 64) return;
            this.vocab.set(w, Math.min((this.vocab.get(w) || 0) + amount, 1.5));
            telemetry.count("bbe.boost");
        }
        rank() {
            const arr = [];
            for (const [word, score] of this.vocab.entries()) arr.push({ word, score });
            arr.sort((a, b) => b.score - a.score);
            return arr;
        }
        rankCandidates(input, k) { return this.predict(input, k); }
        size() { return this.models.length; }
        dispose() {
            this.models.length = 0;
            this.weights.length = 0;
            this._weightSum = 0;
            this.vocab.clear();
        }
    }

    class ACX {
        constructor(minGain = 0.1, maxGain = 3.0, decay = 0.995) {
            this.gain = 1.0;
            this.minGain = Math.max(0.01, minGain);
            this.maxGain = Math.min(10.0, maxGain);
            this.decay = Math.max(0.9, Math.min(0.999, decay));
            this._history = [];
            this._lastError = 0;
        }
        tune(arg, step = 0.05) {
            if (typeof arg === "string") {
                if (arg === "up") this.gain = Math.min(this.gain + step, this.maxGain);
                else if (arg === "down") this.gain = Math.max(this.gain - step, this.minGain);
                telemetry.count("acx.tune." + arg);
                return this.gain;
            }
            if (typeof arg === "number" && !isNaN(arg) && arg >= 0) {
                this._history.push(arg);
                if (this._history.length > 100) this._history.shift();
                const delta = arg - this._lastError;
                if (delta < 0) this.gain = Math.min(this.gain + step, this.maxGain);
                else this.gain = Math.max(this.gain * this.decay, this.minGain);
                this._lastError = arg;
                return this.gain;
            }
            return this.gain;
        }
        getCurrentGain() { return this.gain; }
        stats() { return { historyLength: this._history.length, lastError: this._lastError, gain: this.gain }; }
        reset() { this.gain = 1.0; this._history.length = 0; this._lastError = 0; }
        dispose() { this.reset(); }
    }

    const SENTENCE_ENDERS = new Set(["please","thanks","okay","ok","yes","no","done","finished","complete","completed","stop","start","go","ready","sure","correct","wrong"]);
    const PAUSE_INTRO = new Set(["however","meanwhile","therefore","thus","consequently","furthermore","moreover","additionally","finally","first","second","third","next","then","also","besides","otherwise","instead","likewise","similarly","conversely","nonetheless"]);
    const QUESTION_STARTERS = new Set(["what","why","when","where","who","whom","whose","which","how","is","are","was","were","do","does","did","can","could","will","would","should","may","might","shall","have","has","had"]);
    const NUMBER_WORDS = { zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,hundred:100,thousand:1000,million:1000000,billion:1000000000 };
    const ORDINALS = { first:1,second:2,third:3,fourth:4,fifth:5,sixth:6,seventh:7,eighth:8,ninth:9,tenth:10,eleventh:11,twelfth:12,thirteenth:13,fourteenth:14,fifteenth:15,sixteenth:16,seventeenth:17,eighteenth:18,nineteenth:19,twentieth:20 };
    const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
    const DAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

    function isQuestion(words) {
        if (!words.length) return false;
        if (QUESTION_STARTERS.has(words[0].toLowerCase())) return true;
        const last = words[words.length - 1].toLowerCase();
        return last === "right" || last === "correct";
    }
    function capitalizeFirst(text) {
        return text && text.replace(/(^|[.!?]\s+)([a-z])/g, (_, p, ch) => p + ch.toUpperCase());
    }
    function restorePunctuation(text) {
        if (!text) return text;
        const trimmed = text.trim();
        if (!trimmed) return text;
        const words = trimmed.split(/\s+/);
        if (/[.!?]$/.test(trimmed)) return capitalizeFirst(trimmed);
        let out = trimmed;
        if (words.length > 2 && PAUSE_INTRO.has(words[0].toLowerCase())) {
            out = words[0] + ", " + words.slice(1).join(" ");
        }
        const isQ = isQuestion(words);
        if (isQ) out = out.replace(/[.,;:]+$/, "") + "?";
        else if (SENTENCE_ENDERS.has(words[words.length - 1].toLowerCase())) out = out.replace(/[.,;:]+$/, "") + ".";
        else if (words.length >= 3) out = out.replace(/[.,;:]+$/, "") + ".";
        return capitalizeFirst(out);
    }
    function formatNumbers(text) {
        if (!text) return text;
        const words = text.split(/(\s+)/);
        const out = [];
        let i = 0;
        while (i < words.length) {
            const lo = words[i].toLowerCase();
            if (NUMBER_WORDS[lo] !== undefined) {
                let total = 0, current = 0, j = i, consumed = 0;
                while (j < words.length) {
                    if (/^\s*$/.test(words[j])) { j++; continue; }
                    const w = words[j].toLowerCase();
                    if (w === "and" && current > 0) { j++; continue; }
                    if (NUMBER_WORDS[w] !== undefined) {
                        const n = NUMBER_WORDS[w];
                        if (n === 100) current = (current || 1) * 100;
                        else if (n >= 1000) { total += (current || 1) * n; current = 0; }
                        else current += n;
                        j++; consumed++;
                    } else break;
                }
                if (consumed > 0) { out.push(String(total + current)); i = j; continue; }
            }
            out.push(words[i]); i++;
        }
        return out.join("");
    }
    function formatDates(text) {
        if (!text) return text;
        for (const m of MONTHS) {
            const re = new RegExp(`\\b${m}\\s+(\\w+)`, "gi");
            text = text.replace(re, (match, dayWord) => {
                const day = ORDINALS[dayWord.toLowerCase()];
                return day === undefined ? match : m.charAt(0).toUpperCase() + m.slice(1) + " " + day;
            });
        }
        for (const d of DAYS) {
            text = text.replace(new RegExp(`\\b${d}\\b`, "gi"),
                d.charAt(0).toUpperCase() + d.slice(1));
        }
        return text;
    }
    function detectList(text) {
        if (!text) return text;
        const parts = text.split(/\b(first|second|third|fourth|fifth)\b/i);
        if (parts.length >= 5 && /^\s*$/.test(parts[0] || "")) {
            const items = [];
            for (let i = 1; i < parts.length; i += 2) {
                if (parts[i + 1] && parts[i + 1].trim()) items.push(parts[i + 1].trim());
            }
            if (items.length >= 2) return items.map((item, i) => `${i + 1}. ${item}`).join("\n");
        }
        return text;
    }
    const HAS_LOOKBEHIND = (() => { try { new RegExp("(?<=x)"); return true; } catch (_) { return false; } })();
    function splitSentences(text) {
        if (HAS_LOOKBEHIND) return text.split(/(?<=[.!?])\s+/);
        const out = [];
        let start = 0, i = 0;
        while (i < text.length) {
            const ch = text[i];
            if ((ch === "." || ch === "!" || ch === "?") && i + 1 < text.length && /\s/.test(text[i + 1])) {
                out.push(text.slice(start, i + 1));
                let j = i + 1;
                while (j < text.length && /\s/.test(text[j])) j++;
                start = j; i = j;
            } else i++;
        }
        if (start < text.length) out.push(text.slice(start));
        return out.length ? out : [text];
    }

    const FILLER_WORDS = new Set(["um","uh","er","ah","hmm","mm","mhm","basically","literally","actually","honestly"]);
    const FILLER_PHRASES = ["you know","i mean","kind of","sort of","like i said"];
    function filterFillers(text, opts = {}) {
        if (!text || text.length < 10) return text;
        const words = text.split(/\s+/);
        if (words.length < 4) return text;
        const out = [];
        for (let i = 0; i < words.length; i++) {
            const w = words[i].toLowerCase().replace(/[^\w']/g, "");
            const isFirst = i === 0;
            const isLast = i === words.length - 1;
            const isFiller = FILLER_WORDS.has(w) && !isFirst && !isLast;
            if (isFiller) telemetry.count("filler.dropped");
            else out.push(words[i]);
        }
        let result = out.join(" ");
        for (const phrase of FILLER_PHRASES) {
            const re = new RegExp("\\s+" + phrase.replace(/\s+/g, "\\s+") + "\\s+", "gi");
            const before = result.length;
            result = result.replace(re, " ");
            if (result.length < before) telemetry.count("filler.phrase_dropped");
        }
        return result.replace(/\s+/g, " ").trim();
    }

    function polish(text, opts) {
        if (!text) return text;
        const apEnabled = NS.AutoPunctuation ? NS.AutoPunctuation.enabled !== false : true;
        const o = opts || {};
        let out = text;
        if (o.fillers !== false) out = filterFillers(out, o);
        if (o.numbers !== false) out = formatNumbers(out);
        if (o.dates !== false) out = formatDates(out);
        if (o.lists !== false) out = detectList(out);
        if (o.punctuation !== false && apEnabled) {
            out = splitSentences(out).map(s => restorePunctuation(s)).join(" ");
        }
        telemetry.count("polish.applied");
        return out;
    }

    class StreamingPartialRevisor {
        constructor(opts = {}) {
            this.symspell = opts.symspell || null;
            this.homophones = opts.homophones || null;
            this.cnn = opts.cnn || null;
            this.scraper = opts.scraper || null;
            this.aggressive = false;
            this._lastText = "";
            this._pendingText = null;
            this._rafId = null;
            this._disposed = false;
            this.onRevise = typeof opts.onRevise === "function" ? opts.onRevise : null;
        }
        setAggressive(v) { this.aggressive = !!v; }
        submit(interimText) {
            if (this._disposed) return;
            this._pendingText = interimText;
            if (this._rafId !== null) return;
            this._rafId = RAF(() => {
                this._rafId = null;
                const t = this._pendingText;
                this._pendingText = null;
                if (t && t !== this._lastText) {
                    this._lastText = t;
                    const revised = this.revise(t);
                    if (this.onRevise) {
                        try { this.onRevise(revised, t); } catch (e) { /* logged by caller */ }
                    }
                }
            });
        }
        revise(text) {
            if (!text) return text;
            let out = text;
            if (this.symspell) {
                out = out.split(/(\s+)/).map(tok => {
                    if (/^\s+$/.test(tok)) return tok;
                    const clean = tok.replace(/[^a-zA-Z']/g, "");
                    if (clean.length < 3) return tok;
                    if (this.scraper && typeof this.scraper.known === "function" && this.scraper.known(clean)) return tok;
                    const hits = this.symspell.lookup(clean, 1);
                    if (hits.length > 0 && hits[0].distance === 1) return tok.replace(clean, hits[0].word);
                    return tok;
                }).join("");
            }
            if (this.homophones) out = this.homophones.resolveSentence(out);
            return out;
        }
        dispose() {
            this._disposed = true;
            if (this._rafId !== null) { CAF(this._rafId); this._rafId = null; }
            this.symspell = null;
            this.homophones = null;
            this.cnn = null;
            this.scraper = null;
            this.onRevise = null;
            this._pendingText = null;
        }
    }

    NS.BBE = BBE;
    NS.ACX = ACX;
    NS.filterFillers = filterFillers;
    NS.polish = polish;
    NS.polishUtils = { restorePunctuation, capitalizeFirst, formatNumbers, formatDates, detectList, splitSentences, filterFillers };
    NS.StreamingPartialRevisor = StreamingPartialRevisor;
})(typeof window !== "undefined" ? window : self);