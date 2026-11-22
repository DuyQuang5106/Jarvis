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
  await page.reload();
  const res = await request.get('/api/export');
  expect(res.headers()['content-disposition']).toMatch(/personal-ai-export-\d{4}-\d{2}-\d{2}\.json/);
  const body = await res.json();
  expect(body.schema_version).toBe(1);
  expect(body.tables.settings[0].stale_after_days ?? body.tables.settings[0].staleAfterDays).toBe(10);
});
