import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/db/client';
import { messages, pendingActions } from '@/db/schema';
import { runChatTurn, type TurnDeps, type TurnEvent, type TurnTimingReport } from '../chat/run-turn';
import type { ContextRef, ContextScope } from './context-builder';
import type { AiProvider } from './provider';
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
  /** Approve every action of the stored proposal, so a later case can check that the workspace remembers it. */
  approveProposal?: boolean;
  /** Run the weekly review of the current week (`generateWeeklyReview`) instead of a chat turn; `question` is a label. */
  weeklyReview?: boolean;
  maxFirstTokenMs?: number;
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
    expectProposal: z.boolean().optional(),
    proposalMustInclude: strings,
    approveProposal: z.boolean().optional(),
    weeklyReview: z.boolean().optional(),
    maxFirstTokenMs: z.number().positive().optional(),
  })
  .strict();

/** Reads `docs/ai-eval-cases.json`; throws on a malformed case or regex. */
export function parseEvalCases(json: string): EvalCase[] {
  const cases = z.array(EvalCaseSchema).parse(JSON.parse(json));
  for (const c of cases) {
    for (const re of [...(c.answerMustMatch ?? []), ...(c.answerMustNotMatch ?? [])]) new RegExp(re, 'i');
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
  if (c.expectProposal === true && !proposed) failures.push('cần có đề xuất');
  if (c.expectProposal === false && proposed) failures.push('không được có đề xuất');
  if (pendingActionId && (c.proposalMustInclude?.length || c.approveProposal)) {
    const [row] = await deps.db.select().from(pendingActions).where(eq(pendingActions.id, pendingActionId));
    const stored = row.actionsJson as StoredProposal;
    const types = stored.actions.map((a) => a.action.type as string);
    for (const type of c.proposalMustInclude ?? []) if (!types.includes(type)) failures.push(`đề xuất thiếu hành động ${type}`);
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
