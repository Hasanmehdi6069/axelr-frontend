/*!
 * axelr-context.js — DoubleArrayTrie (#13 TFLP) · RuntimeLexicon · AcousticMap · ContextScraper (#3 ZLCI)
 *                    · VocabMaskBuilder (feeds #2 PGVC)
 * Load order: after correction, before ux. Memory: ≈48 KB DAT + 128 KB bloom + 55 KB LRU.
 * v3.2.0: real clear() · safe worker boot · O(N) persist trim.
 */
(function (global) {
    "use strict";
    const NS = global.AxelrInput;
    if (!NS || !NS.READY) { console.warn("axelr-context: core required"); return; }
    const log = typeof NS.log === "function" ? NS.log : function () {};
    const telemetry = NS.telemetry || { count() {}, error() {}, record() {} };

    class ContextTrie {
        constructor(base, check, wordId) {
            this.base = base; this.check = check; this.wordId = wordId;
            this.nodeCount = base.length;
        }
        match(text) {
            if (!text || this.nodeCount === 0) return -1;
            let node = 0;
            const { base, check, wordId } = this;
            const m = check.length;
            for (let i = 0; i < text.length; i++) {
                let code = text.charCodeAt(i);
                if (code === 32) code = 31;
                if (code < 0 || code >= 127) return -1;
                const k = base[node] + code + 1;
                if (k < 0 || k >= m || check[k] !== node) return -1;
                node = k;
            }
            return wordId[node];
        }
        size() { return this.base.filter(v => v !== -1).length; }
        static build(commands) {
            const entries = Object.entries(commands || {})
                .filter(([k]) => k && /^[\x00-\x7E]+$/.test(k))
                .map(([k, v]) => ({ phrase: k, id: v | 0 }));
            if (!entries.length) return new ContextTrie(new Int32Array([0]), new Int32Array([0]), new Int32Array([-1]));
            const root = { children: new Map(), id: -1 };
            let nodeCount = 1;
            for (const { phrase, id } of entries) {
                let node = root;
                for (let i = 0; i < phrase.length; i++) {
                    let c = phrase.charCodeAt(i);
                    if (c === 32) c = 31;
                    let child = node.children.get(c);
                    if (!child) { child = { children: new Map(), id: -1 }; node.children.set(c, child); nodeCount++; }
                    node = child;
                }
                node.id = id;
            }
            let size = nodeCount * 8 + 512;
            let baseArr = new Int32Array(size), checkArr = new Int32Array(size), wordArr = new Int32Array(size).fill(-1);
            baseArr[0] = 1;
            const queue = [{ node: root, idx: 0 }];
            const grow = () => {
                const nb = new Int32Array(size * 2); nb.set(baseArr); baseArr = nb;
                const nc = new Int32Array(size * 2); nc.set(checkArr); checkArr = nc;
                const nw = new Int32Array(size * 2).fill(-1); nw.set(wordArr); wordArr = nw;
                size *= 2;
            };
            const findBase = (childKeys) => {
                if (childKeys.length === 0) return -1;
                const maxC = Math.max(...childKeys);
                for (let b = 1; b < baseArr.length - maxC - 2; b++) {
                    let ok = true;
                    for (const c of childKeys) {
                        const k = b + c + 1;
                        if (k >= checkArr.length || checkArr[k] !== 0) { ok = false; break; }
                    }
                    if (ok) return b;
                }
                return -1;
            };
            while (queue.length) {
                const { node, idx } = queue.shift();
                const childKeys = [...node.children.keys()].sort((a, b) => a - b);
                if (childKeys.length === 0) { baseArr[idx] = 0; wordArr[idx] = node.id; continue; }
                let found = findBase(childKeys);
                while (found < 0) { grow(); found = findBase(childKeys); }
                baseArr[idx] = found; wordArr[idx] = node.id;
                for (const c of childKeys) {
                    const k = found + c + 1;
                    if (k >= checkArr.length) throw new Error("DAT bounds");
                    checkArr[k] = idx;
                    queue.push({ node: node.children.get(c), idx: k });
                }
            }
            return new ContextTrie(baseArr, checkArr, wordArr);
        }
        exportAll() {
            const out = [];
            const stack = [{ idx: 0, prefix: "" }];
            while (stack.length) {
                const { idx, prefix } = stack.pop();
                if (this.wordId[idx] >= 0) out.push(prefix);
                for (let code = 0; code < 127; code++) {
                    const k = this.base[idx] + code + 1;
                    if (k >= 0 && k < this.check.length && this.check[k] === idx) {
                        const char = code === 31 ? ' ' : String.fromCharCode(code);
                        stack.push({ idx: k, prefix: prefix + char });
                    }
                }
            }
            return out;
        }
        clear() {
            if (this.base) this.base.fill(-1);
            if (this.check) this.check.fill(-1);
            if (this.wordId) this.wordId.fill(-1);
            this.nodeCount = 0;
        }
        dispose() { this.base = null; this.check = null; this.wordId = null; this.nodeCount = 0; }
    }
    NS.ContextTrie = ContextTrie;
    NS.DoubleArrayTrie = ContextTrie;
    NS.CommandTrie = ContextTrie;

    class RuntimeLexicon {
        constructor(cap = 8192) { this.cap = cap; this.set = new Set(); }
        inject(textArray) {
            const arr = Array.isArray(textArray) ? textArray : typeof textArray === "string" ? [textArray] : [];
            let added = 0;
            for (const text of arr) {
                if (typeof text !== "string") continue;
                for (const tok of text.toLowerCase().split(/\s+/)) {
                    const clean = tok.replace(/[^a-z0-9']/g, "");
                    if (clean.length < 3) continue;
                    if (this.set.size >= this.cap) break;
                    if (!this.set.has(clean)) { this.set.add(clean); added++; }
                }
            }
            telemetry.count("lexicon.injected");
            return added;
        }
        replace(arr) { this.set.clear(); return this.inject(arr); }
        has(token) { return token ? this.set.has(String(token).toLowerCase()) : false; }
        size() { return this.set.size; }
        clear() { this.set.clear(); }
        exportAll() { return [...this.set]; }
        dispose() { this.set.clear(); }
    }
    NS.RuntimeLexicon = RuntimeLexicon;

    const ACOUSTIC_KEY = "axelr_input_acoustic_v3";
    class AcousticMap {
        constructor(cap = 4096, maxBytes = 55000) {
            this.cap = cap; this.maxBytes = maxBytes;
            this.map = NS.MemoryBoundedLRU ? new NS.MemoryBoundedLRU({ maxBytes, maxEntries: cap }) : new Map();
            this._writeTimer = null; this._disposed = false;
            this._load();
        }
        lookup(misheard) {
            const k = String(misheard || "").toLowerCase();
            if (!k) return undefined;
            return this.map.get(k);
        }
        record(misheard, corrected) {
            const k = String(misheard || "").toLowerCase().trim();
            const v = String(corrected || "").trim();
            if (!k || !v || k === v || k.length > 64 || v.length > 64) return;
            this.map.set(k, v);
            this._schedulePersist();
        }
        _schedulePersist() {
            if (this._disposed) return;
            if (this._writeTimer) clearTimeout(this._writeTimer);
            this._writeTimer = setTimeout(() => this._persist(), 2000);
        }
        _persist() {
            this._writeTimer = null;
            try {
                const obj = {};
                if (this.map instanceof Map) {
                    for (const [k, v] of this.map) obj[k] = v;
                } else {
                    for (const [k, v] of this.map._map) obj[k] = v.value;
                }
                const s = JSON.stringify(obj);
                global.localStorage.setItem(ACOUSTIC_KEY, s);
            } catch (e) { log(2, "acoustic persist:", e.message); }
        }
        _load() {
            try {
                const raw = global.localStorage.getItem(ACOUSTIC_KEY);
                if (!raw) return;
                const obj = JSON.parse(raw);
                for (const k of Object.keys(obj)) this.map.set(k, obj[k]);
            } catch (_) { this.map.clear(); }
        }
        size() { return this.map.size(); }
        dispose() {
            this._disposed = true;
            if (this._writeTimer) clearTimeout(this._writeTimer);
            this._persist();
            this.map.dispose && this.map.dispose();
        }
    }
    NS.AcousticMap = AcousticMap;

    class VocabMaskBuilder {
        constructor() { this._words = new Set(); this._max = 5000; }
        add(word) { const w = String(word || "").toLowerCase().trim(); if (w && w.length < 32 && this._words.size < this._max) this._words.add(w); }
        addAll(arr) { for (const w of arr) this.add(w); }
        build() { return [...this._words]; }
        size() { return this._words.size; }
        dispose() { this._words.clear(); }
    }
    NS.VocabMaskBuilder = VocabMaskBuilder;

    NS.DEFAULT_COMMANDS = Object.freeze({
        "new chat": 1, "clear chat": 2, "clear": 3, "export csv": 4, "export": 5,
        "settings": 6, "open settings": 7, "switch to data": 8, "switch to design": 9,
        "switch to core": 10, "summarize": 11, "enhance prompt": 12, "undo": 13, "stop": 14, "send": 15
    });

    const BLOOM_BITS = 1 << 20;
    class ContextScraper {
        constructor(root) {
            this.root = root || (typeof document !== "undefined" ? document.body : null);
            this.bloom = new Uint32Array(BLOOM_BITS >>> 5);
            this._hits = 0; this._misses = 0; this._lastRefreshMs = 0;
            this.observer = null; this.worker = null;
            this._pending = false; this._disposed = false;
            if (this.root) { this._bootObserver(); this._bootWorker(); }
        }
        health() {
            const total = this._hits + this._misses;
            return {
                hitRatio: total > 0 ? this._hits / total : 0,
                size: this.size(),
                lastRefreshMs: this._lastRefreshMs
            };
        }
        size() {
            // Count set bits in bloom filter to get approximate unique tokens
            let count = 0;
            for (let i = 0; i < this.bloom.length; i++) {
                count += this.bloom[i].toString(2).split("1").length - 1;
            }
            return count;
        }
        _bootObserver() {
            if (typeof MutationObserver === "undefined" || !this.root) return;
            let scheduled = false;
            this.observer = new MutationObserver(() => {
                if (scheduled || this._disposed) return;
                scheduled = true;
                const defer = (cb) => typeof requestIdleCallback === "function"
                    ? requestIdleCallback(cb, { timeout: 500 }) : setTimeout(cb, 200);
                defer(() => { scheduled = false; this._flush(); });
            });
            this.observer.observe(this.root, { childList: true, subtree: true, characterData: true });
        }
        _bootWorker() {
            if (typeof Worker === "undefined" || typeof Blob === "undefined") return;
            const src = `self.onmessage=function(e){if(!e.data||e.data.type!=="scrape")return;var t=e.data.text||"";var b=new Uint32Array(${BLOOM_BITS >>> 5});var re=/\\p{L}[\\p{L}\\p{N}'-]{2,}/gu;var m;while((m=re.exec(t))){var tok=m[0].toLowerCase();var h1=0x811c9dc5,h2=0x01000193;for(var i=0;i<tok.length;i++){var c=tok.charCodeAt(i);h1=((h1^c)*0x01000193)|0;h2=((h2*0x85ebca6b)^c)|0;}var i1=(h1>>>0)&${BLOOM_BITS - 1};var i2=(h2>>>0)&${BLOOM_BITS - 1};b[i1>>>5]|=1<<(i1&31);b[i2>>>5]|=1<<(i2&31);}self.postMessage({type:"bloom",bits:b},[b.buffer]);};`;
            try {
                const blob = new Blob([src], { type: "application/javascript" });
                const url = URL.createObjectURL(blob);
                this.worker = new Worker(url);
                let revoked = false;
                const revoke = () => { if (revoked) return; revoked = true; try { URL.revokeObjectURL(url); } catch (_) {} };
                this.worker.onmessage = (e) => {
                    revoke();
                    if (e.data && e.data.type === "bloom") { 
                        this.bloom.set(e.data.bits); 
                        this._lastRefreshMs = performance.now();
                        this._pending = false; 
                    }
                };
                this.worker.onerror = () => { revoke(); this.worker = null; };
                setTimeout(revoke, 10000);   // safety net
            } catch (_) { this.worker = null; }
        }
        _flush() {
            if (this._disposed || this._pending || !this.worker || !this.root) return;
            this._pending = true;
            try { this.worker.postMessage({ type: "scrape", text: (this.root.innerText || "").slice(0, 32768) }); }
            catch (_) { this._pending = false; }
        }
        known(token) {
            if (!token) return false;
            const lo = token.toLowerCase();
            let h1 = 0x811c9dc5, h2 = 0x01000193;
            for (let i = 0; i < lo.length; i++) {
                const c = lo.charCodeAt(i);
                h1 = ((h1 ^ c) * 0x01000193) | 0;
                h2 = ((h2 * 0x85ebca6b) ^ c) | 0;
            }
            const i1 = (h1 >>> 0) & (BLOOM_BITS - 1);
            const i2 = (h2 >>> 0) & (BLOOM_BITS - 1);
            const found = (this.bloom[i1 >>> 5] & (1 << (i1 & 31))) !== 0
                && (this.bloom[i2 >>> 5] & (1 << (i2 & 31))) !== 0;
            if (found) this._hits++;
            else this._misses++;
            return found;
        }
        dispose() {
            this._disposed = true;
            if (this.observer) { this.observer.disconnect(); this.observer = null; }
            if (this.worker) { this.worker.terminate(); this.worker = null; }
            this.bloom.fill(0); this.root = null;
        }
    }
    NS.ContextScraper = ContextScraper;

    log(3, "context loaded v3.2 (DAT + bloom worker + O(N) persist)");
})(typeof window !== "undefined" ? window : self);