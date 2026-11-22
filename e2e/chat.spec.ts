import { expect, test, type Page } from '@playwright/test';
import { resetDb } from './helpers';

test.beforeEach(async ({ request }) => { await resetDb(request, { seed: true }); });

async function send(page: Page, text: string) {
  await page.getByPlaceholder('Nhắn gì đó…').fill(text);
  await page.getByRole('button', { name: 'Gửi' }).click();
}
const lastAssistant = (page: Page) => page.locator('[data-role="assistant"]').last();
// Scoped to <main>: Next's route announcer (`#__next-route-announcer__`) is also a role="alert" on every page.
const chatAlert = (page: Page) => page.getByRole('main').getByRole('alert');

test('cuộc chat mới có đúng năm prompt gợi ý', async ({ page }) => {
  await page.goto('/chat');
  await expect(page.getByTestId('suggested-prompts').getByRole('button')).toHaveText(['Hôm nay nên làm gì?', 'Đánh giá tuần này', 'Môn nào cần chú ý?', 'Dự án nào đang bị giãn?', 'Cập nhật nhanh']);
});

test('hỏi về một môn: trả lời từ DB, có nguồn, cuộc chat vào sidebar (criterion 5)', async ({ page, isMobile }) => {
  await page.goto('/chat');
  await send(page, 'Mobile Programming đang ở tình trạng nào?');
  await expect(lastAssistant(page)).toContainText('Mobile Programming=not_started');
  await expect(lastAssistant(page)).toContainText('detail:Mobile Programming');
  await expect(page).toHaveURL(/\/chat\?c=[0-9a-f-]{36}/);
  const refs = lastAssistant(page).getByTestId('context-refs');
  await expect(refs).toContainText('Dựa trên:');
  await expect(refs).toContainText('Tổng quan 14 mục');
  await refs.getByRole('link', { name: /Mobile Programming/ }).click();
  await expect(page.getByRole('dialog', { name: 'Mobile Programming' })).toBeVisible();
  await page.goBack();
  if (isMobile) await page.getByRole('button', { name: 'Mở menu' }).click();
  await expect(page.getByTestId('recent-chats')).toContainText('Mobile Programming đang ở tình trạng nào?');
});

test('sửa bằng UI rồi mở chat mới vẫn đọc state mới (criterion 6)', async ({ page }) => {
  await page.goto('/context');
  await page.getByRole('listitem').filter({ hasText: 'Mobile Programming' }).click();
  const drawer = page.getByRole('dialog', { name: 'Mobile Programming' });
  await drawer.getByRole('tab', { name: 'Topics' }).click();
  await drawer.getByPlaceholder('Thêm topic…').fill('Navigation');
  await page.keyboard.press('Enter');
  // Wait for the status save: a full page load right after the change can abort the server action's request.
  const saved = page.waitForResponse((r) => r.request().method() === 'POST' && !!r.request().headers()['next-action']);
  await drawer.getByRole('listitem').filter({ hasText: 'Navigation' }).getByLabel('Trạng thái').selectOption('practiced');
  await saved;
  await page.goto('/chat');
  await send(page, 'Mobile Programming sao rồi?');
  await expect(lastAssistant(page)).toContainText('Navigation=practiced');
});

test('Specific item ép mở rộng đúng mục', async ({ page }) => {
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Auto' }).click();
  await page.getByRole('menuitem', { name: 'Specific item' }).click();
  await page.getByRole('option', { name: 'Database' }).click();
  await send(page, 'tình hình thế nào');
  await expect(lastAssistant(page)).toContainText('detail:Database');
});

test('provider lỗi: báo rõ, không mất tin nhắn, app vẫn dùng được (criterion 10)', async ({ page }) => {
  await page.goto('/chat');
  await send(page, 'MOCK_ERROR');
  await expect(chatAlert(page)).toContainText('Không gọi được AI. Dữ liệu của bạn không bị ảnh hưởng, có thể thử lại.');
  await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible();
  await expect(page.locator('[data-role="user"]')).toHaveCount(1);
  await expect(page.locator('[data-role="assistant"]')).toHaveCount(0);
  await page.goto('/context');
  await expect(page.getByRole('listitem').first()).toBeVisible();
});

test('tải lại giữ nguyên hội thoại; đổi tên và xóa cuộc chat', async ({ page, isMobile }) => {
  await page.goto('/chat');
  await send(page, 'xin chào');
  await expect(lastAssistant(page)).toContainText('MOCK_STATE');
  await page.reload();
  await expect(page.locator('[data-role="user"]')).toHaveText(['xin chào']);
  await expect(page.locator('[data-role="assistant"]')).toHaveCount(1);
  if (isMobile) await page.getByRole('button', { name: 'Mở menu' }).click();
  const item = page.getByTestId('recent-chats').getByRole('link', { name: 'xin chào' });
  await item.hover();
  await page.getByRole('button', { name: 'Tùy chọn cuộc chat' }).first().click();
  await page.getByRole('menuitem', { name: 'Xóa' }).click();
  await page.getByRole('button', { name: 'Xác nhận xóa' }).click();
  await expect(page.getByTestId('recent-chats')).not.toContainText('xin chào');
});

test('composer nằm trong vùng nhìn thấy và không gây zoom', async ({ page }) => {
  await page.goto('/chat');
  const box = await page.getByPlaceholder('Nhắn gì đó…').boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  const size = await page.getByPlaceholder('Nhắn gì đó…').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
});

// --- Beyond the brief (task rulings) ---

test('lỗi giữa chừng: hiện lỗi, bỏ phần trả lời dở, tải lại không có tin assistant', async ({ page }) => {
  await page.goto('/chat');
  await send(page, 'MOCK_PARTIAL_ERROR');
  await expect(chatAlert(page)).toContainText('Không gọi được AI');
  await expect(page.locator('[data-role="assistant"]')).toHaveCount(0);
  await expect(page.getByText('Đang trả lời')).toHaveCount(0);
  await expect(page).toHaveURL(/\/chat\?c=[0-9a-f-]{36}/);
  await page.reload();
  await expect(page.locator('[data-role="user"]')).toHaveText(['MOCK_PARTIAL_ERROR']);
  await expect(page.locator('[data-role="assistant"]')).toHaveCount(0);
  await expect(page.getByText('Đang trả lời')).toHaveCount(0);
});

test('Thử lại sau lỗi gửi regenerate và giữ đúng một tin người dùng', async ({ page }) => {
  await page.goto('/chat');
  await send(page, 'MOCK_ERROR');
  await expect(chatAlert(page)).toBeVisible();
  const req = page.waitForRequest((r) => r.url().endsWith('/api/chat') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Thử lại' }).click();
  const body = (await req).postDataJSON() as { regenerate?: boolean; conversationId?: string; scope: { mode: string } };
  expect(body).toMatchObject({ regenerate: true, scope: { mode: 'auto' } });
  expect(body.conversationId).toMatch(/^[0-9a-f-]{36}$/);
  await expect(chatAlert(page)).toBeVisible(); // the message still contains MOCK_ERROR
  await expect(page.locator('[data-role="user"]')).toHaveCount(1);
});

test('Dừng giữa chừng: giữ đúng một tin người dùng, bỏ phần dở', async ({ page }) => {
  await page.goto('/chat');
  await send(page, 'MOCK_SLOW');
  await expect(page.getByText('MOCK_SLOW_CHUNK_1')).toBeVisible();
  await page.getByRole('button', { name: 'Dừng' }).click();
  await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible();
  await expect(page.locator('[data-role="user"]')).toHaveCount(1);
  await expect(page.locator('[data-role="assistant"]')).toHaveCount(0);
  await expect(page.getByText('MOCK_SLOW_CHUNK_1')).toHaveCount(0);
  // Longer than the whole mock reply (20 × 250ms): an un-cancelled turn would have saved its answer by now.
  await page.waitForTimeout(5500);
  await page.reload();
  await expect(page.locator('[data-role="user"]')).toHaveText(['MOCK_SLOW']);
  await expect(page.locator('[data-role="assistant"]')).toHaveCount(0);
});

test('đổi tên cuộc chat qua menu, còn sau khi tải lại', async ({ page, isMobile }) => {
  await page.goto('/chat');
  await send(page, 'xin chào');
  await expect(lastAssistant(page)).toContainText('MOCK_STATE');
  if (isMobile) await page.getByRole('button', { name: 'Mở menu' }).click();
  const list = page.getByTestId('recent-chats');
  await expect(list.getByRole('link', { name: 'xin chào' })).toBeVisible();
  await list.getByRole('button', { name: 'Tùy chọn cuộc chat' }).first().click();
  await page.getByRole('menuitem', { name: 'Đổi tên' }).click();
  const input = list.getByRole('textbox', { name: 'Tên cuộc chat' });
  await input.fill('Lời chào');
  await input.press('Enter');
  await expect(list.getByRole('link', { name: 'Lời chào' })).toBeVisible();
  await page.reload();
  if (isMobile) await page.getByRole('button', { name: 'Mở menu' }).click();
  await expect(page.getByTestId('recent-chats').getByRole('link', { name: 'Lời chào' })).toBeVisible();
});

test('scope được giữ trong cuộc chat và gửi kèm mỗi lượt', async ({ page }) => {
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Auto' }).click();
  await page.getByRole('menuitem', { name: 'Projects' }).click();
  const first = page.waitForRequest((r) => r.url().endsWith('/api/chat') && r.method() === 'POST');
  await send(page, 'một');
  expect((await first).postDataJSON()).toMatchObject({ scope: { mode: 'projects' } });
  await expect(lastAssistant(page)).toContainText('MOCK_STATE');
  await expect(page.getByRole('button', { name: 'Projects' })).toBeVisible();
  const second = page.waitForRequest((r) => r.url().endsWith('/api/chat') && r.method() === 'POST');
  await send(page, 'hai');
  expect((await second).postDataJSON()).toMatchObject({ scope: { mode: 'projects' } });
  await expect(page.locator('[data-role="user"]')).toHaveText(['một', 'hai']);
});
