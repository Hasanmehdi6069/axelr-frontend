# AXELR Frontend E2E

**7 files. Runs offline. Every assertion is deterministic.**

## Layout

| File | What it tests |
|------|---------------|
| `helpers.js` | All mocks + boot helper + error collection |
| `10-session.spec.js` | auth, workspace, chat, history (17 tests) |
| `20-product.spec.js` | features, billing, security, e2e, pure (21 tests) |
| `playwright.config.js` | Config — `testDir: './'` |
| `deploy-frontend.ps1` | Test-gated deploy |
| `../golden.test.js` | Input engine (node runner, 47 assertions) |

## Prerequisites

```bash
# 1. Backend (serves SPA + /api/*)
uvicorn app:app --port 8000

# 2. Playwright
npm install
npx playwright install chromium