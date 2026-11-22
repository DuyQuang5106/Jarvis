import { expect, test, type Page } from '@playwright/test';
import { resetDb } from './helpers';

async function openNew(page: Page, tab: 'Academic' | 'Projects', name: string) {
  await page.goto('/context');
  await page.getByRole('tab', { name: tab }).click();
  // Wait for the tab to take effect: `Thêm` creates an item of the tab that is active when it is clicked.
  if (tab === 'Projects') await expect(page).toHaveURL(/tab=projects/);
  await page.getByRole('button', { name: 'Thêm' }).click();
  await page.getByLabel('Tên', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Tạo' }).click();
  await page.getByRole('listitem').filter({ hasText: name }).click();
  return page.getByRole('dialog', { name });
}

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

test('topics: thêm, đổi trạng thái, tổng kết có mẫu số', async ({ page }) => {
  const drawer = await openNew(page, 'Academic', 'Mobile Programming');
  await drawer.getByRole('tab', { name: 'Topics' }).click();
  for (const t of ['Navigation', 'State']) {
    await drawer.getByPlaceholder('Thêm topic…').fill(t);
    await page.keyboard.press('Enter');
    await expect(drawer.getByRole('listitem').filter({ hasText: t })).toBeVisible();
  }
  await drawer.getByRole('listitem').filter({ hasText: 'Navigation' }).getByLabel('Trạng thái').selectOption('practiced');
  await expect(drawer.getByText('1/2 topics từ Practiced trở lên')).toBeVisible();
  await expect(drawer.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listitem').filter({ hasText: 'Mobile Programming' })).not.toContainText('Chưa có topic');
});

test('assessment chỉ cần tên; không có dự báo điểm', async ({ page }) => {
  const drawer = await openNew(page, 'Academic', 'Database');
  await drawer.getByRole('tab', { name: 'Assessments' }).click();
  await drawer.getByRole('button', { name: 'Thêm assessment' }).click();
  // The overview stays mounted (hidden) and has its own `Tên`; role queries skip hidden elements.
  await drawer.getByRole('textbox', { name: 'Tên', exact: true }).fill('Giữa kỳ');
  await drawer.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(drawer.getByRole('listitem').filter({ hasText: 'Giữa kỳ' })).toBeVisible();
  await expect(drawer).not.toContainText(/GPA|dự báo/i);
});

test('blocker: thêm, hiện huy hiệu ở danh sách, gỡ', async ({ page }) => {
  const drawer = await openNew(page, 'Projects', 'Question House');
  await expect(drawer.getByRole('tab')).toHaveText(['Tổng quan', 'Tasks', 'Milestones', 'Blockers', 'Notes', 'Activity']);
  await drawer.getByRole('tab', { name: 'Blockers' }).click();
  await drawer.getByRole('button', { name: 'Thêm blocker' }).click();
  await drawer.getByLabel('Vấn đề').fill('Login Android chưa chạy');
  await drawer.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(drawer.getByRole('listitem').filter({ hasText: 'Login Android chưa chạy' })).toBeVisible();
  await page.keyboard.press('Escape');
  const row = page.getByRole('listitem').filter({ hasText: 'Question House' });
  await expect(row).toContainText('1 blocker');
  await expect(row).toContainText('Unknown'); // trạng thái area không tự đổi
  await row.click();
  await drawer.getByRole('tab', { name: 'Blockers' }).click();
  await drawer.getByRole('button', { name: 'Đã gỡ' }).click();
  await expect(drawer.getByText('Đã gỡ (1)')).toBeVisible();
});

test('milestone: tổng kết có mẫu số', async ({ page }) => {
  const drawer = await openNew(page, 'Projects', 'StewieSAT');
  await drawer.getByRole('tab', { name: 'Milestones' }).click();
  await drawer.getByRole('button', { name: 'Thêm milestone' }).click();
  await drawer.getByLabel('Deliverable').fill('Trang luyện đề');
  await drawer.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(drawer.getByText('0/1 milestones Done')).toBeVisible();
});

test('task dự án chọn được milestone và giữ sau khi tải lại', async ({ page }) => {
  const drawer = await openNew(page, 'Projects', 'Jarvis');
  await drawer.getByRole('tab', { name: 'Milestones' }).click();
  await drawer.getByRole('button', { name: 'Thêm milestone' }).click();
  await drawer.getByLabel('Deliverable').fill('Beta');
  await drawer.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(drawer.getByText('0/1 milestones Done')).toBeVisible();
  await drawer.getByRole('tab', { name: 'Tasks' }).click();
  await drawer.getByPlaceholder('Thêm task…').fill('Viết spec');
  await page.keyboard.press('Enter');
  const item = drawer.getByRole('listitem').filter({ hasText: 'Viết spec' });
  await item.getByLabel('Milestone', { exact: true }).selectOption({ label: 'Beta' });
  await expect(drawer.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.reload();
  const again = page.getByRole('dialog', { name: 'Jarvis' });
  await expect(again.getByRole('listitem').filter({ hasText: 'Viết spec' }).getByLabel('Milestone', { exact: true })).toHaveValue(/.+/);
  await expect(again.getByRole('listitem').filter({ hasText: 'Viết spec' }).getByLabel('Milestone', { exact: true }).locator('option:checked')).toHaveText('Beta');
});

test('project health: bốn dòng dữ kiện, milestone trễ', async ({ page }) => {
  const drawer = await openNew(page, 'Projects', 'Health Co');
  await drawer.getByRole('tab', { name: 'Milestones' }).click();
  await drawer.getByRole('button', { name: 'Thêm milestone' }).click();
  await drawer.getByLabel('Deliverable').fill('Cũ');
  await drawer.getByLabel('Ngày mục tiêu').fill('2020-01-15');
  await drawer.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(drawer.getByText('0/1 milestones Done')).toBeVisible();
  await drawer.getByRole('tab', { name: 'Tổng quan' }).click();
  const health = drawer.getByRole('region', { name: 'Project health' });
  await expect(health).toContainText('Deadline gần nhất: 15/01 · quá');
  await expect(health).toContainText('Milestone trễ: 1');
  await expect(health).toContainText('Blocker đang mở: 0');
  await expect(health).toContainText('Cập nhật cách đây: 0 ngày');
});

test('Enter hai lần nhanh khi thêm topic chỉ tạo một topic', async ({ page }) => {
  const drawer = await openNew(page, 'Academic', 'Mobile Programming');
  await drawer.getByRole('tab', { name: 'Topics' }).click();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route('**/context**', async (route) => {
    if (route.request().method() === 'POST') await gate;
    await route.continue();
  });
  const input = drawer.getByPlaceholder('Thêm topic…');
  await input.fill('Navigation');
  await input.press('Enter');
  await input.press('Enter');
  await expect(drawer.getByText('Đang lưu…')).toBeVisible();
  release();
  await expect(drawer.getByRole('listitem').filter({ hasText: 'Navigation' })).toBeVisible();
  await expect(input).toHaveValue('');
  await page.reload();
  await expect(page.getByRole('dialog').getByRole('listitem')).toHaveCount(1);
});
