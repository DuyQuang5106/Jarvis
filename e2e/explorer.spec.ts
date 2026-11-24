import { expect, test, type Locator, type Page } from '@playwright/test';
import { resetDb } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

async function openWorkspace(page: Page, name: string) {
  await page.goto('/context');
  await page.getByRole('button', { name: 'Thêm' }).click();
  await page.getByLabel('Tên', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Tạo' }).click();
  await page.getByRole('main').getByRole('listitem').filter({ hasText: name }).click();
  const ws = page.getByRole('dialog', { name });
  await expect(ws).toBeVisible();
  return ws;
}

async function openExplorerIfMobile(page: Page, ws: Locator, isMobile: boolean) {
  if (!isMobile) return ws;
  await ws.getByRole('button', { name: 'Danh sách tài liệu' }).click();
  const sheet = page.getByRole('dialog', { name: 'Tài liệu' });
  await expect(sheet).toBeVisible();
  return sheet;
}

test('cây thư mục lồng nhau, upload CSV/PNG/TXT, xem bảng & ảnh, tìm không dấu và xóa thư mục', async ({
  page,
  isMobile,
}) => {
  const ws = await openWorkspace(page, 'Database');
  let explorer = await openExplorerIfMobile(page, ws, isMobile);

  // Tạo thư mục gốc và thư mục con
  await explorer.getByRole('button', { name: 'Thư mục', exact: true }).click();
  await explorer.getByLabel('Tên thư mục mới').fill('01_Context');
  await explorer.getByRole('button', { name: 'Tạo', exact: true }).click();
  await expect(explorer.getByRole('button', { name: '01_Context', exact: true })).toBeVisible();

  // Chọn 01_Context rồi tạo thư mục con bên trong
  await explorer.getByRole('button', { name: '01_Context', exact: true }).click();
  await expect(explorer.getByText('Trong: 01_Context')).toBeVisible();
  await explorer.getByRole('button', { name: 'Thư mục', exact: true }).click();
  await explorer.getByLabel('Tên thư mục mới').fill('Con');
  await explorer.getByRole('button', { name: 'Tạo', exact: true }).click();
  await expect(explorer.getByRole('button', { name: 'Con', exact: true })).toBeVisible();

  // Upload file .csv vào 01_Context
  const csvContent = '\uFEFFid,title,note\n1,"Câu 1, SQL","Bảng chuẩn"\n2,Join,OK\n';
  await explorer.getByLabel('Chọn tệp tải lên').setInputFiles({
    name: 'QUESTION_INDEX.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csvContent, 'utf8'),
  });
  await expect(ws.getByRole('button', { name: /Bảng \(2\/2\)/ })).toBeVisible();
  await expect(ws.getByRole('cell', { name: 'Câu 1, SQL' })).toBeVisible();
  await ws.getByLabel('Lọc dòng CSV').fill('join');
  await expect(ws.getByRole('cell', { name: 'Câu 1, SQL' })).toHaveCount(0);
  await expect(ws.getByRole('cell', { name: 'Join' })).toBeVisible();

  // Upload ảnh PNG 1x1 hợp lệ và xem trực tiếp
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  explorer = await openExplorerIfMobile(page, ws, isMobile);
  await explorer.getByLabel('Chọn tệp tải lên').setInputFiles({
    name: 'diagram.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pngBase64, 'base64'),
  });
  const img = ws.getByRole('img', { name: 'diagram.png' });
  await expect(img).toBeVisible();
  await expect.poll(async () => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  // Upload file TXT và di chuyển thư mục + tìm kiếm không dấu
  explorer = await openExplorerIfMobile(page, ws, isMobile);
  await explorer.getByLabel('Chọn tệp tải lên').setInputFiles({
    name: 'ghi_chu.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Ôn tập truy vấn lồng SQL nâng cao', 'utf8'),
  });
  await expect(ws.getByLabel('Nội dung tài liệu')).toHaveValue('Ôn tập truy vấn lồng SQL nâng cao');

  // Chuyển thư mục cho ghi_chu.txt sang `Con`
  const moveRes = page.waitForResponse(
    (r) => r.request().method() === 'POST' && Boolean(r.request().headers()['next-action'])
  );
  await ws.getByLabel('Thư mục tài liệu').selectOption({ label: '01_Context / Con' });
  await moveRes;
  await expect(ws.getByLabel('Thư mục tài liệu').locator('option:checked')).toHaveText('01_Context / Con');
  await page.reload();
  const wsReload = page.getByRole('dialog', { name: 'Database' });
  await expect(wsReload.getByLabel('Nội dung tài liệu')).toHaveValue('Ôn tập truy vấn lồng SQL nâng cao');
  await expect(wsReload.getByLabel('Thư mục tài liệu').locator('option:checked')).toHaveText('01_Context / Con');

  // Đóng workspace, tìm kiếm không dấu ra file .txt vừa upload
  await wsReload.getByRole('button', { name: 'Đóng' }).click();
  await page.getByRole('button', { name: 'Tìm tài liệu' }).click();
  const search = page.getByRole('dialog', { name: 'Tìm kiếm tài liệu' });
  await search.getByLabel('Từ khóa tìm tài liệu').fill('truy van long');
  const hit = search.getByRole('button', { name: /ghi_chu\.txt/ });
  await expect(hit).toBeVisible();
  await hit.click();
  await expect(page.getByRole('dialog', { name: 'Database' })).toBeVisible();

  // Xóa mềm thư mục 01_Context (kèm nội dung) và kiểm tra không tràn ngang
  const wsFinal = page.getByRole('dialog', { name: 'Database' });
  const overflow = await wsFinal.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  const explorerFinal = await openExplorerIfMobile(page, wsFinal, isMobile);
  await explorerFinal.getByRole('button', { name: 'Tùy chọn 01_Context' }).click();
  await explorerFinal.getByRole('button', { name: /Xóa thư mục/ }).click();
  await explorerFinal.getByRole('button', { name: 'Xác nhận xóa' }).click();
  await expect(explorerFinal.getByText('Chưa có tài liệu nào.')).toBeVisible();
});
