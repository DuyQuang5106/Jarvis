import { expect, test, type Page } from '@playwright/test';
import { resetDb } from './helpers';

test.beforeEach(async ({ request }) => { await resetDb(request); });

async function addArea(page: Page, name: string, aliases = '', { expectClose = true } = {}) {
  await page.getByRole('button', { name: 'Thêm' }).click();
  await page.getByLabel('Tên', { exact: true }).fill(name);
  if (aliases) await page.getByLabel('Tên gọi tắt').fill(aliases);
  await page.getByRole('button', { name: 'Tạo' }).click();
  if (expectClose) await expect(page.getByRole('dialog')).toBeHidden();
}

test('trạng thái rỗng', async ({ page }) => {
  await page.goto('/context');
  await expect(page.getByText('Chưa có mục nào. Bấm Thêm để tạo môn học đầu tiên.')).toBeVisible();
});

test('thêm môn, thấy trong danh sách với trạng thái Unknown và nhãn thiếu dữ liệu', async ({ page }) => {
  await page.goto('/context');
  await addArea(page, 'Mobile Programming', 'Mobile');
  const row = page.getByRole('listitem').filter({ hasText: 'Mobile Programming' });
  await expect(row).toContainText('Unknown');
  await expect(row).toContainText('Chưa có topic');
  await page.getByRole('tab', { name: 'Projects' }).click();
  await expect(page.getByText('Mobile Programming')).toHaveCount(0);
});

test('tên toàn khoảng trắng bị từ chối ngay trong hộp thoại', async ({ page }) => {
  await page.goto('/context');
  await addArea(page, '   ', '', { expectClose: false });
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(0);
});

test('tìm theo alias, không phân biệt dấu', async ({ page }) => {
  await page.goto('/context');
  await addArea(page, 'Tư tưởng Hồ Chí Minh', 'TTHCM');
  await addArea(page, 'Database');
  await page.getByPlaceholder('Tìm theo tên').fill('tu tuong');
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await page.getByPlaceholder('Tìm theo tên').fill('tthcm');
  await expect(page.getByRole('listitem')).toContainText(['Tư tưởng Hồ Chí Minh']);
});

test('bấm một dòng đưa id lên URL', async ({ page }) => {
  await page.goto('/context');
  await addArea(page, 'Database');
  await page.getByRole('listitem').filter({ hasText: 'Database' }).click();
  await expect(page).toHaveURL(/item=[0-9a-f-]{36}/);
});

test('mọi ô nhập và select trên /context có cỡ chữ từ 16px', async ({ page }) => {
  await page.goto('/context');
  await page.getByRole('button', { name: 'Thêm' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const sizes = await page.evaluate(() =>
    [...document.querySelectorAll('input, select, textarea')].map((el) => parseFloat(getComputedStyle(el).fontSize)),
  );
  expect(sizes.length).toBeGreaterThanOrEqual(4);
  for (const s of sizes) expect(s).toBeGreaterThanOrEqual(16);
});
