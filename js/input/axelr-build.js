#!/usr/bin/env node
/*!
 * axelr-build.js — Concatenate main files in strict boot order.
 * Worker + worklet copied separately (isolated contexts).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC = __dirname;
const OUT = path.join(SRC, "dist");

// MAIN bundle order (dependencies flow top→bottom)
const MAIN_FILES = [
    "axelr-core.js",
    "axelr-telemetry.js",       // NEW — must be early so counters exist
    "axelr-audio.js",
    "axelr-cnn.js",
    "axelr-symspell.js",
    "axelr-phonetic.js",
    "axelr-memory-lru.js",      // Elite: byte-bounded LFU+LRU
    "axelr-adaptive-confidence.js", // Elite: Bayesian threshold calibration
    "axelr-polish.js",
    "axelr-asr.js",
    "axelr-context.js",
    "axelr-ux.js",
    "axelr-resources.js",
    "axelr-elite-v2.js",        // 18 features after enhancement
    "axelr-bridge.js",          // UnifiedIPCBridge (base)
    "axelr-bridge-elite.js",    // NEW — wrappers
    "axelr-setup.js",
    "axelr-runtime-health.js",  // NEW — wires elite-v2 features
    "axelr-orchestrator.js",    // last (needs everything above)
];

const ISOLATED_FILES = ["axelr-worker.js", "axelr-worklet.js"];

function read(name) {
    const p = path.join(SRC, name);
    if (!fs.existsSync(p)) throw new Error("missing: " + p);
    return fs.readFileSync(p, "utf8").trim();
}

function banner(bytes) {
    return `/*!
 * AXELR Input Engine — Tier 0 ELITE Bundle
 * Version: 4.0.0 "SOVEREIGN"
 * Built: ${new Date().toISOString()}
 * Size: ${(bytes / 1024).toFixed(1)} KB
 * Modules: ${MAIN_FILES.length} main + ${ISOLATED_FILES.length} isolated
 * Deploy: COOP:same-origin + COEP:require-corp (SAB required)
 * 100% offline after model load.
 */
`;
}

console.time("build");

function build() {
    if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

    const bodies = MAIN_FILES.map(read);
    const manifest = MAIN_FILES.map((f, i) => {
        const bytes = Buffer.byteLength(bodies[i], "utf8");
        return { file: f, bytes, lines: bodies[i].split("\n").length };
    });

    // Duplicate class check
    const CRITICAL = new Set([
        "LocaleRegistry", "PolyfillPredictor", "VoicePipeline",
        "CharCNN", "DoubleArrayTrie", "SymSpell", "TokenRing",
    ]);
    const CLASS_PATTERN = /class\s+(\w+)/g;
    const seen = new Map();
    for (let i = 0; i < MAIN_FILES.length; i++) {
        const file = MAIN_FILES[i];
        const content = bodies[i];
        let m;
        while ((m = CLASS_PATTERN.exec(content)) !== null) {
            const cn = m[1];
            if (CRITICAL.has(cn)) {
                if (seen.has(cn)) {
                    throw new Error(
                        `[DUPLICATE_CLASS] '${cn}' in ${seen.get(cn)} and ${file}`);
                }
                seen.set(cn, file);
            }
        }
    }
    console.log("[PASS] Duplicate class check: 0 conflicts");

    const joined = bodies.join("\n\n");
    const full = banner(Buffer.byteLength(joined, "utf8")) + joined;
    const hash = crypto.createHash("sha256")
        .update(full).digest("hex").slice(0, 12);
    fs.writeFileSync(path.join(OUT, "axelr-bundle.js"), full, "utf8");

    for (const f of ISOLATED_FILES) {
        fs.copyFileSync(path.join(SRC, f), path.join(OUT, f));
    }

    const modelsDir = path.join(SRC, "..", "models");
    if (fs.existsSync(modelsDir)) {
        for (const f of fs.readdirSync(modelsDir)) {
            if (f.endsWith(".bin") || f.endsWith(".wasm") || f.endsWith(".onnx")) {
                fs.copyFileSync(path.join(modelsDir, f), path.join(OUT, f));
            }
        }
    }

    let minified = false;
    if (process.argv.includes("--minify") || process.env.NODE_ENV === "production") {
        const minDir = path.join(OUT, "minified");
        fs.mkdirSync(minDir, { recursive: true });
        for (const f of ["axelr-bundle.js", ...ISOLATED_FILES]) {
            execSync(
                `npx esbuild "${path.join(OUT, f)}" --minify --outfile="${path.join(minDir, f)}"`);
        }
        fs.copyFileSync(path.join(minDir, "axelr-bundle.js"),
                        path.join(OUT, "axelr-bundle.min.js"));
        minified = true;
    }

    const totalBytes = Buffer.byteLength(full, "utf8");
    fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({
        version: "4.0.0",
        builtAt: new Date().toISOString(),
        hash, totalBytes,
        totalKB: (totalBytes / 1024).toFixed(2),
        minified,
        modules: manifest,
        isolated: ISOLATED_FILES.map(f => ({
            file: f, bytes: fs.statSync(path.join(SRC, f)).size,
        })),
    }, null, 2));

    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║  AXELR Sovereign — Build Complete                            ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");
    console.log(`  Output:  dist/axelr-bundle.js`);
    console.log(`  Size:    ${(totalBytes / 1024).toFixed(1)} KB`);
    console.log(`  Hash:    ${hash}\n`);
    console.log("  Main modules:");
    for (const m of manifest) {
        console.log(`    ${m.file.padEnd(24)} ${(m.bytes / 1024).toFixed(1).padStart(7)} KB  ${String(m.lines).padStart(5)} lines`);
    }
    console.log(`\n  Isolated:`);
    for (const f of ISOLATED_FILES) {
        const b = fs.statSync(path.join(SRC, f)).size;
        console.log(`    ${f.padEnd(24)} ${(b / 1024).toFixed(1).padStart(7)} KB`);
    }
    console.log(`\n  Deploy: dist/axelr-bundle.js + ${ISOLATED_FILES.join(" + ")}`);
    console.log(`  Headers: COOP:same-origin  COEP:require-corp\n`);
}

build();
console.timeEnd("build");