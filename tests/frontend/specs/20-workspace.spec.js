// tests/frontend/specs/20-workspace.spec.js
//
// Workspace detector conformance (mirror of api/workspace_detector.py),
// theme switching, quota rendering, model branding.
const { test, expect } = require('@playwright/test');
const h = require('../helpers');

test.describe('20 · workspace', () => {
  test.beforeEach(async ({ page }) => {
    await h.mockHealth(page);
    await h.injectAuth(page);
    await h.mockUserProfile(page);
    await h.mockHistory(page, { logs: [] });
  });

  test('detector conformance vectors pass in-browser', async ({ page }) => {
    // WHY: this mirrors `api/workspace_detector.CONFORMANCE_VECTORS` on the
    // client. If the client classifier drifts from the server one, the UI
    // routes a request one way and the server routes it another — silent
    // quality regression, not a crash.
    await page.goto('/');
    await h.waitForBoot(page);
    const result = await page.evaluate(async () => {
      const out = [];
      const R = window.Axelr.AxelrReasoning;      // not used, just shape check
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
    // WHY: the workspace selector is the ONLY path to switch workspaces
    // manually. If it silently fails, users are stuck on Core.
    await page.goto('/');
    await h.waitForBoot(page);
    await page.evaluate(() => window.Axelr.showWorkspaceSelector());
    await expect(page.locator('#workspace-selector')).toBeVisible();

    // The Core card uses class "workspace-card general" (index.html line).
    await page.locator('.workspace-card.general').click();
    await expect(page.locator('body')).toHaveClass(/workspace-core/);
    expect(await page.evaluate(() => localStorage.getItem('Axelr_workspace'))).toBe('core');

    // Switch to Data.
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
    await page.evaluate(async () => {
      await window.Axelr.loadUserProfile();
    });
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