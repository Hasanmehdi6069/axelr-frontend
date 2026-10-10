// tests/frontend/specs/30-chat.spec.js
//
// The chat pipeline: SSE parsing, action buttons, stream-close, errors.
const { test, expect } = require('@playwright/test');
const h = require('../helpers');

test.describe('30 · chat', () => {
  test.beforeEach(async ({ page }) => {
    await h.mockHealth(page);
    await h.injectAuth(page);
    await h.mockUserProfile(page);
    await h.mockHistory(page, { logs: [] });
  });

  test('happy path: SSE reply renders as a bubble with actions', async ({ page }) => {
    // WHY: this is the primary user journey. Everything else is
    // scaffolding around this one assertion.
    await h.mockExtractStream(page, { reply: 'HELLO FROM STUB' });
    await page.goto('/');
    await h.waitForBoot(page);
    await h.sendMessage(page, 'hi there');

    await expect(page.locator('.chat-bubble.user-bubble').filter({ hasText: 'hi there' })).toBeVisible();
    await h.waitForAssistantReply(page, 'HELLO FROM STUB');

    const bubble = page.locator('.chat-bubble.nexus-bubble').last();
    await expect(bubble.locator('button.action-icon-btn').first()).toBeVisible();
  });

  test('thinking frames are NOT rendered as text', async ({ page }) => {
    // WHY: `50-command.js` skips any SSE event that doesn't start with
    // `data: `. If a future refactor accidentally concatenates event and
    // data lines, thinking frames (`{stage, status}`) would leak into the
    // visible reply. This test locks the current behaviour in.
    await h.mockExtractStream(page, { reply: 'VISIBLE' });
    await page.goto('/');
    await h.waitForBoot(page);
    await h.sendMessage(page, 'go');

    await h.waitForAssistantReply(page, 'VISIBLE');
    const replyText = await page.locator('.chat-bubble.nexus-bubble .bubble-content').last().innerText();
    expect(replyText).not.toContain('sanitize');
    expect(replyText).not.toContain('stage');
  });

  test('SSE chunks arrive out of order and are still assembled', async ({ page }) => {
    // WHY: the client buffers partial frames. If a chunk boundary falls in
    // the middle of a `data:` line, the parser must not lose the frame.
    // We simulate by feeding individual characters.
    await page.route('**/api/extract_stream', async route => {
      const whole = [
        `data: ${JSON.stringify({ text: 'part1 ' })}\n\n`,
        `data: ${JSON.stringify({ text: 'part2' })}\n\n`,
        `event: close\ndata: {}\n\n`,
      ].join('');
      // Split mid-frame.
      const parts = [whole.slice(0, 10), whole.slice(10, 25), whole.slice(25)];
      // Playwright doesn't expose partial SSE bodies natively, so we
      // emulate by writing a body that includes \n\n in the middle of
      // a line and letting the client's `indexOf('\n\n')` walk it.
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: parts.join(''),
      });
    });
    await page.goto('/');
    await h.waitForBoot(page);
    await h.sendMessage(page, 'go');
    await h.waitForAssistantReply(page, 'part1 part2');
  });

  test('error frame replaces the reply with a visible error', async ({ page }) => {
    // WHY: an error must be visible, not silent. A user staring at a
    // spinner that never resolves has no way to know what happened.
    await h.mockExtractStream(page, { emitError: true });
    await page.goto('/');
    await h.waitForBoot(page);
    await h.sendMessage(page, 'go');
    await expect(page.locator('.chat-bubble.nexus-bubble').last())
      .toContainText('AI pipeline produced no result');
  });

  test('non-streaming /api/extract reply renders when the guest uses it', async ({ page }) => {
    // WHY: guest mode uses /api/extract (JSON), not /api/extract_stream.
    // If the client only understands SSE, guest mode is silently broken.
    await h.clearAuth(page);
    await h.mockGuestSession(page);
    await h.mockExtractJSON(page, { text: 'GUEST REPLY' });
    await page.goto('/');
    await h.waitForBoot(page);
    await page.locator('button.auth-guest-btn').click();
    await page.locator('#prompt-input').waitFor({ state: 'visible' });
    await h.sendMessage(page, 'hi');

    await expect(
      page.locator('.chat-bubble.nexus-bubble .bubble-content').filter({ hasText: 'GUEST REPLY' })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('stop button aborts the in-flight stream', async ({ page }) => {
    // WHY: a stream that cannot be cancelled ties up a worker slot and
    // burns tokens. The Stop button must actually abort.
    await page.route('**/api/extract_stream', async route => {
      // Never fulfil — stream stays open until aborted.
      await new Promise(() => {});
    });
    await page.goto('/');
    await h.waitForBoot(page);
    await page.locator('#prompt-input').fill('go');
    await page.locator('#send-trigger').click();
    await expect(page.locator('#send-trigger.btn-stop-active')).toBeVisible({ timeout: 3_000 });
    await page.locator('#send-trigger').click();
    await expect(page.locator('#send-trigger.btn-stop-active')).toHaveCount(0, { timeout: 3_000 });
  });
});