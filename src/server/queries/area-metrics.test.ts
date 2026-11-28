import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { APP_TZ, todayIn } from '@/lib/dates';
import { createArea } from '../services/areas';
import { assessmentService, blockerService, milestoneService, taskService, topicService } from '../services/entities';
import { getAreaMetrics } from './area-metrics';

const manual = { origin: 'manual' as const };
const ai = { origin: 'ai_approved' as const };
let db: Db;
// Logs are stamped by the database clock, so the report runs at the real "now".
const now = new Date();
const day = (offset: number) => {
  const d = new Date(`${todayIn(APP_TZ, now)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

beforeEach(async () => { db = await createTestDb(); });

test('môn học: bao phủ, thành thạo, nhịp từ log và mốc thi gần nhất', async () => {
  const cn = await createArea(db, { kind: 'academic', name: 'Computer Networks', status: 'active' }, manual);
  const ids: string[] = [];
  for (const [title, status] of [['Ch.1', 'confident'], ['Ch.2', 'practiced'], ['Ch.3', 'not_started'], ['Ch.4', 'not_started']] as const) {
    ids.push((await topicService.create(db, { areaId: cn.id, title, status }, manual)).id);
  }
  // Studied one more topic: pace 1 in 14 days, and a level-up this week.
  await topicService.update(db, ids[2], { status: 'familiar' }, ai);
  await assessmentService.create(db, { areaId: cn.id, title: 'Giữa kỳ', dueDate: day(6) }, ai);
  await assessmentService.create(db, { areaId: cn.id, title: 'Cuối kỳ', dueDate: day(60) }, ai);

  const { byArea, week } = await getAreaMetrics(db, now);
  const m = byArea[cn.id];
  expect(m.progress).toEqual({ total: 4, covered: 3, masteryPoints: 1.5 });
  // 1 left in 6 days needs ~1,2/week; the pace is 0,5/week.
  expect(m.health).toEqual({ level: 'at_risk', reason: 'Còn 1/4 topic chưa học, 6 ngày tới Giữa kỳ; nhịp ~0,5 topic/tuần chưa kịp (cần ~1,2/tuần).' });
  expect(m.week).toMatchObject({ levelUps: 1, datesChanged: 2 });
  expect(week.levelUps).toBe(1);
});

test('quá hạn và vướng mắc → lệch hướng; nhập dữ liệu (migration/seed) không tính là tiến độ', async () => {
  const alg = await createArea(db, { kind: 'academic', name: 'Algebra', status: 'active' }, manual);
  const t = await topicService.create(db, { areaId: alg.id, title: 'Ch.1' }, manual);
  await topicService.update(db, t.id, { status: 'familiar' }, { origin: 'migration' });
  await taskService.create(db, { areaId: alg.id, title: 'Bài tập chương 5', dueDate: day(-2) }, manual);
  const { byArea } = await getAreaMetrics(db, now);
  expect(byArea[alg.id].health).toEqual({ level: 'off_track', reason: '"Bài tập chương 5" quá hạn 2 ngày.' });
  expect(byArea[alg.id].week.levelUps).toBe(0);

  await blockerService.create(db, { areaId: alg.id, title: 'Chờ thầy gửi đề' }, manual);
  expect((await getAreaMetrics(db, now)).byArea[alg.id].health?.reason).toBe('Đang vướng: Chờ thầy gửi đề.');
});

test('dự án: đếm milestone, mốc là milestone gần nhất chưa xong', async () => {
  const p = await createArea(db, { kind: 'project', name: 'StewieSAT', status: 'active' }, manual);
  const m1 = await milestoneService.create(db, { areaId: p.id, title: 'Thiết kế' }, manual);
  await milestoneService.create(db, { areaId: p.id, title: 'Demo', targetDate: day(20) }, manual);
  await milestoneService.update(db, m1.id, { status: 'done' }, manual);
  const { byArea } = await getAreaMetrics(db, now);
  expect(byArea[p.id].progress).toEqual({ total: 2, covered: 1, masteryPoints: 0 });
  expect(byArea[p.id].health).toEqual({ level: 'on_track', reason: 'Còn 1/2 milestone, 20 ngày tới Demo; nhịp ~0,5 milestone/tuần là kịp.' });
  expect(byArea[p.id].week.milestonesDone).toBe(1);
});

test('chưa có topic → chưa xác định; mục đã xong không có sức khỏe', async () => {
  const a = await createArea(db, { kind: 'academic', name: 'Tư tưởng', status: 'active' }, manual);
  const done = await createArea(db, { kind: 'academic', name: 'Xong rồi', status: 'completed' }, manual);
  const { byArea } = await getAreaMetrics(db, now);
  expect(byArea[a.id].progress.total).toBe(0);
  expect(byArea[a.id].health?.level).toBe('unknown');
  expect(byArea[done.id].health).toBeNull();
});
