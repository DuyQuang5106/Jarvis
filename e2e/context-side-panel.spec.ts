import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

test.beforeEach(async ({ request }) => { await resetDb(request, { seed: true }); });

test('Context bên cạnh chat: bật, dùng được trong khung, nhớ sau khi tải lại', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Chỉ có trên màn hình rộng');
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Context bên cạnh' }).click();
  const frame = page.frameLocator('iframe[title="Context"]');
  // The Context page in the frame: its own list, no app navigation.
  await expect(frame.getByRole('tab', { name: 'Academic' })).toBeVisible();
  await expect(frame.getByRole('listitem').filter({ hasText: 'Mobile Programming' })).toBeVisible();
  await expect(frame.getByRole('navigation', { name: 'Chính' })).toBeHidden();
  await expect(frame.getByRole('button', { name: 'Context bên cạnh' })).toHaveCount(0);
  // Opening a subject works inside the frame; the chat stays usable beside it.
  await frame.getByRole('listitem').filter({ hasText: 'Mobile Programming' }).click();
  await expect(frame.getByRole('dialog', { name: 'Mobile Programming' })).toBeVisible();
  await expect(page.getByPlaceholder('Nhắn gì đó…')).toBeEditable();

  await page.reload();
  await expect(page.locator('iframe[title="Context"]')).toBeVisible();
  await page.getByRole('button', { name: 'Ẩn Context' }).click();
  await expect(page.locator('iframe[title="Context"]')).toHaveCount(0);
});

test('duyệt đề xuất trong chat thì Context bên cạnh tải lại', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Chỉ có trên màn hình rộng');
  // The mock proposes to update the first topic it sees: give Mobile Programming one.
  await page.goto('/context');
  await page.getByRole('listitem').filter({ hasText: 'Mobile Programming' }).click();
  const drawer = page.getByRole('dialog', { name: 'Mobile Programming' });
  await drawer.getByRole('tab', { name: 'Topics' }).click();
  await drawer.getByPlaceholder('Thêm topic…').fill('Chương 1');
  await page.keyboard.press('Enter');
  await expect(drawer.getByRole('listitem').filter({ hasText: 'Chương 1' })).toBeVisible();

  await page.goto('/chat');
  await page.getByRole('button', { name: 'Context bên cạnh' }).click();
  const frame = page.frameLocator('iframe[title="Context"]');
  await expect(frame.getByRole('listitem').filter({ hasText: 'Mobile Programming' })).toBeVisible();
  await frame.locator('body').evaluate(() => { (window as unknown as { marker?: number }).marker = 1; });

  await page.getByPlaceholder('Nhắn gì đó…').fill('Tôi đã hoàn thành chương 1 Mobile Programming');
  await page.getByRole('button', { name: 'Gửi' }).click();
  const card = page.getByTestId('proposal-card');
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(card).toContainText('Đã áp dụng');
  // A reload drops the marker set on the old document.
  await expect.poll(() => frame.locator('body').evaluate(() => (window as unknown as { marker?: number }).marker ?? null)).toBeNull();
});

test('điện thoại: không có Context bên cạnh', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Chỉ kiểm tra trên điện thoại');
  await page.goto('/chat');
  await expect(page.getByRole('button', { name: 'Context bên cạnh' })).toBeHidden();
});

/** A one-finger swipe from (x1, y) to (x2, y), as iOS reports it. */
async function swipe(page: import('@playwright/test').Page, x1: number, x2: number, y = 300) {
  await page.evaluate(({ x1, x2, y }) => {
    // WebKit has no `Touch` constructor: a plain event carrying the same fields is what the listener reads.
    const target = document.elementFromPoint(x1, y) ?? document.body;
    const fire = (type: string, x: number, active: boolean) => {
      const e = new Event(type, { bubbles: true });
      const touch = { identifier: 1, target, clientX: x, clientY: y };
      Object.defineProperty(e, 'touches', { value: active ? [touch] : [] });
      Object.defineProperty(e, 'changedTouches', { value: [touch] });
      target.dispatchEvent(e);
    };
    fire('touchstart', x1, true);
    fire('touchend', x2, false);
  }, { x1, x2, y });
}

test('điện thoại: vuốt trái ở Chat mở Context, vuốt phải ở Context về Chat', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Chỉ có trên điện thoại');
  await page.goto('/chat');
  await expect(page.getByPlaceholder('Nhắn gì đó…')).toBeVisible();
  await swipe(page, 300, 60);
  await expect(page).toHaveURL(/\/context/);
  await expect(page.getByRole('tab', { name: 'Academic' })).toBeVisible();
  // Too short: nothing happens.
  await swipe(page, 100, 150);
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/context/);
  await swipe(page, 60, 300);
  await expect(page).toHaveURL(/\/chat/);
});
