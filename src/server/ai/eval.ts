import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/db/client';
import { messages, pendingActions } from '@/db/schema';
import { runChatTurn, type TurnDeps, type TurnEvent, type TurnTimingReport } from '../chat/run-turn';
import type { ContextRef, ContextScope } from './context-builder';
import type { AiProvider } from './provider';
import { cleanAlias } from '../proposals/aliases';
import { approvePendingAction } from '../proposals/resolve';
import { generateWeeklyReview } from '../review/weekly-review';
import { APP_TZ } from '@/lib/dates';
import { currentWeekStart } from '@/lib/weeks';
import type { StoredProposal } from '../proposals/schema';

/** A golden question. `*Match` strings are case-insensitive regexes; `context*` match referenced document names. */
export type EvalCase = {
  id: string;
  question: string;
  scope?: ContextScope;
  contextMustInclude?: string[];
  contextMustNotInclude?: string[];
  answerMustMatch?: string[];
  answerMustNotMatch?: string[];
  expectProposal?: boolean;
  /** Action types the stored proposal must contain (e.g. `append_to_document`). */
  proposalMustInclude?: string[];
  /** Action types the stored proposal must not contain. */
  proposalMustNotInclude?: string[];
  /** `update_area` patch values the proposal must set, e.g. `{ "status": "active" }`. */
  areaPatchMustInclude?: Record<string, string>;
  /** Aliases an `update_area` must add (`patch.addAliases`), compared case-insensitively. */
  areaAliasesMustInclude?: string[];
  /** Some action of `type` must carry these values, at its top level or in its `patch`. */
  actionFieldsMustInclude?: { type: string; fields: Record<string, string | number | boolean> }[];
  /** Some `create_reminder` must fall at this HH:MM, Vietnam time (the date is not checked). */
  reminderAt?: string;
  /** Approve every action of the stored proposal, so a later case can check that the workspace remembers it. */
  approveProposal?: boolean;
  /** At most this many document edits (append/replace) in the stored proposal: one report is written once. */
  maxDocumentWrites?: number;
  /** Case-insensitive regexes no document edit's heading may match (a schedule never goes under the lab section). */
  proposalHeadingMustNotMatch?: string[];
  /** Run the weekly review of the current week (`generateWeeklyReview`) instead of a chat turn; `question` is a label. */
  weeklyReview?: boolean;
  maxFirstTokenMs?: number;
  /** R1: the model must have used the read tools (search/read) at least once in the turn. */
  mustReadDocuments?: boolean;
};

export type EvalResult = {
  id: string;
  pass: boolean;
  failures: string[];
  firstTokenMs: number;
  totalMs: number;
  documents: number;
  promptChars: number;
  /** The reply as saved (the report keeps only its start). */
  reply: string;
};

export type EvalDeps = {
  db: Db;
  provider: AiProvider;
  actionMode: TurnDeps['actionMode'];
  now: Date;
  maxOutputTokens?: number;
  model?: string;
};

const strings = z.array(z.string()).optional();
const EvalCaseSchema = z
  .object({
    id: z.string().min(1),
    question: z.string().min(1),
    scope: z
      .object({ mode: z.enum(['auto', 'all', 'academic', 'projects', 'item']), areaId: z.string().optional() })
      .optional(),
    contextMustInclude: strings,
    contextMustNotInclude: strings,
    answerMustMatch: strings,
    answerMustNotMatch: strings,
    mustReadDocuments: z.boolean().optional(),
    expectProposal: z.boolean().optional(),
    proposalMustInclude: strings,
    proposalMustNotInclude: strings,
    areaPatchMustInclude: z.record(z.string(), z.string()).optional(),
    areaAliasesMustInclude: strings,
    actionFieldsMustInclude: z
      .array(z.object({ type: z.string(), fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])) }).strict())
      .optional(),
    approveProposal: z.boolean().optional(),
    maxDocumentWrites: z.number().int().nonnegative().optional(),
    proposalHeadingMustNotMatch: strings,
    reminderAt: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    weeklyReview: z.boolean().optional(),
    maxFirstTokenMs: z.number().positive().optional(),
  })
  .strict();

/** Reads `docs/ai-eval-cases.json`; throws on a malformed case or regex. */
export function parseEvalCases(json: string): EvalCase[] {
  const cases = z.array(EvalCaseSchema).parse(JSON.parse(json));
  for (const c of cases) {
    for (const re of [...(c.answerMustMatch ?? []), ...(c.answerMustNotMatch ?? []), ...(c.proposalHeadingMustNotMatch ?? [])]) new RegExp(re, 'i');
  }
  return cases;
}

const lower = (s: string) => s.toLocaleLowerCase('vi');

/** Each case runs the real chat turn on a new conversation; proposals stay pending (nothing is approved). */
export async function runEval(deps: EvalDeps, cases: EvalCase[]): Promise<EvalResult[]> {
  const results: EvalResult[] = [];
  for (const c of cases) results.push(await runCase(deps, c));
  return results;
}

async function runCase(deps: EvalDeps, c: EvalCase): Promise<EvalResult> {
  const failures: string[] = [];
  let timing: TurnTimingReport | null = null;
  let reply = '';
  let proposed = false;
  let pendingActionId: string | null = null;
  let assistantMessageId: string | null = null;
  let firstTokenMs: number | null = null;
  const started = performance.now();
  if (c.weeklyReview) {
    const r = await generateWeeklyReview(
      {
        db: deps.db, provider: deps.provider, actionMode: deps.actionMode, dailyCap: 2_000_000_000, now: deps.now, tz: APP_TZ, model: deps.model,
        onTiming: (t) => {
          timing = t;
        },
      },
      // Each run reviews again: the case checks this run's proposal.
      { weekStart: currentWeekStart(deps.now, APP_TZ), regenerate: true },
    );
    if (!r.ok) failures.push(`lỗi: ${r.error}`);
    else {
      pendingActionId = r.review.pendingActionId;
      proposed = pendingActionId !== null;
      const [reply] = await deps.db.select({ id: messages.id }).from(messages)
        .where(and(eq(messages.conversationId, r.review.conversationId), eq(messages.role, 'assistant')));
      assistantMessageId = reply?.id ?? null;
    }
    firstTokenMs = (timing as TurnTimingReport | null)?.firstTokenMs ?? null;
  }
  const turn = c.weeklyReview ? (async function* (): AsyncGenerator<TurnEvent> {})() : runChatTurn(
    {
      db: deps.db,
      provider: deps.provider,
      actionMode: deps.actionMode,
      // The evaluation runs on a copy of the database: the owner's daily cap does not apply.
      // The cap is compared to an int4 column, so it must fit in 32 bits.
      dailyCap: 2_000_000_000,
      now: deps.now,
      maxOutputTokens: deps.maxOutputTokens,
      model: deps.model,
      onTiming: (t) => {
        timing = t;
      },
    },
    { message: c.question, scope: c.scope ?? { mode: 'auto' } },
  );
  for await (const e of turn) {
    if ((e.type === 'text' || e.type === 'proposal') && firstTokenMs === null) firstTokenMs = Math.round(performance.now() - started);
    if (e.type === 'text') reply += e.delta;
    else if (e.type === 'proposal') {
      proposed = true;
      pendingActionId = e.pendingActionId;
    }
    else if (e.type === 'done') assistantMessageId = e.assistantMessageId;
    else if (e.type === 'error') failures.push(`lỗi: ${e.message}`);
  }
  const totalMs = Math.round(performance.now() - started);

  let refs: ContextRef[] = [];
  if (assistantMessageId) {
    const [saved] = await deps.db.select().from(messages).where(eq(messages.id, assistantMessageId));
    reply = saved?.content ?? reply;
    const meta = saved?.metadata as { contextRefs?: ContextRef[] } | null;
    refs = Array.isArray(meta?.contextRefs) ? meta.contextRefs : [];
  }
  const documentNames = refs.filter((r) => r.documentId).map((r) => lower(r.name));
  const inContext = (needle: string) => documentNames.some((name) => name.includes(lower(needle)));

  for (const needle of c.contextMustInclude ?? []) if (!inContext(needle)) failures.push(`ngữ cảnh thiếu "${needle}"`);
  for (const needle of c.contextMustNotInclude ?? []) if (inContext(needle)) failures.push(`ngữ cảnh không được có "${needle}"`);
  for (const re of c.answerMustMatch ?? []) if (!new RegExp(re, 'i').test(reply)) failures.push(`câu trả lời không khớp /${re}/i`);
  for (const re of c.answerMustNotMatch ?? []) if (new RegExp(re, 'i').test(reply)) failures.push(`câu trả lời không được khớp /${re}/i`);
  if (c.mustReadDocuments && !((timing as TurnTimingReport | null)?.readRounds ?? 0)) failures.push('cần tự đọc thêm tài liệu (search/read) nhưng không gọi');
  if (c.expectProposal === true && !proposed) failures.push('cần có đề xuất');
  if (c.expectProposal === false && proposed) failures.push('không được có đề xuất');
  if (pendingActionId && (c.proposalMustInclude?.length || c.proposalMustNotInclude?.length || c.areaPatchMustInclude || c.areaAliasesMustInclude?.length || c.actionFieldsMustInclude?.length || c.reminderAt || c.approveProposal || c.maxDocumentWrites !== undefined || c.proposalHeadingMustNotMatch?.length)) {
    const [row] = await deps.db.select().from(pendingActions).where(eq(pendingActions.id, pendingActionId));
    const stored = row.actionsJson as StoredProposal;
    const types = stored.actions.map((a) => a.action.type as string);
    for (const type of c.proposalMustInclude ?? []) if (!types.includes(type)) failures.push(`đề xuất thiếu hành động ${type}`);
    for (const type of c.proposalMustNotInclude ?? []) if (types.includes(type)) failures.push(`đề xuất không được có hành động ${type}`);
    for (const [field, value] of Object.entries(c.areaPatchMustInclude ?? {})) {
      const set = stored.actions.some((a) => a.action.type === 'update_area' && (a.action.patch as Record<string, unknown>)[field] === value);
      if (!set) failures.push(`đề xuất không đặt ${field} = ${value} cho mục`);
    }
    const added = stored.actions.flatMap((a) =>
      a.action.type === 'update_area' ? ((a.action.patch as { addAliases?: string[] }).addAliases ?? []).map((x) => lower(cleanAlias(x))) : [],
    );
    for (const alias of c.areaAliasesMustInclude ?? []) if (!added.includes(lower(alias))) failures.push(`đề xuất không thêm tên gọi khác "${alias}"`);
    for (const want of c.actionFieldsMustInclude ?? []) {
      const hit = stored.actions.some(({ action }) => {
        if (action.type !== want.type) return false;
        const flat = { ...(action as Record<string, unknown>), ...((action as { patch?: Record<string, unknown> }).patch ?? {}) };
        return Object.entries(want.fields).every(([k, v]) => flat[k] === v);
      });
      if (!hit) failures.push(`đề xuất thiếu ${want.type} với ${JSON.stringify(want.fields)}`);
    }
    if (c.reminderAt) {
      const times = stored.actions.flatMap(({ action }) =>
        action.type === 'create_reminder'
          ? [new Intl.DateTimeFormat('en-GB', { timeZone: APP_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(action.remindAt))]
          : [],
      );
      if (!times.includes(c.reminderAt)) failures.push(`đề xuất không có create_reminder lúc ${c.reminderAt} (có: ${times.join(', ') || 'không'})`);
    }
    const writes = stored.actions.flatMap((a) => (a.action.type === 'append_to_document' || a.action.type === 'replace_section' ? [a.action] : []));
    if (c.maxDocumentWrites !== undefined && writes.length > c.maxDocumentWrites) {
      failures.push(`đề xuất ghi ${writes.length} chỗ trong tài liệu (tối đa ${c.maxDocumentWrites})`);
    }
    for (const re of c.proposalHeadingMustNotMatch ?? []) {
      const bad = writes.find((w) => w.heading && new RegExp(re, 'i').test(w.heading));
      if (bad) failures.push(`đề xuất ghi vào mục "${bad.heading}" (không được khớp /${re}/i)`);
    }
    if (c.approveProposal) {
      const approved = await approvePendingAction(deps.db, pendingActionId, { selectedKeys: stored.actions.map((a) => a.key) });
      if (approved.status !== 'applied') failures.push(`duyệt đề xuất: ${approved.status}`);
    }
  }
  const first = firstTokenMs ?? totalMs;
  if (c.maxFirstTokenMs !== undefined && (firstTokenMs === null || firstTokenMs > c.maxFirstTokenMs)) {
    failures.push(`chữ đầu tiên sau ${first} ms (tối đa ${c.maxFirstTokenMs} ms)`);
  }

  const t = timing as TurnTimingReport | null;
  return {
    id: c.id,
    pass: failures.length === 0,
    failures,
    firstTokenMs: first,
    totalMs,
    documents: t?.documents ?? 0,
    promptChars: t?.promptChars ?? 0,
    reply,
  };
}

const REPLY_EXCERPT = 300;
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const excerpt = (s: string) => (Array.from(s).length > REPLY_EXCERPT ? Array.from(s).slice(0, REPLY_EXCERPT).join('') + '…' : s);

/** `docs/ai-eval-report.md`: date, model, a result table, and at most 300 characters of each reply. */
export function formatEvalReport(input: { date: string; model: string; actionMode: string; results: EvalResult[] }): string {
  const passed = input.results.filter((r) => r.pass).length;
  const rows = input.results.map(
    (r) =>
      `| ${cell(r.id)} | ${r.pass ? 'đạt' : 'trượt'} | ${r.firstTokenMs} | ${r.totalMs} | ${r.documents} | ${r.promptChars} | ${cell(r.failures.join('; ')) || '—'} |`,
  );
  const replies = input.results.map((r) => `### ${r.id}\n\n> ${excerpt(r.reply).replace(/\n/g, '\n> ')}\n`);
  return `# Báo cáo đánh giá AI

- Ngày chạy: ${input.date}
- Model: ${input.model}
- Chế độ đề xuất: ${input.actionMode}
- Kết quả: ${passed}/${input.results.length} case đạt

| Case | Kết quả | Chữ đầu tiên (ms) | Tổng (ms) | Tài liệu | Ký tự prompt | Lý do trượt |
|---|---|---|---|---|---|---|
${rows.join('\n')}

## Câu trả lời (tối đa ${REPLY_EXCERPT} ký tự mỗi case)

${replies.join('\n')}`;
}
