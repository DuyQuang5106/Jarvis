import { expect, test, type Locator } from '@playwright/test';
import { resetDb } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

async function fillControlled(locator: Locator, text: string) {
  await expect(async () => {
    await locator.fill('');
    await locator.fill(text);
    await expect(locator).toHaveValue(text, { timeout: 1000 });
  }).toPass();
}

test('tạo tài liệu từ mẫu, gõ GFM, tải lại còn nguyên, bấm checklist, tìm kiếm không dấu, liên kết task và lịch sử', async ({
  page,
  isMobile,
}) => {
  await page.goto('/context');
  await page.getByRole('button', { name: 'Thêm' }).click();
  await page.getByLabel('Tên', { exact: true }).fill('Tư tưởng Hồ Chí Minh');
  await page.getByRole('button', { name: 'Tạo' }).click();

  await page.getByRole('main').getByRole('listitem').filter({ hasText: 'Tư tưởng Hồ Chí Minh' }).click();
  const ws = page.getByRole('dialog', { name: 'Tư tưởng Hồ Chí Minh' });
  await expect(ws).toBeVisible();

  // A9: tạo tài liệu từ template ở trạng thái rỗng
  await ws.getByRole('button', { name: 'Tiến độ ôn tập' }).click();
  await expect(ws.getByLabel('Tiêu đề tài liệu')).toHaveValue('Tiến độ ôn tập');
  await expect(page).toHaveURL(/doc=[0-9a-f-]{36}/);

  // A4: gõ GFM + checklist + bảng + autosave
  const editor = ws.getByLabel('Nội dung tài liệu');
  await fillControlled(editor, '# Ôn tập\n\n- [ ] Đọc chương tư tưởng\n\n| Phần | Điểm |\n|---|---|\n| 1 | 9 |');
  await editor.blur();
  await expect(ws.getByText('Đã lưu')).toBeVisible();

  await page.reload();
  const wsReload = page.getByRole('dialog', { name: 'Tư tưởng Hồ Chí Minh' });
  await expect(wsReload.getByLabel('Nội dung tài liệu')).toContainText('Đọc chương tư tưởng');

  // Chuyển sang Xem trước & bấm checklist
  await wsReload.getByRole('button', { name: 'Xem trước' }).click();
  await expect(wsReload.locator('table')).toBeVisible();
  const cb = wsReload.getByRole('checkbox', { name: 'Checklist item' });
  await cb.check();
  await expect(wsReload.getByText('Đã lưu')).toBeVisible();
  await wsReload.getByRole('button', { name: 'Soạn thảo' }).click();
  await expect(wsReload.getByLabel('Nội dung tài liệu')).toContainText('- [x] Đọc chương tư tưởng');

  // A8: tạo task rồi chèn liên kết trong tài liệu
  if (isMobile) await wsReload.getByRole('button', { name: 'Vận hành' }).click();
  await wsReload.getByRole('tab', { name: 'Tasks' }).click();
  await wsReload.getByPlaceholder('Thêm task…').fill('Đọc giáo trình');
  await page.keyboard.press('Enter');
  await expect(wsReload.getByRole('listitem').filter({ hasText: 'Đọc giáo trình' })).toBeVisible();
  if (isMobile) await wsReload.getByRole('button', { name: /Tài liệu/ }).click();

  await wsReload.getByRole('button', { name: 'Chèn liên kết' }).click();
  await wsReload.getByRole('button', { name: /Đọc giáo trình Task · Todo/ }).click();
  await wsReload.getByLabel('Nội dung tài liệu').blur();
  await expect(wsReload.getByText('Đã lưu')).toBeVisible();
  await wsReload.getByRole('button', { name: 'Xem trước' }).click();
  const chip = wsReload.getByRole('button', { name: /Đọc giáo trình.*Todo/ });
  await expect(chip).toContainText('Todo');
  await chip.click();
  await expect(wsReload.getByRole('tab', { name: 'Tasks' })).toHaveAttribute('aria-selected', 'true');

  // A6: mở lịch sử và xem bản đầu
  if (isMobile) await wsReload.getByRole('button', { name: /Tài liệu/ }).click();
  await wsReload.getByRole('button', { name: 'Lịch sử' }).click();
  const hist = page.getByRole('dialog', { name: 'Lịch sử phiên bản' });
  await expect(hist).toBeVisible();
  await expect(hist.getByRole('button', { name: 'Khôi phục bản này' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(hist).toHaveCount(0);

  // Kiểm tra responsive: không tràn ngang trong workspace
  const wsOverflow = await wsReload.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(wsOverflow).toBeLessThanOrEqual(0);

  // A7: đóng workspace và tìm kiếm không dấu ("tu tuong" -> "tư tưởng")
  await wsReload.getByRole('button', { name: 'Đóng' }).click();
  await expect(wsReload).toHaveCount(0);
  await page.getByRole('button', { name: 'Tìm tài liệu' }).click();
  const searchDialog = page.getByRole('dialog', { name: 'Tìm kiếm tài liệu' });
  await searchDialog.getByLabel('Từ khóa tìm tài liệu').fill('tu tuong');
  const hit = searchDialog.getByRole('button', { name: /Tiến độ ôn tập/ });
  await expect(hit).toBeVisible();
  await hit.click();
  await expect(page.getByRole('dialog', { name: 'Tư tưởng Hồ Chí Minh' })).toBeVisible();
  await expect(page).toHaveURL(/doc=[0-9a-f-]{36}/);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('xung đột revision giữa hai tab không ghi đè mất nội dung', async ({ page, context }) => {
  await page.goto('/context');
  await page.getByRole('button', { name: 'Thêm' }).click();
  await page.getByLabel('Tên', { exact: true }).fill('Xung đột');
  await page.getByRole('button', { name: 'Tạo' }).click();
  await page.getByRole('main').getByRole('listitem').filter({ hasText: 'Xung đột' }).click();
  const ws = page.getByRole('dialog', { name: 'Xung đột' });
  await ws.getByRole('button', { name: '+ Tạo tài liệu trống' }).click();
  await expect(page).toHaveURL(/doc=[0-9a-f-]{36}/);
  await fillControlled(ws.getByLabel('Nội dung tài liệu'), 'Bản gốc');
  await ws.getByLabel('Nội dung tài liệu').blur();
  await expect(ws.getByText('Đã lưu')).toBeVisible();

  const url = page.url();
  const other = await context.newPage();
  await other.goto(url);
  const wsOther = other.getByRole('dialog', { name: 'Xung đột' });
  await expect(wsOther.getByLabel('Nội dung tài liệu')).toHaveValue('Bản gốc');
  await fillControlled(wsOther.getByLabel('Nội dung tài liệu'), 'Bản sửa ở tab 2');
  await wsOther.getByLabel('Nội dung tài liệu').blur();
  await expect(wsOther.getByText('Đã lưu')).toBeVisible();
  await other.close();

  await fillControlled(ws.getByLabel('Nội dung tài liệu'), 'Bản đang gõ ở tab 1');
  await ws.getByLabel('Nội dung tài liệu').blur();
  await expect(ws.getByRole('alert')).toContainText('Tài liệu đã thay đổi ở nơi khác.');
  await ws.getByRole('button', { name: 'Xem khác biệt' }).click();
  await expect(ws.getByRole('alert')).toContainText('Bản sửa ở tab 2');
  await ws.getByRole('button', { name: 'Tải bản mới' }).click();
  await expect(ws.getByLabel('Nội dung tài liệu')).toHaveValue('Bản sửa ở tab 2');
  await expect(ws.getByText('Bản bạn đang gõ trước khi tải bản mới')).toBeVisible();
});

test('ẩn trang và pagehide đều lưu tài liệu đang chờ trước khi hết thời gian chờ', async ({ page }) => {
  await page.goto('/context');
  await page.getByRole('button', { name: 'Thêm' }).click();
  await page.getByLabel('Tên', { exact: true }).fill('Flush Doc');
  await page.getByRole('button', { name: 'Tạo' }).click();
  await page.getByRole('main').getByRole('listitem').filter({ hasText: 'Flush Doc' }).click();
  const ws = page.getByRole('dialog', { name: 'Flush Doc' });
  await ws.getByRole('button', { name: '+ Tạo tài liệu trống' }).click();
  const editor = ws.getByLabel('Nội dung tài liệu');
  await expect(editor).toBeVisible();

  await expect(editor).toBeEnabled();
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 1000);
  await editor.fill('Lưu khi ẩn app');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(ws.getByText('Đã lưu')).toBeVisible();
  await page.clock.resume();
  await page.reload();
  await expect(ws.getByLabel('Nội dung tài liệu')).toHaveValue('Lưu khi ẩn app');
  await expect(ws.getByLabel('Nội dung tài liệu')).toBeEnabled();

  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 1000);
  await editor.fill('Lưu khi rời trang');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(ws.getByText('Đã lưu')).toBeVisible();
  await page.clock.resume();
  await page.reload();
  await expect(ws.getByLabel('Nội dung tài liệu')).toHaveValue('Lưu khi rời trang');
});
