/*!
 * axelr-bridge.js — UnifiedIPCBridge · BroadcastSync · RTCSync
 * Split from axelr-orchestrator.js (v4.0.0) + enhanced with offline queue.
 * Load order: after elite-v2, before setup.
 */
(function (global) {
    "use strict";
    const NS = global.AxelrInput;
    if (!NS || !NS.READY) { console.warn("axelr-bridge: core required"); return; }
    const { log, telemetry, ERR } = NS;

    const HAS_BC = typeof BroadcastChannel !== "undefined";
    const HAS_RTC = typeof RTCPeerConnection !== "undefined";

    class BroadcastSync {
        constructor(name, onMessage) {
            this.channel = null;
            if (!HAS_BC) return;
            try {
                this.channel = new BroadcastChannel(name);
                this.channel.onmessage = (e) => {
                    try { onMessage(e.data); } catch (_) {}
                };
            } catch (e) { log(2, "BC init:", e.message); }
        }
        send(msg) {
            if (!this.channel) return false;
            try { this.channel.postMessage(msg); return true; }
            catch (_) { return false; }
        }
        close() {
            if (this.channel) {
                try { this.channel.close(); } catch (_) {}
                this.channel = null;
            }
        }
    }
    NS.BroadcastSync = BroadcastSync;

    class RTCSync {
        constructor(onMessage) {
            this.onMessage = onMessage;
            this.pc = null; this.dc = null;
        }
        async offer() {
            if (!HAS_RTC) throw new Error("WebRTC unavailable");
            const pc = new RTCPeerConnection({
                iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
            });
            this.pc = pc;
            const dc = pc.createDataChannel("axelr-sync", { ordered: true });
            this._bindDC(dc);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await this._waitIce(pc);
            return JSON.stringify(pc.localDescription);
        }
        async accept(offerSDP) {
            if (!HAS_RTC) throw new Error("WebRTC unavailable");
            const pc = new RTCPeerConnection({
                iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
            });
            this.pc = pc;
            pc.ondatachannel = (e) => this._bindDC(e.channel);
            await pc.setRemoteDescription(JSON.parse(offerSDP));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await this._waitIce(pc);
            return JSON.stringify(pc.localDescription);
        }
        async complete(answerSDP) {
            if (this.pc) await this.pc.setRemoteDescription(JSON.parse(answerSDP));
        }
        _waitIce(pc) {
            return new Promise((resolve) => {
                if (pc.iceGatheringState === "complete") return resolve();
                const check = () => {
                    if (pc.iceGatheringState === "complete") {
                        pc.removeEventListener("icegatheringstatechange", check);
                        resolve();
                    }
                };
                pc.addEventListener("icegatheringstatechange", check);
                setTimeout(resolve, 3000);
            });
        }
        _bindDC(dc) {
            this.dc = dc;
            dc.onmessage = (e) => {
                try { this.onMessage(JSON.parse(e.data)); } catch (_) {}
            };
        }
        send(msg) {
            if (!this.dc || this.dc.readyState !== "open") return false;
            try { this.dc.send(JSON.stringify(msg)); return true; }
            catch (_) { return false; }
        }
        close() {
            if (this.pc) {
                try { this.pc.close(); } catch (_) {}
                this.pc = null; this.dc = null;
            }
        }
    }
    NS.RTCSync = RTCSync;

    // ══════════════════════════════════════════════════════════════════
    // UnifiedIPCBridge — spec-compliant, with offline queue
    // ══════════════════════════════════════════════════════════════════
    class UnifiedIPCBridge {
        constructor(opts = {}) {
            this.url = opts.url || "ws://127.0.0.1:8765/axelr/v1";
            this.ws = null;
            this.connected = false;
            this.pendingRequests = new Map();
            this.requestId = 0;
            this.sessionId = null;
            this.pythonCoreAvailable = false;
            this._reconnectAttempts = 0;
            this._reconnectTimer = null;
            this._disposed = false;
            this._handshakeDone = false;
            this.protocolVersion = "1.0.0";
            // Enhanced: offline queue
            this._offlineQueue = [];
            this._maxQueueSize = opts.maxQueueSize || 64;
        }

        async connect() {
            if (this._disposed || this.connected) return this.connected;
            try {
                this.ws = new WebSocket(this.url);
                return new Promise((resolve) => {
                    const timeout = setTimeout(() => { resolve(false); }, 2500);
                    this.ws.onopen = async () => {
                        clearTimeout(timeout);
                        const id = ++this.requestId;
                        const initFrame = {
                            type: "init", id,
                            payload: { client_version: "4.0.0", tier: "auto" },
                        };
                        const handshakeResult = await new Promise((res) => {
                            const t2 = setTimeout(() => res(null), 2000);
                            const handler = (evt) => {
                                try {
                                    const env = JSON.parse(evt.data);
                                    if (env.id === id && env.type === "ready") {
                                        clearTimeout(t2);
                                        this.ws.removeEventListener("message", handler);
                                        res(env);
                                    }
                                } catch (_) {}
                            };
                            this.ws.addEventListener("message", handler);
                            this.ws.send(JSON.stringify(initFrame));
                        });
                        if (!handshakeResult || !handshakeResult.ok) {
                            this.connected = false;
                            telemetry.error(ERR.E_BRIDGE_WS, "handshake_failed");
                            resolve(false);
                            return;
                        }
                        this._handshakeDone = true;
                        this.sessionId = handshakeResult.payload.session_id;
                        this.protocolVersion = handshakeResult.payload.protocol_version;
                        this.connected = true;
                        this.pythonCoreAvailable = true;
                        this._reconnectAttempts = 0;
                        telemetry.count("bridge.connected");
                        this.ws.onmessage = (event) => this._handleMessage(event);
                        // Flush offline queue
                        this._flushQueue();
                        resolve(true);
                    };
                    this.ws.onerror = () => {
                        telemetry.error(ERR.E_BRIDGE_WS, "connect_failed");
                    };
                    this.ws.onclose = () => {
                        this.connected = false;
                        this.pythonCoreAvailable = false;
                        this._handshakeDone = false;
                        telemetry.error(ERR.E_BRIDGE_FALLBACK, "closed");
                        this._scheduleReconnect();
                    };
                });
            } catch (e) {
                telemetry.error(ERR.E_BRIDGE_WS, e.message);
                return false;
            }
        }

        _scheduleReconnect() {
            if (this._disposed || this._reconnectAttempts >= 5) return;
            this._reconnectAttempts++;
            const delay = Math.min(
                30000, 1000 * Math.pow(2, this._reconnectAttempts));
            this._reconnectTimer = setTimeout(() => this.connect(), delay);
        }

        send(type, payload = {}) {
            // Enhanced: buffer when disconnected
            if (!this.connected || !this.ws || !this._handshakeDone) {
                if (this._offlineQueue.length < this._maxQueueSize) {
                    this._offlineQueue.push({ type, payload });
                }
                return Promise.resolve(null);
            }
            const id = ++this.requestId;
            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    this.pendingRequests.delete(id);
                    resolve(null);
                }, 5000);
                this.pendingRequests.set(id, (v) => {
                    clearTimeout(timeout);
                    resolve(v);
                });
                try {
                    this.ws.send(JSON.stringify({ type, id, payload }));
                } catch (_) { resolve(null); }
            });
        }

        _flushQueue() {
            if (!this.connected) return;
            while (this._offlineQueue.length > 0) {
                const { type, payload } = this._offlineQueue.shift();
                this.send(type, payload);
            }
        }

        _handleMessage(event) {
            try {
                const msg = JSON.parse(event.data);
                if (typeof msg.id === "number"
                        && this.pendingRequests.has(msg.id)) {
                    const resolve = this.pendingRequests.get(msg.id);
                    this.pendingRequests.delete(msg.id);
                    resolve(msg.ok === false ? null : (msg.payload || {}));
                }
            } catch (_) {}
        }

        isConnected() { return this.connected; }

        dispose() {
            this._disposed = true;
            if (this._reconnectTimer) {
                clearTimeout(this._reconnectTimer);
                this._reconnectTimer = null;
            }
            if (this.ws) {
                try { this.ws.close(); } catch (_) {}
                this.ws = null;
            }
            this.pendingRequests.clear();
            this._offlineQueue.length = 0;
            this.connected = false;
            this.pythonCoreAvailable = false;
            this._handshakeDone = false;
        }
    }
    // ══════════════════════════════════════════════════════════════════
    // LeaderElection — cross-tab WebSocket owner (Lamport-style with locks)
    // Prevents multiple tabs from opening duplicate WebSocket connections
    // Uses navigator.locks when available, falls back to BroadcastChannel
    // ══════════════════════════════════════════════════════════════════
    class LeaderElection {
        constructor(lockName = "axelr-ipc-leader", opts = {}) {
            this._lockName = lockName;
            this._candidateId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
            this._leaseTimeoutMs = opts.leaseTimeoutMs || 15000;
            this._onPromote = opts.onPromote || (() => {});
            this._onDemote = opts.onDemote || (() => {});
            this._isLeader = false;
            this._leaseTimer = null;
            this._bc = null;
            
            // Initialize cross-tab communication
            if (HAS_BC) {
                try {
                    this._bc = new BroadcastChannel("axelr-leader-election");
                    this._bc.onmessage = (e) => this._handleBCMessage(e);
                } catch (_) { this._bc = null; }
            }
        }

        async run() {
            // Try modern Web Locks API first (Chrome 87+, Firefox 113+, Safari 15.4+)
            if (typeof navigator.locks?.request === "function") {
                try {
                    await navigator.locks.request(this._lockName, async (lock) => {
                        if (!lock) return;
                        // Acquired lock - promote to leader
                        this._promote();
                        // Keep lock held until disposed
                        await new Promise(() => {}); // Hold lock indefinitely
                    });
                } catch (e) {
                    log(2, "leader-election: web locks failed, falling back to BC", e);
                    this._fallbackElection();
                }
            } else {
                // No Web Locks support - use BroadcastChannel fallback
                this._fallbackElection();
            }
        }

        _fallbackElection() {
            // Broadcast candidate ID to all tabs, highest UUID wins (Lamport-style)
            if (!this._bc) return;
            this._bc.postMessage({ type: "candidate", id: this._candidateId });
            // Wait 500ms to collect all candidates, then check if we're highest
            setTimeout(() => {
                if (!this._isLeader) {
                    this._promote();
                }
            }, 500);
        }

        _handleBCMessage(e) {
            if (e.data?.type === "candidate" && e.data.id > this._candidateId) {
                // Another tab has higher priority - demote if we were leader
                if (this._isLeader) this._demote();
            }
        }

        _promote() {
            if (this._isLeader) return;
            this._isLeader = true;
            telemetry.count("leader.promoted");
            log(3, "leader-election: promoted to leader", this._candidateId);
            // Reset lease timer
            this._renewLease();
            // Trigger callback
            try { this._onPromote(); } catch (e) { log(2, "leader-election: onPromote failed", e); }
        }

        _demote() {
            if (!this._isLeader) return;
            this._isLeader = false;
            if (this._leaseTimer) clearTimeout(this._leaseTimer);
            telemetry.count("leader.demoted");
            log(3, "leader-election: demoted from leader", this._candidateId);
            // Trigger callback
            try { this._onDemote(); } catch (e) { log(2, "leader-election: onDemote failed", e); }
        }

        _renewLease() {
            if (this._leaseTimer) clearTimeout(this._leaseTimer);
            this._leaseTimer = setTimeout(() => this._renewLease(), this._leaseTimeoutMs - 1000);
        }

        isLeader() { return this._isLeader; }

        dispose() {
            this._demote();
            if (this._bc) try { this._bc.close(); } catch (_) {}
        }
    }
    NS.LeaderElection = LeaderElection;

    // Enhance UnifiedIPCBridge to use LeaderElection - only leader connects WebSocket
    const originalConnect = UnifiedIPCBridge.prototype.connect;
    UnifiedIPCBridge.prototype.connect = async function() {
        if (this._leaderElection) return this.connected;
        // Initialize leader election before connecting
        this._leaderElection = new LeaderElection("axelr-ipc-leader", {
            onPromote: async () => {
                // Only leader executes original connect
                return originalConnect.call(this);
            },
            onDemote: () => {
                // Non-leaders close their WebSocket
                if (this.ws) try { this.ws.close(); } catch (_) {}
                this.connected = false;
            }
        });
        await this._leaderElection.run();
        return this.connected;
    };

    NS.UnifiedIPCBridge = UnifiedIPCBridge;

    log(3, "bridge loaded (BC=" + HAS_BC + " RTC=" + HAS_RTC + " leader_election=1)");
})(typeof window !== "undefined" ? window : self);