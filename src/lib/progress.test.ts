import { expect, test } from 'vitest';
import type { AreaSummary } from '@/server/queries/snapshot';
import { APP_TZ, daysSince, daysUntil, todayIn } from './dates';
import { areaProgress, countdownText, emptyProgressHint, progressLabel, sortByAttention, updatedText } from './progress';

const topics = (not_started: number, familiar: number, practiced: number, confident: number) => ({
  kind: 'academic' as const,
  counts: { topics: { not_started, familiar, practiced, confident }, milestones: null, openTasks: 0 },
});
const milestones = (not_started: number, in_progress: number, done: number) => ({
  kind: 'project' as const,
  counts: { topics: null, milestones: { not_started, in_progress, done }, openTasks: 0 },
});

test('tiến độ: topic vững là Practiced trở lên, milestone xong là Done, luôn kèm mẫu số', () => {
  expect(areaProgress(topics(3, 2, 2, 1))).toEqual({ unit: 'topic', done: 3, total: 8 });
  expect(progressLabel(areaProgress(topics(3, 2, 2, 1)))).toBe('3/8 topic vững');
  expect(progressLabel(areaProgress(topics(2, 0, 0, 0)))).toBe('0/2 topic vững');
  expect(progressLabel(areaProgress(milestones(1, 2, 1)))).toBe('1/4 milestone xong');
});

test('mẫu số 0: không có nhãn tiến độ, chỉ có gợi ý', () => {
  expect(areaProgress(topics(0, 0, 0, 0))).toEqual({ unit: 'topic', done: 0, total: 0 });
  expect(progressLabel(areaProgress(topics(0, 0, 0, 0)))).toBeNull();
  expect(progressLabel(areaProgress(milestones(0, 0, 0)))).toBeNull();
  expect(emptyProgressHint('topic')).toBe('Chưa có topic');
  expect(emptyProgressHint('milestone')).toBe('Chưa có milestone');
});

test.each([
  ['assessment', 12, 'Thi sau 12 ngày'],
  ['assessment', 1, 'Thi ngày mai'],
  ['assessment', 0, 'Thi hôm nay'],
  ['deadline', 5, 'Hạn sau 5 ngày'],
  ['deadline', 1, 'Hạn ngày mai'],
  ['deadline', 0, 'Hạn hôm nay'],
  ['deadline', -1, 'Quá hạn 1 ngày'],
  ['deadline', -9, 'Quá hạn 9 ngày'],
] as const)('countdownText(%s, %i) = %s', (kind, daysLeft, expected) => {
  expect(countdownText({ kind, daysLeft })).toBe(expected);
});

test.each([
  [0, 'Cập nhật hôm nay'],
  [1, 'Cập nhật hôm qua'],
  [3, 'Cập nhật 3 ngày trước'],
])('updatedText(%i) = %s', (days, expected) => {
  expect(updatedText(days)).toBe(expected);
});

test('đếm ngày theo giờ Việt Nam: 23:30 và 00:30 giờ VN là hai ngày khác nhau', () => {
  // 17:30Z = 00:30 next day in Asia/Ho_Chi_Minh; 16:30Z = 23:30 the same day.
  const lateNight = new Date('2026-11-25T16:30:00Z');
  const afterMidnight = new Date('2026-11-25T17:30:00Z');
  expect(todayIn(APP_TZ, lateNight)).toBe('2026-11-25');
  expect(todayIn(APP_TZ, afterMidnight)).toBe('2026-11-26');

  const exam = '2026-12-08';
  expect(countdownText({ kind: 'assessment', daysLeft: daysUntil(exam, todayIn(APP_TZ, lateNight)) })).toBe('Thi sau 13 ngày');
  expect(countdownText({ kind: 'assessment', daysLeft: daysUntil(exam, todayIn(APP_TZ, afterMidnight)) })).toBe('Thi sau 12 ngày');
  expect(countdownText({ kind: 'deadline', daysLeft: daysUntil('2026-11-26', todayIn(APP_TZ, afterMidnight)) })).toBe('Hạn hôm nay');
  expect(countdownText({ kind: 'deadline', daysLeft: daysUntil('2026-11-25', todayIn(APP_TZ, afterMidnight)) })).toBe('Quá hạn 1 ngày');

  // Updated at 23:50 VN on the 25th, seen at 00:30 VN on the 26th: 40 minutes ago, but "hôm qua".
  const updatedAt = new Date('2026-11-25T16:50:00Z');
  expect(updatedText(daysSince(updatedAt, todayIn(APP_TZ, afterMidnight), APP_TZ))).toBe('Cập nhật hôm qua');
  expect(updatedText(daysSince(updatedAt, todayIn(APP_TZ, lateNight), APP_TZ))).toBe('Cập nhật hôm nay');
  expect(updatedText(daysSince(new Date('2026-11-22T17:30:00Z'), '2026-11-26', APP_TZ))).toBe('Cập nhật 3 ngày trước');
});

type Row = Pick<AreaSummary, 'id' | 'name' | 'status' | 'nearestDate' | 'daysSinceUpdate'>;
const row = (name: string, daysLeft: number | null, daysSinceUpdate: number, extra: Partial<Row> = {}): Row => ({
  id: name,
  name,
  status: 'active',
  nearestDate: daysLeft === null ? null : { kind: 'deadline', title: null, date: '2026-12-01', daysLeft },
  daysSinceUpdate,
  ...extra,
});

test('sortByAttention: hạn gần nhất trước (quá hạn đứng đầu), rồi lâu chưa cập nhật nhất', () => {
  const sorted = sortByAttention([
    row('Không hạn, mới', null, 0),
    row('Hạn xa', 30, 20),
    row('Không hạn, cũ', null, 15),
    row('Hôm nay', 0, 1),
    row('Quá hạn', -3, 0),
    row('Hạn gần', 2, 0),
  ]);
  expect(sorted.map((a) => a.name)).toEqual(['Quá hạn', 'Hôm nay', 'Hạn gần', 'Hạn xa', 'Không hạn, cũ', 'Không hạn, mới']);
});

test('sortByAttention: cùng hạn thì mục lâu chưa cập nhật hơn đứng trước; hòa thì theo tên rồi id', () => {
  expect(sortByAttention([row('B', 5, 2), row('A', 5, 2), row('C', 5, 9)]).map((a) => a.name)).toEqual(['C', 'A', 'B']);
  const twins = [row('Trùng tên', null, 4, { id: 'b' }), row('Trùng tên', null, 4, { id: 'a' })];
  expect(sortByAttention(twins).map((a) => a.id)).toEqual(['a', 'b']);
  expect(sortByAttention([...twins].reverse()).map((a) => a.id)).toEqual(['a', 'b']);
});

test('sortByAttention: mục đã xong hoặc tạm dừng xuống cuối dù có hạn gần; không sửa mảng gốc', () => {
  const input = [
    row('Tạm dừng', 1, 50, { status: 'on_hold' }),
    row('Đã xong', null, 90, { status: 'completed' }),
    row('Đang làm', null, 0),
    row('Chưa rõ', 40, 0, { status: 'unknown' }),
  ];
  const before = input.map((a) => a.name);
  expect(sortByAttention(input).map((a) => a.name)).toEqual(['Chưa rõ', 'Đang làm', 'Tạm dừng', 'Đã xong']);
  expect(input.map((a) => a.name)).toEqual(before);
  expect(sortByAttention([])).toEqual([]);
});
