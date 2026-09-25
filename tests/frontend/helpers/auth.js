// Injects a synthetic JWT + user record into localStorage before the
// SPA boots, so tests can skip the real login flow.
//
// The localStorage keys below match the keys the AXELR SPA reads on
// bootstrap. If the SPA renames them, update this file — do NOT weaken
// the auth wall in application code to make tests pass.
const TOKEN_KEY = 'axelr_token';
const USER_KEY  = 'axelr_user';

/**
 * Seed localStorage with a fake session before the first navigation.
 * Must be awaited before `page.goto('/')`.
 */
async function injectAuth(page, {
  token  = 'e2e.fake.jwt',
  userId = 'u_e2e_0001',
  tier   = 'free',
} = {}) {
  await page.addInitScript(
    ([t, u]) => {
      localStorage.setItem('axelr_token', t);
      localStorage.setItem('axelr_user', JSON.stringify(u));
    },
    [token, { userId, tier, email: `${userId}@e2e.test` }],
  );
}

/**
 * Remove the session — used to assert the auth wall re-renders.
 */
async function clearAuth(page) {
  await page.addInitScript(([tk, uk]) => {
    localStorage.removeItem(tk);
    localStorage.removeItem(uk);
  }, [TOKEN_KEY, USER_KEY]);
}

module.exports = { injectAuth, clearAuth, TOKEN_KEY, USER_KEY };