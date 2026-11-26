import { expect, test, type Page } from '@playwright/test';
import { resetDb } from './helpers';

// The server's clock for this page is set with the E2E-only `x-e2e-now` header (requestNow): Sunday
// 16/03/2025 19:00 in Asia/Ho_Chi_Minh, so the week 10/03–16/03 is ready to review. Rows the seed and these
// tests write at the real time are far outside that week.
const SUNDAY_EVENING = '2025-03-16T12:00:00.000Z';
const STATE = [
  '# Trạng thái',
  '',
  '## Tiến độ',
  '',
  '- 2025-03-11: học xong chương 4',
  '- 2025-03-13: học chương 5',
  '',
  '## Khác',
  '',
  'Giữ nguyên.',
  '',
].join('\n');

const reviewCard = (page: Page) => page.getByTestId('weekly-review-card');

async function openChat(page: Page, now = SUNDAY_EVENING) {
  await page.setExtraHTTPHeaders({ 'x-e2e-now': now });
  await page.goto('/chat');
}

test('tổng kết tuần: thẻ tự sinh → mở → duyệt replace_section → tài liệu đổi, khôi phục được bản cũ', async ({ page, request }) => {
  await resetDb(request, {
    seed: true,
    weeklyReview: true,
    activity: [{ text: 'Ôn chương 5 Algebra', at: '2025-03-12T02:00:00.000Z' }],
    documents: [{ area: 'Algebra', title: '04_STATE.md', body: STATE }],
  });
  const posts: string[] = [];
  page.on('request', (r) => { if (r.url().endsWith('/api/weekly-review') && r.method() === 'POST') posts.push(r.postData() ?? ''); });
  await openChat(page);

  const card = reviewCard(page);
  await expect(card).toContainText('Tổng kết tuần 10/03–16/03');
  await expect(card.getByTestId('weekly-review-highlight')).toHaveText(['MOCK_WEEKLY: tuần có hoạt động.', 'MOCK_WEEKLY: ghi gọn 04_STATE.md › Tiến độ.']);
  await expect(card).toHaveAttribute('aria-busy', 'false');
  expect(posts).toEqual([JSON.stringify({ week: 'due' })]);
  // Above the orientation card; the composer stays on screen.
  const brief = page.getByTestId('daily-brief');
  await expect(brief).toBeVisible();
  expect((await card.boundingBox())!.y).toBeLessThan((await brief.boundingBox())!.y);
  await expect(page.getByPlaceholder('Nhắn gì đó…')).toBeInViewport();

  // Reload: the stored review comes with the page, nothing is generated again.
  await page.reload();
  await expect(card.getByTestId('weekly-review-highlight')).toHaveCount(2);
  await page.waitForLoadState('networkidle');
  expect(posts).toHaveLength(1);

  await card.getByRole('link', { name: 'Mở tổng kết và duyệt' }).click();
  await expect(page).toHaveURL(/\/chat\?c=[0-9a-f-]{36}/);
  await expect(page.locator('[data-role="user"]')).toContainText(['Tổng kết tuần 10/03–16/03:']);
  const proposal = page.getByTestId('proposal-card');
  await expect(proposal).toContainText('MOCK_WEEKLY: gộp 2 dòng tiến độ của tuần.');
  await expect(proposal).toContainText('học chương 5'); // the diff shows the lines being replaced
  await proposal.getByRole('button', { name: 'Approve' }).click();
  await expect(proposal).toContainText('Đã áp dụng 1/1');

  await proposal.getByRole('link', { name: /04_STATE\.md/ }).click();
  const workspace = page.getByRole('dialog', { name: 'Algebra' });
  const editor = workspace.getByLabel('Nội dung tài liệu');
  await expect(editor).toHaveValue(/MOCK_WEEKLY: gộp 2 dòng[\s\S]*Giữ nguyên\./);
  await expect(editor).not.toHaveValue(/học chương 5/);
  await workspace.getByRole('button', { name: 'Lịch sử' }).click();
  const history = page.getByRole('dialog', { name: 'Lịch sử phiên bản' });
  await history.getByRole('button', { name: /^v1/ }).click();
  await history.getByRole('button', { name: 'Khôi phục bản này' }).click();
  await expect(history).toHaveCount(0);
  await expect(editor).toHaveValue(/- 2025-03-13: học chương 5/);

  // Approved: no card on a new conversation any more.
  await openChat(page);
  await expect(page.getByTestId('suggested-prompts')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(reviewCard(page)).toHaveCount(0);
});

test('"Tổng kết tuần này" dùng được bất kỳ ngày nào; tuần không có hoạt động thì không tự mời', async ({ page, request }) => {
  await resetDb(request, { seed: true, weeklyReview: true });
  await openChat(page, '2025-03-12T05:00:00.000Z'); // Wednesday
  await expect(page.getByTestId('suggested-prompts')).toBeVisible();
  await expect(page.getByTestId('daily-brief-task')).toHaveCount(3); // hydrated
  await expect(reviewCard(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Tổng kết tuần này' }).click();
  const card = reviewCard(page);
  await expect(card).toContainText('Tổng kết tuần 10/03–16/03');
  // No state document to compress: the review opens without anything to approve.
  await card.getByRole('link', { name: 'Mở tổng kết' }).click();
  await expect(page).toHaveURL(/\/chat\?c=[0-9a-f-]{36}/);
  await expect(page.locator('[data-role="assistant"]').first()).toContainText('Trọng tâm tuần sau');
  await expect(page.getByTestId('proposal-card')).toHaveCount(0);
});
