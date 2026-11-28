import { expect, test, type Page } from '@playwright/test';
import { resetDb } from './helpers';

// The server's clock for this page is set with the E2E-only `x-e2e-now` header (requestNow): 11:30 on
// 10/03/2025 in Asia/Ho_Chi_Minh, so the morning has just ended. No check-in row exists yet (first use), so
// only today's slots count: the card is for this morning alone.
// Real activity written by the seed and by these tests happens at the real time, far outside those slots.
const NOW = '2025-03-10T04:30:00.000Z';
const LABEL = 'Sáng nay';
const PHRASE = 'sáng 10/03';

const card = (page: Page) => page.getByTestId('checkin-card');

async function openChat(page: Page) {
  await page.setExtraHTTPHeaders({ 'x-e2e-now': NOW });
  await page.goto('/chat');
}

/** Under load the first tap can land before hydration and the menu never opens: retry until Settings opens. */
async function openSettings(page: Page, isMobile: boolean) {
  await expect(async () => {
    const settings = page.getByRole('button', { name: 'Settings' });
    if (isMobile && !(await settings.isVisible())) await page.getByRole('button', { name: 'Mở menu' }).click();
    await settings.click({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
}

const marked = (page: Page) => page.waitForResponse((r) => r.url().endsWith('/api/checkin') && r.request().method() === 'POST');

test('buổi không có hoạt động: câu hỏi → trả lời → tin nhắn đi qua Chat → tải lại không còn thẻ', async ({ page, request }) => {
  await resetDb(request, { seed: true, checkins: true });
  let gets = 0;
  page.on('request', (r) => { if (r.url().endsWith('/api/checkin') && r.method() === 'GET') gets++; });
  await openChat(page);
  // No activity means a question and no AI call at all.
  await expect(card(page)).toHaveCount(1);
  await expect(card(page)).toContainText(`Buổi ${LABEL.toLowerCase()} bạn đã làm gì?`);
  await expect(card(page)).toHaveAttribute('aria-busy', 'false');
  expect(gets).toBe(0);
  // Above the orientation card, and the composer stays on screen.
  const brief = page.getByTestId('daily-brief');
  await expect(brief).toBeVisible();
  expect((await card(page).boundingBox())!.y).toBeLessThan((await brief.boundingBox())!.y);
  await expect(page.getByPlaceholder('Nhắn gì đó…')).toBeInViewport();
  // The brief is generated after hydration: once it is there, typing reaches React's state.
  await expect(brief.getByTestId('daily-brief-task')).toHaveCount(3, { timeout: 15_000 });

  await card(page).getByLabel(`Buổi ${LABEL.toLowerCase()} bạn đã làm gì?`).fill('Ôn chương 5 Algebra');
  const mark = marked(page);
  await card(page).getByRole('button', { name: 'Trả lời' }).click();
  expect((await mark).status()).toBe(204);
  await expect(page.locator('[data-role="user"]')).toHaveText([`Buổi ${PHRASE} tôi đã làm: Ôn chương 5 Algebra`]);
  // A progress report like any other: the mock proposes a progress log for the area it names.
  await expect(page.getByTestId('proposal-card')).toContainText('Algebra');
  await expect(card(page)).toHaveCount(0);

  // Reopened: "Chung" now holds the exchange, and the answered check-in does not come back.
  await openChat(page);
  await expect(page.locator('[data-role="user"]').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(card(page)).toHaveCount(0);
});

test('buổi có hoạt động: tóm tắt → tải lại không sinh lại → "Ghi lại" → thẻ đề xuất', async ({ page, request }) => {
  await resetDb(request, {
    seed: true,
    checkins: true,
    activity: [{ text: 'Làm xong bài tập chương 5 Algebra', at: '2025-03-10T02:00:00.000Z' }], // 09:00 on 10/03
  });
  let gets = 0;
  page.on('request', (r) => { if (r.url().endsWith('/api/checkin') && r.method() === 'GET') gets++; });
  await openChat(page);
  await expect(card(page)).toContainText(`${LABEL} bạn đã:`);
  await expect(card(page).getByTestId('checkin-item')).toHaveText(['Làm việc với Algebra · Algebra'], { timeout: 15_000 });
  await expect(card(page)).toContainText('MOCK_CHECKIN: tóm tắt buổi.');
  await expect(card(page)).toContainText('Ghi lại như vậy nhé?');
  await expect(card(page)).toHaveAttribute('aria-busy', 'false');
  expect(gets).toBe(1);

  // Reload: the stored summary comes with the page, nothing is generated again.
  await page.reload();
  await expect(card(page).getByTestId('checkin-item')).toHaveText(['Làm việc với Algebra · Algebra'], { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  expect(gets).toBe(1);

  const mark = marked(page);
  await card(page).getByRole('button', { name: 'Ghi lại' }).click();
  expect((await mark).status()).toBe(204);
  await expect(page.locator('[data-role="user"]')).toHaveText([`Ghi lại buổi ${PHRASE}: Algebra: Làm việc với Algebra`]);
  const proposal = page.getByTestId('proposal-card');
  await expect(proposal).toContainText('Algebra');
  await expect(proposal.getByRole('button', { name: 'Approve' })).toBeVisible();

  // Reopened: "Chung" now holds the exchange, and the answered check-in does not come back.
  await openChat(page);
  await expect(page.locator('[data-role="user"]').first()).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test('Bỏ qua thì không hỏi lại; tắt check-in trong Settings thì không có thẻ', async ({ page, request, isMobile }) => {
  await resetDb(request, { seed: true, checkins: true });
  await openChat(page);
  await expect(page.getByTestId('daily-brief-task')).toHaveCount(3, { timeout: 15_000 }); // generated after hydration
  const mark = marked(page);
  await card(page).getByRole('button', { name: 'Bỏ qua' }).click();
  expect((await mark).status()).toBe(204);
  await expect(card(page)).toHaveCount(0);
  // Reopened: a skipped check-in does not come back.
  await openChat(page);
  await expect(page.getByPlaceholder('Nhắn gì đó…')).toBeVisible();
  await expect(card(page)).toHaveCount(0);

  // A slot that ends later brings a new card, unless check-ins are turned off.
  await page.setExtraHTTPHeaders({ 'x-e2e-now': '2025-03-10T06:05:00.000Z' }); // 13:05
  await page.goto('/chat');
  await expect(card(page)).toContainText('Buổi trưa nay bạn đã làm gì?');
  // Let the page hydrate before the menu opens over it (the brief is stored by now, so it is no signal).
  await page.waitForLoadState('networkidle');

  await openSettings(page, isMobile);
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  const toggle = dialog.getByLabel('Hỏi việc đã làm khi một buổi kết thúc');
  await expect(toggle).toBeChecked();
  await expect(dialog.getByLabel('Trưa kết thúc')).toHaveValue('13:00');
  await toggle.click();
  await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(dialog.getByText('Đã lưu')).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.goto('/chat');
  await expect(page.getByTestId('suggested-prompts')).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test('Settings: giờ các buổi chồng lấn bị từ chối, giờ hợp lệ thì lưu', async ({ page, request, isMobile }) => {
  await resetDb(request, { seed: true, checkins: true });
  await page.goto('/context');
  await openSettings(page, isMobile);
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByLabel('Trưa bắt đầu').fill('10:30');
  await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('chồng lên buổi trước');
  await dialog.getByLabel('Sáng kết thúc').fill('10:30');
  await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(dialog.getByText('Đã lưu')).toBeVisible({ timeout: 15_000 });
  const body = await (await request.get('/api/export')).json();
  expect(body.tables.settings[0].preferencesJson.daySlots.morning).toEqual({ start: '06:00', end: '10:30' });
});
