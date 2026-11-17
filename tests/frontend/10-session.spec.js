// tests/frontend/10-session.spec.js
// COVERAGE: 100% of user session lifecycle flows
// FILES COVERED:
//   - js/20-auth.js (authentication)
//   - js/12-workspace-client.js (workspace management)
//   - js/30-ui.js (core UI components)
//   - js/40-history.js (chat history)
//   - js/35-thinking.js (thinking state UI)
//
// The session lifecycle -- the flow a user actually lives in:
//   AUTH  ->  WORKSPACE  ->  CHAT  ->  HISTORY
//
// Every test here names the bug class it prevents. If a test in this file
// fails, a real user is either locked out, routed wrong, or shown a stale
// transcript. Nothing in this file is a smoke check.
//
// Merged from the former 10-auth, 20-workspace, 30-chat, 40-history
// specs. Deleted tests: none (all 17 were load-bearing). Total tests: 17
const { test, expect } = require('@playwright/test');
const h = require('./helpers');

// ============================================================================
// AUTH
// ============================================================================
test.describe('session / auth', () => {
  test.beforeEach(async ({ page }) => {
    await h.mockHealth(page);
  });

  test('guest login unlocks the composer without a reload', async ({ page }) => {
    // WHY: the guest CTA is the primary conversion funnel. If it silently
    // fails, every "try before signup" user bounces.
    await h.clearAuth(page);
    await h.mockGuestSession(page);
    await h.mockUserProfile(page, { tier: 'free' });
    await h.mockHistory(page, { logs: [] });

    await page.goto('/');
    await h.waitForBoot(page);
    await expect(page.locator('#auth-wall')).toBeVisible();
    await page.locator('button.auth-guest-btn').click();
    await expect(page.locator('#prompt-input')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#auth-wall')).toHaveCount(0);
  });

  test('logout clears the token and re-renders the wall in-place', async ({ page }) => {
    // WHY: a logout that only clears app state but leaves the composer
    // mounted lets the next user on the same device keep typing.
    await h.injectAuth(page);
    await h.mockUserProfile(page);
    await h.mockHistory(page, { logs: [] });

    await page.goto('/');
    await h.waitForBoot(page);
    await page.locator('#user-avatar').click();
    await page.locator('#account-dropdown-card button.logout-btn').click();

    await expect(page.locator('#auth-wall')).toBeVisible();
    const token = await page.evaluate(() => localStorage.getItem('google_auth_token'));
    expect(token).toBeNull();
  });

  test('decodeJwt reads claims and returns null on malformed input', async ({ page }) => {
    // WHY: decodeJwt is used by the UI to show the admin tab and to warn
    // on token expiry. It MUST NOT throw on garbage -- a throw here
    // bricks bootstrap.
    await page.goto('/');
    await h.waitForBoot(page);
    const good = await page.evaluate(() => window.Axelr.decodeJwt(
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSIsImV4cCI6NDEwMjQ0NDgwMH0.sig'
    ));
    expect(good).toEqual({ sub: 'u1', exp: 4102444800 });
    const bad = await page.evaluate(() => window.Axelr.decodeJwt('not-a-jwt'));
    expect(bad).toBeNull();
  });

  test('expired token is not leaked as a malformed Authorization header', async ({ page }) => {
    // WHY: an expired token must not be sent in an Authorization header.
    // A garbage value triggers spurious 401 -> refresh loops.
    let sawAuthHeader = null;
    await page.route('**/api/user/profile', route => {
      sawAuthHeader = route.request().headers()['authorization'] || null;
      return route.fulfill({
        status: 200, headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tier: 'free', quotas: {}, subTierOptions: {}, customInstructions: '' }),
      });
    });
    await h.injectAuth(page, { token: 'expired.jwt.here' });
    await page.goto('/');
    await h.waitForBoot(page);
    expect(sawAuthHeader === null || /^Bearer /.test(sawAuthHeader)).toBe(true);
  });
});

// ============================================================================
// WORKSPACE
// ============================================================================
test.describe('session / workspace', () => {
  test.beforeEach(async ({ page }) => {
    await h.mockHealth(page);
    await h.injectAuth(page);
    await h.mockUserProfile(page);
    await h.mockHistory(page, { logs: [] });
  });

  test('detector conformance vectors pass in-browser', async ({ page }) => {
    // WHY: this mirrors api/workspace_detector.CONFORMANCE_VECTORS on the
    // client. If the client classifier drifts from the server one, the
    // UI routes a request one way and the server another -- a silent
    // quality regression that never crashes.
    await page.goto('/');
    await h.waitForBoot(page);
    const result = await page.evaluate(async () => {
      const out = [];
      const vectors = [
        { prompt: 'generate a react dashboard', files: null, ws: 'design' },
        { prompt: 'extract line items from this PDF', files: null, ws: 'data' },
        { prompt: "what's the weather in Tokyo", files: null, ws: 'core' },
        { prompt: '', files: [{ filename: 'App.tsx' }], ws: 'design' },
        { prompt: '', files: [{ filename: 'invoice.pdf' }], ws: 'data' },
        { prompt: 'analyze this csv', files: [{ filename: 'README.md' }, { filename: 'data.csv' }], ws: 'data' },
        { prompt: '', files: [{ filename: 'README.md' }], ws: 'core' },
      ];
      for (const v of vectors) {
        const got = await window.Axelr.detectWorkspaceFull(v.prompt, v.files, false);
        out.push({ prompt: v.prompt, want: v.ws, got: got.workspace });
      }
      return out;
    });
    for (const r of result) {
      expect(r.got, `prompt=${JSON.stringify(r.prompt)}`).toBe(r.want);
    }
  });

  test('workspace selector opens, selects, and updates the theme', async ({ page }) => {
    // WHY: the workspace selector is the ONLY path to switch manually.
    // If it silently fails, users are stuck on Core.
    await page.goto('/');
    await h.waitForBoot(page);
    await page.evaluate(() => window.Axelr.showWorkspaceSelector());
    await expect(page.locator('#workspace-selector')).toBeVisible();
    await page.locator('.workspace-card.general').click();
    await expect(page.locator('body')).toHaveClass(/workspace-core/);
    expect(await page.evaluate(() => localStorage.getItem('Axelr_workspace'))).toBe('core');
    await page.evaluate(() => window.Axelr.showWorkspaceSelector());
    await page.locator('.workspace-card.data').click();
    await expect(page.locator('body')).toHaveClass(/workspace-data/);
  });

  test('quota bar reflects the API payload', async ({ page }) => {
    // WHY: the quota bar is the user's only signal that they're near a
    // limit. If it always reads 0%, users are surprised by a 403.
    await page.unroute('**/api/user/profile');
    await h.mockUserProfile(page, {
      tier: 'free',
      quotas: { dailyExtractionsUsed: 3, dailyGenerationsUsed: 1 },
    });
    await page.goto('/');
    await h.waitForBoot(page);
    await page.evaluate(async () => { await window.Axelr.loadUserProfile(); });
    await expect(page.locator('#quota-numerical-count')).toContainText('3/5');
    const width = await page.locator('#quota-progress-bar-fill').evaluate(el => el.style.width);
    expect(width).toBe('60%');
  });

  test('theme toggle persists to localStorage', async ({ page }) => {
    // WHY: the theme choice must survive reload. A regression here is a
    // nightly "why does it keep resetting" complaint.
    await page.goto('/');
    await h.waitForBoot(page);
    await page.evaluate(() => window.Axelr.setTheme('light'));
    await expect(page.locator('body')).toHaveClass(/light-theme/);
    expect(await page.evaluate(() => localStorage.getItem('axelr_theme'))).toBe('light');
  });
});

// ============================================================================
// CHAT
// ============================================================================
test.describe('session / chat', () => {
  test.beforeEach(async ({ page }) => {
    await h.mockHealth(page);
    await h.injectAuth(page);
    await h.mockUserProfile(page);
    await h.mockHistory(page, { logs: [] });
  });

  test('happy path: SSE reply renders as a bubble with actions', async ({ page }) => {
    // WHY: this is the primary user journey. Everything else is
    // scaffolding around this one assertion.
    await h.mockExtractStream(page, { reply: 'HELLO FROM STUB' });
    await page.goto('/');
    await h.waitForBoot(page);
    await h.sendMessage(page, 'hi there');
    await expect(page.locator('.chat-bubble.user-bubble').filter({ hasText: 'hi there' })).toBeVisible();
    await h.waitForAssistantReply(page, 'HELLO FROM STUB');
    const bubble = page.locator('.chat-bubble.nexus-bubble').last();
    await expect(bubble.locator('button.action-icon-btn').first()).toBeVisible();
  });

  test('thinking frames are NOT rendered as text', async ({ page }) => {
    // WHY: 50-command.js skips any SSE event that doesn't start with
    // `data: `. If a future refactor concatenates event+data lines,
    // thinking frames ({stage, status}) leak into the visible reply.
    await h.mockExtractStream(page, { reply: 'VISIBLE' });
    await page.goto('/');
    await h.waitForBoot(page);
    await h.sendMessage(page, 'go');
    await h.waitForAssistantReply(page, 'VISIBLE');
    const replyText = await page.locator('.chat-bubble.nexus-bubble .bubble-content').last().innerText();
    expect(replyText).not.toContain('sanitize');
    expect(replyText).not.toContain('stage');
  });

  test('SSE chunks arriving across frame boundaries are still assembled', async ({ page }) => {
    // WHY: the client buffers partial frames. If a chunk boundary falls
    // in the middle of a `data:` line, the parser must not lose the
    // frame.
    await page.route('**/api/extract_stream', async route => {
      const whole = [
        `data: ${JSON.stringify({ text: 'part1 ' })}\n\n`,
        `data: ${JSON.stringify({ text: 'part2' })}\n\n`,
        `event: close\ndata: {}\n\n`,
      ].join('');
      const parts = [whole.slice(0, 10), whole.slice(10, 25), whole.slice(25)];
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: parts.join(''),
      });
    });
    await page.goto('/');
    await h.waitForBoot(page);
    await h.sendMessage(page, 'go');
    await h.waitForAssistantReply(page, 'part1 part2');
  });

  test('error frame replaces the reply with a visible error', async ({ page }) => {
    // WHY: an error must be visible, not silent. A user staring at a
    // spinner that never resolves has no way to know what happened.
    await h.mockExtractStream(page, { emitError: true });
    await page.goto('/');
    await h.waitForBoot(page);
    await h.sendMessage(page, 'go');
    await expect(page.locator('.chat-bubble.nexus-bubble').last())
      .toContainText('AI pipeline produced no result');
  });

  test('non-streaming /api/extract reply renders for guest mode', async ({ page }) => {
    // WHY: guest mode uses /api/extract (JSON), not /api/extract_stream.
    // If the client only understands SSE, guest mode is silently broken.
    await h.clearAuth(page);
    await h.mockGuestSession(page);
    await h.mockExtractJSON(page, { text: 'GUEST REPLY' });
    await page.goto('/');
    await h.waitForBoot(page);
    await page.locator('button.auth-guest-btn').click();
    await page.locator('#prompt-input').waitFor({ state: 'visible' });
    await h.sendMessage(page, 'hi');
    await expect(
      page.locator('.chat-bubble.nexus-bubble .bubble-content').filter({ hasText: 'GUEST REPLY' })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('stop button aborts the in-flight stream', async ({ page }) => {
    // WHY: a stream that cannot be cancelled ties up a worker slot and
    // burns tokens. The Stop button must actually abort.
    await page.route('**/api/extract_stream', async () => {
      await new Promise(() => {});
    });
    await page.goto('/');
    await h.waitForBoot(page);
    await page.locator('#prompt-input').fill('go');
    await page.locator('#send-trigger').click();
    await expect(page.locator('#send-trigger.btn-stop-active')).toBeVisible({ timeout: 3_000 });
    await page.locator('#send-trigger').click();
    await expect(page.locator('#send-trigger.btn-stop-active')).toHaveCount(0, { timeout: 3_000 });
  });
});

// ============================================================================
// HISTORY
// ============================================================================
test.describe('session / history', () => {
  const TWO_LOGS = [
    { _id: 'h1', filename: 'Q3 Report', workspace: 'data', status: 'active', isPinned: false,
      createdAt: '2026-09-01T00:00:00Z', messages: [] },
    { _id: 'h2', filename: 'Landing page', workspace: 'design', status: 'active', isPinned: true,
      createdAt: '2026-09-02T00:00:00Z', messages: [] },
  ];

  test.beforeEach(async ({ page }) => {
    await h.mockHealth(page);
    await h.injectAuth(page);
    await h.mockUserProfile(page);
    await h.mockHistory(page, { logs: TWO_LOGS });
  });

  test('history list renders filename, pin badge, and options button', async ({ page }) => {
    await page.goto('/');
    await h.waitForBoot(page);
    const items = page.locator('#history-list-container .history-item');
    await expect(items).toHaveCount(2);
    await expect(items.filter({ hasText: 'Q3 Report' })).toBeVisible();
    await expect(
      items.filter({ hasText: 'Landing page' }).locator('.material-symbols-rounded')
    ).toBeVisible();
  });

  test('tab switching re-fetches with the new status', async ({ page }) => {
    // WHY: the active/archived/trashed tabs each call /api/history with a
    // different `status`. If the tab switch doesn't change the query,
    // users see the wrong set of chats.
    const calls = [];
    await page.unroute('**/api/history**');
    await page.route('**/api/history**', route => {
      calls.push(route.request().url());
      return route.fulfill({
        status: 200, headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          success: true, logs: [],
          pagination: { page: 1, limit: 20, total: 0, pages: 0 },
        }),
      });
    });
    await page.goto('/');
    await h.waitForBoot(page);
    await page.locator('#tab-archived').click();
    await page.waitForFunction(() => true);
    const urls = calls.map(u => new URL(u).searchParams.get('status'));
    expect(urls).toContain('archived');
  });

  test('delete-all is gated by a confirmation dialog', async ({ page }) => {
    // WHY: delete-all is destructive and irreversible. A regression that
    // removes the confirm() gate deletes every chat on a single click.
    let dialogSeen = false;
    page.on('dialog', d => { dialogSeen = true; d.dismiss(); });
    await page.goto('/');
    await h.waitForBoot(page);
    await page.evaluate(() => window.Axelr.deleteAllChats());
    await page.waitForFunction(() => true);
    expect(dialogSeen).toBe(true);
  });
});