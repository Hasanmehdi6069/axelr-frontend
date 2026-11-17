/*!
 * axelr-bench.js — Perf benchmarks for AXELR Elite.
 * v3.2.0: correct APIs, real SLA gate, p99 SLA enforcement.
 */
(function (global) {
    "use strict";
    if (!global.AxelrInput || !global.AxelrInput.READY) {
        console.error("axelr-bench: load axelr-core.js first");
        if (typeof process !== "undefined") process.exit(1);
        return;
    }
    const NS = global.AxelrInput;

    function bench(name, setupFn, iterFn, iterations = 10000) {
        const ctx = setupFn();
        const times = new Float64Array(iterations);
        let totalMs = 0;
        for (let i = 0; i < iterations; i++) {
            const t0 = performance.now();
            iterFn(ctx, i);
            const dt = performance.now() - t0;
            times[i] = dt;
            totalMs += dt;
        }
        times.sort();
        const p50 = times[Math.floor(iterations * 0.5)];
        const p95 = times[Math.floor(iterations * 0.95)];
        const p99 = times[Math.floor(iterations * 0.99)];
        const ops = iterations / (totalMs / 1000);
        return { name, p50, p95, p99, ops, iterations };
    }
    function fmt(ms) {
        if (ms < 1) return (ms * 1000).toFixed(1) + " µs";
        return ms.toFixed(2) + " ms";
    }
    function report(rows) {
        console.log("\n╔═══════════════════════════════════════════════════════════════════╗");
        console.log("║  AXELR Performance Benchmarks                                     ║");
        console.log("╚═══════════════════════════════════════════════════════════════════╝\n");
        console.log("  " + "benchmark".padEnd(32) + "p50".padStart(10) + "p95".padStart(10) + "p99".padStart(10) + "ops/sec".padStart(14));
        console.log("  " + "─".repeat(78));
        for (const r of rows) {
            console.log("  " + r.name.padEnd(32) + fmt(r.p50).padStart(10) + fmt(r.p95).padStart(10) + fmt(r.p99).padStart(10) + Math.round(r.ops).toLocaleString().padStart(14));
        }
        console.log("");
    }

    const rows = [];
    rows.push(bench("TokenRing.push (short)", () => new NS.TokenRing(256), (r, i) => r.push("word" + (i % 100)), 50000));
    rows.push(bench("TokenRing.push (medium)", () => new NS.TokenRing(256), (r) => r.push("hello world this is a test sentence"), 50000));
    rows.push(bench("TokenRing.pop", () => {
        const r = new NS.TokenRing(256);
        for (let i = 0; i < 200; i++) r.push("x" + i);
        return r;
    }, (r) => { if (r.size() > 0) r.pop(); else r.push("refill"); }, 50000));
    rows.push(bench("TokenRing.join (10 tokens)", () => {
        const r = new NS.TokenRing(256);
        for (let i = 0; i < 10; i++) r.push("token" + i);
        return r;
    }, (r) => r.join(" "), 20000));
    rows.push(bench("IntentFilter.applyFinal", () => new NS.IntentFilter(new NS.TokenRing(256)),
        (f, i) => f.applyFinal("hello world " + (i % 100)), 10000));

    const symspell = new NS.SymSpell(2);
    symspell.ensureBuilt();
    rows.push(bench("SymSpell.lookup (exact)", () => symspell, (s) => s.lookup("hello"), 20000));
    rows.push(bench("SymSpell.lookup (1-edit)", () => symspell, (s) => s.lookup("hellp"), 5000));
    rows.push(bench("SymSpell.lookup (2-edit miss)", () => symspell, (s) => s.lookup("recieve"), 2000));

    // SymSpell performance note: "2-edit miss" is ~10× slower than exact lookup.
    // This is expected: delete-edit candidate generation is O(n²) in word length.
    // Do NOT "optimize" this away; it is the algorithm's design.

    rows.push(bench("Metaphone (cached)", () => ({}), () => NS.metaphone("receive"), 50000));
    rows.push(bench("Polish (short)", () => ({}), () => NS.polish("hello world"), 10000));
    rows.push(bench("Polish (long)", () => ({}), () => NS.polish("the quick brown fox jumps over the lazy dog and then runs away into the forest"), 5000));

    rows.push(bench("KVCache.set", () => new NS.KVCache(128), (c, i) => c.set("k" + (i % 100), i), 50000));
    rows.push(bench("KVCache.get (hit)", () => {
        const c = new NS.KVCache(128);
        for (let i = 0; i < 100; i++) c.set("k" + i, i);
        return c;
    }, (c, i) => c.get("k" + (i % 100)), 50000));

    rows.push(bench("levenshtein (10 chars)", () => ({}), () => NS.levenshtein("abcdefghij", "abcdefghik", 2), 10000));

    if (NS.CharCNN) {
        const cnn = new NS.CharCNN({ gpu: false });
        rows.push(bench("CharCNN.score", () => cnn, (c) => c.score("hello"), 20000));
        rows.push(bench("CharCNN.suggest", () => cnn, (c) => c.suggest("helloo", -5.0, 1), 500));
        if (cnn.dispose) cnn.dispose();
    }

    if (NS.BBE) {
        const bbe = new NS.BBE(5);
        bbe.addModel({ predict: () => [
            { word: "receive", score: 0.9 },
            { word: "recieve", score: 0.3 }
        ] }, 1.0);
        bbe.addModel({ predict: () => [
            { word: "receive", score: 0.85 },
            { word: "believe", score: 0.5 }
        ] }, 1.0);
        rows.push(bench("BBE.predict (2 models)", () => bbe, (b) => b.predict("recieve", 3), 2000));
    }

    rows.push(bench("Full pipeline (mock ASR)", () => {
        return {
            ring: new NS.TokenRing(256),
            intent: new NS.IntentFilter(new NS.TokenRing(256)),
            symspell
        };
    }, (ctx) => {
        const tokens = ["hello", "world", "this", "is", "a", "test"];
        for (const t of tokens) ctx.intent.applyFinal(t);
        NS.polish(ctx.intent.ring.join());
    }, 2000));

    // SLA budgets: p99 latency must be <= value (ms) on CI hardware
    const SLA = {
        "TokenRing.push (short)": 0.5,        // Fast path: in-memory ring append
        "TokenRing.push (medium)": 1.0,       // Includes string copy overhead
        "TokenRing.pop": 0.5,                 // Ring buffer pop + size check
        "TokenRing.join (10 tokens)": 1.0,     // String join for final output
        "IntentFilter.applyFinal": 0.5,       // Per-token intent matching
        "SymSpell.lookup (exact)": 0.5,       // Hash table lookup, no edit distance
        "SymSpell.lookup (1-edit)": 2.0,      // Damerau-Levenshtein search, 1 edit
        "SymSpell.lookup (2-edit miss)": 5.0, // Full 2-edit search, no match found
        "Metaphone (cached)": 0.2,             // Cached phonetic hash lookup
        "Polish (short)": 2.0,                 // Post-processing for short utterances
        "Polish (long)": 5.0,                  // Post-processing for long sentences
        "KVCache.set": 0.1,                   // LRU cache insert + eviction check
        "KVCache.get (hit)": 0.1,             // Cache hit lookup + promotion
        "levenshtein (10 chars)": 0.5,        // Edit distance calculation
        "CharCNN.suggest": 8.0,                // Neural correction candidate generation
        "BBE.predict (2 models)": 0.5          // Bayesian model ensemble scoring
    };
    let slaFails = 0;
    for (const r of rows) {
        if (SLA[r.name] !== undefined && r.p99 > SLA[r.name]) {
            console.error(`  ✗ SLA FAIL: ${r.name} p99=${r.p99.toFixed(3)}ms > budget ${SLA[r.name]}ms`);
            slaFails++;
        }
    }
    if (slaFails > 0) {
        console.error(`\n❌ ${slaFails} SLA violations — build should not ship.`);
        if (typeof process !== "undefined") process.exitCode = 1;
    } else {
        console.log(`\n✅ All SLA budgets met.`);
    }
    report(rows);
})(typeof window !== "undefined" ? window : globalThis);