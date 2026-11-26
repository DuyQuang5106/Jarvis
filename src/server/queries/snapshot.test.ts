// src/server/queries/snapshot.test.ts
import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import type { AreaStatus } from '@/db/enums';
import { areas, settings } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { archiveArea, createArea, updateArea } from '../services/areas';
import { getSettings, updateSettings } from '../services/settings';
import { assessmentService, blockerService, milestoneService, taskService, topicService } from '../services/entities';
import { getPortfolioSnapshot } from './snapshot';

const NOW = new Date('2026-11-22T03:00:00Z'); // 10:00 Chủ nhật 22/11 giờ VN
const manual = { origin: 'manual' as const };
let db: Db;
beforeEach(async () => { db = await createTestDb(); });
const setUpdatedAt = (id: string, iso: string) => db.update(areas).set({ updatedAt: new Date(iso) }).where(eq(areas.id, id));

test('database trống cho snapshot hợp lệ', async () => {
  expect(await getPortfolioSnapshot(db, NOW)).toEqual({
    today: '2026-11-22', weekday: 'Chủ nhật', week: { start: '2026-11-16', end: '2026-11-22' }, timezone: 'Asia/Ho_Chi_Minh',
    termGoal: null, areas: [], dueTasks: [], upcomingAssessments: [], staleAreaIds: [],
  });
});

test('today đúng lúc 00:30 và 23:30 giờ VN (criterion 15)', async () => {
  expect((await getPortfolioSnapshot(db, new Date('2026-11-21T17:30:00Z'))).today).toBe('2026-11-22');
  expect((await getPortfolioSnapshot(db, new Date('2026-11-22T16:30:00Z'))).today).toBe('2026-11-22');
});

test('cửa sổ task: quá hạn và trong 14 ngày, bỏ task done và task không hạn', async () => {
  const a = await createArea(db, { kind: 'academic', name: 'Database' }, manual);
  const mk = (title: string, dueDate: string | null, status: 'todo' | 'done' = 'todo') => taskService.create(db, { areaId: a.id, title, dueDate, status }, manual);
  await mk('quá hạn', '2026-11-20'); await mk('hôm nay', '2026-11-22'); await mk('ngày 14', '2026-12-06');
  await mk('ngày 15', '2026-12-07'); await mk('xong', '2026-11-23', 'done'); await mk('không hạn', null);
  const snap = await getPortfolioSnapshot(db, NOW);
  expect(snap.dueTasks.map((t) => [t.title, t.daysLeft])).toEqual([['quá hạn', -2], ['hôm nay', 0], ['ngày 14', 14]]);
});

test('cửa sổ assessment: từ hôm nay đến 21 ngày', async () => {
  const a = await createArea(db, { kind: 'academic', name: 'Database' }, manual);
  for (const [title, dueDate] of [['hôm qua', '2026-11-21'], ['hôm nay', '2026-11-22'], ['ngày 21', '2026-12-13'], ['ngày 22', '2026-12-14']])
    await assessmentService.create(db, { areaId: a.id, title, dueDate }, manual);
  expect((await getPortfolioSnapshot(db, NOW)).upcomingAssessments.map((x) => x.title)).toEqual(['hôm nay', 'ngày 21']);
});

test('counts có đủ khóa, kèm blocker đang mở', async () => {
  const course = await createArea(db, { kind: 'academic', name: 'Mobile Programming' }, manual);
  await topicService.create(db, { areaId: course.id, title: 'Navigation', status: 'practiced' }, manual);
  await topicService.create(db, { areaId: course.id, title: 'State', status: 'confident' }, manual);
  await topicService.create(db, { areaId: course.id, title: 'Storage' }, manual);
  await taskService.create(db, { areaId: course.id, title: 'Lab', status: 'doing' }, manual);
  await taskService.create(db, { areaId: course.id, title: 'Đã xong', status: 'done' }, manual);
  const proj = await createArea(db, { kind: 'project', name: 'Question House' }, manual);
  await milestoneService.create(db, { areaId: proj.id, title: 'Login', status: 'in_progress' }, manual);
  const open = await blockerService.create(db, { areaId: proj.id, title: 'Login Android chưa chạy' }, manual);
  const closed = await blockerService.create(db, { areaId: proj.id, title: 'Cũ' }, manual);
  await blockerService.update(db, closed.id, { status: 'resolved' }, manual);
  const snap = await getPortfolioSnapshot(db, NOW);
  const c = snap.areas.find((x) => x.id === course.id)!;
  const p = snap.areas.find((x) => x.id === proj.id)!;
  expect(c.counts).toEqual({ topics: { not_started: 1, familiar: 0, practiced: 1, confident: 1 }, milestones: null, openTasks: 1 });
  expect(p.counts).toEqual({ topics: null, milestones: { not_started: 0, in_progress: 1, done: 0 }, openTasks: 0 });
  expect(p.openBlockers).toEqual([{ id: open.id, title: 'Login Android chưa chạy' }]);
});

test('isStale chỉ áp cho active/blocked quá ngưỡng; staleAreaIds lấy 3 mục cũ nhất chưa đóng', async () => {
  const mk = async (name: string, status: AreaStatus, iso: string) => { const a = await createArea(db, { kind: 'project', name, status }, manual); await setUpdatedAt(a.id, iso); return a; };
  const d8 = await mk('tám ngày', 'active', '2026-11-14T03:00:00Z');
  const d7 = await mk('bảy ngày', 'active', '2026-11-15T03:00:00Z');
  const done = await mk('xong lâu', 'completed', '2026-10-01T03:00:00Z');
  const unk = await mk('chưa rõ', 'unknown', '2026-11-01T03:00:00Z');
  const hold = await mk('tạm dừng', 'on_hold', '2026-09-01T03:00:00Z');
  const fresh = await mk('mới', 'active', '2026-11-22T01:00:00Z');
  const snap = await getPortfolioSnapshot(db, NOW);
  const by = (id: string) => snap.areas.find((a) => a.id === id)!;
  expect([by(d8.id).isStale, by(d7.id).isStale, by(done.id).isStale, by(unk.id).isStale]).toEqual([true, false, false, false]);
  expect(by(d8.id).daysSinceUpdate).toBe(8);
  expect(snap.staleAreaIds).toEqual([unk.id, d8.id, d7.id]);
  expect(snap.staleAreaIds).not.toContain(hold.id);
  expect(snap.staleAreaIds).not.toContain(fresh.id);
});

test('missing, lastOrigin, bỏ area đã lưu trữ, giữ area ai_excluded', async () => {
  const seeded = await createArea(db, { kind: 'academic', name: 'Algebra' }, { origin: 'seed' });
  const edited = await createArea(db, { kind: 'academic', name: 'Database', aiExcluded: true }, { origin: 'seed' });
  await updateArea(db, edited.id, { status: 'active' }, manual);
  const gone = await createArea(db, { kind: 'project', name: 'Cũ' }, manual);
  await archiveArea(db, gone.id, manual);
  const snap = await getPortfolioSnapshot(db, NOW);
  const by = (id: string) => snap.areas.find((a) => a.id === id);
  expect(by(gone.id)).toBeUndefined();
  expect(by(seeded.id)).toMatchObject({ lastOrigin: 'seed', missing: ['status_unknown', 'no_topics', 'no_assessment_date'] });
  expect(by(edited.id)).toMatchObject({ lastOrigin: 'manual', aiExcluded: true, missing: ['no_next_action', 'no_topics', 'no_assessment_date'] });
});

test('task và assessment của area đã lưu trữ không vào cửa sổ', async () => {
  const kept = await createArea(db, { kind: 'academic', name: 'Còn học' }, manual);
  const gone = await createArea(db, { kind: 'academic', name: 'Đã lưu trữ' }, manual);
  for (const a of [kept, gone]) {
    await taskService.create(db, { areaId: a.id, title: `task ${a.name}`, dueDate: '2026-11-24' }, manual);
    await assessmentService.create(db, { areaId: a.id, title: `thi ${a.name}`, dueDate: '2026-11-25' }, manual);
  }
  await archiveArea(db, gone.id, manual);
  const snap = await getPortfolioSnapshot(db, NOW);
  expect(snap.dueTasks.map((t) => t.title)).toEqual(['task Còn học']);
  expect(snap.upcomingAssessments.map((x) => x.title)).toEqual(['thi Còn học']);
});

test('staleAfterDays khác mặc định đổi isStale', async () => {
  await updateSettings(db, { staleAfterDays: 3 });
  const mk = async (name: string, iso: string) => { const a = await createArea(db, { kind: 'project', name, status: 'active' }, manual); await setUpdatedAt(a.id, iso); return a; };
  const d4 = await mk('bốn ngày', '2026-11-18T03:00:00Z');
  const d3 = await mk('ba ngày', '2026-11-19T03:00:00Z');
  const snap = await getPortfolioSnapshot(db, NOW);
  const by = (id: string) => snap.areas.find((a) => a.id === id)!;
  expect([by(d4.id).isStale, by(d3.id).isStale]).toEqual([true, false]);
});

test('múi giờ khác mặc định đổi today và isStale', async () => {
  await getSettings(db);
  await db.update(settings).set({ timezone: 'Asia/Tokyo' }).where(eq(settings.id, 1));
  const late = new Date('2026-11-22T16:30:00Z'); // 23:30 22/11 ở VN, 01:30 23/11 ở Tokyo
  const a = await createArea(db, { kind: 'project', name: 'Tokyo', status: 'active' }, manual);
  await setUpdatedAt(a.id, '2026-11-15T14:30:00Z'); // 21:30 15/11 ở VN, 23:30 15/11 ở Tokyo
  const snap = await getPortfolioSnapshot(db, late);
  expect(snap).toMatchObject({ today: '2026-11-23', timezone: 'Asia/Tokyo', weekday: 'Thứ Hai' });
  expect(snap.areas[0]).toMatchObject({ daysSinceUpdate: 8, isStale: true });

  await db.update(settings).set({ timezone: 'Asia/Ho_Chi_Minh' }).where(eq(settings.id, 1));
  const vn = await getPortfolioSnapshot(db, late);
  expect(vn.today).toBe('2026-11-22');
  expect(vn.areas[0]).toMatchObject({ daysSinceUpdate: 7, isStale: false });
});

test('deadlineDaysLeft do server tính', async () => {
  const soon = await createArea(db, { kind: 'project', name: 'Sắp', deadlineDate: '2026-12-01' }, manual);
  const late = await createArea(db, { kind: 'project', name: 'Trễ', deadlineDate: '2026-11-20' }, manual);
  const none = await createArea(db, { kind: 'project', name: 'Không hạn' }, manual);
  const snap = await getPortfolioSnapshot(db, NOW);
  const by = (id: string) => snap.areas.find((a) => a.id === id)!;
  expect([by(soon.id).deadlineDaysLeft, by(late.id).deadlineDaysLeft, by(none.id).deadlineDaysLeft]).toEqual([9, -2, null]);
});

test('dự án active thiếu next action và milestone được đánh dấu', async () => {
  const bare = await createArea(db, { kind: 'project', name: 'Trống', status: 'active' }, manual);
  const full = await createArea(db, { kind: 'project', name: 'Đủ', status: 'active', nextAction: 'Viết login' }, manual);
  await milestoneService.create(db, { areaId: full.id, title: 'Beta' }, manual);
  const snap = await getPortfolioSnapshot(db, NOW);
  const by = (id: string) => snap.areas.find((a) => a.id === id)!;
  expect(by(bare.id).missing).toEqual(['no_next_action', 'no_milestones']);
  expect(by(full.id).missing).toEqual([]);
});

test('nearestDate: ngày gần nhất trong assessment sắp tới, task chưa xong, milestone chưa xong và hạn của mục', async () => {
  const course = await createArea(db, { kind: 'academic', name: 'Database' }, manual);
  await assessmentService.create(db, { areaId: course.id, title: 'Quiz cũ', dueDate: '2026-11-20' }, manual);
  await assessmentService.create(db, { areaId: course.id, title: 'Giữa kỳ (dự kiến)', dueDate: '2026-12-04' }, manual);
  await assessmentService.create(db, { areaId: course.id, title: 'Cuối kỳ' }, manual);
  await taskService.create(db, { areaId: course.id, title: 'Đã nộp', dueDate: '2026-11-23', status: 'done' }, manual);

  const sameDay = await createArea(db, { kind: 'academic', name: 'Algebra' }, manual);
  await taskService.create(db, { areaId: sameDay.id, title: 'Bài tập', dueDate: '2026-11-30' }, manual);
  await assessmentService.create(db, { areaId: sameDay.id, title: 'Quiz', dueDate: '2026-11-30' }, manual);

  const proj = await createArea(db, { kind: 'project', name: 'Jarvis', deadlineDate: '2026-12-31' }, manual);
  await milestoneService.create(db, { areaId: proj.id, title: 'Beta', targetDate: '2026-11-20' }, manual);
  await milestoneService.create(db, { areaId: proj.id, title: 'Alpha', targetDate: '2026-11-10', status: 'done' }, manual);

  const onlyDeadline = await createArea(db, { kind: 'project', name: 'Hôm nay', deadlineDate: '2026-11-22' }, manual);
  const closed = await createArea(db, { kind: 'project', name: 'Xong', status: 'completed', deadlineDate: '2026-11-01' }, manual);
  const bare = await createArea(db, { kind: 'academic', name: 'Trống' }, manual);

  const snap = await getPortfolioSnapshot(db, NOW);
  const nearest = (id: string) => snap.areas.find((a) => a.id === id)!.nearestDate;
  expect(nearest(course.id)).toEqual({ kind: 'assessment', title: 'Giữa kỳ (dự kiến)', date: '2026-12-04', daysLeft: 12 });
  expect(nearest(sameDay.id)).toEqual({ kind: 'assessment', title: 'Quiz', date: '2026-11-30', daysLeft: 8 });
  expect(nearest(proj.id)).toEqual({ kind: 'deadline', title: 'Beta', date: '2026-11-20', daysLeft: -2 });
  expect(nearest(onlyDeadline.id)).toEqual({ kind: 'deadline', title: null, date: '2026-11-22', daysLeft: 0 });
  expect(nearest(closed.id)).toBeNull();
  expect(nearest(bare.id)).toBeNull();
});
