import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { activityLogs, areas, documents } from '@/db/schema';
import type { AreaKind, DocRole, Origin } from '@/db/enums';
import { daysUntil, todayIn } from '@/lib/dates';
import { clip } from './context-truncate';
import { splitFrontmatter } from './frontmatter';
import { visibleDocumentConditions } from './document-visibility';
import { normalizeVi } from './match-areas';
import { readMarkdownLines } from './markdown-source';

const CHUNK_SIZE = 850;
const MAX_CANDIDATES = 48;
const SEPARATOR = /\r?\n/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*$/;
export const DOCUMENT_CONTEXT_MAX = 12_800;

type Chunk = { heading_path: string[]; ordinal: number; text: string };

export function splitDocument(input: string, markdown: boolean): Chunk[] {
  const text = markdown ? splitFrontmatter(input).body : input;
  const chunks: Chunk[] = [];
  const headings: { level: number; title: string }[] = [];
  let pending = '';
  let headingEnd = 0;
  function flush() {
    if (pending.trim()) chunks.push({ heading_path: headings.map((item) => item.title), ordinal: chunks.length, text: pending.trim() });
    pending = '';
  }
  const lines = markdown ? readMarkdownLines(text) : text.split(SEPARATOR).map((line) => ({
    text: line, start: 0, end: 0, fenced: false, heading: undefined,
  }));
  for (const source of lines) {
    if (source.start < headingEnd) continue;
    const line = source.text;
    if (source.heading) {
      flush();
      const { label, level, end } = source.heading;
      while (headings.length && headings[headings.length - 1].level >= level) headings.pop();
      headings.push({ level, title: label });
      pending = text.slice(source.start, end).trimEnd();
      headingEnd = end;
      continue;
    }
    if ((!line.trim() && !source.fenced) || pending.length + line.length + 1 > CHUNK_SIZE) flush();
    let remaining = line;
    while (remaining.length > CHUNK_SIZE) {
      const cut = clip(remaining, CHUNK_SIZE).slice(0, -1);
      pending = cut;
      flush();
      remaining = remaining.slice(cut.length);
    }
    if (remaining) pending = pending ? pending + '\n' + remaining : remaining;
  }
  flush();
  return chunks;
}

type Source = {
  documentId: string;
  areaId: string;
  areaKind: AreaKind;
  title: string;
  docRole: DocRole;
  updatedAt: Date;
  origin: Origin;
  active: boolean;
  chunks: Chunk[];
};

export type DocumentContext = {
  documentId: string;
  areaId: string;
  title: string;
  docRole: DocRole;
  updated_at: string;
  days_since_update: number;
  possibly_stale: boolean;
  origin: Origin;
  outline?: string[][];
  excerpts: Chunk[];
};

const STOP_WORDS = new Set('cho toi minh hay va la cua co gi nay do nao nhu khong ve voi the tu trong ban bao cac mon hoc dang can the nao tuan'.split(' '));

async function loadSources(db: DbOrTx, options: { areaIds?: string[]; query?: string; includeCore?: boolean }): Promise<Source[]> {
  if (options.areaIds?.length === 0) return [];
  const queryTokens = [...new Set(normalizeVi(options.query ?? '').split(' ').filter((token) => token.length > 1 && !STOP_WORDS.has(token)))].slice(0, 32);
  const conditions = await visibleDocumentConditions(db);
  if (options.areaIds) conditions.push(inArray(documents.areaId, options.areaIds));
  else conditions.push(isNull(areas.archivedAt));
  if (!queryTokens.length && !options.includeCore) return [];
  const tsQuery = queryTokens.length ? sql`to_tsquery('simple', ${queryTokens.map((token) => token + ':*').join(' | ')})` : null;
  const match = tsQuery ? sql`${documents.searchTsv} @@ ${tsQuery}` : sql`false::boolean`;
  const core = options.includeCore ? sql`${documents.docRole} = 'context'` : sql`false::boolean`;
  conditions.push(sql`(${core} or ${match})`);
  const rank = tsQuery ? sql`ts_rank_cd(${documents.searchTsv}, ${tsQuery})` : sql`0::integer`;
  const rows = await db.select({
    documentId: documents.id, areaId: documents.areaId, areaKind: areas.kind,
    title: documents.title, docRole: documents.docRole, updatedAt: documents.updatedAt,
    bodyMd: documents.bodyMd, extractedText: documents.extractedText, fileExt: documents.fileExt,
    active: sql<boolean>`${areas.status} = 'active'`,
    origin: sql<Origin>`coalesce((select ${activityLogs.origin} from ${activityLogs}
      where ${activityLogs.entityType} = 'document' and ${activityLogs.entityId} = ${documents.id}
      order by ${activityLogs.createdAt} desc, ${activityLogs.id} desc limit 1), 'manual')`,
  }).from(documents).innerJoin(areas, eq(areas.id, documents.areaId)).where(and(...conditions))
    .orderBy(desc(rank), desc(core), desc(sql`${areas.status} = 'active'`), desc(documents.updatedAt), asc(documents.id))
    .limit(MAX_CANDIDATES);

  return rows.map(({ bodyMd, extractedText, fileExt, ...row }) => {
    const body = splitDocument(bodyMd, fileExt === 'md');
    const extracted = extractedText && extractedText !== bodyMd ? splitDocument(extractedText, false) : [];
    const chunks = body.concat(extracted.map((chunk) => ({ ...chunk, ordinal: chunk.ordinal + body.length })));
    return { ...row, chunks };
  });
}

async function rankChunks(db: DbOrTx, query: string, sources: Source[], limit: number) {
  const tokens = [...new Set(normalizeVi(query).split(' ').filter((token) => token.length > 1 && !STOP_WORDS.has(token)))].slice(0, 32);
  if (!tokens.length) return [];
  const terms = tokens.map((token) => token + ':*').join(' | ');
  const byId = new Map(sources.map((source) => [source.documentId, source]));
  const candidates = sources.flatMap((source) => source.chunks.flatMap((chunk) => {
    const normalized = normalizeVi([chunk.ordinal === 0 ? source.title : '', ...chunk.heading_path, chunk.text].join(' '));
    if (!tokens.some((token) => normalized.startsWith(token) || normalized.includes(' ' + token))) return [];
    return [{ id: source.documentId, ordinal: chunk.ordinal, normalized, active: source.active, core: source.docRole === 'context', updated: source.updatedAt.toISOString() }];
  }));
  if (!candidates.length) return [];
  const items = sql`jsonb_to_recordset(${JSON.stringify(candidates)}::jsonb)
      as item(id text, ordinal int, normalized text, active bool, core bool, updated text)
    cross join to_tsquery('simple', ${terms}) as q`;
  const vector = sql`to_tsvector('simple', item.normalized)`;
  const rows = await db.select({ id: sql<string>`item.id`, ordinal: sql<number>`item.ordinal` })
    .from(items).where(sql`${vector} @@ q`)
    .orderBy(sql`ts_rank_cd(${vector}, q) desc, item.active desc, item.core desc, item.updated desc, item.id, item.ordinal`)
    .limit(limit);
  return rows.flatMap(({ id, ordinal }) => {
    const source = byId.get(id);
    const chunk = source?.chunks[ordinal];
    return source && chunk ? [{ source, chunk }] : [];
  });
}

export async function searchContext(db: DbOrTx, query: string, options: { areaIds?: string[]; limit?: number } = {}) {
  const sources = await loadSources(db, { query, areaIds: options.areaIds });
  return (await rankChunks(db, query, sources, options.limit ?? 12)).map(({ source, chunk }) => ({
    documentId: source.documentId, areaId: source.areaId, title: source.title,
    updated_at: source.updatedAt.toISOString(), origin: source.origin, ...chunk,
  }));
}

export async function selectDocumentContext(db: DbOrTx, options: {
  areaIds?: string[]; query: string; today: string; timezone: string; staleAfterDays: number; budget: number;
}) {
  const entries = new Map<string, DocumentContext>();
  const refs = new Map<string, { areaId: string; documentId: string; name: string; kind: AreaKind; updatedAt: string }>();
  if (options.budget <= 0) return { documents: [], refs: [], truncated: false };
  const sources = await loadSources(db, { areaIds: options.areaIds, query: options.query, includeCore: !!options.areaIds?.length });
  let truncated = false;

  function add(source: Source, chunks: Chunk[], outline?: string[][]) {
    const existing = entries.get(source.documentId);
    const days = Math.max(0, -daysUntil(todayIn(options.timezone, source.updatedAt), options.today));
    const updatedAt = source.updatedAt.toISOString();
    const next: DocumentContext = existing ?? {
      documentId: source.documentId, areaId: source.areaId, title: source.title, docRole: source.docRole,
      updated_at: updatedAt, days_since_update: days, origin: source.origin,
      possibly_stale: days > options.staleAfterDays, excerpts: [], ...(outline ? { outline } : {}),
    };
    const excerpts = [...next.excerpts, ...chunks.filter((chunk) => !next.excerpts.some((selected) => selected.ordinal === chunk.ordinal))];
    entries.set(source.documentId, { ...next, excerpts });
    if (JSON.stringify([...entries.values()]).replace(/</g, '\\u003c').length > options.budget) {
      if (existing) entries.set(source.documentId, existing);
      else entries.delete(source.documentId);
      truncated = true;
      return;
    }
    refs.set(source.documentId, { areaId: source.areaId, documentId: source.documentId, name: source.title, kind: source.areaKind, updatedAt });
  }

  const ranked = await rankChunks(db, options.query, sources, 16);
  for (const source of sources.filter((item) => item.docRole === 'context' && options.areaIds).slice(0, 6)) {
    const outline = [...new Map(source.chunks.filter((chunk) => chunk.heading_path.length)
      .map((chunk) => [JSON.stringify(chunk.heading_path), chunk.heading_path.map((heading) => clip(heading, 110))])).values()].slice(0, 12);
    const best = ranked.find((entry) => entry.source.documentId === source.documentId)?.chunk;
    const firstBodyChunk = source.chunks.find((chunk) => !HEADING.test(chunk.text) || chunk.text.includes('\n'));
    const selected = best ?? firstBodyChunk ?? source.chunks[0];
    add(source, selected ? [selected] : [], outline);
  }
  for (const { source, chunk } of ranked) add(source, [chunk]);
  return { documents: [...entries.values()], refs: [...refs.values()], truncated };
}
