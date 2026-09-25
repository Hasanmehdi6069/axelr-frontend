// page.route() mocks for the AXELR backend. Every helper here installs
// a deterministic, network-free stand-in for one endpoint. Tests must
// call these BEFORE the first navigation that triggers the request.
//
// No helper here talks to a real provider — that is the point.

const JSON_HEADERS = { 'content-type': 'application/json' };

/**
 * Stub /api/health so the SPA's bootstrap does not fail when the
 * backend is slow or the test runner is racing uvicorn boot.
 */
async function mockHealth(page, { status = 'operational' } = {}) {
  await page.route('**/api/health', route =>
    route.fulfill({
      status: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        status,
        timestamp: new Date().toISOString(),
        providers: {},
      }),
    }),
  );
}

/**
 * Stub /api/guest/session — returns the shape the login flow expects.
 */
async function mockGuestSession(page, {
  token  = 'guest.fake.jwt',
  userId = 'u_guest_e2e',
} = {}) {
  await page.route('**/api/guest/session', route =>
    route.fulfill({
      status: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ sessionId: userId, token, userId }),
    }),
  );
}

/**
 * Stub /api/chat. Returns a single JSON body (non-streaming) or an SSE
 * stream when `streamed` is true. The stub is deliberately simple: it
 * exists to prove the UI wiring, not to emulate the backend.
 */
async function mockChat(page, {
  reply = 'HELLO FROM STUB',
  streamed = true,
  status = 200,
} = {}) {
  await page.route('**/api/chat', async route => {
    if (!streamed) {
      return route.fulfill({
        status,
        headers: JSON_HEADERS,
        body: JSON.stringify({ text: reply, provider: 'stub' }),
      });
    }
    // Minimal SSE: two data frames + terminator. The SPA's parser must
    // accept this exactly; if it does not, the failure points at the
    // parser, not the network.
    const sse =
      `data: ${JSON.stringify({ delta: reply.slice(0, 5) })}\n\n` +
      `data: ${JSON.stringify({ delta: reply.slice(5) })}\n\n` +
      `data: ${JSON.stringify({ done: true })}\n\n`;
    return route.fulfill({
      status,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body: sse,
    });
  });
}

/**
 * Force a network failure for a given URL pattern — used by the offline
 * test to confirm the SW serves a cached response when the network dies.
 */
async function mockNetworkDown(page, pattern) {
  await page.route(pattern, route => route.abort('internetdisconnected'));
}

module.exports = { mockHealth, mockGuestSession, mockChat, mockNetworkDown };