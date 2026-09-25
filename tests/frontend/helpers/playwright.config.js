// Playwright configuration for AXELR frontend E2E.
//
// The backend is expected to be reachable at E2E_BASE_URL (default
// http://127.0.0.1:8000) and to serve both the SPA and the /api/* routes.
// CI starts uvicorn before invoking `npx playwright test`; locally the
// developer runs `uvicorn app:app --reload` first.
//
// All test files mock /api/* via page.route() — the backend only needs to
// be up so the SPA's bootstrap fetch (health check) does not 500.
const { defineConfig, devices } = require('@playwright/test');

const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:8000';

module.exports = defineConfig({
  testDir: __dirname,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // The app registers a service worker; keep a clean context per test.
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});