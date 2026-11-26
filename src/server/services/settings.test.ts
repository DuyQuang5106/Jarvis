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

test('updateSettings: check-in và giờ các buổi lưu trong preferences_json, giữ các khóa khác; giờ sai bị từ chối', async () => {
  const db = await createTestDb();
  const { settings } = await import('@/db/schema');
  await getSettings(db);
  await db.update(settings).set({ preferencesJson: { other: 1 } });
  const daySlots = {
    morning: { start: '07:00', end: '11:30' },
    noon: { start: '11:30', end: '13:00' },
    afternoon: { start: '13:00', end: '18:00' },
    evening: { start: '18:00', end: '22:00' },
  };
  const row = await updateSettings(db, { checkinsEnabled: false, daySlots });
  expect(row.preferencesJson).toEqual({ other: 1, checkinsEnabled: false, daySlots });
  expect((await updateSettings(db, { checkinsEnabled: true })).preferencesJson).toEqual({ other: 1, checkinsEnabled: true, daySlots });
  await expect(updateSettings(db, { daySlots: { ...daySlots, noon: { start: '11:00', end: '13:00' } } })).rejects.toThrow('chồng lên buổi trước');
  expect((await getSettings(db)).preferencesJson).toEqual({ other: 1, checkinsEnabled: true, daySlots });
  expect((await updateSettings(db, { weeklyReviewsEnabled: false })).preferencesJson).toEqual({ other: 1, checkinsEnabled: true, daySlots, weeklyReviewsEnabled: false });
});
