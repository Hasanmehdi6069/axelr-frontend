// tests/frontend/helpers/index.js
//
// Consolidated Playwright helpers. Every mock here is deterministic and
// network-free. Import from a spec with:
//
//     const h = require('../helpers');
//
// The `data-testid` convention used by the ORIGINAL suite (chat-composer,
// message-user, …) does not exist in the HTML. This helper set uses the
// real selectors from index.html: #prompt-input, .chat-bubble.user-bubble,
// #auth-wall, .workspace-card, etc.
// ============================================================================

const JSON_HEADERS = { 'content-type': 'application/json' };

// ── Auth ────────────────────────────────────────────────────────────────────
// The SPA reads `google_auth_token` (20-auth.js, line 14) and `axelr_user`.
const TOKEN_KEY = 'google_auth_token';
const USER_KEY  = 'axelr_user';

async function injectAuth(page, {
  token = 'e2e.fake.jwt',
  sub = 'u_e2e_0001',
  email = 'e2e@axelr.test',
  tier = 'free',
} = {}) {
  await page.addInitScript(([tk, uk, t, u]) => {
    localStorage.setItem(tk, t);
    localStorage.setItem(uk, JSON.stringify(u));
  }, [TOKEN_KEY, USER_KEY, token, { sub, email, tier }]);
}

async function clearAuth(page) {
  await page.addInitScript(([tk, uk]) => {
    localStorage.removeItem(tk);
    localStorage.removeItem(uk);
    localStorage.removeItem('axelr_active_session');
  }, [TOKEN_KEY, USER_KEY]);
}

// ── Backend stubs ───────────────────────────────────────────────────────────
async function mockHealth(page, { status = 'operational' } = {}) {
  await page.route('**/api/health', route => route.fulfill({
    status: 200, headers: JSON_HEADERS,
    body: JSON.stringify({ status, timestamp: new Date().toISOString(), providers: {} }),
  }));
}

async function mockGuestSession(page, { sessionId = 'guest_e2e_1' } = {}) {
  await page.route('**/api/guest/session', route => route.fulfill({
    status: 200, headers: JSON_HEADERS,
    body: JSON.stringify({ sessionId, expiresIn: 3600 }),
  }));
}

async function mockUserProfile(page, {
  tier = 'free',
  isAdmin = false,
  email = 'e2e@axelr.test',
  quotas = { dailyExtractionsUsed: 0, dailyGenerationsUsed: 0 },
  subTierOptions = { hasDataAccess: false, hasDesignAccess: false },
} = {}) {
  await page.route('**/api/user/profile', route => route.fulfill({
    status: 200, headers: JSON_HEADERS,
    body: JSON.stringify({
      tier, isAdmin, email, quotas, subTierOptions,
      customInstructions: '',
      tokenUsage: { dailyPrompt: 0, dailyCompletion: 0, totalPrompt: 0, totalCompletion: 0 },
      puter_enabled: false,
      preferences: { defaultWorkspace: 'core' },
    }),
  }));
}

async function mockHistory(page, { logs = [] } = {}) {
  await page.route('**/api/history**', route => route.fulfill({
    status: 200, headers: JSON_HEADERS,
    body: JSON.stringify({ success: true, logs, pagination: { page: 1, limit: 20, total: logs.length, pages: 1 } }),
  }));
}

/**
 * SSE response for /api/extract_stream.
 *
 * Matches the client parser in 50-command.js: it splits on `\n\n`, keeps
 * only events whose trimmed form starts with `data: `, and reads
 * `text`/`delta`/`content`. The `event:` lines are emitted for contract
 * fidelity but the client ignores them. That is intentional — locked in
 * by 30-chat.spec.js::'thinking frames are not rendered as text'.
 */
async function mockExtractStream(page, {
  reply = 'HELLO FROM STUB',
  sessionId = 'sess_e2e_1',
  filename = 'Export.csv',
  extraText = '',
  emitError = false,
  status = 200,
  chunks = 8,
  onRequest = null,
} = {}) {
  await page.route('**/api/extract_stream', route => {
    if (onRequest) onRequest(route.request());
    const frames = [];
    if (emitError) {
      frames.push(`data: ${JSON.stringify({ error: 'AI pipeline produced no result' })}\n\n`);
    } else {
      frames.push(`event: route\ndata: ${JSON.stringify({ route: 'CORE', intent: 'conversational' })}\n\n`);
      frames.push(`event: thinking\ndata: ${JSON.stringify({ stage: 'sanitize', status: 'running' })}\n\n`);
      frames.push(`event: thinking\ndata: ${JSON.stringify({ stage: 'sanitize', status: 'ok' })}\n\n`);
      for (let i = 0; i < reply.length; i += chunks) {
        frames.push(`data: ${JSON.stringify({ text: reply.slice(i, i + chunks) })}\n\n`);
      }
      if (extraText) {
        frames.push(`data: ${JSON.stringify({ text: extraText })}\n\n`);
      }
      frames.push(`data: ${JSON.stringify({ sessionId, filename })}\n\n`);
      frames.push(`data: ${JSON.stringify({ watermark: '\n\n---\n*stub · stub · 0.01s*' })}\n\n`);
      frames.push(`event: close\ndata: {}\n\n`);
    }
    return route.fulfill({
      status,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
      body: frames.join(''),
    });
  });
}

async function mockExtractJSON(page, {
  text = 'PLAIN JSON REPLY',
  provider = 'stub',
  sessionId = 'sess_json_1',
  status = 200,
} = {}) {
  await page.route('**/api/extract', route => route.fulfill({
    status, headers: JSON_HEADERS,
    body: JSON.stringify({
      success: true, text, sessionId, structuredData: [],
      filename: 'Export.csv', provider, model: 'stub',
    }),
  }));
}

async function mockEnhancePrompt(page, {
  changed = true,
  enhanced = 'Rewritten prompt with constraints.',
  mode = 'core',
  provider = 'stub',
  delta = 12,
  status = 200,
} = {}) {
  await page.route('**/api/enhance-prompt', route => route.fulfill({
    status, headers: JSON_HEADERS,
    body: JSON.stringify({
      success: true, original: 'orig', enhanced, changed, mode, provider,
      cache_key: 'ck_e2e_1',
      diff: { segments: [{ op: 'equal', text: 'Rewritten' }], additions: [], removals: [], similarity: 0.4, changed },
      scores: {
        original: { clarity: 50, specificity: 20, density: 50, structure: 50, overall: 42 },
        enhanced: { clarity: 80, specificity: 70, density: 80, structure: 80, overall: 78 },
        delta,
      },
      rationale: ['Added concrete constraints.'],
      latency_ms: 10,
      version: '27.0',
    }),
  }));
}

async function mockNetworkDown(page, pattern) {
  await page.route(pattern, route => route.abort('internetdisconnected'));
}

// ── Boot helper ─────────────────────────────────────────────────────────────
// Every spec should call this after `page.goto('/')`. It waits for the SPA
// bootstrap to complete (window.Axelr + appInitialized flag).
async function waitForBoot(page, { timeout = 10_000 } = {}) {
  await page.waitForFunction(() => {
    return window.Axelr
      && window.Axelr.state
      && window.Axelr.appInitialized === true;
  }, null, { timeout });
}

// ── Error collection ────────────────────────────────────────────────────────
// Attach BEFORE navigation. Returns { consoleErrors, pageErrors } arrays that
// fill as the page runs. Every spec should assert both are empty in an
// `afterEach` — a console error is a bug, not noise.
function collectErrors(page) {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => {
    pageErrors.push(String(err && err.message ? err.message : err));
  });
  return { consoleErrors, pageErrors };
}

// ── The composer helper ─────────────────────────────────────────────────────
// Sends a message through the real input box.
async function sendMessage(page, text) {
  await page.locator('#prompt-input').fill(text);
  await page.locator('#send-trigger').click();
}

// Wait for the assistant reply to appear in the transcript.
async function waitForAssistantReply(page, contains, { timeout = 10_000 } = {}) {
  await page.locator('.chat-bubble.nexus-bubble .bubble-content')
    .filter({ hasText: contains })
    .first()
    .waitFor({ state: 'visible', timeout });
}

module.exports = {
  TOKEN_KEY, USER_KEY,
  injectAuth, clearAuth,
  mockHealth, mockGuestSession, mockUserProfile, mockHistory,
  mockExtractStream, mockExtractJSON, mockEnhancePrompt,
  mockNetworkDown,
  waitForBoot, collectErrors,
  sendMessage, waitForAssistantReply,
};// tests/frontend/helpers/index.js
//
// Consolidated Playwright helpers. Every mock here is deterministic and
// network-free. Import from a spec with:
//
//     const h = require('../helpers');
//
// The `data-testid` convention used by the ORIGINAL suite (chat-composer,
// message-user, …) does not exist in the HTML. This helper set uses the
// real selectors from index.html: #prompt-input, .chat-bubble.user-bubble,
// #auth-wall, .workspace-card, etc.
// ============================================================================

const JSON_HEADERS = { 'content-type': 'application/json' };

// ── Auth ────────────────────────────────────────────────────────────────────
// The SPA reads `google_auth_token` (20-auth.js, line 14) and `axelr_user`.
const TOKEN_KEY = 'google_auth_token';
const USER_KEY  = 'axelr_user';

async function injectAuth(page, {
  token = 'e2e.fake.jwt',
  sub = 'u_e2e_0001',
  email = 'e2e@axelr.test',
  tier = 'free',
} = {}) {
  await page.addInitScript(([tk, uk, t, u]) => {
    localStorage.setItem(tk, t);
    localStorage.setItem(uk, JSON.stringify(u));
  }, [TOKEN_KEY, USER_KEY, token, { sub, email, tier }]);
}

async function clearAuth(page) {
  await page.addInitScript(([tk, uk]) => {
    localStorage.removeItem(tk);
    localStorage.removeItem(uk);
    localStorage.removeItem('axelr_active_session');
  }, [TOKEN_KEY, USER_KEY]);
}

// ── Backend stubs ───────────────────────────────────────────────────────────
async function mockHealth(page, { status = 'operational' } = {}) {
  await page.route('**/api/health', route => route.fulfill({
    status: 200, headers: JSON_HEADERS,
    body: JSON.stringify({ status, timestamp: new Date().toISOString(), providers: {} }),
  }));
}

async function mockGuestSession(page, { sessionId = 'guest_e2e_1' } = {}) {
  await page.route('**/api/guest/session', route => route.fulfill({
    status: 200, headers: JSON_HEADERS,
    body: JSON.stringify({ sessionId, expiresIn: 3600 }),
  }));
}

async function mockUserProfile(page, {
  tier = 'free',
  isAdmin = false,
  email = 'e2e@axelr.test',
  quotas = { dailyExtractionsUsed: 0, dailyGenerationsUsed: 0 },
  subTierOptions = { hasDataAccess: false, hasDesignAccess: false },
} = {}) {
  await page.route('**/api/user/profile', route => route.fulfill({
    status: 200, headers: JSON_HEADERS,
    body: JSON.stringify({
      tier, isAdmin, email, quotas, subTierOptions,
      customInstructions: '',
      tokenUsage: { dailyPrompt: 0, dailyCompletion: 0, totalPrompt: 0, totalCompletion: 0 },
      puter_enabled: false,
      preferences: { defaultWorkspace: 'core' },
    }),
  }));
}

async function mockHistory(page, { logs = [] } = {}) {
  await page.route('**/api/history**', route => route.fulfill({
    status: 200, headers: JSON_HEADERS,
    body: JSON.stringify({ success: true, logs, pagination: { page: 1, limit: 20, total: logs.length, pages: 1 } }),
  }));
}

/**
 * SSE response for /api/extract_stream.
 *
 * Matches the client parser in 50-command.js: it splits on `\n\n`, keeps
 * only events whose trimmed form starts with `data: `, and reads
 * `text`/`delta`/`content`. The `event:` lines are emitted for contract
 * fidelity but the client ignores them. That is intentional — locked in
 * by 30-chat.spec.js::'thinking frames are not rendered as text'.
 */
async function mockExtractStream(page, {
  reply = 'HELLO FROM STUB',
  sessionId = 'sess_e2e_1',
  filename = 'Export.csv',
  extraText = '',
  emitError = false,
  status = 200,
  chunks = 8,
  onRequest = null,
} = {}) {
  await page.route('**/api/extract_stream', route => {
    if (onRequest) onRequest(route.request());
    const frames = [];
    if (emitError) {
      frames.push(`data: ${JSON.stringify({ error: 'AI pipeline produced no result' })}\n\n`);
    } else {
      frames.push(`event: route\ndata: ${JSON.stringify({ route: 'CORE', intent: 'conversational' })}\n\n`);
      frames.push(`event: thinking\ndata: ${JSON.stringify({ stage: 'sanitize', status: 'running' })}\n\n`);
      frames.push(`event: thinking\ndata: ${JSON.stringify({ stage: 'sanitize', status: 'ok' })}\n\n`);
      for (let i = 0; i < reply.length; i += chunks) {
        frames.push(`data: ${JSON.stringify({ text: reply.slice(i, i + chunks) })}\n\n`);
      }
      if (extraText) {
        frames.push(`data: ${JSON.stringify({ text: extraText })}\n\n`);
      }
      frames.push(`data: ${JSON.stringify({ sessionId, filename })}\n\n`);
      frames.push(`data: ${JSON.stringify({ watermark: '\n\n---\n*stub · stub · 0.01s*' })}\n\n`);
      frames.push(`event: close\ndata: {}\n\n`);
    }
    return route.fulfill({
      status,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
      body: frames.join(''),
    });
  });
}

async function mockExtractJSON(page, {
  text = 'PLAIN JSON REPLY',
  provider = 'stub',
  sessionId = 'sess_json_1',
  status = 200,
} = {}) {
  await page.route('**/api/extract', route => route.fulfill({
    status, headers: JSON_HEADERS,
    body: JSON.stringify({
      success: true, text, sessionId, structuredData: [],
      filename: 'Export.csv', provider, model: 'stub',
    }),
  }));
}

async function mockEnhancePrompt(page, {
  changed = true,
  enhanced = 'Rewritten prompt with constraints.',
  mode = 'core',
  provider = 'stub',
  delta = 12,
  status = 200,
} = {}) {
  await page.route('**/api/enhance-prompt', route => route.fulfill({
    status, headers: JSON_HEADERS,
    body: JSON.stringify({
      success: true, original: 'orig', enhanced, changed, mode, provider,
      cache_key: 'ck_e2e_1',
      diff: { segments: [{ op: 'equal', text: 'Rewritten' }], additions: [], removals: [], similarity: 0.4, changed },
      scores: {
        original: { clarity: 50, specificity: 20, density: 50, structure: 50, overall: 42 },
        enhanced: { clarity: 80, specificity: 70, density: 80, structure: 80, overall: 78 },
        delta,
      },
      rationale: ['Added concrete constraints.'],
      latency_ms: 10,
      version: '27.0',
    }),
  }));
}

async function mockNetworkDown(page, pattern) {
  await page.route(pattern, route => route.abort('internetdisconnected'));
}

// ── Boot helper ─────────────────────────────────────────────────────────────
// Every spec should call this after `page.goto('/')`. It waits for the SPA
// bootstrap to complete (window.Axelr + appInitialized flag).
async function waitForBoot(page, { timeout = 10_000 } = {}) {
  await page.waitForFunction(() => {
    return window.Axelr
      && window.Axelr.state
      && window.Axelr.appInitialized === true;
  }, null, { timeout });
}

// ── Error collection ────────────────────────────────────────────────────────
// Attach BEFORE navigation. Returns { consoleErrors, pageErrors } arrays that
// fill as the page runs. Every spec should assert both are empty in an
// `afterEach` — a console error is a bug, not noise.
function collectErrors(page) {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => {
    pageErrors.push(String(err && err.message ? err.message : err));
  });
  return { consoleErrors, pageErrors };
}

// ── The composer helper ─────────────────────────────────────────────────────
// Sends a message through the real input box.
async function sendMessage(page, text) {
  await page.locator('#prompt-input').fill(text);
  await page.locator('#send-trigger').click();
}

// Wait for the assistant reply to appear in the transcript.
async function waitForAssistantReply(page, contains, { timeout = 10_000 } = {}) {
  await page.locator('.chat-bubble.nexus-bubble .bubble-content')
    .filter({ hasText: contains })
    .first()
    .waitFor({ state: 'visible', timeout });
}

module.exports = {
  TOKEN_KEY, USER_KEY,
  injectAuth, clearAuth,
  mockHealth, mockGuestSession, mockUserProfile, mockHistory,
  mockExtractStream, mockExtractJSON, mockEnhancePrompt,
  mockNetworkDown,
  waitForBoot, collectErrors,
  sendMessage, waitForAssistantReply,
};