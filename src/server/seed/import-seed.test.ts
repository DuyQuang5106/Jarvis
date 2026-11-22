import { expect, test } from 'vitest';
import { activityLogs, assessments, tasks, topics } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { getPortfolioSnapshot } from '../queries/snapshot';
import { getSettings } from '../services/settings';
import { importSeed } from './import-seed';
import { SEED_ITEMS, SEED_TERM_GOAL } from './seed-data';

const NOW = new Date('2026-11-22T03:00:00Z');
const all = SEED_ITEMS.map((s) => ({ key: s.key, name: s.name }));

test('seed có 9 môn và 5 dự án', () => {
  expect(SEED_ITEMS.filter((s) => s.kind === 'academic')).toHaveLength(9);
  expect(SEED_ITEMS.filter((s) => s.kind === 'project')).toHaveLength(5);
});

test('nhập toàn bộ: origin seed, không bịa dữ liệu (criterion 4)', async () => {
  const db = await createTestDb();
  expect(await importSeed(db, { items: all, termGoal: SEED_TERM_GOAL, now: NOW })).toEqual({ created: 14 });
  const snap = await getPortfolioSnapshot(db, NOW);
  expect(snap.areas).toHaveLength(14);
  expect(snap.areas.every((a) => a.lastOrigin === 'seed')).toBe(true);
  expect(snap.termGoal).toBe('GPA 4.0/4.0, 23 tín chỉ');
  expect(snap.areas.filter((a) => a.status === 'unknown')).toHaveLength(10);
  expect(snap.areas.find((a) => a.name === 'Mobile Programming')!.status).toBe('not_started');
  expect(snap.areas.every((a) => a.deadlineDate === null)).toBe(true);
  for (const table of [topics, tasks, assessments]) expect(await db.select().from(table)).toEqual([]);
  expect((await db.select().from(activityLogs)).every((l) => l.origin === 'seed')).toBe(true);
  expect((await getSettings(db)).onboardedAt).toEqual(NOW);
});

test('chỉ nhập mục được chọn, cho đổi tên, bỏ qua key lạ', async () => {
  const db = await createTestDb();
  const out = await importSeed(db, { items: [{ key: 'database', name: 'Cơ sở dữ liệu' }, { key: 'khong-co', name: 'X' }], termGoal: null, now: NOW });
  expect(out).toEqual({ created: 1 });
  expect((await getPortfolioSnapshot(db, NOW)).areas.map((a) => a.name)).toEqual(['Cơ sở dữ liệu']);
});

test('không nhập lần hai', async () => {
  const db = await createTestDb();
  await importSeed(db, { items: all, termGoal: null, now: NOW });
  await expect(importSeed(db, { items: all, termGoal: null, now: NOW })).rejects.toThrow('Đã hoàn tất thiết lập ban đầu.');
  expect((await getPortfolioSnapshot(db, NOW)).areas).toHaveLength(14);
});

test('khoá trùng chỉ nhập một lần; tên rỗng thì không nhập gì', async () => {
  const db = await createTestDb();
  expect(await importSeed(db, { items: [{ key: 'algebra', name: 'A' }, { key: 'algebra', name: 'B' }], termGoal: null, now: NOW })).toEqual({ created: 1 });
  const db2 = await createTestDb();
  await expect(importSeed(db2, { items: [{ key: 'algebra', name: '   ' }], termGoal: null, now: NOW })).rejects.toThrow();
  expect((await getPortfolioSnapshot(db2, NOW)).areas).toHaveLength(0);
  expect((await getSettings(db2)).onboardedAt).toBeNull();
});
