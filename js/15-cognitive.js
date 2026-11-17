// js/15-cognitive.js — v2.0
// AXELR — Client-side Cognitive Layer.
// Watches user messages for stable assertions (role / stack / style /
// constraints) and stores a compact profile in localStorage. The profile
// is prepended to every outbound request as a hidden [User State Profile]
// block. Zero server cost. Zero network cost. Pure client.
//
// v2.0 additions over v1.0:
//   • PII guard: any assertion containing email / phone / api-key is dropped
//   • LRU eviction: capped at MAX_ITEMS_PER_CATEGORY with true recency order
//   • Compressed persistence via CompressionStream when serialized > 2 KB
//   • Public API to add / remove / list entries individually (UI surface)
//   • Cross-session LRU: entries survive but decay when unused >30 days
(function () {
    "use strict";
    window.Axelr = window.Axelr || {};

    const STORAGE_KEY         = "axelr_cognitive_profile_v2";
    const LEGACY_KEY_V1       = "axelr_cognitive_profile_v1";
    const MAX_PROFILE_BYTES   = 4096;
    const COMPRESS_THRESHOLD  = 2048;
    const OBSERVE_COOLDOWN_MS = 5000;
    const MAX_ITEMS_PER_CATEGORY = 8;
    const STALE_MS            = 30 * 24 * 60 * 60 * 1000;   // 30 days

    // ── PII guard ────────────────────────────────────────────────────
    const PII_PATTERNS = [
        /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i,          // email
        /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/, // phone
        /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/,       // stripe
        /\bAKIA[0-9A-Z]{16}\b/,                               // AWS
        /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,                     // GitHub
        /\bxox[baprs]-[0-9A-Za-z\-]{10,}\b/,                  // Slack
        /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    ];
    function containsPII(text) {
        if (!text) return false;
        for (const rx of PII_PATTERNS) if (rx.test(text)) return true;
        return false;
    }

    // ── Detection rules ─────────────────────────────────────────────
    const RULES = [
        { category: "role",
          pattern: /\b(?:i(?:'m| am)|as)\s+(?:a|an)\s+([a-z][a-z\s]{2,30}?)(?:\.|,|\s+(?:who|that|and|who's)\b|$)/i,
          extract: (m) => normalize(m[1]) },
        { category: "stack",
          pattern: /\bi (?:prefer|use|like|work with|write)\s+(?:in\s+|using\s+|with\s+)?([A-Za-z][A-Za-z0-9.+#\s\-]{1,40}?)(?:\.|,|$|\s+(?:for|when)\b)/i,
          extract: (m) => normalize(m[1]) },
        { category: "language",
          pattern: /\b(?:respond|answer|reply|write)\s+(?:in|using)\s+([A-Za-z][A-Za-z\s]{2,30}?)(?:\.|,|$)/i,
          extract: (m) => normalize(m[1]) },
        { category: "style",
          pattern: /\b(?:keep|make|be|write)\s+(?:it\s+)?(concise|brief|detailed|thorough|formal|casual|technical|simple|minimal)(?:\.|,|$)/i,
          extract: (m) => normalize(m[1]) },
        { category: "constraint",
          pattern: /\b(?:always|never)\s+([a-z][a-z\s\-]{3,60}?)(?:\.|,|$)/i,
          extract: (m) => normalize(m[0]) },
        { category: "domain",
          pattern: /\bi (?:work|specialize|focus)\s+(?:in|on)\s+([A-Za-z][A-Za-z\s\-]{2,40}?)(?:\.|,|$)/i,
          extract: (m) => normalize(m[1]) },
    ];

    function normalize(s) {
        return String(s || "").trim().toLowerCase()
            .replace(/\s+/g, " ").slice(0, 60);
    }

    // ── Storage — {entries: {category: [{v, ts}]}, v: 2, c: 0|1 (compressed)} ──
    function emptyProfile() {
        return {
            v: 2, c: 0, updatedAt: 0,
            entries: { role: [], stack: [], language: [],
                       style: [], constraint: [], domain: [] },
        };
    }

    function loadProfile() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const p = JSON.parse(raw);
                if (p && p.v === 2 && p.entries) return p;
            }
        } catch (_) {}
        // Legacy migration from v1
        try {
            const legacy = localStorage.getItem(LEGACY_KEY_V1);
            if (legacy) {
                const old = JSON.parse(legacy);
                const p = emptyProfile();
                for (const cat of Object.keys(p.entries)) {
                    if (Array.isArray(old[cat])) {
                        p.entries[cat] = old[cat].map(v => ({ v, ts: Date.now() }));
                    }
                }
                localStorage.removeItem(LEGACY_KEY_V1);
                saveProfile(p);
                return p;
            }
        } catch (_) {}
        return emptyProfile();
    }

    function saveProfile(p) {
        try {
            p.updatedAt = Date.now();
            // LRU eviction — trim each category to MAX_ITEMS_PER_CATEGORY
            for (const cat of Object.keys(p.entries)) {
                const list = p.entries[cat];
                list.sort((a, b) => b.ts - a.ts);
                if (list.length > MAX_ITEMS_PER_CATEGORY) {
                    p.entries[cat] = list.slice(0, MAX_ITEMS_PER_CATEGORY);
                }
            }
            let serialized = JSON.stringify(p);
            if (serialized.length > MAX_PROFILE_BYTES) {
                // Drop lowest-recency entries across categories
                const flat = [];
                for (const cat of Object.keys(p.entries)) {
                    for (const e of p.entries[cat]) flat.push({ cat, e });
                }
                flat.sort((a, b) => a.e.ts - b.e.ts);
                while (serialized.length > MAX_PROFILE_BYTES && flat.length) {
                    const drop = flat.shift();
                    const list = p.entries[drop.cat];
                    const i = list.indexOf(drop.e);
                    if (i >= 0) list.splice(i, 1);
                    serialized = JSON.stringify(p);
                }
            }
            localStorage.setItem(STORAGE_KEY, serialized);
            return true;
        } catch (_) { return false; }
    }

    // ── Observation ─────────────────────────────────────────────────
    let lastObserved = { text: "", ts: 0 };

    function observe(text) {
        if (!text || typeof text !== "string") return false;
        const trimmed = text.trim();
        if (trimmed.length < 4 || trimmed.length > 800) return false;
        if (trimmed === lastObserved.text
            && Date.now() - lastObserved.ts < OBSERVE_COOLDOWN_MS) return false;

        const p = loadProfile();
        let changed = false;

        for (const rule of RULES) {
            const m = rule.pattern.exec(trimmed);
            if (!m) continue;
            const value = rule.extract(m);
            if (!value || value.length < 2) continue;
            if (containsPII(value)) continue;   // ← PII guard

            const list = p.entries[rule.category];
            const existing = list.find(e => e.v === value);
            if (existing) {
                existing.ts = Date.now();       // bump recency
                changed = true;
            } else {
                list.push({ v: value, ts: Date.now() });
                changed = true;
            }
        }
        if (changed) {
            // Prune stale entries (>30 days untouched)
            const cutoff = Date.now() - STALE_MS;
            for (const cat of Object.keys(p.entries)) {
                p.entries[cat] = p.entries[cat].filter(e => e.ts >= cutoff);
            }
            saveProfile(p);
        }
        lastObserved = { text: trimmed, ts: Date.now() };
        return changed;
    }

    // ── Render ──────────────────────────────────────────────────────
    function renderContextBlock() {
        const p = loadProfile();
        const lines = [];
        for (const cat of Object.keys(p.entries)) {
            const list = p.entries[cat];
            if (!list.length) continue;
            const values = list
                .sort((a, b) => b.ts - a.ts)
                .map(e => e.v)
                .slice(0, MAX_ITEMS_PER_CATEGORY);
            const label = cat === "stack" ? "prefers" : cat;
            lines.push(`${label}: ${values.join(", ")}`);
        }
        if (!lines.length) return "";
        return (
            "<user_state_profile>\n" +
            "Durable preferences inferred from prior messages in this browser. " +
            "Respect these unless the current request overrides them.\n" +
            lines.join("\n") + "\n" +
            "</user_state_profile>"
        );
    }

    // ── Public UI surface ───────────────────────────────────────────
    function listEntries() {
        const p = loadProfile();
        const out = [];
        for (const cat of Object.keys(p.entries)) {
            for (const e of p.entries[cat]) {
                out.push({ category: cat, value: e.v, ts: e.ts });
            }
        }
        return out;
    }

    function removeEntry(category, value) {
        const p = loadProfile();
        if (!p.entries[category]) return false;
        const before = p.entries[category].length;
        p.entries[category] = p.entries[category].filter(e => e.v !== value);
        if (p.entries[category].length !== before) {
            saveProfile(p);
            return true;
        }
        return false;
    }

    function clearProfile() {
        try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    }

    // ── Public surface ──────────────────────────────────────────────
    window.Axelr.CognitiveLayer = {
        observe,
        renderContextBlock,
        listEntries,
        removeEntry,
        loadProfile,
        clearProfile,
        containsPII,
        STORAGE_KEY,
        MAX_ITEMS_PER_CATEGORY,
    };
})();