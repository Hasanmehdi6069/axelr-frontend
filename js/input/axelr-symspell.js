/*!
 * axelr-symspell.js — Levenshtein + SymSpell.
 * Split from axelr-correction.js v4.0.1 for size compliance.
 * Load order: after cnn, before phonetic.
 */
(function (global) {
    "use strict";
    const NS = global.AxelrInput;
    if (!NS || !NS.READY) { console.warn("axelr-symspell: core required"); return; }
    const telemetry = NS.telemetry || { count() {} };

    const WORDS_RAW = (
        "new clear open close save export import send stop undo redo delete settings " +
        "cancel confirm apply reset retry back forward next previous search find filter " +
        "sort format enhance summarize translate deploy preview debug run execute " +
        "the be to of and a in that have i it for not on with he as you do at this " +
        "but his by from they we say her she or an will my one all would there their " +
        "what so up out if about who get which go me when make can like time no just " +
        "him know take people into year your good some could them see other than then " +
        "now look only come its over think also back after use two how our work first " +
        "well way even new want because any these give day most us is was were been has " +
        "had did does doing done being am are will would can could should may might " +
        "must shall here where why when who whom whose which what that this those " +
        "function class module package import export const let var async await promise " +
        "array object string number boolean null undefined true false return break " +
        "continue while for if else switch case default try catch finally throw new " +
        "this super static public private protected extend implement interface type " +
        "react vue svelte angular next nuxt astro solid css html javascript typescript " +
        "node npm yarn pnpm python rust go java ruby php docker kubernetes sql " +
        "api endpoint server client request response database query select insert " +
        "update delete where group order limit join table index column row schema " +
        "receive believe achieve separate occurred definitely their there they're " +
        "your you're its it's then than were we're where whose who's right write " +
        "hear here weather whether affect effect accept except advice advise"
    );

    function levenshtein(a, b, max) {
        const la = a.length, lb = b.length;
        if (Math.abs(la - lb) > max) return max + 1;
        let prev = new Uint16Array(lb + 1), curr = new Uint16Array(lb + 1);
        for (let j = 0; j <= lb; j++) prev[j] = j;
        for (let i = 1; i <= la; i++) {
            curr[0] = i;
            let rowMin = i;
            for (let j = 1; j <= lb; j++) {
                const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
                curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
                if (curr[j] < rowMin) rowMin = curr[j];
            }
            if (rowMin > max) return max + 1;
            const t = prev; prev = curr; curr = t;
        }
        return prev[lb];
    }

    class SymSpell {
        constructor(maxEditDistance = 2) {
            this.maxDist = Math.min(2, Math.max(1, maxEditDistance | 0));
            this.words = [];
            this.freq = [];
            this.wordIndex = new Map();
            this.deletes = new Map();
            this._rawCursor = 0;
            this._built = false;
            this._buildPartial();
            const finish = () => { if (!this._built) this._buildRest(); };
            if (typeof requestIdleCallback === "function") requestIdleCallback(finish, { timeout: 2000 });
            else setTimeout(finish, 50);
        }
        static fromWords(words, maxDist = 2) {
            const s = new SymSpell(maxDist);
            s.ensureBuilt();
            for (const w of words) s.addCustomWord(w);
            return s;
        }
        _buildPartial() { this._buildFromSource(400); }
        _buildRest() { this._buildFromSource(Infinity); this._built = true; }
        ensureBuilt() { if (!this._built) this._buildRest(); return this; }
        _buildFromSource(limit) {
            if (!this.words || !this.freq) return;
            const raw = WORDS_RAW.split(/\s+/).filter(Boolean);
            const end = limit === Infinity ? raw.length : Math.min(raw.length, this._rawCursor + limit);
            for (let i = this._rawCursor; i < end; i++) {
                const w = raw[i].toLowerCase();
                if (w.length < 2 || this.wordIndex.has(w)) continue;
                const rank = this.words.length;
                this.words.push(w);
                this.freq.push(rank);
                this.wordIndex.set(w, rank);
                this._insertDeletes(w, rank);
            }
            this._rawCursor = end;
        }
        _insertDeletes(word, rank) {
            if (!word || typeof word !== "string" || !word.length) return;
            if (!this.deletes) this.deletes = new Map();
            for (let i = 0; i < word.length; i++) {
                const del = word.slice(0, i) + word.slice(i + 1);
                let list = this.deletes.get(del);
                if (!list) { list = []; this.deletes.set(del, list); }
                if (list.length < 64) list.push(rank);
            }
        }
        addCustomWord(word, frequency) {
            if (!this.words) this.words = [];
            if (!this.freq) this.freq = [];
            if (!this.wordIndex) this.wordIndex = new Map();
            if (!this.deletes) this.deletes = new Map();
            const w = String(word || "").toLowerCase().trim();
            if (!w || w.length < 2 || w.length > 64 || this.wordIndex.has(w)) return false;
            const rank = this.words.length;
            this.words.push(w);
            this.freq.push(typeof frequency === "number" ? frequency : rank);
            this.wordIndex.set(w, rank);
            this._insertDeletes(w, rank);
            telemetry.count("symspell.custom_added");
            return true;
        }
        lookup(input, maxDist) {
            const target = String(input || "").toLowerCase().trim();
            if (!target || target.length < 2) return [];
            const d = Math.min(this.maxDist, maxDist == null ? 2 : maxDist);
            const exact = this.wordIndex.get(target);
            if (exact !== undefined) return [{ word: target, distance: 0, frequency: exact }];
            const results = [];
            const seen = new Set();
            this._collect(target, 1, results, seen);
            if (d >= 2) for (const td of this._allDeletes(target)) this._collect(td, 2, results, seen);
            results.sort((a, b) => a.distance !== b.distance ? a.distance - b.distance : a.frequency - b.frequency);
            const verified = [];
            for (const r of results) {
                if (!r || !r.word) continue;
                const trueDist = levenshtein(target, r.word, d);
                if (trueDist <= d) verified.push({ word: r.word, distance: trueDist, frequency: r.frequency });
                if (verified.length >= 8) break;
            }
            return verified;
        }
        lookupBatch(tokens, maxDist) {
            const out = [];
            for (const t of tokens) {
                const hits = this.lookup(t, maxDist);
                out.push(hits.length > 0 ? hits[0].word : t);
            }
            return out;
        }
        _collect(variant, distance, results, seen) {
            const list = this.deletes.get(variant);
            if (!list) return;
            for (const rank of list) {
                const word = this.words[rank];
                if (!word || seen.has(word)) continue;
                seen.add(word);
                results.push({ word, distance, frequency: rank });
            }
        }
        _allDeletes(word) {
            const out = new Set();
            for (let i = 0; i < word.length; i++) {
                const d1 = word.slice(0, i) + word.slice(i + 1);
                out.add(d1);
                for (let j = i; j < d1.length; j++) out.add(d1.slice(0, j) + d1.slice(j + 1));
            }
            return out;
        }
        size() { return this.words ? this.words.length : 0; }
        stats() {
            return {
                words: this.size(),
                deletes_keys: this.deletes ? this.deletes.size : 0,
                built: this._built,
                maxDist: this.maxDist,
            };
        }
        dispose() {
            this.words = null;
            this.freq = null;
            if (this.wordIndex) this.wordIndex.clear();
            if (this.deletes) this.deletes.clear();
            this._rawCursor = 0;
            this._built = false;
        }
    }



    const PhoneticEnsemble = {
        encode(word) {
            // Always use the latest NS implementations (canonical ones from axelr-phonetic.js)
            const soundexImpl = NS.soundex || (() => "");
            const metaphoneImpl = NS.metaphone || (() => "");
            return [soundexImpl(word), metaphoneImpl(word)];
        }
    };

    // Expose phonetic functions only if they haven't been exposed yet (prevents overwrites)
    if (!NS.soundex) NS.soundex = () => { console.warn("axelr-symspell: waiting for axelr-phonetic.js to load soundex"); return ""; };
    if (!NS.metaphone) NS.metaphone = () => { console.warn("axelr-symspell: waiting for axelr-phonetic.js to load metaphone"); return ""; };
    if (!NS.PhoneticEnsemble) NS.PhoneticEnsemble = PhoneticEnsemble;
    if (!NS.levenshtein) NS.levenshtein = levenshtein;
    if (!NS.SymSpell) NS.SymSpell = SymSpell;
})(typeof window !== "undefined" ? window : self);