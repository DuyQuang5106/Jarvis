import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

test.beforeEach(async ({ request }) => { await resetDb(request); });

test('quick capture vào Inbox rồi gắn vào một môn', async ({ page }) => {
  await page.goto('/context');
  await page.getByRole('button', { name: 'Thêm' }).click();
  await page.getByLabel('Tên', { exact: true }).fill('Database');
  await page.getByRole('button', { name: 'Tạo' }).click();
  // The modal traps focus until the area is saved; typing before it closes would land in its `Tên` field.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByPlaceholder('Ghi nhanh…').fill('Database lab đã nộp');
  await page.getByRole('button', { name: 'Lưu ghi chú' }).click();
  await expect(page.getByText('Inbox (1)')).toBeVisible();
  await expect(page.getByPlaceholder('Ghi nhanh…')).toHaveValue('');
  await page.getByLabel('Gắn vào…').selectOption({ label: 'Database' });
  await expect(page.getByText('Inbox (1)')).toHaveCount(0);
  await page.getByRole('listitem').filter({ hasText: 'Database' }).click();
  await page.getByRole('dialog').getByRole('tab', { name: 'Notes' }).click();
  await expect(page.getByRole('dialog').getByRole('textbox').first()).toHaveValue('Database lab đã nộp');
});

test('note tự lưu và timeline ghi lại đúng một lần cho mỗi thay đổi', async ({ page }) => {
  await page.goto('/context');
  await page.getByRole('button', { name: 'Thêm' }).click();
  await page.getByLabel('Tên', { exact: true }).fill('Mobile Programming');
  await page.getByRole('button', { name: 'Tạo' }).click();
  await page.getByRole('listitem').filter({ hasText: 'Mobile Programming' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('tab', { name: 'Notes' }).click();
  await drawer.getByRole('button', { name: 'Thêm ghi chú' }).click();
  await drawer.getByRole('textbox').first().fill('Cần xem syllabus');
  await expect(drawer.getByText('Đã lưu')).toBeVisible();
  await drawer.getByRole('tab', { name: 'Activity' }).click();
  await expect(drawer.getByText('Tạo ghi chú “Cần xem syllabus”')).toHaveCount(1);
  await drawer.getByPlaceholder('Ghi nhận tiến độ…').fill('Đã đọc xong chương 1');
  await drawer.getByRole('button', { name: 'Thêm log' }).click();
  await expect(drawer.getByText('Ghi nhận tiến độ')).toBeVisible();
  await expect(drawer.getByText('Thủ công').first()).toBeVisible();
});
