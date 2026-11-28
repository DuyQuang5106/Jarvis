import { and, asc, gte, isNull, ne } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import type { MilestoneStatus, TaskStatus, TopicStatus } from '@/db/enums';
import { TOPIC_STATUSES } from '@/db/enums';
import { activityLogs, areas, assessments, blockers, milestones, tasks, topics } from '@/db/schema';
import { APP_TZ, daysUntil, todayIn } from '@/lib/dates';
import {
  areaHealth,
  emptyDelta,
  PACE_WINDOW_DAYS,
  topicMetrics,
  type Health,
  type TopicMetrics,
  type WeekDelta,
} from '@/lib/state-metrics';

/** Per-area state metrics for the Context screen (docs/context-2.md). */
export type AreaMetrics = {
  areaId: string;
  /** Academic: coverage/mastery of topics. Project: `covered` = milestones done, `masteryPoints` unused (0). */
  progress: TopicMetrics;
  health: Health | null;
  week: WeekDelta;
};

export type MetricsReport = { byArea: Record<string, AreaMetrics>; week: WeekDelta };

const DAY_MS = 86_400_000;
const rank = (s: unknown) => TOPIC_STATUSES.indexOf(s as TopicStatus);
const field = (json: unknown, key: string): unknown => (json && typeof json === 'object' ? (json as Record<string, unknown>)[key] : undefined);
/** Logs written by imports and seeding are not progress the owner made. */
const counted = (origin: string) => origin !== 'migration' && origin !== 'seed';

/**
 * Reads every open area's topics, milestones, open tasks, open blockers, upcoming exams and the activity log of
 * the last PACE_WINDOW_DAYS days, then derives the metrics with the pure functions of `state-metrics`.
 */
export async function getAreaMetrics(db: DbOrTx, now: Date, tz: string = APP_TZ): Promise<MetricsReport> {
  const today = todayIn(tz, now);
  const since = new Date(now.getTime() - PACE_WINDOW_DAYS * DAY_MS);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

  const [areaRows, topicRows, milestoneRows, taskRows, blockerRows, assessmentRows, logRows] = await Promise.all([
    db.select({ id: areas.id, kind: areas.kind, status: areas.status, deadlineDate: areas.deadlineDate }).from(areas).where(isNull(areas.archivedAt)),
    db.select({ areaId: topics.areaId, status: topics.status }).from(topics),
    db.select({ areaId: milestones.areaId, title: milestones.title, status: milestones.status, targetDate: milestones.targetDate }).from(milestones),
    db.select({ areaId: tasks.areaId, title: tasks.title, dueDate: tasks.dueDate }).from(tasks).where(ne(tasks.status, 'done' satisfies TaskStatus)),
    db.select({ areaId: blockers.areaId, title: blockers.title }).from(blockers).where(ne(blockers.status, 'resolved')),
    db.select({ areaId: assessments.areaId, title: assessments.title, dueDate: assessments.dueDate }).from(assessments),
    db
      .select({
        areaId: activityLogs.areaId,
        entityType: activityLogs.entityType,
        action: activityLogs.action,
        before: activityLogs.beforeJson,
        after: activityLogs.afterJson,
        origin: activityLogs.origin,
        createdAt: activityLogs.createdAt,
      })
      .from(activityLogs)
      .where(and(gte(activityLogs.createdAt, since))),
  ]);

  const byArea: Record<string, AreaMetrics> = {};
  const week = emptyDelta();
  for (const area of areaRows) {
    const delta = emptyDelta();
    let recentDone = 0;
    for (const log of logRows) {
      if (log.areaId !== area.id || !counted(log.origin)) continue;
      const inWeek = log.createdAt >= weekAgo;
      const before = field(log.before, 'status');
      const after = field(log.after, 'status');
      if (log.entityType === 'topic' && log.action === 'update' && rank(after) > rank(before)) {
        if (inWeek) delta.levelUps += 1;
        // Pace counts topics that went from "not studied" to studied: the remaining work is measured the same way.
        if (area.kind === 'academic' && before === 'not_started') recentDone += 1;
      }
      if (log.entityType === 'milestone' && log.action === 'update' && after === 'done' && before !== 'done') {
        if (inWeek) delta.milestonesDone += 1;
        if (area.kind === 'project') recentDone += 1;
      }
      if (inWeek && log.entityType === 'task' && log.action === 'update' && after === 'done' && before !== 'done') delta.tasksDone += 1;
      if (inWeek && (log.entityType === 'assessment' || log.entityType === 'milestone')) {
        const key = log.entityType === 'assessment' ? 'dueDate' : 'targetDate';
        const was = field(log.before, key) ?? null;
        const is = field(log.after, key) ?? null;
        if ((log.action === 'create' && is) || (log.action === 'update' && is !== was)) delta.datesChanged += 1;
      }
    }

    let progress: TopicMetrics;
    if (area.kind === 'project') {
      const own = milestoneRows.filter((m) => m.areaId === area.id);
      progress = { total: own.length, covered: own.filter((m) => m.status === ('done' satisfies MilestoneStatus)).length, masteryPoints: 0 };
    } else {
      const counts = Object.fromEntries(TOPIC_STATUSES.map((s) => [s, 0])) as Record<TopicStatus, number>;
      let any = false;
      for (const t of topicRows) {
        if (t.areaId !== area.id) continue;
        counts[t.status] += 1;
        any = true;
      }
      progress = topicMetrics(any ? counts : null);
    }

    // The most overdue open item: tasks, unfinished milestones, the area's own deadline.
    const late: { title: string; days: number }[] = [];
    for (const t of taskRows) if (t.areaId === area.id && t.dueDate && t.dueDate < today) late.push({ title: t.title, days: daysUntil(today, t.dueDate) });
    for (const m of milestoneRows) {
      if (m.areaId === area.id && m.status !== 'done' && m.targetDate && m.targetDate < today) late.push({ title: m.title, days: daysUntil(today, m.targetDate) });
    }
    if (area.deadlineDate && area.deadlineDate < today) late.push({ title: 'Hạn chót của mục', days: daysUntil(today, area.deadlineDate) });
    const overdue = late.sort((a, b) => b.days - a.days)[0] ?? null;

    // What the work is measured against: the next exam (academic); the area's deadline or the next unfinished
    // milestone date (project).
    const upcoming: { title: string; date: string }[] =
      area.kind === 'academic'
        ? assessmentRows.filter((a) => a.areaId === area.id && a.dueDate && a.dueDate >= today).map((a) => ({ title: a.title, date: a.dueDate! }))
        : [
            ...(area.deadlineDate && area.deadlineDate >= today ? [{ title: 'hạn chót', date: area.deadlineDate }] : []),
            ...milestoneRows
              .filter((m) => m.areaId === area.id && m.status !== 'done' && m.targetDate && m.targetDate >= today)
              .map((m) => ({ title: m.title, date: m.targetDate! })),
          ];
    const next = upcoming.sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;

    const health = areaHealth({
      kind: area.kind,
      status: area.status,
      total: progress.total,
      remaining: progress.total - progress.covered,
      recentDone,
      target: next ? { title: next.title, daysLeft: daysUntil(next.date, today) } : null,
      overdue,
      openBlocker: blockerRows.find((b) => b.areaId === area.id)?.title ?? null,
    });

    byArea[area.id] = { areaId: area.id, progress, health, week: delta };
    week.levelUps += delta.levelUps;
    week.tasksDone += delta.tasksDone;
    week.milestonesDone += delta.milestonesDone;
    week.datesChanged += delta.datesChanged;
  }
  return { byArea, week };
}

/** What an expanded card shows: the area's topics in order and its open tasks (soonest due first, at most 5). */
export type AreaGlance = {
  topics: { id: string; title: string; status: TopicStatus }[];
  tasks: { id: string; title: string; status: TaskStatus; dueDate: string | null; daysLeft: number | null; progressDone: number | null; progressTotal: number | null }[];
};

export const GLANCE_TASKS = 5;

export async function getAreaGlance(db: DbOrTx, now: Date, tz: string = APP_TZ): Promise<Record<string, AreaGlance>> {
  const today = todayIn(tz, now);
  const [topicRows, taskRows] = await Promise.all([
    db.select({ id: topics.id, areaId: topics.areaId, title: topics.title, status: topics.status }).from(topics).orderBy(asc(topics.sortOrder), asc(topics.createdAt)),
    db
      .select({
        id: tasks.id, areaId: tasks.areaId, title: tasks.title, status: tasks.status, dueDate: tasks.dueDate,
        progressDone: tasks.progressDone, progressTotal: tasks.progressTotal,
      })
      .from(tasks)
      .where(ne(tasks.status, 'done' satisfies TaskStatus))
      .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt)),
  ]);
  const out: Record<string, AreaGlance> = {};
  const of = (areaId: string) => (out[areaId] ??= { topics: [], tasks: [] });
  for (const { areaId, ...t } of topicRows) of(areaId).topics.push(t);
  for (const { areaId, ...t } of taskRows) of(areaId).tasks.push({ ...t, daysLeft: t.dueDate ? daysUntil(t.dueDate, today) : null });
  for (const g of Object.values(out)) {
    // Dated tasks first, soonest (overdue) first; undated ones keep their manual order.
    g.tasks = g.tasks
      .map((t, i) => ({ t, i }))
      .sort((a, b) => (a.t.daysLeft ?? Infinity) - (b.t.daysLeft ?? Infinity) || a.i - b.i)
      .slice(0, GLANCE_TASKS)
      .map(({ t }) => t);
  }
  return out;
}
