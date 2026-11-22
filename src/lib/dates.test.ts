import { describe, expect, test } from 'vitest';
import { APP_TZ, daysSince, daysUntil, formatDateVi, isValidDateStr, todayIn, weekRange, weekdayVi } from './dates';

describe('todayIn', () => {
  test('00:30 giờ VN đã là ngày mới', () => {
    expect(todayIn(APP_TZ, new Date('2026-11-21T17:30:00Z'))).toBe('2026-11-22');
  });
  test('23:30 giờ VN chưa sang ngày', () => {
    expect(todayIn(APP_TZ, new Date('2026-11-22T16:30:00Z'))).toBe('2026-11-22');
  });
});

test('daysUntil', () => {
  expect(daysUntil('2026-11-22', '2026-11-22')).toBe(0);
  expect(daysUntil('2026-12-01', '2026-11-22')).toBe(9);
  expect(daysUntil('2026-11-20', '2026-11-22')).toBe(-2);
  expect(daysUntil('2027-01-01', '2026-12-31')).toBe(1);
});

test('daysSince tính theo ngày lịch ở múi giờ VN', () => {
  // 2026-11-14T20:00Z = 03:00 ngày 15/11 giờ VN
  expect(daysSince(new Date('2026-11-14T20:00:00Z'), '2026-11-22', APP_TZ)).toBe(7);
});

test('weekRange: thứ Hai đến Chủ nhật', () => {
  expect(weekRange('2026-11-22')).toEqual({ start: '2026-11-16', end: '2026-11-22' }); // Chủ nhật
  expect(weekRange('2026-11-23')).toEqual({ start: '2026-11-23', end: '2026-11-29' }); // thứ Hai
});

test('hiển thị tiếng Việt', () => {
  expect(weekdayVi('2026-11-22')).toBe('Chủ nhật');
  expect(weekdayVi('2026-11-23')).toBe('Thứ Hai');
  expect(formatDateVi('2026-11-22')).toBe('22/11');
});

test('isValidDateStr', () => {
  expect(isValidDateStr('2026-11-22')).toBe(true);
  expect(isValidDateStr('2026-02-30')).toBe(false);
  expect(isValidDateStr('22/11')).toBe(false);
  expect(isValidDateStr('2026-11-22T00:00:00Z')).toBe(false);
});
