import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

test.beforeEach(async ({ request }) => { await resetDb(request); });

test('trang gốc chuyển về /chat', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/chat$/);
});

test('chỉ có hai đích điều hướng chính', async ({ page, isMobile }) => {
  await page.goto('/chat');
  if (isMobile) await page.getByRole('button', { name: 'Mở menu' }).click();
  const links = page.getByRole('navigation', { name: 'Chính' }).getByRole('link');
  await expect(links).toHaveText(['Chat', 'Context']);
});

test('Context có đúng hai tab và tab nằm trong URL', async ({ page }) => {
  await page.goto('/context');
  await expect(page.getByRole('tab')).toHaveText(['Academic', 'Projects']);
  await page.getByRole('tab', { name: 'Projects' }).click();
  await expect(page).toHaveURL(/tab=projects/);
});

test('manifest PWA', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ display: 'standalone', start_url: '/chat', short_name: 'Personal AI' });
});

test('không tràn ngang và viewport dùng viewport-fit=cover', async ({ page }) => {
  for (const path of ['/chat', '/context']) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
});
