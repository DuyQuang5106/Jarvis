import { and, asc, desc, eq, inArray, isNull, ne, notInArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { activityLogs, areas, documents } from '@/db/schema';
import type { AreaKind, AreaStatus, DocRole, Origin, Priority } from '@/db/enums';
import { daysUntil, todayIn } from '@/lib/dates';
import { clip } from './clip';
import { splitFrontmatter } from './frontmatter';
import { visibleDocumentConditions } from './document-visibility';
import { normalizeVi } from './match-areas';
import { readMarkdownLines } from './markdown-source';

const CHUNK_SIZE = 850;
const MAX_CANDIDATES = 48;
const SEPARATOR = /\r?\n/;
/** A core document that does not fit whole is retried as its first CLIPPED_CORE characters. */
const CLIPPED_CORE = 4000;
/** Portfolio questions: the floor for an evenly clipped state document. */
const MIN_PORTFOLIO_SHARE = 1500;
/** Share of the document budget the portfolio state documents may use whole. */
const PORTFOLIO_CORE_SHARE = 0.6;
const FOCUSED_EXCERPTS = 8;
const PORTFOLIO_EXCERPTS = 6;
const OUTLINE_HEADINGS = 12;
const OUTLINE_LABEL = 110;
/** Enough of the body to read any frontmatter (60 lines) when only picking the state document. */
const HEAD_CHARS = 6000;

export type Chunk = { heading_path: string[]; ordinal: number; text: string };

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

/** Up to 12 distinct heading paths of a Markdown text (frontmatter ignored), each heading clipped. */
export function documentOutline(text: string): string[][] {
  const paths = new Map<string, string[]>();
  for (const chunk of splitDocument(text, true)) {
    if (!chunk.heading_path.length) continue;
    paths.set(JSON.stringify(chunk.heading_path), chunk.heading_path.map((heading) => clip(heading, OUTLINE_LABEL)));
  }
  return [...paths.values()].slice(0, OUTLINE_HEADINGS);
}

const TITLE_RULES: [RegExp, number][] = [
  [/\b(state|trang thai|tien ?do|progress)\b/, 0],
  [/\b(timeline|lich)\b/, 1],
  [/\b(log|nhat ky)\b/, 2],
  [/\b(context|tong quan)\b/, 3],
  [/\b(map|de cuong)\b/, 4],
  [/\b(missing|thieu)\b/, 5],
  [/\b(audit|source)\b/, 7],
];
const TYPE_RULES: [RegExp, number][] = [
  [/state|progress/, 0],
  [/timeline|schedule|calendar/, 1],
  [/log$/, 2],
  [/context|overview/, 3],
  [/map|syllabus|outline/, 4],
  [/missing/, 5],
  [/audit/, 7],
];

/**
 * Reading order of an area's core documents: 0 state → 1 timeline → 2 log → 3 context → 4 course map →
 * 5 missing information → 6 other → 7 source audit. Uses the frontmatter `document_type` when present,
 * otherwise the accent-stripped title. Ties are broken by {@link compareCore}.
 */
export function corePriority(doc: { title: string; docType?: string; updatedAt: Date }): number {
  const [value, rules] = doc.docType ? [doc.docType.toLowerCase(), TYPE_RULES] : [normalizeVi(doc.title), TITLE_RULES];
  return rules.find(([pattern]) => pattern.test(value))?.[1] ?? 6;
}

export function compareCore(
  a: { title: string; docType?: string; updatedAt: Date; documentId: string },
  b: { title: string; docType?: string; updatedAt: Date; documentId: string },
): number {
  return corePriority(a) - corePriority(b) || b.updatedAt.getTime() - a.updatedAt.getTime() ||
    (a.documentId < b.documentId ? -1 : a.documentId > b.documentId ? 1 : 0);
}

type Meta = {
  documentId: string;
  areaId: string;
  areaKind: AreaKind;
  title: string;
  docRole: DocRole;
  updatedAt: Date;
  origin: Origin;
};
type Source = Meta & { active: boolean; chunks: Chunk[] };
type CoreSource = Meta & { docType?: string; content: string; markdown: boolean };

export type DocumentContext = {
  documentId: string;
  areaId: string;
  title: string;
  docRole: DocRole;
  /** Frontmatter `document_type`, e.g. `state_snapshot`. */
  docType?: string;
  updated_at: string;
  days_since_update: number;
  possibly_stale: boolean;
  origin: Origin;
  /** Whole text without frontmatter (or its clipped head, ending in `…`). */
  content?: string;
  /** Listed by name and outline only: the budget ran out. */
  omitted?: true;
  outline?: string[][];
  /** Keyword-ranked chunks; only for documents that are not loaded whole. */
  excerpts?: Chunk[];
};

export type DocumentRef = { areaId: string; documentId: string; name: string; kind: AreaKind; updatedAt: string };

const STOP_WORDS = new Set([
  ...'cho toi minh hay va la cua co gi nay do nao nhu khong ve voi the tu trong ban bao cac mon hoc dang can the nao tuan'.split(' '),
  ...('hom nay ngay mai nen lam hoc duoc nghi roi dau den dang se da can phai muon biet xem kiem tra tinh hinh sao nhe a oi ' +
    'thu tuan thang gio luc khi neu thi ma vi de di ra vao len xuong lai them nua rat qua cung chi con moi tat ca moi nguoi toi ban minh').split(' '),
]);

function queryTokens(query: string): string[] {
  return [...new Set(normalizeVi(query).split(' ').filter((token) => token.length > 1 && !STOP_WORDS.has(token)))].slice(0, 32);
}

const originOf = sql<Origin>`coalesce((select ${activityLogs.origin} from ${activityLogs}
  where ${activityLogs.entityType} = 'document' and ${activityLogs.entityId} = ${documents.id}
  order by ${activityLogs.createdAt} desc, ${activityLogs.id} desc limit 1), 'manual')`;

async function loadSources(db: DbOrTx, options: { areaIds?: string[]; query?: string; rawOnly?: boolean; excludeIds?: string[] }): Promise<Source[]> {
  if (options.areaIds?.length === 0) return [];
  const tokens = queryTokens(options.query ?? '');
  if (!tokens.length) return [];
  const conditions = await visibleDocumentConditions(db);
  if (options.areaIds) conditions.push(inArray(documents.areaId, options.areaIds));
  else conditions.push(isNull(areas.archivedAt));
  if (options.rawOnly) conditions.push(ne(documents.docRole, 'context'));
  if (options.excludeIds?.length) conditions.push(notInArray(documents.id, options.excludeIds));
  const tsQuery = sql`to_tsquery('simple', ${tokens.map((token) => token + ':*').join(' | ')})`;
  conditions.push(sql`${documents.searchTsv} @@ ${tsQuery}`);
  const rows = await db.select({
    documentId: documents.id, areaId: documents.areaId, areaKind: areas.kind,
    title: documents.title, docRole: documents.docRole, updatedAt: documents.updatedAt,
    bodyMd: documents.bodyMd, extractedText: documents.extractedText, fileExt: documents.fileExt,
    active: sql<boolean>`${areas.status} = 'active'`, origin: originOf,
  }).from(documents).innerJoin(areas, eq(areas.id, documents.areaId)).where(and(...conditions))
    .orderBy(desc(sql`ts_rank_cd(${documents.searchTsv}, ${tsQuery})`), desc(sql`${documents.docRole} = 'context'`),
      desc(sql`${areas.status} = 'active'`), desc(documents.updatedAt), asc(documents.id))
    .limit(MAX_CANDIDATES);

  return rows.map(({ bodyMd, extractedText, fileExt, ...row }) => {
    const body = splitDocument(bodyMd, fileExt === 'md');
    const extracted = extractedText && extractedText !== bodyMd ? splitDocument(extractedText, false) : [];
    const chunks = body.concat(extracted.map((chunk) => ({ ...chunk, ordinal: chunk.ordinal + body.length })));
    return { ...row, chunks };
  });
}

/** Visible `context` documents of the given areas. `head` reads only the start of each body (enough for frontmatter). */
async function loadCoreSources(db: DbOrTx, options: { areaIds: string[]; documentIds?: string[]; head?: number }): Promise<CoreSource[]> {
  if (!options.areaIds.length || options.documentIds?.length === 0) return [];
  const conditions = await visibleDocumentConditions(db);
  conditions.push(inArray(documents.areaId, options.areaIds), eq(documents.docRole, 'context'));
  if (options.documentIds) conditions.push(inArray(documents.id, options.documentIds));
  const rows = await db.select({
    documentId: documents.id, areaId: documents.areaId, areaKind: areas.kind,
    title: documents.title, docRole: documents.docRole, updatedAt: documents.updatedAt, origin: originOf, fileExt: documents.fileExt,
    bodyMd: options.head ? sql<string>`left(${documents.bodyMd}, ${options.head})` : documents.bodyMd,
    extractedText: options.head ? sql<string | null>`left(${documents.extractedText}, ${options.head})` : documents.extractedText,
  }).from(documents).innerJoin(areas, eq(areas.id, documents.areaId)).where(and(...conditions)).orderBy(asc(documents.id));
  return rows.map(({ bodyMd, extractedText, fileExt, ...row }) => {
    const markdown = fileExt === 'md';
    if (!markdown) return { ...row, markdown, content: bodyMd || extractedText || '' };
    const { meta, body } = splitFrontmatter(bodyMd);
    return { ...row, markdown, content: body.trim(), ...(meta.document_type ? { docType: meta.document_type } : {}) };
  });
}

async function rankChunks(db: DbOrTx, query: string, sources: Source[], limit: number) {
  const tokens = queryTokens(query);
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

const sizeOf = (doc: DocumentContext) => JSON.stringify(doc).replace(/</g, '\\u003c').length;

/** Documents in selection order with the serialized size of the array kept up to date. */
class Selection {
  readonly docs: DocumentContext[] = [];
  private sizes: number[] = [];
  private total = 2;
  truncated = false;

  /** Adds or replaces `doc` when the array would still serialize within `cap` characters. */
  put(doc: DocumentContext, cap: number): boolean {
    const index = this.docs.findIndex((item) => item.documentId === doc.documentId);
    const size = sizeOf(doc);
    const next = index >= 0 ? this.total - this.sizes[index] + size : this.total + size + (this.docs.length ? 1 : 0);
    if (next > cap) return false;
    if (index >= 0) {
      this.docs[index] = doc;
      this.sizes[index] = size;
    } else {
      this.docs.push(doc);
      this.sizes.push(size);
    }
    this.total = next;
    return true;
  }
}

/** Interleaves the groups one item per group per round, in group order. */
function roundRobin<T>(groups: T[][]): T[] {
  const out: T[] = [];
  for (let round = 0; groups.some((group) => round < group.length); round++) {
    for (const group of groups) if (round < group.length) out.push(group[round]);
  }
  return out;
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/** Portfolio questions: open, visible, unarchived areas — active first, then priority, then name. */
async function portfolioAreaIds(db: DbOrTx): Promise<string[]> {
  const rows = await db.select({ id: areas.id, status: areas.status, priority: areas.priority, name: areas.name }).from(areas)
    .where(and(eq(areas.aiExcluded, false), isNull(areas.archivedAt), notInArray(areas.status, ['completed', 'on_hold'] satisfies AreaStatus[])));
  return rows.sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') ||
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.name.localeCompare(b.name, 'vi') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((row) => row.id);
}

/**
 * Picks the documents sent with a chat turn, within `budget` serialized characters.
 *
 * - `areaIds` given (selected areas): every visible `context` document of those areas, whole and in
 *   {@link corePriority} order, interleaved round-robin across areas; a document that does not fit is clipped
 *   to its first 4,000 characters, else listed as `omitted` with its outline. The rest of the budget goes
 *   to at most 8 keyword-ranked excerpts of the areas' other (raw) documents.
 * - `areaIds` undefined (portfolio question): the state document (lowest priority) of each open area, whole
 *   when they all fit 60% of the budget, else evenly clipped; plus at most 6 excerpts, only when the
 *   question has a real keyword (3+ letters after stop words).
 */
export async function selectDocumentContext(db: DbOrTx, options: {
  areaIds?: string[]; query: string; today: string; timezone: string; staleAfterDays: number; budget: number;
}): Promise<{ documents: DocumentContext[]; refs: DocumentRef[]; truncated: boolean }> {
  if (options.budget <= 0 || options.areaIds?.length === 0) return { documents: [], refs: [], truncated: false };
  const selection = new Selection();
  const kinds = new Map<string, AreaKind>();

  function base(source: Meta & { docType?: string }): DocumentContext {
    kinds.set(source.documentId, source.areaKind);
    const days = Math.max(0, -daysUntil(todayIn(options.timezone, source.updatedAt), options.today));
    return {
      documentId: source.documentId, areaId: source.areaId, title: source.title, docRole: source.docRole,
      ...(source.docType ? { docType: source.docType } : {}),
      updated_at: source.updatedAt.toISOString(), days_since_update: days, possibly_stale: days > options.staleAfterDays,
      origin: source.origin,
    };
  }

  /** Whole when it fits; else its head (`limit` characters, default 4,000); else `omitted` with its outline. */
  function addCore(source: CoreSource, cap: number, limit?: number) {
    const head = base(source);
    const outline = () => {
      const items = source.markdown ? documentOutline(source.content) : [];
      return items.length ? { outline: items } : {};
    };
    if ((limit === undefined || source.content.length <= limit) && selection.put({ ...head, content: source.content }, cap)) return;
    selection.truncated = true;
    const clipAt = limit ?? CLIPPED_CORE;
    if (source.content.length > clipAt && selection.put({ ...head, content: clip(source.content, clipAt), ...outline() }, cap)) return;
    if (selection.put({ ...head, omitted: true, ...outline() }, cap)) return;
    selection.put({ ...head, omitted: true }, cap);
  }

  let excerptLimit: number;
  let excerptSources: Source[];
  if (options.areaIds) {
    const areaIds = options.areaIds;
    const core = await loadCoreSources(db, { areaIds });
    const groups = areaIds.map((areaId) => core.filter((doc) => doc.areaId === areaId).sort(compareCore));
    for (const source of roundRobin(groups)) addCore(source, options.budget);
    excerptLimit = FOCUSED_EXCERPTS;
    excerptSources = await loadSources(db, { areaIds, query: options.query, rawOnly: true });
  } else {
    const areaIds = await portfolioAreaIds(db);
    const heads = await loadCoreSources(db, { areaIds, head: HEAD_CHARS });
    const winners = areaIds.flatMap((areaId) => heads.filter((doc) => doc.areaId === areaId).sort(compareCore).slice(0, 1));
    const byId = new Map((await loadCoreSources(db, { areaIds, documentIds: winners.map((doc) => doc.documentId) }))
      .map((doc) => [doc.documentId, doc]));
    const states = winners.flatMap((doc) => byId.get(doc.documentId) ?? []);
    const cap = Math.floor(options.budget * PORTFOLIO_CORE_SHARE);
    const whole = 2 + states.reduce((sum, doc, index) => sum + sizeOf({ ...base(doc), content: doc.content }) + (index ? 1 : 0), 0);
    const share = whole <= cap ? undefined : Math.max(MIN_PORTFOLIO_SHARE, Math.floor(cap / states.length));
    for (const source of states) addCore(source, cap, share);
    const hasKeyword = queryTokens(options.query).some((token) => token.length >= 3);
    excerptLimit = PORTFOLIO_EXCERPTS;
    excerptSources = hasKeyword
      ? await loadSources(db, { query: options.query, excludeIds: states.map((doc) => doc.documentId) })
      : [];
  }

  for (const { source, chunk } of await rankChunks(db, options.query, excerptSources, excerptLimit)) {
    const existing = selection.docs.find((doc) => doc.documentId === source.documentId);
    if (existing && !existing.excerpts) continue;
    const entry = existing ?? base(source);
    if (!selection.put({ ...entry, excerpts: [...(entry.excerpts ?? []), chunk] }, options.budget)) selection.truncated = true;
  }

  const documents = selection.docs;
  return { documents, refs: documentRefs(documents, kinds), truncated: selection.truncated };
}

/** Refs ("Dựa trên:") for documents read in whole, in part or by excerpt; never for `omitted` ones. */
function documentRefs(docs: DocumentContext[], kinds: Map<string, AreaKind>): DocumentRef[] {
  return docs.filter((doc) => doc.content !== undefined || doc.excerpts?.length).map((doc) => ({
    areaId: doc.areaId, documentId: doc.documentId, name: doc.title, kind: kinds.get(doc.documentId)!, updatedAt: doc.updated_at,
  }));
}
