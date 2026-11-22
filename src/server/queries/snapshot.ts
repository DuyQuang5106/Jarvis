import { asc, desc, eq, isNull, ne } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import type {
  AreaKind,
  AreaStatus,
  DeadlineType,
  MilestoneStatus,
  Origin,
  Priority,
  TaskStatus,
  TopicStatus,
} from '@/db/enums';
import { MILESTONE_STATUSES, TOPIC_STATUSES } from '@/db/enums';
import { activityLogs, areas, assessments, blockers, milestones, tasks, topics } from '@/db/schema';
import { daysSince, daysUntil, todayIn, weekdayVi, weekRange } from '@/lib/dates';
import { getSettings } from '../services/settings';

export type MissingFlag = 'status_unknown' | 'no_next_action' | 'no_topics' | 'no_assessment_date' | 'no_milestones';

export type AreaSummary = {
  id: string;
  kind: AreaKind;
  name: string;
  aliases: string[];
  status: AreaStatus;
  priority: Priority;
  nextAction: string | null;
  deadlineDate: string | null;
  deadlineDaysLeft: number | null;
  updatedAt: string; // ISO
  daysSinceUpdate: number;
  isStale: boolean;
  lastOrigin: Origin | null; // origin của log gần nhất thuộc area
  aiExcluded: boolean;
  counts: {
    topics: Record<TopicStatus, number> | null;
    milestones: Record<MilestoneStatus, number> | null;
    openTasks: number;
  };
  openBlockers: { id: string; title: string }[];
  missing: MissingFlag[];
};

export type PortfolioSnapshot = {
  today: string;
  weekday: string;
  week: { start: string; end: string };
  timezone: string;
  termGoal: string | null;
  areas: AreaSummary[];
  dueTasks: {
    id: string;
    areaId: string;
    title: string;
    status: TaskStatus;
    dueDate: string;
    daysLeft: number;
    deadlineType: DeadlineType;
  }[];
  upcomingAssessments: {
    id: string;
    areaId: string;
    title: string;
    dueDate: string;
    daysLeft: number;
    weight: number | null;
  }[];
  staleAreaIds: string[];
};

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
const TASK_WINDOW_DAYS = 14;
const ASSESSMENT_WINDOW_DAYS = 21;
const MAX_STALE = 3;

/** The open areas longest without an update (at most MAX_STALE), longest first. */
export function pickStaleAreaIds(summaries: AreaSummary[]): string[] {
  return summaries
    .filter((s) => s.status !== 'completed' && s.status !== 'on_hold')
    .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate || a.name.localeCompare(b.name, 'vi'))
    .slice(0, MAX_STALE)
    .map((s) => s.id);
}

function group<T extends { areaId: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const list = map.get(r.areaId);
    if (list) list.push(r);
    else map.set(r.areaId, [r]);
  }
  return map;
}

function countBy<K extends string>(keys: readonly K[], values: K[]): Record<K, number> {
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  for (const v of values) out[v] += 1;
  return out;
}

const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title, 'vi');

/** Số truy vấn cố định (getSettings + 7 truy vấn song song), không phụ thuộc số area. */
export async function getPortfolioSnapshot(db: DbOrTx, now: Date): Promise<PortfolioSnapshot> {
  const settings = await getSettings(db);
  const tz = settings.timezone;
  const today = todayIn(tz, now);

  const [areaRows, topicRows, milestoneRows, blockerRows, taskRows, assessmentRows, logRows] = await Promise.all([
    db.select().from(areas).where(isNull(areas.archivedAt)),
    db.select({ areaId: topics.areaId, status: topics.status }).from(topics),
    db.select({ areaId: milestones.areaId, status: milestones.status }).from(milestones),
    db
      .select({ id: blockers.id, areaId: blockers.areaId, title: blockers.title })
      .from(blockers)
      .where(eq(blockers.status, 'open'))
      .orderBy(asc(blockers.createdAt), asc(blockers.id)),
    db.select().from(tasks).where(ne(tasks.status, 'done')),
    db.select().from(assessments),
    db
      .selectDistinctOn([activityLogs.areaId], { areaId: activityLogs.areaId, origin: activityLogs.origin })
      .from(activityLogs)
      .orderBy(activityLogs.areaId, desc(activityLogs.createdAt), desc(activityLogs.id)),
  ]);

  const topicsBy = group(topicRows);
  const milestonesBy = group(milestoneRows);
  const blockersBy = group(blockerRows);
  const tasksBy = group(taskRows);
  const assessmentsBy = group(assessmentRows);
  const originBy = new Map<string, Origin>();
  for (const l of logRows) if (l.areaId) originBy.set(l.areaId, l.origin);

  const summaries = areaRows.map((a): AreaSummary => {
    const daysSinceUpdate = daysSince(a.updatedAt, today, tz);
    const areaTopics = topicsBy.get(a.id) ?? [];
    const areaMilestones = milestonesBy.get(a.id) ?? [];
    const areaAssessments = assessmentsBy.get(a.id) ?? [];
    const missing: MissingFlag[] = [];
    if (a.status === 'unknown') missing.push('status_unknown');
    if (a.status === 'active' && !a.nextAction?.trim()) missing.push('no_next_action');
    if (a.kind === 'academic') {
      if (areaTopics.length === 0) missing.push('no_topics');
      if (!areaAssessments.some((x) => x.dueDate)) missing.push('no_assessment_date');
    } else if (areaMilestones.length === 0) {
      missing.push('no_milestones');
    }
    return {
      id: a.id,
      kind: a.kind,
      name: a.name,
      aliases: a.aliases,
      status: a.status,
      priority: a.priority,
      nextAction: a.nextAction,
      deadlineDate: a.deadlineDate,
      deadlineDaysLeft: a.deadlineDate ? daysUntil(a.deadlineDate, today) : null,
      updatedAt: a.updatedAt.toISOString(),
      daysSinceUpdate,
      isStale: (a.status === 'active' || a.status === 'blocked') && daysSinceUpdate > settings.staleAfterDays,
      lastOrigin: originBy.get(a.id) ?? null,
      aiExcluded: a.aiExcluded,
      counts: {
        topics: a.kind === 'academic' ? countBy(TOPIC_STATUSES, areaTopics.map((t) => t.status)) : null,
        milestones: a.kind === 'project' ? countBy(MILESTONE_STATUSES, areaMilestones.map((m) => m.status)) : null,
        openTasks: (tasksBy.get(a.id) ?? []).length,
      },
      openBlockers: (blockersBy.get(a.id) ?? []).map(({ id, title }) => ({ id, title })),
      missing,
    };
  });

  summaries.sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.name.localeCompare(b.name, 'vi'),
  );

  const activeIds = new Set(summaries.map((s) => s.id));

  const dueTasks = taskRows
    .filter((t) => t.dueDate && activeIds.has(t.areaId))
    .map((t) => ({
      id: t.id,
      areaId: t.areaId,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate as string,
      daysLeft: daysUntil(t.dueDate as string, today),
      deadlineType: t.deadlineType,
    }))
    .filter((t) => t.daysLeft <= TASK_WINDOW_DAYS)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || byTitle(a, b));

  const upcomingAssessments = assessmentRows
    .filter((x) => x.dueDate && activeIds.has(x.areaId))
    .map((x) => ({
      id: x.id,
      areaId: x.areaId,
      title: x.title,
      dueDate: x.dueDate as string,
      daysLeft: daysUntil(x.dueDate as string, today),
      weight: x.weight,
    }))
    .filter((x) => x.daysLeft >= 0 && x.daysLeft <= ASSESSMENT_WINDOW_DAYS)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || byTitle(a, b));

  const staleAreaIds = pickStaleAreaIds(summaries);

  return {
    today,
    weekday: weekdayVi(today),
    week: weekRange(today),
    timezone: tz,
    termGoal: settings.termGoal,
    areas: summaries,
    dueTasks,
    upcomingAssessments,
    staleAreaIds,
  };
}
