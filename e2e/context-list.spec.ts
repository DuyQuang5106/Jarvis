import { expect, test, type Page } from '@playwright/test';
import { resetDb } from './helpers';

test.beforeEach(async ({ request }) => { await resetDb(request); });

async function addArea(page: Page, name: string, aliases = '', { expectClose = true } = {}) {
  await page.getByRole('button', { name: 'Thêm' }).click();
  await page.getByLabel('Tên', { exact: true }).fill(name);
  if (aliases) await page.getByLabel('Tên gọi tắt').fill(aliases);
  await page.getByRole('button', { name: 'Tạo' }).click();
  if (expectClose) await expect(page.getByRole('dialog')).toBeHidden();
}

test('trạng thái rỗng', async ({ page }) => {
  await page.goto('/context');
  await expect(page.getByText('Chưa có mục nào. Bấm Thêm để tạo môn học đầu tiên.')).toBeVisible();
});

test('thêm môn, thấy trong danh sách với trạng thái Unknown và nhãn thiếu dữ liệu', async ({ page }) => {
  await page.goto('/context');
  await addArea(page, 'Mobile Programming', 'Mobile');
  const row = page.getByRole('listitem').filter({ hasText: 'Mobile Programming' });
  await expect(row).toContainText('Unknown');
  await expect(row).toContainText('Chưa có topic');
  await page.getByRole('tab', { name: 'Projects' }).click();
  // Scoped to the page: the sidebar's thread list names every subject.
  await expect(page.getByRole('main').getByText('Mobile Programming')).toHaveCount(0);
});

test('tên toàn khoảng trắng bị từ chối ngay trong hộp thoại', async ({ page }) => {
  await page.goto('/context');
  await addArea(page, '   ', '', { expectClose: false });
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(0);
});

test('tìm theo alias, không phân biệt dấu', async ({ page }) => {
  await page.goto('/context');
  await addArea(page, 'Tư tưởng Hồ Chí Minh', 'TTHCM');
  await addArea(page, 'Database');
  await page.getByPlaceholder('Tìm theo tên').fill('tu tuong');
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await page.getByPlaceholder('Tìm theo tên').fill('tthcm');
  await expect(page.getByRole('listitem')).toContainText(['Tư tưởng Hồ Chí Minh']);
});

test('bấm một dòng đưa id lên URL', async ({ page }) => {
  await page.goto('/context');
  await addArea(page, 'Database');
  await page.getByRole('listitem').filter({ hasText: 'Database' }).click();
  await expect(page).toHaveURL(/item=[0-9a-f-]{36}/);
});

test('mọi ô nhập và select trên /context có cỡ chữ từ 16px', async ({ page }) => {
  await page.goto('/context');
  await page.getByRole('button', { name: 'Thêm' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const sizes = await page.evaluate(() =>
    [...document.querySelectorAll('input, select, textarea')].map((el) => parseFloat(getComputedStyle(el).fontSize)),
  );
  expect(sizes.length).toBeGreaterThanOrEqual(4);
  for (const s of sizes) expect(s).toBeGreaterThanOrEqual(16);
});

test('việc tiếp theo dài không có khoảng trắng không làm tràn ngang', async ({ page, isMobile }) => {
  await page.goto('/context');
  await addArea(page, 'Tràn');
  await page.getByRole('listitem').filter({ hasText: 'Tràn' }).click();
  const drawer = page.getByRole('dialog', { name: 'Tràn' });
  if (isMobile) await drawer.getByRole('button', { name: 'Vận hành' }).click();
  await drawer.getByLabel('Trạng thái').selectOption('active');
  await drawer.getByLabel('Việc tiếp theo').fill('x'.repeat(200));
  await drawer.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(drawer.getByText('Đã lưu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  const row = page.getByRole('listitem').filter({ hasText: 'xxxx' });
  await expect(row).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // Text spilling out of the row (even where an ancestor clips it) also counts as overflow.
  const spill = await row.evaluate((li) => {
    const range = document.createRange();
    range.selectNodeContents(li);
    return Math.max(range.getBoundingClientRect().right - li.getBoundingClientRect().right, li.getBoundingClientRect().right - document.documentElement.clientWidth);
  });
  expect(spill).toBeLessThanOrEqual(0.5);
});

test('badge trạng thái đổi màu theo trạng thái ở cả danh sách và drawer', async ({ page, isMobile }) => {
  await page.goto('/context');
  await addArea(page, 'Trạng thái màu');
  const row = page.getByRole('listitem').filter({ hasText: 'Trạng thái màu' });
  const rowBadge = row.locator('[data-area-status]');
  await expect(rowBadge).toHaveAttribute('data-area-status', 'unknown');
  const unknownBg = await rowBadge.evaluate((el) => getComputedStyle(el).backgroundColor);

  await row.click();
  const drawer = page.getByRole('dialog', { name: 'Trạng thái màu' });
  if (isMobile) await drawer.getByRole('button', { name: 'Vận hành' }).click();
  const drawerBadge = drawer.locator('[data-area-status]');
  await expect(drawerBadge).toHaveAttribute('data-area-status', 'unknown');

  const cases: Array<[string, string]> = [
    ['active', 'Active'],
    ['blocked', 'Blocked'],
    ['on_hold', 'On hold'],
    ['completed', 'Completed'],
  ];
  const settledBg = async (loc: ReturnType<Page['locator']>) => {
    let prev = '';
    let cur = '';
    await expect.poll(async () => {
      prev = cur;
      cur = await loc.evaluate((el) => getComputedStyle(el).backgroundColor);
      return prev !== '' && cur === prev;
    }, { intervals: [200] }).toBe(true);
    return cur;
  };
  const seenBg = new Set<string>([unknownBg]);
  const bgByStatus = new Map<string, string>();
  for (const [value, label] of cases) {
    await drawer.getByLabel('Trạng thái').selectOption(value);
    await drawer.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(drawer.getByText('Đã lưu')).toBeVisible();
    await expect(drawerBadge).toHaveAttribute('data-area-status', value);
    await expect(drawerBadge).toHaveText(label);
    const drawerBg = await settledBg(drawerBadge);
    if (value !== 'completed') {
      expect(seenBg.has(drawerBg)).toBe(false);
    }
    seenBg.add(drawerBg);
    bgByStatus.set(value, drawerBg);
  }
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(rowBadge).toHaveAttribute('data-area-status', 'completed');
  expect(await settledBg(rowBadge)).toBe(bgByStatus.get('completed'));

  // Set back to active and verify row badge matches active color too.
  await row.click();
  if (isMobile) await drawer.getByRole('button', { name: 'Vận hành' }).click();
  await drawer.getByLabel('Trạng thái').selectOption('active');
  await drawer.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(drawer.getByText('Đã lưu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(rowBadge).toHaveAttribute('data-area-status', 'active');
  await expect(rowBadge).toHaveText('Active');
  expect(await settledBg(rowBadge)).toBe(bgByStatus.get('active'));
});
