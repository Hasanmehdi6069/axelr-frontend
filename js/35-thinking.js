// js/35-thinking.js
// AXELR GOAT Reasoning Emulation Engine — v4.4 "GOAT Terminal" (frozen).
// $0 cost · 0 MB server RAM · 100 % edge-computed.
//
//  P1 Rolling 3-query XOR salt + 0/1/2 Correction Accordion
//  P2 Hinglish transliteration + textContent-only injection
//  P3 Complexity-gated typing + micro-pauses + infinite maintenance + fluid status
//  P4 SR-silent typing + per-line aria-label + full reduced-motion branch
//
//  η Verb Dedup          θ Adaptive Count     ι Anchor Persistence
//  κ Punctuation Cascade λ Micro-Typo         ν Register Spiral
//  π Reflexive Correction σ Convergence Flash
//  ρ Burst Suppression   τ False Start        υ Cross-Session Echo
//  φ Gravity Well        χ Register Drift     ψ Convergence Memory
//
//  β Semantic Coherence  γ Syntactic Self-Edit  δ Confidence Arc
//  ε Novelty Bias        ζ Dead-Code Revival    α Anchor Echo
(function () {
    "use strict";
    window.Axelr = window.Axelr || {};

    // ═══════════════════════════════════════════════════════════════════
    // 1 · LEXICON MATRIX  (v4.2 formatting, verbatim)
    // ═══════════════════════════════════════════════════════════════════
    const LEX = {
        core: {
            strong: [
                "loop","iteration","recursion","branch","switch","predicate",
                "guard","sentinel","state machine","fsm","transition",
                "async","await","promise","future","coroutine","generator",
                "callback","continuation","event loop","reactor","proactor",
                "channel","signal","handshake","synchronisation","synchronization",
                "exception","try","catch","finally","recover","panic",
                "retry","backoff","circuit breaker","fallback","deadletter",
                "supervisor","crash","restart","idempotent",
                "tcp","udp","http","https","websocket","grpc","rest","graphql",
                "rpc","sse","keepalive","tls","ssl","auth","jwt",
                "oauth","oidc","session","csrf","cors","ratelimit","throttle",
                "thread","worker","threadpool","executor","scheduler","task",
                "mutex","semaphore","atomic","lockfree","lock","contention",
                "deadlock","starvation","backpressure","queue","buffer",
                "latency","throughput","jitter","p99","sla","slo"
            ],
            medium: [
                "code","function","class","module","package","library","framework",
                "system","engine","service","client","deploy","cli","shell",
                "env","config","flag","binding","interface","adapter",
                "hook","listener","emit","dispatch","handler","route","proxy",
                "gateway","middleware","cache","allocator","profiler","benchmark"
            ]
        },
        data: {
            strong: [
                "cardinality","matrix","crossjoin","product","cartesian",
                "fanout","fan-in","fanin","aggregate","aggregation",
                "b-tree","btree","hashindex","gin","gist","inverted","trie",
                "index","indexing","partition","shard","sharding","replica",
                "schema","dtype","signature","constraint","foreign","primary",
                "unique","nullable","coerce","validator","conformance",
                "avro","protobuf","openapi","jsonschema",
                "normalize","normalise","denormalize","dedupe","canonicalize",
                "sort","groupby","fold","reduce","map","flatmap","window",
                "pivot","unpivot","melt","cast","reshape",
                "payload","envelope","mapping","mapper","transform","etl",
                "elt","ingest","extraction","extract","parse","emit",
                "csv","tsv","xlsx","excel","spreadsheet","parquet","avro","orc",
                "json","jsonl","ndjson","yaml","xml","docx","pdf","ocr",
                "invoice","receipt","ledger","statement","transaction",
                "sql","query","select","join","cte","subquery","plan","explain",
                "redis","memcache","lru","ttl","eviction","snapshot","checkpoint",
                "vector","embedding","cosine","dotproduct","knn","dataset","tensor"
            ],
            medium: [
                "data","file","record","field","value","number","date","count",
                "total","report","analysis","chart","graph","plot","statistics",
                "average","median","percent","ratio","trend","growth","segment",
                "batch","sync","delta","diff","merge","upsert","metric","kpi",
                "histogram","distribution","correlation","regression","forecast",
                "anomaly","outlier","quantile","percentile"
            ]
        },
        design: {
            strong: [
                "hover","active","focus","focus-visible","visited","disabled",
                "loading","pending","success","error","ripple","shimmer",
                "skeleton","pulse","bounce","spring","easing","keyframe",
                "transition","animation","gesture","swipe","drag",
                "token","design token","css var","cssvar","variable","theme",
                "palette","typography","spacing","radius","shadow","elevation",
                "zindex","scale","opacity","blend","filter","backdrop",
                "styled-components","emotion","stitches","vanilla-extract",
                "css-in-js","cssinjs","linaria","stylex","tamagui",
                "layout","reflow","repaint","grid","flex","float","position",
                "stack","inline","block","viewport","breakpoint","media",
                "container","gap","align","justify","order","placement",
                "aspect","ratio","aspect-ratio","responsive","fluid",
                "intrinsic","clamp","minmax","container-query",
                "react","vue","svelte","angular","nextjs","nuxt","astro","solid",
                "remix","qwik","preact","tailwind","bootstrap","chakra",
                "mantine","component","navbar","sidebar","modal","drawer",
                "tooltip","dropdown","accordion","carousel","table","form",
                "input","button","badge","avatar","chip","card","hero","footer"
            ],
            medium: [
                "design","ui","ux","style","build","create","page","app","screen",
                "view","render","props","state","hook","router","wireframe",
                "mockup","figma","sketch","prototype","landing","dashboard",
                "css","scss","sass","less","postcss","html"
            ]
        }
    };

    // ═══════════════════════════════════════════════════════════════════
    // 2 · ACTION MATRICES (v4.2 formatting, verbatim)
    // ═══════════════════════════════════════════════════════════════════
    const ACTIONS = {
        core: [
            { t:"Allocating thread-pool slot for {noun}",      r:"g" },
            { t:"Warming async handshake path for {noun}",     r:"g" },
            { t:"Binding error-handler scope to {noun}",       r:"g" },
            { t:"Enumerating fallback providers for {noun}",   r:"g" },
            { t:"Resolving protocol barrier on {noun}",        r:"g" },
            { t:"Inspecting contention limits on {noun}",      r:"g" },
            { t:"Drafting deterministic retry plan for {noun}",r:"g" },
            { t:"Locking output schema for {noun}",            r:"g" },
            { t:"Synchronising with primary inference node",   r:"g" },
            { t:"Verifying backpressure thresholds",           r:"g" },
            { t:"Registering supervisor scope for {noun}",     r:"g" },
            { t:"Streaming finalised tokens",                  r:"g" },
            { t:"Reconciling thread-limit budget",             r:"g" },
            { t:"Seeding request-scoped context",              r:"g" },
            { t:"Handshake established on {noun} channel",     r:"d" },
            { t:"Retry budget converged for {noun}",           r:"d" },
            { t:"Supervisor tree stabilised",                  r:"d" },
            { t:"Verify async boundary on {noun}",             r:"i" },
            { t:"Confirm provider fallback chain",             r:"i" },
            { t:"Re-check contention envelope",                r:"i" }
        ],
        data: [
            { t:"Parsing cardinality matrix for {noun}",       r:"g" },
            { t:"Traversing index tree of {noun}",             r:"g" },
            { t:"Validating schema envelope for {noun}",       r:"g" },
            { t:"Normalising collection of {noun}",            r:"g" },
            { t:"Mapping payload fields for {noun}",           r:"g" },
            { t:"Detecting delimiter signature",               r:"g" },
            { t:"Resolving null clusters and outliers",        r:"g" },
            { t:"Aligning dtype signatures",                   r:"g" },
            { t:"Reconciling aggregate drift in {noun}",       r:"g" },
            { t:"Emitting structured JSON envelope",           r:"g" },
            { t:"Finalising extraction schema",                r:"g" },
            { t:"Rebalancing partition skew across shards",    r:"g" },
            { t:"Compiling query-plan for {noun}",             r:"g" },
            { t:"Warming row cache for {noun}",                r:"g" },
            { t:"Cardinality matrix converged on {noun}",      r:"d" },
            { t:"Index traversal complete for {noun}",         r:"d" },
            { t:"Schema envelope validated",                   r:"d" },
            { t:"Verify aggregate integrity on {noun}",        r:"i" },
            { t:"Confirm delimiter signature",                 r:"i" },
            { t:"Re-check outlier distribution",               r:"i" }
        ],
        design: [
            { t:"Priming micro-interaction states for {noun}", r:"g" },
            { t:"Resolving token boundaries in {noun}",        r:"g" },
            { t:"Binding CSS-in-JS variables for {noun}",      r:"g" },
            { t:"Computing layout reflow boundaries",          r:"g" },
            { t:"Calibrating aspect-ratio constraints on {noun}",r:"g" },
            { t:"Stabilising flex and grid containers",        r:"g" },
            { t:"Sequencing entrance transitions for {noun}",  r:"g" },
            { t:"Diffing render tree for regressions",         r:"g" },
            { t:"Composing accessibility aria-labels",         r:"g" },
            { t:"Purging unused design tokens",                r:"g" },
            { t:"Verifying visual hierarchy",                  r:"g" },
            { t:"Resolving theme-token drift",                 r:"g" },
            { t:"Allocating palette slots for {noun}",         r:"g" },
            { t:"Baking production bundle for {noun}",         r:"g" },
            { t:"Layout reflow bounded for {noun}",            r:"d" },
            { t:"Token boundaries resolved",                   r:"d" },
            { t:"Render tree diff clean",                      r:"d" },
            { t:"Verify responsive breakpoints on {noun}",     r:"i" },
            { t:"Confirm aspect-ratio guardrails",             r:"i" },
            { t:"Re-check theme-token parity",                 r:"i" }
        ]
    };

    // ═══════════════════════════════════════════════════════════════════
    // 3 · SELF-CORRECTION POOL
    // ═══════════════════════════════════════════════════════════════════
        const CORRECTIONS = [
        "Execution block collision on {noun} — shifting path to fallback buffer",
        "Volatile state divergence detected near {noun}; replaying from checkpoint",
        "Rollback: earlier assumption on {noun} invalidated by downstream signal",
        "Cache coherence failed for {noun} — invalidating intermediate state",
        "Edge case surfaced for {noun}; re-routing through conservative branch",
        "Boundary violation on {noun}; widening tolerance envelope",
        "Prior step on {noun} could drift from intent — re-verifying chain",
        "Ambiguity in {noun} detected; falling back to strict interpretation",
        "Unlike the first pass, {noun} needs a narrower scope — re-framing",
        "Whereas the earlier path treated {noun} as stable, evidence suggests otherwise",
        "In contrast to the initial read, {noun} requires tighter validation"
    ];

    const ZONE_B_LINES = [
        "Deepening verification on {noun}; cross-checking against second source",
        "Traversing alternative hypotheses in parallel; {noun} still dominant",
        "Re-running internal consistency pass over {noun}",
        "Sampling counter-evidence for {noun}; weighting by confidence prior",
        "Reconstructing partial chain from {noun} context",
        "Tracing dependency edges adjacent to {noun}",
        "Holding intermediate findings for {noun}; awaiting confirmation stream",
        "Confirming intent alignment across {noun} sub-goals"
    ];
    const ZONE_C_LINES = [
        "Primary inference node congested — routing through secondary provider",
        "Elevated latency detected — falling back to standby cluster",
        "Backend queue saturated — engaging redundancy lane"
    ];

    // [ν] Three registers rotate during long socket waits.
    const MAINTENANCE_POOLS = [
        [ "Monitoring socket pipeline integrity",
          "Verifying backend heartbeat cadence",
          "Polling for first token arrival" ],
        [ "Continuing to maintain token compression state",
          "Sustaining streaming buffer across edge context",
          "Synchronising request signature with primary node" ],
        [ "Lane warm.", "Buffer stable.", "Heartbeat nominal." ]
    ];

    const STATUS_VERBS = [
        "Synthesizing", "Analyzing", "Reconciling data matrices",
        "Tracing dependencies", "Allocating buffers", "Confirming schema",
        "Sampling evidence", "Stabilising state"
    ];

    // ═══════════════════════════════════════════════════════════════════
    // 4 · CONSTANTS
    // ═══════════════════════════════════════════════════════════════════
    const INTERTWINE_THRESHOLD = 0.35;
    const SESSION_RING_MAX     = 32;
    const SESSION_RING_KEY     = "axelr_reasoning_ring_v44";
    const SESSION_NONCE_KEY    = "axelr_reasoning_nonce_v44";
    const GOLDEN               = 0x9E3779B9;
    const HAM_CONTINUITY       = 3;
    const RING_LOOKBACK        = 3;
    const NOVELTY_WINDOW       = 3;
    const COHERENCE_RATE       = 0.30;
    const SELF_EDIT_RATE       = 0.08;
    const MICRO_TYPO_RATE      = 0.07;
    const DRIFT_RATE           = 0.25;   // [χ] chance of one register-drift line
    const FALSE_START_RATE     = 0.15;   // [τ]
    const BURST_WINDOW_MS      = 8000;   // [ρ]
    const CONVERGENCE_THRESHOLD= 3;      // [ψ] repeats before forcing reuse

    // ═══════════════════════════════════════════════════════════════════
    // 5 · HINGLISH TRANSLITERATION
    // ═══════════════════════════════════════════════════════════════════
    const HINGLISH_MAP = Object.freeze({
        "kar":"do","karo":"do","karna":"do","kardo":"do","kardena":"do",
        "me":"in","mein":"in",
        "iss":"this","is":"this","iske":"of this","iska":"of this","iski":"of this",
        "ka":"of","ki":"of","ke":"of","aur":"and","se":"from","ko":"to",
        "banao":"create","bana":"create","banado":"create",
        "chahiye":"need","chaiye":"need","dikhao":"show","dikha":"show",
        "kya":"what","kaise":"how","kab":"when","kahan":"where",
        "yaha":"here","waha":"there",
        "sab":"all","kuch":"some","koi":"any",
        "thoda":"a little","bahut":"very",
        "abhi":"now","baad":"after","pehle":"before","jaldi":"quickly",
        "nahi":"not","na":"not",
        "hai":"is","hain":"are","tha":"was","the":"were",
        "mera":"my","meri":"my","mere":"my",
        "aapka":"your","aapki":"your","tumhara":"your",
        "bhai":"friend","yaar":"friend"
    });

    const TECH_TERMS = (function () {
        const s = new Set();
        for (const ws of ["core","data","design"]) {
            for (const k of LEX[ws].strong) s.add(k.toLowerCase());
            for (const k of LEX[ws].medium) s.add(k.toLowerCase());
        }
        return s;
    })();

    // ═══════════════════════════════════════════════════════════════════
    // 6 · CRYPTOGRAPHIC PRIMITIVES
    // ═══════════════════════════════════════════════════════════════════
    function hashSeed(str) {
        const s = String(str || "");
        const composite = s.length + "|" + s.trim().split(/\s+/).filter(Boolean).length + "|" + s;
        let h = 2166136261 >>> 0;
        for (let i = 0; i < composite.length; i++) {
            h ^= composite.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        return h >>> 0;
    }
    function mulberry32(a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function simhash32(tokens) {
        const bits = new Array(32).fill(0);
        for (const tok of tokens) {
            const h = hashSeed(tok);
            for (let i = 0; i < 32; i++) bits[i] += ((h >>> i) & 1) ? 1 : -1;
        }
        let r = 0;
        for (let i = 0; i < 32; i++) if (bits[i] > 0) r |= (1 << i);
        return r >>> 0;
    }
    function hamming32(a, b) {
        let x = (a ^ b) >>> 0, c = 0;
        while (x) { c += x & 1; x >>>= 1; }
        return c;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 7 · SESSION STATE
    // ═══════════════════════════════════════════════════════════════════
    function getSessionNonce() {
        try {
            let n = parseInt(sessionStorage.getItem(SESSION_NONCE_KEY) || "0", 10);
            if (!n) {
                n = (Math.random() * 0xFFFFFFFF) >>> 0;
                sessionStorage.setItem(SESSION_NONCE_KEY, String(n));
            }
            return n >>> 0;
        } catch (_) { return 0xDEADBEEF; }
    }
    function getRing() {
        try {
            const raw = sessionStorage.getItem(SESSION_RING_KEY);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch (_) { return []; }
    }
    function setRing(arr) {
        try { sessionStorage.setItem(SESSION_RING_KEY, JSON.stringify(arr.slice(-SESSION_RING_MAX))); }
        catch (_) {}
    }
    function findNearestSimhash(sh, ring) {
        let best = null, bestDist = 33;
        for (const e of ring) {
            if (typeof e.s !== "number") continue;
            const d = hamming32(sh, e.s);
            if (d < bestDist) { bestDist = d; best = e; }
        }
        return { entry: best, distance: bestDist };
    }
    function recentNounSet(ring) {
        const s = new Set();
        for (const e of ring.slice(-NOVELTY_WINDOW)) {
            if (Array.isArray(e.ns)) for (const n of e.ns) s.add(n.toLowerCase());
        }
        return s;
    }
    // [υ] Oldest-entry retrieval for Cross-Session Echo.
    function oldestRingEntry(ring) {
        for (const e of ring) if (e && Array.isArray(e.ns) && e.ns.length) return e;
        return null;
    }
    // [ρ] Burst detection — did this exact prompt fire within BURST_WINDOW_MS?
    function recentBurst(ring, baseSeed) {
        const now = Date.now();
        for (let i = ring.length - 1; i >= 0; i--) {
            const e = ring[i];
            if (e.h !== baseSeed) continue;
            if (typeof e.ts === "number" && (now - e.ts) < BURST_WINDOW_MS) return true;
            return false; // first hit on baseSeed not in window → stop
        }
        return false;
    }
    // [ψ] Convergence — how many prior hits of this baseSeed exist?
    function recurrenceCount(ring, baseSeed) {
        let n = 0;
        for (const e of ring) if (e.h === baseSeed) n++;
        return n;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 8 · AFFINITY SCORING
    // ═══════════════════════════════════════════════════════════════════
    function scoreAffinity(prompt) {
        const p = String(prompt || "").toLowerCase();
        const raw = { core: 0, data: 0, design: 0 };
        const hits = { core: 0, data: 0, design: 0 };
        for (const ws of ["core", "data", "design"]) {
            for (const kw of LEX[ws].strong) if (p.includes(kw)) { raw[ws] += 3; hits[ws]++; }
            for (const kw of LEX[ws].medium) {
                if (new RegExp("\\b" + kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(p)) raw[ws] += 1;
            }
        }
        const total = raw.core + raw.data + raw.design;
        const weights = total > 0
            ? { core: raw.core / total, data: raw.data / total, design: raw.design / total }
            : { core: 1, data: 0, design: 0 };
        let best = "core", bestScore = -1;
        for (const ws of ["core", "data", "design"]) if (weights[ws] > bestScore) { bestScore = weights[ws]; best = ws; }
        return { workspace: best, weights, raw, hits };
    }

    // ═══════════════════════════════════════════════════════════════════
    // 9 · TOKEN HARVESTING
    // ═══════════════════════════════════════════════════════════════════
    const STOP = new Set([
        "the","and","for","with","from","that","this","these","those","have","has",
        "had","will","would","could","should","into","onto","about","over","under",
        "what","when","where","which","while","your","yours","their","they","them",
        "then","than","also","just","only","some","any","all","each","every","here",
        "there","please","make","made","like","want","need","using","use","get","got",
        "can","give","show","tell","help","write","create","build","converted",
        "convert","turn","into","de"
    ]);

    const OPERATOR_RE = /(?:===|!==|>>>|<<=|>>=|=>|->|::|\*\*|\?\?=|\|\|=|&&=|<<|>>|\?\?|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|==|!=|<=|>=|&&|\|\||\?\.[A-Za-z_]|\?\?|=>|[+\-*/%<>=!&|^~?])/g;
    const OPERATOR_MAP = {
        "=>":"lambda arrow binding","->":"member pointer dereference",
        "::":"scope resolution","**":"exponentiation op","+=":"accumulation op",
        "-=":"decrement op","*=":"scale op","/=":"division op","%=":"modulo op",
        "||":"logical OR short-circuit","&&":"logical AND short-circuit",
        "??":"nullish coalescing","||=":"logical OR assign",
        "&&=":"logical AND assign","??=":"nullish coalesce assign",
        "===":"strict equality","!==":"strict inequality",
        "==":"loose equality","!=":"loose inequality","<=":"less-than-or-equal",
        ">=":"greater-than-or-equal","<<":"left bit-shift","<<=":"left bit-shift assign",
        ">>=":"right bit-shift assign","+":"additive op","-":"subtractive op",
        "*":"multiplicative op","/":"division op","%":"modulo op",
        "<":"less-than compare",">":"greater-than compare","=":"assignment binding",
        "!":"logical NOT","&":"bitwise AND","|":"bitwise OR","^":"bitwise XOR",
        "~":"bitwise NOT","?":"conditional branch"
    };

    function transliterate(prompt) {
        return String(prompt || "").split(/(\s+)/).map(tok => {
            if (!tok || /^\s+$/.test(tok)) return tok;
            const stripped = tok.toLowerCase().replace(/[^a-z]/g, "");
            return HINGLISH_MAP[stripped] || tok;
        }).join("");
    }

    function extractNouns(prompt, workspace, rand) {
        const p = String(prompt || "");
        const normalised = transliterate(p);
        const harvested = [];
        let m;

        const fenceRe = /```[a-z0-9_+-]*\n?([\s\S]*?)```/gi;
        while ((m = fenceRe.exec(normalised)) !== null) {
            const idRe = /\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g; let id;
            while ((id = idRe.exec(m[1])) !== null) if (!STOP.has(id[0].toLowerCase())) harvested.push(id[0]);
        }
        const inlineRe = /`([^`\n]+)`/g;
        while ((m = inlineRe.exec(normalised)) !== null) {
            const idRe = /\b[A-Za-z_][A-Za-z0-9_.-]{2,}\b/g; let id;
            while ((id = idRe.exec(m[1])) !== null) if (!STOP.has(id[0].toLowerCase())) harvested.push(id[0]);
        }
        const identRe = /\b(?:[A-Z][a-z]+(?:[A-Z][a-z0-9]+)+|[a-z]+(?:_[a-z0-9]+)+|[A-Z][A-Z0-9_]{2,})\b/g;
        while ((m = identRe.exec(normalised)) !== null) harvested.push(m[0]);
        const quoteRe = /["']([^"'\n]{3,40})["']/g;
        while ((m = quoteRe.exec(normalised)) !== null) {
            const t = m[1].trim();
            if (t && !STOP.has(t.toLowerCase())) harvested.push(t);
        }
        const plain = normalised.toLowerCase().replace(/[^a-z0-9_\s]/g, " ").split(/\s+/);
        for (const t of plain) { if (t.length < 4 || STOP.has(t)) continue; harvested.push(t); }

        const hasNouns = harvested.some(t => /[a-z0-9]/i.test(t));
        if (!hasNouns) {
            OPERATOR_RE.lastIndex = 0;
            const seenOps = new Set(); let op;
            while ((op = OPERATOR_RE.exec(p)) !== null) {
                const desc = OPERATOR_MAP[op[0]];
                if (desc && !seenOps.has(desc)) {
                    seenOps.add(desc); harvested.push(desc);
                    if (seenOps.size >= 3) break;
                }
            }
        }

        const seen = new Set(); const ordered = [];
        for (const t of harvested) {
            const k = t.toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k); ordered.push(t);
        }
        if (!ordered.length) return ["your request"];

        const domainHits = ordered.filter(t =>
            LEX[workspace].strong.some(k => t.toLowerCase().includes(k) || k.includes(t.toLowerCase()))
        );
        const pool = domainHits.length ? domainHits : ordered;

        const arr = pool.slice();
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        const rawTokens = p.trim().split(/\s+/)
            .filter(w => w.length >= 3 && !STOP.has(w.toLowerCase()) && !HINGLISH_MAP[w.toLowerCase()]);
        const verbatim = rawTokens.length ? rawTokens[0] : null;
        const slice = arr.slice(0, 2);
        if (verbatim && !slice.some(t => t === verbatim)) slice.push(verbatim);
        return slice;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 10 · POOL BUILDERS + REGISTER LOCK + DRIFT
    // ═══════════════════════════════════════════════════════════════════
    function shuffle(arr, rand) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
    function pickRegister(rand) {
        const r = rand();
        return r < 0.6 ? "g" : r < 0.85 ? "d" : "i";
    }
    function filterByRegister(lines, register) {
        const matched = lines.filter(l => l.r === register);
        if (matched.length >= 3) return matched;
        const order = register === "g" ? ["d","i"] : register === "d" ? ["g","i"] : ["g","d"];
        const out = matched.slice();
        for (const alt of order) {
            for (const l of lines) {
                if (l.r === alt && !out.includes(l)) out.push(l);
                if (out.length >= 3) break;
            }
            if (out.length >= 3) break;
        }
        return out.length ? out : lines.slice();
    }
    // [χ] Register Drift — one middle line briefly departs the primary register.
    function driftRegister(primary, rand) {
        if (rand() > DRIFT_RATE) return null;
        return primary === "g" ? "d" : primary === "d" ? "g" : "d";
    }
    function driftPool(pool, altRegister, rand) {
        if (!altRegister) return null;
        const alt = pool.filter(l => l.r === altRegister);
        return alt.length ? alt : null;
    }
    function buildBlendedPool(weights, rand, register) {
        const crossings = Object.entries(weights).filter(([, w]) => w >= INTERTWINE_THRESHOLD).map(([ws]) => ws);
        if (crossings.length <= 1) {
            const ws = crossings[0] || "core";
            const raw = filterByRegister(ACTIONS[ws], register);
            return { pool: shuffle(raw.slice(), rand), primary: ws, blended: false };
        }
        const sorted = crossings.slice().sort((a, b) => weights[b] - weights[a]);
        const queues = sorted.map(ws => shuffle(filterByRegister(ACTIONS[ws], register).slice(), rand));
        const merged = [];
        let exhausted = false;
        while (!exhausted) {
            exhausted = true;
            for (const q of queues) if (q.length) { merged.push(q.shift()); exhausted = false; }
        }
        return { pool: merged, primary: sorted[0], blended: true, sources: sorted };
    }

    // ═══════════════════════════════════════════════════════════════════
    // 11 · COMPLEXITY
    // ═══════════════════════════════════════════════════════════════════
    function complexityTier(hits, blended, prompt) {
        if (blended) return "complex";
        const totalHits = hits.core + hits.data + hits.design;
        const p = String(prompt || "");
        const fences = (p.match(/```/g) || []).length;
        const braces = (p.match(/[{}]/g) || []).length;
        const clauses = (p.match(/[,;:—–]|\.\s/g) || []).length;
        if (fences >= 2 || braces >= 6 || clauses >= 6) return "complex";
        if (totalHits >= 3 || clauses >= 3) return "medium";
        return "simple";
    }
    function correctionCountFor(tier) {
        return tier === "complex" ? 2 : tier === "medium" ? 1 : 0;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 12 · ELITE POST-PROCESSORS
    // ═══════════════════════════════════════════════════════════════════
    // [η] Verb Dedup
    function firstVerb(line) {
        return (String(line).split(/[\s—]/)[0] || "").replace(/[^A-Za-z]/g, "");
    }
    function dedupeAdjacentVerbs(lines) {
        for (let i = 1; i < lines.length; i++) {
            const vi = firstVerb(lines[i]);
            if (!vi || vi !== firstVerb(lines[i - 1])) continue;
            for (let j = i + 1; j < lines.length; j++) {
                const vj = firstVerb(lines[j]);
                if (vj && vj !== vi && vj !== firstVerb(lines[i - 1])) {
                    [lines[i], lines[j]] = [lines[j], lines[i]];
                    break;
                }
            }
        }
        return lines;
    }

    // [θ] Adaptive count
    function adaptiveLineCount(prompt, baseCount, tier) {
        const s = String(prompt || "");
        const len = s.length;
        const words = s.trim().split(/\s+/).filter(Boolean).length;
        const clauses = (s.match(/[,;:—–]|\.\s/g) || []).length;
        let n = baseCount;
        if (len > 400 || words > 60 || clauses >= 6) n += 2;
        else if (len > 180 || words > 25) n += 1;
        else if (len < 30 && words < 6 && tier === "simple") n = Math.max(3, n - 1);
        return Math.max(3, Math.min(8, n));
    }

    // [ι] Anchor Persistence
    function enforceAnchorPersistence(lines, subject, rand) {
        if (!subject || subject.length < 3) return lines;
        const occurrences = () => lines.filter(l => l.toLowerCase().includes(subject.toLowerCase())).length;
        if (occurrences() >= 2) return lines;
        for (let attempt = 0; attempt < 4 && occurrences() < 2; attempt++) {
            const idx = 1 + Math.floor(rand() * Math.max(1, lines.length - 2));
            if (lines[idx].toLowerCase().includes(subject.toLowerCase())) continue;
            const words = lines[idx].split(/\s+/);
            for (let j = words.length - 1; j >= 0; j--) {
                if (words[j].length >= 4 && !STOP.has(words[j].toLowerCase().replace(/[^a-z]/gi, ""))) {
                    words[j] = subject;
                    lines[idx] = words.join(" ");
                    break;
                }
            }
        }
        return lines;
    }
    // [κ] Punctuation Cascade — context-aware terminal selection.
    // Lines naming a specific technical token (identifier, framework, metric)
    // get a technical terminal (; or :); descriptive lines get a period;
    // transitional lines get an em-dash.
    const TECHNICAL_TOKEN_RE = /\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g;
    const TRANSITIONAL_HINT = /\b(however|while|although|whereas|whilst|but)\b/i;
    function pickTerminal(line, last, rand) {
        const lower = line.toLowerCase();
        const isTransitional = TRANSITIONAL_HINT.test(lower) || lower.startsWith("re-entering") || lower.startsWith("building on") || lower.startsWith("carrying");
        const technicalHits = (line.match(TECHNICAL_TOKEN_RE) || [])
            .filter(t => TECH_TERMS.has(t.toLowerCase())).length;
        const r = rand();
        let pool;
        if (isTransitional)              pool = [" —", ",", "."];
        else if (technicalHits >= 2)     pool = [";", ":", "."];
        else if (technicalHits === 1)    pool = [".", ";", ":", "."];
        else                             pool = [".", ",", " —"];
        let pick = pool[Math.floor(r * pool.length)];
        let guard = 0;
        while (pick === last && guard++ < 6) pick = pool[Math.floor(rand() * pool.length)];
        return pick;
    }
    function punctuateTrace(lines, rand) {
        let last = "";
        return lines.map((line, i) => {
            if (/[.!?;:—–]\s*$/.test(line)) { last = line.slice(-1); return line; }
            if (i === lines.length - 1)      { last = "."; return line + "."; }
            const pick = pickTerminal(line, last, rand);
            last = pick;
            return line + pick;
        });
    }

    // [φ] Gravity Well — the longest string lands at a specific beat.
    function applyGravityWell(lines) {
        if (lines.length < 4) return lines;
        let maxI = 0;
        for (let i = 1; i < lines.length; i++) if (lines[i].length > lines[maxI].length) maxI = i;
        const target = Math.min(3, lines.length - 2);
        if (maxI === target) return lines;
        const [moved] = lines.splice(maxI, 1);
        lines.splice(target, 0, moved);
        return lines;
    }
    // [χ] Register Drift — swap one middle line to its adjacent register,
    // drawing a real alternate-register template from the workspace pool.
    // Preserves the original noun so the substitution reads as a change of
    // cognitive stance, not a change of subject.
    function applyRegisterDrift(lines, primaryRegister, rand, sources, nouns) {
        const alt = driftRegister(primaryRegister, rand);
        if (!alt || lines.length < 4 || !Array.isArray(sources) || !sources.length) return lines;
        const ws = sources[Math.floor(rand() * sources.length)] || sources[0];
        const altPool = (ACTIONS[ws] || []).filter(l => l.r === alt);
        if (!altPool.length) return lines;
        const idx = 2 + Math.floor(rand() * Math.max(1, lines.length - 3));
        // Extract the noun from the original line if it has one.
        const m = /\bfor\s+([A-Za-z0-9_][A-Za-z0-9_\-.]*)/.exec(lines[idx]) ||
                  /\bon\s+([A-Za-z0-9_][A-Za-z0-9_\-.]*)/.exec(lines[idx]) ||
                  /\bin\s+([A-Za-z0-9_][A-Za-z0-9_\-.]*)/.exec(lines[idx]);
        const noun = (m && m[1]) || (Array.isArray(nouns) && nouns[0]) || "context";
        const tpl = altPool[Math.floor(rand() * altPool.length)];
        const replacement = tpl.t.replace(/\{noun\}/g, noun);
        // Strip any trailing punctuation the source had so the punctuation
        // cascade downstream can re-terminate cleanly.
        lines[idx] = replacement.replace(/[.;:,—–\s]+$/, "");
        return lines;
    }

    // [β] Coherence prefix
    function coherencePrefix(priorNoun) {
        const variants = [
            "Building on {prior} — ",
            "Consistent with {prior} — ",
            "Following the {prior} thread — ",
            "Re-entering context around {prior} — ",
            "Carrying {prior} forward — "
        ];
        const tpl = variants[Math.floor(Math.random() * variants.length)];
        return tpl.replace("{prior}", priorNoun);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 13 · STEP BUILDER
    // ═══════════════════════════════════════════════════════════════════
    function tokeniseForSimhash(prompt) {
        return String(prompt || "").toLowerCase().replace(/[^a-z0-9_\s]/g, " ").split(/\s+/).filter(t => t.length >= 2);
    }

    function buildSteps(prompt, workspaceHint) {
        const p = String(prompt || "");
        const baseSeed = hashSeed(p);
        const nonce = getSessionNonce();
        const ring = getRing();

        // [ρ] Burst Suppression
        const burst = recentBurst(ring, baseSeed);
        const speedFactor = burst ? 0.5 : 1.0;

        // [ψ] Convergence Memory
        const recurrence = recurrenceCount(ring, baseSeed);
        const converged = recurrence >= CONVERGENCE_THRESHOLD;

        const recent = ring.slice(-RING_LOOKBACK);
        const exactRepeat = recent.some(e => e.h === baseSeed);
        let mutationSalt = nonce >>> 0;
        for (let i = 0; i < recent.length; i++) {
            const e = recent[i];
            if (typeof e.h === "number") mutationSalt ^= Math.imul(e.h, GOLDEN + i);
            if (typeof e.s === "number") mutationSalt ^= e.s;
        }
        mutationSalt = mutationSalt >>> 0;

        let seed = baseSeed;
        if (exactRepeat && !converged) seed = (baseSeed ^ mutationSalt) >>> 0;
        else if (recent.length && !converged) seed = (baseSeed ^ (mutationSalt & 0x0FFFFFFF)) >>> 0;
        // When converged, we deliberately reuse the base seed → identical trace.

        const sh = simhash32(tokeniseForSimhash(p));
        const { entry: nearest, distance } = findNearestSimhash(sh, ring);
        const reuseStructure = converged || (!exactRepeat && nearest && distance <= HAM_CONTINUITY);

        let rand = mulberry32(seed);
        const { weights, workspace, hits } = scoreAffinity(transliterate(p));
        const effectiveWs = workspaceHint && ACTIONS[workspaceHint] ? workspaceHint : workspace;
        const register = pickRegister(rand);

        const recentNouns = recentNounSet(ring);
        let nouns = extractNouns(p, effectiveWs, rand);
        if (!converged) {
            for (let attempt = 0; attempt < 3 && nouns.length > 1; attempt++) {
                if (!nouns.some(n => recentNouns.has(n.toLowerCase()))) break;
                const retry = extractNouns(p + " ".repeat(attempt + 1), effectiveWs, rand);
                if (retry.length) nouns = retry;
            }
        }
        const subject = nouns[0] || null;
        const noun = () => nouns[Math.floor(rand() * nouns.length)];

        const { pool, blended, sources } = buildBlendedPool(weights, rand, register);

        const tier = complexityTier(hits, blended, p);
        let count = reuseStructure && nearest
            ? (function () { const pr = mulberry32(nearest.h); pr(); return 3 + Math.floor(pr() * 3); })()
            : 3 + Math.floor(rand() * 3);
        count = adaptiveLineCount(p, count, tier);

        let chosen = pool.slice(0, count).map(l => l.t.replace(/\{noun\}/g, noun()));

        // [α] Anchor Echo
        let anchor = null;
        if (reuseStructure && nearest && typeof nearest.l === "string") {
            const priorToken = String(nearest.l).split(/\s+/).filter(Boolean).pop() || "";
            if (priorToken.length >= 3) {
                anchor = "Re-entering from prior conclusion on " + priorToken;
                if (chosen.length >= 4) chosen = chosen.slice(0, count - 1);
            }
        }

        // [υ] Cross-Session Echo — reach back to the *oldest* ring entry.
        let echo = null;
        if (!converged && ring.length >= 5) {
            const old = oldestRingEntry(ring);
            if (old && old.ns && old.ns.length) {
                const oldNoun = String(old.ns[0] || "").trim();
                if (oldNoun.length >= 4 && !chosen.some(l => l.toLowerCase().includes(oldNoun.toLowerCase()))) {
                    echo = "Recalling earlier analysis around " + oldNoun;
                }
            }
        }

        // [β] Coherence Guard
        if (chosen.length >= 3) {
            const poolNouns = nouns.slice();
            for (let i = 1; i < chosen.length - 1; i++) {
                if (rand() < COHERENCE_RATE && poolNouns.length) {
                    const prior = poolNouns[Math.floor(rand() * poolNouns.length)];
                    chosen[i] = coherencePrefix(prior) + chosen[i];
                }
            }
        }
        if (anchor) chosen.unshift(anchor);
        if (echo && !converged) chosen.splice(Math.min(2, chosen.length), 0, echo);

        // [η] Verb dedup
        dedupeAdjacentVerbs(chosen);

        // [ι] Anchor persistence
        enforceAnchorPersistence(chosen, subject, rand);

        // [P1] Correction Accordion with [π] Reflexivity
        const correctionCount = converged ? 1 : correctionCountFor(tier);
        const correctionTexts = [];
        const usedPositions = new Set();
        for (let c = 0; c < correctionCount; c++) {
            let pos = 1, attempts = 0;
            do {
                pos = 1 + Math.floor(rand() * Math.max(1, chosen.length - 1));
                attempts++;
            } while (usedPositions.has(pos) && attempts < 12);
            usedPositions.add(pos);

            // [π] Pull the noun from the target line for reflexivity.
            const target = chosen[Math.min(pos, chosen.length - 1)] || "";
            const tw = target.split(/\s+/).filter(w => w.length >= 4 && !STOP.has(w.toLowerCase().replace(/[^a-z]/gi, "")));
            const reflexNoun = tw.length ? tw[Math.floor(rand() * tw.length)] : noun();
            correctionTexts.push({
                pos,
                text: CORRECTIONS[Math.floor(rand() * CORRECTIONS.length)].replace(/\{noun\}/g, reflexNoun)
            });
        }
        correctionTexts.sort((a, b) => b.pos - a.pos);
        for (const c of correctionTexts) chosen.splice(Math.min(c.pos, chosen.length), 0, c.text);
        const correctionSet = new Set(correctionTexts.map(c => c.text));

        // [φ] Gravity well — longest clause lands on a cognitive beat.
        if (!converged) applyGravityWell(chosen);
        // [χ] Register drift — one controlled breach of the register lock.
        if (!converged) applyRegisterDrift(chosen, register, rand, sources, nouns);
        // [κ] Punctuation cascade (last content transform before ring write)
        chosen = punctuateTrace(chosen, rand);

        // [τ] False-Start Beacon — handled at render time, not here; the
        //     prompt flag rides on the result object so begin() can play it.

        // Ring record with timestamp for [ρ]
        const newRing = ring.slice();
        newRing.push({
            h: baseSeed, s: sh, n: count, r: register,
            ws: effectiveWs, c: correctionCount,
            l: chosen[chosen.length - 1] || "",
            ns: nouns.slice(0, 3),
            ts: Date.now()
        });
        setRing(newRing);

        return {
            workspace: effectiveWs, blended, weights, sources, register,
            seed, simhash: sh, continuity: reuseStructure,
            tier, correctionCount,
            burst, converged, speedFactor,
            falseStart: !burst && rand() < FALSE_START_RATE,
            steps: chosen.map((text, i) => ({
                text,
                phase: correctionSet.has(text) ? "correct"
                     : (anchor && i === 0) ? "anchor"
                     : i === 0 ? "init"
                     : "checkpoint"
            }))
        };
    }

    // ═══════════════════════════════════════════════════════════════════
    // 14 · CSS
    // ═══════════════════════════════════════════════════════════════════
    const CSS = `
    .axelr-chain{margin:4px 0 10px;border:1px solid rgba(0,242,254,0.16);border-radius:10px;background:rgba(0,242,254,0.03);font-family:'JetBrains Mono','SF Mono',Menlo,Consolas,monospace;font-size:12.5px;color:var(--text-muted,#94a3b8);overflow:hidden;position:relative;transition:opacity .38s ease,max-height .38s ease}
    .axelr-chain::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(0,242,254,0) 0%,rgba(0,242,254,0.055) 47%,rgba(0,242,254,0.09) 50%,rgba(0,242,254,0.055) 53%,rgba(0,242,254,0) 100%);background-size:100% 220%;animation:chainScan 6.5s linear infinite;mix-blend-mode:screen;opacity:.55}
    .axelr-chain>summary{list-style:none;cursor:pointer;padding:7px 12px;display:flex;align-items:center;gap:8px;user-select:none;font-weight:600;color:var(--accent-glow,#00f2fe);background:rgba(0,242,254,0.05);font-size:12px;position:relative;z-index:1;animation:phosphorFlicker 7s ease-in-out infinite}
    .axelr-chain>summary::-webkit-details-marker{display:none}
    .axelr-chain .chain-caret{display:inline-block;transition:transform .2s ease;font-size:10px;opacity:.8}
    .axelr-chain[open] .chain-caret{transform:rotate(90deg)}
    .axelr-chain .chain-label{letter-spacing:.3px}
    .axelr-chain .chain-angle{opacity:.5;font-weight:400;margin:0 2px}
    .axelr-chain .chain-blend{margin-left:6px;padding:1px 6px;border-radius:4px;background:rgba(139,92,246,0.15);color:#c4b5fd;font-size:10px;font-weight:600;letter-spacing:.4px}
    .axelr-chain .chain-status{margin-left:auto;font-size:10.5px;opacity:.7;font-weight:500;color:var(--text-muted,#94a3b8)}
    .axelr-chain .chain-body{padding:8px 12px 10px;display:flex;flex-direction:column;gap:5px;max-height:260px;overflow-y:auto;position:relative;z-index:1}
    .axelr-chain .chain-line{display:flex;gap:8px;line-height:1.5;opacity:0;animation:chainFadeIn .28s ease forwards}
    .axelr-chain .chain-line .chain-glyph{flex-shrink:0;width:14px;text-align:center;color:var(--accent-glow,#00f2fe);font-weight:700}
    .axelr-chain .chain-line[data-phase="init"] .chain-glyph{color:#22d3ee}
    .axelr-chain .chain-line[data-phase="checkpoint"] .chain-glyph{color:#8b5cf6}
    .axelr-chain .chain-line[data-phase="correct"] .chain-glyph{color:#f59e0b}
    .axelr-chain .chain-line[data-phase="zone-b"] .chain-glyph{color:#06b6d4}
    .axelr-chain .chain-line[data-phase="zone-c"] .chain-glyph{color:#ef4444}
    .axelr-chain .chain-line[data-phase="maintain"] .chain-glyph{color:#64748b}
    .axelr-chain .chain-line[data-phase="anchor"] .chain-glyph{color:#22d3ee}
    .axelr-chain .chain-line[data-phase="phantom"] .chain-glyph{color:#a1a1aa}
    .axelr-chain .chain-line.done .chain-glyph{color:#10b981}
    .axelr-chain .chain-line.done .chain-glyph::before{content:"✓"}
    .axelr-chain .chain-line.done .chain-glyph>span{display:none}
    .axelr-chain .chain-line .chain-text::after{content:"▍";animation:chainCursor .85s steps(2,start) infinite;opacity:.45;margin-left:1px}
    .axelr-chain .chain-line.done .chain-text::after{content:""}
    .axelr-chain .chain-line.phantom-fade{opacity:.4;transition:opacity .4s ease}
    @keyframes chainFadeIn{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:translateY(0)}}
    @keyframes chainCursor{0%,100%{opacity:.12}50%{opacity:.7}}
    @keyframes phosphorFlicker{0%,100%{text-shadow:0 0 0 rgba(0,242,254,0)}43%,47%{text-shadow:0 0 6px rgba(0,242,254,0.55)}44%,46%{text-shadow:0 0 2px rgba(0,242,254,0.15)}74%,76%{text-shadow:0 0 4px rgba(0,242,254,0.35)}}
    @keyframes chainScan{from{background-position:0 -110%}to{background-position:0 210%}}
    .axelr-chain.closing{opacity:0;max-height:34px;margin-bottom:2px}
    .axelr-chain.converged{box-shadow:0 0 24px rgba(16,185,129,0.55);transition:box-shadow .2s ease}
    .axelr-chain .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    @media (prefers-reduced-motion: reduce){
        .axelr-chain::after{display:none}
        .axelr-chain>summary{animation:none}
        .axelr-chain .chain-line{animation:none;opacity:1}
        .axelr-chain .chain-line .chain-text::after{display:none}
        .axelr-chain,.axelr-chain.closing{transition:opacity .2s ease,max-height 0s}
        .axelr-chain .chain-caret{transition:none}
    }
    .axelr-chain.reduced-motion::after{display:none}
    .axelr-chain.reduced-motion>summary{animation:none}
    .axelr-chain.reduced-motion .chain-line{animation:none;opacity:1}
    .axelr-chain.reduced-motion .chain-line .chain-text::after{display:none}
    `;
    function ensureCss() {
        if (document.getElementById("axelr-chain-css")) return;
        const s = document.createElement("style");
        s.id = "axelr-chain-css";
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 15 · VELOCITY
    // ═══════════════════════════════════════════════════════════════════
    function charsetEntropy(s) {
        const seen = new Set(); let mixed = 0;
        for (const c of s) {
            seen.add(c.charCodeAt(0));
            if (/[0-9]/.test(c)) mixed++;
            if (/[A-Z]/.test(c)) mixed++;
        }
        return Math.min(1, (seen.size / Math.max(1, s.length)) * 0.6 + (mixed / Math.max(1, s.length)) * 1.4);
    }
    function clauseCount(s) { return (s.match(/[,;:—–]|\.\s/g) || []).length; }
    function arcFactor(idx, total, phase) {
        if (phase === "correct") return 1.35;
        if (phase === "anchor") return 0.80;
        if (phase === "init") return 0.85;
        if (idx >= total - 1) return 0.90;
        return 1.0;
    }
    function velocityFor(text, phase, idx, total, speedFactor) {
        const base =
            phase === "init" ? 12 : phase === "correct" ? 58 : phase === "anchor" ? 11 :
            phase === "zone-b" ? 52 : phase === "zone-c" ? 44 : phase === "maintain" ? 68 :
            phase === "phantom" ? 40 : 26;
        const lenN = Math.min(1, text.length / 80);
        const entN = charsetEntropy(text);
        const clN = Math.min(1, clauseCount(text) / 3);
        const shape = (typeof idx === "number" && typeof total === "number") ? arcFactor(idx, total, phase) : 1.0;
        const factor = (1 + 0.4 * lenN + 0.3 * entN + 0.5 * clN) * shape;
        const v = base * factor * (typeof speedFactor === "number" ? speedFactor : 1);
        return Math.max(6, Math.min(75, v));
    }

    // ═══════════════════════════════════════════════════════════════════
    // 16 · QWERTY ADJACENT MAP
    // ═══════════════════════════════════════════════════════════════════
    const QWERTY_ADJ = Object.freeze({
        "a":"s","s":"d","d":"f","f":"g","g":"h","h":"j","j":"k","k":"l",
        "q":"w","w":"e","e":"r","r":"t","t":"y","y":"u","u":"i","i":"o","o":"p",
        "z":"x","x":"c","c":"v","v":"b","b":"n","n":"m"
    });

    // ═══════════════════════════════════════════════════════════════════
    // 17 · TYPE-INTO
    // ═══════════════════════════════════════════════════════════════════
    function typeInto(el, text, msPerChar, token) {
        return new Promise(resolve => {
            if (token.cancelled) return resolve();
            if (token.reducedMotion) { el.textContent = text; return resolve(); }

            const pauseAt = new Map();
            const wordRe = /\b([A-Za-z][A-Za-z-]{2,})\b/g;
            let m;
            while ((m = wordRe.exec(text)) !== null) {
                const w = m[1].toLowerCase();
                if (TECH_TERMS.has(w)) pauseAt.set(m.index, 160 + Math.random() * 140);
            }

            // Self-edit OR micro-typo — mutually exclusive.
            let editAt = -1, editBack = 0, editKind = null;
            if (text.length >= 20 && Math.random() < SELF_EDIT_RATE) {
                editAt = Math.floor(text.length * (0.35 + Math.random() * 0.40));
                if (editAt > 6 && editAt < text.length - 6) { editBack = 2 + Math.floor(Math.random() * 3); editKind = "self"; }
                else editAt = -1;
            } else if (text.length >= 15 && Math.random() < MICRO_TYPO_RATE) {
                editAt = Math.floor(text.length * (0.25 + Math.random() * 0.50));
                if (editAt > 4 && editAt < text.length - 4) { editBack = 1; editKind = "typo"; }
                else editAt = -1;
            }

            const segments = [];
            let cursor = 0;
            const boundaryRe = /[,;:—–]|\.\s/g;
            while ((m = boundaryRe.exec(text)) !== null) {
                const end = m.index + m[0].length;
                segments.push(text.slice(cursor, end));
                cursor = end;
            }
            if (cursor < text.length) segments.push(text.slice(cursor));

            let written = "", segIdx = 0, charIdx = 0, globalIdx = 0;
            let editFired = false, backing = false;

            const tick = () => {
                if (token.cancelled) return resolve();
                if (segIdx >= segments.length) return resolve();

                if (editFired && !backing) {
                    backing = true;
                    if (editKind === "typo") {
                        const ch = text.charAt(Math.max(0, globalIdx - 1)).toLowerCase();
                        const adj = QWERTY_ADJ[ch];
                        if (adj) { written = written.slice(0, -1) + adj; el.textContent = written; }
                    }
                    const target = Math.max(0, globalIdx - editBack);
                    const drop = text.slice(target, globalIdx);
                    let backSteps = Math.max(0, written.length - target);
                    const backTick = () => {
                        if (token.cancelled) return resolve();
                        if (backSteps <= 0) {
                            setTimeout(() => {
                                let reIdx = 0;
                                const reTick = () => {
                                    if (token.cancelled) return resolve();
                                    if (reIdx >= drop.length) {
                                        backing = false;
                                        editFired = false; // v4.4 fix — prevent infinite loop
                                        return tick();
                                    }
                                    written += drop.charAt(reIdx++);
                                    el.textContent = written;
                                    setTimeout(reTick, Math.max(30, msPerChar * 1.4));
                                };
                                reTick();
                            }, editKind === "typo" ? 260 : 220);
                            return;
                        }
                        written = written.slice(0, -1);
                        el.textContent = written;
                        backSteps--;
                        setTimeout(backTick, editKind === "typo" ? 55 : 45);
                    };
                    backTick();
                    return;
                }

                const seg = segments[segIdx];
                if (charIdx >= seg.length) {
                    const last = written.charAt(written.length - 1);
                    const pause = last === "—" || last === "–" ? 260
                                : last === "." ? 200
                                : last === "," || last === ";" || last === ":" ? 140 : 70;
                    segIdx++; charIdx = 0;
                    setTimeout(tick, pause);
                    return;
                }
                const pre = pauseAt.get(globalIdx);
                if (pre) { setTimeout(tick, pre); pauseAt.delete(globalIdx); return; }
                if (!editFired && editAt > 0 && globalIdx === editAt) {
                    editFired = true; globalIdx--; setTimeout(tick, 120); return;
                }
                written += seg.charAt(charIdx++);
                globalIdx++;
                el.textContent = written;
                const jitter = msPerChar + (Math.random() * msPerChar * 0.5 - msPerChar * 0.25);
                setTimeout(tick, Math.max(4, jitter));
            };
            tick();
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    // 18 · PUBLIC CONTROLLER
    // ═══════════════════════════════════════════════════════════════════
    function begin(hostEl, prompt, workspaceHint) {
        if (!hostEl) return { complete() {}, cancel() {}, workspace: "core", element: null };
        ensureCss();

        const built = buildSteps(prompt || "", workspaceHint);
        const { workspace, steps, blended, speedFactor, falseStart } = built;
        const reducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

        const root = document.createElement("details");
        root.className = "axelr-chain" + (reducedMotion ? " reduced-motion" : "");
        root.open = true;
        const blendBadge = blended ? '<span class="chain-blend">blended</span>' : '';
        root.innerHTML =
            '<summary>' +
                '<span class="chain-caret">▶</span>' +
                '<span class="chain-label">' +
                    '<span class="chain-angle">&lt;think&gt;</span>Axelr Reasoning Chain<span class="chain-angle">&lt;/think&gt;</span>' +
                    blendBadge +
                '</span>' +
                '<span class="chain-status">initializing…</span>' +
            '</summary>' +
            '<div class="chain-body" role="log" aria-live="off" aria-hidden="true"></div>';

        hostEl.appendChild(root);
        const body = root.querySelector(".chain-body");
        const status = root.querySelector(".chain-status");

        const token = { cancelled: false, reducedMotion };
        const pending = [];
        let completed = false;
        let zoneBTimer = null, zoneCTimer = null, maintainTimer = null;
        let zoneBIndex = 0, zoneCFired = false, maintainActive = false, maintainIdx = 0;

        let statusIdx = 0;
        const nextStatus = () => STATUS_VERBS[(statusIdx++) % STATUS_VERBS.length];

        // [τ] False-Start Beacon — play a phantom first line before real trace.
        let phantomLine = null;
        if (falseStart && !reducedMotion) {
            phantomLine = document.createElement("div");
            phantomLine.className = "chain-line";
            phantomLine.dataset.phase = "phantom";
            phantomLine.innerHTML = '<span class="chain-glyph"><span>›</span></span><span class="chain-text"></span>';
            body.appendChild(phantomLine);
        }

        for (const s of steps) {
            const line = document.createElement("div");
            line.className = "chain-line";
            line.dataset.phase = s.phase;
            line.innerHTML = '<span class="chain-glyph"><span>›</span></span><span class="chain-text"></span>';
            body.appendChild(line);
            pending.push({
                lineEl: line,
                textEl: line.querySelector(".chain-text"),
                text: s.text,
                idx: pending.length,
                total: steps.length,
                msPerChar: velocityFor(s.text, s.phase, pending.length, steps.length, speedFactor)
            });
        }

        function markDone(lineEl, text) {
            lineEl.classList.add("done");
            lineEl.setAttribute("aria-label", text);
        }

        (async () => {
            // [τ] Phantom false-start — types, then fades out.
            if (phantomLine) {
                status.textContent = nextStatus() + "…";
                const pt = phantomLine.querySelector(".chain-text");
                await typeInto(pt, "Reconsidering…", 40, token);
                if (token.cancelled) return;
                phantomLine.classList.add("phantom-fade");
                await new Promise(r => setTimeout(r, 500));
                if (phantomLine.parentNode) phantomLine.remove();
            }
            for (let i = 0; i < pending.length; i++) {
                if (token.cancelled) return;
                const item = pending[i];
                // [BREATH] Every third line, draw a longer pause before typing.
                // Reads as cognition regrouping — not as a network stall.
                const breath = (i > 0 && i % 3 === 0)
                    ? 180 + Math.random() * 220
                    : 0;
                if (breath) await new Promise(r => setTimeout(r, breath));
                if (token.cancelled) return;
                status.textContent = nextStatus() + "…";
                await typeInto(item.textEl, item.text, item.msPerChar, token);
                if (token.cancelled) return;
                markDone(item.lineEl, item.text);
                await new Promise(r => setTimeout(r, (130 + Math.random() * 150) * speedFactor));
            }
            if (token.cancelled) return;
            status.textContent = nextStatus() + "…";
            scheduleZoneB();
        })();

        function scheduleZoneB() {
            if (zoneBIndex >= 3 || token.cancelled) return;
            zoneBTimer = setTimeout(async () => {
                if (token.cancelled) return;
                const zoneBText = ZONE_B_LINES[zoneBIndex % ZONE_B_LINES.length]
                    .replace(/\{noun\}/g, built.steps[0].text.split(" ").pop() || "context");
                const line = document.createElement("div");
                line.className = "chain-line";
                line.dataset.phase = "zone-b";
                line.innerHTML = '<span class="chain-glyph"><span>›</span></span><span class="chain-text"></span>';
                body.appendChild(line);
                status.textContent = nextStatus() + "…";
                const txtEl = line.querySelector(".chain-text");
                await typeInto(txtEl, zoneBText, velocityFor(zoneBText, "zone-b", 0, 0, speedFactor), token);
                if (token.cancelled) return;
                markDone(line, zoneBText);
                zoneBIndex++;
                scheduleZoneB();
                if (zoneBIndex >= 3) scheduleZoneC();
            }, 1800);
        }

        function scheduleZoneC() {
            if (zoneCFired || token.cancelled) return;
            zoneCTimer = setTimeout(async () => {
                if (token.cancelled || zoneCFired) return;
                zoneCFired = true;
                const zoneCText = ZONE_C_LINES[Math.floor(Math.random() * ZONE_C_LINES.length)];
                const line = document.createElement("div");
                line.className = "chain-line";
                line.dataset.phase = "zone-c";
                line.innerHTML = '<span class="chain-glyph"><span>›</span></span><span class="chain-text"></span>';
                body.appendChild(line);
                status.textContent = nextStatus() + "…";
                const txtEl = line.querySelector(".chain-text");
                await typeInto(txtEl, zoneCText, velocityFor(zoneCText, "zone-c", 0, 0, speedFactor), token);
                if (token.cancelled) return;
                markDone(line, zoneCText);
                scheduleMaintenance();
            }, 1200);
        }

        function scheduleMaintenance() {
            if (maintainActive || token.cancelled) return;
            maintainActive = true;
            const tick = async () => {
                if (token.cancelled) return;
                const pool = MAINTENANCE_POOLS[maintainIdx % MAINTENANCE_POOLS.length];
                maintainIdx++;
                const text = pool[Math.floor(Math.random() * pool.length)];
                const line = document.createElement("div");
                line.className = "chain-line";
                line.dataset.phase = "maintain";
                line.innerHTML = '<span class="chain-glyph"><span>›</span></span><span class="chain-text"></span>';
                body.appendChild(line);
                body.scrollTop = body.scrollHeight;
                status.textContent = nextStatus() + "…";
                const txtEl = line.querySelector(".chain-text");
                await typeInto(txtEl, text, velocityFor(text, "maintain", 0, 0, 1.0), token);
                if (token.cancelled) return;
                markDone(line, text);
                const mainLines = body.querySelectorAll('.chain-line[data-phase="maintain"]');
                if (mainLines.length > 6) mainLines[0].remove();
                maintainTimer = setTimeout(tick, 2400 + Math.random() * 1200);
            };
            maintainTimer = setTimeout(tick, 2200);
        }

        // SR announcement lives on document.body so it survives accordion removal.
        function announce(summary) {
            const sr = document.createElement("div");
            sr.className = "sr-only";
            sr.setAttribute("role", "status");
            sr.setAttribute("aria-live", "polite");
            sr.textContent = summary;
            sr.style.cssText = "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;";
            document.body.appendChild(sr);
            setTimeout(() => { if (sr.parentNode) sr.parentNode.removeChild(sr); }, 10000);
        }

        function finish(label) {
            if (completed) return;
            completed = true;
            token.cancelled = true;
            if (zoneBTimer) clearTimeout(zoneBTimer);
            if (zoneCTimer) clearTimeout(zoneCTimer);
            if (maintainTimer) clearTimeout(maintainTimer);

            for (const item of pending) {
                if (!item.lineEl.classList.contains("done")) {
                    item.textEl.textContent = item.text;
                    markDone(item.lineEl, item.text);
                }
            }
            body.querySelectorAll(".chain-line:not(.done)").forEach(l => {
                const t = l.querySelector(".chain-text");
                if (t && t.textContent) markDone(l, t.textContent);
            });

            status.textContent = label || "done";
            const stepCount = body.querySelectorAll(".chain-line").length;
            announce(`Reasoning chain complete: ${stepCount} steps, resolved to ${workspace} workspace.`);

            // [σ] Convergence Flash
            if (label === "streaming" && !reducedMotion) {
                root.classList.add("converged");
                setTimeout(() => root.classList.remove("converged"), 220);
            }

            requestAnimationFrame(() => {
                root.open = false;
                root.classList.add("closing");
                setTimeout(() => {
                    if (root.parentNode) root.parentNode.removeChild(root);
                }, reducedMotion ? 120 : 420);
            });
        }

        return {
            workspace, blended,
            register: built.register,
            continuity: built.continuity,
            correctionCount: built.correctionCount,
            tier: built.tier,
            burst: built.burst,
            converged: built.converged,
            reducedMotion,
            element: root,
            complete: label => finish(label || "done"),
            cancel:   ()    => finish("cancelled")
        };
    }

    // ═══════════════════════════════════════════════════════════════════
    // 19 · PUBLIC SURFACE
    // ═══════════════════════════════════════════════════════════════════
    window.Axelr.AxelrReasoning = {
        begin, buildSteps, scoreAffinity, hashSeed, simhash32, hamming32, transliterate,
        recentNounSet, oldestRingEntry, recentBurst, recurrenceCount,
        coherencePrefix, arcFactor, adaptiveLineCount, dedupeAdjacentVerbs,
        enforceAnchorPersistence, punctuateTrace, applyGravityWell, applyRegisterDrift,
        driftRegister, driftPool,
        INTERTWINE_THRESHOLD, RING_LOOKBACK, NOVELTY_WINDOW, COHERENCE_RATE,
        SELF_EDIT_RATE, MICRO_TYPO_RATE, DRIFT_RATE, FALSE_START_RATE,
        BURST_WINDOW_MS, CONVERGENCE_THRESHOLD,
        _LEX: LEX, _OP_MAP: OPERATOR_MAP, _HINGLISH: HINGLISH_MAP,
        _ZONE_B: ZONE_B_LINES, _ZONE_C: ZONE_C_LINES,
        _MAINTENANCE: MAINTENANCE_POOLS, _STATUS_VERBS: STATUS_VERBS
    };
})();