import type { AreaKind, MilestoneStatus, TopicStatus } from '@/db/enums';
import type { AreaSummary, NearestDate } from '@/server/queries/snapshot';

/** Progress of one area as a count with its denominator; `total` 0 means there is nothing to measure yet. */
export type AreaProgress = { unit: 'topic' | 'milestone'; done: number; total: number };

const sum = (counts: Record<string, number>) => Object.values(counts).reduce((s, n) => s + n, 0);

/** Topics count as "vững" from Practiced up (same rule as the Topics tab); milestones count when Done. */
export function progressFromCounts(
  kind: AreaKind,
  counts: { topics: Record<TopicStatus, number> | null; milestones: Record<MilestoneStatus, number> | null },
): AreaProgress {
  if (kind === 'project') {
    const m = counts.milestones;
    return { unit: 'milestone', done: m?.done ?? 0, total: m ? sum(m) : 0 };
  }
  const t = counts.topics;
  return { unit: 'topic', done: t ? t.practiced + t.confident : 0, total: t ? sum(t) : 0 };
}

export const areaProgress = (a: Pick<AreaSummary, 'kind' | 'counts'>): AreaProgress => progressFromCounts(a.kind, a.counts);

/** `3/8 topic vững`: always the count over its denominator, never a percentage. Null when there is nothing to count. */
export function progressLabel(p: AreaProgress): string | null {
  if (p.total === 0) return null;
  return `${p.done}/${p.total} ${p.unit === 'topic' ? 'topic vững' : 'milestone xong'}`;
}

/** Shown instead of a bar when the denominator is 0. */
export const emptyProgressHint = (unit: AreaProgress['unit']): string => (unit === 'topic' ? 'Chưa có topic' : 'Chưa có milestone');

/** `Thi sau 12 ngày`, `Hạn hôm nay`, `Quá hạn 2 ngày`. `daysLeft` comes from the server (app timezone). */
export function countdownText(n: Pick<NearestDate, 'kind' | 'daysLeft'>): string {
  const d = n.daysLeft;
  if (d < 0) return `Quá hạn ${-d} ngày`;
  const what = n.kind === 'assessment' ? 'Thi' : 'Hạn';
  if (d === 0) return `${what} hôm nay`;
  if (d === 1) return `${what} ngày mai`;
  return `${what} sau ${d} ngày`;
}

/** `Cập nhật 3 ngày trước` from whole calendar days in the app timezone. */
export function updatedText(daysSinceUpdate: number): string {
  if (daysSinceUpdate <= 0) return 'Cập nhật hôm nay';
  if (daysSinceUpdate === 1) return 'Cập nhật hôm qua';
  return `Cập nhật ${daysSinceUpdate} ngày trước`;
}

type AttentionFields = Pick<AreaSummary, 'id' | 'name' | 'status' | 'nearestDate' | 'daysSinceUpdate'>;

const closed = (a: AttentionFields) => a.status === 'completed' || a.status === 'on_hold';

/**
 * "Cần chú ý" order: open areas before completed/on-hold ones; then the nearest date first (overdue ones are
 * the nearest, areas without a date come last); then the longest without an update; then name and id, so the
 * order is the same on every render.
 */
export function sortByAttention<T extends AttentionFields>(areas: readonly T[]): T[] {
  return [...areas].sort(
    (a, b) =>
      Number(closed(a)) - Number(closed(b)) ||
      (a.nearestDate?.daysLeft ?? Infinity) - (b.nearestDate?.daysLeft ?? Infinity) ||
      b.daysSinceUpdate - a.daysSinceUpdate ||
      a.name.localeCompare(b.name, 'vi') ||
      a.id.localeCompare(b.id),
  );
}

export type AreaSort = 'attention' | 'priority';
export const AREA_SORT_LABEL: Record<AreaSort, string> = { attention: 'Cần chú ý', priority: 'Ưu tiên' };
