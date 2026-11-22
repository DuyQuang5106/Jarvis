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

async function openNotes(page: Page, name: string) {
  await page.goto('/context');
  await page.getByRole('button', { name: 'Thêm' }).click();
  await page.getByLabel('Tên', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Tạo' }).click();
  await page.getByRole('listitem').filter({ hasText: name }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('tab', { name: 'Notes' }).click();
  await drawer.getByRole('button', { name: 'Thêm ghi chú' }).click();
  return drawer;
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

test('xóa note khi lần tạo đầu còn đang chạy thì không để lại note mồ côi', async ({ page }) => {
  const drawer = await openNotes(page, 'Race Delete');
  const release = await holdWrites(page);
  const box = drawer.getByRole('textbox').first();
  await box.fill('Sẽ bị xóa');
  await box.blur();
  await expect(drawer.locator('li[aria-busy="true"]')).toHaveCount(1);
  await drawer.getByRole('button', { name: 'Xóa', exact: true }).click();
  await drawer.getByRole('button', { name: 'Xác nhận xóa' }).click();
  release();
  await expect(drawer.getByRole('textbox')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('dialog').getByText('Chưa có ghi chú nào.')).toBeVisible();
});

test('bật Không gửi cho AI khi lần tạo đầu còn đang chạy vẫn được lưu', async ({ page }) => {
  const drawer = await openNotes(page, 'Race Toggle');
  const release = await holdWrites(page);
  const box = drawer.getByRole('textbox').first();
  await box.fill('Riêng tư');
  await box.blur();
  await expect(drawer.locator('li[aria-busy="true"]')).toHaveCount(1);
  await drawer.getByRole('switch', { name: 'Không gửi cho AI' }).click();
  release();
  // Busy stays on from the create through the queued toggle, so zero means both writes landed.
  await expect(drawer.locator('li[aria-busy="true"]')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('dialog').getByRole('switch', { name: 'Không gửi cho AI' })).toBeChecked();
});

test('lưu lỗi khi đóng drawer: báo lỗi và giữ lại nội dung', async ({ page }) => {
  const drawer = await openNotes(page, 'Race Fail');
  await page.route('**/context**', (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
  await drawer.getByRole('textbox').first().fill('Đừng mất tôi');
  await page.keyboard.press('Escape');
  await expect(page.getByText('Không lưu được ghi chú.')).toBeVisible();
  await page.unroute('**/context**');
  await page.getByRole('listitem').filter({ hasText: 'Race Fail' }).click();
  await page.getByRole('dialog').getByRole('tab', { name: 'Notes' }).click();
  await expect(page.getByRole('dialog').getByRole('textbox').first()).toHaveValue('Đừng mất tôi');
});
