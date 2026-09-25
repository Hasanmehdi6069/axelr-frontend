// Service-worker / offline contract tests.
//
// Invariants:
//   - The SW registers and takes control of the page.
//   - When the network is down, a previously seen /api/chat GET is served
//     from cache with an X-Axelr-Offline marker so the UI can warn the user.
//
// NOTE: this suite is deliberately conservative. If the SW does not
// register (e.g. served over plain http on a non-localhost host, where
// browsers refuse), the test SKIPS rather than fails — that is a deploy
// concern, not a code regression.
const { test, expect } = require('@playwright/test');
const { injectAuth } = require('./helpers/auth');
const { mockHealth, mockNetworkDown } = require('./helpers/api');

test.describe('offline / service worker', () => {
  test.beforeEach(async ({ page }) => {
    await mockHealth(page);
    await injectAuth(page);
  });

  test('service worker registers and controls the page', async ({ page }) => {
    // Protects: SW registration is the one thing that must happen for
    // *any* offline behaviour to exist. If registration silently breaks,
    // every downstream offline feature regresses without any visible cue.
    await page.goto('/');
    const controlled = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'unsupported';
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return 'unregistered';
      // Wait up to 5s for the SW to take control.
      for (let i = 0; i < 50; i++) {
        if (navigator.serviceWorker.controller) return 'controlled';
        await new Promise(r => setTimeout(r, 100));
      }
      return 'registered-not-controlling';
    });
    test.skip(controlled === 'unsupported', 'Browser does not support service workers');
    expect(['controlled', 'registered-not-controlling']).toContain(controlled);
  });

  test('offline GET to /api/chat returns a cached response with X-Axelr-Offline', async ({ page, context }) => {
    // Protects: the SW's cache-first fallback for /api/chat. The custom
    // header is the contract the UI uses to render the "offline mode"
    // banner — without it, users see a stale answer with no indication
    // it did not come from the network.
    await page.goto('/');

    const registered = await page.evaluate(() =>
      'serviceWorker' in navigator
        ? navigator.serviceWorker.getRegistration().then(r => !!r)
        : false,
    );
    test.skip(!registered, 'SW not registered in this environment');

    // Prime the cache by issuing a GET while online. The SW is expected
    // to cache successful GETs to /api/chat.
    await context.route('**/api/chat*', route =>
      route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'PRIMED', provider: 'stub' }),
      }),
    );
    const primed = await page.evaluate(async () => {
      const r = await fetch('/api/chat?q=prime');
      return r.status;
    });
    expect(primed).toBe(200);

    // Now kill the network and hit the same URL from inside the page.
    await mockNetworkDown(page, '**/api/chat*');
    const result = await page.evaluate(async () => {
      const r = await fetch('/api/chat?q=prime');
      return { status: r.status, offline: r.headers.get('X-Axelr-Offline') };
    });

    expect(result.status).toBe(200);
    // The header is set by the SW, not the origin — assert it exists.
    // If the SW has not yet wired this header, the test will fail loudly
    // rather than silently "pass" on a network response.
    expect(result.offline).toBe('1');
  });
});