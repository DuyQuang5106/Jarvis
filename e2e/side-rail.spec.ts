import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetDb(request, { seed: true, documents: [{ area: 'Database', title: 'Ghi chú SQL', body: '# SQL\nJOIN.' }] });
});

test('màn hẹp (nửa Context): hai cột bên thu thành nút; rê chuột để xem, bấm để ghim, bấm lần nữa để thu', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Chỉ có từ md tới xl');
  await page.setViewportSize({ width: 960, height: 800 });
  await page.goto('/context');
  await page.getByRole('main').getByRole('listitem').filter({ hasText: 'Database' }).first().click();
  const ws = page.getByRole('dialog', { name: 'Database' });
  await expect(ws.getByLabel('Tiêu đề tài liệu')).toBeVisible();

  const files = ws.getByTestId('rail-explorer');
  const filesPanel = ws.getByTestId('rail-panel-explorer');
  await expect(filesPanel).toHaveCount(0);
  await expect(ws.getByPlaceholder('Lọc tệp & thư mục…')).toBeHidden();

  // Pointing shows it over the editor; leaving folds it.
  await files.hover();
  await expect(filesPanel).toBeVisible();
  await expect(filesPanel.getByText('Ghi chú SQL')).toBeVisible();
  await ws.getByLabel('Nội dung tài liệu').hover({ position: { x: 400, y: 200 } });
  await expect(filesPanel).toHaveCount(0);

  // Clicking pins it: it stays after the pointer leaves, until clicked again.
  const ops = ws.getByTestId('rail-ops');
  await ops.click();
  await expect(ops).toHaveAttribute('aria-pressed', 'true');
  await ws.getByLabel('Tiêu đề tài liệu').hover();
  await expect(ws.getByTestId('rail-panel-ops')).toBeVisible();
  await expect(ws.getByRole('tab', { name: 'Vận hành' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Database' }).getByTestId('rail-panel-ops')).toBeVisible();
  await page.getByRole('dialog', { name: 'Database' }).getByTestId('rail-ops').click();
  await expect(page.getByRole('dialog', { name: 'Database' }).getByTestId('rail-panel-ops')).toHaveCount(0);
});

test('màn rộng: vẫn ba cột, không có nút thu gọn', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Chỉ trên màn rộng');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/context');
  await page.getByRole('main').getByRole('listitem').filter({ hasText: 'Database' }).first().click();
  const ws = page.getByRole('dialog', { name: 'Database' });
  await expect(ws.getByPlaceholder('Lọc tệp & thư mục…')).toBeVisible();
  await expect(ws.getByRole('tab', { name: 'Vận hành' })).toBeVisible();
  await expect(ws.getByTestId('rail-explorer')).toHaveCount(0);
});
