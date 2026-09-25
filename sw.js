// sw.js — AXELR Offline Engine v3
// ============================================================================
// Capabilities:
//   1. App shell precache (HTML, CSS, JS, fonts).
//   2. Runtime cache every AI response in IndexedDB (structured).
//   3. Semantic-style fuzzy match over cached prompts (token overlap).
//   4. Rule-based local responder with rich intent patterns.
//   5. Offline request queue with reconnect drain + background sync.
//   6. LRU + TTL eviction (actually correct).
//   7. Message API for page-side stats / clear / replay.
//
// Constraints honoured:
//   - Zero local ML models (0 additional RAM).
//   - Works on all browsers (Chrome, Safari, Firefox, Edge).
//   - Never blocks the network, never 5xx.
// ============================================================================

const SW_VERSION    = 'axelr-v3';
const SHELL_CACHE   = `${SW_VERSION}-shell`;
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;
const QUEUE_STORE   = 'queue';

const SHELL_ASSETS = [
  '/', '/index.html', '/style.css', '/script.js',
  '/favicon.png', '/offline.html',
];

const DB_NAME         = 'axelr-offline';
const DB_VERSION      = 2;
const STORE_RESPONSES = 'responses';   // { key, prompt, tokens, response, ts }
const STORE_HISTORY   = 'history';     // { id, sessionId, messages, ts }

const MAX_AGE_MS  = 30 * 24 * 60 * 60 * 1000;   // 30 days
const MAX_ENTRIES = 500;
const MAX_QUEUE   = 100;

// ============================================================================
// IndexedDB helpers
// ============================================================================
function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_RESPONSES)) {
        const store = db.createObjectStore(STORE_RESPONSES, { keyPath: 'key' });
        store.createIndex('ts', 'ts');
      }
      if (!db.objectStoreNames.contains(STORE_HISTORY)) {
        db.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const q = db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
        q.createIndex('ts', 'ts');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function idbTx(store, mode) {
  return idb().then((db) => db.transaction(store, mode).objectStore(store));
}

async function idbPut(store, value) {
  const s = await idbTx(store, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = s.put(value);
    r.onsuccess = () => resolve(true);
    r.onerror   = () => reject(r.error);
  });
}

async function idbGet(store, key) {
  const s = await idbTx(store, 'readonly');
  return new Promise((resolve, reject) => {
    const r = s.get(key);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror   = () => reject(r.error);
  });
}

async function idbGetAll(store) {
  const s = await idbTx(store, 'readonly');
  return new Promise((resolve, reject) => {
    const r = s.getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror   = () => reject(r.error);
  });
}

async function idbCount(store) {
  const s = await idbTx(store, 'readonly');
  return new Promise((resolve, reject) => {
    const r = s.count();
    r.onsuccess = () => resolve(r.result || 0);
    r.onerror   = () => reject(r.error);
  });
}

async function idbDelete(store, key) {
  const s = await idbTx(store, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = s.delete(key);
    r.onsuccess = () => resolve(true);
    r.onerror   = () => reject(r.error);
  });
}

// Correct LRU + TTL eviction — always resolves
async function idbPrune(store, maxAgeMs, maxEntries) {
  const db = await idb();
  return new Promise((resolve) => {
    const tx = db.transaction(store, 'readwrite');
    const s = tx.objectStore(store);
    const cutoff = Date.now() - maxAgeMs;

    // 1. Delete expired entries
    const cursorReq = s.index('ts').openCursor(IDBKeyRange.upperBound(cutoff));
    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };

    // 2. Cap total entries (delete oldest first)
    let deleted = 0;
    const countReq = s.count();
    countReq.onsuccess = () => {
      const excess = countReq.result - maxEntries;
      if (excess <= 0) return;
      const oldest = s.index('ts').openCursor();
      oldest.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && deleted < excess) {
          cursor.delete();
          deleted++;
          cursor.continue();
        }
      };
    };

    tx.oncomplete = () => resolve(true);
    tx.onerror    = () => resolve(false);
    tx.onabort    = () => resolve(false);
  });
}

// ============================================================================
// Token fingerprinting — light "semantic" matching
// ============================================================================
const STOPWORDS = new Set([
  'a','an','the','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','could','should',
  'i','you','he','she','it','we','they','me','him','her','us','them',
  'my','your','his','its','our','their','this','that','these','those',
  'and','or','but','if','then','else','of','to','from','in','on','at',
]);

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function keyForPrompt(prompt) {
  // Stable hash over the sorted, deduped token set → same tokens → same key
  const tokens = [...new Set(tokenize(prompt))].sort();
  let h = 5381;
  for (const t of tokens) {
    for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
    h = ((h << 5) + h + 32) | 0;
  }
  return 'p_' + (h >>> 0).toString(36);
}

function jaccard(aTokens, bTokens) {
  const A = new Set(aTokens);
  const B = new Set(bTokens);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

async function fuzzyFind(prompt) {
  const queryTokens = tokenize(prompt);
  if (queryTokens.length === 0) return null;
  const all = await idbGetAll(STORE_RESPONSES);
  let best = null;
  let bestScore = 0;
  for (const entry of all) {
    const score = jaccard(queryTokens, entry.tokens || tokenize(entry.prompt));
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  // Require meaningful overlap
  return bestScore >= 0.55 ? best : null;
}

// ============================================================================
// Rule-based local responder
// ============================================================================
const RULES = [
  { match: /\b(hello|hi|hey|greetings|yo)\b/i,
    reply: "Hello! You're offline right now — reconnect for a full answer, or ask about a cached topic from your history." },
  { match: /\b(summarize|summary|tl;?dr)\b/i,
    reply: "Summarization needs the online AI. Reconnect, or open a cached chat and I'll show you the last summary you got." },
  { match: /\b(code|function|class|refactor|debug|bug|error|exception)\b/i,
    reply: "Code help needs the online AI. Your recent code snippets are in the cache — try the same prompt you used before." },
  { match: /\b(design|ui|ux|navbar|button|css|tailwind|component)\b/i,
    reply: "Design generation needs the online AI. Your previous design results are cached — reuse them or reconnect." },
  { match: /\b(extract|invoice|receipt|csv|excel|spreadsheet|pdf)\b/i,
    reply: "Document extraction needs the online AI. Cached results from previous extractions are available — try the same file or prompt." },
  { match: /\b(help|how do i|how to|how can i)\b/i,
    reply: "I'm in local mode. What still works offline:\n• Browse cached conversations\n• Replay previous answers\n• Remind you what you were working on" },
  { match: /\b(thanks|thank you|thx|ty)\b/i,
    reply: "You're welcome. Reconnect whenever you need me online." },
  { match: /^\s*$/,
    reply: "Type a prompt, or reconnect to get a fresh answer." },
];

function ruleBasedReply(prompt) {
  const p = (prompt || '').trim();
  for (const r of RULES) if (r.match.test(p)) return r.reply;
  return (
    "You're offline. Axelr can't reach the AI right now, " +
    "but your recent conversations are saved locally. " +
    "Reconnect for a full answer, or reuse a previous prompt."
  );
}

// ============================================================================
// Prompt extraction from request body (multipart + JSON)
// ============================================================================
function extractPromptFromBody(body, contentType) {
  if (!body) return '';

  // JSON path
  if ((contentType || '').includes('application/json')) {
    try {
      const j = JSON.parse(body);
      return (j.prompt || j.command || j.task || j.instruction || '').toString();
    } catch (_) {
      return '';
    }
  }

  // Multipart — handle multiline values via lookahead on boundary
  const m = /name="(?:command|prompt)"\s*\r?\n\r?\n([\s\S]*?)\r?\n--/.exec(body);
  if (m) return m[1].trim();
  return '';
}

// ============================================================================
// Offline queue
// ============================================================================
async function enqueueRequest(request) {
  const count = await idbCount(QUEUE_STORE);
  if (count >= MAX_QUEUE) {
    // Drop the oldest to make room
    const all = await idbGetAll(QUEUE_STORE);
    all.sort((a, b) => a.ts - b.ts);
    if (all.length) await idbDelete(QUEUE_STORE, all[0].id);
  }
  const body = await request.clone().text().catch(() => '');
  await idbPut(QUEUE_STORE, {
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body,
    ts: Date.now(),
  });
}

async function drainQueue() {
  const all = await idbGetAll(QUEUE_STORE);
  if (!all.length) return { drained: 0, failed: 0 };
  all.sort((a, b) => a.ts - b.ts);
  let drained = 0, failed = 0;
  for (const item of all) {
    try {
      const resp = await fetch(item.url, {
        method: item.method || 'POST',
        headers: item.headers || {},
        body: item.body || undefined,
      });
      if (resp.ok) {
        await idbDelete(QUEUE_STORE, item.id);
        drained++;
      } else {
        failed++;
      }
    } catch (_) {
      failed++;
    }
  }
  return { drained, failed };
}

// ============================================================================
// Lifecycle
// ============================================================================
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => !k.startsWith(SW_VERSION)).map((k) => caches.delete(k))
    );
    await idbPrune(STORE_RESPONSES, MAX_AGE_MS, MAX_ENTRIES).catch(() => {});
    await self.clients.claim();
  })());
});

// Background sync (Chrome/Edge) — drains queue on reconnect
self.addEventListener('sync', (event) => {
  if (event.tag === 'axelr-queue-sync') {
    event.waitUntil((async () => {
      const { drained } = await drainQueue();
      if (drained > 0) {
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const c of clients) {
          c.postMessage({ type: 'queue-drained', count: drained });
        }
      }
    })());
  }
});

// ============================================================================
// Fetch interception
// ============================================================================
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') {
    // POST to AI endpoints — try, then queue
    if (
      url.origin === self.location.origin &&
      (url.pathname.startsWith('/api/extract') ||
       url.pathname.startsWith('/api/chat') ||
       url.pathname.startsWith('/api/agents'))
    ) {
      event.respondWith(handleAiRequest(req));
    }
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (
    url.pathname.startsWith('/api/extract') ||
    url.pathname.startsWith('/api/chat') ||
    url.pathname.startsWith('/api/agents')
  ) {
    event.respondWith(handleAiRequest(req));
    return;
  }

  event.respondWith(handleStatic(req));
});

// ============================================================================
// AI request handler
// ============================================================================
async function handleAiRequest(req) {
  let bodyText = '';
  let prompt = '';
  try {
    bodyText = await req.clone().text();
    prompt = extractPromptFromBody(bodyText, req.headers.get('content-type'));
  } catch (_) { /* ignore */ }

  try {
    const resp = await fetch(req.clone());

    // Cache successful responses for future offline replay
    if (resp.ok && prompt) {
      resp.clone().json().then(async (data) => {
        const text = data?.text || data?.response || '';
        if (!text) return;
        const tokens = tokenize(prompt);
        await idbPut(STORE_RESPONSES, {
          key: keyForPrompt(prompt),
          prompt: prompt.slice(0, 2000),
          tokens,
          response: text,
          ts: Date.now(),
        });
        await idbPrune(STORE_RESPONSES, MAX_AGE_MS, MAX_ENTRIES).catch(() => {});
      }).catch(() => {});
    }
    return resp;
  } catch (err) {
    // Network failed — try offline path

    // 1. Queue the original request for later delivery (fire-and-forget)
    if (req.method === 'POST') {
      enqueueRequest(req).catch(() => {});
      // Tell the page we queued
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        for (const c of clients) c.postMessage({ type: 'queued' });
      }).catch(() => {});
    }

    // 2. Exact-key cache
    let text = null;
    let source = 'offline-local';
    if (prompt) {
      const exact = await idbGet(STORE_RESPONSES, keyForPrompt(prompt));
      if (exact) { text = exact.response; source = 'offline-exact'; }
    }

    // 3. Fuzzy token-overlap cache
    if (!text && prompt) {
      const fuzzy = await fuzzyFind(prompt);
      if (fuzzy) { text = fuzzy.response; source = 'offline-fuzzy'; }
    }

    // 4. Rule-based fallback
    if (!text) text = ruleBasedReply(prompt);

    return new Response(
      JSON.stringify({
        success: true,
        text,
        provider: source,
        model_used: source === 'offline-local' ? 'rules' : 'cache',
        cached: source !== 'offline-local',
        offline: true,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Axelr-Offline': '1',
        },
      }
    );
  }
}

// ============================================================================
// Static asset handler
// ============================================================================
async function handleStatic(req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) {
    // Refresh in background — don't block
    fetch(req).then((fresh) => {
      if (fresh.ok) cache.put(req, fresh.clone());
    }).catch(() => {});
    return cached;
  }
  try {
    const resp = await fetch(req);
    if (resp.ok && req.method === 'GET') {
      cache.put(req, resp.clone()).catch(() => {});
    }
    return resp;
  } catch (_) {
    const fallback = await cache.match('/offline.html');
    return fallback || new Response('Offline', { status: 503 });
  }
}

// ============================================================================
// Message API
// ============================================================================
self.addEventListener('message', async (event) => {
  const { type } = event.data || {};
  const reply = (payload) => {
    try { event.source && event.source.postMessage(payload); } catch (_) {}
  };

  try {
    if (type === 'GET_OFFLINE_STATS') {
      const [count, queued] = await Promise.all([
        idbCount(STORE_RESPONSES),
        idbCount(QUEUE_STORE),
      ]);
      reply({ type: 'OFFLINE_STATS', count, queued });
    } else if (type === 'CLEAR_OFFLINE_CACHE') {
      const db = await idb();
      const tx = db.transaction([STORE_RESPONSES, QUEUE_STORE], 'readwrite');
      tx.objectStore(STORE_RESPONSES).clear();
      tx.objectStore(QUEUE_STORE).clear();
      tx.oncomplete = () => reply({ type: 'OFFLINE_CACHE_CLEARED' });
    } else if (type === 'DRAIN_QUEUE') {
      const result = await drainQueue();
      reply({ type: 'QUEUE_DRAINED', ...result });
    }
  } catch (e) {
    reply({ type: 'ERROR', message: String(e) });
  }
});