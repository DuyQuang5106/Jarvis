import type { AreaKind, AreaStatus, TopicStatus } from '@/db/enums';

/**
 * State metrics of an area (docs/context-2.md): everything comes from records Jarvis already keeps, nothing is
 * typed in for the sake of a number. Pure functions; the server query feeds them.
 */

/** Days the "recent pace" looks back on. */
export const PACE_WINDOW_DAYS = 14;

/**
 * Academic areas. Coverage: topics studied at all (Đã học and up). Mastery: Vững counts 1, Đã luyện ½: two
 * different questions, so two numbers and never one blended percentage.
 */
export type TopicMetrics = { total: number; covered: number; masteryPoints: number };

export function topicMetrics(counts: Record<TopicStatus, number> | null): TopicMetrics {
  if (!counts) return { total: 0, covered: 0, masteryPoints: 0 };
  const total = counts.not_started + counts.familiar + counts.practiced + counts.confident;
  return {
    total,
    covered: counts.familiar + counts.practiced + counts.confident,
    masteryPoints: counts.confident + counts.practiced / 2,
  };
}

/** `2,5` / `3`: Vietnamese decimal comma, at most one decimal. */
export function formatPoints(n: number): string {
  return (Math.round(n * 10) / 10).toString().replace('.', ',');
}

/** `Học 4/7 · Thành thạo 2,5/7`, or null when there is nothing to count ("Chưa xác định" is the caller's). */
export function topicLabel(m: TopicMetrics): string | null {
  if (m.total === 0) return null;
  return `Học ${m.covered}/${m.total} · Thành thạo ${formatPoints(m.masteryPoints)}/${m.total}`;
}

export type HealthLevel = 'on_track' | 'at_risk' | 'off_track' | 'unknown';
export type Health = { level: HealthLevel; reason: string };

export const HEALTH_LABEL: Record<HealthLevel, string> = {
  on_track: 'Đúng hướng',
  at_risk: 'Có rủi ro',
  off_track: 'Lệch hướng',
  unknown: 'Chưa đủ dữ liệu',
};

export type HealthInput = {
  kind: AreaKind;
  status: AreaStatus;
  /** Topics (academic) or milestones (project) in scope. */
  total: number;
  /** Not studied yet (academic) or not done (project). */
  remaining: number;
  /** Units that moved to studied/done during the last PACE_WINDOW_DAYS days. */
  recentDone: number;
  /** The date the work is measured against: next exam (academic), deadline or milestone date (project). */
  target: { title: string; daysLeft: number } | null;
  /** The most overdue open item (task, milestone, the area's own deadline). */
  overdue: { title: string; days: number } | null;
  openBlocker: string | null;
};

const unitOf = (kind: AreaKind) => (kind === 'project' ? 'milestone' : 'topic');
const perWeek = (n: number) => formatPoints(n);

/**
 * Health answers "am I on course?", which progress alone does not: 30% can be fine five weeks before an exam
 * and a problem five days before. Every verdict carries one sentence with the numbers it rests on. Null for an
 * area that is finished or paused (no course to be on).
 */
export function areaHealth(input: HealthInput): Health | null {
  const { kind, status, total, remaining, recentDone, target, overdue, openBlocker } = input;
  if (status === 'completed' || status === 'on_hold') return null;
  const unit = unitOf(kind);
  if (openBlocker) return { level: 'off_track', reason: `Đang vướng: ${openBlocker}.` };
  if (status === 'blocked') return { level: 'off_track', reason: 'Mục đang ở trạng thái bị chặn.' };
  if (overdue) return { level: 'off_track', reason: `"${overdue.title}" quá hạn ${overdue.days} ngày.` };
  if (total === 0) return { level: 'unknown', reason: `Chưa có danh sách ${unit} nên chưa tính được.` };
  if (remaining === 0) {
    return { level: 'on_track', reason: kind === 'project' ? `Đã xong cả ${total} milestone.` : `Đã học hết ${total} topic.` };
  }
  const left = kind === 'project' ? `Còn ${remaining}/${total} milestone` : `Còn ${remaining}/${total} topic chưa học`;
  if (!target) return { level: 'unknown', reason: `${left}; chưa có mốc thời gian (lịch thi hay hạn) để so.` };
  const days = Math.max(target.daysLeft, 0);
  const when = days === 0 ? `${target.title} là hôm nay` : `${days} ngày tới ${target.title}`;
  const weekly = (recentDone / PACE_WINDOW_DAYS) * 7;
  if (recentDone === 0) {
    if (days <= PACE_WINDOW_DAYS) {
      return { level: 'at_risk', reason: `${left}, ${when}; ${PACE_WINDOW_DAYS} ngày qua chưa xong thêm ${unit} nào.` };
    }
    return { level: 'unknown', reason: `${left}, ${when}; ${PACE_WINDOW_DAYS} ngày qua chưa có tiến độ để ước nhịp.` };
  }
  const neededPerWeek = days === 0 ? Infinity : (remaining / days) * 7;
  if (weekly >= neededPerWeek) {
    return { level: 'on_track', reason: `${left}, ${when}; nhịp ~${perWeek(weekly)} ${unit}/tuần là kịp.` };
  }
  const need = Number.isFinite(neededPerWeek) ? ` (cần ~${perWeek(neededPerWeek)}/tuần)` : '';
  return { level: 'at_risk', reason: `${left}, ${when}; nhịp ~${perWeek(weekly)} ${unit}/tuần chưa kịp${need}.` };
}

/** "Thay đổi tuần này": counted from the activity log of the last 7 days. */
export type WeekDelta = { levelUps: number; tasksDone: number; milestonesDone: number; datesChanged: number };

export const emptyDelta = (): WeekDelta => ({ levelUps: 0, tasksDone: 0, milestonesDone: 0, datesChanged: 0 });

/** `+2 topic lên mức · 3 task xong · 1 mốc mới/đổi`, or null when nothing changed. */
export function deltaLabel(d: WeekDelta): string | null {
  const parts = [
    d.levelUps > 0 ? `+${d.levelUps} topic lên mức` : null,
    d.tasksDone > 0 ? `${d.tasksDone} task xong` : null,
    d.milestonesDone > 0 ? `${d.milestonesDone} milestone xong` : null,
    d.datesChanged > 0 ? `${d.datesChanged} mốc mới/đổi` : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** A countable task (`3/10 buổi`): both numbers or neither. */
export function countLabel(done: number | null, total: number | null): string | null {
  return done !== null && total !== null && total > 0 ? `${Math.min(done, total)}/${total}` : null;
}
