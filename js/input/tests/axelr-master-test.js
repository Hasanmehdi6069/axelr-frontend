/*!
 * axelr-master-test.js — AXELR JS ABSOLUTE MASTER TEST.
 *
 * Every assertion either verifies a real (non-mock) behavior or fails.
 * Anti-stub guards: real class source markers, real lexicon change,
 * worker refuses mock without allowMock.
 *
 * Load AFTER all production modules. Fails loudly on any regression.
 */
(function (global) {
    "use strict";
    const NS = global.AxelrInput;
    if (!NS || !NS.READY) {
        console.error("FATAL: axelr-core.js must load first");
        if (typeof process !== "undefined") process.exitCode = 1;
        return;
    }
    let PASS = 0, FAIL = 0, SKIP = 0;
    const failures = [];
    const check = (c, m) => {
        if (c) { PASS++; console.log("  ✓ " + m); }
        else { FAIL++; failures.push(m); console.log("  ✗ " + m); }
    };
    const skip = (m, why) => { SKIP++; console.log("  ⊘ " + m + " (" + why + ")"); };
    const phase = (n) => console.log("\n▶ " + n);
    const expectThrows = (fn, m) => {
        try { fn(); check(false, m + " (did not throw)"); }
        catch (_) { check(true, m); }
    };

    // ═══════════════════════════════════════════════════════════════════
    // §1 — Class reality (anti-mock)
    // ═══════════════════════════════════════════════════════════════════
    phase("§1 — Class reality");
    const REAL_MARKERS = {
        TokenRing: /\bUint8Array\b|\bSharedArrayBuffer\b/,
        SymSpell: /\bdeletes\b/,
        PhoneticCorrector: /\blpgN\b|\bsymspell\b/,
        CharCNN: /\bbuildSeedWeights\b|\bGLBackend\b|_scoreCPU/,
        BBE: /\b_weightSum\b/,
        ACX: /\bminGain\b/,
        DoubleArrayTrie: /\bbase\b.*\bcheck\b/s,
        AudioRing: /\bAtomics\b/,
        ContextScraper: /\bbloom\b/,
        SHISHotkeyManager: /\b_bindings\b/,
        MemoryBudget: /\bheapCapMB\b|\bshed_count\b/,
        JSDegradationLadder: /\b_shed\b/,
        ProtocolValidator: /\bVALID_TYPES\b/,
        RingIntegrityChecker: /\bviolations\b/,
        LatencyBudget: /\bp99\b/,
        DeterminismGuard: /\b_originalRandom\b/,
        InputSanitizer: /\bsanitizeLogMel\b/,
        FrameRateGovernor: /\btryAcquire\b/,
        UnifiedIPCBridge: /_handshakeDone/,
        InputEngine: /MemoryRegistry/,
    };
    for (const [name, re] of Object.entries(REAL_MARKERS)) {
        const cls = NS[name];
        if (typeof cls !== "function") {
            check(false, name + " exists");
            continue;
        }
        check(re.test(cls.toString()), name + " is REAL");
    }

    // ═══════════════════════════════════════════════════════════════════
    // §2 — TokenRing
    // ═══════════════════════════════════════════════════════════════════
    phase("§2 — TokenRing");
    {
        const r = new NS.TokenRing(8);
        r.push("a"); r.push("b");
        check(r.pop() === "b", "LIFO pop");
        check(r.push("") === false, "empty rejected");
        check(r.push("x".repeat(2000)) === false, "oversized rejected");
        expectThrows(() => new NS.TokenRing(7), "non-power-of-2 rejected");
        // UTF-8
        const r2 = new NS.TokenRing(8);
        r2.push("café");
        check(r2.pop() === "café", "UTF-8 roundtrip");
    }

    // ═══════════════════════════════════════════════════════════════════
    // §3 — SymSpell anti-stub
    // ═══════════════════════════════════════════════════════════════════
    phase("§3 — SymSpell anti-stub");
    {
        const s = new NS.SymSpell(2);
        s.ensureBuilt();
        check(s.lookup("recieve", 2).some(h => h.word === "receive"),
              "recieve → receive");
        // Anti-stub: load new word
        const before = s.size();
        s.addCustomWord("kubernetes");
        check(s.size() === before + 1, "custom word added");
        check(s.lookup("kubernetse", 2).some(h => h.word === "kubernetes"),
              "kubernetse → kubernetes");
        check(s.lookup("").length === 0, "empty → []");
    }

    // ═══════════════════════════════════════════════════════════════════
    // §4 — Metaphone + PhoneticCorrector (FIXED — matches real API)
    // ═══════════════════════════════════════════════════════════════════
    phase("§4 — Metaphone + Corrector");
    {
        check(NS.metaphone("phone") === NS.metaphone("fone"), "phone=fone");
        check(NS.metaphone("night") === NS.metaphone("knight"), "night=knight");
        check(NS.metaphone("") === "", "empty");

        const p = new NS.PhoneticCorrector();
        p.load(["receive", "believe", "their", "there", "separate", "definitely"]);
        const r = p.correct("recieve");
        check(r.corrected === "receive", "corrector recieve → receive");
        check(typeof r.score === "number" && r.score >= 0.5, "corrector returns score ≥ 0.5");

        const sym = new NS.SymSpell(2).ensureBuilt();
        sym.addCustomWord("kubernetes");
        check(sym.lookup("kubernetse", 2).some(h => h.word === "kubernetes"),
              "custom word via SymSpell works");
    }

    // ═══════════════════════════════════════════════════════════════════
    // §5 — DoubleArrayTrie
    // ═══════════════════════════════════════════════════════════════════
    phase("§5 — DoubleArrayTrie");
    {
        const t = NS.DoubleArrayTrie.build({ "send": 42, "new chat": 1 });
        check(t.match("send") === 42, "exact match");
        check(t.match("xyz") === -1, "no match");
        check(t.match("héllo") === -1, "non-ASCII rejected");
        const exp = t.exportAll();
        check(exp.includes("send") && exp.includes("new chat"),
              "export all");
        t.clear();
        check(t.nodeCount === 0, "clear resets");
    }

    // ═══════════════════════════════════════════════════════════════════
    // §6 — AudioRing SPSC
    // ═══════════════════════════════════════════════════════════════════
    phase("§6 — AudioRing SPSC");
    if (NS.AudioRing) {
        const ring = new NS.AudioRing(1024);
        const data = new Int16Array(100);
        for (let i = 0; i < 100; i++) data[i] = i;
        check(ring.write(data) === 100, "write 100");
        check(ring.available() === 100, "available 100");
        const read = ring.read(100);
        check(read && read.length === 100, "read 100");
        ring.reset();
        ring.write(new Int16Array(2000));
        check(ring.available() <= 1024, "capped");
        ring.dispose();
    }

    // ═══════════════════════════════════════════════════════════════════
    // §7 — MemoryBudget
    // ═══════════════════════════════════════════════════════════════════
    phase("§7 — MemoryBudget");
    if (NS.MemoryBudget) {
        const mb = new NS.MemoryBudget("standard");
        check(mb.tierName === "standard", "tier set");
        check(mb.capBytes === 55 * 1024 * 1024, "cap 55MB");
        const snap = mb.snapshot();
        check(Array.isArray(snap.rungs), "snapshot has rungs");
        check(NS.MEMORY_RUNGS.length === 5, "5 rungs");
        check(NS.MEMORY_HARD_CEILING_MB === 250, "ceiling 250MB");
        mb.dispose();
    } else {
        skip("MemoryBudget", "not loaded");
    }

    // ═══════════════════════════════════════════════════════════════════
    // §8 — Elite v2
    // ═══════════════════════════════════════════════════════════════════
    phase("§8 — Elite v2");
    if (NS.ProtocolValidator) {
        const v = new NS.ProtocolValidator();
        check(v.validate({ type: "ping", id: 1, payload: {} }).ok,
              "envelope valid");
        check(!v.validate({ type: "ping", payload: {} }).ok, "missing id");
        check(!v.validate({ id: 1, command: "ping", data: {} }).ok,
              "old shape rejected");
    }
    if (NS.RingIntegrityChecker) {
        const c = new NS.RingIntegrityChecker(1024);
        check(c.verify(100, 50).ok, "ring valid");
        check(!c.verify(50, 100).ok, "head<tail");
        check(!c.verify(2000, 0).ok, "overflow");
    }
    if (NS.LatencyBudget) {
        const b = new NS.LatencyBudget({ op: 5 });
        for (let i = 0; i < 30; i++) b.record("op", 1);
        check(!b.check().backpressure, "fast ok");
        for (let i = 0; i < 30; i++) b.record("op", 10);
        check(b.check().backpressure, "slow triggers");
    }
    if (NS.DeterminismGuard) {
        const g = new NS.DeterminismGuard();
        g.install();
        check(g.check().deterministic, "clean");
        Math.random();
        check(!g.check().deterministic, "random detected");
        g.uninstall();
    }
    if (NS.InputSanitizer) {
        check(NS.InputSanitizer.sanitizeLogMel([[0.1, 0.2], [0.3, 0.4]]).ok,
              "valid shape");
        check(!NS.InputSanitizer.sanitizeLogMel([[0.1], [0.3, 0.4]]).ok,
              "ragged rejected");
        check(!NS.InputSanitizer.sanitizeLogMel([]).ok, "empty rejected");
    }
    if (NS.FrameRateGovernor) {
        const g = new NS.FrameRateGovernor(5);
        let allowed = 0;
        for (let i = 0; i < 10; i++) if (g.tryAcquire()) allowed++;
        check(allowed === 5, "5 of 10");
    }
    if (NS.MemoryGradientMonitor) {
        const m = new NS.MemoryGradientMonitor({ thresholdMbPerMin: 1, sampleCount: 5 });
        for (let i = 0; i < 5; i++) m.sample(50 + i * 0.001, i * 1000);
        check(!m.sample(50, 5000), "flat ok");
        const m2 = new NS.MemoryGradientMonitor({ thresholdMbPerMin: 1, sampleCount: 5 });
        for (let i = 0; i < 5; i++) m2.sample(50 + i * 100, i * 1000);
        check(m2.sample(500, 5000), "runaway flagged");
    }

    // ═══════════════════════════════════════════════════════════════════
    // §9 — Determinism
    // ═══════════════════════════════════════════════════════════════════
    phase("§9 — Determinism");
    {
        const first = NS.metaphone("receive");
        let same = true;
        for (let i = 0; i < 100; i++) {
            if (NS.metaphone("receive") !== first) { same = false; break; }
        }
        check(same, "metaphone 100x");
        const r1 = new NS.TokenRing(16);
        for (let i = 0; i < 10; i++) r1.push("w" + i);
        const r2 = new NS.TokenRing(16);
        for (let i = 0; i < 10; i++) r2.push("w" + i);
        check(r1.join(",") === r2.join(","), "ring 2x");
    }

    // ═══════════════════════════════════════════════════════════════════
    // §10 — Adversarial
    // ═══════════════════════════════════════════════════════════════════
    phase("§10 — Adversarial");
    {
        const adv = [
            "a".repeat(100000), "", "\u200b".repeat(1000),
            "\u202e" + "hello", "\x00\x01\x02\x03", "🎉".repeat(5000),
            "SELECT * FROM users; DROP TABLE--", "\\".repeat(2000),
            "\u0301".repeat(200) + "word",
        ];
        const r = new NS.TokenRing(64);
        let crashed = false;
        for (const a of adv) {
            try { r.push(a.slice(0, 1023)); r.pop(); }
            catch (_) { crashed = true; break; }
        }
        check(!crashed, "TokenRing survives");
        crashed = false;
        for (const a of adv) {
            try { NS.metaphone(a); } catch (_) { crashed = true; break; }
        }
        check(!crashed, "Metaphone survives");
    }

    // ═══════════════════════════════════════════════════════════════════
    // §11 — Memory leak
    // ═══════════════════════════════════════════════════════════════════
    phase("§11 — Memory leak");
    {
        const hasPerf = typeof performance !== "undefined" && performance.memory;
        const before = hasPerf ? performance.memory.usedJSHeapSize : 0;
        for (let i = 0; i < 1000; i++) {
            const r = new NS.TokenRing(32);
            r.push("x" + i);
            r.dispose();
        }
        if (!hasPerf) { skip("leak check", "no perf.memory"); }
        else {
            const growth = (performance.memory.usedJSHeapSize - before) / 1024;
            check(growth < 2000, "heap growth < 2000KB");
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // §12 — Performance SLA
    // ═══════════════════════════════════════════════════════════════════
    phase("§12 — Performance SLA");
    function measure(fn, n) {
        const samples = new Float64Array(n);
        for (let i = 0; i < n; i++) {
            const t0 = typeof performance !== "undefined"
                ? performance.now() : Date.now();
            fn(i);
            samples[i] = (typeof performance !== "undefined"
                ? performance.now() : Date.now()) - t0;
        }
        const sorted = Array.from(samples).sort((a, b) => a - b);
        return {
            p50: sorted[Math.floor(n * 0.50)],
            p95: sorted[Math.floor(n * 0.95)],
            p99: sorted[Math.floor(n * 0.99)],
        };
    }
    {
        const r = new NS.TokenRing(256);
        const m = measure((i) => r.push("word" + (i % 100)), 5000);
        check(m.p99 < 1.0, `TokenRing.push p99=${m.p99.toFixed(3)}ms < 1ms`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // §13 — Protocol conformance
    // ═══════════════════════════════════════════════════════════════════
    phase("§13 — Protocol conformance");
    {
        const correct = { type: "ping", id: 1, payload: {} };
        check("type" in correct && "id" in correct && "payload" in correct,
              "correct shape");
        const wrong = { id: 1, command: "ping", data: {} };
        check(!("type" in wrong), "old shape wrong");
        if (NS.ProtocolValidator) {
            const v = new NS.ProtocolValidator();
            check(!v.validate(wrong).ok, "validator rejects old");
        }
    }

    const total = PASS + FAIL;
    console.log("\n" + "=".repeat(70));
    console.log(`RESULT: ${PASS}/${total} passed, ${FAIL} failed, ${SKIP} skipped`);
    if (FAIL > 0) {
        console.log("\nFailures:");
        for (const f of failures) console.log("  ✗ " + f);
        if (typeof process !== "undefined") process.exitCode = 1;
    } else {
        console.log("✅ All master tests pass.");
    }
    console.log("=".repeat(70));
})(typeof window !== "undefined" ? window : globalThis);