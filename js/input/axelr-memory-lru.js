/*! axelr-memory-lru.js — byte-bounded hybrid LFU+LRU */
(function (global) {
    "use strict";
    const NS = global.AxelrInput;
    if (!NS || !NS.READY) { console.warn("memory-lru: core required"); return; }

    class MemoryBoundedLRU {
        constructor(opts = {}) {
            this.maxBytes = opts.maxBytes || 65536;
            this.maxEntries = opts.maxEntries || 8192;
            this._map = new Map();
            this._bytes = 0;
            this._hits = 0;
            this._misses = 0;
            this._evictions = 0;
        }

        _entrySize(k, v) {
            const ks = String(k).length * 2;
            const vs = typeof v === "string" ? v.length * 2 : 32;
            return ks + vs + 24;
        }

        set(key, value) {
            const k = String(key);
            const existing = this._map.get(k);
            const size = this._entrySize(k, value);
            if (existing) {
                this._bytes -= existing.size;
                this._map.delete(k);
            }
            this._map.set(k, { value, size, hits: 0, ts: performance.now() });
            this._bytes += size;
            this._evictIfNeeded();
            return this;
        }

        get(key) {
            const k = String(key);
            const e = this._map.get(k);
            if (!e) { this._misses++; return undefined; }
            e.hits++;
            e.ts = performance.now();
            this._hits++;
            this._map.delete(k); this._map.set(k, e);
            return e.value;
        }

        has(key) { return this._map.has(String(key)); }
        delete(key) {
            const k = String(key);
            const e = this._map.get(k);
            if (e) { this._bytes -= e.size; this._map.delete(k); }
            return !!e;
        }

        _evictIfNeeded() {
            while ((this._bytes > this.maxBytes || this._map.size > this.maxEntries) && this._map.size > 0) {
                let worstKey = null, worstScore = Infinity;
                const now = performance.now();
                for (const [k, e] of this._map) {
                    const age = Math.max(1, now - e.ts);
                    const score = e.hits / Math.sqrt(age / 1000 + 1);
                    if (score < worstScore) { worstScore = score; worstKey = k; if (score === 0) break; }
                }
                if (worstKey === null) break;
                const e = this._map.get(worstKey);
                this._bytes -= e.size;
                this._map.delete(worstKey);
                this._evictions++;
            }
        }

        size() { return this._map.size; }
        bytes() { return this._bytes; }
        clear() { this._map.clear(); this._bytes = 0; }
        stats() {
            const total = this._hits + this._misses;
            return {
                entries: this._map.size, bytes: this._bytes,
                hitRate: total ? this._hits / total : 0,
                hits: this._hits, misses: this._misses, evictions: this._evictions,
            };
        }
        dispose() { this._map.clear(); this._bytes = 0; }
    }

    NS.MemoryBoundedLRU = MemoryBoundedLRU;
    NS.log(3, "memory-lru loaded (byte-bounded LFU+LRU)");
})(typeof window !== "undefined" ? window : globalThis);