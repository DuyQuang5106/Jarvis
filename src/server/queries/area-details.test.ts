import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { archiveArea, createArea } from '../services/areas';
import { assessmentService, noteService, taskService, topicService } from '../services/entities';
import { getAreaDetails, listArchivedAreas, listInboxNotes } from './area-details';

const manual = { origin: 'manual' as const };
let db: Db;
beforeEach(async () => { db = await createTestDb(); });

test('getAreaDetails trả đủ dữ liệu, đúng thứ tự và logLimit', async () => {
  const a = await createArea(db, { kind: 'academic', name: 'Database' }, manual);
  await topicService.create(db, { areaId: a.id, title: 'B', sortOrder: 1 }, manual);
  await topicService.create(db, { areaId: a.id, title: 'A', sortOrder: 0 }, manual);
  await assessmentService.create(db, { areaId: a.id, title: 'Giữa kỳ' }, manual);
  await taskService.create(db, { areaId: a.id, title: 't1' }, manual);
  await taskService.create(db, { areaId: a.id, title: 't2' }, manual);
  const n1 = await noteService.create(db, { areaId: a.id, text: 'cũ' }, manual);
  const n2 = await noteService.create(db, { areaId: a.id, text: 'mới' }, manual);

  const d = (await getAreaDetails(db, a.id))!;
  expect(d.area.id).toBe(a.id);
  expect(d.academic).not.toBeNull();
  expect(d.project).toBeNull();
  expect(d.topics.map((t) => t.title)).toEqual(['A', 'B']);
  expect(d.assessments).toHaveLength(1);
  expect(d.tasks).toHaveLength(2);
  expect(d.notes.map((n) => n.id)).toEqual([n2.id, n1.id]);
  const times = d.logs.map((l) => l.createdAt.getTime());
  expect(times).toEqual([...times].sort((x, y) => y - x));
  expect(d.logs.length).toBeGreaterThan(2);
  expect((await getAreaDetails(db, a.id, { logLimit: 2 }))!.logs).toHaveLength(2);
});

test('id không tồn tại trả null', async () => {
  expect(await getAreaDetails(db, '00000000-0000-4000-8000-000000000000')).toBeNull();
});

test('listInboxNotes và listArchivedAreas', async () => {
  const a = await createArea(db, { kind: 'academic', name: 'Cũ học' }, manual);
  const p = await createArea(db, { kind: 'project', name: 'Cũ dự án' }, manual);
  await createArea(db, { kind: 'academic', name: 'Còn' }, manual);
  await archiveArea(db, a.id, manual);
  await archiveArea(db, p.id, manual);
  expect((await listArchivedAreas(db, 'academic')).map((x) => x.id)).toEqual([a.id]);
  await noteService.create(db, { text: 'thường' }, manual);
  const inbox = await noteService.create(db, { text: 'hộp thư', inboxStatus: 'inbox' }, manual);
  await noteService.create(db, { text: 'xong', inboxStatus: 'processed' }, manual);
  expect((await listInboxNotes(db)).map((n) => n.id)).toEqual([inbox.id]);
});
