// js/35-thinking.js — Axelr Reasoning Emulation Engine v5.5 "MAXIMA" (final)
//
// Client-side reasoning-state visualization. Zero dependencies. ~13KB gzip.
// No network calls, no server memory, no tracking, no layout-thrashing reads.
//
// Public API — window.Axelr.AxelrReasoning:
//   begin(hostEl, prompt, workspaceHint?, opts?)  → controller
//     opts: { signal?: AbortSignal, reducedMotion?: boolean }
//   configure(partial)                            → merged config object
//   stats() / resetStats()                        → runtime metrics
//   snapshot(prompt, hint) / replay(snap)         → deterministic QA
//   selfTest()                                    → { passed, failed, details }
//
// Architecture in three words: braid, ring, frame.
//   braid — cross-domain weighted interleave (core / data / design)
//   ring  — bounded session memory for continuity, burst, and convergence
//   frame — one rAF loop drives all visual state; no DOM reads during animation
//
// All randomness is seeded per-prompt via FNV-1a + mulberry32. Deterministic
// given (prompt, session nonce, ring snapshot).
(function () {
    "use strict";
    window.Axelr = window.Axelr || {};

    // ═══════════════════════════════════════════════════════════════════
    // 0 · CONFIG
    // ═══════════════════════════════════════════════════════════════════
    var CFG = {
        intertwineThreshold: 0.24,   // braid activation floor on diffused weight
        braidMu:             0.35,   // braid diffusion strength
        coherenceRate:       0.30,   // β prefix probability
        selfEditRate:        0.08,   // λ tier-3 (word swap)
        microTypoRate:       0.07,   // λ tier-2 (qwerty slip)
        deepEditRate:        0.06,   // λ tier-1 (backtrack within line)
        driftRate:           0.25,   // χ register drift
        falseStartRate:      0.15,   // τ phantom first line
        backtrackRate:       0.45,   // ζ deep-nesting re-entry
        burstWindowMs:       8000,   // ρ repeat-prompt suppression window
        convergenceThreshold: 3,     // ψ repeats before forcing identical trace
        ringMax:             32,
        hamContinuity:       3,
        ringLookback:        3,
        noveltyWindow:       3,
        storageFlushMs:      500
    };

    function configure(partial) {
        if (!partial || typeof partial !== "object") return CFG;
        for (var k in partial) {
            if (!Object.prototype.hasOwnProperty.call(partial, k)) continue;
            if (!Object.prototype.hasOwnProperty.call(CFG, k)) continue;
            var v = partial[k];
            if (typeof CFG[k] === "number" && typeof v === "number" && isFinite(v)) {
                CFG[k] = v;
            }
        }
        return CFG;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 1 · PACKED LEXICON  (flat, \u0001-delimited · one native indexOf lookup)
    // ═══════════════════════════════════════════════════════════════════
    var D1 = "\u0001";
    var REG_G = 0, REG_D = 1, REG_I = 2;
    var REGCODE = { g: 0, d: 1, i: 2 };

    var CORE_STRONG = "loop iteration recursion branch switch predicate guard sentinel transition async await promise future coroutine generator callback continuation reactor proactor channel signal handshake synchronisation synchronization exception try catch finally recover panic retry backoff fallback deadletter supervisor crash restart idempotent tcp udp http https websocket grpc rest graphql rpc sse keepalive tls ssl auth jwt oauth oidc session csrf cors ratelimit throttle thread worker threadpool executor scheduler task mutex semaphore atomic lockfree lock contention deadlock starvation backpressure queue buffer latency throughput jitter p99 sla slo";
    var CORE_MED    = "code function class module package library framework system engine service client deploy cli shell env config flag binding interface adapter hook listener emit dispatch handler route proxy gateway middleware cache allocator profiler benchmark";
    var DATA_STRONG = "cardinality matrix crossjoin product cartesian fanout fanin aggregate aggregation btree hashindex gin gist inverted trie index indexing partition shard sharding replica schema dtype signature constraint foreign primary unique nullable coerce validator conformance avro protobuf openapi jsonschema normalize normalise denormalize dedupe canonicalize sort groupby fold reduce map flatmap window pivot unpivot melt cast reshape payload envelope mapping mapper transform etl elt ingest extraction extract parse csv tsv xlsx excel spreadsheet parquet orc json jsonl ndjson yaml xml docx pdf ocr invoice receipt ledger statement transaction sql query select join cte subquery plan explain redis memcache lru ttl eviction snapshot checkpoint vector embedding cosine dotproduct knn dataset tensor";
    var DATA_MED    = "data file record field value number date count total report analysis chart graph plot statistics average median percent ratio trend growth segment batch sync delta diff merge upsert metric kpi histogram distribution correlation regression forecast anomaly outlier quantile percentile";
    var DESIGN_STRONG = "hover active focus focus-visible visited disabled loading pending success error ripple shimmer skeleton pulse bounce spring easing keyframe transition animation gesture swipe drag token cssvar variable theme palette typography spacing radius shadow elevation zindex scale opacity blend filter backdrop emotion stitches linaria stylex tamagui layout reflow repaint grid flex float position stack inline block viewport breakpoint media container gap align justify order placement aspect ratio responsive fluid intrinsic clamp minmax react vue svelte angular nextjs nuxt astro solid remix qwik preact tailwind bootstrap chakra mantine component navbar sidebar modal drawer tooltip dropdown accordion carousel table form input button badge avatar chip card hero footer";
    var DESIGN_MED    = "design ui ux style build create page app screen view render props state hook router wireframe mockup figma sketch prototype landing dashboard css scss sass less postcss html";

    var MULTI_CORE   = "|state machine|event loop|circuit breaker|dead letter|";
    var MULTI_DATA   = "|primary key|foreign key|query plan|data lake|";
    var MULTI_DESIGN = "|design token|css var|container query|aspect ratio|css in js|styled components|vanilla extract|";

    function index(flat) {
        return D1 + flat.split(/\s+/).join(D1) + D1;
    }
    var STRONG = [index(CORE_STRONG), index(DATA_STRONG), index(DESIGN_STRONG)];
    var MEDIUM = [index(CORE_MED), index(DATA_MED), index(DESIGN_MED)];
    var MULTI  = [MULTI_CORE, MULTI_DATA, MULTI_DESIGN];
    var MULTI_ALL = MULTI_CORE + MULTI_DATA + MULTI_DESIGN;

    var ALLKEY = (function () {
        var parts = [CORE_STRONG, DATA_STRONG, DESIGN_STRONG,
                     CORE_MED, DATA_MED, DESIGN_MED];
        return D1 + parts.join(" ").split(/\s+/).join(D1) + D1;
    })();

    var TECH = (function () {
        var s = new Set();
        var src = [CORE_STRONG, DATA_STRONG, DESIGN_STRONG,
                   CORE_MED, DATA_MED, DESIGN_MED];
        for (var i = 0; i < src.length; i++) {
            var toks = src[i].split(" ");
            for (var j = 0; j < toks.length; j++) if (toks[j]) s.add(toks[j]);
        }
        return s;
    })();

    // ═══════════════════════════════════════════════════════════════════
    // 2 · ACTION POOLS  (flat templates + register bitmasks)
    // ═══════════════════════════════════════════════════════════════════
    //  Register layout is identical across all three domains: 14 g · 3 d · 3 i
    var REG_LAYOUT = "ggggggggggggggdddiii";

    var ACT_CORE = [
        "Allocating thread-pool slot for {n}",
        "Warming async handshake path for {n}",
        "Binding error-handler scope to {n}",
        "Enumerating fallback providers for {n}",
        "Resolving protocol barrier on {n}",
        "Inspecting contention limits on {n}",
        "Drafting deterministic retry plan for {n}",
        "Locking output schema for {n}",
        "Synchronising with primary inference node",
        "Verifying backpressure thresholds",
        "Registering supervisor scope for {n}",
        "Streaming finalised tokens",
        "Reconciling thread-limit budget",
        "Seeding request-scoped context",
        "Handshake established on {n} channel",
        "Retry budget converged for {n}",
        "Supervisor tree stabilised",
        "Verify async boundary on {n}",
        "Confirm provider fallback chain",
        "Re-check contention envelope"
    ];
    var ACT_DATA = [
        "Parsing cardinality matrix for {n}",
        "Traversing index tree of {n}",
        "Validating schema envelope for {n}",
        "Normalising collection of {n}",
        "Mapping payload fields for {n}",
        "Detecting delimiter signature",
        "Resolving null clusters and outliers",
        "Aligning dtype signatures",
        "Reconciling aggregate drift in {n}",
        "Emitting structured JSON envelope",
        "Finalising extraction schema",
        "Rebalancing partition skew across shards",
        "Compiling query-plan for {n}",
        "Warming row cache for {n}",
        "Cardinality matrix converged on {n}",
        "Index traversal complete for {n}",
        "Schema envelope validated",
        "Verify aggregate integrity on {n}",
        "Confirm delimiter signature",
        "Re-check outlier distribution"
    ];
    var ACT_DESIGN = [
        "Priming micro-interaction states for {n}",
        "Resolving token boundaries in {n}",
        "Binding CSS-in-JS variables for {n}",
        "Computing layout reflow boundaries",
        "Calibrating aspect-ratio constraints on {n}",
        "Stabilising flex and grid containers",
        "Sequencing entrance transitions for {n}",
        "Diffing render tree for regressions",
        "Composing accessibility aria-labels",
        "Purging unused design tokens",
        "Verifying visual hierarchy",
        "Resolving theme-token drift",
        "Allocating palette slots for {n}",
        "Baking production bundle for {n}",
        "Layout reflow bounded for {n}",
        "Token boundaries resolved",
        "Render tree diff clean",
        "Verify responsive breakpoints on {n}",
        "Confirm aspect-ratio guardrails",
        "Re-check theme-token parity"
    ];

    function packPool(templates, layout) {
        var n = templates.length;
        var reg = new Uint8Array(n);
        var mask = new Uint32Array(3);
        for (var i = 0; i < n; i++) {
            var r = REGCODE[layout.charAt(i)];
            if (r === undefined) r = REG_G;
            reg[i] = r;
            mask[r] |= (1 << i);
        }
        return { t: templates, reg: reg, mask: mask, n: n };
    }

    var POOLS = [
        packPool(ACT_CORE, REG_LAYOUT),
        packPool(ACT_DATA, REG_LAYOUT),
        packPool(ACT_DESIGN, REG_LAYOUT)
    ];

    // ═══════════════════════════════════════════════════════════════════
    // 3 · BRAID GRAPH  (ω — cross-domain stochastic diffusion)
    // ═══════════════════════════════════════════════════════════════════
    var BRAID = [
        [1.00, 0.62, 0.55],
        [0.62, 1.00, 0.44],
        [0.55, 0.44, 1.00]
    ];

    function diffuse(w) {
        var mu = CFG.braidMu;
        var o0 = (1 - mu) * w[0] + mu * (w[0] * BRAID[0][0] + w[1] * BRAID[1][0] + w[2] * BRAID[2][0]);
        var o1 = (1 - mu) * w[1] + mu * (w[0] * BRAID[0][1] + w[1] * BRAID[1][1] + w[2] * BRAID[2][1]);
        var o2 = (1 - mu) * w[2] + mu * (w[0] * BRAID[0][2] + w[1] * BRAID[1][2] + w[2] * BRAID[2][2]);
        var t = o0 + o1 + o2;
        if (t <= 0) return [1, 0, 0];
        return [o0 / t, o1 / t, o2 / t];
    }

    // ═══════════════════════════════════════════════════════════════════
    // 4 · CORRECTION POOLS
    // ═══════════════════════════════════════════════════════════════════
    var CORRECTIONS = [
        "Execution block collision on {n} — shifting path to fallback buffer",
        "Volatile state divergence detected near {n}; replaying from checkpoint",
        "Rollback: earlier assumption on {n} invalidated by downstream signal",
        "Cache coherence failed for {n} — invalidating intermediate state",
        "Edge case surfaced for {n}; re-routing through conservative branch",
        "Boundary violation on {n}; widening tolerance envelope",
        "Prior step on {n} could drift from intent — re-verifying chain",
        "Ambiguity in {n} detected; falling back to strict interpretation",
        "Unlike the first pass, {n} needs a narrower scope — re-framing",
        "Whereas the earlier path treated {n} as stable, evidence suggests otherwise",
        "In contrast to the initial read, {n} requires tighter validation"
    ];

    var BACKTRACKS = [
        "Backtracking to earlier branch on {n}; prior assumption superseded",
        "Re-opening the discarded path through {n} — new evidence in scope",
        "Rewinding to the {n} node; downstream constraint invalidated it",
        "Re-entering dormant branch on {n} with widened evidence set"
    ];

    var ZONE_B_LINES = [
        "Deepening verification on {n}; cross-checking against second source",
        "Traversing alternative hypotheses in parallel; {n} still dominant",
        "Re-running internal consistency pass over {n}",
        "Sampling counter-evidence for {n}; weighting by confidence prior",
        "Reconstructing partial chain from {n} context",
        "Tracing dependency edges adjacent to {n}",
        "Holding intermediate findings for {n}; awaiting confirmation stream",
        "Confirming intent alignment across {n} sub-goals"
    ];
    var ZONE_C_LINES = [
        "Primary inference node congested — routing through secondary provider",
        "Elevated latency detected — falling back to standby cluster",
        "Backend queue saturated — engaging redundancy lane"
    ];
    var MAINTENANCE_POOLS = [
        ["Monitoring socket pipeline integrity",
         "Verifying backend heartbeat cadence",
         "Polling for first token arrival"],
        ["Continuing to maintain token compression state",
         "Sustaining streaming buffer across edge context",
         "Synchronising request signature with primary node"],
        ["Lane warm.", "Buffer stable.", "Heartbeat nominal."]
    ];
    var STATUS_VERBS = [
        "Synthesizing", "Analyzing", "Reconciling data matrices",
        "Tracing dependencies", "Allocating buffers", "Confirming schema",
        "Sampling evidence", "Stabilising state"
    ];

    // ═══════════════════════════════════════════════════════════════════
    // 5 · SESSION PERSISTENCE  (in-memory cache + debounced flush)
    // ═══════════════════════════════════════════════════════════════════
    var SESSION_RING_KEY  = "axelr_reasoning_ring_v55";
    var SESSION_NONCE_KEY = "axelr_reasoning_nonce_v55";
    var GOLDEN = 0x9E3779B9;

    var _nonce = null;
    var _ring = null;
    var _ringFlushTimer = null;

    function getNonce() {
        if (_nonce !== null) return _nonce;
        try {
            var n = parseInt(sessionStorage.getItem(SESSION_NONCE_KEY) || "0", 10);
            if (!n) {
                n = (Math.random() * 0xFFFFFFFF) >>> 0;
                sessionStorage.setItem(SESSION_NONCE_KEY, String(n));
            }
            _nonce = n >>> 0;
        } catch (_) { _nonce = 0xDEADBEEF; }
        return _nonce;
    }

    function getRing() {
        if (_ring !== null) return _ring;
        try {
            var raw = sessionStorage.getItem(SESSION_RING_KEY);
            var parsed = raw ? JSON.parse(raw) : [];
            _ring = Array.isArray(parsed) ? parsed : [];
        } catch (_) { _ring = []; }
        return _ring;
    }

    function pushRing(entry) {
        var r = getRing().slice();
        r.push(entry);
        if (r.length > CFG.ringMax) r = r.slice(-CFG.ringMax);
        _ring = r;
        if (_ringFlushTimer) clearTimeout(_ringFlushTimer);
        _ringFlushTimer = setTimeout(flushRing, CFG.storageFlushMs);
    }

    function flushRing() {
        _ringFlushTimer = null;
        if (!_ring) return;
        try { sessionStorage.setItem(SESSION_RING_KEY, JSON.stringify(_ring)); }
        catch (_) {}
    }

    function findNearestSimhash(sh, ring) {
        var best = null, bestDist = 33;
        for (var i = 0; i < ring.length; i++) {
            var e = ring[i];
            if (typeof e.s !== "number") continue;
            var d = hamming32(sh, e.s);
            if (d < bestDist) { bestDist = d; best = e; }
        }
        return { entry: best, distance: bestDist };
    }
    function recentNounSet(ring) {
        var s = new Set();
        for (var i = Math.max(0, ring.length - CFG.noveltyWindow); i < ring.length; i++) {
            var ns = ring[i].ns;
            if (Array.isArray(ns)) for (var j = 0; j < ns.length; j++) s.add(ns[j].toLowerCase());
        }
        return s;
    }
    function oldestRingEntry(ring) {
        for (var i = 0; i < ring.length; i++) {
            var e = ring[i];
            if (e && Array.isArray(e.ns) && e.ns.length) return e;
        }
        return null;
    }
    function recentBurst(ring, baseSeed, nowTs) {
        var now = (typeof nowTs === "number") ? nowTs : Date.now();
        for (var i = ring.length - 1; i >= 0; i--) {
            var e = ring[i];
            if (e.h !== baseSeed) continue;
            if (typeof e.ts === "number" && (now - e.ts) < CFG.burstWindowMs) return true;
            return false;
        }
        return false;
    }
    function recurrenceCount(ring, baseSeed) {
        var n = 0;
        for (var i = 0; i < ring.length; i++) if (ring[i].h === baseSeed) n++;
        return n;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 6 · CRYPTOGRAPHIC PRIMITIVES
    // ═══════════════════════════════════════════════════════════════════
    function hashSeed(str) {
        var s = String(str || "");
        var composite = s.length + "|" +
            s.trim().split(/\s+/).filter(Boolean).length + "|" + s;
        var h = 2166136261 >>> 0;
        for (var i = 0; i < composite.length; i++) {
            h ^= composite.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        return h >>> 0;
    }
    function mulberry32(a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function simhash32(tokens) {
        var bits = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
                    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
        for (var k = 0; k < tokens.length; k++) {
            var h = hashSeed(tokens[k]);
            for (var i = 0; i < 32; i++) bits[i] += ((h >>> i) & 1) ? 1 : -1;
        }
        var r = 0;
        for (var j = 0; j < 32; j++) if (bits[j] > 0) r |= (1 << j);
        return r >>> 0;
    }
    function hamming32(a, b) {
        var x = (a ^ b) >>> 0, c = 0;
        while (x) { c += x & 1; x >>>= 1; }
        return c;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 7 · HINGLISH TRANSLITERATION
    // ═══════════════════════════════════════════════════════════════════
    var HINGLISH_MAP = Object.freeze({
        "kar": "do", "karo": "do", "karna": "do", "kardo": "do", "kardena": "do",
        "me": "in", "mein": "in",
        "iss": "this", "is": "this", "iske": "of this", "iska": "of this", "iski": "of this",
        "ka": "of", "ki": "of", "ke": "of", "aur": "and", "se": "from", "ko": "to",
        "banao": "create", "bana": "create", "banado": "create",
        "chahiye": "need", "chaiye": "need", "dikhao": "show", "dikha": "show",
        "kya": "what", "kaise": "how", "kab": "when", "kahan": "where",
        "yaha": "here", "waha": "there",
        "sab": "all", "kuch": "some", "koi": "any",
        "thoda": "a little", "bahut": "very",
        "abhi": "now", "baad": "after", "pehle": "before", "jaldi": "quickly",
        "nahi": "not", "na": "not",
        "hai": "is", "hain": "are", "tha": "was", "the": "were",
        "mera": "my", "meri": "my", "mere": "my",
        "aapka": "your", "aapki": "your", "tumhara": "your",
        "bhai": "friend", "yaar": "friend"
    });

    function transliterate(prompt) {
        var parts = String(prompt || "").split(/(\s+)/);
        var out = "";
        for (var i = 0; i < parts.length; i++) {
            var tok = parts[i];
            if (!tok || /^\s+$/.test(tok)) { out += tok; continue; }
            var stripped = tok.toLowerCase().replace(/[^a-z]/g, "");
            out += (HINGLISH_MAP[stripped] || tok);
        }
        return out;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 8 · AFFINITY SCORING
    // ═══════════════════════════════════════════════════════════════════
    function normalisePrompt(p) {
        return String(p || "").toLowerCase()
            .replace(/[^a-z0-9_+.\-\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function scoreAffinity(prompt) {
        var norm = normalisePrompt(transliterate(prompt));
        var toks = norm.length ? norm.split(" ") : [];
        var raw = [0, 0, 0];
        var hits = [0, 0, 0];
        var i, w, t;

        for (i = 0; i < toks.length; i++) {
            t = toks[i];
            if (t.length < 2) continue;
            if (ALLKEY.indexOf(D1 + t + D1) < 0) continue;
            for (w = 0; w < 3; w++) {
                if (STRONG[w].indexOf(D1 + t + D1) >= 0) { raw[w] += 3; hits[w]++; }
                else if (MEDIUM[w].indexOf(D1 + t + D1) >= 0) { raw[w] += 1; hits[w]++; }
            }
        }
        for (i = 0; i + 1 < toks.length; i++) {
            var bg = "|" + toks[i] + " " + toks[i + 1] + "|";
            if (MULTI_ALL.indexOf(bg) < 0) continue;
            for (w = 0; w < 3; w++) {
                if (MULTI[w].indexOf(bg) >= 0) { raw[w] += 3; hits[w]++; break; }
            }
        }

        var total = raw[0] + raw[1] + raw[2];
        var weights = total > 0
            ? [raw[0] / total, raw[1] / total, raw[2] / total]
            : [1, 0, 0];

        var best = 0, bestScore = -1;
        for (w = 0; w < 3; w++) if (weights[w] > bestScore) { bestScore = weights[w]; best = w; }

        return { workspace: best, weights: weights, raw: raw, hits: hits };
    }

    // ═══════════════════════════════════════════════════════════════════
    // 9 · TOKEN HARVESTING
    // ═══════════════════════════════════════════════════════════════════
    var STOP = new Set([
        "the", "and", "for", "with", "from", "that", "this", "these", "those",
        "have", "has", "had", "will", "would", "could", "should", "into", "onto",
        "about", "over", "under", "what", "when", "where", "which", "while",
        "your", "yours", "their", "they", "them", "then", "than", "also", "just",
        "only", "some", "any", "all", "each", "every", "here", "there", "please",
        "make", "made", "like", "want", "need", "using", "use", "get", "got",
        "can", "give", "show", "tell", "help", "write", "create", "build",
        "converted", "convert", "turn"
    ]);

    var OPERATOR_RE = /(?:===|!==|>>>|<<=|>>=|=>|->|::|\*\*|\?\?=|\|\|=|&&=|<<|>>|\?\?|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|==|!=|<=|>=|&&|\|\||\?\.[A-Za-z_]|[+\-*/%<>=!&|^~?])/g;
    var OPERATOR_MAP = {
        "=>": "lambda arrow binding", "->": "member pointer dereference",
        "::": "scope resolution", "**": "exponentiation op", "+=": "accumulation op",
        "-=": "decrement op", "*=": "scale op", "/=": "division op", "%=": "modulo op",
        "||": "logical OR short-circuit", "&&": "logical AND short-circuit",
        "??": "nullish coalescing", "||=": "logical OR assign",
        "&&=": "logical AND assign", "??=": "nullish coalesce assign",
        "===": "strict equality", "!==": "strict inequality",
        "==": "loose equality", "!=": "loose inequality", "<=": "less-than-or-equal",
        ">=": "greater-than-or-equal", "<<": "left bit-shift", "<<=": "left bit-shift assign",
        ">>=": "right bit-shift assign", "+": "additive op", "-": "subtractive op",
        "*": "multiplicative op", "/": "division op", "%": "modulo op",
        "<": "less-than compare", ">": "greater-than compare", "=": "assignment binding",
        "!": "logical NOT", "&": "bitwise AND", "|": "bitwise OR", "^": "bitwise XOR",
        "~": "bitwise NOT", "?": "conditional branch"
    };

    function extractNouns(prompt, workspace, rand) {
        var p = String(prompt || "");
        var normalised = transliterate(p);
        var harvested = [];
        var m, id;

        var fenceRe = /```[a-z0-9_+-]*\n?([\s\S]*?)```/gi;
        while ((m = fenceRe.exec(normalised)) !== null) {
            var idRe = /\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g;
            while ((id = idRe.exec(m[1])) !== null) {
                if (!STOP.has(id[0].toLowerCase())) harvested.push(id[0]);
            }
        }
        var inlineRe = /`([^`\n]+)`/g;
        while ((m = inlineRe.exec(normalised)) !== null) {
            var idRe2 = /\b[A-Za-z_][A-Za-z0-9_.-]{2,}\b/g;
            while ((id = idRe2.exec(m[1])) !== null) {
                if (!STOP.has(id[0].toLowerCase())) harvested.push(id[0]);
            }
        }
        var identRe = /\b(?:[A-Z][a-z]+(?:[A-Z][a-z0-9]+)+|[a-z]+(?:_[a-z0-9]+)+|[A-Z][A-Z0-9_]{2,})\b/g;
        while ((m = identRe.exec(normalised)) !== null) harvested.push(m[0]);

        var quoteRe = /["']([^"'\n]{3,40})["']/g;
        while ((m = quoteRe.exec(normalised)) !== null) {
            var qt = m[1].trim();
            if (qt && !STOP.has(qt.toLowerCase())) harvested.push(qt);
        }
        var plain = normalised.toLowerCase().replace(/[^a-z0-9_\s]/g, " ").split(/\s+/);
        for (var k = 0; k < plain.length; k++) {
            var t = plain[k];
            if (t.length < 4 || STOP.has(t)) continue;
            harvested.push(t);
        }

        var hasNouns = false;
        for (var a = 0; a < harvested.length; a++) {
            if (/[a-z0-9]/i.test(harvested[a])) { hasNouns = true; break; }
        }
        if (!hasNouns) {
            OPERATOR_RE.lastIndex = 0;
            var seenOps = new Set(), op;
            while ((op = OPERATOR_RE.exec(p)) !== null) {
                var desc = OPERATOR_MAP[op[0]];
                if (desc && !seenOps.has(desc)) {
                    seenOps.add(desc);
                    harvested.push(desc);
                    if (seenOps.size >= 3) break;
                }
            }
        }

        var seen = new Set(), ordered = [];
        for (var b = 0; b < harvested.length; b++) {
            var key = harvested[b].toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            ordered.push(harvested[b]);
        }
        if (!ordered.length) return ["your request"];

        // Exact delimited match only — no substring fallback.
        var wsStrong = STRONG[workspace];
        var domainHits = [];
        for (var c = 0; c < ordered.length; c++) {
            var lo = ordered[c].toLowerCase();
            if (wsStrong.indexOf(D1 + lo + D1) >= 0) domainHits.push(ordered[c]);
        }
        var pool = domainHits.length ? domainHits : ordered;

        var arr = pool.slice();
        for (var i2 = arr.length - 1; i2 > 0; i2--) {
            var j2 = Math.floor(rand() * (i2 + 1));
            var tmp = arr[i2]; arr[i2] = arr[j2]; arr[j2] = tmp;
        }
        var rawTokens = p.trim().split(/\s+/);
        var verbatim = null;
        for (var v = 0; v < rawTokens.length; v++) {
            var wt = rawTokens[v];
            if (wt.length >= 3 && !STOP.has(wt.toLowerCase()) && !HINGLISH_MAP[wt.toLowerCase()]) {
                verbatim = wt; break;
            }
        }
        var slice = arr.slice(0, 2);
        if (verbatim) {
            var dup = false;
            for (var s2 = 0; s2 < slice.length; s2++) if (slice[s2] === verbatim) dup = true;
            if (!dup) slice.push(verbatim);
        }
        return slice;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 10 · POOL WEAVING  (ω braid · bitmask registers · weighted live-pool pick)
    // ═══════════════════════════════════════════════════════════════════
    function shuffle(arr, rand) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(rand() * (i + 1));
            var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
    }
    function pickRegister(rand) {
        var r = rand();
        return r < 0.6 ? REG_G : r < 0.85 ? REG_D : REG_I;
    }
    function registerIndices(ws, register) {
        var m = POOLS[ws].mask[register];
        var out = [];
        for (var i = 0; i < 32; i++) if ((m >>> i) & 1) out.push(i);
        if (out.length >= 3) return out;
        var order = register === REG_G ? [REG_D, REG_I]
                  : register === REG_D ? [REG_G, REG_I]
                  : [REG_G, REG_D];
        for (var o = 0; o < order.length; o++) {
            var mm = POOLS[ws].mask[order[o]];
            for (var k = 0; k < 32; k++) if ((mm >>> k) & 1) out.push(k);
            if (out.length >= 3) break;
        }
        return out;
    }

    // [ω] Braid — weighted pick among *remaining* pools each step. No index bias.
    function braidPools(active, W, rand, register) {
        var pools = [];
        for (var i = 0; i < active.length; i++) {
            var ws = active[i];
            var w = W[ws];
            pools.push({
                ws: ws,
                w: (typeof w === "number" && w > 0) ? w : 0.001,
                idx: shuffle(registerIndices(ws, register), rand),
                cur: 0
            });
        }
        if (pools.length === 1) {
            return { idx: pools[0].idx, sources: [active[0]] };
        }
        var total = 0;
        for (var i2 = 0; i2 < pools.length; i2++) total += pools[i2].idx.length;

        var out = [];
        while (out.length < total) {
            var live = [], wsum = 0;
            for (var j = 0; j < pools.length; j++) {
                if (pools[j].cur < pools[j].idx.length) {
                    live.push(pools[j]);
                    wsum += pools[j].w;
                }
            }
            if (!live.length) break;
            if (wsum <= 0) wsum = 1;
            var r = rand() * wsum;
            var picked = live[live.length - 1];
            for (var k2 = 0; k2 < live.length; k2++) {
                r -= live[k2].w;
                if (r <= 0) { picked = live[k2]; break; }
            }
            out.push(POOLS[picked.ws].t[picked.idx[picked.cur++]]);
        }
        return { idx: out, sources: active.slice() };
    }

    // ═══════════════════════════════════════════════════════════════════
    // 11 · COMPLEXITY
    // ═══════════════════════════════════════════════════════════════════
    function complexityTier(hits, blended, prompt) {
        if (blended) return 2;
        var totalHits = hits[0] + hits[1] + hits[2];
        var p = String(prompt || "");
        var fences = (p.match(/```/g) || []).length;
        var braces = (p.match(/[{}]/g) || []).length;
        var clauses = (p.match(/[,;:—–]|\.\s/g) || []).length;
        if (fences >= 2 || braces >= 6 || clauses >= 6) return 2;
        if (totalHits >= 3 || clauses >= 3) return 1;
        return 0;
    }
    function correctionCountFor(tier) {
        return tier === 2 ? 2 : tier === 1 ? 1 : 0;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 12 · POST-PROCESSORS
    // ═══════════════════════════════════════════════════════════════════
    function firstVerb(line) {
        return (String(line).split(/[\s—]/)[0] || "").replace(/[^A-Za-z]/g, "");
    }
    function dedupeAdjacentVerbs(lines) {
        for (var i = 1; i < lines.length; i++) {
            var vi = firstVerb(lines[i]);
            if (!vi || vi !== firstVerb(lines[i - 1])) continue;
            for (var j = i + 1; j < lines.length; j++) {
                var vj = firstVerb(lines[j]);
                if (vj && vj !== vi && vj !== firstVerb(lines[i - 1])) {
                    var t = lines[i]; lines[i] = lines[j]; lines[j] = t;
                    break;
                }
            }
        }
        return lines;
    }

    function adaptiveLineCount(prompt, baseCount, tier) {
        var s = String(prompt || "");
        var len = s.length;
        var words = s.trim().split(/\s+/).filter(Boolean).length;
        var clauses = (s.match(/[,;:—–]|\.\s/g) || []).length;
        var n = baseCount;
        if (len > 400 || words > 60 || clauses >= 6) n += 2;
        else if (len > 180 || words > 25) n += 1;
        else if (len < 30 && words < 6 && tier === 0) n = Math.max(3, n - 1);
        return Math.max(3, Math.min(8, n));
    }

    function enforceAnchorPersistence(lines, subject, rand) {
        if (!subject || subject.length < 3) return lines;
        var lo = subject.toLowerCase();
        function occurrences() {
            var c = 0;
            for (var i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().indexOf(lo) >= 0) c++;
            }
            return c;
        }
        if (occurrences() >= 2) return lines;
        for (var attempt = 0; attempt < 4 && occurrences() < 2; attempt++) {
            var idx = 1 + Math.floor(rand() * Math.max(1, lines.length - 2));
            if (idx >= lines.length) idx = lines.length - 1;
            if (lines[idx].toLowerCase().indexOf(lo) >= 0) continue;
            var words = lines[idx].split(/\s+/);
            for (var j = words.length - 1; j >= 0; j--) {
                var clean = words[j].toLowerCase().replace(/[^a-z]/gi, "");
                if (words[j].length >= 4 && !STOP.has(clean)) {
                    words[j] = subject;
                    lines[idx] = words.join(" ");
                    break;
                }
            }
        }
        return lines;
    }

    var TECHNICAL_TOKEN_RE = /\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g;
    var TRANSITIONAL_HINT = /\b(however|while|although|whereas|whilst|but)\b/i;

    function pickTerminal(line, last, rand) {
        var lower = line.toLowerCase();
        var isTransitional = TRANSITIONAL_HINT.test(lower) ||
            lower.indexOf("re-entering") === 0 ||
            lower.indexOf("building on") === 0 ||
            lower.indexOf("carrying") === 0 ||
            lower.indexOf("backtracking") === 0;
        var matches = line.match(TECHNICAL_TOKEN_RE) || [];
        var technicalHits = 0;
        for (var i = 0; i < matches.length; i++) {
            if (TECH.has(matches[i].toLowerCase())) technicalHits++;
        }
        var pool;
        if (isTransitional)           pool = [" —", ",", "."];
        else if (technicalHits >= 2)  pool = [";", ":", "."];
        else if (technicalHits === 1) pool = [".", ";", ":", "."];
        else                          pool = [".", ",", " —"];
        var pick = pool[Math.floor(rand() * pool.length)];
        var guard = 0;
        while (pick === last && guard++ < 6) pick = pool[Math.floor(rand() * pool.length)];
        return pick;
    }
    function punctuateTrace(lines, rand) {
        var last = "";
        var out = [];
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (/[.!?;:—–]\s*$/.test(line)) { last = line.slice(-1); out.push(line); continue; }
            if (i === lines.length - 1) { last = "."; out.push(line + "."); continue; }
            var pick = pickTerminal(line, last, rand);
            last = pick;
            out.push(line + pick);
        }
        return out;
    }

    function applyGravityWell(lines) {
        if (lines.length < 4) return lines;
        var maxI = 0;
        for (var i = 1; i < lines.length; i++) {
            if (lines[i].length > lines[maxI].length) maxI = i;
        }
        var target = Math.min(3, lines.length - 2);
        if (maxI === target) return lines;
        var moved = lines.splice(maxI, 1)[0];
        lines.splice(target, 0, moved);
        return lines;
    }

    function driftRegister(primary, rand) {
        if (rand() > CFG.driftRate) return null;
        return primary === REG_G ? REG_D : primary === REG_D ? REG_G : REG_D;
    }
    function applyRegisterDrift(lines, primaryRegister, rand, sources, nouns) {
        var alt = driftRegister(primaryRegister, rand);
        if (alt === null || lines.length < 4 || !sources || !sources.length) return lines;
        var ws = sources[Math.floor(rand() * sources.length)];
        if (ws === undefined) ws = sources[0];
        var mask = POOLS[ws].mask[alt];
        if (!mask) return lines;
        var candidates = [];
        for (var b = 0; b < 32; b++) if ((mask >>> b) & 1) candidates.push(b);
        if (!candidates.length) return lines;

        var idx = 2 + Math.floor(rand() * Math.max(1, lines.length - 3));
        if (idx >= lines.length) idx = lines.length - 1;

        var m = /\bfor\s+([A-Za-z0-9_][A-Za-z0-9_\-.]*)/.exec(lines[idx]) ||
                /\bon\s+([A-Za-z0-9_][A-Za-z0-9_\-.]*)/.exec(lines[idx]) ||
                /\bin\s+([A-Za-z0-9_][A-Za-z0-9_\-.]*)/.exec(lines[idx]);
        var noun = (m && m[1]) || (nouns && nouns[0]) || "context";
        var tpl = POOLS[ws].t[candidates[Math.floor(rand() * candidates.length)]];
        lines[idx] = tpl.replace(/\{n\}/g, noun).replace(/[.;:,—–\s]+$/, "");
        return lines;
    }

    var COHERENCE_VARIANTS = [
        "Building on {p} — ",
        "Consistent with {p} — ",
        "Following the {p} thread — ",
        "Re-entering context around {p} — ",
        "Carrying {p} forward — "
    ];
    function coherencePrefix(priorNoun, rand) {
        var tpl = COHERENCE_VARIANTS[Math.floor(rand() * COHERENCE_VARIANTS.length)];
        return tpl.replace("{p}", priorNoun);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 13 · STEP BUILDER  (deterministic given {prompt, nonce, ring, now})
    // ═══════════════════════════════════════════════════════════════════
    function tokeniseForSimhash(prompt) {
        var s = String(prompt || "").toLowerCase().replace(/[^a-z0-9_\s]/g, " ").split(/\s+/);
        var out = [];
        for (var i = 0; i < s.length; i++) if (s[i].length >= 2) out.push(s[i]);
        return out;
    }

    function buildSteps(prompt, workspaceHint, inject) {
        var inj = inject || {};
        var writing = !inject;
        var nowTs = (typeof inj.now === "number") ? inj.now : Date.now();
        var nonce = (typeof inj.nonce === "number") ? inj.nonce : getNonce();
        var ring = inj.ring !== undefined ? inj.ring : getRing().slice();

        var p = String(prompt || "");
        var baseSeed = hashSeed(p);

        var burst = recentBurst(ring, baseSeed, nowTs);
        var speedFactor = burst ? 0.5 : 1.0;

        var recurrence = recurrenceCount(ring, baseSeed);
        var converged = recurrence >= CFG.convergenceThreshold;

        var recent = ring.slice(-CFG.ringLookback);
        var exactRepeat = false;
        for (var ri = 0; ri < recent.length; ri++) {
            if (recent[ri].h === baseSeed) { exactRepeat = true; break; }
        }

        var mutationSalt = nonce >>> 0;
        for (var i = 0; i < recent.length; i++) {
            var e = recent[i];
            if (typeof e.h === "number") mutationSalt ^= Math.imul(e.h, GOLDEN + i);
            if (typeof e.s === "number") mutationSalt ^= e.s;
        }
        mutationSalt = mutationSalt >>> 0;

        var seed = baseSeed;
        if (exactRepeat && !converged) seed = (baseSeed ^ mutationSalt) >>> 0;
        else if (recent.length && !converged) seed = (baseSeed ^ (mutationSalt & 0x0FFFFFFF)) >>> 0;

        var sh = simhash32(tokeniseForSimhash(p));
        var near = findNearestSimhash(sh, ring);
        var nearest = near.entry;
        var reuseStructure = converged ||
            (!exactRepeat && nearest && near.distance <= CFG.hamContinuity);

        var rand = mulberry32(seed);
        var aff = scoreAffinity(transliterate(p));
        var weights = aff.weights;
        var workspace = aff.workspace;
        var hits = aff.hits;
        var effectiveWs = (typeof workspaceHint === "number" && POOLS[workspaceHint])
            ? workspaceHint : workspace;

        var braidW = diffuse(weights);
        var active = [];
        for (var w = 0; w < 3; w++) {
            if (braidW[w] >= CFG.intertwineThreshold) active.push(w);
        }
        if (!active.length) active = [effectiveWs];
        var blended = active.length > 1;

        var register = pickRegister(rand);
        var recentNouns = recentNounSet(ring);
        var nouns = extractNouns(p, effectiveWs, rand);

        if (!converged) {
            for (var attempt = 0; attempt < 3 && nouns.length > 1; attempt++) {
                var anyNew = false;
                for (var ni = 0; ni < nouns.length; ni++) {
                    if (!recentNouns.has(nouns[ni].toLowerCase())) { anyNew = true; break; }
                }
                if (anyNew) break;
                var retry = extractNouns(p + " ".repeat(attempt + 1), effectiveWs, rand);
                if (retry.length) nouns = retry;
            }
        }
        var subject = nouns[0] || null;

        var braided = braidPools(active, braidW, rand, register);
        var pool = braided.idx;
        var sources = braided.sources;

        var tier = complexityTier(hits, blended, p);
        var count;
        if (reuseStructure && nearest) {
            var pr = mulberry32(nearest.h);
            pr();
            count = 3 + Math.floor(pr() * 3);
        } else {
            count = 3 + Math.floor(rand() * 3);
        }
        count = adaptiveLineCount(p, count, tier);

        function noun() { return nouns[Math.floor(rand() * nouns.length)] || "context"; }

        var chosen = [];
        for (var ci = 0; ci < count && ci < pool.length; ci++) {
            chosen.push(pool[ci].replace(/\{n\}/g, noun()));
        }

        var anchor = null;
        if (reuseStructure && nearest && typeof nearest.l === "string") {
            var priorToken = String(nearest.l).split(/\s+/).filter(Boolean).pop() || "";
            if (priorToken.length >= 3) {
                anchor = "Re-entering from prior conclusion on " + priorToken;
                if (chosen.length >= 4) chosen = chosen.slice(0, count - 1);
            }
        }

        var echo = null;
        if (!converged && ring.length >= 5) {
            var old = oldestRingEntry(ring);
            if (old && old.ns && old.ns.length) {
                var oldNoun = String(old.ns[0] || "").trim();
                if (oldNoun.length >= 4) {
                    var already = false;
                    for (var ei = 0; ei < chosen.length; ei++) {
                        if (chosen[ei].toLowerCase().indexOf(oldNoun.toLowerCase()) >= 0) {
                            already = true; break;
                        }
                    }
                    if (!already) echo = "Recalling earlier analysis around " + oldNoun;
                }
            }
        }

        if (chosen.length >= 3) {
            for (var gi = 1; gi < chosen.length - 1; gi++) {
                if (rand() < CFG.coherenceRate && nouns.length) {
                    var prior = nouns[Math.floor(rand() * nouns.length)];
                    chosen[gi] = coherencePrefix(prior, rand) + chosen[gi];
                }
            }
        }
        if (anchor) chosen.unshift(anchor);
        if (echo && !converged) chosen.splice(Math.min(2, chosen.length), 0, echo);

        dedupeAdjacentVerbs(chosen);
        enforceAnchorPersistence(chosen, subject, rand);

        var correctionCount = converged ? 1 : correctionCountFor(tier);
        var correctionTexts = [];
        var usedPositions = {};
        for (var c = 0; c < correctionCount; c++) {
            var pos = 1, attempts = 0;
            do {
                pos = 1 + Math.floor(rand() * Math.max(1, chosen.length - 1));
                attempts++;
            } while (usedPositions[pos] && attempts < 12);
            usedPositions[pos] = true;

            var target = chosen[Math.min(pos, chosen.length - 1)] || "";
            var tw = target.split(/\s+/);
            var candidates = [];
            for (var ti = 0; ti < tw.length; ti++) {
                var cl = tw[ti].toLowerCase().replace(/[^a-z]/gi, "");
                if (tw[ti].length >= 4 && !STOP.has(cl)) candidates.push(tw[ti]);
            }
            var reflexNoun = candidates.length
                ? candidates[Math.floor(rand() * candidates.length)]
                : noun();
            correctionTexts.push({
                pos: pos,
                text: CORRECTIONS[Math.floor(rand() * CORRECTIONS.length)]
                        .replace(/\{n\}/g, reflexNoun)
            });
        }
        correctionTexts.sort(function (a, b) { return b.pos - a.pos; });
        var correctionSet = new Set();
        for (var cc = 0; cc < correctionTexts.length; cc++) {
            correctionSet.add(correctionTexts[cc].text);
            chosen.splice(Math.min(correctionTexts[cc].pos, chosen.length), 0, correctionTexts[cc].text);
        }

        var backtrackText = null;
        if (!converged && tier >= 1 && rand() < CFG.backtrackRate) {
            backtrackText = BACKTRACKS[Math.floor(rand() * BACKTRACKS.length)]
                .replace(/\{n\}/g, subject || noun());
        }

        if (!converged) applyGravityWell(chosen);
        if (!converged) applyRegisterDrift(chosen, register, rand, sources, nouns);
        chosen = punctuateTrace(chosen, rand);

        if (backtrackText) {
            chosen.splice(Math.min(2, chosen.length), 0, backtrackText + ".");
        }

        var entry = {
            h: baseSeed, s: sh, n: count, r: register,
            ws: effectiveWs, c: correctionCount,
            l: chosen[chosen.length - 1] || "",
            ns: nouns.slice(0, 3),
            ts: nowTs
        };
        if (writing) pushRing(entry);

        var steps = [];
        for (var si = 0; si < chosen.length; si++) {
            var text = chosen[si];
            var phase;
            if (backtrackText && text.indexOf(backtrackText) === 0) phase = "backtrack";
            else if (correctionSet.has(text)) phase = "correct";
            else if (anchor && si === 0) phase = "anchor";
            else if (si === 0) phase = "init";
            else phase = "checkpoint";
            steps.push({ text: text, phase: phase });
        }

        return {
            workspace: effectiveWs,
            blended: blended,
            weights: weights,
            braid: braidW,
            sources: sources,
            register: register,
            seed: seed,
            simhash: sh,
            continuity: reuseStructure,
            tier: tier,
            correctionCount: correctionCount,
            burst: burst,
            converged: converged,
            speedFactor: speedFactor,
            falseStart: !burst && rand() < CFG.falseStartRate,
            steps: steps
        };
    }

    // ═══════════════════════════════════════════════════════════════════
    // 14 · FRAME SCHEDULER  (single rAF loop · no setTimeout for visuals)
    // ═══════════════════════════════════════════════════════════════════
    var raf = window.requestAnimationFrame
        ? window.requestAnimationFrame.bind(window)
        : function (fn) { return setTimeout(function () { fn(Date.now()); }, 16); };

    var nowFn = (window.performance && window.performance.now)
        ? function () { return window.performance.now(); }
        : function () { return Date.now(); };

    var Frame = (function () {
        var q = [];
        var on = false;
        function tick(ts) {
            var n = q.length;
            var w = 0;
            for (var i = 0; i < n; i++) {
                var t = q[i];
                if (t.at <= ts && !t.dead) { t.dead = true; t.fn(ts); }
                else if (!t.dead) q[w++] = t;
            }
            var extra = q.length - n;
            for (var k = 0; k < extra; k++) q[w + k] = q[n + k];
            q.length = w + extra;
            if (q.length) raf(tick);
            else on = false;
        }
        return {
            add: function (fn, delay) {
                var t = { fn: fn, at: nowFn() + (delay || 0), dead: false };
                q.push(t);
                if (!on) { on = true; raf(tick); }
                return t;
            },
            kill: function (t) { if (t) t.dead = true; },
            size: function () { return q.length; }
        };
    })();

    function wait(ms) {
        return new Promise(function (r) { Frame.add(r, ms); });
    }

    var scrollQueued = false;
    function queueScroll(el) {
        if (scrollQueued) return;
        scrollQueued = true;
        Frame.add(function () {
            scrollQueued = false;
            el.scrollTop = 1e7;
        }, 0);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 15 · CSS
    // ═══════════════════════════════════════════════════════════════════
    var CSS = [
'.axelr-chain{margin:4px 0 10px;border:1px solid rgba(0,242,254,0.16);border-radius:10px;background:rgba(0,242,254,0.03);font-family:\'JetBrains Mono\',\'SF Mono\',Menlo,Consolas,monospace;font-size:12.5px;color:var(--text-muted,#94a3b8);overflow:hidden;position:relative;transition:opacity .38s ease,max-height .38s ease}',
'.axelr-chain::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(0,242,254,0) 0%,rgba(0,242,254,0.055) 47%,rgba(0,242,254,0.09) 50%,rgba(0,242,254,0.055) 53%,rgba(0,242,254,0) 100%);background-size:100% 220%;animation:chainScan 6.5s linear infinite;mix-blend-mode:screen;opacity:.55}',
'.axelr-chain>summary{list-style:none;cursor:pointer;padding:7px 12px;display:flex;align-items:center;gap:8px;user-select:none;font-weight:600;color:var(--accent-glow,#00f2fe);background:rgba(0,242,254,0.05);font-size:12px;position:relative;z-index:1;animation:phosphorFlicker 7s ease-in-out infinite}',
'.axelr-chain>summary::-webkit-details-marker{display:none}',
'.axelr-chain .chain-caret{display:inline-block;transition:transform .2s ease;font-size:10px;opacity:.8}',
'.axelr-chain[open] .chain-caret{transform:rotate(90deg)}',
'.axelr-chain .chain-label{letter-spacing:.3px}',
'.axelr-chain .chain-angle{opacity:.5;font-weight:400;margin:0 2px}',
'.axelr-chain .chain-blend{margin-left:6px;padding:1px 6px;border-radius:4px;background:rgba(139,92,246,0.15);color:#c4b5fd;font-size:10px;font-weight:600;letter-spacing:.4px}',
'.axelr-chain .chain-status{margin-left:auto;font-size:10.5px;opacity:.7;font-weight:500;color:var(--text-muted,#94a3b8)}',
'.axelr-chain .chain-body{padding:8px 12px 10px;display:flex;flex-direction:column;gap:5px;max-height:260px;overflow-y:auto;position:relative;z-index:1}',
'.axelr-chain .chain-line{display:flex;gap:8px;line-height:1.5;opacity:0;animation:chainFadeIn .28s ease forwards}',
'.axelr-chain .chain-line .chain-glyph{flex-shrink:0;width:14px;text-align:center;color:var(--accent-glow,#00f2fe);font-weight:700}',
'.axelr-chain .chain-line[data-phase="init"] .chain-glyph{color:#22d3ee}',
'.axelr-chain .chain-line[data-phase="checkpoint"] .chain-glyph{color:#8b5cf6}',
'.axelr-chain .chain-line[data-phase="correct"] .chain-glyph{color:#f59e0b}',
'.axelr-chain .chain-line[data-phase="backtrack"] .chain-glyph{color:#f472b6}',
'.axelr-chain .chain-line[data-phase="zone-b"] .chain-glyph{color:#06b6d4}',
'.axelr-chain .chain-line[data-phase="zone-c"] .chain-glyph{color:#ef4444}',
'.axelr-chain .chain-line[data-phase="maintain"] .chain-glyph{color:#64748b}',
'.axelr-chain .chain-line[data-phase="anchor"] .chain-glyph{color:#22d3ee}',
'.axelr-chain .chain-line[data-phase="phantom"] .chain-glyph{color:#a1a1aa}',
'.axelr-chain .chain-line.done .chain-glyph{color:#10b981}',
'.axelr-chain .chain-line.done .chain-glyph::before{content:"\\2713"}',
'.axelr-chain .chain-line.done .chain-glyph>span{display:none}',
'.axelr-chain .chain-line .chain-text::after{content:"\\258D";animation:chainCursor .85s steps(2,start) infinite;opacity:.45;margin-left:1px}',
'.axelr-chain .chain-line.done .chain-text::after{content:""}',
'.axelr-chain .chain-line.phantom-fade{opacity:.4;transition:opacity .4s ease}',
'@keyframes chainFadeIn{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:translateY(0)}}',
'@keyframes chainCursor{0%,100%{opacity:.12}50%{opacity:.7}}',
'@keyframes phosphorFlicker{0%,100%{text-shadow:0 0 0 rgba(0,242,254,0)}43%,47%{text-shadow:0 0 6px rgba(0,242,254,0.55)}44%,46%{text-shadow:0 0 2px rgba(0,242,254,0.15)}74%,76%{text-shadow:0 0 4px rgba(0,242,254,0.35)}}',
'@keyframes chainScan{from{background-position:0 -110%}to{background-position:0 210%}}',
'.axelr-chain.closing{opacity:0;max-height:34px;margin-bottom:2px}',
'.axelr-chain.converged{box-shadow:0 0 24px rgba(16,185,129,0.55);transition:box-shadow .2s ease}',
'.axelr-chain .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}',
'@media (prefers-reduced-motion: reduce){',
'.axelr-chain::after{display:none}',
'.axelr-chain>summary{animation:none}',
'.axelr-chain .chain-line{animation:none;opacity:1}',
'.axelr-chain .chain-line .chain-text::after{display:none}',
'.axelr-chain,.axelr-chain.closing{transition:opacity .2s ease,max-height 0s}',
'.axelr-chain .chain-caret{transition:none}',
'}',
'.axelr-chain.reduced-motion::after{display:none}',
'.axelr-chain.reduced-motion>summary{animation:none}',
'.axelr-chain.reduced-motion .chain-line{animation:none;opacity:1}',
'.axelr-chain.reduced-motion .chain-line .chain-text::after{display:none}'
    ].join("");

    function ensureCss() {
        if (document.getElementById("axelr-chain-css")) return;
        var s = document.createElement("style");
        s.id = "axelr-chain-css";
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 16 · VELOCITY
    // ═══════════════════════════════════════════════════════════════════
    function charsetEntropy(s) {
        var seen = new Set();
        var mixed = 0;
        var len = s.length || 1;
        for (var i = 0; i < len; i++) {
            var c = s.charAt(i);
            seen.add(c.charCodeAt(0));
            if (c >= "0" && c <= "9") mixed++;
            if (c >= "A" && c <= "Z") mixed++;
        }
        return Math.min(1, (seen.size / len) * 0.6 + (mixed / len) * 1.4);
    }
    function clauseCount(s) { return (s.match(/[,;:—–]|\.\s/g) || []).length; }

    function arcFactor(idx, total, phase) {
        if (phase === "correct") return 1.35;
        if (phase === "backtrack") return 1.25;
        if (phase === "anchor") return 0.80;
        if (phase === "init") return 0.85;
        if (typeof total === "number" && total > 0 && idx >= total - 1) return 0.90;
        return 1.0;
    }
    var BASE_VELOCITY = {
        init: 12, correct: 58, backtrack: 54, anchor: 11,
        "zone-b": 52, "zone-c": 44, maintain: 68, phantom: 40, checkpoint: 26
    };
    function velocityFor(text, phase, idx, total, speedFactor) {
        var base = BASE_VELOCITY[phase] !== undefined ? BASE_VELOCITY[phase] : 26;
        var lenN = Math.min(1, text.length / 80);
        var entN = charsetEntropy(text);
        var clN = Math.min(1, clauseCount(text) / 3);
        var shape = (typeof idx === "number" && typeof total === "number")
            ? arcFactor(idx, total, phase) : 1.0;
        var factor = (1 + 0.4 * lenN + 0.3 * entN + 0.5 * clN) * shape;
        var v = base * factor * (typeof speedFactor === "number" ? speedFactor : 1);
        return Math.max(6, Math.min(75, v));
    }

    // ═══════════════════════════════════════════════════════════════════
    // 17 · QWERTY ADJACENT MAP
    // ═══════════════════════════════════════════════════════════════════
    var QWERTY_ADJ = Object.freeze({
        "a": "s", "s": "d", "d": "f", "f": "g", "g": "h", "h": "j", "j": "k", "k": "l",
        "q": "w", "w": "e", "e": "r", "r": "t", "t": "y", "y": "u", "u": "i", "i": "o", "o": "p",
        "z": "x", "x": "c", "c": "v", "v": "b", "b": "n", "n": "m"
    });

    // ═══════════════════════════════════════════════════════════════════
    // 18 · FRAME-BUFFERED TYPE-IN
    // ═══════════════════════════════════════════════════════════════════
    var WORD_RE = /\b[A-Za-z][A-Za-z-]{2,}\b/g;
    var ERASE_MS = 26;

    function typeInto(el, text, msPerChar, token) {
        return new Promise(function (resolve) {
            if (token.cancelled) return resolve();
            var len = text.length;
            if (token.reducedMotion || !len || msPerChar <= 0) {
                el.textContent = text;
                return resolve();
            }

            var pause = new Uint16Array(len + 1);
            WORD_RE.lastIndex = 0;
            var m;
            while ((m = WORD_RE.exec(text)) !== null) {
                if (TECH.has(m[1].toLowerCase())) {
                    pause[m.index] = 110 + ((m.index * 37) % 150);
                }
            }

            // Independent per-tier probability. Exactly one tier fires at most.
            var pDeep  = (len >= 26) ? CFG.deepEditRate : 0;
            var pMicro = (len >= 18) ? CFG.microTypoRate : 0;
            var pSelf  = (len >= 14) ? CFG.selfEditRate : 0;
            var pHit   = pDeep + pMicro + pSelf;
            var editKind = 0, editAt = -1, editBack = 0;
            if (pHit > 0 && Math.random() < pHit) {
                var u = Math.random() * pHit;
                if (u < pDeep) { editKind = 2; editAt = Math.floor(len * (0.42 + Math.random() * 0.30)); }
                else if (u < pDeep + pMicro) { editKind = 1; editAt = Math.floor(len * (0.30 + Math.random() * 0.45)); editBack = 2 + Math.floor(Math.random() * 3); }
                else { editKind = 3; editAt = Math.floor(len * (0.25 + Math.random() * 0.50)); }
            }
            if (editKind && (editAt < 8 || editAt > len - 8)) { editKind = 0; editAt = -1; }

            if (editKind === 1) _stats.edits.typo++;
            else if (editKind === 2) _stats.edits.deep++;
            else if (editKind === 3) _stats.edits.self++;

            var i = 0, out = "", budget = 0, last = -1, hold = 0;
            var mode = 0, backTo = 0, armed = editKind !== 0;

            function frame(ts) {
                if (token.cancelled) return resolve();
                if (last < 0) last = ts;
                var dt = ts - last;
                last = ts;
                if (dt > 100) dt = 100;
                if (dt < 0) dt = 0;
                budget += dt;
                if (budget > 400) budget = 400;

                if (ts < hold) { Frame.add(frame, Math.min(64, hold - ts)); return; }

                var dirty = false;

                if (mode === 1) {
                    var steps = Math.floor(budget / ERASE_MS);
                    if (steps < 1) steps = 1;
                    budget -= steps * ERASE_MS;
                    var avail = out.length - backTo;
                    var drop = steps < avail ? steps : avail;
                    if (drop > 0) { out = out.slice(0, out.length - drop); dirty = true; }
                    if (out.length <= backTo) { mode = 0; i = backTo; hold = ts + 150; }
                } else {
                    while (budget >= msPerChar && i < len) {
                        if (armed && i === editAt) {
                            armed = false;
                            if (editKind === 3) {
                                var prev = text.charAt(i - 1).toLowerCase();
                                var adj = QWERTY_ADJ[prev];
                                if (adj) {
                                    out += adj;
                                    dirty = true;
                                    i++;
                                    budget -= msPerChar;
                                    backTo = i - 1;
                                    mode = 1;
                                    hold = ts + 240;
                                    break;
                                }
                            } else if (editKind === 1) {
                                backTo = i - editBack;
                                if (backTo < 0) backTo = 0;
                                mode = 1; hold = ts + 120;
                                break;
                            } else if (editKind === 2) {
                                var b = i - 1;
                                var floor = i - 18 > 0 ? i - 18 : 0;
                                while (b > floor) {
                                    var cc0 = text.charCodeAt(b);
                                    if (cc0 === 44 || cc0 === 59 || cc0 === 58 ||
                                        cc0 === 46 || cc0 === 32 ||
                                        cc0 === 8212 || cc0 === 8211) { b++; break; }
                                    b--;
                                }
                                if (b <= floor) b = floor + 1;
                                backTo = b; mode = 1; hold = ts + 200;
                                break;
                            }
                        }
                        budget -= msPerChar;
                        var c = text.charAt(i++);
                        out += c;
                        dirty = true;

                        var p = pause[i];
                        if (p) { hold = ts + p; break; }
                        var code = c.charCodeAt(0);
                        if (code === 46) { hold = ts + 170; break; }
                        if (code === 44 || code === 59 || code === 58) { hold = ts + 100; break; }
                        if (code === 8212 || code === 8211) { hold = ts + 210; break; }
                    }
                }

                if (dirty) el.textContent = out;

                if (mode === 0 && i >= len) {
                    if (out !== text) el.textContent = text;
                    return resolve();
                }
                Frame.add(frame, 16);
            }

            Frame.add(frame, 0);
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    // 19 · STATS
    // ═══════════════════════════════════════════════════════════════════
    var _stats = {
        runs: 0, braid: 0, converged: 0, burst: 0, continuity: 0,
        registers: [0, 0, 0],
        corrections: 0, backtracks: 0,
        edits: { typo: 0, self: 0, deep: 0 }
    };
    function stats() {
        return {
            runs: _stats.runs,
            braid: _stats.braid,
            braidRate: _stats.runs ? _stats.braid / _stats.runs : 0,
            converged: _stats.converged,
            burst: _stats.burst,
            continuity: _stats.continuity,
            registers: _stats.registers.slice(),
            corrections: _stats.corrections,
            backtracks: _stats.backtracks,
            edits: { typo: _stats.edits.typo, self: _stats.edits.self, deep: _stats.edits.deep }
        };
    }
    function resetStats() {
        _stats.runs = 0; _stats.braid = 0; _stats.converged = 0;
        _stats.burst = 0; _stats.continuity = 0;
        _stats.registers = [0, 0, 0];
        _stats.corrections = 0; _stats.backtracks = 0;
        _stats.edits = { typo: 0, self: 0, deep: 0 };
    }

    // ═══════════════════════════════════════════════════════════════════
    // 20 · PUBLIC CONTROLLER
    // ═══════════════════════════════════════════════════════════════════
    function prefersReducedMotion() {
        try {
            return !!(window.matchMedia &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        } catch (_) { return false; }
    }

    function begin(hostEl, prompt, workspaceHint, options) {
        var opts = options || {};
        if (!hostEl) {
            return {
                complete: function () {}, cancel: function () {},
                workspace: 0, element: null
            };
        }
        ensureCss();

        var built = buildSteps(prompt || "", workspaceHint);
        var workspace = built.workspace;
        var steps = built.steps;
        var blended = built.blended;
        var speedFactor = built.speedFactor;
        var falseStart = built.falseStart;
        var reducedMotion = (opts.reducedMotion !== undefined)
            ? !!opts.reducedMotion
            : prefersReducedMotion();

        // Aggregate stats
        _stats.runs++;
        if (blended) _stats.braid++;
        if (built.converged) _stats.converged++;
        if (built.burst) _stats.burst++;
        if (built.continuity) _stats.continuity++;
        _stats.registers[built.register]++;
        _stats.corrections += built.correctionCount;
        for (var xi = 0; xi < steps.length; xi++) {
            if (steps[xi].phase === "backtrack") _stats.backtracks++;
        }

        var root = document.createElement("details");
        root.className = "axelr-chain" + (reducedMotion ? " reduced-motion" : "");
        root.open = true;
        var blendBadge = blended ? '<span class="chain-blend">braided</span>' : '';
        root.innerHTML =
            '<summary>' +
                '<span class="chain-caret">\u25B6</span>' +
                '<span class="chain-label">' +
                    '<span class="chain-angle">&lt;think&gt;</span>' +
                    'Axelr Reasoning Chain' +
                    '<span class="chain-angle">&lt;/think&gt;</span>' +
                    blendBadge +
                '</span>' +
                '<span class="chain-status">initializing\u2026</span>' +
            '</summary>' +
            '<div class="chain-body" role="log" aria-live="off" aria-hidden="true"></div>' +
            '<div class="chain-sr sr-only" role="status" aria-live="polite" aria-atomic="true"></div>';

        hostEl.appendChild(root);
        var body = root.querySelector(".chain-body");
        var status = root.querySelector(".chain-status");
        var srRegion = root.querySelector(".chain-sr");

        var token = { cancelled: false, reducedMotion: reducedMotion };
        var pending = [];
        var completed = false;
        var statusIdx = 0;

        function nextStatus() {
            return STATUS_VERBS[(statusIdx++) % STATUS_VERBS.length];
        }

        function makeLine(phase) {
            var line = document.createElement("div");
            line.className = "chain-line";
            line.dataset.phase = phase;
            line.innerHTML = '<span class="chain-glyph"><span>\u203A</span></span>' +
                             '<span class="chain-text"></span>';
            body.appendChild(line);
            queueScroll(body);
            return line;
        }

        function markDone(lineEl, text) {
            lineEl.classList.add("done");
            lineEl.setAttribute("aria-label", text);
            if (srRegion) srRegion.textContent = text;
        }

        var phantomLine = null;
        if (falseStart && !reducedMotion) phantomLine = makeLine("phantom");

        for (var si = 0; si < steps.length; si++) {
            var s = steps[si];
            var lineEl = makeLine(s.phase);
            pending.push({
                lineEl: lineEl,
                textEl: lineEl.querySelector(".chain-text"),
                text: s.text,
                idx: si,
                total: steps.length,
                msPerChar: velocityFor(s.text, s.phase, si, steps.length, speedFactor)
            });
        }

        async function emitZoneLine(text, phase) {
            var line = makeLine(phase);
            status.textContent = nextStatus() + "\u2026";
            var txtEl = line.querySelector(".chain-text");
            await typeInto(txtEl, text, velocityFor(text, phase, 0, 0, speedFactor), token);
            if (token.cancelled) return;
            markDone(line, text);
            queueScroll(body);
        }

        (async function run() {
            if (phantomLine) {
                status.textContent = nextStatus() + "\u2026";
                var pt = phantomLine.querySelector(".chain-text");
                await typeInto(pt, "Reconsidering\u2026", 40, token);
                if (token.cancelled) return;
                phantomLine.classList.add("phantom-fade");
                await wait(500);
                if (token.cancelled) return;
                if (phantomLine.parentNode) phantomLine.parentNode.removeChild(phantomLine);
            }

            for (var i = 0; i < pending.length; i++) {
                if (token.cancelled) return;
                var item = pending[i];
                if (i > 0 && i % 3 === 0) {
                    await wait(170 + Math.random() * 210);
                    if (token.cancelled) return;
                }
                status.textContent = nextStatus() + "\u2026";
                await typeInto(item.textEl, item.text, item.msPerChar, token);
                if (token.cancelled) return;
                markDone(item.lineEl, item.text);
                await wait((120 + Math.random() * 150) * speedFactor);
            }
            if (token.cancelled) return;
            status.textContent = nextStatus() + "\u2026";

            var anchorNoun = (steps[0] && steps[0].text.split(" ").pop()) || "context";

            for (var z = 0; z < 3; z++) {
                await wait(1600 + Math.random() * 900);
                if (token.cancelled) return;
                await emitZoneLine(
                    ZONE_B_LINES[z % ZONE_B_LINES.length].replace(/\{n\}/g, anchorNoun),
                    "zone-b"
                );
            }
            if (token.cancelled) return;

            await wait(1200);
            if (token.cancelled) return;
            await emitZoneLine(
                ZONE_C_LINES[Math.floor(Math.random() * ZONE_C_LINES.length)],
                "zone-c"
            );

            var mk = 0;
            while (!token.cancelled) {
                await wait(2400 + Math.random() * 1200);
                if (token.cancelled) return;
                var pool = MAINTENANCE_POOLS[mk++ % MAINTENANCE_POOLS.length];
                await emitZoneLine(pool[Math.floor(Math.random() * pool.length)], "maintain");
                var ml = body.querySelectorAll('.chain-line[data-phase="maintain"]');
                if (ml.length > 6) ml[0].remove();
            }
        })();

        function announce(summary) {
            var sr = document.createElement("div");
            sr.className = "sr-only";
            sr.setAttribute("role", "status");
            sr.setAttribute("aria-live", "polite");
            sr.textContent = summary;
            sr.style.cssText = "position:absolute;width:1px;height:1px;padding:0;" +
                "margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;";
            document.body.appendChild(sr);
            Frame.add(function () {
                if (sr.parentNode) sr.parentNode.removeChild(sr);
            }, 10000);
        }

        function finish(label) {
            if (completed) return;
            completed = true;
            token.cancelled = true;

            for (var i = 0; i < pending.length; i++) {
                var item = pending[i];
                if (!item.lineEl.classList.contains("done")) {
                    item.textEl.textContent = item.text;
                    markDone(item.lineEl, item.text);
                }
            }
            var stragglers = body.querySelectorAll(".chain-line:not(.done)");
            for (var k = 0; k < stragglers.length; k++) {
                var t = stragglers[k].querySelector(".chain-text");
                if (t && t.textContent) markDone(stragglers[k], t.textContent);
            }

            status.textContent = label || "done";
            var stepCount = body.querySelectorAll(".chain-line").length;
            announce("Reasoning chain complete: " + stepCount +
                     " steps, resolved to workspace " + workspace + ".");

            if (label === "streaming" && !reducedMotion) {
                root.classList.add("converged");
                Frame.add(function () { root.classList.remove("converged"); }, 220);
            }

            raf(function () {
                root.open = false;
                root.classList.add("closing");
                Frame.add(function () {
                    if (root.parentNode) root.parentNode.removeChild(root);
                }, reducedMotion ? 120 : 420);
            });
        }

        // AbortSignal wiring
        if (opts.signal) {
            if (opts.signal.aborted) {
                token.cancelled = true;
                // Defer to next microtask so controller is returned first.
                Promise.resolve().then(function () { finish("cancelled"); });
            } else {
                var onAbort = function () { finish("cancelled"); };
                try { opts.signal.addEventListener("abort", onAbort, { once: true }); }
                catch (_) { opts.signal.addEventListener("abort", onAbort); }
            }
        }

        return {
            workspace: workspace,
            blended: blended,
            braid: built.braid,
            sources: built.sources,
            register: built.register,
            continuity: built.continuity,
            correctionCount: built.correctionCount,
            tier: built.tier,
            burst: built.burst,
            converged: built.converged,
            reducedMotion: reducedMotion,
            element: root,
            complete: function (label) { finish(label || "done"); },
            cancel: function () { finish("cancelled"); }
        };
    }

    // ═══════════════════════════════════════════════════════════════════
    // 21 · DETERMINISTIC REPLAY
    // ═══════════════════════════════════════════════════════════════════
    function snapshot(prompt, workspaceHint) {
        return {
            prompt: String(prompt || ""),
            workspaceHint: workspaceHint,
            nonce: getNonce(),
            now: Date.now(),
            ring: JSON.parse(JSON.stringify(getRing()))
        };
    }
    function replay(snap) {
        if (!snap || typeof snap !== "object") return null;
        return buildSteps(snap.prompt, snap.workspaceHint, {
            nonce: snap.nonce, now: snap.now, ring: snap.ring || []
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    // 22 · SELF-TEST
    // ═══════════════════════════════════════════════════════════════════
    function selfTest() {
        var details = [], passed = 0, failed = 0;
        function check(name, cond) {
            if (cond) { passed++; details.push({ ok: true, name: name }); }
            else { failed++; details.push({ ok: false, name: name }); }
        }

        // Determinism under injection
        var ctx = { nonce: 1, now: 1000, ring: [] };
        var a = buildSteps("design a landing page with a hero and button", 0, ctx);
        var b = buildSteps("design a landing page with a hero and button", 0, ctx);
        check("determinism: identical steps",
            JSON.stringify(a.steps) === JSON.stringify(b.steps));

        // Hash stability
        check("hashSeed stable", hashSeed("abc") === hashSeed("abc"));
        check("hashSeed distinct", hashSeed("abc") !== hashSeed("abd"));

        // Simhash reflexive
        var h1 = simhash32(["foo", "bar"]);
        var h2 = simhash32(["foo", "bar"]);
        check("simhash reflexive", hamming32(h1, h2) === 0);

        // Diffuse preserves sum
        var br = diffuse([1, 0, 0]);
        check("braid preserves sum", Math.abs(br[0] + br[1] + br[2] - 1) < 1e-9);
        check("braid core dominant", br[0] > 0.6);

        // Punctuation cascade has no adjacent doubles
        var r = mulberry32(42);
        var pl = punctuateTrace(["alpha line", "beta line here", "gamma"], r);
        check("punctuation no adjacent terminal",
            !/[,;:]\s*[,;:]/.test(pl.join(" ")));

        // normalisePrompt collapses whitespace
        check("normalise collapses",
            normalisePrompt("  a   b  ") === "a b");

        // Transliterate
        check("transliterate kar -> do", /\bdo\b/.test(transliterate("kar")));

        // extractNouns does not substring-match
        var rnd = mulberry32(7);
        var ns = extractNouns("please map the fields", 0, rnd);
        var bad = false;
        for (var n1 = 0; n1 < ns.length; n1++) {
            if (/^map/.test(ns[n1]) && ns[n1].toLowerCase() !== "map") bad = true;
        }
        check("extractNouns no substring bleed", !bad);

        // Register masks are valid
        var ok = true;
        for (var w = 0; w < 3; w++) {
            for (var rIdx = 0; rIdx < 3; rIdx++) {
                if (typeof POOLS[w].mask[rIdx] !== "number") ok = false;
            }
        }
        check("register masks present", ok);

        // Braid returns non-empty for a cross-domain prompt
        var braidRes = braidPools([0, 1], [0.6, 0.4, 0], mulberry32(3), REG_G);
        check("braid non-empty", braidRes.idx.length > 0);

        return { passed: passed, failed: failed, details: details };
    }

    // ═══════════════════════════════════════════════════════════════════
    // 23 · PUBLIC SURFACE
    // ═══════════════════════════════════════════════════════════════════
    window.Axelr.AxelrReasoning = {
        // Primary API
        begin: begin,
        configure: configure,
        stats: stats,
        resetStats: resetStats,
        snapshot: snapshot,
        replay: replay,
        selfTest: selfTest,

        // Utilities
        buildSteps: buildSteps,
        scoreAffinity: scoreAffinity,
        diffuse: diffuse,
        hashSeed: hashSeed,
        simhash32: simhash32,
        hamming32: hamming32,
        transliterate: transliterate,
        normalisePrompt: normalisePrompt,
        recentNounSet: recentNounSet,
        oldestRingEntry: oldestRingEntry,
        recentBurst: recentBurst,
        recurrenceCount: recurrenceCount,
        coherencePrefix: coherencePrefix,
        arcFactor: arcFactor,
        adaptiveLineCount: adaptiveLineCount,
        dedupeAdjacentVerbs: dedupeAdjacentVerbs,
        enforceAnchorPersistence: enforceAnchorPersistence,
        punctuateTrace: punctuateTrace,
        applyGravityWell: applyGravityWell,
        applyRegisterDrift: applyRegisterDrift,
        driftRegister: driftRegister,
        braidPools: braidPools,
        registerIndices: registerIndices,
        Frame: Frame,

        // Config + internals (read-only observation)
        CONFIG: CFG,
        _STRONG: STRONG,
        _MEDIUM: MEDIUM,
        _MULTI: MULTI,
        _POOLS: POOLS,
        _BRAID: BRAID,
        _OP_MAP: OPERATOR_MAP,
        _HINGLISH: HINGLISH_MAP,
        _ZONE_B: ZONE_B_LINES,
        _ZONE_C: ZONE_C_LINES,
        _BACKTRACKS: BACKTRACKS,
        _MAINTENANCE: MAINTENANCE_POOLS,
        _STATUS_VERBS: STATUS_VERBS,
        _CORRECTIONS: CORRECTIONS
    };
})();