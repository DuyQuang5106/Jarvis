import { and, desc, eq, gte, inArray, isNull, lt, notInArray, or } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { CHECKIN_MESSAGE } from '@/lib/checkin-message';
import { WEEKLY_REVIEW_MESSAGE } from '@/lib/weekly-review-message';
import { activityLogs, areas, documents, messages, pendingActions } from '@/db/schema';
import { clip } from '../ai/clip';
import { listAiExcludedAreas } from '../ai/context-builder';
import { visibleDocumentConditions } from '../ai/document-visibility';
import { matchAreas } from '../ai/match-areas';
import { PRIVATE_DOC, PRIVATE_NOTE, describeLog, entityName } from '../queries/describe-log';

/** What happened in a slot, as the check-in summary reads it. */
export type ActivityItem = {
  at: Date;
  kind: 'message' | 'log' | 'document' | 'proposal';
  /** Area name, when the item belongs to one. */
  area: string | null;
  text: string;
};

export const ACTIVITY_LIMIT = 30;
export const ACTIVITY_TEXT_MAX = 200;

/** Limits of one read: per kind of item and in all (the latest are kept). Defaults: the check-in's. */
export type ActivityOptions = {
  limits?: Partial<Record<ActivityItem['kind'], number>>;
  total?: number;
  /** Keep the messages the check-in card sent (the weekly review reads them as check-in answers). */
  keepCheckinMessages?: boolean;
};

const one = (s: string) => clip(s.replace(/\s+/g, ' ').trim(), ACTIVITY_TEXT_MAX);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const refAreaIds = (metadata: unknown): string[] => {
  const refs = (metadata as { contextRefs?: unknown } | null)?.contextRefs;
  return Array.isArray(refs)
    ? refs.map((r) => (r as Record<string, unknown>)?.areaId).filter((id): id is string => typeof id === 'string' && UUID.test(id))
    : [];
};

function logText(log: typeof activityLogs.$inferSelect): string {
  if (log.action === 'progress') {
    const text = (log.afterJson as { text?: unknown } | null)?.text;
    return `Ghi nhận tiến độ: ${typeof text === 'string' ? text : ''}`;
  }
  const d = describeLog(log);
  const changes = d.changes
    .slice(0, 2)
    .map((c) => (c.summary ? `${c.field} ${c.summary}` : c.before === null ? `${c.field}: ${c.after ?? ''}` : `${c.field}: ${c.before} → ${c.after ?? ''}`))
    .join('; ');
  return changes ? `${d.title} (${changes})` : d.title;
}

/**
 * What the user did in `[start, end)`: their chat messages, record changes (not migration or seed), documents
 * edited and proposals approved. Anything tied to an area or document hidden from the AI is left out, since
 * the only reader is the AI. By default at most {@link ACTIVITY_LIMIT} items (the latest; see {@link ActivityOptions}), oldest first, each cut
 * to {@link ACTIVITY_TEXT_MAX} characters. A fixed number of queries, whatever the amount of activity.
 */
export async function slotActivity(
  db: DbOrTx,
  start: Date,
  end: Date,
  opts: ActivityOptions = {},
): Promise<{ items: ActivityItem[]; hasActivity: boolean }> {
  const limit = (kind: ActivityItem['kind']) => opts.limits?.[kind] ?? ACTIVITY_LIMIT;
  const total = opts.total ?? ACTIVITY_LIMIT;
  const [excluded, docConditions] = await Promise.all([listAiExcludedAreas(db), visibleDocumentConditions(db)]);
  const excludedIds = excluded.map((a) => a.id);
  const [msgRows, logRows, docRows, proposalRows] = await Promise.all([
    db
      .select({ at: messages.createdAt, content: messages.content, metadata: messages.metadata })
      .from(messages)
      .where(and(eq(messages.role, 'user'), gte(messages.createdAt, start), lt(messages.createdAt, end)))
      .orderBy(desc(messages.createdAt))
      .limit(limit('message')),
    db
      .select({ log: activityLogs, area: areas.name })
      .from(activityLogs)
      .leftJoin(areas, eq(areas.id, activityLogs.areaId))
      .where(
        and(
          gte(activityLogs.createdAt, start),
          lt(activityLogs.createdAt, end),
          notInArray(activityLogs.origin, ['migration', 'seed']),
          // Documents are listed from their own table below (one line per document, not per save).
          notInArray(activityLogs.entityType, ['document', 'folder']),
          or(isNull(activityLogs.areaId), eq(areas.aiExcluded, false)),
        ),
      )
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit('log')),
    db
      .select({ at: documents.updatedAt, title: documents.title, area: areas.name })
      .from(documents)
      .innerJoin(areas, eq(areas.id, documents.areaId))
      .where(and(gte(documents.updatedAt, start), lt(documents.updatedAt, end), ...docConditions))
      .orderBy(desc(documents.updatedAt))
      .limit(limit('document')),
    db
      .select({ at: pendingActions.resolvedAt, payload: pendingActions.actionsJson })
      .from(pendingActions)
      .where(
        and(
          inArray(pendingActions.status, ['applied', 'partially_applied']),
          gte(pendingActions.resolvedAt, start),
          lt(pendingActions.resolvedAt, end),
        ),
      )
      .orderBy(desc(pendingActions.resolvedAt))
      .limit(limit('proposal')),
  ]);

  const items: ActivityItem[] = [];
  for (const m of msgRows) {
    // The weekly review's own command is no work; the check-in card's messages report an earlier slot.
    if (WEEKLY_REVIEW_MESSAGE.test(m.content) || (!opts.keepCheckinMessages && CHECKIN_MESSAGE.test(m.content))) continue;
    if (refAreaIds(m.metadata).some((id) => excludedIds.includes(id)) || matchAreas([m.content], excluded).length > 0) continue;
    items.push({ at: m.at, kind: 'message', area: null, text: one(m.content) });
  }
  for (const { log, area } of logRows) {
    const name = entityName(log);
    if (name === PRIVATE_NOTE || name === PRIVATE_DOC) continue;
    items.push({ at: log.createdAt, kind: 'log', area, text: one(logText(log)) });
  }
  for (const d of docRows) items.push({ at: d.at, kind: 'document', area: d.area, text: one(`Sửa tài liệu “${d.title}”`) });
  for (const p of proposalRows) {
    const summary = (p.payload as { summary?: unknown } | null)?.summary;
    items.push({ at: p.at!, kind: 'proposal', area: null, text: one(`Duyệt đề xuất: ${typeof summary === 'string' ? summary : ''}`) });
  }

  const latest = items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, total).reverse();
  return { items: latest, hasActivity: latest.length > 0 };
}
