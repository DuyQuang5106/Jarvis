import { and, desc, eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import type {
  AreaKind,
  BlockerStatus,
  DeadlineType,
  MilestoneStatus,
  Origin,
  TaskStatus,
  TopicStatus,
} from '@/db/enums';
import { activityLogs, areas, notes, type ActivityLogRow } from '@/db/schema';
import { daysUntil } from '@/lib/dates';
import { getAreaDetails, type AreaDetails } from '../queries/area-details';
import { describeLog } from '../queries/describe-log';
import { getPortfolioSnapshot, type AreaSummary, type PortfolioSnapshot } from '../queries/snapshot';
import { truncateState } from './context-truncate';
import { matchAreas } from './match-areas';

export type ContextScope = { mode: 'auto' | 'all' | 'academic' | 'projects' | 'item'; areaId?: string };
export type ContextRef = { areaId: string; name: string; kind: AreaKind; updatedAt: string };
export type AreaDetailForAi = {
  areaId: string; name: string; kind: AreaKind; summary: string | null; goal: string | null;
  startDate: string | null; deadlineDate: string | null;
  academic: { term: string | null; credits: number | null; targetGrade: string | null; gradingScheme: string | null; examFormat: string | null; courseOutline: string | null } | null;
  project: { role: string | null; collaborators: string | null; scope: string | null; cadence: string | null } | null;
  topics: { id: string; title: string; status: TopicStatus; evidence: string | null }[];
  assessments: { id: string; title: string; dueDate: string | null; daysLeft: number | null; weight: number | null; score: number | null; maxScore: number | null }[];
  milestones: { id: string; title: string; status: MilestoneStatus; targetDate: string | null; acceptanceCriteria: string | null }[];
  blockers: { id: string; title: string; status: BlockerStatus; lastAttempt: string | null; nextAction: string | null; externalDependency: string | null }[];
  tasks: { id: string; title: string; status: TaskStatus; dueDate: string | null; daysLeft: number | null; deadlineType: DeadlineType; estimateMinutes: number | null; blockedReason: string | null; milestoneId: string | null }[];
  notes: { id: string; text: string; updatedAt: string }[];
  recentLogs: { at: string; origin: Origin; title: string; changes: { field: string; before: string | null; after: string | null; summary?: string }[] }[];
};
export type WorkspaceState = {
  now: { date: string; weekday: string; weekStart: string; weekEnd: string; timezone: string };
  termGoal: string | null;
  areas: Omit<AreaSummary, 'aiExcluded'>[];
  dueTasks: PortfolioSnapshot['dueTasks'];
  upcomingAssessments: PortfolioSnapshot['upcomingAssessments'];
  staleAreaIds: string[];
  details: AreaDetailForAi[];
};
export type BuiltContext = { state: WorkspaceState; json: string; refs: ContextRef[]; summaryCount: number; truncated: boolean };

export const DEFAULT_MAX_CHARS = 32000;
const NOTE_LIMIT = 10;
const LOG_LIMIT = 20;
/** Logs loaded per area before privacy filtering, so dropped note logs rarely leave fewer than LOG_LIMIT. */
const LOG_FETCH = 50;
const RECENT_USER_MESSAGES = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** JSON for the prompt; `<` is escaped so user text cannot close or open a prompt tag. */
export function serializeState(state: WorkspaceState): string {
  return JSON.stringify(state).replace(/</g, '\\u003c');
}

const eligible = (a: AreaSummary) => !a.aiExcluded && a.status !== 'completed' && a.status !== 'on_hold';

/** Ids of areas to expand, in detail order. Never returns an aiExcluded area. */
async function selectAreaIds(
  db: DbOrTx,
  scope: ContextScope,
  open: AreaSummary[],
  all: AreaSummary[],
  texts: string[],
): Promise<string[]> {
  switch (scope.mode) {
    case 'item': {
      const id = scope.areaId;
      if (!id || !UUID.test(id)) return [];
      const known = all.find((a) => a.id === id);
      if (known) return known.aiExcluded ? [] : [id];
      // Not in the snapshot: archived or missing. Check privacy before loading anything.
      const [row] = await db.select({ aiExcluded: areas.aiExcluded }).from(areas).where(eq(areas.id, id));
      return row && !row.aiExcluded ? [id] : [];
    }
    case 'academic':
      return open.filter((a) => eligible(a) && a.kind === 'academic').map((a) => a.id);
    case 'projects':
      return open.filter((a) => eligible(a) && a.kind === 'project').map((a) => a.id);
    case 'all':
      return open.filter(eligible).map((a) => a.id);
    case 'auto':
      return matchAreas(texts, open);
  }
}

const snap = (j: unknown): Record<string, unknown> =>
  j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : {};

/**
 * Note ids whose logs must not reach the model: the note is aiExcluded now, or the newest
 * snapshot of its latest log says so (covers deleted notes). One query for all loaded logs.
 */
async function privateNoteIds(db: DbOrTx, logs: ActivityLogRow[]): Promise<Set<string>> {
  const ids = [...new Set(logs.filter((l) => l.entityType === 'note').map((l) => l.entityId))];
  if (ids.length === 0) return new Set();
  const rows = await db
    .selectDistinctOn([activityLogs.entityId], {
      entityId: activityLogs.entityId,
      beforeJson: activityLogs.beforeJson,
      afterJson: activityLogs.afterJson,
      noteExcluded: notes.aiExcluded,
    })
    .from(activityLogs)
    .leftJoin(notes, eq(notes.id, activityLogs.entityId))
    .where(and(eq(activityLogs.entityType, 'note'), inArray(activityLogs.entityId, ids)))
    .orderBy(activityLogs.entityId, desc(activityLogs.createdAt), desc(activityLogs.id));
  const out = new Set<string>();
  for (const r of rows) {
    if (r.noteExcluded === true || snap(r.afterJson ?? r.beforeJson).aiExcluded === true) out.add(r.entityId);
  }
  return out;
}

function isHiddenLog(log: ActivityLogRow, hidden: Set<string>): boolean {
  if (log.entityType !== 'note') return false;
  return hidden.has(log.entityId) || [log.beforeJson, log.afterJson].some((j) => snap(j).aiExcluded === true);
}

function toDetail(d: AreaDetails, today: string, hidden: Set<string>): AreaDetailForAi {
  const { area, academic: ac, project: pr } = d;
  const left = (date: string | null) => (date ? daysUntil(date, today) : null);
  return {
    areaId: area.id,
    name: area.name,
    kind: area.kind,
    summary: area.summary,
    goal: area.goal,
    startDate: area.startDate,
    deadlineDate: area.deadlineDate,
    academic:
      area.kind === 'academic' && ac
        ? { term: ac.term, credits: ac.credits, targetGrade: ac.targetGrade, gradingScheme: ac.gradingScheme, examFormat: ac.examFormat, courseOutline: ac.courseOutline }
        : null,
    project:
      area.kind === 'project' && pr
        ? { role: pr.role, collaborators: pr.collaborators, scope: pr.scope, cadence: pr.cadence }
        : null,
    topics: d.topics.map((t) => ({ id: t.id, title: t.title, status: t.status, evidence: t.evidence })),
    assessments: d.assessments.map((x) => ({
      id: x.id, title: x.title, dueDate: x.dueDate, daysLeft: left(x.dueDate), weight: x.weight, score: x.score, maxScore: x.maxScore,
    })),
    milestones: d.milestones.map((m) => ({
      id: m.id, title: m.title, status: m.status, targetDate: m.targetDate, acceptanceCriteria: m.acceptanceCriteria,
    })),
    blockers: d.blockers.map((b) => ({
      id: b.id, title: b.title, status: b.status, lastAttempt: b.lastAttempt, nextAction: b.nextAction, externalDependency: b.externalDependency,
    })),
    tasks: d.tasks
      .filter((t) => t.status !== 'done')
      .map((t) => ({
        id: t.id, title: t.title, status: t.status, dueDate: t.dueDate, daysLeft: left(t.dueDate), deadlineType: t.deadlineType,
        estimateMinutes: t.estimateMinutes, blockedReason: t.blockedReason, milestoneId: t.milestoneId,
      })),
    notes: d.notes
      .filter((n) => !n.aiExcluded)
      .slice(0, NOTE_LIMIT)
      .map((n) => ({ id: n.id, text: n.text, updatedAt: n.updatedAt.toISOString() })),
    recentLogs: d.logs
      .filter((l) => !isHiddenLog(l, hidden))
      .slice(0, LOG_LIMIT)
      .map((l) => ({ at: l.createdAt.toISOString(), origin: l.origin, ...describeLog(l) })),
  };
}

/** Every aiExcluded area, archived ones included: what the chat history must not re-send. */
export async function listAiExcludedAreas(db: DbOrTx): Promise<{ id: string; name: string; aliases: string[] }[]> {
  return db.select({ id: areas.id, name: areas.name, aliases: areas.aliases }).from(areas).where(eq(areas.aiExcluded, true));
}

export async function buildContext(
  db: DbOrTx,
  input: { message: string; recentUserMessages: string[]; scope: ContextScope; now: Date; maxChars?: number },
): Promise<BuiltContext> {
  const maxChars = input.maxChars ?? DEFAULT_MAX_CHARS;
  const snapshot = await getPortfolioSnapshot(db, input.now);
  const excluded = new Set(snapshot.areas.filter((a) => a.aiExcluded).map((a) => a.id));
  const open = snapshot.areas.filter((a) => !a.aiExcluded);

  const texts = [input.message, ...input.recentUserMessages.slice(-RECENT_USER_MESSAGES)];
  const ids = await selectAreaIds(db, input.scope, open, snapshot.areas, texts);
  const loaded = (await Promise.all(ids.map((id) => getAreaDetails(db, id, { logLimit: LOG_FETCH })))).filter(
    // Re-check privacy on the row actually loaded.
    (d): d is AreaDetails => d !== null && !d.area.aiExcluded,
  );
  const hidden = await privateNoteIds(db, loaded.flatMap((d) => d.logs));

  const full: WorkspaceState = {
    now: {
      date: snapshot.today,
      weekday: snapshot.weekday,
      weekStart: snapshot.week.start,
      weekEnd: snapshot.week.end,
      timezone: snapshot.timezone,
    },
    termGoal: snapshot.termGoal,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip the privacy flag
    areas: open.map(({ aiExcluded, ...rest }) => rest),
    dueTasks: snapshot.dueTasks.filter((t) => !excluded.has(t.areaId)),
    upcomingAssessments: snapshot.upcomingAssessments.filter((x) => !excluded.has(x.areaId)),
    staleAreaIds: snapshot.staleAreaIds.filter((id) => !excluded.has(id)),
    details: loaded.map((d) => toDetail(d, snapshot.today, hidden)),
  };

  const { state, truncated } = truncateState(full, (s) => serializeState(s).length <= maxChars);
  const byId = new Map(loaded.map((d) => [d.area.id, d.area]));
  const refs = state.details.map((d): ContextRef => {
    const area = byId.get(d.areaId)!;
    return { areaId: area.id, name: area.name, kind: area.kind, updatedAt: area.updatedAt.toISOString() };
  });
  return { state, json: serializeState(state), refs, summaryCount: state.areas.length, truncated };
}
