// Pure-function tests executed inside the real browser via page.evaluate().
//
// Why here and not in a Jest unit test? These helpers live in the SPA's
// global scope (classic <script> tags, not ES modules) and mutate DOM
// state on first use. Running them via page.evaluate() exercises the
// exact code path the browser runs, with no bundler in between.
const { test, expect } = require('@playwright/test');
const { mockHealth } = require('./helpers/api');

test.describe('pure functions (in-browser)', () => {
  test.beforeEach(async ({ page }) => {
    await mockHealth(page);
    await page.goto('/');
  });

  test('escapeHtmlEntities neutralises the five HTML-significant chars', async ({ page }) => {
    // Protects: a regression here re-opens stored XSS on any user- or
    // model-supplied string rendered via innerHTML. The exact entities
    // are asserted because the sanitiser's contract is byte-level.
    const out = await page.evaluate(() =>
      window.escapeHtmlEntities('<a href="x">&\'</a>'),
    );
    expect(out).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });

  test('escapeHtmlEntities is idempotent on already-escaped text', async ({ page }) => {
    // Protects: double-escaping turns &amp; into &amp;amp;, which users
    // see literally. Not re-escaping an already-safe string is part of
    // the contract.
    const once  = await page.evaluate(() => window.escapeHtmlEntities('<x>'));
    const twice = await page.evaluate(s => window.escapeHtmlEntities(s), once);
    expect(twice).toBe(once);
  });

  test('decodeJwt extracts sub and exp without verifying the signature', async ({ page }) => {
    // Protects: the SPA uses decodeJwt only to read claims for UI
    // decisions (show admin tab, warn on expiry). It MUST NOT be used
    // for authorization — the server re-verifies. This test pins the
    // shape of the decoded object so a refactor cannot quietly start
    // trusting unverified claims.
    const payload = await page.evaluate(() => {
      // base64url({sub:"u1", exp: 4102444800})
      const t = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSIsImV4cCI6NDEwMjQ0NDgwMH0.sig';
      return window.decodeJwt(t);
    });
    expect(payload).toEqual({ sub: 'u1', exp: 4102444800 });
  });

  test('decodeJwt returns null on malformed input', async ({ page }) => {
    // Protects: malformed tokens must not throw into the event loop —
    // a thrown error here bricks SPA bootstrap. Null is the signal the
    // caller uses to fall back to the auth wall.
    const out = await page.evaluate(() => window.decodeJwt('not-a-jwt'));
    expect(out).toBeNull();
  });

  test('throttle collapses rapid calls to a single trailing invocation', async ({ page }) => {
    // Protects: the streaming renderer calls throttle() on every SSE
    // frame. If throttle stops coalescing, a fast provider floods the
    // DOM with re-renders and the tab locks up under load.
    const count = await page.evaluate(async () => {
      let n = 0;
      const f = window.throttle(() => { n += 1; }, 50);
      for (let i = 0; i < 20; i++) f();
      await new Promise(r => setTimeout(r, 120));
      return n;
    });
    expect(count).toBeGreaterThanOrEqual(1);
    expect(count).toBeLessThanOrEqual(3);
  });

  test('extractHtmlCode returns the first fenced html block or null', async ({ page }) => {
    // Protects: the design workspace preview pane parses provider output
    // for a ```html fence. A change that returns the *last* block, or
    // the whole message, breaks every preview and leaks surrounding
    // prose into the iframe.
    const got = await page.evaluate(() =>
      window.extractHtmlCode('blah\n```html\n<b>x</b>\n```\nmore'),
    );
    expect(got).toBe('<b>x</b>');

    const none = await page.evaluate(() =>
      window.extractHtmlCode('no fence here'),
    );
    expect(none).toBeNull();
  });
});