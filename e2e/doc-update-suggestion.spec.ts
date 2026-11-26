import { expect, test, type Page } from '@playwright/test';
import { resetDb } from './helpers';

const PROJECT = 'Question House';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await page.goto('/context?tab=projects');
  await page.getByRole('button', { name: 'Thêm' }).click();
  await page.getByLabel('Tên', { exact: true }).fill(PROJECT);
  await page.getByRole('button', { name: 'Tạo' }).click();
  await expect(projectRow(page)).toBeVisible();
});

const projectRow = (page: Page) => page.getByRole('main').getByRole('listitem').filter({ hasText: PROJECT });

/** Opens the project workspace in Context. */
async function openDocuments(page: Page) {
  await page.goto('/context?tab=projects');
  await projectRow(page).click();
  const ws = page.getByRole('dialog', { name: PROJECT });
  await expect(ws).toBeVisible();
  return ws;
}

async function send(page: Page, text: string) {
  await page.goto('/chat');
  await page.getByPlaceholder('Nhắn gì đó…').fill(text);
  await page.getByRole('button', { name: 'Gửi' }).click();
}

test('kể một quyết định của dự án chưa có tài liệu → đề xuất tạo STATE.md có diff → duyệt → tài liệu hiện trong Context', async ({ page, isMobile }) => {
  // The project starts without any document.
  let ws = await openDocuments(page);
  await expect(ws.getByText('Chưa có tài liệu nào trong workspace này')).toBeVisible();

  await send(page, 'MOCK_DECISION Question House: quyết định dùng Supabase thay vì Firebase vì cần truy vấn SQL');
  const card = page.getByTestId('proposal-card');
  await expect(card).toContainText('Tạo tài liệu “STATE.md”');
  await expect(card).toContainText(PROJECT);
  const diff = card.getByText('Xem thay đổi theo dòng');
  await diff.click();
  for (const line of ['+ ## Trạng thái hiện tại', '+ ## Quyết định', '+ ## Vướng mắc', '+ ## Nhật ký'])
    await expect(card.getByText(line, { exact: true })).toBeVisible();
  await expect(card).toContainText(/\+ - \d{4}-\d{2}-\d{2}: Question House: quyết định dùng Supabase thay vì Firebase vì cần truy vấn SQL/);
  expect(await card.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0);

  // Nothing is written before approval.
  const other = await page.context().newPage();
  const otherWs = await openDocuments(other);
  await expect(otherWs.getByText('Chưa có tài liệu nào trong workspace này')).toBeVisible();
  await other.close();

  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(card).toContainText('Đã áp dụng 1/1 thay đổi');

  ws = await openDocuments(page);
  await expect(ws.getByText('Chưa có tài liệu nào trong workspace này')).toHaveCount(0);
  const list = isMobile ? await openSheet(page, ws) : ws;
  await list.getByRole('button', { name: 'STATE.md', exact: true }).click();
  await expect(page).toHaveURL(/doc=[0-9a-f-]{36}/);
  await expect(ws.getByLabel('Nội dung tài liệu')).toHaveValue(/## Quyết định\s+- \d{4}-\d{2}-\d{2}: Question House: quyết định dùng Supabase/);
});

async function openSheet(page: Page, ws: ReturnType<Page['getByRole']>) {
  await ws.getByRole('button', { name: 'Danh sách tài liệu' }).click();
  const sheet = page.getByRole('dialog', { name: 'Tài liệu' });
  await expect(sheet).toBeVisible();
  return sheet;
}

test('chỉ hỏi thì không có thẻ đề xuất', async ({ page }) => {
  await send(page, 'MOCK_DECISION Question House nên dùng Supabase hay Firebase?');
  await expect(page.locator('[data-role="assistant"]').last()).toContainText('MOCK_STATE');
  await expect(page.getByTestId('proposal-card')).toHaveCount(0);
});
