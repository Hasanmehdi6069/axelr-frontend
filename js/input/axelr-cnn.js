/*!
 * axelr-cnn.js — CharCNN (WebGL2 GPU + CPU fallback).
 * Split from axelr-correction.js v4.0.1 for size compliance.
 * Load order: after audio, before symspell.
 * Memory: ≈88 KB tables + 40 KB GPU state.
 */
(function (global) {
    "use strict";
    const NS = global.AxelrInput;
    if (!NS || !NS.READY) { console.warn("axelr-cnn: core required"); return; }
    const log = typeof NS.log === "function" ? NS.log : function () {};
    const telemetry = NS.telemetry || { count() {} };

    const V = 96, TRI_SIZE = 8192, MAX_WORD = 32, PAD_CODE = 96;

    function codeOf(c) {
        if (c >= 97 && c <= 122) return c - 97;
        if (c >= 65 && c <= 90) return c - 65 + 26;
        if (c >= 48 && c <= 57) return c - 48 + 52;
        if (c === 32) return 88;
        if (c === 39) return 89;
        if (c === 45) return 90;
        return 91 + (c & 3);
    }
    function charOf(code) {
        if (code < 26) return String.fromCharCode(97 + code);
        if (code < 52) return String.fromCharCode(65 + (code - 26));
        if (code < 62) return String.fromCharCode(48 + (code - 52));
        if (code === 88) return " ";
        if (code === 89) return "'";
        if (code === 90) return "-";
        return ".";
    }
    function fnv3(a, b, c) {
        let h = 0x811c9dc5 | 0;
        h = Math.imul(h ^ a, 0x01000193) | 0;
        h = Math.imul(h ^ b, 0x01000193) | 0;
        h = Math.imul(h ^ c, 0x01000193) | 0;
        return h >>> 0;
    }

    const LETTER_FREQ = { e: .12702, t: .09056, a: .08167, o: .07507, i: .06966, n: .06749, s: .06327, h: .06094, r: .05987, d: .04253, l: .04025, c: .02782, u: .02758, m: .02406, w: .0236, f: .02228, g: .02015, y: .01974, p: .01929, b: .01492, v: .00978, k: .00772, j: .00153, x: .0015, q: .00095, z: .00074, " ": .15 };
    const COMMON_BIGRAMS = ["th","he","in","er","an","re","on","at","en","nd","ti","es","or","te","of","ed","is","it","al","ar","st","to","nt","ng","se","ha","as","ou","io","le","ve","co","me","de","hi","ri","ro","ic","ne","ea","ra","ce"];
    const COMMON_TRIGRAMS = ["the","and","ing","her","ere","ent","tha","nth","was","eth","for","dth","hat","she","ion","tio","ver","all","out","thi","oul","uld","wor","but","are","ear","ead","ave","ngt","ome","ith","hes","ate","his","con","res"];

    function buildSeedWeights() {
        const uni = new Float32Array(V).fill(0.001);
        const bi = new Float32Array(V * V).fill(0.001);
        const tri = new Float32Array(TRI_SIZE).fill(0.001);
        for (const [ch, freq] of Object.entries(LETTER_FREQ)) uni[codeOf(ch.charCodeAt(0))] = freq;
        for (const bg of COMMON_BIGRAMS) bi[codeOf(bg.charCodeAt(0)) * V + codeOf(bg.charCodeAt(1))] = 0.05;
        for (const tg of COMMON_TRIGRAMS) {
            const h = fnv3(codeOf(tg.charCodeAt(0)), codeOf(tg.charCodeAt(1)), codeOf(tg.charCodeAt(2))) & (TRI_SIZE - 1);
            tri[h] = Math.min(1.0, tri[h] + 0.02);
        }
        return { uni, bi, tri, bias: 0 };
    }

    const HAS_WEBGL2 = (() => {
        try {
            const c = document.createElement("canvas");
            const gl = c.getContext("webgl2");
            if (!gl) return false;
            return !!gl.getExtension("EXT_color_buffer_float");
        } catch (_) { return false; }
    })();

    const RAF = typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : function (cb) { return setTimeout(cb, 16); };
    const CAF = typeof cancelAnimationFrame === "function"
        ? cancelAnimationFrame
        : function (id) { clearTimeout(id); };

    const VS_SRC = `#version 300 es
in vec2 a_pos; void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;

    const FS_SRC = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D u_tables; uniform sampler2D u_words;
uniform int u_numWords; uniform int u_wordLen; uniform int u_V; uniform int u_TRI;
out vec4 fragColor;
float tableAt(int idx){ int w=128; int x=idx-(idx/w)*w; int y=idx/w; return texelFetch(u_tables, ivec2(x,y), 0).r; }
int hash3(int a,int b,int c){
    int h = int(0x811c9dc5u);
    h = (h ^ a) * int(0x01000193u);
    h = (h ^ b) * int(0x01000193u);
    h = (h ^ c) * int(0x01000193u);
    return h & (u_TRI - 1);
}
void main(){
    int wordId = int(gl_FragCoord.x);
    if (wordId >= u_numWords) { fragColor = vec4(-999.0, 0.0, 0.0, 1.0); return; }
    float score = tableAt(u_V*u_V + u_V + u_TRI);
    int p1=0, p2=0, len=0;
    for (int i=0; i<32; i++){
        if (i >= u_wordLen) break;
        int c = int(texelFetch(u_words, ivec2(i, wordId), 0).r * 255.0);
        if (c >= 96) break;
        float u = tableAt(c);
        float b = tableAt(u_V + p1*u_V + c);
        int h = hash3(p2, p1, c);
        float t = tableAt(u_V + u_V*u_V + h);
        score += log(0.2*u + 0.3*b + 0.5*t + 1e-8);
        p2 = p1; p1 = c; len++;
    }
    if (len > 0) score /= float(len);
    fragColor = vec4(score, 0.0, 0.0, 1.0);
}`;

    class GLBackend {
        constructor(weights) {
            this.canvas = document.createElement("canvas");
            this.canvas.width = 1; this.canvas.height = 1;
            this.gl = this.canvas.getContext("webgl2", {
                premultipliedAlpha: false, preserveDrawingBuffer: false, antialias: false
            });
            if (!this.gl) throw new Error("webgl2 context lost");
            this._init(weights);
        }
        _init(w) {
            const gl = this.gl;
            const totalFloats = V + V * V + TRI_SIZE + 1;
            const texW = 128, texH = Math.ceil(totalFloats / texW);
            const tableData = new Float32Array(texW * texH * 4);
            let o = 0;
            for (let i = 0; i < V; i++) tableData[(o++) * 4] = w.uni[i];
            for (let i = 0; i < V * V; i++) tableData[(o++) * 4] = w.bi[i];
            for (let i = 0; i < TRI_SIZE; i++) tableData[(o++) * 4] = w.tri[i];
            tableData[(o++) * 4] = w.bias;

            this.tableTex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.tableTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, texW, texH, 0, gl.RGBA, gl.FLOAT, tableData);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

            this.wordMaxN = 1024;
            this.wordTex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.wordTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, MAX_WORD, this.wordMaxN, 0,
                gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(MAX_WORD * this.wordMaxN * 4));
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

            this.outTex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.outTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.wordMaxN, 1, 0, gl.RGBA, gl.FLOAT, null);
            this.fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.outTex, 0);
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
                throw new Error("fbo incomplete");

            const vs = this._compile(gl.VERTEX_SHADER, VS_SRC);
            const fs = this._compile(gl.FRAGMENT_SHADER, FS_SRC);
            this.prog = gl.createProgram();
            gl.attachShader(this.prog, vs);
            gl.attachShader(this.prog, fs);
            gl.linkProgram(this.prog);
            if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS))
                throw new Error("link: " + gl.getProgramInfoLog(this.prog));

            this.vao = gl.createVertexArray();
            gl.bindVertexArray(this.vao);
            const vbo = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            const loc = gl.getAttribLocation(this.prog, "a_pos");
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

            gl.useProgram(this.prog);
            this.uTables = gl.getUniformLocation(this.prog, "u_tables");
            this.uWords = gl.getUniformLocation(this.prog, "u_words");
            this.uNum = gl.getUniformLocation(this.prog, "u_numWords");
            this.uLen = gl.getUniformLocation(this.prog, "u_wordLen");
            gl.uniform1i(this.uTables, 0);
            gl.uniform1i(this.uWords, 1);
            gl.uniform1i(gl.getUniformLocation(this.prog, "u_V"), V);
            gl.uniform1i(gl.getUniformLocation(this.prog, "u_TRI"), TRI_SIZE);

            this.readBuf = new Float32Array(this.wordMaxN * 4);
            this._wordDataBuf = new Uint8Array(MAX_WORD * this.wordMaxN * 4);
        }
        _compile(type, src) {
            const gl = this.gl;
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
                throw new Error("compile: " + gl.getShaderInfoLog(s));
            return s;
        }
        scoreBatch(words, outScores, count, offset = 0) {
            const gl = this.gl;
            if (!gl) return 0;
            const n = Math.min(count == null ? words.length : count, this.wordMaxN);
            if (n === 0) return 0;
            const buf = this._wordDataBuf;
            buf.fill(PAD_CODE, 0, MAX_WORD * n * 4);
            let maxLen = 0;
            for (let i = 0; i < n; i++) {
                const w = String(words[offset + i] || "");
                const len = Math.min(w.length, MAX_WORD);
                if (len > maxLen) maxLen = len;
                const base = i * MAX_WORD;
                for (let j = 0; j < len; j++) buf[(base + j) * 4] = codeOf(w.charCodeAt(j));
            }
            gl.bindTexture(gl.TEXTURE_2D, this.wordTex);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAX_WORD, n, gl.RGBA, gl.UNSIGNED_BYTE, buf);
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tableTex);
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.wordTex);
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
            gl.viewport(0, 0, n, 1);
            gl.useProgram(this.prog);
            gl.uniform1i(this.uNum, n);
            gl.uniform1i(this.uLen, maxLen);
            gl.bindVertexArray(this.vao);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.readPixels(0, 0, n, 1, gl.RGBA, gl.FLOAT, this.readBuf);
            for (let i = 0; i < n; i++) outScores[offset + i] = this.readBuf[i * 4];
            return n;
        }
        dispose() {
            const gl = this.gl; if (!gl) return;
            try {
                gl.deleteTexture(this.tableTex);
                gl.deleteTexture(this.wordTex);
                gl.deleteTexture(this.outTex);
                gl.deleteFramebuffer(this.fbo);
                gl.deleteProgram(this.prog);
                gl.deleteVertexArray(this.vao);
            } catch (_) {}
            const lose = gl.getExtension("WEBGL_lose_context");
            if (lose) try { lose.loseContext(); } catch (_) {}
            this.gl = null; this.canvas = null; this.readBuf = null; this._wordDataBuf = null;
        }
    }

    class CharCNN {
        constructor(opts = {}) {
            this.weights = opts.weights || buildSeedWeights();
            this.backend = null;
            this._symspell = null;
            if (opts.gpu !== false && HAS_WEBGL2) {
                try { this.backend = new GLBackend(this.weights); }
                catch (e) {
                    log(2, "CharCNN GPU init failed, using CPU: " + (e && e.message));
                    this.backend = null;
                }
            }
        }
        _scoreCPU(word) {
            const u = this.weights.uni, b = this.weights.bi, t = this.weights.tri;
            const w = String(word || "");
            const n = Math.min(w.length, MAX_WORD);
            let score = this.weights.bias;
            let p1 = 0, p2 = 0, len = 0;
            for (let i = 0; i < n; i++) {
                const c = codeOf(w.charCodeAt(i));
                const uu = u[c];
                const bb = b[p1 * V + c];
                const h = fnv3(p2, p1, c) & (TRI_SIZE - 1);
                const tt = t[h];
                score += Math.log(0.2 * uu + 0.3 * bb + 0.5 * tt + 1e-8);
                p2 = p1; p1 = c; len++;
            }
            return len > 0 ? score / len : score;
        }
        score(word) {
            if (this.backend) {
                const out = [0];
                this.backend.scoreBatch([String(word || "")], out, 1, 0);
                return out[0];
            }
            return this._scoreCPU(word);
        }
        scoreBatch(words) {
            const n = words.length;
            if (n === 0) return new Float32Array(0);
            const out = new Float32Array(n);
            if (this.backend) this.backend.scoreBatch(words, out, n, 0);
            else for (let i = 0; i < n; i++) out[i] = this._scoreCPU(words[i]);
            return out;
        }
        suggest(word, threshold = -5.0, count = 1) {
            if (!word || typeof word !== "string") return [];
            if (word.length < 3 || word.length > MAX_WORD) return [];

            const SymSpellCtor = NS.SymSpell;
            if (typeof SymSpellCtor !== "function") return [];

            if (!this._symspell) {
                try {
                    this._symspell = new SymSpellCtor(2);
                    this._symspell.ensureBuilt();
                } catch (_) {
                    this._symspell = null;
                    return [];
                }
            }

            try {
                const hits = this._symspell.lookup(word, 2);
                const out = [];
                for (const h of hits) {
                    if (h.word && h.word !== word && out.indexOf(h.word) === -1) {
                        out.push(h.word);
                        if (out.length >= count) break;
                    }
                }
                return out;
            } catch (_) {
                return [];
            }
        }
        dispose() {
            if (this.backend) { this.backend.dispose(); this.backend = null; }
            if (this._symspell) { try { this._symspell.dispose(); } catch (_) {} this._symspell = null; }
            this.weights = null;
        }
    }

    class StreamingModelLoader {
        constructor(url, chunkSize = 4 * 1024 * 1024) {
            this.url = url; this.chunkSize = chunkSize;
        }
        async load(onProgress) {
            const head = await fetch(this.url, { method: "HEAD" });
            const total = parseInt(head.headers.get("content-length") || "0", 10);
            const buf = new Uint8Array(total);
            let off = 0;
            while (off < total) {
                const end = Math.min(off + this.chunkSize, total);
                const resp = await fetch(this.url, {
                    headers: { Range: `bytes=${off}-${end - 1}` },
                });
                const chunk = new Uint8Array(await resp.arrayBuffer());
                buf.set(chunk, off);
                off = end;
                if (onProgress) onProgress(off, total);
                await new Promise(r => setTimeout(r, 0));  // yield event loop
            }
            return buf;
        }
    }

    NS.StreamingModelLoader = StreamingModelLoader;
    NS.CharCNN = CharCNN;
    NS.GLBackend = GLBackend;
    NS.CharCNNUtils = Object.freeze({ HAS_WEBGL2, V, TRI_SIZE, MAX_WORD, codeOf, charOf, RAF, CAF });
    log(3, "cnn loaded (webgl2=" + HAS_WEBGL2 + ")");
})(typeof window !== "undefined" ? window : self);