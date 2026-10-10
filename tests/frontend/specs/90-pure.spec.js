// tests/frontend/specs/90-pure.spec.js
//
// In-browser pure-function tests. Ported from the old pure.spec.js, which
// had 5 tests — 3 of them unique and worth keeping.
//
// These run inside the real browser via page.evaluate() because the helpers
// live in the SPA's classic <script> scope, not as ES modules. This exercises
// the exact code path production runs.
const { test, expect } = require('@playwright/test');
const h = require('../helpers');

test.describe('90 · pure functions (in-browser)', () => {
  test.beforeEach(async ({ page }) => {
    await h.mockHealth(page);
    await page.goto('/');
    await h.waitForBoot(page);
  });

  test('escapeHtmlEntities neutralises the five HTML-significant chars', async ({ page }) => {
    // WHY: a regression here re-opens stored XSS on any user- or
    // model-supplied string rendered via innerHTML.
    const out = await page.evaluate(() =>
      window.escapeHtmlEntities('<a href="x">&\'</a>'),
    );
    expect(out).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });

  test('escapeHtmlEntities is idempotent on already-escaped text', async ({ page }) => {
    // WHY: double-escaping turns &amp; into &amp;amp;, which the user sees
    // literally. Not re-escaping an already-safe string is part of the
    // contract.
    const once  = await page.evaluate(() => window.escapeHtmlEntities('<x>'));
    const twice = await page.evaluate(s => window.escapeHtmlEntities(s), once);
    expect(twice).toBe(once);
  });

  test('throttle collapses rapid calls to a single trailing invocation', async ({ page }) => {
    // WHY: the streaming renderer calls throttle() on every SSE frame.
    // If throttle stops coalescing, a fast provider floods the DOM with
    // re-renders and the tab locks up under load.
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
    // WHY: the design workspace preview pane parses provider output for a
    // ```html fence. A change that returns the *last* block, or the whole
    // message, breaks every preview and leaks surrounding prose into the
    // iframe.
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