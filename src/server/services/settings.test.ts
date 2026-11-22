import { expect, test } from 'vitest';
import { createTestDb } from '@/db/testing';
import { getSettings, markOnboarded, updateSettings } from './settings';

test('getSettings tạo dòng mặc định một lần', async () => {
  const db = await createTestDb();
  const a = await getSettings(db);
  const b = await getSettings(db);
  expect(a).toMatchObject({ id: 1, timezone: 'Asia/Ho_Chi_Minh', staleAfterDays: 7, onboardedAt: null });
  expect(b.id).toBe(1);
});

test('updateSettings và markOnboarded', async () => {
  const db = await createTestDb();
  expect((await updateSettings(db, { staleAfterDays: 10, termGoal: 'GPA 4.0/4.0, 23 tín chỉ' })).staleAfterDays).toBe(10);
  await markOnboarded(db, new Date('2026-11-22T03:00:00Z'));
  expect((await getSettings(db)).onboardedAt).toEqual(new Date('2026-11-22T03:00:00Z'));
  await expect(updateSettings(db, { staleAfterDays: 0 })).rejects.toThrow();
});
