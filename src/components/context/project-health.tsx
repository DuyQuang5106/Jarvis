import { daysUntil, formatDateVi } from '@/lib/dates';
import type { MilestoneRow } from '@/db/schema';
import type { AreaSummary } from '@/server/queries/snapshot';

/** The sooner of the area deadline and the earliest unfinished milestone target date. */
function nearestDeadline(summary: AreaSummary, milestones: MilestoneRow[], today: string): string {
  const dates = [
    ...(summary.deadlineDate ? [summary.deadlineDate] : []),
    ...milestones.flatMap((m) => (m.status !== 'done' && m.targetDate ? [m.targetDate] : [])),
  ].sort();
  const first = dates[0];
  if (!first) return 'chưa có';
  const left = daysUntil(first, today);
  return `${formatDateVi(first)} · ${left < 0 ? `quá ${-left} ngày` : `còn ${left} ngày`}`;
}

/** Four plain facts about a project; deliberately no score. */
export function ProjectHealth({
  summary,
  milestones,
  today,
}: {
  summary: AreaSummary;
  milestones: MilestoneRow[];
  today: string;
}) {
  const late = milestones.filter((m) => m.status !== 'done' && m.targetDate && daysUntil(m.targetDate, today) < 0).length;
  const lines = [
    `Deadline gần nhất: ${nearestDeadline(summary, milestones, today)}`,
    `Milestone trễ: ${late}`,
    `Blocker đang mở: ${summary.openBlockers.length}`,
    `Cập nhật cách đây: ${summary.daysSinceUpdate} ngày`,
  ];
  return (
    <section aria-label="Project health" className="mb-4 space-y-1 rounded-lg border bg-card p-3">
      <h3 className="text-sm font-medium">Project health</h3>
      <div className="space-y-0.5 text-sm text-muted-foreground">
        {lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
    </section>
  );
}
