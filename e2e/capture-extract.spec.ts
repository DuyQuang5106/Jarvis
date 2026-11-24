import { expect, test, type Page } from '@playwright/test';
import { resetDb } from './helpers';

async function fillCapture(page: Page, text: string) {
  await expect(async () => {
    await page.getByPlaceholder('Ghi nhanh…').fill('');
    await page.getByPlaceholder('Ghi nhanh…').fill(text);
    await expect(page.getByRole('button', { name: 'Lưu ghi chú' })).toBeEnabled({ timeout: 1000 });
  }).toPass();
}

test('quick capture → Extract suggestions → duyệt → note rời Inbox (flow B của spec)', async ({ page, request, isMobile }) => {
  await resetDb(request, { seed: true });
  await page.goto('/context');
  await fillCapture(page, 'Database lab đã nộp');
  await page.getByRole('button', { name: 'Lưu ghi chú' }).click();
  await expect(page.getByText('Inbox (1)')).toBeVisible();
  await page.getByRole('button', { name: 'Extract suggestions' }).click();
  const card = page.getByTestId('proposal-card');
  await expect(card).toContainText('Tạo task “Việc từ ghi chú”');
  await expect(card).toContainText('Database');
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Inbox (1)')).toHaveCount(0);
  await page.getByRole('main').getByRole('listitem').filter({ hasText: 'Database' }).click();
  if (isMobile) await page.getByRole('dialog').getByRole('button', { name: 'Vận hành' }).click();
  await page.getByRole('dialog').getByRole('tab', { name: 'Tasks' }).click();
  await expect(page.getByRole('dialog').getByRole('listitem').filter({ hasText: 'Việc từ ghi chú' })).toBeVisible();
});

test('ghi chú không khớp mục nào: báo rõ, note ở lại', async ({ page, request }) => {
  await resetDb(request, { seed: true });
  await page.goto('/context');
  await fillCapture(page, 'mua sữa');
  await page.getByRole('button', { name: 'Lưu ghi chú' }).click();
  await page.getByRole('button', { name: 'Extract suggestions' }).click();
  await expect(page.getByText('AI không tìm thấy cập nhật nào hợp lệ trong ghi chú.')).toBeVisible();
  await expect(page.getByText('Inbox (1)')).toBeVisible();
});

test('Cập nhật nhanh hỏi về mục cũ nhất', async ({ page, request }) => {
  await resetDb(request, { seed: true });
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Cập nhật nhanh' }).click();
  await expect(page.locator('[data-role="assistant"]').last()).toContainText('detail:');
});
