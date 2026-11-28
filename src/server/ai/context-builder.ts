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
import { getExcludedFolderIds } from '../queries/folders';
import { describeLog } from '../queries/describe-log';
import { getPortfolioSnapshot, pickStaleAreaIds, type AreaSummary, type PortfolioSnapshot } from '../queries/snapshot';
import { getConfig } from '../config';
import { getSettings } from '../services/settings';
import { selectDocumentContext, type DocumentContext } from './document-context';
import { hiddenDocumentIds, hiddenMigratedNoteIds } from './document-visibility';
import { truncateState } from './context-truncate';
import { matchAreas, normalizeVi } from './match-areas';

export type ContextScope = { mode: 'auto' | 'all' | 'academic' | 'projects' | 'item'; areaId?: string };
export type ContextRef = { areaId: string; name: string; kind: AreaKind; updatedAt: string; documentId?: string };
export type AreaDetailForAi = {
  areaId: string; name: string; kind: AreaKind; summary: string | null; goal: string | null;
  startDate: string | null; deadlineDate: string | null;
  academic: { term: string | null; credits: number | null; targetGrade: string | null; gradingScheme: string | null; examFormat: string | null; courseOutline: string | null } | null;
  project: { role: string | null; collaborators: string | null; scope: string | null; cadence: string | null } | null;
  topics: { id: string; title: string; status: TopicStatus; evidence: string | null }[];
  assessments: { id: string; title: string; tentative: boolean; dueDate: string | null; daysLeft: number | null; weight: number | null; score: number | null; maxScore: number | null }[];
  milestones: { id: string; title: string; status: MilestoneStatus; targetDate: string | null; acceptanceCriteria: string | null }[];
  blockers: { id: string; title: string; status: BlockerStatus; lastAttempt: string | null; nextAction: string | null; externalDependency: string | null }[];
  tasks: { id: string; title: string; status: TaskStatus; dueDate: string | null; daysLeft: number | null; deadlineType: DeadlineType; estimateMinutes: number | null; blockedReason: string | null; milestoneId: string | null; progressDone: number | null; progressTotal: number | null }[];
  notes: { id: string; text: string; updatedAt: string }[];
  recentLogs: { at: string; origin: Origin; title: string; changes: { field: string; before: string | null; after: string | null; summary?: string }[] }[];
};
export type WorkspaceState = {
  now: { date: string; time: string; weekday: string; weekStart: string; weekEnd: string; timezone: string };
  termGoal: string | null;
  areas: Omit<AreaSummary, 'aiExcluded' | 'nearestDate'>[];
  dueTasks: PortfolioSnapshot['dueTasks'];
  upcomingAssessments: PortfolioSnapshot['upcomingAssessments'];
  staleAreaIds: string[];
  details: AreaDetailForAi[];
  documents?: DocumentContext[];
};
export type BuiltContext = { state: WorkspaceState; json: string; refs: ContextRef[]; summaryCount: number; truncated: boolean };

const NOTE_LIMIT = 10;
const LOG_LIMIT = 8;
/** Logs loaded per area before privacy and noise filtering, so dropped logs rarely leave fewer than LOG_LIMIT. */
const LOG_FETCH = 100;
/** Share of the budget left after Tier 1 that documents may use; the rest is for `details`. */
const DOCUMENT_SHARE = 0.7;
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
    case 'auto': {
      const matched = matchAreas(texts, open);
      if (normalizeVi(texts[0] ?? '') !== 'cap nhat nhanh') return matched;
      const stale = pickStaleAreaIds(open);
      return [...new Set([...matched, ...stale])];
    }
  }
}

const snap = (j: unknown): Record<string, unknown> =>
  j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : {};

/**
 * Note ids whose logs must not reach the model: the note is aiExcluded now or lives in an aiExcluded
 * area now, or (deleted notes) the newest snapshot of its latest log says either. One query for all loaded logs.
 */
async function privateNoteIds(db: DbOrTx, logs: ActivityLogRow[], excludedAreas: Set<string>): Promise<Set<string>> {
  const ids = [...new Set(logs.filter((l) => l.entityType === 'note').map((l) => l.entityId))];
  if (ids.length === 0) return new Set();
  const rows = await db
    .selectDistinctOn([activityLogs.entityId], {
      entityId: activityLogs.entityId,
      beforeJson: activityLogs.beforeJson,
      afterJson: activityLogs.afterJson,
      noteExcluded: notes.aiExcluded,
      noteId: notes.id,
      areaExcluded: areas.aiExcluded,
    })
    .from(activityLogs)
    .leftJoin(notes, eq(notes.id, activityLogs.entityId))
    .leftJoin(areas, eq(areas.id, notes.areaId))
    .where(and(eq(activityLogs.entityType, 'note'), inArray(activityLogs.entityId, ids)))
    .orderBy(activityLogs.entityId, desc(activityLogs.createdAt), desc(activityLogs.id));
  const out = new Set<string>();
  for (const r of rows) {
    const last = snap(r.afterJson ?? r.beforeJson);
    const deletedInExcludedArea = r.noteId === null && typeof last.areaId === 'string' && excludedAreas.has(last.areaId);
    if (r.noteExcluded === true || r.areaExcluded === true || last.aiExcluded === true || deletedInExcludedArea) out.add(r.entityId);
  }
  return out;
}

function isHiddenLog(log: ActivityLogRow, hidden: Set<string>, excludedFolders: Set<string>): boolean {
  if (log.entityType === 'folder') return true;
  if (log.entityType !== 'note' && log.entityType !== 'document') return false;
  return hidden.has(log.entityId) || [log.beforeJson, log.afterJson].some((j) => {
    const row = snap(j);
    return row.aiExcluded === true || row.docRole === 'instruction' ||
      (typeof row.folderId === 'string' && excludedFolders.has(row.folderId));
  });
}

/** Import and seed logs, and "document created" logs, say nothing about the work itself. */
const isNoiseLog = (log: ActivityLogRow) =>
  log.origin === 'migration' || log.origin === 'seed' || (log.entityType === 'document' && log.action === 'create');

function toDetail(d: AreaDetails, today: string, hidden: Set<string>, excludedFolders: Set<string>): AreaDetailForAi {
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
      id: x.id, title: x.title, tentative: x.tentative, dueDate: x.dueDate, daysLeft: left(x.dueDate), weight: x.weight, score: x.score, maxScore: x.maxScore,
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
        progressDone: t.progressDone, progressTotal: t.progressTotal,
      })),
    notes: d.notes
      .filter((n) => !n.aiExcluded && !hidden.has(n.id))
      .slice(0, NOTE_LIMIT)
      .map((n) => ({ id: n.id, text: n.text, updatedAt: n.updatedAt.toISOString() })),
    recentLogs: d.logs
      .filter((l) => !isNoiseLog(l) && !isHiddenLog(l, hidden, excludedFolders))
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
  const maxChars = input.maxChars ?? getConfig().aiContextMaxChars;
  const snapshot = await getPortfolioSnapshot(db, input.now);
  const excluded = new Set(snapshot.areas.filter((a) => a.aiExcluded).map((a) => a.id));
  const open = snapshot.areas.filter((a) => !a.aiExcluded);

  const texts = [input.message, ...input.recentUserMessages.slice(-RECENT_USER_MESSAGES)];
  const ids = await selectAreaIds(db, input.scope, open, snapshot.areas, texts);
  const loaded = (await Promise.all(ids.map((id) => getAreaDetails(db, id, { logLimit: LOG_FETCH })))).filter(
    // Re-check privacy on the row actually loaded.
    (d): d is AreaDetails => d !== null && !d.area.aiExcluded,
  );
  const logs = loaded.flatMap((d) => d.logs);
  const [hiddenNotes, hiddenDocuments, hiddenMigrated, excludedFolders] = await Promise.all([
    privateNoteIds(db, logs, excluded),
    hiddenDocumentIds(db, logs.filter((log) => log.entityType === 'document').map((log) => log.entityId)),
    hiddenMigratedNoteIds(db, [...logs.filter((log) => log.entityType === 'note').map((log) => log.entityId),
      ...loaded.flatMap((detail) => detail.notes.map((note) => note.id))]),
    getExcludedFolderIds(db),
  ]);
  const hidden = new Set([...hiddenNotes, ...hiddenDocuments, ...hiddenMigrated]);

  const full: WorkspaceState = {
    now: {
      date: snapshot.today,
      // HH:MM in the app timezone, for "nhắc tôi tối nay" and "còn mấy tiếng".
      time: new Intl.DateTimeFormat('en-GB', { timeZone: snapshot.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(input.now),
      weekday: snapshot.weekday,
      weekStart: snapshot.week.start,
      weekEnd: snapshot.week.end,
      timezone: snapshot.timezone,
    },
    termGoal: snapshot.termGoal,
    // `nearestDate` is for the Context list; the model already gets dueTasks, upcomingAssessments and details.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip the privacy flag and the UI-only field
    areas: open.map(({ aiExcluded, nearestDate, ...rest }) => rest),
    dueTasks: snapshot.dueTasks.filter((t) => !excluded.has(t.areaId)),
    upcomingAssessments: snapshot.upcomingAssessments.filter((x) => !excluded.has(x.areaId)),
    staleAreaIds: pickStaleAreaIds(open),
    details: loaded.map((d) => toDetail(d, snapshot.today, hidden, excludedFolders)),
  };

  const tierOneSize = serializeState({ ...full, details: [] }).length;
  const settings = await getSettings(db);
  const selectedAreaIds = loaded.map((detail) => detail.area.id);
  const docContext = await selectDocumentContext(db, {
    areaIds: selectedAreaIds.length || input.scope.mode !== 'auto' ? selectedAreaIds : undefined,
    focusAreaIds: input.scope.mode === 'auto' ? matchAreas([input.message], open) : undefined,
    query: texts.join(' '), today: snapshot.today, timezone: snapshot.timezone, staleAfterDays: settings.staleAfterDays,
    // 14 = `,"documents":` plus the array brackets' slack.
    budget: Math.floor((maxChars - tierOneSize - 14) * DOCUMENT_SHARE),
  });
  if (docContext.documents.length) full.documents = docContext.documents;
  const { state, truncated } = truncateState(full, (s) => serializeState(s).length <= maxChars);
  const byId = new Map(loaded.map((d) => [d.area.id, d.area]));
  const refs = state.details.map((d): ContextRef => {
    const area = byId.get(d.areaId)!;
    return { areaId: area.id, name: area.name, kind: area.kind, updatedAt: area.updatedAt.toISOString() };
  });
  // Truncation may have dropped documents or reduced them to `omitted`: cite only what is still read.
  const read = new Set((state.documents ?? []).filter((doc) => doc.content !== undefined || doc.excerpts?.length).map((doc) => doc.documentId));
  const docRefs = docContext.refs.filter((ref) => read.has(ref.documentId));
  return {
    state, json: serializeState(state), refs: [...refs, ...docRefs], summaryCount: state.areas.length,
    truncated: truncated || docContext.truncated,
  };
}
