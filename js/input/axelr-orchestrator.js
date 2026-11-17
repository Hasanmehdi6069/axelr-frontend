/*!
 * axelr-orchestrator.js — safeCallback · MemoryRegistry · InputEngine · autoAttach.
 * Setup/SettingsRegistry lives in axelr-setup.js.
 * Bridge/BroadcastSync/RTCSync lives in axelr-bridge.js.
 * Load order: LAST among main-thread files.
 */
(function (global) {
    "use strict";
    const NS = global.AxelrInput;
    if (!NS || !NS.READY) { console.warn("axelr-orchestrator: core required"); return; }
    const {
        CONFIG, log, telemetry, ERR,
        TokenRing, IntentFilter, KVCache,
        PolyfillPredictor, LocaleRegistry,
        CharCNN, ContextScraper, AcousticMap, DoubleArrayTrie, RuntimeLexicon,
        SymSpell, HomophoneMatrix, PhoneticCorrector, LPGN,
        ShadowTyping, FixItOverlay, VelocityAdaptor, VisualFeedback,
        SHISHotkeyManager,
        BroadcastSync, RTCSync,
    } = NS;

    // ══════════════════════════════════════════════════════════════════
    // §0 — safeCallback (error boundary)
    // ══════════════════════════════════════════════════════════════════
    function safeCallback(fn, label) {
        if (typeof fn !== "function") return () => {};
        return function safe(...args) {
            try {
                const r = fn.apply(this, args);
                if (r && typeof r.catch === "function") {
                    r.catch((e) => {
                        log(1, `[cb:${label}] async:`, e && e.message ? e.message : e);
                        telemetry.error(ERR.E_INFRA_DISPOSE, `cb:${label}`);
                    });
                }
                return r;
            } catch (e) {
                log(1, `[cb:${label}] sync:`, e && e.message ? e.message : e);
                telemetry.error(ERR.E_INFRA_DISPOSE, `cb:${label}`);
            }
        };
    }
    NS.safeCallback = safeCallback;

    // ══════════════════════════════════════════════════════════════════
    // §1 — MemoryRegistry (disposal orchestrator)
    // ══════════════════════════════════════════════════════════════════
    class MemoryRegistry {
        constructor() {
            this.entries = [];
            this.stats = { buffers: 0, objects: 0, listeners: 0, timers: 0, channels: 0 };
            this._closed = false;
        }
        registerBuffer(name, buf) { if (this._closed) return; this.entries.push({ kind: "buffer", name, ref: buf }); this.stats.buffers++; }
        registerObject(name, obj) { if (this._closed) return; this.entries.push({ kind: "object", name, ref: obj }); this.stats.objects++; }
        registerListener(target, ev, fn, opts) { if (this._closed) return; this.entries.push({ kind: "listener", target, event: ev, fn, options: opts }); this.stats.listeners++; return fn; }
        registerInterval(h) { if (this._closed) return; this.entries.push({ kind: "interval", handle: h }); this.stats.timers++; return h; }
        registerTimeout(h) { if (this._closed) return; this.entries.push({ kind: "timeout", handle: h }); this.stats.timers++; return h; }
        registerChannel(name, ch) { if (this._closed) return; this.entries.push({ kind: "channel", name, ref: ch }); this.stats.channels++; return ch; }
        dispose() {
            if (this._closed) return;
            this._closed = true;
            for (let i = this.entries.length - 1; i >= 0; i--) {
                const e = this.entries[i];
                try {
                    switch (e.kind) {
                        case "buffer": if (e.ref && e.ref.fill) e.ref.fill(0); break;
                        case "object": if (e.ref && typeof e.ref.dispose === "function") try { e.ref.dispose(); } catch (_) {} break;
                        case "listener": if (e.target && e.target.removeEventListener) e.target.removeEventListener(e.event, e.fn, e.options); break;
                        case "interval": if (e.handle != null) global.clearInterval(e.handle); break;
                        case "timeout": if (e.handle != null) global.clearTimeout(e.handle); break;
                        case "channel": if (e.ref && typeof e.ref.close === "function") try { e.ref.close(); } catch (_) {} break;
                    }
                } catch (err) { log(1, "registry dispose:", e.kind, err); }
            }
            this.entries.length = 0;
        }
    }
    NS.MemoryRegistry = MemoryRegistry;

    // ══════════════════════════════════════════════════════════════════
    // §2 — InputEngine (unchanged internals; imports from NS)
    // ══════════════════════════════════════════════════════════════════
    class InputEngine {
        constructor(opts) {
            if (!opts || !opts.input) throw new Error("input element required");
            this.opts = opts;
            this._disposed = false;
            this.registry = new MemoryRegistry();
            this._onCommand     = safeCallback(opts.onCommand, "onCommand");
            this._onText        = safeCallback(opts.onText, "onText");
            this._userOnInterim = safeCallback(opts.onInterim, "onInterim");
            this._onDegrade     = safeCallback(opts.onDegrade, "onDegrade");
            this._onVelocity    = safeCallback(opts.onVelocity, "onVelocity");
            this._onRevision    = safeCallback(opts.onRevision, "onRevision");

            this.ring = new TokenRing(CONFIG.RING_CAPACITY);
            this.intent = new IntentFilter(this.ring);
            this.registry.registerObject("ring", this.ring);
            this.registry.registerObject("intent", this.intent);

            this.kv = new KVCache();
            this.registry.registerObject("kv", this.kv);

            const isLow = !!(NS._budget && NS._budget.tierName === "low");
            this._deferred = {};
            if (isLow) {
                // CNN and SymSpell not allocated until first real use
                Object.defineProperty(this, "cnn", {
                    configurable: true,
                    get: () => {
                        if (!this._deferred.cnn) this._deferred.cnn = new CharCNN();
                        return this._deferred.cnn;
                    },
                });
                Object.defineProperty(this, "symspell", {
                    configurable: true,
                    get: () => {
                        if (!this._deferred.symspell) this._deferred.symspell = new SymSpell(2);
                        return this._deferred.symspell;
                    },
                });
                this.acoustic = new AcousticMap();
                this.predictor = new PolyfillPredictor();
                this.homophones = new HomophoneMatrix();
                this.lpgN = new LPGN();
                this.phoneticCorrector = new PhoneticCorrector(
                    new Set([...(this.symspell ? this.symspell.words.slice(0, 200) : [])]),
                    0.5
                );
                if (this.phoneticCorrector && this.phoneticCorrector.load && this.symspell) {
                    try { this.phoneticCorrector.load(this.symspell.words.slice(0, 500)); } catch (_) {}
                }
                this.registry.registerObject("cnn-lazy", {
                    dispose: () => { if (this._deferred.cnn) { try { this._deferred.cnn.dispose(); } catch (_) {} this._deferred.cnn = null; } }
                });
                this.registry.registerObject("symspell-lazy", {
                    dispose: () => { if (this._deferred.symspell) { try { this._deferred.symspell.dispose(); } catch (_) {} this._deferred.symspell = null; } }
                });
                this.registry.registerObject("acoustic", this.acoustic);
                this.registry.registerObject("predictor", this.predictor);
                this.registry.registerObject("symspell", this.symspell);
                this.registry.registerObject("homophones", this.homophones);
                this.registry.registerObject("lpgN", this.lpgN);
                this.registry.registerObject("phoneticCorrector", this.phoneticCorrector);
            } else {
                this.cnn = opts.cnn || new CharCNN();
                this.acoustic = new AcousticMap();
                this.predictor = new PolyfillPredictor();
                this.symspell = new SymSpell(2);
                this.homophones = new HomophoneMatrix();
                this.lpgN = new LPGN();
                this.phoneticCorrector = new PhoneticCorrector(
                    new Set([...(this.symspell ? this.symspell.words.slice(0, 200) : [])]),
                    0.5
                );
                if (this.phoneticCorrector && this.phoneticCorrector.load && this.symspell) {
                    try { this.phoneticCorrector.load(this.symspell.words.slice(0, 500)); } catch (_) {}
                }
                this.registry.registerObject("cnn", this.cnn);
                this.registry.registerObject("acoustic", this.acoustic);
                this.registry.registerObject("predictor", this.predictor);
                this.registry.registerObject("symspell", this.symspell);
                this.registry.registerObject("homophones", this.homophones);
                this.registry.registerObject("lpgN", this.lpgN);
                this.registry.registerObject("phoneticCorrector", this.phoneticCorrector);
            }

            this.commands = opts.commands || NS.DEFAULT_COMMANDS;
            this.trie = DoubleArrayTrie.build(this.commands);
            this.lexicon = new RuntimeLexicon();
            this.registry.registerObject("trie", this.trie);
            this.registry.registerObject("lexicon", this.lexicon);

            this.scraper = opts.scrapeRoot ? new ContextScraper(opts.scrapeRoot) : null;
            if (this.scraper) this.registry.registerObject("scraper", this.scraper);

            this.locale = opts.locale ? new LocaleRegistry(opts.locale) : new LocaleRegistry();
            this.asrRouter = new NS.AsrRouter(this.ring, this.intent, {
                onToken:   (t, r) => this._onVoiceToken(t, r),
                onInterim: (i, b) => this._onInterim(i, b),
                onDegrade: (r)    => this._handleDegrade(r),
                onTier:    (d)    => { this.asrTier = d.tier; telemetry.count("asr.tier." + d.tier); }
            }, this.locale, {
                mode:       opts.asrMode || "auto",
                modelURL:   opts.modelURL,
                runtimeURL: opts.runtimeURL,
                workerURL:  opts.workerURL,
                workletURL: opts.workletURL,
                minConfidence: (NS.Setup && NS.Setup.registry ? NS.Setup.registry.get("minConfidence") : 0) || 0
            });
            this.registry.registerObject("asrRouter", this.asrRouter);

            Object.defineProperty(this, "voice", {
                configurable: true,
                get: () => this.asrRouter ? this.asrRouter._cloud : null,
            });

            this.shadow = opts.ghost ? new ShadowTyping(opts.input, opts.ghost) : null;
            if (this.shadow) this.registry.registerObject("shadow", this.shadow);
            this.visual = opts.correctedTarget ? new VisualFeedback(opts.correctedTarget, opts.input) : null;
            if (this.visual) this.registry.registerObject("visual", this.visual);
            this.velocity = new VelocityAdaptor(opts.input, (a, w) => {
                this.aggressive = a;
                this._onVelocity(a, w);
            });
            this.registry.registerObject("velocity", this.velocity);

            const engineRef = this;
            this.fixit = new FixItOverlay(opts.input, {
                once: function () {
                    const v = engineRef.asrRouter ? engineRef.asrRouter._cloud : null;
                    if (!v || typeof v.once !== "function") return Promise.resolve("");
                    return v.once();
                }
            });
            this.registry.registerObject("fixit", this.fixit);

            const correctedHandler = (e) => {
                if (!this.visual) return;
                try {
                    const prev = e.detail.prev;
                    this.visual.flash(prev, () => { this.ring.clear(); this.ring.push(prev); });
                } catch (err) { log(1, "corrected handler:", err); }
            };
            this.registry.registerListener(opts.input, "axelr:corrected", correctedHandler);

            this.broadcastSync = null; this.rtcSync = null;
            if (opts.enableSync !== false && typeof BroadcastChannel !== "undefined") {
                this.broadcastSync = new BroadcastSync("axelr-input-sync-v2", (msg) => this._onSyncMessage(msg));
                this.registry.registerChannel("broadcast", this.broadcastSync);
            }

            this.revisor = new NS.StreamingPartialRevisor({
                symspell: this.symspell,
                homophones: this.homophones,
                cnn: this.cnn,
                scraper: this.scraper,
                onRevise: (r, t) => this._onRevision(r, t)
            });
            this.registry.registerObject("revisor", this.revisor);

            if (NS.Setup && NS.Setup.registry) {
                try {
                    const cleanup = NS.Setup.registry.applyToEngine(this);
                    this.registry.registerObject("settings-cleanup", { dispose: cleanup });
                    const vocab = NS.Setup.registry.get("userCustomVocabulary") || [];
                    for (const w of vocab) try { this.symspell.addCustomWord(w); } catch (_) {}
                } catch (e) { log(2, "settings attach:", e.message); }
            }

            if (NS.SHISHotkeyManager && !NS._shis) {
                NS._shis = new SHISHotkeyManager();
                NS._shis.register("ctrl+shift+z", () => this.stop(), { id: "engine.stop" });
            }

            this.aggressive = false;
            this.started = false;
            this.degraded = false;
        }

        start() {
            if (this._disposed || this.started) return;
            this.started = true;
            this.asrRouter.start();
            this.kv.set("started_at", Date.now());
        }
        stop() {
            if (this._disposed) return;
            this.asrRouter.stop();
            this.started = false;
        }
        dispose() {
            if (this._disposed) return;
            this._disposed = true;
            if (this.rtcSync) { try { this.rtcSync.close(); } catch (_) {} this.rtcSync = null; }
            for (const obj of [this.symspell, this.homophones, this.acoustic, this.scraper, this.cnn, this.lexicon, this.trie, this.asrRouter, this.revisor, this.phoneticCorrector, this.lpgN, this.predictor]) {
                if (obj && typeof obj.dispose === "function") try { obj.dispose(); } catch (_) {}
            }
            this.registry.dispose();
            this.ring = this.intent = this.cnn = this.acoustic = null;
            this.predictor = this.trie = this.lexicon = this.scraper = null;
            this.voice = this.locale = this.shadow = this.visual = null;
            this.velocity = this.fixit = this.symspell = this.homophones = null;
            this.revisor = this.phoneticCorrector = this.lpgN = null;
            this.broadcastSync = null; this.asrRouter = null;
            this._onCommand = this._onText = this._userOnInterim = null;
            this._onDegrade = this._onVelocity = this._onRevision = null;
            this.kv = null;
            this.commands = null;
            this.opts = null;
            this.registry = null;
            log(3, "engine disposed");
        }

        injectWorkspaceContext(textArray) {
            const added = this.lexicon.inject(textArray);
            if (this.symspell) {
                for (const t of (Array.isArray(textArray) ? textArray : [textArray])) {
                    if (typeof t === "string") for (const w of t.split(/\s+/)) if (w.length >= 3 && w.length < 64) this.symspell.addCustomWord(w);
                }
            }
            this._broadcast({ type: "lexicon-add", items: Array.isArray(textArray) ? textArray : [textArray] });
            return added;
        }
        setLanguage(tag) { return this.asrRouter.setLanguage(tag); }
        listLanguages() { return this.locale.list(); }

        async createSyncOffer() {
            if (typeof RTCPeerConnection === "undefined") throw new Error("WebRTC unavailable");
            this.rtcSync = new RTCSync((msg) => this._onSyncMessage(msg));
            return await this.rtcSync.offer();
        }
        async acceptSyncOffer(offerSDP) {
            if (typeof RTCPeerConnection === "undefined") throw new Error("WebRTC unavailable");
            this.rtcSync = new RTCSync((msg) => this._onSyncMessage(msg));
            return await this.rtcSync.accept(offerSDP);
        }
        async completeSyncSetup(answerSDP) { if (this.rtcSync) await this.rtcSync.complete(answerSDP); }
        _broadcast(msg) { if (this.broadcastSync) this.broadcastSync.send(msg); if (this.rtcSync) this.rtcSync.send(msg); }
        _onSyncMessage(msg) {
            if (!msg || typeof msg !== "object") return;
            if (msg.type === "lexicon-add" && Array.isArray(msg.items)) {
                for (const t of msg.items) if (typeof t === "string") this.lexicon.inject([t]);
                telemetry.count("sync.lexicon_received");
            }
        }

        _onVoiceToken(finalText, result) {
            if (!this.cnn) return;
            const tokens = result.buffer.split(/\s+/).filter(Boolean);
            if (tokens.length === 0) return;
            const lastIdx = tokens.length - 1;
            let lastToken = tokens[lastIdx] || "";
            if (!lastToken) return;

            const acousticFix = this.acoustic.lookup(lastToken);
            if (acousticFix) { lastToken = acousticFix; tokens[lastIdx] = lastToken; }

            let correctedBySymspell = false;
            if (this.symspell && lastToken.length >= 3) {
                const hits = this.symspell.lookup(lastToken, 2);
                if (hits.length > 0 && hits[0].distance > 0) {
                    const best = hits[0], second = hits[1];
                    const confidentDist1 = best.distance === 1;
                    const soleCandidate  = best.distance === 2 && !second;
                    const dominantFreq   = best.distance === 2 && second && (second.frequency / Math.max(1, best.frequency)) >= 3;
                    if (confidentDist1 || soleCandidate || dominantFreq || this.aggressive) {
                        this.acoustic.record(lastToken, best.word);
                        tokens[lastIdx] = best.word; lastToken = best.word;
                        correctedBySymspell = true;
                        telemetry.count("engine.symspell_fix");
                    } else telemetry.count("engine.symspell_rejected");
                }
            }

            try {
                if (!correctedBySymspell && this.cnn && lastToken.length >= 3 && lastToken.length <= 16) {
                    const threshold = this.aggressive ? -3.0 : -5.0;
                    if (this.cnn.score(lastToken) < threshold) {
                        const inView = this.scraper && this.scraper.known(lastToken);
                        const inLex = this.lexicon.has(lastToken);
                        if (!inView && !inLex) {
                            const cand = this.cnn.suggest(lastToken, threshold + 0.6, 1);
                            if (cand.length > 0) {
                                this.acoustic.record(lastToken, cand[0]);
                                tokens[lastIdx] = cand[0]; lastToken = cand[0];
                                telemetry.count("engine.cnn_fix");
                                if (this.visual) {
                                    const prev = result.buffer;
                                    const next = tokens.join(" ");
                                    this.visual.flash(prev, () => { this.ring.clear(); this.ring.push(prev); });
                                    if (this.opts.input) {
                                        this.opts.input.value = next;
                                        this.opts.input.dispatchEvent(new Event("input", { bubbles: true }));
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                log(1, "cnn voice:", e.message);
                telemetry.error(ERR.E_CORRECT_CNN, "voice:" + e.message);
            }

            let buffer = tokens.join(" ");
            if (this.homophones) try { buffer = this.homophones.resolveSentence(buffer); } catch (e) { log(2, "homophone:", e.message); }
            if (NS.polish) try { buffer = NS.polish(buffer); } catch (e) { log(2, "polish:", e.message); }

            const cmdId = this.trie.match(buffer.trim().toLowerCase());
            if (cmdId >= 0) {
                if (this.shadow) this.shadow.record(buffer.trim());
                this.kv.set("last_command", { id: cmdId, text: buffer, ts: Date.now() });
                telemetry.count("engine.command");
                this._onCommand(cmdId, buffer);
            } else {
                telemetry.count("engine.text");
                this._onText(buffer);
            }
        }

        _onInterim(interim, fullBuffer) {
            if (this.revisor) {
                this.revisor.setAggressive(this.aggressive);
                this.revisor.submit(interim);
            }
            if (this.degraded && this.opts.ghost) {
                const pred = this.predictor.predict(interim);
                if (pred) this.opts.ghost.textContent = pred;
            }
            this._userOnInterim(interim, fullBuffer);
        }

        _handleDegrade(reason) {
            if (this.degraded) return;
            this.degraded = true;
            telemetry.count("engine.degraded");
            this._onDegrade(reason);
        }

        snapshot() {
            if (this._disposed) return { disposed: true };
            return {
                version: NS.VERSION,
                sab: NS.HAS_SAB,
                webgl2: NS.CharCNNUtils && NS.CharCNNUtils.HAS_WEBGL2,
                started: this.started, degraded: this.degraded, aggressive: this.aggressive,
                ringSize: this.ring ? this.ring.size() : 0,
                lexiconSize: this.lexicon ? this.lexicon.size() : 0,
                acousticEntries: this.acoustic ? this.acoustic.size() : 0,
                symspellSize: this.symspell ? this.symspell.size() : 0,
                kvSize: this.kv ? this.kv.size() : 0,
                cps: NS.throughput ? Math.round(NS.throughput.getCPS()) : 0,
                peakCPS: NS.throughput ? Math.round(NS.throughput.peakCPS) : 0,
                wpm: this.velocity ? Math.round(this.velocity.getWPM()) : 0,
                registryStats: this.registry ? { ...this.registry.stats } : {},
                telemetry: telemetry.snapshot()
            };
        }
    }
    NS.InputEngine = InputEngine;
    NS.createEngine = (opts) => new InputEngine(opts);

    // ══════════════════════════════════════════════════════════════════
    // §3 — autoAttach + health
    // ══════════════════════════════════════════════════════════════════
    NS.autoAttach = (overrides) => {
        const input = document.getElementById("prompt-input");
        const ghost = document.getElementById("prompt-ghost");
        if (!input) { log(2, "autoAttach: #prompt-input not found"); return null; }
        const engine = NS.createEngine(Object.assign({ input, ghost, scrapeRoot: document.body, correctedTarget: input }, overrides || {}));
        NS._engine = engine;
        return engine;
    };
    NS.healthCheck = () => ({
        ready: !!NS.READY,
        engine: !!NS.InputEngine,
        cnn: !!NS.CharCNN,
        symspell: !!NS.SymSpell,
        router: !!(NS.AsrRouter),
        uiLoaded: !!NS._engine,
        sab: !!NS.HAS_SAB,
        version: NS.VERSION || "unknown"
    });

    if (typeof global.addEventListener === "function") {
        global.addEventListener("pagehide", () => {
            if (NS._engine && typeof NS._engine.dispose === "function") try { NS._engine.dispose(); } catch (_) {}
            if (NS._shis) try { NS._shis.dispose(); } catch (_) {}
        });
    }

    log(3, `orchestrator loaded`);
})(typeof window !== "undefined" ? window : self);