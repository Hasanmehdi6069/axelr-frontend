/*!
 * axelr-setup.js — SettingsRegistry · LicenseVerifier · WarmupOrchestrator ·
 *                  ZTPSPermissionManager · Setup object.
 * Split from axelr-orchestrator.js v4.0.1 for size compliance.
 * Load order: after bridge, before orchestrator.
 */
(function (global) {
    "use strict";
    const NS = global.AxelrInput;
    if (!NS || !NS.READY) { console.warn("axelr-setup: core required"); return; }
    const { log, telemetry, ERR } = NS;

    // ── SettingsRegistry ──────────────────────────────────────────────
    const STORAGE_KEY = "axelr.settings.v1";
    const SCHEMA_VERSION = 1;
    const DEFAULTS = Object.freeze({
        currentLanguage: "en-US",
        vadSensitivity: 0.5,
        noiseFloor: 0.02,
        isAutoPunctuationEnabled: true,
        isVelocityAdaptorActive: true,
        userCustomVocabulary: [],
        asrMode: "auto",
        localAsrModelURL: "/models/ggml-tiny.en-q4_0.bin",
        localAsrRuntimeURL: "/models/whisper.runtime.js",
        localAsrWorkerURL: "axelr-worker.js",
        localAsrWorkletURL: "axelr-worklet.js",
        isLocalAsrPreWarmEnabled: true,
        minConfidence: 0.0
    });
    const VALIDATORS = {
        currentLanguage: (v) => typeof v === "string" && /^[a-z]{2,3}(-[A-Z]{2})?$/i.test(v) ? v : null,
        vadSensitivity: (v) => (typeof v === "number" && isFinite(v)) ? Math.min(1, Math.max(0, v)) : null,
        noiseFloor: (v) => (typeof v === "number" && isFinite(v) && v >= 0 && v < 1) ? v : null,
        isAutoPunctuationEnabled: (v) => typeof v === "boolean" ? v : null,
        isVelocityAdaptorActive: (v) => typeof v === "boolean" ? v : null,
        userCustomVocabulary: (v) => Array.isArray(v) ? v.filter(s => typeof s === "string" && s.length > 0 && s.length < 64).slice(0, 5000) : null,
        asrMode: (v) => ["auto","local","cloud","text"].includes(v) ? v : "auto",
        localAsrModelURL: (v) => typeof v === "string" && v.length > 10 ? v : null,
        localAsrRuntimeURL: (v) => typeof v === "string" && v.length > 10 ? v : null,
        localAsrWorkerURL: (v) => typeof v === "string" && v.endsWith(".js") ? v : null,
        localAsrWorkletURL: (v) => typeof v === "string" && v.endsWith(".js") ? v : null,
        isLocalAsrPreWarmEnabled: (v) => typeof v === "boolean" ? v : null,
        minConfidence: (v) => typeof v === "number" && isFinite(v) && v >= 0 && v <= 1 ? v : null
    };
    class SettingsRegistry {
        constructor() {
            this._state = Object.assign({}, DEFAULTS, { userCustomVocabulary: [] });
            this._listeners = new Map();
            this._storageAvailable = this._probeStorage();
            this._persistTimer = null;
            this._hydrate();
            if (typeof global.addEventListener === "function") {
                this._onStorage = (e) => { if (e.key === STORAGE_KEY) this._hydrate(true); };
                global.addEventListener("storage", this._onStorage);
            }
        }
        _probeStorage() {
            try { global.localStorage.setItem("__p__", "1"); global.localStorage.removeItem("__p__"); return true; }
            catch (_) { return false; }
        }
        _hydrate(fromEvent) {
            if (!this._storageAvailable) return;
            let raw; try { raw = global.localStorage.getItem(STORAGE_KEY); } catch (_) { return; }
            if (!raw) return;
            let parsed; try { parsed = JSON.parse(raw); } catch (_) { return; }
            if (!parsed || typeof parsed.data !== "object") return;
            for (const k of Object.keys(DEFAULTS)) {
                const v = VALIDATORS[k](parsed.data[k]);
                if (v !== null) { this._state[k] = v; if (fromEvent) this._emit(k, v); }
            }
        }
        _persist() {
            if (!this._storageAvailable) return;
            try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: SCHEMA_VERSION, t: Date.now(), data: this._state })); }
            catch (e) { log(2, "persist:", e.message); }
        }
        _schedulePersist() {
            if (this._persistTimer) return;
            this._persistTimer = setTimeout(() => { this._persistTimer = null; this._persist(); }, 150);
        }
        _emit(key, value) { const set = this._listeners.get(key); if (set) for (const fn of set) try { fn(value); } catch (_) {} }
        get(key) { return Object.prototype.hasOwnProperty.call(this._state, key) ? this._state[key] : undefined; }
        getAll() { return Object.assign({}, this._state, { userCustomVocabulary: this._state.userCustomVocabulary.slice() }); }
        set(key, value) {
            if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return false;
            const clean = VALIDATORS[key](value);
            if (clean === null) return false;
            this._state[key] = clean;
            this._schedulePersist();
            this._emit(key, clean);
            return true;
        }
        reset() {
            this._state = Object.assign({}, DEFAULTS, { userCustomVocabulary: [] });
            this._persist();
            for (const k of Object.keys(DEFAULTS)) this._emit(k, this._state[k]);
        }
        onChange(key, fn) {
            if (!this._listeners.has(key)) this._listeners.set(key, new Set());
            this._listeners.get(key).add(fn);
            return () => this._listeners.get(key).delete(fn);
        }
        applyToEngine(engine) {
            if (!engine) return () => {};
            const s = this._state;
            if (typeof engine.setLanguage === "function") try { engine.setLanguage(s.currentLanguage); } catch (_) {}
            if (s.userCustomVocabulary.length && typeof engine.injectWorkspaceContext === "function") try { engine.injectWorkspaceContext(s.userCustomVocabulary.slice()); } catch (_) {}
            if (engine.velocity && typeof engine.velocity.setEnabled === "function") try { engine.velocity.setEnabled(s.isVelocityAdaptorActive); } catch (_) {}
            NS.VADConfig = NS.VADConfig || {};
            NS.VADConfig.sensitivity = s.vadSensitivity;
            NS.VADConfig.noiseFloor = s.noiseFloor;
            NS.AutoPunctuation = NS.AutoPunctuation || {};
            NS.AutoPunctuation.enabled = s.isAutoPunctuationEnabled;
            const unsubs = [
                this.onChange("currentLanguage", (v) => { try { engine.setLanguage(v); } catch (_) {} }),
                this.onChange("userCustomVocabulary", (v) => { try { engine.injectWorkspaceContext(v.slice()); } catch (_) {} }),
                this.onChange("vadSensitivity", (v) => { if (NS.VADConfig) NS.VADConfig.sensitivity = v; }),
                this.onChange("noiseFloor", (v) => { if (NS.VADConfig) NS.VADConfig.noiseFloor = v; }),
                this.onChange("isAutoPunctuationEnabled", (v) => { if (NS.AutoPunctuation) NS.AutoPunctuation.enabled = v; }),
                this.onChange("isVelocityAdaptorActive", (v) => {
                    if (engine.velocity && typeof engine.velocity.setEnabled === "function") try { engine.velocity.setEnabled(v); } catch (_) {}
                })
            ];
            return () => { for (const u of unsubs) try { u(); } catch (_) {} };
        }
        exportAll() {
            return JSON.stringify({
                schema: SCHEMA_VERSION,
                exportedAt: new Date().toISOString(),
                data: this._state,
            }, null, 2);
        }

        importAll(json, opts = {}) {
            try {
                const parsed = typeof json === "string" ? JSON.parse(json) : json;
                if (!parsed || parsed.schema !== SCHEMA_VERSION) {
                    return { ok: false, reason: "schema_mismatch" };
                }
                if (!parsed.data || typeof parsed.data !== "object") {
                    return { ok: false, reason: "bad_payload" };
                }
                let restored = 0;
                for (const k of Object.keys(DEFAULTS)) {
                    const v = VALIDATORS[k](parsed.data[k]);
                    if (v !== null) {
                        this._state[k] = v;
                        restored++;
                        if (opts.emit !== false) this._emit(k, v);
                    }
                }
                this._persist();
                return { ok: true, restored, total: Object.keys(DEFAULTS).length };
            } catch (e) {
                return { ok: false, reason: e.message };
            }
        }

        dispose() {
            if (this._persistTimer) { clearTimeout(this._persistTimer); this._persistTimer = null; }
            this._persist();
            if (this._onStorage) { try { global.removeEventListener("storage", this._onStorage); } catch (_) {} this._onStorage = null; }
            if (this._listeners) { this._listeners.clear(); this._listeners = null; }
            this._state = null;
        }
    }

    // LazyConsent is now owned by axelr-core.js (Single-Owner Rule compliance)
    // Use the canonical implementation from core instead of the local one


    // ── LicenseVerifier (ECDSA P-256) ────────────────────────────────
    const EMBEDDED_PUBLIC_KEY_JWK = {
        "kty":"EC",
        "x":"-u6zuXjUn3ZT14DaWExxbtRgyVPdeJcF_WNqXEn2snY",
        "y":"cY3RMIpOC18lTsMpSmGYiZ4L-43hu0ag21wy_vYJrV0",
        "crv":"P-256"
    };
    const PremiumFlags = Object.freeze({
        tier0_premium: { value: false },
        customWorkplaceDictionary: { value: false },
        p2pSyncLoops: { value: false },
        org: { value: null },
        expiresAt: { value: 0 }
    });
    NS.PremiumFlags = PremiumFlags;
    function b64urlDecode(str) {
        const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
        const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
        const bin = global.atob(b64 + pad);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }
    function derToRaw(sig) {
        if (sig.length === 64) return sig;
        if (sig[0] !== 0x30) return sig;
        let i = 2;
        if (sig[1] & 0x80) i = 2 + (sig[1] & 0x7f);
        const lenR = sig[i + 1];
        const R = sig.slice(i + 2, i + 2 + lenR);
        const j = i + 2 + lenR;
        const lenS = sig[j + 1];
        const S = sig.slice(j + 2, j + 2 + lenS);
        const raw = new Uint8Array(64);
        raw.set(R.length > 32 ? R.slice(R.length - 32) : R, 32 - Math.min(32, R.length));
        raw.set(S.length > 32 ? S.slice(S.length - 32) : S, 64 - Math.min(32, S.length));
        return raw;
    }
    class LicenseVerifier {
        constructor() { this._key = null; }
        async _importKey() {
            if (this._key) return this._key;
            this._key = await crypto.subtle.importKey("jwk", EMBEDDED_PUBLIC_KEY_JWK, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
            return this._key;
        }
        async verifyLicenseKey(keyString) {
            try {
                if (typeof keyString !== "string") return { valid: false, reason: "not-a-string" };
                const parts = keyString.trim().split(".");
                if (parts.length !== 3 || parts[0] !== "AXLR1") return { valid: false, reason: "bad-format" };
                const payloadBytes = b64urlDecode(parts[1]);
                const sigRaw = derToRaw(b64urlDecode(parts[2]));
                const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
                if (typeof payload.exp !== "number" || typeof payload.tier !== "string") return { valid: false, reason: "bad-payload" };
                if (Date.now() > payload.exp) return { valid: false, reason: "expired", expiresAt: payload.exp };
                const key = await this._importKey();
                const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sigRaw, payloadBytes);
                payloadBytes.fill(0); sigRaw.fill(0);
                if (!ok) { telemetry.count("license.rejected"); return { valid: false, reason: "bad-signature" }; }
                this._unlock(payload);
                telemetry.count("license.verified");
                return { valid: true, tier: payload.tier, org: payload.org || null, expiresAt: payload.exp };
            } catch (e) { return { valid: false, reason: "exception" }; }
        }
        _unlock(payload) {
            PremiumFlags.tier0_premium.value = true;
            PremiumFlags.customWorkplaceDictionary.value = true;
            PremiumFlags.p2pSyncLoops.value = true;
            PremiumFlags.org.value = payload.org || null;
            PremiumFlags.expiresAt.value = payload.exp;
        }
        async restoreFromStorage() {
            try {
                const stored = global.localStorage.getItem("axelr.license.v1");
                if (!stored) return { valid: false, reason: "none-stored" };
                const r = await this.verifyLicenseKey(stored);
                if (!r.valid) global.localStorage.removeItem("axelr.license.v1");
                return r;
            } catch (_) { return { valid: false, reason: "storage-error" }; }
        }
        store(keyString) { try { global.localStorage.setItem("axelr.license.v1", keyString); } catch (_) {} }
        static canUse(feature) { return !!(PremiumFlags[feature] && PremiumFlags[feature].value === true); }
    }

    // ── WarmupOrchestrator ───────────────────────────────────────────
    const WARMUP_METAPHONE_WORDS = "the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us is was were been has had did does doing done being am are would can could should may might must shall here where why when who whom whose which what that this those function class module package import export const let var async await promise array object string number boolean null undefined true false return break continue while if else switch case default try catch finally throw new this super static public private protected extend implement interface type react vue svelte angular next nuxt astro solid css html javascript typescript node npm yarn pnpm python rust go java ruby php docker kubernetes sql api endpoint server client request response database query select insert update delete where group order limit join table index column row schema their there they're to too two your you're its it's then than were we're where whose who's right write rite hear here weather whether affect effect accept except advice advise aloud allowed brake break buy by bye cite site sight complement compliment council counsel fair fare flour flower four fore".split(/\s+/).filter(w => w.length >= 3 && w.length <= 20);
    const WARMUP_MISSES = "recieve seperate occured definately acomodate basicly beggining beleive calender completly concious dissapear embarass enviroment exagerate excercise familly finaly foriegn freind goverment happend immediatly independant intrest knowlege maintainance neccessary noticable occassion offical oppurtunity paralell particularily perceive permanant posession prefered privilage probaly procede promiss pronounciation realy recieved recomend refered relevent religous remeber responsability rythm shedule similer sincerelly speach succesfull supress suprise tommorow tounge trueley unforseen untill usualy vaccum vegtable visable wether wierd".split(/\s+/);
    function yieldToEventLoop() { return new Promise(r => setTimeout(r, 0)); }
    class WarmupOrchestrator {
        constructor(engine, opts = {}) {
            this.engine = engine || null; this.opts = opts;
            this.cancelled = false;
            this.stats = { metaphone: 0, symspell: 0, cnn: 0, polish: 0 };
            this._startedAt = 0;
        }
        cancel() { this.cancelled = true; }
        async warm(onProgress) {
            if (this.cancelled) return { ok: false, reason: "cancelled" };
            this._startedAt = performance.now();
            const progress = (n) => { if (onProgress) try { onProgress(n); } catch (_) {} };
            if (NS.metaphone && typeof NS.metaphone === "function") {
                const total = WARMUP_METAPHONE_WORDS.length;
                for (let i = 0; i < total; i += 16) {
                    if (this.cancelled) return { ok: false, reason: "cancelled" };
                    const end = Math.min(i + 16, total);
                    for (let j = i; j < end; j++) try { NS.metaphone(WARMUP_METAPHONE_WORDS[j]); this.stats.metaphone++; } catch (_) {}
                    progress(0.4 * (end / total));
                    await yieldToEventLoop();
                }
            }
            if (this.engine && this.engine.symspell) {
                const total = WARMUP_MISSES.length;
                for (let i = 0; i < total; i += 8) {
                    if (this.cancelled) return { ok: false, reason: "cancelled" };
                    const end = Math.min(i + 8, total);
                    for (let j = i; j < end; j++) try { this.engine.symspell.lookup(WARMUP_MISSES[j], 2); this.stats.symspell++; } catch (_) {}
                    progress(0.4 + 0.3 * (end / total));
                    await yieldToEventLoop();
                }
            }
            if (this.engine && this.engine.cnn) {
                const samples = ["hello","world","function","react","the","and","quick","brown"];
                for (let i = 0; i < samples.length; i++) {
                    if (this.cancelled) return { ok: false, reason: "cancelled" };
                    try { this.engine.cnn.score(samples[i]); this.stats.cnn++; } catch (_) {}
                }
                try { this.engine.cnn.suggest("helloo", -5.0, 1); this.stats.cnn++; } catch (_) {}
                progress(0.75);
                await yieldToEventLoop();
            }
            if (NS.polish && typeof NS.polish === "function") {
                const samples = ["hello world this is a test","the quick brown fox jumps over the lazy dog","please send me five hundred dollars by january fifth twenty twenty four","first open the file second edit the contents third save the changes","how do you feel about the weather today"];
                for (const s of samples) {
                    if (this.cancelled) return { ok: false, reason: "cancelled" };
                    try { NS.polish(s); this.stats.polish++; } catch (_) {}
                }
                progress(0.92);
            }
            progress(1.0);
            const elapsedMs = performance.now() - this._startedAt;
            telemetry.count("warmup.complete");
            log(3, `warmup ${elapsedMs.toFixed(1)}ms:`, this.stats);
            return { ok: true, elapsedMs, stats: this.stats };
        }
    }

    // ── ZTPSPermissionManager ────────────────────────────────────────
    class ZTPSPermissionManager {
        constructor() {
            this._cache = new Map();
            this._revoked = new Set();
            this._hooks = { onGranted: null, onDenied: null, onRevoked: null };
        }
        on(ev, fn) { if (ev in this._hooks) this._hooks[ev] = fn; }
        async request(type, opts = {}) {
            if (this._revoked.has(type)) { telemetry.error(ERR.E_PERM_DENIED, type + ":revoked"); return { ok: false, reason: "revoked" }; }
            const cached = this._cache.get(type);
            if (cached && cached.state === "granted" && Date.now() - cached.ts < 60000) return { ok: true, cached: true };
            try {
                const rawCfg = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
                const cleanCfg = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
                let audioCfg;
                if (type === "microphone" || type === "microphone-raw") audioCfg = rawCfg;
                else if (type === "microphone-clean") audioCfg = cleanCfg;
                else throw new Error("unknown permission type: " + type);
                const stream = await navigator.mediaDevices.getUserMedia({ audio: Object.assign({}, audioCfg, opts.audio || {}) });
                this._cache.set(type, { state: "granted", ts: Date.now() });
                if (this._hooks.onGranted) try { this._hooks.onGranted(type); } catch (_) {}
                return { ok: true, stream };
            } catch (e) {
                this._cache.set(type, { state: "denied", ts: Date.now() });
                telemetry.error(ERR.E_PERM_DENIED, type + ":" + e.message);
                if (this._hooks.onDenied) try { this._hooks.onDenied(type, e); } catch (_) {}
                return { ok: false, reason: e.message };
            }
        }
        revoke(type) {
            this._revoked.add(type);
            this._cache.delete(type);
            telemetry.count("perm.revoke." + type);
            if (this._hooks.onRevoked) try { this._hooks.onRevoked(type); } catch (_) {}
        }
        isRevoked(type) { return this._revoked.has(type); }
        state(type) { return this._cache.get(type) || { state: "prompt" }; }
        dispose() { this._cache.clear(); this._revoked.clear(); this._hooks = {}; }
    }

    NS.SettingsRegistry = SettingsRegistry;
    NS.LicenseVerifier = LicenseVerifier;
    NS.WarmupOrchestrator = WarmupOrchestrator;
    NS.ZTPSPermissionManager = ZTPSPermissionManager;
    NS.Setup = {
        SettingsRegistry,
        LicenseVerifier,
        WarmupOrchestrator,
        get LazyConsent() { return NS.LazyConsent; },
        get VADCalibrator() { return NS.VADCalibrator; },
        ZTPSPermissionManager,
        registry: null, verifier: null, permissions: null, consent: null,

        async init() {
            if (!NS.Setup.registry) NS.Setup.registry = new SettingsRegistry();
            if (!NS.Setup.verifier) NS.Setup.verifier = new LicenseVerifier();
            if (!NS.Setup.permissions) NS.Setup.permissions = new ZTPSPermissionManager();
            if (!NS.Setup.consent && NS.LazyConsent) {
                NS.Setup.consent = new NS.LazyConsent();
            }
            await NS.Setup.verifier.restoreFromStorage();
            return NS.Setup;
        },

        async onboard(engine, opts = {}) {
            const calibrator = new NS.VADCalibrator(NS.Setup.registry, opts.calibrationHooks || {});
            const warmup = new WarmupOrchestrator(engine, {});
            const [calibResult, warmResult] = await Promise.all([
                opts.skipCalibration ? Promise.resolve({ ok: false, reason: "skipped" }) : calibrator.calibrate(opts.calibrationMs || 3000),
                warmup.warm(opts.warmupProgress)
            ]);
            return { calibration: calibResult, warmup: warmResult, calibrator };
        },

        attach(engine) { return NS.Setup.registry ? NS.Setup.registry.applyToEngine(engine) : (() => {}); },

        dispose() {
            if (NS.Setup.registry) { NS.Setup.registry.dispose(); NS.Setup.registry = null; }
            if (NS.Setup.permissions) { NS.Setup.permissions.dispose(); NS.Setup.permissions = null; }
            NS.Setup.verifier = null;
        }
    };

    log(3, "setup loaded (Settings + License + Warmup + ZTPS)");
})(typeof window !== "undefined" ? window : self);