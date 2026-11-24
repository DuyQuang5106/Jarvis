import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

test('từ onboarding tới cập nhật qua chat', async ({ page, request, isMobile }) => {
  await resetDb(request, { onboarded: false });
  await page.goto('/chat');
  await page.getByRole('dialog', { name: 'Review & import' }).getByRole('button', { name: 'Nhập mục đã chọn' }).click();
  await expect(page.getByRole('dialog', { name: 'Review & import' })).toBeHidden();

  // C: cập nhật thủ công
  await page.goto('/context');
  await page.getByRole('main').getByRole('listitem').filter({ hasText: 'Computer Networks' }).click();
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  if (isMobile) await drawer.getByRole('button', { name: 'Vận hành' }).click();
  await drawer.getByRole('tab', { name: 'Topics' }).click();
  await drawer.getByPlaceholder('Thêm topic…').fill('VLSM');
  await page.keyboard.press('Enter');
  await expect(drawer.getByRole('listitem').filter({ hasText: 'VLSM' })).toBeVisible();

  // A: hỏi kế hoạch
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Hôm nay nên làm gì?' }).click();
  await expect(page.locator('[data-role="assistant"]').last()).toContainText('Computer Networks=active');

  // B: cập nhật bằng ngôn ngữ tự nhiên
  await page.getByPlaceholder('Nhắn gì đó…').fill('Computer Networks: tôi đã xong phần VLSM, giải được 5 bài');
  await page.getByRole('button', { name: 'Gửi' }).click();
  const card = page.getByTestId('proposal-card');
  await expect(card).toContainText('Sửa topic “VLSM”');
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(card).toContainText('Đã áp dụng 2/2 thay đổi');

  // state mới được đọc ở cuộc chat khác mà không cần kể lại
  await page.goto('/chat');
  await page.getByPlaceholder('Nhắn gì đó…').fill('Computer Networks sao rồi?');
  await page.getByRole('button', { name: 'Gửi' }).click();
  await expect(page.locator('[data-role="assistant"]').last()).toContainText('VLSM=confident');
});
