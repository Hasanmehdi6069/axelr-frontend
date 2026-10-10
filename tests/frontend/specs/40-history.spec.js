// tests/frontend/specs/40-history.spec.js
//
// History list rendering, tab switching, per-item actions.
const { test, expect } = require('@playwright/test');
const h = require('../helpers');

const TWO_LOGS = [
  { _id: 'h1', filename: 'Q3 Report', workspace: 'data', status: 'active', isPinned: false,
    createdAt: '2026-09-01T00:00:00Z', messages: [] },
  { _id: 'h2', filename: 'Landing page', workspace: 'design', status: 'active', isPinned: true,
    createdAt: '2026-09-02T00:00:00Z', messages: [] },
];

test.describe('40 · history', () => {
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
    await expect(items.filter({ hasText: 'Landing page' }).locator('.material-symbols-rounded')).toBeVisible();
  });

  test('tab switching re-fetches with the new status', async ({ page }) => {
    // WHY: the active/archived/trashed tabs each call /api/history with a
    // different `status`. If the tab switch doesn't change the query, users
    // see the wrong set of chats.
    const calls = [];
    await page.unroute('**/api/history**');
    await page.route('**/api/history**', route => {
      calls.push(route.request().url());
      return route.fulfill({
        status: 200, headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ success: true, logs: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } }),
      });
    });
    await page.goto('/');
    await h.waitForBoot(page);
    await page.locator('#tab-archived').click();
    await page.waitForFunction(() => true); // tick
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