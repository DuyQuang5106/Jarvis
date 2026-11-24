import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { archiveArea, createArea } from '../services/areas';
import { blockerService, milestoneService, taskService, topicService } from '../services/entities';
import { stampActions } from './validate';

const manual = { origin: 'manual' as const };
const GHOST = '00000000-0000-4000-8000-000000000000';
let db: Db;
beforeEach(async () => { db = await createTestDb(); });

test('ghi mốc baseUpdatedAt cho cập nhật, null cho tạo mới', async () => {
  const course = await createArea(db, { kind: 'academic', name: 'Mobile Programming' }, manual);
  const topic = await topicService.create(db, { areaId: course.id, title: 'Navigation' }, manual);
  const out = await stampActions(db, [
    { type: 'upsert_topic', areaId: course.id, id: topic.id, status: 'familiar' },
    { type: 'add_progress_log', areaId: course.id, text: 'đã đọc' },
  ]);
  expect(out).toEqual({
    ok: true,
    stored: [
      { key: 0, action: { type: 'upsert_topic', areaId: course.id, id: topic.id, status: 'familiar' }, baseUpdatedAt: topic.updatedAt.toISOString() },
      { key: 1, action: { type: 'add_progress_log', areaId: course.id, text: 'đã đọc' }, baseUpdatedAt: null },
    ],
  });
});

test('ID không tồn tại, sai loại, sai area đều làm hỏng cả đề xuất', async () => {
  const course = await createArea(db, { kind: 'academic', name: 'Mobile Programming' }, manual);
  const other = await createArea(db, { kind: 'academic', name: 'Database' }, manual);
  const topic = await topicService.create(db, { areaId: course.id, title: 'Navigation' }, manual);
  const task = await taskService.create(db, { areaId: course.id, title: 'Lab' }, manual);
  const bad = async (action: Parameters<typeof stampActions>[1][number]) =>
    stampActions(db, [{ type: 'add_progress_log', areaId: course.id, text: 'ok' }, action]);
  expect(await bad({ type: 'update_task', id: GHOST, patch: { status: 'done' } })).toMatchObject({ ok: false, errors: [{ index: 1 }] });
  expect(await bad({ type: 'update_task', id: topic.id, patch: { status: 'done' } })).toMatchObject({ ok: false });
  expect(await bad({ type: 'upsert_topic', areaId: other.id, id: topic.id, status: 'familiar' })).toMatchObject({ ok: false });
  expect(await bad({ type: 'create_task', areaId: GHOST, title: 'x' })).toMatchObject({ ok: false });
  void task;
});

test('loại area, milestone khác area, area đã lưu trữ, blocker đã gỡ', async () => {
  const course = await createArea(db, { kind: 'academic', name: 'Database' }, manual);
  const proj = await createArea(db, { kind: 'project', name: 'Question House' }, manual);
  const other = await createArea(db, { kind: 'project', name: 'StewieSAT' }, manual);
  const ms = await milestoneService.create(db, { areaId: other.id, title: 'M' }, manual);
  const blocker = await blockerService.create(db, { areaId: proj.id, title: 'Login' }, manual);
  await blockerService.update(db, blocker.id, { status: 'resolved' }, manual);
  const old = await createArea(db, { kind: 'project', name: 'Cũ' }, manual);
  await archiveArea(db, old.id, manual);
  const fails = async (action: Parameters<typeof stampActions>[1][number]) => (await stampActions(db, [action])).ok === false;
  expect(await fails({ type: 'upsert_topic', areaId: proj.id, title: 'x' })).toBe(true);
  expect(await fails({ type: 'create_blocker', areaId: course.id, title: 'x' })).toBe(true);
  expect(await fails({ type: 'create_task', areaId: proj.id, title: 'x', milestoneId: ms.id })).toBe(true);
  expect(await fails({ type: 'create_task', areaId: old.id, title: 'x' })).toBe(true);
  expect(await fails({ type: 'resolve_blocker', id: blocker.id })).toBe(true);
  expect(await fails({ type: 'create_note', areaId: null, text: 'ok' })).toBe(false);
});
