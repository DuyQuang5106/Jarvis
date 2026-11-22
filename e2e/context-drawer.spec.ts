import { expect, test, type Page } from '@playwright/test';
import { resetDb } from './helpers';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await page.goto('/context');
  await page.getByRole('button', { name: 'Thêm' }).click();
  await page.getByLabel('Tên', { exact: true }).fill('Computer Networks');
  await page.getByRole('button', { name: 'Tạo' }).click();
  await page.getByRole('listitem').filter({ hasText: 'Computer Networks' }).click();
});

test('drawer mở theo URL và còn nguyên sau khi tải lại', async ({ page }) => {
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  await expect(drawer).toBeVisible();
  await page.reload();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('tab')).toHaveText(['Tổng quan', 'Tasks', 'Topics', 'Assessments', 'Notes', 'Activity']);
});

test('sửa tổng quan được lưu và hiện ở danh sách', async ({ page }) => {
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  await drawer.getByLabel('Trạng thái').selectOption('active');
  await drawer.getByLabel('Việc tiếp theo').fill('Ôn VLSM');
  await drawer.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(drawer.getByText('Đã lưu')).toBeVisible();
  await page.keyboard.press('Escape');
  const row = page.getByRole('listitem').filter({ hasText: 'Computer Networks' });
  await expect(row).toContainText('Active');
  await expect(row).toContainText('Ôn VLSM');
});

test('thêm task, đổi trạng thái, xóa', async ({ page }) => {
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  await drawer.getByRole('tab', { name: 'Tasks' }).click();
  await expect(page).toHaveURL(/section=tasks/);
  await drawer.getByPlaceholder('Thêm task…').fill('Làm lab subnetting');
  await page.keyboard.press('Enter');
  const item = drawer.getByRole('listitem').filter({ hasText: 'Làm lab subnetting' });
  await item.getByLabel('Trạng thái').selectOption('done');
  await expect(drawer.getByRole('listitem').filter({ hasText: 'Làm lab subnetting' })).not.toHaveAttribute('aria-busy', 'true');
  await page.reload();
  await expect(drawer.getByRole('listitem').filter({ hasText: 'Làm lab subnetting' }).getByLabel('Trạng thái')).toHaveValue('done');
  await drawer.getByRole('listitem').filter({ hasText: 'Làm lab subnetting' }).getByRole('button', { name: 'Xóa' }).click();
  await page.getByRole('button', { name: 'Xác nhận xóa' }).click();
  await expect(drawer.getByRole('listitem')).toHaveCount(0);
});

test('ô nhập trong drawer không nhỏ hơn 16px', async ({ page }) => {
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  const sizeOf = () =>
    drawer.locator('input, textarea, select').evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
  const overview = await sizeOf();
  expect(overview.length).toBeGreaterThan(5);
  expect(Math.min(...overview)).toBeGreaterThanOrEqual(16);

  await drawer.getByRole('tab', { name: 'Tasks' }).click();
  await drawer.getByPlaceholder('Thêm task…').fill('Task cỡ chữ');
  await page.keyboard.press('Enter');
  await expect(drawer.getByRole('listitem')).toHaveCount(1);
  const tasks = await sizeOf();
  expect(tasks.length).toBeGreaterThan(overview.length);
  expect(Math.min(...tasks)).toBeGreaterThanOrEqual(16);
});

const item = (page: Page, title: string) =>
  page.getByRole('dialog', { name: 'Computer Networks' }).getByRole('listitem').filter({ hasText: title });
const settled = (page: Page, title: string) => expect(item(page, title)).not.toHaveAttribute('aria-busy', 'true');

async function addTask(page: Page, title: string) {
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  await drawer.getByRole('tab', { name: 'Tasks' }).click();
  await drawer.getByPlaceholder('Thêm task…').fill(title);
  await page.keyboard.press('Enter');
  await expect(item(page, title)).toBeVisible();
}

test('sửa tiêu đề tại chỗ: Escape hủy mà không đóng drawer, Enter lưu', async ({ page }) => {
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  await addTask(page, 'Việc cũ');
  await item(page, 'Việc cũ').getByRole('button', { name: 'Việc cũ' }).click();
  await drawer.getByLabel('Tiêu đề task').fill('Việc bị hủy');
  await page.keyboard.press('Escape');
  await expect(drawer).toBeVisible();
  await expect(item(page, 'Việc cũ')).toBeVisible();
  await settled(page, 'Việc cũ');
  await page.reload();
  await expect(item(page, 'Việc cũ')).toBeVisible();
  await expect(drawer.getByText('Việc bị hủy')).toHaveCount(0);

  await item(page, 'Việc cũ').getByRole('button', { name: 'Việc cũ' }).click();
  await drawer.getByLabel('Tiêu đề task').fill('Việc mới');
  await page.keyboard.press('Enter');
  await expect(item(page, 'Việc mới')).toBeVisible();
  await settled(page, 'Việc mới');
  await page.reload();
  await expect(item(page, 'Việc mới')).toBeVisible();
});

test('Hạn, Loại deadline và Ước lượng được lưu', async ({ page }) => {
  await addTask(page, 'Task chi tiết');
  const row = item(page, 'Task chi tiết');
  await row.getByLabel('Hạn').fill('2026-12-01');
  await settled(page, 'Task chi tiết');
  await row.getByLabel('Loại deadline').selectOption('hard');
  await settled(page, 'Task chi tiết');
  await row.getByLabel('Ước lượng (phút)').fill('90');
  await row.getByLabel('Hạn').focus();
  await settled(page, 'Task chi tiết');
  await page.reload();
  await expect(row.getByLabel('Hạn')).toHaveValue('2026-12-01');
  await expect(row.getByLabel('Loại deadline')).toHaveValue('hard');
  await expect(row.getByLabel('Ước lượng (phút)')).toHaveValue('90');
});

test('task Done xếp cuối và gạch ngang', async ({ page }) => {
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  await addTask(page, 'Việc A');
  await addTask(page, 'Việc B');
  await item(page, 'Việc A').getByLabel('Trạng thái').selectOption('done');
  await settled(page, 'Việc A');
  await expect(drawer.getByRole('listitem').last()).toContainText('Việc A');
  await expect(item(page, 'Việc A').getByRole('button', { name: 'Việc A' })).toHaveCSS('text-decoration-line', 'line-through');
  await expect(item(page, 'Việc B').getByRole('button', { name: 'Việc B' })).not.toHaveCSS('text-decoration-line', 'line-through');
});

test('chuyển tab không làm mất chỉnh sửa chưa lưu ở Tổng quan', async ({ page }) => {
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  await drawer.getByLabel('Việc tiếp theo').fill('Chưa lưu');
  await drawer.getByRole('tab', { name: 'Tasks' }).click();
  await expect(page).toHaveURL(/section=tasks/);
  await drawer.getByRole('tab', { name: 'Tổng quan' }).click();
  await expect(page).toHaveURL(/section=overview/);
  await expect(drawer.getByLabel('Việc tiếp theo')).toHaveValue('Chưa lưu');
  await drawer.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(drawer.getByText('Đã lưu')).toBeVisible();
  await page.reload();
  await expect(drawer.getByLabel('Việc tiếp theo')).toHaveValue('Chưa lưu');
});

test('xóa ngày gửi null: sau khi tải lại ô ngày trống', async ({ page }) => {
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  await drawer.getByLabel('Deadline').fill('2026-12-01');
  await drawer.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(drawer.getByText('Đã lưu')).toBeVisible();
  await page.reload();
  await expect(drawer.getByLabel('Deadline')).toHaveValue('2026-12-01');
  await drawer.getByLabel('Deadline').fill('');
  await drawer.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(drawer.getByText('Đã lưu')).toBeVisible();
  await page.reload();
  await expect(drawer.getByLabel('Deadline')).toHaveValue('');
});

test('lỗi từ server hiện role=alert', async ({ page }) => {
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  await drawer.getByLabel('Tên', { exact: true }).fill('x'.repeat(201));
  await drawer.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(drawer.getByRole('alert')).toContainText('tối đa 200');
});

test('Lưu trữ cần xác nhận và ẩn mục khỏi danh sách', async ({ page }) => {
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  await drawer.getByRole('button', { name: 'Lưu trữ' }).click();
  await expect(drawer.getByRole('button', { name: 'Xác nhận lưu trữ' })).toBeVisible();
  await drawer.getByRole('button', { name: 'Xác nhận lưu trữ' }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole('listitem').filter({ hasText: 'Computer Networks' })).toHaveCount(0);
});

test('đóng drawer xóa item và section, giữ tab; dự án có bộ tab riêng', async ({ page }) => {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Projects' }).click();
  await expect(page).toHaveURL(/tab=projects/);
  await expect(page.getByText('Bấm Thêm để tạo dự án đầu tiên.')).toBeVisible();
  await page.getByRole('button', { name: 'Thêm' }).click();
  await page.getByLabel('Tên', { exact: true }).fill('Jarvis');
  await page.getByRole('button', { name: 'Tạo' }).click();
  await page.getByRole('listitem').filter({ hasText: 'Jarvis' }).click();
  const drawer = page.getByRole('dialog', { name: 'Jarvis' });
  await expect(drawer.getByRole('tab')).toHaveText(['Tổng quan', 'Tasks', 'Milestones', 'Blockers', 'Notes', 'Activity']);
  await expect(drawer.getByLabel('Vai trò')).toBeVisible();
  await drawer.getByRole('tab', { name: 'Tasks' }).click();
  await expect(page).toHaveURL(/section=tasks/);
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(page).toHaveURL(/tab=projects/);
  await expect(page).not.toHaveURL(/item=/);
  await expect(page).not.toHaveURL(/section=/);
});

test('item không tồn tại hiện thông báo', async ({ page }) => {
  await expect(page).toHaveURL(/item=/);
  await page.goto('/context?item=00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('dialog')).toContainText('Không tìm thấy mục này.');
  await page.goto('/context?item=khong-phai-uuid');
  await expect(page.getByRole('dialog')).toContainText('Không tìm thấy mục này.');
});

// The project `Milestone` select on a task is covered in Task 6: milestones have no UI to create them yet.
