import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { activityLogs, areas, tasks } from '@/db/schema';
import { logsFor, makeArea } from '@/db/test-helpers';
import { createTestDb } from '@/db/testing';
import { NotFoundError, ValidationError } from '../errors';
import { assessmentService, blockerService, ENTITY_SERVICES, milestoneService, noteService, taskService, topicService } from './entities';

let db: Db;
const manual = { origin: 'manual' as const };
beforeEach(async () => { db = await createTestDb(); });

test('create ghi đúng một log và làm mới areas.updated_at', async () => {
  const area = await makeArea(db, { updatedAt: new Date('2026-11-01T00:00:00Z') });
  const task = await taskService.create(db, { areaId: area.id, title: 'Lab 1', dueDate: '2026-11-25' }, manual);
  const logs = await logsFor(db, task.id);
  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({ areaId: area.id, entityType: 'task', action: 'create', origin: 'manual', beforeJson: null });
  expect(logs[0].afterJson).toMatchObject({ title: 'Lab 1', dueDate: '2026-11-25', status: 'todo' });
  const [after] = await db.select().from(areas).where(eq(areas.id, area.id));
  expect(after.updatedAt.getTime()).toBeGreaterThan(area.updatedAt.getTime());
});

test('update lưu before/after trong một log', async () => {
  const area = await makeArea(db);
  const topic = await topicService.create(db, { areaId: area.id, title: 'Navigation' }, manual);
  const updated = await topicService.update(db, topic.id, { status: 'familiar' }, { origin: 'ai_approved', batchId: '11111111-1111-4111-8111-111111111111' });
  expect(updated.status).toBe('familiar');
  const logs = await logsFor(db, topic.id);
  expect(logs).toHaveLength(2);
  expect(logs[1]).toMatchObject({ action: 'update', origin: 'ai_approved', batchId: '11111111-1111-4111-8111-111111111111' });
  expect(logs[1].beforeJson).toMatchObject({ status: 'not_started' });
  expect(logs[1].afterJson).toMatchObject({ status: 'familiar' });
});

test('update không đổi gì thì không ghi log và không đổi updated_at', async () => {
  const area = await makeArea(db);
  const topic = await topicService.create(db, { areaId: area.id, title: 'Navigation' }, manual);
  const same = await topicService.update(db, topic.id, { title: 'Navigation', status: 'not_started' }, manual);
  expect(same.updatedAt).toEqual(topic.updatedAt);
  expect(await logsFor(db, topic.id)).toHaveLength(1);
});

test('remove ghi log delete kèm before', async () => {
  const area = await makeArea(db);
  const task = await taskService.create(db, { areaId: area.id, title: 'Lab 1' }, manual);
  await taskService.remove(db, task.id, manual);
  expect(await db.select().from(tasks)).toEqual([]);
  const logs = await logsFor(db, task.id);
  expect(logs[1]).toMatchObject({ action: 'delete', afterJson: null });
  expect(logs[1].beforeJson).toMatchObject({ title: 'Lab 1' });
});

test('id không tồn tại ném NotFoundError', async () => {
  const id = '00000000-0000-4000-8000-000000000000';
  await expect(taskService.update(db, id, { title: 'x' }, manual)).rejects.toBeInstanceOf(NotFoundError);
  await expect(taskService.remove(db, id, manual)).rejects.toBeInstanceOf(NotFoundError);
});

test('lỗi giữa chừng không để lại bản ghi hay log', async () => {
  const err = await taskService
    .create(db, { areaId: '00000000-0000-4000-8000-000000000000', title: 'x' }, manual)
    .then(() => null, (e: unknown) => e as Error & { cause?: { message?: string } });
  // A database-level FK violation (not a validation error), wrapped by drizzle as a failed insert.
  expect(err).not.toBeNull();
  expect(err).not.toBeInstanceOf(ValidationError);
  expect(err!.message).toContain('Failed query: insert into "tasks"');
  expect(err!.cause?.message).toMatch(/foreign key/i);
  expect(await db.select().from(tasks)).toEqual([]);
  expect(await db.select().from(activityLogs)).toEqual([]);
});

test('xóa milestone giữ task và gỡ liên kết', async () => {
  const area = await makeArea(db, { kind: 'project', name: 'Question House' });
  const ms = await milestoneService.create(db, { areaId: area.id, title: 'Login' }, manual);
  const task = await taskService.create(db, { areaId: area.id, title: 'Fix login', milestoneId: ms.id }, manual);
  await milestoneService.remove(db, ms.id, manual);
  const [after] = await db.select().from(tasks).where(eq(tasks.id, task.id));
  expect(after.milestoneId).toBeNull();
});

test('milestone của area khác bị từ chối', async () => {
  const a = await makeArea(db, { kind: 'project', name: 'A' });
  const b = await makeArea(db, { kind: 'project', name: 'B' });
  const ms = await milestoneService.create(db, { areaId: b.id, title: 'M' }, manual);
  await expect(taskService.create(db, { areaId: a.id, title: 't', milestoneId: ms.id }, manual)).rejects.toBeInstanceOf(ValidationError);
});

test('blocker resolved đặt resolved_at, mở lại thì xóa', async () => {
  const area = await makeArea(db, { kind: 'project', name: 'Question House' });
  const blocker = await blockerService.create(db, { areaId: area.id, title: 'Login Android chưa chạy' }, manual);
  const resolved = await blockerService.update(db, blocker.id, { status: 'resolved' }, manual);
  expect(resolved.resolvedAt).toBeInstanceOf(Date);
  const reopened = await blockerService.update(db, blocker.id, { status: 'open' }, manual);
  expect(reopened.resolvedAt).toBeNull();
});

test('note không gắn area vẫn có log với area_id null', async () => {
  const note = await noteService.create(db, { text: 'Database lab đã nộp', inboxStatus: 'inbox' }, manual);
  expect((await logsFor(db, note.id))[0]).toMatchObject({ areaId: null, entityType: 'note' });
});

test('service chạy được trong transaction bên ngoài và rollback cùng nó', async () => {
  const area = await makeArea(db);
  await expect(db.transaction(async (tx) => {
    await taskService.create(tx, { areaId: area.id, title: 'trong tx' }, manual);
    throw new Error('hủy');
  })).rejects.toThrow('hủy');
  expect(await db.select().from(tasks)).toEqual([]);
  expect(await db.select().from(activityLogs)).toEqual([]);
});

test('task update với milestone của area khác bị từ chối', async () => {
  const a = await makeArea(db, { kind: 'project', name: 'A' });
  const b = await makeArea(db, { kind: 'project', name: 'B' });
  const ms = await milestoneService.create(db, { areaId: b.id, title: 'M' }, manual);
  const task = await taskService.create(db, { areaId: a.id, title: 't' }, manual);
  await expect(taskService.update(db, task.id, { milestoneId: ms.id }, manual)).rejects.toThrow('Milestone không thuộc mục này.');
  expect(await logsFor(db, task.id)).toHaveLength(1);
});

test('task update milestoneId null gỡ liên kết và ghi một log', async () => {
  const area = await makeArea(db, { kind: 'project', name: 'Question House' });
  const ms = await milestoneService.create(db, { areaId: area.id, title: 'Login' }, manual);
  const task = await taskService.create(db, { areaId: area.id, title: 'Fix login', milestoneId: ms.id }, manual);
  const updated = await taskService.update(db, task.id, { milestoneId: null }, manual);
  expect(updated.milestoneId).toBeNull();
  const logs = await logsFor(db, task.id);
  expect(logs).toHaveLength(2);
  expect(logs[1]).toMatchObject({ action: 'update' });
  expect(logs[1].beforeJson).toMatchObject({ milestoneId: ms.id });
  expect(logs[1].afterJson).toMatchObject({ milestoneId: null });
});

test('update dueTime giữ nguyên (HH:MM so với HH:MM:SS) là no-op', async () => {
  const area = await makeArea(db);
  const task = await taskService.create(db, { areaId: area.id, title: 'Lab', dueTime: '09:30' }, manual);
  const same = await taskService.update(db, task.id, { dueTime: '09:30' }, manual);
  expect(same.updatedAt).toEqual(task.updatedAt);
  expect(await logsFor(db, task.id)).toHaveLength(1);
});

test('update đặt null vào trường đã null là no-op', async () => {
  const area = await makeArea(db);
  const task = await taskService.create(db, { areaId: area.id, title: 'Lab' }, manual);
  const same = await taskService.update(db, task.id, { dueDate: null, estimateMinutes: null }, manual);
  expect(same.updatedAt).toEqual(task.updatedAt);
  expect(await logsFor(db, task.id)).toHaveLength(1);
});

test('blocker resolved hai lần giữ resolved_at đầu tiên và không ghi log thứ hai', async () => {
  const area = await makeArea(db, { kind: 'project', name: 'Question House' });
  const blocker = await blockerService.create(db, { areaId: area.id, title: 'Login' }, manual);
  const first = await blockerService.update(db, blocker.id, { status: 'resolved' }, manual);
  const second = await blockerService.update(db, blocker.id, { status: 'resolved' }, manual);
  expect(second.resolvedAt).toEqual(first.resolvedAt);
  expect(await logsFor(db, blocker.id)).toHaveLength(2);
});

test('assessment create và update ghi log entityType assessment', async () => {
  const area = await makeArea(db);
  const a = await assessmentService.create(db, { areaId: area.id, title: 'Midterm', weight: 30 }, manual);
  const updated = await assessmentService.update(db, a.id, { score: 8, maxScore: 10 }, manual);
  expect(updated).toMatchObject({ score: 8, maxScore: 10 });
  const logs = await logsFor(db, a.id);
  expect(logs.map((l) => [l.entityType, l.action])).toEqual([['assessment', 'create'], ['assessment', 'update']]);
  expect(logs[1].beforeJson).toMatchObject({ score: null });
  expect(logs[1].afterJson).toMatchObject({ score: 8, maxScore: 10 });
});

test('ENTITY_SERVICES có đúng sáu khóa ánh xạ đúng service', () => {
  expect(Object.keys(ENTITY_SERVICES).sort()).toEqual(['assessment', 'blocker', 'milestone', 'note', 'task', 'topic']);
  expect(ENTITY_SERVICES.task).toBe(taskService);
  expect(ENTITY_SERVICES.topic).toBe(topicService);
  expect(ENTITY_SERVICES.assessment).toBe(assessmentService);
  expect(ENTITY_SERVICES.milestone).toBe(milestoneService);
  expect(ENTITY_SERVICES.blocker).toBe(blockerService);
  expect(ENTITY_SERVICES.note).toBe(noteService);
});

test('topic không có sortOrder được thêm vào cuối của đúng area', async () => {
  const area = await makeArea(db);
  const other = await makeArea(db);
  await topicService.create(db, { areaId: other.id, title: 'Khác', sortOrder: 50 }, manual);
  const first = await topicService.create(db, { areaId: area.id, title: 'Một' }, manual);
  expect(first.sortOrder).toBe(0);
  await topicService.create(db, { areaId: area.id, title: 'Có thứ tự', sortOrder: 7 }, manual);
  const last = await topicService.create(db, { areaId: area.id, title: 'Cuối' }, manual);
  expect(last.sortOrder).toBe(8);
});
