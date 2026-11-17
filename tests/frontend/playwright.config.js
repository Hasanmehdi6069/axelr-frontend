// playwright.config.js — must live next to the spec files (testDir: './').
// testIgnore defends against any future stale specs/ that reappear.
const { defineConfig, devices } = require('@playwright/test');
const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:8000';

module.exports = defineConfig({
  testDir: './',
  testIgnore: ['specs/**', 'node_modules/**'],
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
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});