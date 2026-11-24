import { expect, test, type Page } from '@playwright/test';
import { resetDb } from './helpers';

test.beforeEach(async ({ request, page, isMobile }) => {
  await resetDb(request, { seed: true });
  await page.goto('/context');
  await page.getByRole('listitem').filter({ hasText: 'Mobile Programming' }).click();
  const drawer = page.getByRole('dialog', { name: 'Mobile Programming' });
  if (isMobile) await drawer.getByRole('button', { name: 'Vận hành' }).click();
  await drawer.getByRole('tab', { name: 'Topics' }).click();
  await drawer.getByPlaceholder('Thêm topic…').fill('Chương 1');
  await page.keyboard.press('Enter');
  await expect(drawer.getByRole('listitem').filter({ hasText: 'Chương 1' })).toBeVisible();
});

async function ask(page: Page) {
  await page.goto('/chat');
  await page.getByPlaceholder('Nhắn gì đó…').fill('Tôi đã hoàn thành chương 1 Mobile Programming');
  await page.getByRole('button', { name: 'Gửi' }).click();
  const card = page.getByTestId('proposal-card');
  await expect(card).toContainText('Sửa topic “Chương 1”');
  return card;
}

async function topicStatus(page: Page, isMobile: boolean) {
  await page.goto('/context');
  await page.getByRole('main').getByRole('listitem').filter({ hasText: 'Mobile Programming' }).click();
  const drawer = page.getByRole('dialog', { name: 'Mobile Programming' });
  if (isMobile) await drawer.getByRole('button', { name: 'Vận hành' }).click();
  await drawer.getByRole('tab', { name: 'Topics' }).click();
  return drawer.getByRole('listitem').filter({ hasText: 'Chương 1' }).getByLabel('Trạng thái');
}

test('đề xuất hiện ra nhưng chưa ghi gì (criterion 7)', async ({ page, isMobile }) => {
  const card = await ask(page);
  await expect(card).toContainText('Trạng thái: Not started → Confident');
  await expect(card).toContainText('Thêm log tiến độ');
  await expect(card.getByRole('button')).toHaveText(['Approve', 'Edit', 'Reject']);
  await expect(await topicStatus(page, isMobile)).toHaveValue('not_started');
});

test('duyệt: dữ liệu đổi, log ghi nguồn AI, thẻ còn sau khi tải lại (criterion 8, 12)', async ({ page, isMobile }) => {
  const card = await ask(page);
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(card).toContainText('Đã áp dụng 2/2 thay đổi');
  await page.reload();
  await expect(page.getByTestId('proposal-card')).toContainText('Đã áp dụng 2/2 thay đổi');
  await expect(page.getByTestId('proposal-card').getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(await topicStatus(page, isMobile)).toHaveValue('confident');
  await page.getByRole('dialog').getByRole('tab', { name: 'Activity' }).click();
  await expect(page.getByRole('dialog').getByText('AI (đã duyệt)')).toHaveCount(2);
});

test('từ chối: không đổi gì (criterion 8)', async ({ page, isMobile }) => {
  const card = await ask(page);
  await card.getByRole('button', { name: 'Reject' }).click();
  await expect(card).toContainText('Đã từ chối');
  await expect(await topicStatus(page, isMobile)).toHaveValue('not_started');
});

test('duyệt một phần', async ({ page, isMobile }) => {
  const card = await ask(page);
  await card.getByRole('checkbox', { name: /Thêm log tiến độ/ }).uncheck();
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(card).toContainText('Đã áp dụng 1/2 thay đổi');
  await expect(await topicStatus(page, isMobile)).toHaveValue('confident');
});

test('sửa bằng UI sau khi AI đề xuất rồi duyệt: báo xung đột, không ghi đè (criterion 14)', async ({ page, context, isMobile }) => {
  const card = await ask(page);
  const other = await context.newPage();
  await (await topicStatus(other, isMobile)).selectOption('familiar');
  await expect(
    other.getByRole('dialog', { name: 'Mobile Programming' }).getByRole('listitem').filter({ hasText: 'Chương 1' }),
  ).not.toHaveAttribute('aria-busy', 'true');
  await other.close();
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(card.getByRole('alert')).toContainText('Dữ liệu đã thay đổi sau khi AI đề xuất. Chưa có gì được ghi.');
  await expect(card).toContainText('Đã thay đổi');
  await expect(await topicStatus(page, isMobile)).toHaveValue('familiar');
});

test('thẻ dùng được trên màn hẹp (criterion 16)', async ({ page }) => {
  const card = await ask(page);
  for (const name of ['Approve', 'Edit', 'Reject']) {
    const box = await card.getByRole('button', { name }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('đề xuất không hợp lệ: chỉ có văn bản và dòng báo (criterion 10)', async ({ page }) => {
  await page.goto('/chat');
  await page.getByPlaceholder('Nhắn gì đó…').fill('MOCK_BAD_PROPOSAL');
  await page.getByRole('button', { name: 'Gửi' }).click();
  await expect(page.locator('[data-role="assistant"]').last()).toContainText('đề xuất không hợp lệ nên đã bị bỏ qua');
  await expect(page.getByTestId('proposal-card')).toHaveCount(0);
});
