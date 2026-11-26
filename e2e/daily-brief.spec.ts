import { expect, test, type Page } from '@playwright/test';
import { resetDb } from './helpers';

test.beforeEach(async ({ request }) => { await resetDb(request, { seed: true }); });

const card = (page: Page) => page.getByTestId('daily-brief');
const tasks = (page: Page) => card(page).getByTestId('daily-brief-task');

test('thẻ định hướng: 3 việc ở đầu Chat, tải lại không sinh lại, "Bắt đầu việc 1" gửi tin nhắn', async ({ page }) => {
  await page.goto('/chat');
  await expect(card(page)).toContainText('Định hướng hôm nay');
  await expect(tasks(page)).toHaveCount(3);
  await expect(card(page)).toHaveAttribute('aria-busy', 'false');
  // The mock brief names real areas of the seed and the day it is for.
  await expect(card(page)).toContainText(/MOCK_BRIEF \d{4}-\d{2}-\d{2}: bắt đầu với /);
  await expect(card(page)).toContainText('Lâu chưa cập nhật:');
  const firstTask = await tasks(page).first().innerText();
  const match = /^1?\s*Việc 1 cho (.+?) · (.+)\n/.exec(firstTask);
  expect(match, firstTask).not.toBeNull();
  const area = match![2].trim();
  expect(match![1]).toBe(area);

  // The card sits above the prompts and leaves the composer on screen.
  const cardBox = (await card(page).boundingBox())!;
  const promptsBox = (await page.getByTestId('suggested-prompts').boundingBox())!;
  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(promptsBox.y);
  await expect(page.getByPlaceholder('Nhắn gì đó…')).toBeInViewport();

  // Reload: the stored brief is rendered by the server, nothing is generated again.
  // textContent, not innerText: right after a reload innerText can run before styles apply and drop the line breaks.
  const content = await card(page).textContent();
  let actionCalls = 0;
  page.on('request', (r) => { if (r.method() === 'POST' && r.headers()['next-action']) actionCalls++; });
  await page.reload();
  await expect(tasks(page)).toHaveCount(3);
  await expect.poll(() => card(page).textContent()).toBe(content);
  await page.waitForLoadState('networkidle');
  expect(actionCalls).toBe(0);

  // `Làm mới` regenerates in place.
  await card(page).getByRole('button', { name: 'Làm mới' }).click();
  await expect(card(page).getByRole('button', { name: 'Làm mới' })).toBeEnabled();
  await expect(tasks(page)).toHaveCount(3);
  expect(actionCalls).toBe(1);

  // `Bắt đầu việc 1` goes through the normal send path.
  await card(page).getByRole('button', { name: 'Bắt đầu việc 1' }).click();
  await expect(page.locator('[data-role="user"]')).toHaveText([`Giúp tôi bắt đầu: Việc 1 cho ${area} (${area})`]);
  await expect(page.locator('[data-role="assistant"]').last()).toContainText('MOCK_STATE');
  await expect(page).toHaveURL(/\/chat\?c=[0-9a-f-]{36}/);
  await expect(card(page)).toHaveCount(0);
});

test('workspace trống: không có thẻ định hướng', async ({ page, request }) => {
  await resetDb(request);
  await page.goto('/chat');
  await expect(page.getByTestId('suggested-prompts')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(card(page)).toHaveCount(0);
});
