// playwright.config.js
// ============================================================================
// AXELR Frontend E2E.
//
// Requires a running backend at E2E_BASE_URL (default http://127.0.0.1:8000).
// The backend serves the SPA and /api/*; the tests intercept /api/* via
// page.route() so no real provider is ever hit.
//
// Determinism rules:
//   - Every spec installs its own API mocks in `beforeEach`.
//   - Time is faked with a global Date.now() shim, NOT with sleeps.
//   - Console errors and uncaught rejections fail the test.
// ============================================================================
const { defineConfig, devices } = require('@playwright/test');

const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:8000';

module.exports = defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    serviceWorkers: 'allow',
    // Deterministic locale + timezone so timestamps don't drift.
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});