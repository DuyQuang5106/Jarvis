import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

// 11:30 on 10/03/2025 in Asia/Ho_Chi_Minh: the morning slot has just ended.
const NOW = '2025-03-10T04:30:00.000Z';

test.beforeEach(({ isMobile }) => { test.skip(!isMobile, 'Tab Hôm nay là của điện thoại'); });

test('Hôm nay: trả lời check-in thì tin nhắn đi vào ô Chung', async ({ page, request }) => {
  await resetDb(request, { seed: true, checkins: true });
  await page.setExtraHTTPHeaders({ 'x-e2e-now': NOW });
  await page.goto('/today');
  const card = page.getByTestId('checkin-card');
  await expect(card).toContainText('Buổi sáng nay bạn đã làm gì?');
  await expect(page.getByTestId('daily-brief-task')).toHaveCount(3, { timeout: 15_000 }); // after hydration
  await card.getByLabel('Buổi sáng nay bạn đã làm gì?').fill('Ôn chương 5 Algebra');
  await card.getByRole('button', { name: 'Trả lời' }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.locator('[data-role="user"]')).toHaveText(['Buổi sáng 10/03 tôi đã làm: Ôn chương 5 Algebra']);
  await expect(page.getByTestId('proposal-card')).toContainText('Algebra');
});

test('Hôm nay: lời nhắc tới giờ hiện ở đầu, Xong thì biến mất', async ({ page, request }) => {
  await resetDb(request, { seed: true });
  // Ask for a reminder in "Chung", approve it, then look at "Hôm nay" the next evening.
  await page.goto('/chat');
  await page.getByPlaceholder('Nhắn gì đó…').fill('Nhắc tôi chốt nguồn tài liệu khi đến tối');
  await page.getByRole('button', { name: 'Gửi' }).click();
  const proposal = page.getByTestId('proposal-card');
  await proposal.getByRole('button', { name: 'Approve' }).click();
  await expect(proposal).toContainText('Đã áp dụng 1/1 thay đổi');
  const vnToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  const tomorrowEvening = new Date(`${vnToday}T21:00:00+07:00`);
  tomorrowEvening.setUTCDate(tomorrowEvening.getUTCDate() + 1);
  await page.setExtraHTTPHeaders({ 'x-e2e-now': tomorrowEvening.toISOString() });
  await page.goto('/today');
  const reminder = page.getByTestId('reminder');
  await expect(reminder).toContainText('Chốt nguồn tài liệu');
  await reminder.getByRole('button', { name: 'Xong' }).click();
  await expect(page.getByTestId('reminder')).toHaveCount(0);
});

test('Hôm nay: "Tổng kết tuần này" sinh thẻ tổng kết và mở được cuộc chat tổng kết', async ({ page, request }) => {
  await resetDb(request, { seed: true, weeklyReview: true });
  await page.setExtraHTTPHeaders({ 'x-e2e-now': '2025-03-12T05:00:00.000Z' }); // Wednesday
  await page.goto('/today');
  await expect(page.getByTestId('daily-brief-task')).toHaveCount(3, { timeout: 15_000 }); // hydrated
  await page.getByRole('button', { name: 'Tổng kết tuần này' }).click();
  const card = page.getByTestId('weekly-review-card');
  await expect(card).toContainText('Tổng kết tuần 10/03–16/03');
  await card.getByRole('link', { name: 'Mở tổng kết' }).click();
  await expect(page).toHaveURL(/\/chat\?c=[0-9a-f-]{36}/);
});
