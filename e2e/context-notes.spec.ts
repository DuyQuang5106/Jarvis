import { expect, test, type Page } from '@playwright/test';
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
  await page.reload();
  await expect(page.getByText('Inbox (1)')).toHaveCount(0);
});

test('ghi nhận tiến độ thủ công trên timeline Activity', async ({ page, isMobile }) => {
  await page.goto('/context');
  await page.getByRole('button', { name: 'Thêm' }).click();
  await page.getByLabel('Tên', { exact: true }).fill('Mobile Programming');
  await page.getByRole('button', { name: 'Tạo' }).click();
  await page.getByRole('listitem').filter({ hasText: 'Mobile Programming' }).click();
  const drawer = page.getByRole('dialog');
  if (isMobile) await drawer.getByRole('button', { name: 'Vận hành' }).click();
  await drawer.getByRole('tab', { name: 'Activity' }).click();
  await drawer.getByPlaceholder('Ghi nhận tiến độ…').fill('Đã đọc xong chương 1');
  await drawer.getByRole('button', { name: 'Thêm log' }).click();
  await expect(drawer.getByText('Ghi nhận tiến độ')).toBeVisible();
  await expect(drawer.getByText('Đã đọc xong chương 1')).toBeVisible();
  await expect(drawer.getByText('Thủ công').first()).toBeVisible();
});

/** Text typed before hydration is dropped by the controlled textarea: retry until the save button is enabled. */
async function fillCapture(page: Page, text: string) {
  await expect(async () => {
    // Clear first: refilling the same value fires no change event, so React would never see it.
    await page.getByPlaceholder('Ghi nhanh…').fill('');
    await page.getByPlaceholder('Ghi nhanh…').fill(text);
    await expect(page.getByRole('button', { name: 'Lưu ghi chú' })).toBeEnabled({ timeout: 1000 });
  }).toPass();
}

/** Holds every server-action POST until `release()` is called. */
async function holdWrites(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route('**/context**', async (route) => {
    if (route.request().method() === 'POST') await gate;
    await route.continue();
  });
  return release;
}

test('note trong Inbox có công tắc Không gửi cho AI, lưu ngay và hoàn lại khi lỗi', async ({ page }) => {
  await page.goto('/context');
  await fillCapture(page, 'Mật khẩu wifi lab');
  await page.getByRole('button', { name: 'Lưu ghi chú' }).click();
  await expect(page.getByText('Inbox (1)')).toBeVisible();
  const toggle = page.getByRole('switch', { name: 'Không gửi cho AI' });
  const box = await toggle.locator('xpath=ancestor::label').boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(43.5);
  await toggle.click();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Không gửi cho AI' })).toBeChecked();

  await page.route('**/context**', (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
  await page.getByRole('switch', { name: 'Không gửi cho AI' }).click();
  await expect(page.locator('details').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Không gửi cho AI' })).toBeChecked();
});

test('Ctrl+Enter hai lần nhanh chỉ tạo một note', async ({ page }) => {
  await page.goto('/context');
  const release = await holdWrites(page);
  const box = page.getByPlaceholder('Ghi nhanh…');
  await fillCapture(page, 'Một lần thôi');
  await box.press('Control+Enter');
  await box.press('Control+Enter');
  await expect(page.getByRole('button', { name: 'Đang lưu…' })).toBeVisible();
  release();
  await expect(box).toHaveValue('');
  await expect(page.getByText('Inbox (1)')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Inbox (1)')).toBeVisible();
});
