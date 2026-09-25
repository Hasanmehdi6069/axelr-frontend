// Auth-wall contract tests.
//
// Invariants:
//   - With no session, the main UI is never rendered.
//   - A successful guest login unlocks the composer and hides the wall.
//   - Logout tears the session down and returns to the wall.
const { test, expect } = require('@playwright/test');
const { injectAuth, clearAuth } = require('./helpers/auth');
const { mockHealth, mockGuestSession } = require('./helpers/api');

test.describe('auth wall', () => {
  test.beforeEach(async ({ page }) => {
    await mockHealth(page);
  });

  test('renders the auth wall when no session is present', async ({ page }) => {
    // Protects: the single most important UX invariant — an unauthenticated
    // visitor must never see the chat composer. If this fails, every other
    // security control on the client is moot.
    await clearAuth(page);
    await page.goto('/');
    await expect(page.getByTestId('auth-wall')).toBeVisible();
    await expect(page.getByTestId('chat-composer')).toHaveCount(0);
  });

  test('guest login unlocks the main UI', async ({ page }) => {
    // Protects: the guest CTA must actually work end-to-end. It hits
    // /api/guest/session, stores the token, and swaps the wall for the
    // composer without a full reload.
    await clearAuth(page);
    await mockGuestSession(page);
    await page.goto('/');
    await page.getByTestId('cta-continue-as-guest').click();
    await expect(page.getByTestId('chat-composer')).toBeVisible();
    await expect(page.getByTestId('auth-wall')).toHaveCount(0);
  });

  test('logout returns the user to the auth wall', async ({ page }) => {
    // Protects: logout must clear the token AND re-render the wall in the
    // same SPA session. A logout that only clears state but leaves the
    // composer mounted lets the next user on the same device type into
    // the previous user's session.
    await injectAuth(page);
    await page.goto('/');
    await expect(page.getByTestId('chat-composer')).toBeVisible();

    await page.getByTestId('btn-logout').click();
    await expect(page.getByTestId('auth-wall')).toBeVisible();
    await expect(page.getByTestId('chat-composer')).toHaveCount(0);

    const token = await page.evaluate(() => localStorage.getItem('axelr_token'));
    expect(token).toBeNull();
  });
});