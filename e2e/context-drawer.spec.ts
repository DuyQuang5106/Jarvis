import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await page.goto('/context');
  await page.getByRole('button', { name: 'Thêm' }).click();
  await page.getByLabel('Tên', { exact: true }).fill('Computer Networks');
  await page.getByRole('button', { name: 'Tạo' }).click();
  await page.getByRole('listitem').filter({ hasText: 'Computer Networks' }).click();
});

test('drawer mở theo URL và còn nguyên sau khi tải lại', async ({ page }) => {
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  await expect(drawer).toBeVisible();
  await page.reload();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('tab')).toHaveText(['Tổng quan', 'Tasks', 'Topics', 'Assessments', 'Notes', 'Activity']);
});

test('sửa tổng quan được lưu và hiện ở danh sách', async ({ page }) => {
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  await drawer.getByLabel('Trạng thái').selectOption('active');
  await drawer.getByLabel('Việc tiếp theo').fill('Ôn VLSM');
  await drawer.getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.keyboard.press('Escape');
  const row = page.getByRole('listitem').filter({ hasText: 'Computer Networks' });
  await expect(row).toContainText('Active');
  await expect(row).toContainText('Ôn VLSM');
});

test('thêm task, đổi trạng thái, xóa', async ({ page }) => {
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  await drawer.getByRole('tab', { name: 'Tasks' }).click();
  await expect(page).toHaveURL(/section=tasks/);
  await drawer.getByPlaceholder('Thêm task…').fill('Làm lab subnetting');
  await page.keyboard.press('Enter');
  const item = drawer.getByRole('listitem').filter({ hasText: 'Làm lab subnetting' });
  await item.getByLabel('Trạng thái').selectOption('done');
  await page.reload();
  await expect(drawer.getByRole('listitem').filter({ hasText: 'Làm lab subnetting' }).getByLabel('Trạng thái')).toHaveValue('done');
  await drawer.getByRole('listitem').filter({ hasText: 'Làm lab subnetting' }).getByRole('button', { name: 'Xóa' }).click();
  await page.getByRole('button', { name: 'Xác nhận xóa' }).click();
  await expect(drawer.getByRole('listitem')).toHaveCount(0);
});

test('ô nhập trong drawer không nhỏ hơn 16px', async ({ page }) => {
  const sizes = await page.getByRole('dialog').locator('input, textarea, select').evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);
});
