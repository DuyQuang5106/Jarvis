import { expect, test, type Page } from '@playwright/test';
import { resetDb } from './helpers';

test.beforeEach(async ({ request }) => { await resetDb(request); });

const row = (page: Page) => page.getByRole('main').getByRole('listitem').filter({ hasText: 'Algebra' });
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('môn chưa có topic: lời mời → Tạo từ tài liệu → duyệt đề xuất → thanh tiến độ và mốc dự kiến trong Context', async ({ page, isMobile }) => {
  await page.goto('/context');
  await page.getByRole('button', { name: 'Thêm' }).click();
  await page.getByLabel('Tên', { exact: true }).fill('Algebra');
  await page.getByRole('button', { name: 'Tạo' }).click();

  // The list: a hint instead of a bar while there is nothing to count.
  await expect(row(page).getByTestId('progress-empty')).toHaveText('Chưa có topic');
  await expect(row(page).getByTestId('progress-bar')).toHaveCount(0);
  await expect(row(page)).not.toContainText('%');
  await expect(row(page)).toContainText('Cập nhật hôm nay');

  // The area: no documents yet, so nothing for the AI to read and no button.
  await row(page).click();
  const ws = page.getByRole('dialog', { name: 'Algebra' });
  await expect(ws.getByTestId('from-documents-invite')).toContainText('Chưa có topic nào. Thêm tài liệu');
  await expect(ws.getByRole('button', { name: 'Tạo từ tài liệu' })).toHaveCount(0);

  await ws.getByRole('button', { name: 'Tiến độ ôn tập' }).click();
  await expect(page).toHaveURL(/doc=[0-9a-f-]{36}/);
  await expect(ws.getByTestId('from-documents-invite')).toHaveText(
    'Chưa có topic nào. Để AI đọc tài liệu của môn này và đề xuất topic, mốc đánh giá và việc tiếp theo.',
  );
  await expect(ws.getByRole('progressbar')).toHaveCount(0);
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  // The button opens a new conversation scoped to the area and sends the preset command.
  await ws.getByRole('button', { name: 'Tạo từ tài liệu' }).click();
  await expect(page).toHaveURL(/\/chat\?c=[0-9a-f-]{36}/);
  await expect(page.locator('[data-role="user"]')).toHaveText([
    'Đọc tài liệu của Algebra và tạo đề xuất: các topic kèm trạng thái, mốc đánh giá, và việc tiếp theo.',
  ]);
  await expect(page.getByRole('button', { name: 'Algebra' })).toBeVisible(); // the scope selector
  const card = page.getByTestId('proposal-card');
  for (const label of ['Tạo topic “Chương 1”', 'Tạo topic “Chương 2”', 'Tạo topic “Chương 3”', 'Tạo assessment “Giữa kỳ (dự kiến)”', 'Tạo task “Làm bài tập Chương 1”'])
    await expect(card).toContainText(label);
  await expect(card.getByRole('checkbox')).toHaveCount(5);

  // Nothing is written before approval.
  const other = await page.context().newPage();
  await other.goto('/context');
  await expect(row(other).getByTestId('progress-empty')).toHaveText('Chưa có topic');
  await other.close();

  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(card).toContainText('Đã áp dụng 5/5 thay đổi');

  // Back in Context: a bar with its count, the tentative exam and its countdown.
  await page.goto('/context');
  await expect(row(page).getByTestId('progress-bar')).toBeVisible();
  // Studied 1 of 3, mastered none: two numbers, never one blended percentage.
  await expect(row(page).getByTestId('progress')).toContainText('Học 1/3 · Thành thạo 0/3');
  await expect(row(page).getByTestId('progress-empty')).toHaveCount(0);
  await expect(row(page).getByTestId('countdown')).toHaveText('Thi sau 14 ngày · Giữa kỳ (dự kiến)');
  await expect(row(page)).not.toContainText('%');
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  // The area's own view: the same summary as a progressbar, and the action stays available.
  await row(page).click();
  const bar = ws.getByRole('progressbar', { name: 'Tiến độ' });
  await expect(bar).toHaveAttribute('aria-valuetext', '0/3 topic vững');
  await expect(bar).toHaveAttribute('aria-valuemax', '3');
  await expect(ws.getByTestId('area-progress')).toContainText('Thi sau 14 ngày · Giữa kỳ (dự kiến)');
  await expect(ws.getByTestId('from-documents-invite')).toHaveCount(0);
  await expect(ws.getByRole('button', { name: 'Cập nhật từ tài liệu' })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  // A topic marked Practiced counts as "vững".
  if (isMobile) await ws.getByRole('button', { name: 'Vận hành' }).click();
  await ws.getByRole('tab', { name: 'Topics' }).click();
  await ws.getByRole('listitem').filter({ hasText: 'Chương 2' }).getByLabel('Trạng thái').selectOption('practiced');
  await expect(bar).toHaveAttribute('aria-valuetext', '1/3 topic vững');
  await ws.getByRole('tab', { name: 'Assessments' }).click();
  await expect(ws.getByRole('listitem').filter({ hasText: 'Giữa kỳ (dự kiến)' })).toBeVisible();
});
