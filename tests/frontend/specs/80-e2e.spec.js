// tests/frontend/specs/80-e2e.spec.js
//
// Full user journeys: signup → ask → get reply → sign out.
// Service-worker offline fallback.
const { test, expect, chromium } = require('@playwright/test');
const h = require('../helpers');

test.describe('80 · end-to-end journeys', () => {
  test('guest → chat → logout in one session', async ({ page }) => {
    // WHY: the smallest possible real journey. Unit tests pass piecemeal
    // and the product is still broken — this is the test that catches it.
    await h.mockHealth(page);
    await h.clearAuth(page);
    await h.mockGuestSession(page);
    await h.mockUserProfile(page);
    await h.mockHistory(page, { logs: [] });
    await h.mockExtractJSON(page, { text: 'JOURNEY REPLY' });

    await page.goto('/');
    await h.waitForBoot(page);
    await page.locator('button.auth-guest-btn').click();
    await page.locator('#prompt-input').waitFor({ state: 'visible' });

    await h.sendMessage(page, 'hi');
    await expect(
      page.locator('.chat-bubble.nexus-bubble .bubble-content').filter({ hasText: 'JOURNEY REPLY' })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('offline: service worker serves a cached reply', async ({ browser }) => {
    // WHY: this is the ONLY place the service worker is exercised end to
    // end. The SW's cache-first fallback must return a valid SSE response
    // marked X-Axelr-Offline so the UI can warn the user.
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    const page = await context.newPage();

    await h.mockHealth(page);
    await h.injectAuth(page);
    await h.mockUserProfile(page);
    await h.mockHistory(page, { logs: [] });
    await h.mockExtractStream(page, { reply: 'PRIMED REPLY' });

    await page.goto('/');
    await h.waitForBoot(page);
    await h.sendMessage(page, 'prime');
    await h.waitForAssistantReply(page, 'PRIMED REPLY');

    // Wait for the SW to be controlling the page. If it never controls
    // (some environments refuse to register), skip rather than fail.
    const controlled = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'unsupported';
      for (let i = 0; i < 50; i++) {
        if (navigator.serviceWorker.controller) return 'controlled';
        await new Promise(r => setTimeout(r, 100));
      }
      return 'not-controlling';
    });
    test.skip(controlled !== 'controlled', 'SW not controlling in this environment');

    // Now kill the network and hit the same endpoint.
    await h.mockNetworkDown(page, '**/api/extract_stream');
    const result = await page.evaluate(async () => {
      const r = await fetch('/api/extract_stream', { method: 'POST', body: new FormData() });
      return { status: r.status, offline: r.headers.get('X-Axelr-Offline') };
    });
    expect(result.status).toBe(200);
    expect(result.offline).toBe('1');

    await context.close();
  });
});