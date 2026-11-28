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

test('điện thoại: menu có nhiều cuộc chat vẫn thấy Settings ở cuối, danh sách chat tự cuộn', async ({ page, request, isMobile }) => {
  test.skip(!isMobile, 'Chỉ kiểm tra trên điện thoại');
  await resetDb(request, { seed: true, conversations: 40 });
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Mở menu' }).click();
  const menu = page.getByRole('dialog');
  await expect(menu.getByText('Cuộc chat 1', { exact: true })).toBeVisible();
  // Without scrolling anything: the footer is on screen.
  await expect(menu.getByRole('button', { name: 'Settings' })).toBeInViewport({ ratio: 1 });
  const list = menu.getByTestId('recent-chats');
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
});
