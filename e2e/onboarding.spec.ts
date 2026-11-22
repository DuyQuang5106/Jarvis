import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

test('review, bỏ chọn một mục, nhập; hộp thoại không hiện lại', async ({ page, request }) => {
  await resetDb(request, { onboarded: false });
  await page.goto('/context');
  const dialog = page.getByRole('dialog', { name: 'Review & import' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Algebra' }).uncheck();
  await dialog.getByRole('button', { name: 'Nhập mục đã chọn' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('listitem').filter({ hasText: 'chưa xác minh lại' })).toHaveCount(8);
  await expect(page.getByText('Algebra')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Review & import' })).toHaveCount(0);
});

test('Bỏ qua không tạo gì', async ({ page, request }) => {
  await resetDb(request, { onboarded: false });
  await page.goto('/context');
  await page.getByRole('button', { name: 'Bỏ qua' }).click();
  await expect(page.getByText('Chưa có mục nào.')).toBeVisible();
});

test('nhãn chưa xác minh lại biến mất sau lần sửa đầu tiên', async ({ page, request }) => {
  await resetDb(request, { seed: true });
  await page.goto('/context');
  const row = page.getByRole('listitem').filter({ hasText: 'Database' });
  await expect(row).toContainText('chưa xác minh lại');
  await row.click();
  await page.getByRole('dialog').getByLabel('Trạng thái').selectOption('active');
  await page.getByRole('dialog').getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listitem').filter({ hasText: 'Database' })).not.toContainText('chưa xác minh lại');
});
