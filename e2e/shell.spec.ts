import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

test.beforeEach(async ({ request }) => { await resetDb(request); });

test('trang gốc chuyển về /chat', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/chat$/);
});

test('điều hướng chính: thanh bên trên màn rộng, thanh tab trên điện thoại', async ({ page, isMobile }) => {
  await page.goto('/context');
  if (isMobile) {
    const tabs = page.getByRole('navigation', { name: 'Tab' });
    await expect(tabs.getByRole('link')).toHaveText(['Hôm nay', 'Chat', 'Môn & dự án']);
    await expect(tabs.getByRole('button', { name: 'Cài đặt' })).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'Môn & dự án' })).toHaveAttribute('aria-current', 'page');
    return;
  }
  const links = page.getByRole('navigation', { name: 'Chính' }).getByRole('link');
  await expect(links).toHaveText(['Chat', 'Context']);
  await expect(page.getByRole('navigation', { name: 'Tab' })).toBeHidden();
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

test('điện thoại: tab Chat liệt kê các ô; trong một ô có nút quay lại, không có thanh tab', async ({ page, request, isMobile }) => {
  test.skip(!isMobile, 'Chỉ kiểm tra trên điện thoại');
  await resetDb(request, { seed: true, conversations: 40 });
  await page.goto('/today');
  const tabs = page.getByRole('navigation', { name: 'Tab' });
  await tabs.getByRole('link', { name: 'Chat' }).click();
  await expect(page).toHaveURL(/\/threads$/);
  const list = page.getByTestId('thread-list');
  await expect(list.getByRole('link').first()).toContainText('Chung');
  await expect(page.getByTestId('recent-chats')).toContainText('Cuộc chat 1');
  // However long the page, the tab bar stays on screen.
  await expect(tabs).toBeInViewport({ ratio: 1 });
  await list.getByRole('link', { name: /Database/ }).click();
  await expect(page).toHaveURL(/\/chat\?area=/);
  await expect(page.getByRole('navigation', { name: 'Tab' })).toHaveCount(0);
  await expect(page.getByTestId('thread-header')).toContainText('Database');
  await page.getByRole('link', { name: 'Về danh sách ô chat' }).click();
  await expect(page).toHaveURL(/\/threads$/);
});

test('điện thoại: tab Hôm nay có tổng quan và thẻ định hướng', async ({ page, request, isMobile }) => {
  test.skip(!isMobile, 'Chỉ kiểm tra trên điện thoại');
  await resetDb(request, { seed: true });
  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'Hôm nay' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Tổng quan' })).toBeVisible();
  await expect(page.getByTestId('daily-brief')).toBeVisible();
});
