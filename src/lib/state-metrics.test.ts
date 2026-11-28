import { expect, test } from 'vitest';
import { areaHealth, countLabel, deltaLabel, emptyDelta, formatPoints, topicLabel, topicMetrics, type HealthInput } from './state-metrics';

const base: HealthInput = {
  kind: 'academic',
  status: 'active',
  total: 7,
  remaining: 3,
  recentDone: 2,
  target: { title: 'Giữa kỳ', daysLeft: 6 },
  overdue: null,
  openBlocker: null,
};

test('bao phủ và thành thạo tách riêng; đã luyện tính nửa', () => {
  const m = topicMetrics({ not_started: 3, familiar: 1, practiced: 1, confident: 2 });
  expect(m).toEqual({ total: 7, covered: 4, masteryPoints: 2.5 });
  expect(topicLabel(m)).toBe('Học 4/7 · Thành thạo 2,5/7');
  expect(topicLabel(topicMetrics(null))).toBeNull();
  expect(formatPoints(3)).toBe('3');
  expect(formatPoints(1 / 3)).toBe('0,3');
});

test('sức khỏe: kịp, chưa kịp, có câu lý do kèm số', () => {
  // 2 in 14 days = 1/week; 3 left in 6 days needs 3,5/week.
  expect(areaHealth(base)).toEqual({ level: 'at_risk', reason: 'Còn 3/7 topic chưa học, 6 ngày tới Giữa kỳ; nhịp ~1 topic/tuần chưa kịp (cần ~3,5/tuần).' });
  const roomy = areaHealth({ ...base, target: { title: 'Cuối kỳ', daysLeft: 46 } });
  expect(roomy).toEqual({ level: 'on_track', reason: 'Còn 3/7 topic chưa học, 46 ngày tới Cuối kỳ; nhịp ~1 topic/tuần là kịp.' });
});

test('sức khỏe: không tiến độ gần đây → rủi ro khi sát mốc, chưa đủ dữ liệu khi còn xa', () => {
  expect(areaHealth({ ...base, recentDone: 0 })?.level).toBe('at_risk');
  expect(areaHealth({ ...base, recentDone: 0, target: { title: 'Cuối kỳ', daysLeft: 60 } })?.level).toBe('unknown');
});

test('sức khỏe: quá hạn, vướng mắc, bị chặn → lệch hướng, ưu tiên vướng mắc', () => {
  expect(areaHealth({ ...base, overdue: { title: 'Bài tập chương 5', days: 2 } })).toEqual({ level: 'off_track', reason: '"Bài tập chương 5" quá hạn 2 ngày.' });
  expect(areaHealth({ ...base, overdue: { title: 'X', days: 1 }, openBlocker: 'Chờ thầy gửi đề' })?.reason).toBe('Đang vướng: Chờ thầy gửi đề.');
  expect(areaHealth({ ...base, status: 'blocked' })?.level).toBe('off_track');
});

test('sức khỏe: thiếu danh sách hay thiếu mốc → chưa đủ dữ liệu; đã học hết → đúng hướng', () => {
  expect(areaHealth({ ...base, total: 0, remaining: 0 })).toEqual({ level: 'unknown', reason: 'Chưa có danh sách topic nên chưa tính được.' });
  expect(areaHealth({ ...base, target: null })?.level).toBe('unknown');
  expect(areaHealth({ ...base, remaining: 0 })).toEqual({ level: 'on_track', reason: 'Đã học hết 7 topic.' });
});

test('sức khỏe: dự án đếm milestone; mục đã xong hay tạm dừng không có sức khỏe', () => {
  const p = areaHealth({ ...base, kind: 'project', total: 5, remaining: 2, recentDone: 2, target: { title: 'Demo', daysLeft: 20 } });
  expect(p).toEqual({ level: 'on_track', reason: 'Còn 2/5 milestone, 20 ngày tới Demo; nhịp ~1 milestone/tuần là kịp.' });
  expect(areaHealth({ ...base, status: 'completed' })).toBeNull();
  expect(areaHealth({ ...base, status: 'on_hold' })).toBeNull();
});

test('sức khỏe: mốc là hôm nay', () => {
  expect(areaHealth({ ...base, target: { title: 'Giữa kỳ', daysLeft: 0 } })?.reason).toBe('Còn 3/7 topic chưa học, Giữa kỳ là hôm nay; nhịp ~1 topic/tuần chưa kịp.');
});

test('thay đổi tuần này và task đếm được', () => {
  expect(deltaLabel(emptyDelta())).toBeNull();
  expect(deltaLabel({ levelUps: 2, tasksDone: 3, milestonesDone: 0, datesChanged: 1 })).toBe('+2 topic lên mức · 3 task xong · 1 mốc mới/đổi');
  expect(countLabel(3, 10)).toBe('3/10');
  expect(countLabel(12, 10)).toBe('10/10');
  expect(countLabel(null, 10)).toBeNull();
  expect(countLabel(0, 0)).toBeNull();
});
