// tests/frontend/specs/50-features.spec.js
//
// Modals, features menu, prompt enhancer, workspace-scoped tools.
const { test, expect } = require('@playwright/test');
const h = require('../helpers');

test.describe('50 · features & modals', () => {
  test.beforeEach(async ({ page }) => {
    await h.mockHealth(page);
    await h.injectAuth(page);
    await h.mockUserProfile(page);
    await h.mockHistory(page, { logs: [] });
  });

  test('features menu opens, filters by tier, and closes on outside click', async ({ page }) => {
    // WHY: the '+' menu shows only tools the user's tier can run. If a
    // business-tier tool leaks to free, the tool call 403s and the user
    // sees a mystery failure.
    await page.goto('/');
    await h.waitForBoot(page);

    await page.locator('#features-trigger').click();
    await expect(page.locator('#features-menu')).toHaveClass(/open/);

    // Free tier should NOT see the "Automated Pipeline" item (min tier: business).
    const labels = await page.locator('#features-menu .feature-item').allInnerTexts();
    expect(labels.join('\n')).not.toContain('Automated Pipeline');

    // Outside click closes.
    await page.locator('#viewport').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#features-menu')).not.toHaveClass(/open/);
  });

  test('enhancer opens the diff review modal on change', async ({ page }) => {
    // WHY: the enhancer review modal is the ONLY place users can accept
    // or reject a rewritten prompt. A silent rewrite would be a trust
    // event — the user must consent.
    await h.mockEnhancePrompt(page, { changed: true });
    await page.goto('/');
    await h.waitForBoot(page);
    await page.locator('#prompt-input').fill('please write code');
    await page.locator('#enhance-trigger').click();

    const modal = page.locator('#enhance-review-modal');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal).toContainText('Enhanced Prompt');
    await expect(modal.locator('#enhance-accept-btn')).toBeVisible();
    await expect(modal.locator('#enhance-reject-btn')).toBeVisible();

    // Rejecting must keep the original prompt in the input.
    await modal.locator('#enhance-reject-btn').click();
    const value = await page.locator('#prompt-input').inputValue();
    expect(value).toBe('please write code');
  });

  test('enhancer no-op does not open the modal', async ({ page }) => {
    // WHY: opening the review modal for a no-op wastes a click and trains
    // users to ignore it.
    await h.mockEnhancePrompt(page, { changed: false });
    await page.goto('/');
    await h.waitForBoot(page);
    await page.locator('#prompt-input').fill('already optimal prompt');
    await page.locator('#enhance-trigger').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#enhance-review-modal')).toHaveCount(0);
  });

  test('settings modal renders and closes cleanly', async ({ page }) => {
    await page.goto('/');
    await h.waitForBoot(page);
    await page.evaluate(() => window.Axelr.openSettingsModal());
    await expect(page.locator('#settings-modal')).toHaveClass(/active/);
    await page.evaluate(() => window.Axelr.closeModals());
    await expect(page.locator('#settings-modal')).not.toHaveClass(/active/);
  });
});