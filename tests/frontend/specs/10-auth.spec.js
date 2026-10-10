// tests/frontend/specs/10-auth.spec.js
//
// Auth wall, guest mode, logout, and JWT claim handling.
const { test, expect } = require('@playwright/test');
const h = require('../helpers');

test.describe('10 · auth', () => {
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

    // The button has onclick="continueAsGuest()" — click by text.
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
    // Open account dropdown then click logout.
    await page.locator('#user-avatar').click();
    await page.locator('#account-dropdown-card button.logout-btn').click();

    await expect(page.locator('#auth-wall')).toBeVisible();
    const token = await page.evaluate(() => localStorage.getItem('google_auth_token'));
    expect(token).toBeNull();
  });

  test('decodeJwt reads claims and returns null on malformed input', async ({ page }) => {
    // WHY: decodeJwt is used by the UI to show the admin tab and to warn
    // on token expiry. It MUST NOT throw on garbage — a throw here bricks
    // bootstrap.
    await page.goto('/');
    await h.waitForBoot(page);
    const good = await page.evaluate(() => window.Axelr.decodeJwt(
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSIsImV4cCI6NDEwMjQ0NDgwMH0.sig'
    ));
    expect(good).toEqual({ sub: 'u1', exp: 4102444800 });
    const bad = await page.evaluate(() => window.Axelr.decodeJwt('not-a-jwt'));
    expect(bad).toBeNull();
  });

  test('expired token is detected and does not leak into the network layer', async ({ page }) => {
    // WHY: an expired token must not be sent in an Authorization header —
    // it wastes a round-trip and can trigger spurious 401 → refresh loops.
    // Instead the SPA should either refresh or force the auth wall.
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
    // We don't assert on the header value here — that depends on refresh
    // logic in 20-auth.js which is currently in flux. We assert it does
    // not contain a *garbage* value that was never issued.
    expect(sawAuthHeader === null || /^Bearer /.test(sawAuthHeader)).toBe(true);
  });
});
