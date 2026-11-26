import { expect, test } from 'vitest';
import { currentWeekStart, dueReviewWeek, weekEnd, weekInstants, weekLabel, weekStart } from './weeks';

const TZ = 'Asia/Ho_Chi_Minh';

test('weekStart: thứ Hai của tuần, Chủ nhật vẫn thuộc tuần đó; qua tháng và năm', () => {
  expect(weekStart('2026-11-23')).toBe('2026-11-23'); // Monday
  expect(weekStart('2026-11-26')).toBe('2026-11-23'); // Thursday
  expect(weekStart('2026-11-29')).toBe('2026-11-23'); // Sunday
  expect(weekStart('2026-11-30')).toBe('2026-11-30');
  expect(weekStart('2027-01-02')).toBe('2026-12-28');
  expect(weekEnd('2026-12-28')).toBe('2027-01-03');
});

test('weekLabel: "23/11–29/11"', () => {
  expect(weekLabel('2026-11-23')).toBe('23/11–29/11');
  expect(weekLabel('2026-12-28')).toBe('28/12–03/01');
});

test('weekInstants: thứ Hai 00:00 đến thứ Hai sau 00:00 theo giờ Việt Nam, server chạy UTC', () => {
  const r = weekInstants('2026-11-23', TZ);
  expect(r.start.toISOString()).toBe('2026-11-22T17:00:00.000Z');
  expect(r.end.toISOString()).toBe('2026-11-29T17:00:00.000Z');
});

test('currentWeekStart: 23:30 Chủ nhật giờ VN là đầu tuần sau theo UTC nhưng vẫn là tuần cũ', () => {
  expect(currentWeekStart(new Date('2026-11-29T16:30:00Z'), TZ)).toBe('2026-11-23'); // Sun 23:30 VN
  expect(currentWeekStart(new Date('2026-11-29T17:00:00Z'), TZ)).toBe('2026-11-30'); // Mon 00:00 VN
});

test('dueReviewWeek: Chủ nhật 17:59 còn mời tuần trước, 18:00 mời tuần này; thứ Ba tuần sau mời tuần vừa qua', () => {
  expect(dueReviewWeek(new Date('2026-11-29T10:59:00Z'), TZ)).toBe('2026-11-16'); // Sun 17:59
  expect(dueReviewWeek(new Date('2026-11-29T11:00:00Z'), TZ)).toBe('2026-11-23'); // Sun 18:00
  expect(dueReviewWeek(new Date('2026-11-29T16:59:00Z'), TZ)).toBe('2026-11-23'); // Sun 23:59
  expect(dueReviewWeek(new Date('2026-12-01T03:00:00Z'), TZ)).toBe('2026-11-23'); // next Tuesday 10:00
  expect(dueReviewWeek(new Date('2026-11-26T05:00:00Z'), TZ)).toBe('2026-11-16'); // Thursday
});
