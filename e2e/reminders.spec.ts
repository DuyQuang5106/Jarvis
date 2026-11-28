import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

test.beforeEach(async ({ request }) => { await resetDb(request, { seed: true }); });

/** Tomorrow at HH:MM Vietnam time, as an instant. */
function tomorrowAt(hhmm: string): string {
  const vnToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  const d = new Date(`${vnToday}T${hhmm}:00+07:00`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

test('nhắc việc từ chat: thẻ duyệt, đến giờ thẻ nhắc hiện, nhắc lại sau và xong', async ({ isMobile, page }) => {
  test.skip(isMobile, 'Điện thoại: các thẻ này nằm ở tab Hôm nay (today.spec.ts)');
  await page.goto('/chat');
  await page.getByPlaceholder('Nhắn gì đó…').fill('Nhắc tôi chốt nguồn tài liệu khi đến tối');
  await page.getByRole('button', { name: 'Gửi' }).click();
  const card = page.getByTestId('proposal-card');
  await expect(card).toContainText('Nhắc việc');
  await expect(card).toContainText('Chốt nguồn tài liệu');
  await expect(card).toContainText('20:00');
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(card).toContainText('Đã áp dụng 1/1 thay đổi');

  // Before the time: nothing to show.
  await page.setExtraHTTPHeaders({ 'x-e2e-now': tomorrowAt('19:59') });
  await page.goto('/chat');
  await expect(page.getByPlaceholder('Nhắn gì đó…')).toBeVisible();
  await expect(page.getByTestId('reminder')).toHaveCount(0);

  // After it: the card, with its two answers.
  await page.setExtraHTTPHeaders({ 'x-e2e-now': tomorrowAt('21:00') });
  await page.goto('/chat');
  const reminder = page.getByTestId('reminder');
  await expect(reminder).toContainText('Chốt nguồn tài liệu');
  await reminder.getByRole('button', { name: 'Nhắc lại sau 1 giờ' }).click();
  await expect(reminder).toHaveCount(0);
  // Snoozed from the real clock (an hour from now), so at the test clock (tomorrow evening) it is due again.
  await page.goto('/chat');
  await expect(page.getByTestId('reminder')).toHaveCount(1);
  await page.getByTestId('reminder').getByRole('button', { name: 'Xong' }).click();
  await expect(page.getByTestId('reminder')).toHaveCount(0);
  await page.goto('/chat');
  await expect(page.getByPlaceholder('Nhắn gì đó…')).toBeVisible();
  await expect(page.getByTestId('reminder')).toHaveCount(0);
});
