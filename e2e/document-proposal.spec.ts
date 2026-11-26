import { expect, test, type Page } from '@playwright/test';
import { resetDb } from './helpers';

async function ask(page: Page) {
  await page.goto('/chat');
  await page.getByPlaceholder('Nhắn gì đó…').fill('Cập nhật tài liệu Tiến độ ôn tập của Algebra');
  await page.getByRole('button', { name: 'Gửi' }).click();
  const card = page.getByTestId('proposal-card');
  await expect(card).toContainText('Đã đọc chương mới.');
  return card;
}

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await page.goto('/context');
  await page.getByRole('button', { name: 'Thêm' }).click();
  await page.getByLabel('Tên', { exact: true }).fill('Algebra');
  await page.getByRole('button', { name: 'Tạo' }).click();
  await page.getByRole('main').getByRole('listitem').filter({ hasText: 'Algebra' }).click();
  const ws = page.getByRole('dialog', { name: 'Algebra' });
  await ws.getByRole('button', { name: 'Tiến độ ôn tập' }).click();
  await expect(page).toHaveURL(/doc=[0-9a-f-]{36}/);
  const editor = ws.getByLabel('Nội dung tài liệu');
  await expect(editor).toBeVisible();
  await expect(async () => {
    await editor.fill('# Tiến độ\n\nChưa đọc.\n\n# Ngoài phạm vi\n\nGiữ nguyên.');
    await expect(editor).toHaveValue(/Chưa đọc/);
  }).toPass();
  await editor.blur();
  await expect(ws.getByText('Đã lưu')).toBeVisible();
  await page.reload();
  await expect(editor).toHaveValue(/Chưa đọc\./);
});

test('duyệt sửa Markdown, xem một phiên bản AI rồi hoàn tác', async ({ page }) => {
  const card = await ask(page);
  expect(await card.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0);
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(card).toContainText('Đã áp dụng 1/1');
  await card.getByRole('link', { name: /Tiến độ ôn tập/ }).click();
  const workspace = page.getByRole('dialog', { name: 'Algebra' });
  await expect(workspace.getByLabel('Nội dung tài liệu')).toHaveValue(/Đã đọc chương mới\.[\s\S]*Giữ nguyên\./);
  await workspace.getByRole('button', { name: 'Lịch sử' }).click();
  await expect(page.getByRole('dialog', { name: 'Lịch sử phiên bản' }).getByText('AI (đã duyệt)')).toHaveCount(1);
  await page.goBack();
  await page.getByTestId('proposal-card').getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(page.getByTestId('proposal-card')).toContainText('Đã hoàn tác thay đổi.');
});

test('từ chối đề xuất giữ đúng nội dung ban đầu', async ({ page }) => {
  const card = await ask(page);
  await card.getByRole('button', { name: 'Reject' }).click();
  await expect(card).toContainText('Đã từ chối');
  await card.getByRole('link', { name: /Tiến độ ôn tập/ }).click();
  await expect(page.getByRole('dialog', { name: 'Algebra' }).getByLabel('Nội dung tài liệu')).toHaveValue(/Chưa đọc/);
});
