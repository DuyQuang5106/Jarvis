import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTx, Tx } from '@/db/client';
import { academicDetails, areas, projectDetails, type AreaRow } from '@/db/schema';
import { NotFoundError, ValidationError } from '../errors';
import { CreateAreaInput, UpdateAreaInput } from '../schemas';
import { recordChange, touchArea, type WriteMeta } from './activity';

type Values = Record<string, unknown>;
type Kind = AreaRow['kind'];

const ProgressText = z
  .string({ error: 'Nội dung tiến độ phải là chuỗi.' })
  .min(1, { error: 'Nội dung tiến độ không được để trống.' })
  .max(2000, { error: 'Nội dung tiến độ tối đa 2000 ký tự.' });

function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.');
  return result.data;
}

const WRONG_KIND = 'Trường không hợp với loại mục.';

function detailsTable(kind: Kind) {
  return kind === 'academic' ? academicDetails : projectDetails;
}

/** Splits parsed input into area columns and the details patch, rejecting details of the wrong kind. */
function split(kind: Kind, input: Values): { areaValues: Values; details: Values } {
  const { academic, project, ...areaValues } = input;
  const other = kind === 'academic' ? project : academic;
  if (other !== undefined) throw new ValidationError(WRONG_KIND);
  const own = (kind === 'academic' ? academic : project) as Values | undefined;
  return { areaValues, details: own ?? {} };
}

async function loadDetails(tx: DbOrTx, area: AreaRow): Promise<Values | undefined> {
  const table = detailsTable(area.kind);
  const [row] = await tx.select().from(table).where(eq(table.areaId, area.id));
  return row as Values | undefined;
}

async function loadArea(tx: DbOrTx, id: string): Promise<AreaRow> {
  const [row] = await tx.select().from(areas).where(eq(areas.id, id));
  if (!row) throw new NotFoundError();
  return row;
}

const snapshot = (area: AreaRow, details: Values | undefined) => ({ ...area, details: { ...details } });

function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return (a ?? null) === (b ?? null);
}

const differs = (patch: Values, current: Values | undefined) =>
  Object.keys(patch).some((k) => patch[k] !== undefined && !same(patch[k], current?.[k]));

const definedOnly = (v: Values): Values => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined));

export async function createArea(db: DbOrTx, rawInput: CreateAreaInput, meta: WriteMeta): Promise<AreaRow> {
  const input = parseOrThrow(CreateAreaInput, rawInput);
  const { kind } = input;
  const { areaValues, details } = split(kind, input);
  return db.transaction(async (tx: Tx) => {
    const now = new Date();
    const [area] = await tx
      .insert(areas)
      .values({ ...(areaValues as typeof areas.$inferInsert), createdAt: now, updatedAt: now })
      .returning();
    const table = detailsTable(kind);
    const [row] = await tx
      .insert(table)
      .values({ ...definedOnly(details), areaId: area.id })
      .returning();
    await recordChange(tx, {
      areaId: area.id,
      entityType: 'area',
      entityId: area.id,
      action: 'create',
      after: snapshot(area, row as Values),
      ...meta,
    });
    return area;
  });
}

export async function updateArea(db: DbOrTx, id: string, rawPatch: UpdateAreaInput, meta: WriteMeta): Promise<AreaRow> {
  const parsed = parseOrThrow(UpdateAreaInput, rawPatch);
  return db.transaction(async (tx: Tx) => {
    const current = await loadArea(tx, id);
    const { areaValues, details } = split(current.kind, parsed);
    const currentDetails = await loadDetails(tx, current);
    const detailsChanged = differs(details, currentDetails);
    if (!differs(areaValues, current as Values) && !detailsChanged) return current;

    const now = new Date();
    const table = detailsTable(current.kind);
    let nextDetails = currentDetails;
    if (detailsChanged) {
      const detailPatch = definedOnly(details);
      const rows = currentDetails
        ? await tx.update(table).set(detailPatch).where(eq(table.areaId, id)).returning()
        : await tx.insert(table).values({ ...detailPatch, areaId: id }).returning();
      nextDetails = rows[0] as Values;
    }
    const [area] = await tx
      .update(areas)
      .set({ ...definedOnly(areaValues), updatedAt: now })
      .where(eq(areas.id, id))
      .returning();
    await recordChange(tx, {
      areaId: id,
      entityType: 'area',
      entityId: id,
      action: 'update',
      before: snapshot(current, currentDetails),
      after: snapshot(area, nextDetails),
      ...meta,
    });
    return area;
  });
}

async function setArchived(db: DbOrTx, id: string, archive: boolean, meta: WriteMeta): Promise<void> {
  await db.transaction(async (tx: Tx) => {
    const current = await loadArea(tx, id);
    if ((current.archivedAt !== null) === archive) return;
    const now = new Date();
    const [area] = await tx
      .update(areas)
      .set({ archivedAt: archive ? now : null, updatedAt: now })
      .where(eq(areas.id, id))
      .returning();
    const details = await loadDetails(tx, current);
    await recordChange(tx, {
      areaId: id,
      entityType: 'area',
      entityId: id,
      action: 'archive',
      before: snapshot(current, details),
      after: snapshot(area, details),
      ...meta,
    });
  });
}

export const archiveArea = (db: DbOrTx, id: string, meta: WriteMeta) => setArchived(db, id, true, meta);
export const unarchiveArea = (db: DbOrTx, id: string, meta: WriteMeta) => setArchived(db, id, false, meta);

export async function addProgressLog(db: DbOrTx, areaId: string, rawText: string, meta: WriteMeta): Promise<void> {
  const text = parseOrThrow(ProgressText, rawText);
  await db.transaction(async (tx: Tx) => {
    await loadArea(tx, areaId);
    await recordChange(tx, {
      areaId,
      entityType: 'area',
      entityId: areaId,
      action: 'progress',
      after: { text },
      ...meta,
    });
    await touchArea(tx, areaId, new Date());
  });
}
