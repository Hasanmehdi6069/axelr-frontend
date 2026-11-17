/*!
 * axelr-phonetic.js — Metaphone · Soundex · HomophoneMatrix · LPGN · PhoneticCorrector.
 * Split from axelr-correction.js v4.0.1 for size compliance.
 * Load order: after symspell, before polish.
 */
(function (global) {
    "use strict";
    const NS = global.AxelrInput;
    if (!NS || !NS.READY) { console.warn("axelr-phonetic: core required"); return; }
    const telemetry = NS.telemetry || { count() {} };

    // Load shared runtime tables from single source
    let runtimeTables = null;
    (async function loadRuntimeTables() {
        try {
            const res = await fetch('/runtime-tables.json');
            runtimeTables = await res.json();
        } catch (e) {
            console.warn("axelr-phonetic: failed to load runtime-tables.json, using fallback values", e);
            // Fallback values for backward compatibility
            runtimeTables = {
                homophone_words: ["their","there","they're","to","too","two","your","you're","its","it's","then","than","were","we're","where","whose","who's","right","write","rite","hear","here","weather","whether","affect","effect","accept","except","advice","advise","aloud","allowed","brake","break","buy","by","bye","cite","site","sight","complement","compliment","council","counsel","fair","fare","flour","flower","for","four","fore","knew","new","know","no","lead","led","loan","lone","meat","meet","peace","piece","plain","plane","principal","principle","rain","reign","rein","read","reed","role","roll","scene","seen","sea","see","sole","soul","son","sun","stationary","stationery","steal","steel","tail","tale","through","threw","wait","weight","weak","week","wear","ware","which","witch","wood","would","bare","bear","beat","beet","blew","blue","board","bored","cell","sell","cent","scent","sent","cereal","serial","coarse","course","dear","deer","die","dye","dual","duel","faze","phase","feat","feet","fir","fur","flea","flee","foul","fowl","freeze","frieze","grate","great","groan","grown","hale","hail","hall","haul","heal","heel","herd","heard","hoard","horde","hoarse","horse","hole","whole","holy","wholly","hour","our","idle","idol","idyll","knead","need","knight","night","knot","not","leased","least","lessen","lesson","made","maid","mail","male","main","mane","might","mite","miner","minor","moan","mown","moat","mote","oar","or","ore","oh","owe","one","won","pain","pane","pair","pear","pare","peak","peek","pique","peer","pier","pole","poll","pore","pour","pray","prey","prize","pries","profit","prophet","raise","rays","raze","rap","wrap","real","reel","ring","wring","road","rode","rowed","rose","rows","sale","sail","shear","sheer","soar","sore","some","sum","stair","stare","stake","steak","straight","strait","suite","sweet","tide","tied","toe","tow","vain","vane","vein","vale","veil","waist","waste","waive","wave","war","wore","warn","worn","way","weigh","whey","whine","wine","yoke","yolk","you","ewe","yew"],
                homophone_context: {
                    "their":{"is":"there", "are":"there", "was":"there", "were":"there", "has":"there", "have":"there", "will":"there", "would":"there", "they":"their", "them":"their", "we":"their", "our":"their", "over":"there", "out":"there", "in":"there", "at":"there"},
                    "to":{"go":"to", "want":"to", "need":"to", "have":"to", "able":"to", "going":"to", "back":"to", "much":"too", "many":"too", "far":"too", "big":"too"},
                    "too":{"much":"too", "many":"too", "far":"too", "big":"too", "go":"to", "want":"to"},
                    "your":{"you":"you're", "are":"you're", "were":"you're", "going":"you're", "the":"your", "my":"your", "our":"your"},
                    "its":{"it":"it's", "is":"its", "was":"its", "has":"its", "a":"it's", "the":"it's"},
                    "then":{"better":"than", "more":"than", "less":"than", "rather":"than", "other":"than", "greater":"than", "fewer":"than"},
                    "whose":{"who":"who's", "it":"who's", "he":"who's", "she":"who's"},
                    "right":{"write":"write", "read":"write", "code":"write", "please":"write", "to":"write", "want":"write"},
                    "hear":{"come":"here", "go":"here", "is":"here", "you":"here", "over":"here", "in":"here"},
                    "weather":{"or":"whether", "not":"whether", "if":"whether"},
                    "affect":{"an":"effect", "the":"effect", "side":"effect", "special":"effect"},
                    "effect":{"to":"affect", "will":"affect", "can":"affect", "does":"affect"}
                }
            };
        }
    })();

    // Soundex implementation matching Python's standard American Soundex
    const SOUNDEX_MAP = {
        'P': '1', 'B': '1', 'F': '1', 'V': '1',
        'C': '2', 'G': '2', 'J': '2', 'K': '2',
        'Q': '2', 'S': '2', 'X': '2', 'Z': '2',
        'D': '3', 'T': '3',
        'L': '4',
        'M': '5', 'N': '5',
        'R': '6',
    };
    const VOWELS_RESET = new Set(['A', 'E', 'I', 'O', 'U', 'Y', 'H', 'W']);

    function soundex(word) {
        /**Standard American Soundex — matching Python implementation. */
        if (!word) return "";
        const w = String(word).toUpperCase();
        const first_char = w[0];
        const digits = [];
        let prev_code = null;

        for (let i = 1; i < w.length; i++) {
            const ch = w[i];
            const current = SOUNDEX_MAP[ch];
            if (current !== undefined) {
                if (current !== prev_code) {
                    digits.push(current);
                }
                prev_code = current;
            } else if (VOWELS_RESET.has(ch)) {
                prev_code = null;
            }
        }

        const sdx = first_char + digits.join("");
        return sdx.padEnd(4, "0").slice(0, 4);
    }

    // Metaphone implementation (kept for backward compatibility, updated to match Python's rules)
    const METAPHONE_RULES = [
        [/^kn/, "n"],
        [/^gn/, "n"],
        [/^pn/, "n"],
        [/^wr/, "r"],
        [/^wh/, "w"],
        [/ck$/, "k"],
        [/c[ei]$/, "s"],
        [/ph/, "f"],
        [/sh/, "x"],
        [/th/, "0"],
        [/tch/, "x"],
    ];

    class Metaphone {
        constructor() {
            this._rules = METAPHONE_RULES;
        }

        compute(word) {
            if (!word) return "0000";
            let w = String(word).toLowerCase();
            for (const [pat, repl] of this._rules) {
                w = w.replace(pat, repl);
            }
            if (!w) return "0000";
            const vowels = new Set("aeiou");
            const first = w[0];
            const rest = [];
            for (let i = 1; i < w.length; i++) {
                const c = w[i];
                if (!vowels.has(c)) {
                    rest.push(c);
                }
            }
            const code = (first + rest.join("")).toUpperCase();
            return code.padEnd(4, "0").slice(0, 4);
        }
    }

    // Legacy metaphone function maintained for backward compatibility
    function metaphone(word) {
        let w = String(word || "").toUpperCase().replace(/[^A-Z]/g, "");
        if (!w) return "";
        const out = [];
        const n = w.length;
        let i = 0;
        if (w.startsWith("KN") || w.startsWith("GN") || w.startsWith("PN") || w.startsWith("AE") || w.startsWith("WR")) i = 1;
        else if (w.startsWith("X")) { out.push("S"); i = 1; }
        else if (w.startsWith("WH")) { out.push("W"); i = 2; }
        const isVowel = (c) => c === "A" || c === "E" || c === "I" || c === "O" || c === "U";
        while (i < n) {
            const c = w[i];
            const prev = i > 0 ? w[i - 1] : "";
            const next = i + 1 < n ? w[i + 1] : "";
            const next2 = i + 2 < n ? w[i + 2] : "";
            if (c === prev && c !== "C") { i++; continue; }
            switch (c) {
                case "A": case "E": case "I": case "O": case "U":
                    if (i === 0) out.push(c); break;
                case "B":
                    if (!(i === n - 1 && prev === "M")) out.push("B"); break;
                case "C":
                    if (next === "I" || next === "E" || next === "Y") {
                        if (next === "I" && next2 === "A") out.push("X");
                        else out.push("S");
                    } else if (prev === "S" && (next === "E" || next === "I" || next === "Y")) {
                        /* silent */
                    } else if (next === "H") {
                        if (i === 0 && !isVowel(w[i + 2] || "")) out.push("K");
                        else out.push("X");
                        i++;
                    } else out.push("K");
                    break;
                case "D":
                    if (next === "G" && (next2 === "E" || next2 === "I" || next2 === "Y")) { out.push("J"); i++; }
                    else out.push("T");
                    break;
                case "F": case "J": case "L": case "M": case "N": case "R": out.push(c); break;
                case "G":
                    if (next === "H") { if (i === 0 || !isVowel(prev)) out.push("K"); i++; }
                    else if (next === "N" && (i + 2 === n || i + 2 === n - 1)) { /* silent */ }
                    else if (next === "I" || next === "E" || next === "Y") out.push("J");
                    else out.push("K");
                    break;
                case "H":
                    if (!isVowel(prev) && isVowel(next)) out.push("H"); break;
                case "K":
                    if (prev !== "C") out.push("K"); break;
                case "P":
                    if (next === "H") { out.push("F"); i++; } else out.push("P"); break;
                case "Q": out.push("K"); break;
                case "S":
                    if (next === "H") { out.push("X"); i++; }
                    else if (next === "I" && (next2 === "O" || next2 === "A")) out.push("X");
                    else out.push("S");
                    break;
                case "T":
                    if (next === "H") { out.push("0"); i++; }
                    else if (next === "I" && (next2 === "O" || next2 === "A")) out.push("X");
                    else out.push("T");
                    break;
                case "V": out.push("F"); break;
                case "W": case "Y":
                    if (isVowel(next)) out.push(c); break;
                case "X": out.push("KS"); break;
                case "Z": out.push("S"); break;
                default: break;
            }
            i++;
        }
        return out.join("");
    }

    const _metaphoneCache = new Map();
    const METAPHONE_CACHE_MAX = 4096;
    function metaphoneCached(word) {
        const lo = String(word || "").toLowerCase();
        if (!lo) return "";
        let code = _metaphoneCache.get(lo);
        if (code === undefined) {
            code = metaphone(lo);
            _metaphoneCache.set(lo, code);
            if (_metaphoneCache.size > METAPHONE_CACHE_MAX) {
                let toDrop = _metaphoneCache.size >> 2;
                for (const key of _metaphoneCache.keys()) {
                    _metaphoneCache.delete(key);
                    if (--toDrop <= 0) break;
                }
                telemetry.count("metaphone.evict");
            }
        }
        return code;
    }

    // Use shared homophone data from runtime-tables.json, fallback to loaded values
    const HOMOPHONE_WORDS = () => runtimeTables?.homophone_words || [];
    const CONTEXT = () => runtimeTables?.homophone_context || {};
    
    // Initialize phonetic maps once tables are loaded
    let _phonToWords = new Map();
    let _wordToPhon = new Map();
    
    // Async initialization to wait for runtime tables
    (async function initPhoneticMaps() {
        // Wait for tables to load (max 1s fallback)
        for (let i = 0; i < 10 && !runtimeTables; i++) await new Promise(r => setTimeout(r, 100));
        const words = HOMOPHONE_WORDS();
        const context = CONTEXT();
        _phonToWords = new Map();
        _wordToPhon = new Map();
        for (const word of words) {
            const code = metaphone(word);
            if (!code) continue;
            if (!_phonToWords.has(code)) _phonToWords.set(code, []);
            _phonToWords.get(code).push(word);
            _wordToPhon.set(word, code);
        }
    })();

    class HomophoneMatrix {
        resolve(token, prevWord, nextWord) {
            const lo = String(token || "").toLowerCase();
            if (!_wordToPhon.has(lo)) return token;
            const context = CONTEXT();
            const hints = context[lo];
            if (!hints) return token;
            if (prevWord && hints[prevWord]) { telemetry.count("homophone.fix"); return hints[prevWord]; }
            if (nextWord && hints[nextWord]) { telemetry.count("homophone.fix"); return hints[nextWord]; }
            return token;
        }
        resolveSentence(text) {
            if (!text) return text;
            const tokens = text.split(/(\s+)/);
            const out = [];
            let lastWord = null;
            for (let i = 0; i < tokens.length; i++) {
                const tok = tokens[i];
                if (/^\s*$/.test(tok)) { out.push(tok); continue; }
                let nextWord = null;
                for (let j = i + 1; j < tokens.length; j++) {
                    if (!/^\s*$/.test(tokens[j])) {
                        nextWord = tokens[j].toLowerCase().replace(/[^a-z']/g, "");
                        break;
                    }
                }
                const clean = tok.replace(/[^a-zA-Z']/g, "").toLowerCase();
                const resolved = this.resolve(clean, lastWord, nextWord);
                if (resolved !== clean) {
                    const lowerTok = tok.toLowerCase();
                    const idx = lowerTok.indexOf(clean);
                    if (idx !== -1) {
                        const orig = tok.slice(idx, idx + clean.length);
                        const replacement = /^[A-Z]/.test(orig)
                            ? resolved.charAt(0).toUpperCase() + resolved.slice(1)
                            : resolved;
                        out.push(tok.slice(0, idx) + replacement + tok.slice(idx + clean.length));
                    } else {
                        out.push(tok);
                    }
                } else {
                    out.push(tok);
                }
                lastWord = resolved;
            }
            return out.join("");
        }
        static stats() { return { words: _wordToPhon.size, codes: _phonToWords.size, cache: _metaphoneCache.size }; }
        dispose() { /* static maps are module-scoped; nothing to release */ }
    }

    class LPGN {
        constructor() {
            this._codeToWords = new Map();
            this._wordToCode = new Map();
            this._added = 0;
            this._lookupCount = 0;
        }
        addWord(word) {
            const w = String(word || "").toLowerCase().trim();
            if (!w || w.length < 2 || w.length > 32) return false;
            const code = metaphoneCached(w);
            if (!code) return false;
            let list = this._codeToWords.get(code);
            if (!list) { list = []; this._codeToWords.set(code, list); }
            if (list.length >= 16 || list.indexOf(w) !== -1) return false;
            list.push(w);
            this._wordToCode.set(w, code);
            this._added++;
            return true;
        }
        addWords(words) {
            let n = 0;
            for (const w of words) if (this.addWord(w)) n++;
            return n;
        }
        candidates(word) { return this._codeToWords.get(metaphoneCached(word)) || []; }
        normalize(phoneticInput, topK = 4) {
            const raw = String(phoneticInput || "").trim().toLowerCase();
            if (!raw) return [];
            const code = metaphoneCached(raw);
            const direct = this._codeToWords.get(code);
            const out = [];
            if (direct) for (let i = 0; i < direct.length && out.length < topK; i++) out.push(direct[i]);
            if (out.length < topK) {
                const scored = [];
                const words = HOMOPHONE_WORDS();
                for (const w of words) {
                    if (out.indexOf(w) !== -1) continue;
                    const d = NS.levenshtein(code, metaphone(w), 2);
                    if (d <= 2) scored.push({ w, d });
                }
                scored.sort((a, b) => a.d - b.d);
                for (let i = 0; i < scored.length && out.length < topK; i++) out.push(scored[i].w);
            }
            this._lookupCount++;
            return out;
        }
        size() { return this._added; }
        stats() { return { added: this._added, lookups: this._lookupCount, codes: this._codeToWords.size }; }
        dispose() {
            this._codeToWords.clear();
            this._wordToCode.clear();
            this._added = 0;
            this._lookupCount = 0;
        }
    }

    // TrieNode and TrieLexicon implementation matching Python's
    class _TrieNode {
        constructor() {
            this.children = {};
            this.is_word = false;
            this.word = null;
        }
    }

    class TrieLexicon {
        constructor() {
            this._root = new _TrieNode();
            this.size = 0;
        }
        insert(word) {
            let node = this._root;
            for (const ch of word.toLowerCase()) {
                if (!(ch in node.children)) {
                    node.children[ch] = new _TrieNode();
                }
                node = node.children[ch];
            }
            if (!node.is_word) {
                node.is_word = true;
                node.word = word;
                this.size++;
            }
        }
        contains(word) {
            let node = this._root;
            for (const ch of word.toLowerCase()) {
                node = node.children[ch];
                if (!node) return false;
            }
            return node.is_word;
        }
    }

    // PhonemeGraphemeNormalizer matching Python's implementation
    const PHONEME_GRAPHEME_MAP = {
        "ah": "a", "eh": "e", "ih": "i", "oh": "o", "uh": "u",
        "ae": "ai", "ee": "ea", "ie": "ei", "oo": "ou",
        "ck": "c", "ks": "x", "kw": "qu", "sh": "ti", "zh": "si",
        "ksh": "ction", "shun": "tion",
    };

    class PhonemeGraphemeNormalizer {
        constructor() {
            this._map = PHONEME_GRAPHEME_MAP;
        }
        normalize(text) {
            let out = text.toLowerCase();
            for (const [phon, graph] of Object.entries(this._map)) {
                out = out.replace(phon, graph);
            }
            return out;
        }
    }

    const COMMON_WORDS = new Set([
        "receive", "their", "they're", "there", "your", "you're",
        "its", "it's", "too", "to", "two",
    ]);

    class PhoneticCorrector {
        constructor(common_words = null, common_bias = 0.5) {
            this._trie = new TrieLexicon();
            this._sdx = {}; // soundex code to set of words
            this._mtn = {}; // metaphone code to set of words
            this._meta = new Metaphone();
            this._lpg = new PhonemeGraphemeNormalizer();
            this._common_words = common_words || COMMON_WORDS;
            this._common_bias = common_bias;
            this._accepts = 0;
            this._rejects = 0;
        }
        load(words) {
            for (const w of words) {
                this._trie.insert(w);
                const sdx = soundex(w);
                if (!this._sdx[sdx]) this._sdx[sdx] = new Set();
                this._sdx[sdx].add(w);
                const mtn = this._meta.compute(w);
                if (!this._mtn[mtn]) this._mtn[mtn] = new Set();
                this._mtn[mtn].add(w);
            }
        }
        correct(word) {
            // LPGN normalization short-circuit (matches Python)
            const norm = this._lpg.normalize(word);
            if (norm !== word && this._trie.contains(norm)) {
                this._accepts++;
                return { corrected: norm, score: 1.0 };
            }

            // Get phonetic codes for input word
            const word_sdx = soundex(word);
            const word_mtn = this._meta.compute(word);
            
            // Gather candidates from both indices (matches Python's ensemble approach)
            const candidates = new Set();
            if (this._sdx[word_sdx]) {
                for (const w of this._sdx[word_sdx]) candidates.add(w);
            }
            if (this._mtn[word_mtn]) {
                for (const w of this._mtn[word_mtn]) candidates.add(w);
            }

            // Score candidates
            let best = word;
            let bestScore = 0;
            for (const cand of candidates) {
                let score = 0;
                // Add common word bias (matches Python)
                if (this._common_words.has(cand)) {
                    score += this._common_bias;
                }
                // Exact match gets highest score
                if (cand.toLowerCase() === word.toLowerCase()) {
                    score += 1.0;
                }
                if (score > bestScore) {
                    best = cand;
                    bestScore = score;
                }
            }

            if (bestScore >= 0.5) {
                this._accepts++;
                return { corrected: best, score: bestScore };
            }
            this._rejects++;
            return { corrected: word, score: 0.5 };
        }
        stats() { return { accepts: this._accepts, rejects: this._rejects }; }
        dispose() { this._trie = null; this._sdx = null; this._mtn = null; this._meta = null; this._lpg = null; }
    }

    // Expose all unified implementations to namespace
    NS.soundex = soundex;
    NS.Metaphone = Metaphone;
    NS.TrieLexicon = TrieLexicon;
    NS.PhonemeGraphemeNormalizer = PhonemeGraphemeNormalizer;
    NS.metaphone = metaphoneCached;
    NS.HomophoneMatrix = HomophoneMatrix;
    NS.LPGN = LPGN;
    NS.PhoneticCorrector = PhoneticCorrector;
})(typeof window !== "undefined" ? window : self);