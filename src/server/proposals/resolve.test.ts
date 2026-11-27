import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { activityLogs, areas, notes, pendingActions, tasks, topics } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { createArea } from '../services/areas';
import { noteService, topicService } from '../services/entities';
import { approvePendingAction, rebasePendingAction, rejectPendingAction } from './resolve';
import { describeStored } from './describe';
import type { StoredProposal } from './schema';
import { createPendingAction } from './store';

/** The id of a proposal that must have been stored. */
function storedId(result: Awaited<ReturnType<typeof createPendingAction>>): string {
  if (!result.ok) throw new Error(`proposal dropped: ${result.reason}`);
  return result.id;
}

const manual = { origin: 'manual' as const };
let db: Db;
let areaId: string;
let topicId: string;

beforeEach(async () => {
  db = await createTestDb();
  areaId = (await createArea(db, { kind: 'academic', name: 'Mobile Programming' }, manual)).id;
  topicId = (await topicService.create(db, { areaId, title: 'Navigation' }, manual)).id;
});

const propose = async (
  extra: Parameters<typeof createPendingAction>[1]['proposal']['actions'] = [],
  opts: { source?: 'chat' | 'capture'; noteId?: string } = {},
) =>
  storedId(
    await createPendingAction(db, {
      source: opts.source ?? 'chat',
      noteId: opts.noteId,
      proposal: {
        summary: 'Cập nhật',
        actions: [
          { type: 'upsert_topic', areaId, id: topicId, status: 'familiar' },
          { type: 'add_progress_log', areaId, text: '22/11: đã đọc xong phần Navigation' },
          ...extra,
        ],
      },
    }),
  );

const topic = async () => (await db.select().from(topics).where(eq(topics.id, topicId)))[0];
const pending = async (id: string) => (await db.select().from(pendingActions).where(eq(pendingActions.id, id)))[0];
const aiLogs = async () => (await db.select().from(activityLogs)).filter((l) => l.origin === 'ai_approved');

test('duyệt toàn bộ: ghi đúng, log ai_approved chung batch (criterion 8)', async () => {
  const id = await propose();
  const out = await approvePendingAction(db, id, { selectedKeys: [0, 1] });
  expect(out).toMatchObject({ status: 'applied', appliedKeys: [0, 1] });
  expect((await topic()).status).toBe('familiar');
  const logs = await aiLogs();
  expect(logs).toHaveLength(2);
  expect(new Set(logs.map((l) => l.batchId))).toEqual(new Set([(out as { batchId: string }).batchId]));
  expect(await pending(id)).toMatchObject({ status: 'applied', resolvedAt: expect.any(Date) });
});

test('duyệt hai lần: lần hai không ghi gì', async () => {
  const id = await propose();
  await approvePendingAction(db, id, { selectedKeys: [0, 1] });
  expect(await approvePendingAction(db, id, { selectedKeys: [0, 1] })).toEqual({ status: 'already_resolved' });
  expect(await aiLogs()).toHaveLength(2);
});

test('hai lần duyệt đồng thời: đúng một lần được áp dụng', async () => {
  const id = await propose();
  const results = await Promise.all([
    approvePendingAction(db, id, { selectedKeys: [0, 1] }),
    approvePendingAction(db, id, { selectedKeys: [0, 1] }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual(['already_resolved', 'applied']);
  expect(await aiLogs()).toHaveLength(2);
});

test('duyệt một phần', async () => {
  const id = await propose();
  const out = await approvePendingAction(db, id, { selectedKeys: [1] });
  expect(out).toMatchObject({ status: 'partially_applied', appliedKeys: [1] });
  expect((await topic()).status).toBe('not_started');
  expect(await aiLogs()).toHaveLength(1);
  expect(((await pending(id)).actionsJson as { appliedKeys?: number[] }).appliedKeys).toEqual([1]);
});

test('bản ghi đổi sau khi đề xuất: xung đột, không ghi gì, vẫn pending (criterion 14)', async () => {
  const id = await propose();
  await topicService.update(db, topicId, { status: 'practiced' }, manual);
  expect(await approvePendingAction(db, id, { selectedKeys: [0, 1] })).toEqual({
    status: 'conflict',
    conflicts: [{ key: 0, kind: 'changed' }],
  });
  expect((await topic()).status).toBe('practiced');
  expect(await aiLogs()).toHaveLength(0);
  expect((await pending(id)).status).toBe('pending');
});

test('bỏ chọn hành động xung đột thì phần còn lại áp dụng được', async () => {
  const id = await propose();
  await topicService.update(db, topicId, { status: 'practiced' }, manual);
  expect(await approvePendingAction(db, id, { selectedKeys: [1] })).toMatchObject({ status: 'partially_applied' });
});

test('rebase sau khi đã xem giá trị mới thì duyệt được', async () => {
  const id = await propose();
  await topicService.update(db, topicId, { evidence: 'quiz 8/10' }, manual);
  expect(await rebasePendingAction(db, id)).toEqual({ status: 'rebased' });
  expect(await approvePendingAction(db, id, { selectedKeys: [0] })).toMatchObject({ status: 'partially_applied' });
  expect(await topic()).toMatchObject({ status: 'familiar', evidence: 'quiz 8/10' });
});

test('bản ghi đích bị xóa: xung đột missing, rebase không cứu được', async () => {
  const id = await propose();
  await topicService.remove(db, topicId, manual);
  expect(await approvePendingAction(db, id, { selectedKeys: [0] })).toEqual({
    status: 'conflict',
    conflicts: [{ key: 0, kind: 'missing' }],
  });
  await rebasePendingAction(db, id);
  expect(await approvePendingAction(db, id, { selectedKeys: [0] })).toMatchObject({ status: 'conflict' });
});

test('sửa trước khi duyệt: được validate lại, không cho đổi đích', async () => {
  const id = await propose([{ type: 'create_task', areaId, title: 'Ôn Navigation' }]);
  expect(
    await approvePendingAction(db, id, {
      selectedKeys: [2],
      edits: { 2: { type: 'create_task', areaId, title: '   ' } },
    }),
  ).toMatchObject({ status: 'invalid', errors: [{ key: 2 }] });
  expect(
    await approvePendingAction(db, id, {
      selectedKeys: [0],
      edits: { 0: { type: 'upsert_topic', areaId, id: '00000000-0000-4000-8000-000000000000', status: 'confident' } },
    }),
  ).toMatchObject({ status: 'invalid' });
  expect((await pending(id)).status).toBe('pending');
  const ok = await approvePendingAction(db, id, {
    selectedKeys: [0, 2],
    edits: {
      0: { type: 'upsert_topic', areaId, id: topicId, status: 'confident' },
      2: { type: 'create_task', areaId, title: 'Ôn Navigation tối nay', dueDate: '2026-11-22' },
    },
  });
  expect(ok).toMatchObject({ status: 'partially_applied', appliedKeys: [0, 2] });
  expect((await topic()).status).toBe('confident');
  expect((await db.select().from(tasks))[0]).toMatchObject({ title: 'Ôn Navigation tối nay', dueDate: '2026-11-22' });
});

test('một hành động lỗi làm rollback tất cả', async () => {
  const id = await propose([{ type: 'create_task', areaId, title: 'x' }]);
  const out = await approvePendingAction(db, id, {
    selectedKeys: [0, 2, 1],
    edits: { 2: { type: 'create_task', areaId, title: 'x', estimateMinutes: -5 } },
  });
  expect(out.status).toBe('invalid');
  expect((await topic()).status).toBe('not_started');
  expect(await aiLogs()).toHaveLength(0);
});

test('selectedKeys rỗng hoặc lạ là invalid', async () => {
  const id = await propose();
  expect((await approvePendingAction(db, id, { selectedKeys: [] })).status).toBe('invalid');
  expect((await approvePendingAction(db, id, { selectedKeys: [9] })).status).toBe('invalid');
  expect((await pending(id)).status).toBe('pending');
});

test('từ chối: không đổi gì, sau đó không duyệt được', async () => {
  const id = await propose();
  expect(await rejectPendingAction(db, id)).toEqual({ status: 'rejected' });
  expect(await rejectPendingAction(db, id)).toEqual({ status: 'already_resolved' });
  expect(await approvePendingAction(db, id, { selectedKeys: [0] })).toEqual({ status: 'already_resolved' });
  expect((await topic()).status).toBe('not_started');
});

test('đề xuất từ capture: duyệt xong note chuyển processed', async () => {
  const note = await noteService.create(db, { text: 'Mobile: xong Navigation', inboxStatus: 'inbox' }, manual);
  const id = await propose([], { source: 'capture', noteId: note.id });
  await approvePendingAction(db, id, { selectedKeys: [0, 1] });
  expect((await db.select().from(notes).where(eq(notes.id, note.id)))[0].inboxStatus).toBe('processed');
});

test('update_area thêm tên gọi khác: giữ tên cũ, bỏ trùng, thẻ duyệt hiện trước/sau', async () => {
  const id = (await createArea(db, { kind: 'academic', name: 'Tư tưởng Hồ Chí Minh', aliases: ['TTHCM'] }, manual)).id;
  const pa = storedId(
    await createPendingAction(db, {
      source: 'chat',
      proposal: { summary: 'Thêm tên gọi', actions: [{ type: 'update_area', id, patch: { addAliases: ['môn Tư tưởng', 'tthcm', 'Tư tưởng Hồ Chí Minh'] } }] },
    }),
  );
  const [preview] = await describeStored(db, ((await pending(pa)).actionsJson as StoredProposal).actions);
  expect(preview.changes).toEqual([{ field: 'Tên gọi khác', before: 'TTHCM', after: 'TTHCM, Tư tưởng' }]);
  expect(await approvePendingAction(db, pa, { selectedKeys: [0] })).toMatchObject({ status: 'applied' });
  const [row] = await db.select().from(areas).where(eq(areas.id, id));
  expect(row.aliases).toEqual(['TTHCM', 'Tư tưởng']);
});
