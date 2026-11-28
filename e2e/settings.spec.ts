import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

test('đổi ngưỡng cũ và tải export', async ({ page, request, isMobile }) => {
  await resetDb(request, { seed: true });
  await page.goto('/context');
  if (isMobile) await page.getByRole('button', { name: 'Mở menu' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByLabel('Coi là cũ sau (ngày)').fill('10');
  await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(dialog.getByText('Đã lưu')).toBeVisible();
  await page.reload();
  const res = await request.get('/api/export');
  expect(res.headers()['content-disposition']).toMatch(/personal-ai-export-\d{4}-\d{2}-\d{2}\.json/);
  const body = await res.json();
  expect(body.schema_version).toBe(3);
  expect(body.tables.settings[0].stale_after_days ?? body.tables.settings[0].staleAfterDays).toBe(10);
});

async function openSettings(page: import('@playwright/test').Page, isMobile: boolean) {
  await page.goto('/context');
  if (isMobile) await page.getByRole('button', { name: 'Mở menu' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  return page.getByRole('dialog', { name: 'Settings' });
}

for (const bad of ['0', '100']) {
  test(`ngưỡng cũ ${bad} bị từ chối và không lưu`, async ({ page, request, isMobile }) => {
    await resetDb(request, { seed: true });
    const dialog = await openSettings(page, isMobile);
    const stale = dialog.getByLabel('Coi là cũ sau (ngày)');
    await expect(stale).toHaveValue('7');
    await stale.fill(bad);
    await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Số ngày cũ');
    await expect(dialog.getByText('Đã lưu')).toHaveCount(0);
    const body = await (await request.get('/api/export')).json();
    expect(body.tables.settings[0].staleAfterDays).toBe(7);
  });
}

test('tải cài đặt lỗi: báo lỗi và Thử lại hoạt động', async ({ page, request, isMobile }) => {
  await resetDb(request, { seed: true });
  await page.goto('/context');
  if (isMobile) await page.getByRole('button', { name: 'Mở menu' }).click();
  let failed = false;
  await page.route('**/context**', async (route) => {
    const req = route.request();
    if (!failed && req.method() === 'POST' && req.headers()['next-action']) {
      failed = true;
      return route.abort();
    }
    return route.continue();
  });
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('Coi là cũ sau (ngày)')).toBeDisabled();
  await dialog.getByRole('button', { name: 'Thử lại' }).click();
  await expect(dialog.getByLabel('Coi là cũ sau (ngày)')).toHaveValue('7');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});

test('mục Thông báo: nói rõ khi máy chủ chưa có khóa, nút gửi thử tắt khi chưa có thiết bị', async ({ page, request, isMobile }) => {
  await resetDb(request, { seed: true });
  const dialog = await openSettings(page, isMobile);
  const section = dialog.getByRole('region', { name: 'Thông báo' });
  await expect(section).toBeVisible();
  // The E2E server runs without VAPID keys.
  await expect(section).toContainText('Máy chủ chưa có khóa thông báo');
  await expect(section.getByRole('button', { name: 'Bật thông báo trên thiết bị này' })).toBeDisabled();
  await expect(section.getByRole('button', { name: 'Gửi thử' })).toBeDisabled();
});

test('service worker được phục vụ, không cache', async ({ request }) => {
  const res = await request.get('/sw.js');
  expect(res.ok()).toBe(true);
  expect(res.headers()['cache-control']).toContain('no-store');
  expect(await res.text()).toContain("addEventListener('push'");
});
