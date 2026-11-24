import { beforeEach, expect, test, vi } from 'vitest';
import type { Db } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { createArea } from '@/server/services/areas';
import { folderService } from '@/server/services/folders';
import { createMemoryStorage } from '@/server/storage/memory';
import type { FileStorage } from '@/server/storage';

let db: Db;
let storage: FileStorage;
const resolveOwner = vi.fn();

vi.mock('@/db/client', async (orig) => ({ ...(await orig<typeof import('@/db/client')>()), getDb: async () => db }));
vi.mock('@/server/owner', async (orig) => ({ ...(await orig<typeof import('@/server/owner')>()), resolveOwner: (...a: unknown[]) => resolveOwner(...a) }));
vi.mock('@/server/storage', async (orig) => ({ ...(await orig<typeof import('@/server/storage')>()), getStorage: () => storage }));
vi.mock('next/server', () => ({ connection: async () => {} }));

import { GET } from './[id]/route';
import { POST } from './upload/route';

let areaId: string;

beforeEach(async () => {
  db = await createTestDb();
  storage = createMemoryStorage();
  resolveOwner.mockReset();
  resolveOwner.mockResolvedValue({ email: 'dev@local' });
  areaId = (await createArea(db, { kind: 'academic', name: 'Computer Networks' }, { origin: 'manual' })).id;
});

test('upload và download bị chặn 401 khi chưa đăng nhập', async () => {
  resolveOwner.mockResolvedValue(null);
  const fd = new FormData();
  fd.append('areaId', areaId);
  fd.append('file', new File(['hi'], 'note.txt', { type: 'text/plain' }));

  const up = await POST(new Request('http://localhost/api/files/upload', { method: 'POST', body: fd }));
  expect(up.status).toBe(401);

  const down = await GET(new Request('http://localhost/api/files/00000000-0000-4000-8000-000000000000'), {
    params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000000' }),
  });
  expect(down.status).toBe(401);
});

test('upload tệp text và nhị phân vào thư mục, tải xuống với header bảo mật', async () => {
  const folder = await folderService.create(db, { areaId, name: '02_Tai_lieu' }, { origin: 'manual' });

  const csvFd = new FormData();
  csvFd.append('areaId', areaId);
  csvFd.append('folderId', folder.id);
  csvFd.append('file', new File(['col1,col2\n1,2'], 'QUESTION_INDEX.csv', { type: 'text/csv' }));
  const csvRes = await POST(new Request('http://localhost/api/files/upload', { method: 'POST', body: csvFd }));
  expect(csvRes.status).toBe(201);
  const csvBody = (await csvRes.json()) as { document: { id: string; fileExt: string; storageKey: string | null } };
  expect(csvBody.document.fileExt).toBe('csv');
  expect(csvBody.document.storageKey).toBeNull();

  const imgBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const imgFd = new FormData();
  imgFd.append('areaId', areaId);
  imgFd.append('folderId', folder.id);
  imgFd.append('file', new File([imgBytes], 'diagram.png', { type: 'image/png' }));
  const imgRes = await POST(new Request('http://localhost/api/files/upload', { method: 'POST', body: imgFd }));
  expect(imgRes.status).toBe(201);
  const imgBody = (await imgRes.json()) as { document: { id: string; storageKey: string | null } };
  expect(imgBody.document.storageKey).toBeTruthy();

  const inlineRes = await GET(new Request(`http://localhost/api/files/${imgBody.document.id}?disposition=inline`), {
    params: Promise.resolve({ id: imgBody.document.id }),
  });
  expect(inlineRes.status).toBe(200);
  expect(inlineRes.headers.get('content-disposition')).toBe('inline');
  expect(inlineRes.headers.get('x-content-type-options')).toBe('nosniff');
  expect(new Uint8Array(await inlineRes.arrayBuffer())).toEqual(imgBytes);
});

test('từ chối định dạng cấm (.svg) và không để lại blob mồ côi khi DB thất bại', async () => {
  const badFd = new FormData();
  badFd.append('areaId', areaId);
  badFd.append('file', new File(['<svg><script/></svg>'], 'xss.svg', { type: 'image/svg+xml' }));
  const badRes = await POST(new Request('http://localhost/api/files/upload', { method: 'POST', body: badFd }));
  expect(badRes.status).toBe(400);

  const missingArea = '00000000-0000-4000-8000-000000000000';
  const orphanFd = new FormData();
  orphanFd.append('areaId', missingArea);
  orphanFd.append('file', new File([new Uint8Array([1, 2, 3])], 'slide.pdf', { type: 'application/pdf' }));
  const spyDelete = vi.spyOn(storage, 'delete');
  const failRes = await POST(new Request('http://localhost/api/files/upload', { method: 'POST', body: orphanFd }));
  expect(failRes.status).toBe(404);
  expect(spyDelete).toHaveBeenCalledTimes(1);
});
