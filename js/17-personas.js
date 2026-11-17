// js/17-personas.js — v1.0
// AXELR — Client-side Persona Store.
//
// Personas are pure user data. Multi-device sync is not a real requirement
// for most users, so we keep the store in the browser and sync only the
// `default_persona_id` to the server. This removes an endpoint from the
// API surface, removes DB writes on persona save, and reduces Mongo
// storage. Zero-cost, zero-network on the CRUD path.
//
// Composable model:
//     { id, name, base, modifiers: [..], systemPrompt, updatedAt }
// Runtime concatenates base + modifiers + systemPrompt into the final
// instruction string. 60-modals.js consumes `applyToRequest()`.
(function () {
    "use strict";
    window.Axelr = window.Axelr || {};

    const STORE_KEY   = "axelr_personas_v1";
    const DEFAULT_KEY = "axelr_default_persona_id";
    const MAX_PERSONAS = 50;
    const MAX_NAME     = 60;
    const MAX_PROMPT   = 4000;

    // ── Storage ─────────────────────────────────────────────────────
    function load() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch (_) { return []; }
    }

    function save(list) {
        try {
            const trimmed = list.slice(-MAX_PERSONAS);
            localStorage.setItem(STORE_KEY, JSON.stringify(trimmed));
            return true;
        } catch (_) { return false; }
    }

    function _newId() {
        return "p_" + Date.now().toString(36)
             + Math.random().toString(36).slice(2, 8);
    }

    // ── CRUD ────────────────────────────────────────────────────────
    function create({ name, base = "engineer", modifiers = [],
                      systemPrompt = "" } = {}) {
        if (!name || typeof name !== "string") return null;
        const list = load();
        if (list.length >= MAX_PERSONAS) return null;
        const persona = {
            id: _newId(),
            name: String(name).slice(0, MAX_NAME),
            base: String(base || "engineer").slice(0, 40),
            modifiers: Array.isArray(modifiers)
                ? modifiers.filter(m => typeof m === "string").slice(0, 8)
                : [],
            systemPrompt: String(systemPrompt || "").slice(0, MAX_PROMPT),
            updatedAt: Date.now(),
        };
        list.push(persona);
        save(list);
        return persona;
    }

    function update(id, patch = {}) {
        const list = load();
        const idx = list.findIndex(p => p.id === id);
        if (idx === -1) return null;
        const cur = list[idx];
        const next = {
            ...cur,
            name: patch.name !== undefined ? String(patch.name).slice(0, MAX_NAME) : cur.name,
            base: patch.base !== undefined ? String(patch.base).slice(0, 40) : cur.base,
            modifiers: patch.modifiers !== undefined
                ? (Array.isArray(patch.modifiers)
                    ? patch.modifiers.filter(m => typeof m === "string").slice(0, 8)
                    : cur.modifiers)
                : cur.modifiers,
            systemPrompt: patch.systemPrompt !== undefined
                ? String(patch.systemPrompt).slice(0, MAX_PROMPT)
                : cur.systemPrompt,
            updatedAt: Date.now(),
        };
        list[idx] = next;
        save(list);
        return next;
    }

    function remove(id) {
        const list = load();
        const filtered = list.filter(p => p.id !== id);
        if (filtered.length === list.length) return false;
        save(filtered);
        if (getDefaultId() === id) setDefaultId(null);
        return true;
    }

    function get(id) { return load().find(p => p.id === id) || null; }
    function list() { return load(); }

    // ── Default selection ───────────────────────────────────────────
    function getDefaultId() {
        try { return localStorage.getItem(DEFAULT_KEY) || null; }
        catch (_) { return null; }
    }
    function setDefaultId(id) {
        try {
            if (id) localStorage.setItem(DEFAULT_KEY, id);
            else localStorage.removeItem(DEFAULT_KEY);
        } catch (_) {}
    }

    // ── Runtime composition ─────────────────────────────────────────
    const BASE_PREAMBLE = {
        engineer: "You are a senior software engineer.",
        designer: "You are a senior UI/UX designer.",
        analyst:  "You are a senior data analyst.",
        writer:   "You are a professional technical writer.",
        researcher: "You are a careful researcher.",
    };

    function composeSystemPrompt(persona) {
        if (!persona) return "";
        const parts = [];
        parts.push(BASE_PREAMBLE[persona.base] || BASE_PREAMBLE.engineer);
        if (persona.modifiers.length) {
            parts.push("Active directives: " + persona.modifiers.join("; ") + ".");
        }
        if (persona.systemPrompt) parts.push(persona.systemPrompt);
        return parts.join("\n\n");
    }

    /**
     * Return the composed system prompt for the currently-default persona,
     * or "" if none. Callers (e.g. executeCommand) prepend this to the
     * outbound form data as `systemExtra`.
     */
    function applyToRequest() {
        const id = getDefaultId();
        if (!id) return "";
        return composeSystemPrompt(get(id));
    }

    // ── Publish ─────────────────────────────────────────────────────
    window.Axelr.Personas = {
        create, update, remove, get, list,
        getDefaultId, setDefaultId,
        composeSystemPrompt, applyToRequest,
    };
})();