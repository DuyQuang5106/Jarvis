import { eq, max } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import type { Tx, DbOrTx } from '@/db/client';
import type { EntityType } from '@/db/enums';
import {
  assessments,
  blockers,
  milestones,
  notes,
  tasks,
  topics,
  type AssessmentRow,
  type BlockerRow,
  type MilestoneRow,
  type NoteRow,
  type TaskRow,
  type TopicRow,
} from '@/db/schema';
import { NotFoundError, ValidationError } from '../errors';
import {
  CreateAssessmentInput,
  CreateBlockerInput,
  CreateMilestoneInput,
  CreateNoteInput,
  CreateTaskInput,
  CreateTopicInput,
  UpdateAssessmentInput,
  UpdateBlockerInput,
  UpdateMilestoneInput,
  UpdateNoteInput,
  UpdateTaskInput,
  UpdateTopicInput,
} from '../schemas';
import { recordChange, touchArea, type WriteMeta } from './activity';

export interface EntityService<Row, CreateIn, UpdateIn> {
  create(db: DbOrTx, input: CreateIn, meta: WriteMeta): Promise<Row>;
  update(db: DbOrTx, id: string, patch: UpdateIn, meta: WriteMeta): Promise<Row>;
  remove(db: DbOrTx, id: string, meta: WriteMeta): Promise<void>;
}

type Values = Record<string, unknown>;
type AnyRow = { id: string; areaId: string | null };

/** Optional hooks for entity-specific rules. They run inside the write transaction. */
interface Hooks<Row> {
  /** Validate / derive extra column values for an insert. */
  onCreate?(tx: Tx, input: Values, now: Date): Promise<Values>;
  /** Validate / derive extra column values for a patch that changes something. */
  onUpdate?(tx: Tx, current: Row, patch: Values, now: Date): Promise<Values>;
}

function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.');
  return result.data;
}

const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

// Postgres returns `time` as HH:MM:SS while input is HH:MM, so compare the minute part only.
function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'string' && typeof b === 'string' && TIME_RE.test(a) && TIME_RE.test(b)) {
    return a.slice(0, 5) === b.slice(0, 5);
  }
  return (a ?? null) === (b ?? null);
}

function makeEntityService<
  Row extends AnyRow,
  S extends z.ZodType<Values>,
  U extends z.ZodType<Values>,
>(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: PgTable & Record<string, any>;
  entityType: EntityType;
  createSchema: S;
  updateSchema: U;
  hooks?: Hooks<Row>;
}): EntityService<Row, z.input<S>, z.input<U>> {
  const { table, entityType, createSchema, updateSchema, hooks } = opts;
  const idCol = table.id;

  async function load(tx: DbOrTx, id: string): Promise<Row> {
    const [row] = (await tx.select().from(table).where(eq(idCol, id))) as Row[];
    if (!row) throw new NotFoundError();
    return row;
  }

  return {
    async create(db, rawInput, meta) {
      const input = parseOrThrow(createSchema, rawInput);
      return db.transaction(async (tx) => {
        const now = new Date();
        const extra = hooks?.onCreate ? await hooks.onCreate(tx, input, now) : {};
        const [row] = (await tx
          .insert(table)
          .values({ ...input, ...extra, createdAt: now, updatedAt: now })
          .returning()) as Row[];
        await recordChange(tx, { areaId: row.areaId, entityType, entityId: row.id, action: 'create', after: row, ...meta });
        if (row.areaId) await touchArea(tx, row.areaId, now);
        return row;
      });
    },

    async update(db, id, rawPatch, meta) {
      const patch = parseOrThrow(updateSchema, rawPatch);
      return db.transaction(async (tx) => {
        const current = await load(tx, id);
        const changed = Object.keys(patch).some(
          (key) => patch[key] !== undefined && !sameValue(patch[key], (current as Values)[key]),
        );
        if (!changed) return current;
        const now = new Date();
        const extra = hooks?.onUpdate ? await hooks.onUpdate(tx, current, patch, now) : {};
        const [row] = (await tx
          .update(table)
          .set({ ...patch, ...extra, updatedAt: now })
          .where(eq(idCol, id))
          .returning()) as Row[];
        await recordChange(tx, {
          areaId: row.areaId,
          entityType,
          entityId: id,
          action: 'update',
          before: current,
          after: row,
          ...meta,
        });
        if (row.areaId) await touchArea(tx, row.areaId, now);
        // A note moved between areas changes both of them.
        if (current.areaId && current.areaId !== row.areaId) await touchArea(tx, current.areaId, now);
        return row;
      });
    },

    async remove(db, id, meta) {
      await db.transaction(async (tx) => {
        const current = await load(tx, id);
        await tx.delete(table).where(eq(idCol, id));
        await recordChange(tx, {
          areaId: current.areaId,
          entityType,
          entityId: id,
          action: 'delete',
          before: current,
          ...meta,
        });
        if (current.areaId) await touchArea(tx, current.areaId, new Date());
      });
    },
  };
}

async function assertMilestoneInArea(tx: Tx, milestoneId: unknown, areaId: string): Promise<void> {
  if (typeof milestoneId !== 'string') return;
  const [ms] = await tx.select({ areaId: milestones.areaId }).from(milestones).where(eq(milestones.id, milestoneId));
  if (!ms || ms.areaId !== areaId) throw new ValidationError('Milestone không thuộc mục này.');
}

export const taskService = makeEntityService<TaskRow, typeof CreateTaskInput, typeof UpdateTaskInput>({
  table: tasks,
  entityType: 'task',
  createSchema: CreateTaskInput,
  updateSchema: UpdateTaskInput,
  hooks: {
    async onCreate(tx, input) {
      await assertMilestoneInArea(tx, input.milestoneId, input.areaId as string);
      return {};
    },
    async onUpdate(tx, current, patch) {
      await assertMilestoneInArea(tx, patch.milestoneId, current.areaId);
      return {};
    },
  },
});

export const topicService = makeEntityService<TopicRow, typeof CreateTopicInput, typeof UpdateTopicInput>({
  table: topics,
  entityType: 'topic',
  createSchema: CreateTopicInput,
  updateSchema: UpdateTopicInput,
  hooks: {
    // Without an explicit sortOrder a new topic goes after the area's last one.
    async onCreate(tx, input) {
      if (input.sortOrder !== undefined) return {};
      const [{ last }] = await tx
        .select({ last: max(topics.sortOrder) })
        .from(topics)
        .where(eq(topics.areaId, input.areaId as string));
      return { sortOrder: (last ?? -1) + 1 };
    },
  },
});

export const assessmentService = makeEntityService<AssessmentRow, typeof CreateAssessmentInput, typeof UpdateAssessmentInput>({
  table: assessments,
  entityType: 'assessment',
  createSchema: CreateAssessmentInput,
  updateSchema: UpdateAssessmentInput,
});

export const milestoneService = makeEntityService<MilestoneRow, typeof CreateMilestoneInput, typeof UpdateMilestoneInput>({
  table: milestones,
  entityType: 'milestone',
  createSchema: CreateMilestoneInput,
  updateSchema: UpdateMilestoneInput,
});

export const blockerService = makeEntityService<BlockerRow, typeof CreateBlockerInput, typeof UpdateBlockerInput>({
  table: blockers,
  entityType: 'blocker',
  createSchema: CreateBlockerInput,
  updateSchema: UpdateBlockerInput,
  hooks: {
    // A patch that repeats the current status keeps the original resolvedAt.
    async onUpdate(_tx, current, patch, now) {
      if (patch.status === current.status) return {};
      if (patch.status === 'resolved') return { resolvedAt: now };
      if (patch.status === 'open') return { resolvedAt: null };
      return {};
    },
  },
});

export const noteService = makeEntityService<NoteRow, typeof CreateNoteInput, typeof UpdateNoteInput>({
  table: notes,
  entityType: 'note',
  createSchema: CreateNoteInput,
  updateSchema: UpdateNoteInput,
});

export const ENTITY_SERVICES: Record<
  'task' | 'topic' | 'assessment' | 'milestone' | 'blocker' | 'note',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  EntityService<any, any, any>
> = {
  task: taskService,
  topic: topicService,
  assessment: assessmentService,
  milestone: milestoneService,
  blocker: blockerService,
  note: noteService,
};
