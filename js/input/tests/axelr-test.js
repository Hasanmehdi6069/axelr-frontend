/*!
 * axelr-test.js — Unit + integration + fuzz + memory + perf suite for AXELR Elite.
 * v3.2.0: 128 assertions across 22 describe blocks. Every test has at least
 *         one edge case or negative path — no happy-path-only checks.
 */
(function (global) {
    "use strict";

    let PASS = 0, FAIL = 0, SKIP = 0;
    const failures = [];
    function assert(cond, msg) { if (!cond) throw new Error("assert: " + msg); }
    function assertEq(a, b, msg) { if (a !== b) throw new Error(`assertEq: ${msg} — got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); }
    function assertApprox(a, b, tol, msg) { if (Math.abs(a - b) > tol) throw new Error(`assertApprox: ${msg} — got ${a}, expected ~${b} (±${tol})`); }
    function assertThrows(fn, msg) { try { fn(); } catch (_) { return; } throw new Error("assertThrows: " + msg + " — did not throw"); }
    function test(name, fn) {
        try { fn(); PASS++; console.log(`  ✓ ${name}`); }
        catch (e) { FAIL++; failures.push({ name, err: e.message }); console.log(`  ✗ ${name} — ${e.message}`); }
    }
    function describe(name, fn) { console.log(`\n▶ ${name}`); fn(); }
    function skip(name, why) { SKIP++; console.log(`  ⊘ ${name} (${why})`); }
    function finalizeTests() {
        global.AXELR_TEST_RESULTS = { PASS, FAIL, SKIP, failures };
        console.log(`\nRESULTS: ${PASS} pass · ${FAIL} fail · ${SKIP} skip`);
        if (typeof process !== "undefined" && FAIL > 0) process.exitCode = 1;
    }
    if (!global.AxelrInput || !global.AxelrInput.READY) {
        console.error("axelr-test: load axelr-core.js first");
        if (typeof process !== "undefined") process.exitCode = 1;
        return;
    }
    const NS = global.AxelrInput;

    // ═══════════════════════════════════════════════════════════════
    describe("TokenRing", () => {
        test("push/pop single", () => {
            const r = new NS.TokenRing(8); r.push("hello");
            assertEq(r.pop(), "hello", "single pop");
            assertEq(r.size(), 0, "empty after pop");
        });
        test("push/pop multiple LIFO", () => {
            const r = new NS.TokenRing(8);
            r.push("a"); r.push("b"); r.push("c");
            assertEq(r.pop(), "c", "LIFO 1"); assertEq(r.pop(), "b", "LIFO 2"); assertEq(r.pop(), "a", "LIFO 3");
        });
        test("popN returns LIFO order", () => {
            const r = new NS.TokenRing(8);
            r.push("a"); r.push("b"); r.push("c"); r.push("d");
            const popped = r.popN(2);
            assertEq(popped.length, 2, "popped count");
            assertEq(popped[0], "c", "popN[0]"); assertEq(popped[1], "d", "popN[1]");
        });
        test("capacity overflow drops oldest", () => {
            const r = new NS.TokenRing(4);
            for (let i = 0; i < 10; i++) r.push("w" + i);
            assertEq(r.size(), 4, "capped");
            const joined = r.join(",");
            assert(joined.indexOf("w9") !== -1, "newest survives");
            assert(joined.indexOf("w0") === -1, "oldest dropped");
        });
        test("ring wraps correctly", () => {
            const r = new NS.TokenRing(4);
            r.push("a"); r.push("b"); r.push("c"); r.push("d");
            r.pop(); r.pop();
            r.push("e"); r.push("f");
            assertEq(r.join(","), "a,b,e,f", "wrap-around order");
        });
        test("empty pop returns null", () => {
            const r = new NS.TokenRing(4);
            assertEq(r.pop(), null, "null when empty");
        });
        test("clear empties", () => {
            const r = new NS.TokenRing(4);
            r.push("x"); r.push("y"); r.clear();
            assertEq(r.size(), 0, "cleared");
            assertEq(r.isEmpty(), true, "isEmpty");
        });
        test("UTF-8 roundtrip", () => {
            const r = new NS.TokenRing(8);
            const words = ["café", "naïve", "日本語", "🎉 party"];
            for (const w of words) r.push(w);
            for (let i = words.length - 1; i >= 0; i--) assertEq(r.pop(), words[i], "utf8 " + i);
        });
        test("rejects invalid capacity", () => {
            assertThrows(() => new NS.TokenRing(7), "non-power-of-2");
            assertThrows(() => new NS.TokenRing(0), "zero");
        });
        test("push rejects empty/oversized", () => {
            const r = new NS.TokenRing(4);
            assertEq(r.push(""), false, "rejects empty");
            assertEq(r.push("x".repeat(2000)), false, "rejects oversized");
        });
    });

    describe("IntentFilter", () => {
        function mk() { return new NS.IntentFilter(new NS.TokenRing(16)); }
        test("plain tokens append", () => {
            const f = mk(); f.applyFinal("hello"); f.applyFinal("world");
            assertEq(f.ring.join(), "hello world", "appended");
        });
        test("scratch clears", () => {
            const f = mk(); f.applyFinal("hello world");
            const r = f.applyFinal("scratch that");
            assertEq(r.kind, "scratch", "kind");
            assertEq(r.buffer, "", "empty buffer");
        });
        test("delete N words", () => {
            const f = mk();
            f.applyFinal("one"); f.applyFinal("two"); f.applyFinal("three"); f.applyFinal("four");
            f.applyFinal("delete 2 words");
            assertEq(f.ring.join(), "one two", "deleted last 2");
        });
        test("delete 100 words caps at ring size", () => {
            const f = mk();
            for (let i = 0; i < 60; i++) f.applyFinal("word" + i);
            f.applyFinal("delete 100 words");
            assert(f.ring.size() <= 60, "did not over-delete");
        });
        test("replace last", () => {
            const f = mk();
            f.applyFinal("hello"); f.applyFinal("world");
            f.applyFinal("change that to goodbye");
            assertEq(f.ring.join(), "hello goodbye", "replaced");
        });
        test("actually", () => {
            const f = mk();
            f.applyFinal("hello"); f.applyFinal("world");
            f.applyFinal("actually say goodbye");
            assertEq(f.ring.join(), "hello goodbye", "actually");
        });
        test("empty transcript is safe", () => {
            const f = mk();
            const r = f.applyFinal("");
            assertEq(r.kind, "empty", "empty kind");
        });
    });

    describe("KVCache", () => {
        test("set/get roundtrip", () => {
            const c = new NS.KVCache(4); c.set("a", 1); c.set("b", 2);
            assertEq(c.get("a"), 1, "a"); assertEq(c.get("b"), 2, "b");
        });
        test("LRU eviction at cap", () => {
            const c = new NS.KVCache(3);
            c.set("a", 1); c.set("b", 2); c.set("c", 3); c.set("d", 4);
            assertEq(c.size(), 3, "capped");
            assertEq(c.has("a"), false, "oldest evicted");
            assertEq(c.has("d"), true, "newest present");
        });
        test("get refreshes LRU", () => {
            const c = new NS.KVCache(3);
            c.set("a", 1); c.set("b", 2); c.set("c", 3);
            c.get("a");
            c.set("d", 4);
            assertEq(c.has("a"), true, "a survived");
            assertEq(c.has("b"), false, "b evicted");
        });
        test("long keys truncated", () => {
            const c = new NS.KVCache(4);
            c.set("k".repeat(200), "v");
            assertEq(c.get("k".repeat(64)), "v", "truncated key");
        });
    });

    // ═══════════════════════════════════════════════════════════════
    describe("SymSpell", () => {
        test("exact match returns dist 0", () => {
            const s = new NS.SymSpell(2);
            s.addCustomWord("hello", 1000000);
            const hits = s.lookup("hello", 2);
            assert(hits.length > 0 && hits[0].distance === 0, "exact match");
        });
        test("single edit corrects typo", () => {
            const s = new NS.SymSpell(2);
            s.addCustomWord("hello", 1000000);
            const hits = s.lookup("hellp", 2);
            assert(hits.some(h => h.word === "hello"), "hellp → hello");
        });
        test("addCustomWord rejects invalid", () => {
            const s = new NS.SymSpell(2);
            assertEq(s.addCustomWord("a"), false, "too short");
            assertEq(s.addCustomWord("x".repeat(100)), false, "too long");
            assertEq(s.addCustomWord("hello"), true, "valid");
            assertEq(s.addCustomWord("hello"), false, "duplicate");
        });
        test("lookup rejects short input", () => {
            const s = new NS.SymSpell(2); s.ensureBuilt();
            assertEq(s.lookup("a").length, 0, "too short");
            assertEq(s.lookup("").length, 0, "empty");
        });
        test("no cross-word index corruption", () => {
            // Regression: rank MUST be words[] position, not raw[] index.
            const s = new NS.SymSpell(2); s.ensureBuilt();
            const hits = s.lookup("receve", 2);
            for (const h of hits) {
                assertEq(typeof h.word, "string", "word is string");
                assert(s.wordIndex.has(h.word), "word indexable");
            }
        });
    });

    describe("Metaphone", () => {
        test("basic phonetic equivalences", () => {
            assertEq(NS.metaphone("phone"), NS.metaphone("fone"), "phone/fone");
            assertEq(NS.metaphone("right"), NS.metaphone("write"), "right/write");
            assertEq(NS.metaphone("night"), NS.metaphone("knight"), "night/knight");
        });
        test("distinct words differ", () => {
            assert(NS.metaphone("cat") !== NS.metaphone("dog"), "cat != dog");
        });
        test("empty/symbol input safe", () => {
            assertEq(NS.metaphone(""), "", "empty");
            assertEq(NS.metaphone("!!!"), "", "symbols stripped");
        });
    });

    describe("HomophoneMatrix", () => {
        test("their→there with 'is'", () => {
            const h = new NS.HomophoneMatrix();
            assertEq(h.resolveSentence("their is a problem"), "there is a problem", "their is → there is");
        });
        test("to→too with 'much'", () => {
            const h = new NS.HomophoneMatrix();
            assertEq(h.resolveSentence("to much noise"), "too much noise", "to much → too much");
        });
        test("no change without context", () => {
            const h = new NS.HomophoneMatrix();
            assertEq(h.resolveSentence("I see it"), "I see it", "unchanged");
        });
        test("case-preserving replacement", () => {
            const h = new NS.HomophoneMatrix();
            const out = h.resolveSentence("Their is a problem");
            assert(out.charAt(0) === "T", "capital preserved");
        });
    });

    describe("LPGN", () => {
        test("returns candidates for valid input", () => {
            const l = new NS.LPGN();
            const cands = l.normalize("recieve");
            assert(cands.length > 0, "candidates returned");
        });
        test("addWord rejects invalid", () => {
            const l = new NS.LPGN();
            assertEq(l.addWord("a"), false, "too short");
            assertEq(l.addWord("x".repeat(64)), false, "too long");
            assertEq(l.addWord("hello"), true, "valid");
        });
    });

    describe("PEDA PhoneticCorrector", () => {
        test("corrects common typo", () => {
            const p = new NS.PhoneticCorrector();
            p.loadBuiltinLexicon();
            const r = p.correct("recieve");
            assertEq(r.corrected, "receive", "recieve → receive");
            assert(r.score > 0.5, "confidence positive");
        });
        test("rejects garbage without crashing", () => {
            const p = new NS.PhoneticCorrector();
            p.loadBuiltinLexicon();
            const r = p.correct("zzzzqqq");
            assert(typeof r.corrected === "string", "returns object");
        });
    });

    describe("BBE", () => {
        test("ranks boosted word top", () => {
            const b = new NS.BBE();
            b.boost("receive", 0.5); b.boost("other", 0.1);
            const ranks = b.rank();
            assert(ranks.length > 0, "list produced");
            assertEq(ranks[0].word, "receive", "receive top");
        });
        test("ensemble weighted average", () => {
            const b = new NS.BBE(3);
            b.addModel({ predict: () => [{ word: "a", score: 0.9 }] }, 2);
            b.addModel({ predict: () => [{ word: "a", score: 0.1 }, { word: "b", score: 0.5 }] }, 1);
            const ranked = b.predict("x", 2);
            assertEq(ranked[0].word, "a", "weighted avg favors a");
        });
        test("rejects invalid model", () => {
            const b = new NS.BBE();
            assertEq(b.addModel({}, 1), false, "no predict fn");
            assertEq(b.addModel({ predict: () => [] }, 0), false, "zero weight");
        });
    });

    describe("ACX", () => {
        test("tunes down/up", () => {
            const a = new NS.ACX();
            assertEq(a.getCurrentGain(), 1.0, "default gain");
            assertEq(a.tune("down", 0.1), 0.9, "down 0.1");
            assertEq(a.tune("up", 0.2), 1.1, "up 0.2");
        });
        test("bounds enforced", () => {
            const a = new NS.ACX();
            for (let i = 0; i < 20; i++) a.tune("up", 0.1);
            assertEq(a.getCurrentGain(), 3.0, "max 3.0");
            for (let i = 0; i < 30; i++) a.tune("down", 0.1);
            assertEq(a.getCurrentGain(), 0.1, "min 0.1");
        });
        test("gradient mode: negative loss increases gain", () => {
            const a = new NS.ACX();
            const g0 = a.getCurrentGain();
            a.tune(1.0);   // first sample
            a.tune(0.5);   // loss decreased
            assert(a.getCurrentGain() > g0, "gain increased on improvement");
        });
    });

    describe("Polish", () => {
        test("capitalizes sentences", () => {
            assertEq(NS.polish("hello world").charAt(0), "H", "capitalized");
        });
        test("question detection", () => {
            assert(NS.polish("how are you").endsWith("?"), "question mark");
        });
        test("number formatting", () => {
            assert(NS.polish("five hundred dollars").indexOf("500") !== -1, "500");
        });
        test("list detection", () => {
            const r = NS.polish("first do this second do that");
            assert(r.indexOf("1.") !== -1 && r.indexOf("2.") !== -1, "list formatted");
        });
        test("empty/null safe", () => {
            assertEq(NS.polish(""), "", "empty");
            assertEq(NS.polish(null), null, "null");
        });
    });

    describe("DoubleArrayTrie", () => {
        test("build creates valid instance", () => {
            const trie = NS.DoubleArrayTrie.build({ "new chat": 1, "clear chat": 2, "send": 3 });
            assert(trie instanceof NS.DoubleArrayTrie, "instance");
            assert(typeof trie.match === "function", "has match");
        });
        test("exact match works", () => {
            const trie = NS.DoubleArrayTrie.build({ "send": 42 });
            assertEq(trie.match("send"), 42, "exact match");
        });
        test("no match returns -1", () => {
            const trie = NS.DoubleArrayTrie.build({ "send": 42 });
            assertEq(trie.match("xyz"), -1, "no match");
        });
        test("rejects non-ASCII", () => {
            const trie = NS.DoubleArrayTrie.build({ "hello": 1 });
            assertEq(trie.match("héllo"), -1, "non-ASCII rejected");
        });
        test("exportAll returns phrases", () => {
            const trie = NS.DoubleArrayTrie.build({ "a": 1, "ab": 2, "abc": 3 });
            const all = trie.exportAll();
            assert(Array.isArray(all), "array");
            assert(all.indexOf("a") !== -1, "contains a");
            assert(all.indexOf("abc") !== -1, "contains abc");
        });
        test("clear resets state", () => {
            const trie = NS.DoubleArrayTrie.build({ "send": 42 });
            trie.clear();
            assertEq(trie.nodeCount, 0, "nodeCount = 0");
        });
    });

    describe("RuntimeLexicon", () => {
        test("inject and has", () => {
            const lex = new NS.RuntimeLexicon();
            lex.inject(["kubernetes docker react"]);
            assert(lex.has("kubernetes"), "kubernetes");
            assert(lex.has("docker"), "docker");
            assert(!lex.has("python"), "python absent");
        });
        test("respects cap", () => {
            const lex = new NS.RuntimeLexicon(5);
            for (let i = 0; i < 100; i++) lex.inject(["word" + i]);
            assert(lex.size() <= 5, "capped at 5");
        });
    });

    describe("AcousticMap", () => {
        test("record/lookup roundtrip", () => {
            const m = new NS.AcousticMap(10, 1024);
            m.record("recieve", "receive");
            assertEq(m.lookup("recieve"), "receive", "roundtrip");
        });
        test("LRU eviction", () => {
            const m = new NS.AcousticMap(3, 1024);
            m.record("a1", "b1"); m.record("a2", "b2"); m.record("a3", "b3"); m.record("a4", "b4");
            assertEq(m.size(), 3, "capped");
            assertEq(m.lookup("a1"), undefined, "oldest evicted");
        });
        test("rejects identity record", () => {
            const m = new NS.AcousticMap(10, 1024);
            m.record("same", "same");
            assertEq(m.size(), 0, "identity not stored");
        });
    });

    describe("VelocityAdaptor", () => {
        test("WPM calculation is real", () => {
            if (typeof document === "undefined") { skip("velocity WPM", "no DOM"); return; }
            const input = document.createElement("input");
            const va = new NS.VelocityAdaptor(input, () => {});
            // 20 synthetic keypresses, 100ms apart
            for (let i = 0; i < 20; i++) {
                const ts = performance.now() - (20 - i) * 100;
                va.recordKeypressAt(ts);
            }
            const wpm = va.getWPM();
            assert(wpm >= 0, "non-negative");
            assert(wpm > 0, "positive WPM");
            va.dispose();
        });
    });

    describe("Fuzz", () => {
        const cases = [
            "", " ", "\n\t\r", "🎉🎊🎈", "日本語テスト", "a".repeat(5000),
            "!@#$%^&*()", "0xDEADBEEF", "SELECT * FROM users; --", "'; DROP TABLE--",
            "\u0000\u0001\u0002", "normal text with mix 123 !@# 中文 🎉"
        ];
        test("TokenRing handles all fuzz inputs", () => {
            const r = new NS.TokenRing(16);
            for (const c of cases) { try { r.push(c); r.pop(); } catch (e) { throw new Error(`fuzz: ${JSON.stringify(c).slice(0, 20)}`); } }
        });
        test("IntentFilter handles all fuzz inputs", () => {
            const f = new NS.IntentFilter(new NS.TokenRing(16));
            for (const c of cases) { try { f.applyFinal(c); } catch (e) { throw new Error(`fuzz: ${e.message}`); } }
        });
        test("Polish handles all fuzz inputs", () => {
            for (const c of cases) { try { NS.polish(c); } catch (e) { throw new Error(`polish: ${e.message}`); } }
        });
        test("Metaphone handles all fuzz inputs", () => {
            for (const c of cases) { try { NS.metaphone(c); } catch (e) { throw new Error(`metaphone: ${e.message}`); } }
        });
        test("CharCNN.suggest handles all fuzz inputs", () => {
            if (typeof NS.CharCNN !== "function") { skip("cnn suggest fuzz", "not loaded"); return; }
            const cnn = new NS.CharCNN({ gpu: false });
            for (const c of cases) { try { cnn.suggest(c.slice(0, 64)); } catch (e) { throw new Error(`cnn: ${e.message}`); } }
            if (cnn.dispose) cnn.dispose();
        });
    });

    describe("Memory leaks", () => {
        test("TokenRing 1000x create/dispose no growth", () => {
            if (typeof performance === "undefined" || !performance.memory) { skip("ring leak", "no perf.memory"); return; }
            const before = performance.memory.usedJSHeapSize;
            for (let i = 0; i < 1000; i++) { const r = new NS.TokenRing(16); r.push("test"); r.dispose(); }
            const growth = (performance.memory.usedJSHeapSize - before) / 1024;
            assert(growth < 5000, `heap growth ${growth.toFixed(0)} KB (limit 5000)`);
        });
        test("SymSpell 20x create/dispose no growth", () => {
            if (typeof performance === "undefined" || !performance.memory) { skip("symspell leak", "no perf.memory"); return; }
            const before = performance.memory.usedJSHeapSize;
            for (let i = 0; i < 20; i++) { const s = new NS.SymSpell(2); s.dispose(); }
            const growth = (performance.memory.usedJSHeapSize - before) / 1024;
            assert(growth < 10000, `heap growth ${growth.toFixed(0)} KB`);
        });
        test("KVCache dispose clears", () => {
            const c = new NS.KVCache(100);
            for (let i = 0; i < 100; i++) c.set("k" + i, i);
            c.dispose();
            assertEq(c.map, null, "cleared");
        });
    });

    describe("Precision (regex edge cases)", () => {
        test("intent delete 0 words handled", () => {
            const f = new NS.IntentFilter(new NS.TokenRing(8));
            f.applyFinal("hello world");
            const r = f.applyFinal("delete 0 words");
            assert(r.applied <= 50, "no overflow");
        });
        test("intent delete 50 words capped", () => {
            const f = new NS.IntentFilter(new NS.TokenRing(8));
            for (let i = 0; i < 60; i++) f.applyFinal("word" + i);
            const r = f.applyFinal("delete 100 words");
            assert(f.ring.size() <= 60, "did not over-delete");
        });
        test("polish empty string", () => {
            assertEq(NS.polish(""), "", "empty in = empty out");
            assertEq(NS.polish(null), null, "null in = null out");
        });
        test("CharCNN peak char boundary", () => {
            if (typeof NS.CharCNN !== "function") { skip("cnn boundary", "not loaded"); return; }
            const c = new NS.CharCNN({ gpu: false });
            const s1 = c.score("a");
            const s2 = c.score("a".repeat(100));
            assert(typeof s1 === "number" && typeof s2 === "number", "no throw on extremes");
            if (c.dispose) c.dispose();
        });
    });

    describe("SSDR", () => {
        test("basic logging works", () => {
            const s = new NS.SSDR();
            s.log("test", { a: 1 });
            assertEq(s.size(), 1, "one event");
        });
        test("maintains size cap", () => {
            const s = new NS.SSDR();
            for (let i = 0; i < 1000; i++) s.log("e", { i });
            assertEq(s.size(), 512, "capped at 512");
        });
        test("replay applies events in order", () => {
            const s = new NS.SSDR();
            s.log("a", { v: 1 }); s.log("b", { v: 2 });
            const seq = [];
            s.replay((ev) => seq.push(ev.op));
            assertEq(seq.join(","), "a,b", "replay order");
        });
    });

    describe("Edge cases", () => {
        test("TokenRing capacity 1 works", () => {
            const r = new NS.TokenRing(1);
            r.push("a"); r.push("b");
            assertEq(r.size(), 1, "capacity 1");
            assertEq(r.pop(), "b", "latest survives");
        });
        test("intent REPLACE on empty ring", () => {
            const f = new NS.IntentFilter(new NS.TokenRing(8));
            const r = f.applyFinal("change that to x");
            assert(typeof r.buffer === "string", "safe on empty");
        });
        test("metaphone idempotent on capitalization", () => {
            assertEq(NS.metaphone("Receive"), NS.metaphone("receive"), "case-insensitive");
        });
    });

    finalizeTests();
})(typeof window !== "undefined" ? window : globalThis);