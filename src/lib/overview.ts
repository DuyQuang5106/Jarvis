import type { AreaGlance, AreaMetrics } from '@/server/queries/area-metrics';
import type { PortfolioSnapshot } from '@/server/queries/snapshot';

type AreaLike = { id: string; name: string; nextAction: string | null; nearestDate: { daysLeft: number } | null };

/** "Cần chú ý": areas off track, then at risk; within each, the nearest date first. */
export function attentionAreas<T extends AreaLike>(areas: T[], metrics: Record<string, AreaMetrics>): T[] {
  const rank = (id: string) => (metrics[id]?.health?.level === 'off_track' ? 0 : 1);
  return areas
    .filter((a) => ['off_track', 'at_risk'].includes(metrics[a.id]?.health?.level ?? ''))
    .sort((a, b) => rank(a.id) - rank(b.id) || (a.nearestDate?.daysLeft ?? Infinity) - (b.nearestDate?.daysLeft ?? Infinity));
}

/** "Nên làm bây giờ": the most pressing area's next action (else its first open task), with the health reason. */
export function focusItem(attention: AreaLike[], metrics: Record<string, AreaMetrics>, glance: Record<string, AreaGlance>) {
  const a = attention[0];
  const health = a ? metrics[a.id]?.health : null;
  if (!a || !health) return null;
  return { areaId: a.id, areaName: a.name, action: a.nextAction?.trim() || glance[a.id]?.tasks[0]?.title || null, reason: health.reason };
}

/** Exams and open tasks due within 7 days (overdue included), soonest first, named with their area. */
export function upcomingWeek(snapshot: Pick<PortfolioSnapshot, 'areas' | 'upcomingAssessments' | 'dueTasks'>) {
  const areaName = new Map(snapshot.areas.map((a) => [a.id, a.name]));
  return [
    ...snapshot.upcomingAssessments.filter((a) => a.daysLeft <= 7).map((a) => ({ key: `a-${a.id}`, title: a.title, areaId: a.areaId, daysLeft: a.daysLeft })),
    ...snapshot.dueTasks.filter((t) => t.daysLeft <= 7 && t.status !== 'done').map((t) => ({ key: `t-${t.id}`, title: t.title, areaId: t.areaId, daysLeft: t.daysLeft })),
  ]
    .filter((u) => areaName.has(u.areaId))
    .map(({ areaId, ...u }) => ({ ...u, areaName: areaName.get(areaId)! }))
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
