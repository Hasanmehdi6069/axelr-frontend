// tests/frontend/specs/70-security.spec.js
//
// Adversarial client-side inputs. Each test represents a real attack.
const { test, expect } = require('@playwright/test');
const h = require('../helpers');

test.describe('70 · security', () => {
  test.beforeEach(async ({ page }) => {
    await h.mockHealth(page);
    await h.mockUserProfile(page);
    await h.mockHistory(page, { logs: [] });
  });

  test('assistant reply with inline script tag is sanitized by DOMPurify', async ({ page }) => {
    // WHY: model output is untrusted text. If a provider is compromised —
    // or if a malicious user pokes a provider into echoing a payload — the
    // rendered reply must NOT execute. DOMPurify is the only gate.
    await h.injectAuth(page);
    await h.mockExtractStream(page, {
      reply: 'hello <img src=x onerror=window.__pwned=1> world',
    });
    await page.goto('/');
    await h.waitForBoot(page);
    await h.sendMessage(page, 'go');
    await h.waitForAssistantReply(page, 'hello');
    await page.waitForTimeout(200); // give the onerror a chance to fire
    const pwned = await page.evaluate(() => window.__pwned);
    expect(pwned).toBeUndefined();
  });

  test('history filename with an img payload is escaped in the sidebar', async ({ page }) => {
    // WHY: filenames come from user uploads. If rendered unsanitised, a
    // crafted filename becomes stored XSS on the sidebar.
    await page.unroute('**/api/history**');
    await h.mockHistory(page, {
      logs: [{
        _id: 'evil',
        filename: '<img src=x onerror=window.__pwned2=1>',
        workspace: 'core', status: 'active', isPinned: false,
        createdAt: '2026-09-01T00:00:00Z', messages: [],
      }],
    });
    await h.injectAuth(page);
    await page.goto('/');
    await h.waitForBoot(page);
    await page.waitForTimeout(200);
    const pwned = await page.evaluate(() => window.__pwned2);
    expect(pwned).toBeUndefined();
    // The literal string should be visible, not an <img>.
    const text = await page.locator('#history-list-container').innerText();
    expect(text).toContain('<img src=x onerror=');
  });

  test('CSP header is present on the app document', async ({ page }) => {
    // WHY: the CSP is the last line of defence. If a build change drops
    // it, an XSS that bypasses DOMPurify becomes live. This is a
    // regression tripwire.
    const response = await page.goto('/');
    const csp = response.headers()['content-security-policy'];
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  test('GitHub callback token is not left in the URL', async ({ page }) => {
    // WHY: 20-auth.js reads `?token=` on load and rewrites the URL. If the
    // rewrite fails, the JWT sits in browser history, in any upstream
    // proxy log, and in the Referer header of the next outbound request.
    await page.goto('/?auth=github&token=fake.jwt.here');
    await page.waitForFunction(() => !window.location.search.includes('token='), null, { timeout: 3_000 });
    const url = page.url();
    expect(url).not.toContain('token=');
  });

  test('malicious URL param on checkout.html does not crash the page', async ({ page }) => {
    // WHY: checkout.html reads plan/subtier/cycle from the URL. A garbage
    // value must fall back to defaults, not throw.
    const errs = h.collectErrors(page);
    await page.goto('/checkout.html?plan=<script>alert(1)</script>&subtier=nope&cycle=hax');
    await page.waitForLoadState('domcontentloaded');
    expect(errs.pageErrors).toEqual([]);
    // The page must still render the price box.
    await expect(page.locator('.plan-card').first()).toBeVisible();
  });
});