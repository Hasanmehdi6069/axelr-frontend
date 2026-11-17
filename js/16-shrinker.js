// js/16-shrinker.js
// AXELR — Client-side token shrinker
// Minifies large code blocks in outgoing prompts before they hit the network.
// Preserves public API surface and semantic structure. Zero server cost.
(function () {
    "use strict";
    window.Axelr = window.Axelr || {};

    const MIN_BLOCK_BYTES_TO_SHRINK = 2000;   // don't touch small snippets
    const MAX_OUTPUT_BYTES = 40000;           // hard ceiling on shrinker output

    // ── JS/TS minifier (conservative — never removes identifiers) ───
    function shrinkJS(code) {
        return code
            // strip /* block comments */ (multi-line, non-greedy)
            .replace(/\/\*[\s\S]*?\*\//g, "")
            // strip // line comments (but not URLs after ://)
            .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
            // collapse runs of blank lines
            .replace(/\n{3,}/g, "\n\n")
            // collapse trailing whitespace
            .replace(/[ \t]+\n/g, "\n")
            // collapse leading whitespace on lines to single tab (keeps readability)
            .trim();
    }

    // ── Python minifier ─────────────────────────────────────────────
    function shrinkPy(code) {
        return code
            // strip # line comments (but not # inside strings — approximate)
            .replace(/(^|[^"'#])#[^\n]*/g, "$1")
            // strip docstrings on their own line
            .replace(/^\s*("""[\s\S]*?"""|'''[\s\S]*?''')\s*$/gm, "")
            .replace(/\n{3,}/g, "\n\n")
            .replace(/[ \t]+\n/g, "\n")
            .trim();
    }

    // ── JSON minifier ───────────────────────────────────────────────
    function shrinkJSON(code) {
        try { return JSON.stringify(JSON.parse(code)); }
        catch (_) { return code; }
    }

    // ── CSS minifier ────────────────────────────────────────────────
    function shrinkCSS(code) {
        return code
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\s+/g, " ")
            .replace(/\s*([{}:;,])\s*/g, "$1")
            .trim();
    }

    // ── HTML (very conservative — only strips HTML comments) ────────
    function shrinkHTML(code) {
        return code.replace(/<!--[\s\S]*?-->/g, "").trim();
    }

    // ── Router ──────────────────────────────────────────────────────
    function shrinkFencedBlock(lang, body) {
        const l = (lang || "").toLowerCase();
        if (body.length < MIN_BLOCK_BYTES_TO_SHRINK) return body;
        let out = body;
        try {
            if (l === "javascript" || l === "js" || l === "typescript" || l === "ts" || l === "tsx" || l === "jsx") out = shrinkJS(body);
            else if (l === "python" || l === "py") out = shrinkPy(body);
            else if (l === "json") out = shrinkJSON(body);
            else if (l === "css") out = shrinkCSS(body);
            else if (l === "html") out = shrinkHTML(body);
        } catch (_) { out = body; }
        return out.length < body.length ? out : body;
    }

    // ── Public: shrink a full prompt's fenced code blocks ──────────
    const FENCE_RE = /```([a-zA-Z0-9_+\-]*)\n([\s\S]*?)```/g;
    function shrinkPrompt(prompt) {
        if (!prompt || prompt.length < MIN_BLOCK_BYTES_TO_SHRINK) return prompt;
        let out = prompt.replace(FENCE_RE, (full, lang, body) => {
            const shrunk = shrinkFencedBlock(lang, body);
            return "```" + lang + "\n" + shrunk + "\n```";
        });
        if (out.length > MAX_OUTPUT_BYTES) out = out.slice(0, MAX_OUTPUT_BYTES);
        return out;
    }

    window.Axelr.TokenShrinker = { shrinkPrompt };
})();