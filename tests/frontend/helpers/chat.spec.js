// Chat round-trip contract tests.
//
// Invariants:
//   - Submitting the composer issues a POST to /api/chat.
//   - The streamed reply is appended to the transcript as a bubble.
//   - Copy and regenerate affordances are present on the assistant bubble.
const { test, expect } = require('@playwright/test');
const { injectAuth } = require('./helpers/auth');
const { mockHealth, mockChat } = require('./helpers/api');

test.describe('chat', () => {
  test.beforeEach(async ({ page }) => {
    await mockHealth(page);
    await injectAuth(page);
  });

  test('sending a message renders the user bubble and the streamed reply', async ({ page }) => {
    // Protects: the full send → stream → render path. If either half of
    // this fails, the product is unusable regardless of backend quality.
    await mockChat(page, { reply: 'HELLO FROM STUB', streamed: true });
    await page.goto('/');

    const composer = page.getByTestId('chat-composer');
    await composer.fill('hi there');
    await composer.press('Enter');

    // User bubble appears optimistically.
    await expect(
      page.getByTestId('message-user').filter({ hasText: 'hi there' }),
    ).toBeVisible();

    // Assistant bubble appears once the SSE stream completes.
    await expect(
      page.getByTestId('message-assistant').filter({ hasText: 'HELLO FROM STUB' }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('assistant bubble exposes copy and regenerate actions', async ({ page }) => {
    // Protects: the two per-message affordances users reach for most.
    // Their absence is easy to miss in manual QA because the reply still
    // renders — this test makes it a hard failure.
    await mockChat(page, { reply: 'COPY ME', streamed: true });
    await page.goto('/');
    await page.getByTestId('chat-composer').fill('hi');
    await page.getByTestId('chat-composer').press('Enter');

    const bubble = page.getByTestId('message-assistant').last();
    await expect(bubble).toBeVisible();
    await expect(bubble.getByTestId('btn-copy')).toBeVisible();
    await expect(bubble.getByTestId('btn-regenerate')).toBeVisible();
  });

  test('non-streaming JSON reply also renders', async ({ page }) => {
    // Protects: the client must tolerate a non-SSE response (used by
    // providers that cannot stream). If the parser only accepts SSE,
    // those providers become silently unusable.
    await mockChat(page, { reply: 'PLAIN JSON REPLY', streamed: false });
    await page.goto('/');
    await page.getByTestId('chat-composer').fill('hi');
    await page.getByTestId('chat-composer').press('Enter');

    await expect(
      page.getByTestId('message-assistant').filter({ hasText: 'PLAIN JSON REPLY' }),
    ).toBeVisible();
  });
});