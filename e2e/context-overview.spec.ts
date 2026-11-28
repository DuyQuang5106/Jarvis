import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetDb(request, {
    seed: true,
    records: [
      {
        area: 'Computer Networks',
        topics: [
          { title: 'Ch.1 Delay', status: 'confident' },
          { title: 'Ch.2 Line coding', status: 'practiced' },
          { title: 'Ch.3 Checksum', status: 'familiar' },
          { title: 'Ch.4 Data link', status: 'not_started' },
        ],
        tasks: [
          { title: 'Chương trình luyện bài tập', dueInDays: 6, progressDone: 2, progressTotal: 10 },
          { title: 'Làm 9 câu Checksum', dueInDays: 0 },
        ],
        assessments: [{ title: 'Giữa kỳ', dueInDays: 6 }],
      },
      { area: 'Algebra', tasks: [{ title: 'Bài tập chương 5', dueInDays: -2 }] },
    ],
  });
});

test('tổng quan: cần chú ý, sắp tới hạn, nên làm bây giờ', async ({ page }) => {
  await page.goto('/context');
  const overview = page.getByRole('region', { name: 'Tổng quan' });
  await expect(overview).toContainText('Cần chú ý');
  // Algebra is off track (overdue task), Computer Networks at risk (no pace, 6 days to the exam).
  await expect(overview).toContainText('Algebra · Computer Networks');
  await expect(overview).toContainText('Giữa kỳ (Computer Networks, còn 6 ngày)');
  const focus = page.getByTestId('focus');
  await expect(focus).toContainText('Algebra');
  await expect(focus).toContainText('"Bài tập chương 5" quá hạn 2 ngày.');
  await focus.getByRole('button', { name: 'Mở Algebra' }).click();
  await expect(page.getByRole('dialog', { name: 'Algebra' })).toBeVisible();
});

test('thẻ môn: sức khỏe kèm lý do, thanh hai lớp, xem nhanh topic và task đếm được', async ({ page }) => {
  await page.goto('/context');
  const row = page.getByRole('main').getByRole('listitem').filter({ hasText: 'Computer Networks' }).first();
  await expect(row.getByTestId('health')).toHaveText('Có rủi ro');
  await expect(row.getByTestId('health-reason')).toContainText('Còn 1/4 topic chưa học, 6 ngày tới Giữa kỳ');
  await expect(row.getByTestId('progress')).toContainText('Học 3/4 · Thành thạo 1,5/4');
  // "Cần chú ý" order: off track (Algebra) first, then at risk.
  const names = await page.getByRole('list', { name: 'Danh sách mục' }).locator(':scope > li').allInnerTexts();
  expect(names[0]).toContain('Algebra');
  expect(names[1]).toContain('Computer Networks');

  await row.getByRole('button', { name: 'Xem nhanh Computer Networks' }).click();
  const glance = row.getByTestId('glance');
  await expect(glance).toContainText('Ch.3 Checksum');
  await expect(glance).toContainText('Đã học');
  await expect(glance.getByTestId('task-count')).toHaveText('2/10');
  await expect(glance).toContainText('Làm 9 câu Checksum');
  await row.getByRole('button', { name: 'Thu gọn Computer Networks' }).click();
  await expect(row.getByTestId('glance')).toHaveCount(0);
});
