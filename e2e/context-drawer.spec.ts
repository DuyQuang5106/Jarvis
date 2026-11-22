import { expect, test, type Locator, type Page } from '@playwright/test';
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

test('gõ từng ký tự vào Hạn chỉ lưu ngày đã gõ', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Typing into a date field is a desktop behaviour');
  await addTask(page, 'Task gõ ngày');
  const due = item(page, 'Task gõ ngày').getByLabel('Hạn');
  await due.click();
  await due.pressSequentially('12012026');
  await due.blur();
  await settled(page, 'Task gõ ngày');
  await page.reload();
  await expect(item(page, 'Task gõ ngày').getByLabel('Hạn')).toHaveValue('2026-12-01');
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

// The project `Milestone` select on a task is covered in context-sections.spec.ts.

/** Holds every server-action POST until `release()` is called. */
async function holdWrites(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route('**/context**', async (route) => {
    if (route.request().method() === 'POST') await gate;
    await route.continue();
  });
  return release;
}

test('Không gửi cho AI của mục lưu ngay khi bật, không cần bấm Lưu', async ({ page }) => {
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  await drawer.getByRole('switch', { name: 'Không gửi cho AI' }).click();
  await expect(drawer.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(drawer.getByText('Đang lưu…')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole('listitem').filter({ hasText: 'Computer Networks' }).getByLabel('Không gửi cho AI')).toBeVisible();
  await page.reload();
  await page.getByRole('listitem').filter({ hasText: 'Computer Networks' }).click();
  await expect(drawer.getByRole('switch', { name: 'Không gửi cho AI' })).toBeChecked();
});

test('Không gửi cho AI của mục lỗi khi lưu: về lại giá trị cũ và báo lỗi', async ({ page }) => {
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  await page.route('**/context**', (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
  await drawer.getByRole('switch', { name: 'Không gửi cho AI' }).click();
  await expect(drawer.getByRole('alert')).toBeVisible();
  await expect(drawer.getByRole('switch', { name: 'Không gửi cho AI' })).not.toBeChecked();
});

test('đóng drawer khi Tổng quan có thay đổi chưa lưu thì hỏi lại', async ({ page }, testInfo) => {
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  const confirm = page.getByRole('alertdialog', { name: 'Bỏ thay đổi chưa lưu?' });
  await drawer.getByLabel('Việc tiếp theo').fill('Chưa lưu');

  await page.keyboard.press('Escape');
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Hủy' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(drawer.getByLabel('Việc tiếp theo')).toHaveValue('Chưa lưu');

  await drawer.getByRole('button', { name: 'Close' }).click();
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Hủy' }).click();
  await expect(drawer).toBeVisible();

  if (testInfo.project.name === 'desktop') {
    // The overlay is the strip left of the 40rem drawer.
    await page.mouse.click(10, 300);
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Hủy' }).click();
    await expect(drawer).toBeVisible();
  }

  await page.keyboard.press('Escape');
  await confirm.getByRole('button', { name: 'Bỏ thay đổi' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).not.toHaveURL(/item=/);
  await page.getByRole('listitem').filter({ hasText: 'Computer Networks' }).click();
  await expect(drawer.getByLabel('Việc tiếp theo')).toHaveValue('');

  // A clean form closes straight away.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('lưu lỗi thì thay đổi vẫn tính là chưa lưu khi đóng', async ({ page }) => {
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  await drawer.getByLabel('Tên', { exact: true }).fill('x'.repeat(201));
  await drawer.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(drawer.getByRole('alert')).toContainText('tối đa 200');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog', { name: 'Bỏ thay đổi chưa lưu?' })).toBeVisible();
});

test('Enter hai lần nhanh khi thêm task chỉ tạo một task', async ({ page }) => {
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  await drawer.getByRole('tab', { name: 'Tasks' }).click();
  const release = await holdWrites(page);
  const input = drawer.getByPlaceholder('Thêm task…');
  await input.fill('Một task');
  await input.press('Enter');
  await input.press('Enter');
  await expect(drawer.getByText('Đang lưu…')).toBeVisible();
  release();
  await expect(drawer.getByRole('listitem').filter({ hasText: 'Một task' })).toBeVisible();
  await expect(input).toHaveValue('');
  await page.reload();
  await expect(page.getByRole('dialog').getByRole('listitem')).toHaveCount(1);
});

test('nút đóng drawer và hộp thoại thêm mục rộng ít nhất 44px', async ({ page }) => {
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  // Dialogs zoom in from 95%: poll until the open animation has settled.
  const atLeast44 = async (button: Locator) => {
    await expect.poll(async () => (await button.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(43.5);
    await expect.poll(async () => (await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43.5);
  };
  await atLeast44(drawer.getByRole('button', { name: 'Close' }));
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await page.getByRole('button', { name: 'Thêm' }).click();
  await atLeast44(page.getByRole('dialog').getByRole('button', { name: 'Close' }));
});
