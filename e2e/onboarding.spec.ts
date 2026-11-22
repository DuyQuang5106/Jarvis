import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

test('review, bỏ chọn một mục, nhập; hộp thoại không hiện lại', async ({ page, request }) => {
  await resetDb(request, { onboarded: false });
  await page.goto('/context');
  const dialog = page.getByRole('dialog', { name: 'Review & import' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Algebra' }).uncheck();
  await dialog.getByRole('button', { name: 'Nhập mục đã chọn' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('listitem').filter({ hasText: 'chưa xác minh lại' })).toHaveCount(8);
  await expect(page.getByText('Algebra')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Review & import' })).toHaveCount(0);
});

test('Bỏ qua không tạo gì', async ({ page, request }) => {
  await resetDb(request, { onboarded: false });
  await page.goto('/context');
  await page.getByRole('button', { name: 'Bỏ qua' }).click();
  await expect(page.getByText('Chưa có mục nào.')).toBeVisible();
});

test('nhãn chưa xác minh lại biến mất sau lần sửa đầu tiên', async ({ page, request }) => {
  await resetDb(request, { seed: true });
  await page.goto('/context');
  const row = page.getByRole('listitem').filter({ hasText: 'Database' });
  await expect(row).toContainText('chưa xác minh lại');
  await row.click();
  await page.getByRole('dialog').getByLabel('Trạng thái').selectOption('active');
  await page.getByRole('dialog').getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listitem').filter({ hasText: 'Database' })).not.toContainText('chưa xác minh lại');
});

test('mục tiêu chạm trong hộp thoại đủ 44px', async ({ page, request }) => {
  await resetDb(request, { onboarded: false });
  await page.goto('/context');
  const dialog = page.getByRole('dialog', { name: 'Review & import' });
  await expect(dialog).toBeVisible();
  const small = await dialog.evaluate((root) => {
    const bad: string[] = [];
    const box = (el: Element) => el.getBoundingClientRect();
    for (const cb of root.querySelectorAll('[role="checkbox"]')) {
      const hit = cb.closest('label') ?? cb;
      const r = box(hit);
      if (r.width < 43.5 || r.height < 43.5) bad.push(`checkbox ${cb.getAttribute('aria-label')} ${r.width}x${r.height}`);
    }
    for (const input of root.querySelectorAll('input:not([aria-hidden])')) {
      const r = box(input);
      if (r.height < 43.5) bad.push(`input ${input.getAttribute('aria-label') ?? input.id} h=${r.height}`);
    }
    for (const b of root.querySelectorAll('button')) {
      const r = box(b);
      if (b.getAttribute('role') !== 'checkbox' && r.height < 43.5) bad.push(`button ${b.textContent} h=${r.height}`);
    }
    return bad;
  });
  expect(small).toEqual([]);
  // 43.5: h-11 is 2.75rem, a hair under 44px after rounding. Clicking the wrapper (not the 16px box) toggles the checkbox.
  const algebra = dialog.getByRole('checkbox', { name: 'Algebra' });
  await algebra.locator('xpath=ancestor::label').click({ position: { x: 3, y: 3 } });
  await expect(algebra).not.toBeChecked();
});
