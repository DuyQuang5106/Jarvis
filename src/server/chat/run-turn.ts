import type { Db } from '@/db/client';
import { eq } from 'drizzle-orm';
import type { ConversationKind } from '@/db/enums';
import { conversations, type MessageRow } from '@/db/schema';
import { APP_TZ, todayIn } from '@/lib/dates';
import { isFromDocumentsRequest } from '@/lib/from-documents';
import { firstChars } from '@/lib/utils';
import { buildContext, listAiExcludedAreas, type ContextRef, type ContextScope } from '../ai/context-builder';
import { hiddenDocumentIds } from '../ai/document-visibility';
import { AliasBook, DOC_TOOLS, MAX_READ_ROUNDS, isDocTool, roundMessages, runDocTools, type DocToolCall } from '../ai/doc-tools';
import { aliasWorkspaceState, resolveProposalAliases } from '../ai/id-aliases';
import { matchAreas } from '../ai/match-areas';
import { WEEKLY_REVIEW_MAX_ACTIONS, buildSystemPrompt } from '../ai/prompt';
import type { AiProvider, ChatMessage, TokenUsage } from '../ai/provider';
import { AiCapExceededError, NotFoundError } from '../errors';
import { ProposalBlockFilter, parseProposal, type ParseProposalResult } from '../proposals/extract';
import { PROPOSE_CHANGES_TOOL } from '../proposals/schema';
import { createPendingAction, ignoredProposalNotice, skippedActionsNotice, supersedeForMessage, type DroppedProposalReason } from '../proposals/store';
import { countAiRequest } from '../services/ai-usage';
import {
  appendMessage,
  createConversation,
  getOrCreateThread,
  type ThreadTarget,
  getConversation,
  listMessagesBefore,
  replaceReplies,
  updateMessageReply,
} from '../services/conversations';
import { allowsProposal, asksSomething } from './intent';

export type TurnEvent =
  | { type: 'meta'; conversationId: string; userMessageId: string }
  /** Transient progress shown while nothing has been written yet; never saved, never part of the reply. */
  | { type: 'status'; message: string }
  | { type: 'text'; delta: string }
  | { type: 'proposal'; pendingActionId: string }
  | { type: 'done'; assistantMessageId: string; contextRefs: ContextRef[]; summaryCount: number; stats: ReplyStats }
  | { type: 'error'; message: string };
export type TurnDeps = {
  db: Db;
  provider: AiProvider;
  actionMode: 'tools' | 'json' | 'off';
  dailyCap: number;
  now: Date;
  signal?: AbortSignal;
  /** `maxOutputTokens` for the provider (default 4000). */
  maxOutputTokens?: number;
  /** Model label for the timing log (no secrets). */
  model?: string;
  /** Receives the timing line once the turn ends (the evaluation harness reads it). */
  onTiming?: (report: TurnTimingReport) => void;
};
export type TurnInput = {
  conversationId?: string;
  message?: string;
  scope: ContextScope;
  regenerate?: boolean;
  /**
   * The weekly review turn (`generateWeeklyReview`), never sent by the chat route: a new conversation named
   * `title`, the whole workspace (scope `all`), `weekActivity` after `<workspace_state>` with the review
   * rules, {@link WEEKLY_REVIEW_MAX_OUTPUT_TOKENS} output tokens, and only `replace_section` actions kept.
   * Everything else (aliases, proposal parsing and storing, notices, saving, timing) is the normal turn.
   */
  weeklyReview?: { title: string; weekActivity: string };
  /** No conversation open yet: the thread ("Chung" or a subject's) the message goes to, created on first use. */
  thread?: ThreadTarget;
};

/** Threads live for months: the model gets back only the recent part (the screen still shows everything). */
export const THREAD_HISTORY_MS = 24 * 60 * 60 * 1000;

/** `maxOutputTokens` of the weekly review turn: the review plus up to 8 rewritten sections. */
export const WEEKLY_REVIEW_MAX_OUTPUT_TOKENS = 6000;

const MAX_MESSAGE = 8000;
const DEFAULT_MAX_OUTPUT_TOKENS = 4000;
const TITLE_LEN = 60;
const HISTORY = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOT_FOUND = 'Không tìm thấy cuộc trò chuyện.';
const NOTHING_TO_RETRY = 'Không có tin nhắn để thử lại.';
const BUSY = 'Đang có một câu trả lời khác trong cuộc chat này, đợi xong rồi thử lại.';
const PROVIDER_FAILED = 'Không gọi được AI. Dữ liệu của bạn không bị ảnh hưởng, có thể thử lại.';
/** Stands in for a history message that touches an area now excluded from AI. */
/** Reply to a message that names areas marked "Không gửi cho AI"; the message itself never reaches the model. */
export function excludedAreaNotice(names: string[]): string {
  const list = names.map((n) => `**${n}**`).join(', ');
  const one = names.length === 1;
  return `${one ? 'Mục' : 'Các mục'} ${list} đang bật "Không gửi cho AI", nên tin nhắn này chưa được gửi cho AI và mình không đọc hay cập nhật được ${one ? 'mục này' : 'các mục này'}.\n\n` +
    `Muốn mình ghi lại: vào **Context**, mở ${one ? 'mục' : 'từng mục'} ${list}, tắt "Không gửi cho AI", rồi quay lại đây bấm **Tạo lại**.`;
}

export const HIDDEN_HISTORY ='[Tin nhắn cũ đã ẩn vì liên quan mục không gửi cho AI]';

/** Appended to a reply the provider cut at the output cap (`finish_reason = length`). */
export const TRUNCATED_NOTICE = '\n\n_(Câu trả lời bị cắt vì quá dài. Nhắn "tiếp tục" để xem phần còn lại.)_';
const READING = (n: number) => (n > 0 ? `Đang đọc ${n} tài liệu…` : 'Đang suy nghĩ…');

const err = (message: string): TurnEvent => ({ type: 'error', message });

/** Numbers and labels only for the one `chat turn` log line: never message, context or key content. */
type TurnTiming = {
  contextMs: number | null;
  firstTokenMs: number | null;
  promptChars: number | null;
  documents: number | null;
  finishReason: string | null;
  proposal: string;
  /** Summed over the turn's provider calls; null when the provider reports no usage. */
  inputTokens: number | null;
  outputTokens: number | null;
  /** R1: rounds of read tool calls and documents read through them (absent when none). */
  readRounds?: number;
  documentsRead?: number;
};

/** Shown under each assistant reply (saved in its metadata as `stats`). */
export type ReplyStats = { inputTokens: number | null; outputTokens: number | null; firstTokenMs: number | null; totalMs: number };
/** The `chat turn` log line. */
export type TurnTimingReport = TurnTiming & { totalMs: number; model?: string };

/** Conversations with a turn in progress in this server process: a second concurrent turn is refused. */
const inFlight = new Set<string>();

async function conversationKind(db: Db, conversationId: string): Promise<ConversationKind | null> {
  const [row] = await db.select({ kind: conversations.kind }).from(conversations).where(eq(conversations.id, conversationId));
  return row?.kind ?? null;
}

async function loadMessages(db: Db, conversationId: string): Promise<MessageRow[] | null> {
  if (!UUID.test(conversationId)) return null;
  return (await getConversation(db, conversationId))?.messages ?? null;
}

const refIds = (metadata: unknown, key: 'areaId' | 'documentId'): string[] => {
  const refs = (metadata as { contextRefs?: unknown } | null)?.contextRefs;
  return Array.isArray(refs) ? refs.map((r) => (r as Record<string, unknown>)?.[key]).filter((id): id is string => typeof id === 'string' && UUID.test(id)) : [];
};

/** History as sent to the model: a message tied to an area excluded since (by its refs or its text) is replaced. */
async function historyForModel(db: Db, history: MessageRow[]): Promise<ChatMessage[]> {
  const [excluded, hiddenDocuments] = await Promise.all([
    listAiExcludedAreas(db),
    hiddenDocumentIds(db, history.flatMap((message) => refIds(message.metadata, 'documentId'))),
  ]);
  const excludedIds = new Set(excluded.map((a) => a.id));
  return history.map((m) => {
    const hidden =
      refIds(m.metadata, 'documentId').some((id) => hiddenDocuments.has(id)) ||
      refIds(m.metadata, 'areaId').some((id) => excludedIds.has(id)) ||
      matchAreas([m.content], excluded).length > 0;
    return { role: m.role, content: hidden ? HIDDEN_HISTORY : m.content };
  });
}

/**
 * The weekly review proposes only `replace_section` (at most {@link WEEKLY_REVIEW_MAX_ACTIONS}); any other
 * action counts as skipped. Nothing left: dropped like a malformed proposal. Other turns: unchanged.
 */
function keepWeeklyActions(parsed: ParseProposalResult, weekly: boolean): ParseProposalResult {
  if (!weekly || !parsed.ok) return parsed;
  const kept = parsed.value.actions.filter((a) => a.type === 'replace_section').slice(0, WEEKLY_REVIEW_MAX_ACTIONS);
  if (kept.length === 0) return { ok: false, reason: 'schema', issues: ['actions'] };
  return { ...parsed, value: { ...parsed.value, actions: kept }, skipped: parsed.skipped + parsed.value.actions.length - kept.length };
}

/** Reply of the aside call when the message holds no question beyond the report. */
const NO_ASIDE = 'KHONG_CO';
const ASIDE_MAX_OUTPUT_TOKENS = 1000;

/**
 * The aside call: the same prompt (so a provider cache can reuse it), the proposal as the assistant's turn,
 * then a request to answer the questions the report also held. Yields its text after a blank line; returns
 * it, or '' when there was nothing to answer or the call failed (the proposal stands either way).
 */
async function* answerAside(deps: TurnDeps, messages: ChatMessage[], summary: string, timing: TurnTiming): AsyncGenerator<TurnEvent, string> {
  const followUp: ChatMessage[] = [
    ...messages,
    { role: 'assistant', content: `Mình đã đề xuất cập nhật (đang chờ bạn duyệt): ${summary}` },
    {
      role: 'user',
      content: `Ngoài phần báo cập nhật, tin nhắn trước của tôi có hỏi gì khác không? Nếu có, trả lời ngắn từng câu hỏi đó, không nhắc lại đề xuất. Nếu không có câu hỏi nào, chỉ trả lời đúng ${NO_ASIDE}.`,
    },
  ];
  let text = '';
  try {
    for await (const e of deps.provider.stream({
      messages: followUp,
      maxOutputTokens: ASIDE_MAX_OUTPUT_TOKENS,
      signal: deps.signal,
      onUsage: (u) => addUsage(timing, u),
    })) {
      if (e.type === 'text') text += e.delta;
    }
  } catch (e) {
    if (!deps.signal?.aborted) console.error('chat turn aside failed', { name: (e as { name?: string })?.name });
    return '';
  }
  text = text.trim();
  if (!text || text.includes(NO_ASIDE)) return '';
  const out = `\n\n${text}`;
  yield { type: 'text', delta: out };
  return out;
}

function addUsage(timing: TurnTiming, usage: TokenUsage) {
  timing.inputTokens = (timing.inputTokens ?? 0) + usage.inputTokens;
  timing.outputTokens = (timing.outputTokens ?? 0) + usage.outputTokens;
}

/** One chat turn; whatever happens (reply, error, `Dừng`), exactly one `chat turn` timing line is logged. */
export async function* runChatTurn(deps: TurnDeps, input: TurnInput): AsyncGenerator<TurnEvent> {
  const started = performance.now();
  const timing: TurnTiming = {
    contextMs: null,
    firstTokenMs: null,
    promptChars: null,
    documents: null,
    finishReason: null,
    proposal: 'none',
    inputTokens: null,
    outputTokens: null,
  };
  try {
    yield* turn(deps, input, timing, started);
  } finally {
    const report: TurnTimingReport = {
      ...timing,
      totalMs: Math.round(performance.now() - started),
      ...(deps.model ? { model: deps.model } : {}),
    };
    console.info('chat turn', report);
    deps.onTiming?.(report);
  }
}

async function* turn(deps: TurnDeps, input: TurnInput, timing: TurnTiming, started: number): AsyncGenerator<TurnEvent> {
  const { db } = deps;
  const elapsed = () => Math.round(performance.now() - started);

  // 1. Check the input and find the conversation. No awaits between the busy check and taking the lock.
  let existing: MessageRow[] | null = null;
  let text = '';
  const weekly = input.weeklyReview ?? null;
  if (weekly && (input.regenerate || input.conversationId)) return yield err(NOT_FOUND);
  if (!weekly && !input.regenerate && !input.conversationId && input.thread) {
    // The thread exists from now on; the rest of the turn treats it as the open conversation.
    try {
      input = { ...input, conversationId: (await getOrCreateThread(db, input.thread)).id };
    } catch (e) {
      if (e instanceof NotFoundError) return yield err(NOT_FOUND);
      throw e;
    }
  }
  if (input.regenerate) {
    if (!input.conversationId) return yield err(NOTHING_TO_RETRY);
    existing = await loadMessages(db, input.conversationId);
    if (!existing) return yield err(NOT_FOUND);
  } else {
    text = (input.message ?? '').trim();
    if (text.length < 1 || text.length > MAX_MESSAGE) return yield err('Tin nhắn trống hoặc quá dài.');
    if (input.conversationId) {
      existing = await loadMessages(db, input.conversationId);
      if (!existing) return yield err(NOT_FOUND);
    }
  }
  if (input.conversationId && inFlight.has(input.conversationId)) return yield err(BUSY);

  let locked: string | null = null;
  const lock = (id: string) => {
    inFlight.add(id);
    locked = id;
  };
  try {
    // 2. The user message this turn answers: the row saved now, or (regenerate) the last one at the start.
    let conversationId: string;
    let current: MessageRow;
    let before: MessageRow[];
    let oldReplies: MessageRow[] = [];
    if (input.regenerate) {
      conversationId = input.conversationId!;
      const msgs = existing!;
      const idx = msgs.findLastIndex((m) => m.role === 'user');
      if (idx < 0) return yield err(NOTHING_TO_RETRY);
      lock(conversationId);
      current = msgs[idx];
      before = msgs.slice(0, idx);
      oldReplies = msgs.slice(idx + 1).filter((m) => m.role === 'assistant');
    } else {
      if (input.conversationId) {
        conversationId = input.conversationId;
        lock(conversationId);
      } else {
        conversationId = (await createConversation(db, weekly ? weekly.title : firstChars(text, TITLE_LEN), weekly ? 'system' : 'legacy')).id;
        lock(conversationId);
      }
      current = await appendMessage(db, conversationId, 'user', text);
      before = await listMessagesBefore(db, conversationId, current.id);
    }

    // 3. Meta.
    yield { type: 'meta', conversationId, userMessageId: current.id };

    // 3b. A message about an area kept from AI is not sent at all: the model would not see the area and would
    // answer as if it did not exist. Say why and how to turn it back on (no AI call, no cap used).
    if (!weekly) {
      const blocked = (await listAiExcludedAreas(db)).filter((a) => matchAreas([current.content], [a]).length > 0);
      if (blocked.length > 0) {
        const reply = excludedAreaNotice(blocked.map((a) => a.name));
        yield { type: 'text', delta: reply };
        if (input.regenerate) for (const old of oldReplies) await supersedeForMessage(db, old.id);
        const stats: ReplyStats = { inputTokens: 0, outputTokens: 0, firstTokenMs: elapsed(), totalMs: elapsed() };
        const metadata = { contextRefs: [], summaryCount: 0, truncated: false, stats };
        const saved = input.regenerate
          ? await replaceReplies(db, conversationId, current.id, reply, metadata)
          : await appendMessage(db, conversationId, 'assistant', reply, metadata);
        timing.proposal = 'none';
        return yield { type: 'done', assistantMessageId: saved.id, contextRefs: [], summaryCount: 0, stats };
      }
    }

    // 4. Daily cap.
    try {
      await countAiRequest(db, todayIn(APP_TZ, deps.now), deps.dailyCap);
    } catch (e) {
      if (e instanceof AiCapExceededError) return yield err('Đã chạm trần số lượt hỏi AI hôm nay.');
      throw e;
    }

    // 5. Context.
    const contextStarted = performance.now();
    // A thread ("Chung", a subject's) keeps only the last day; a one-off conversation keeps its last messages.
    const kind = await conversationKind(db, conversationId);
    const recent = kind === 'general' || kind === 'area' ? before.filter((m) => deps.now.getTime() - m.createdAt.getTime() <= THREAD_HISTORY_MS) : before;
    const history = await historyForModel(db, recent.slice(-HISTORY));
    const ctx = await buildContext(db, {
      message: current.content,
      recentUserMessages: history.filter((m) => m.role === 'user' && m.content !== HIDDEN_HISTORY).map((m) => m.content),
      scope: weekly ? { mode: 'all' } : input.scope,
      now: deps.now,
    });
    timing.contextMs = Math.round(performance.now() - contextStarted);
    timing.documents = ctx.state.documents?.filter((d) => d.content !== undefined || d.excerpts?.length).length ?? 0;
    yield { type: 'status', message: READING(timing.documents) };

    // 6. Stream. Alias entity UUIDs so external AI proxies that scrub UUIDs cannot corrupt IDs.
    // A pure question gets no proposal machinery: no tool, no `<proposed_actions>` instructions.
    // The weekly review is a long text that must come before its proposal: with a tool, models tend to answer
    // with the tool call alone (seen with claude-sonnet-5), so it uses the `<proposed_actions>` block instead.
    const allowed = allowsProposal(current.content) ? deps.actionMode : 'off';
    const actionMode = weekly && allowed === 'tools' ? 'json' : allowed;
    const aliased = aliasWorkspaceState(ctx.state);
    // The read tools ride on native tool calls: offered when the provider takes tools, never for the weekly review.
    const docTools = deps.actionMode === 'tools' && !weekly;
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: buildSystemPrompt({
          stateJson: aliased.json,
          actionMode,
          fromDocuments: isFromDocumentsRequest(current.content),
          docTools,
          ...(weekly ? { weeklyReview: { weekActivity: weekly.weekActivity } } : {}),
        }),
      },
      ...history,
      { role: 'user', content: current.content },
    ];
    timing.promptChars = messages.reduce((n, m) => n + m.content.length, 0);
    const proposeTools = actionMode === 'tools' ? [PROPOSE_CHANGES_TOOL] : [];
    const filter = actionMode === 'json' ? new ProposalBlockFilter() : null;
    const book = new AliasBook(aliased.aliasToReal);
    const alreadyRead = new Set<string>();
    let reply = '';
    let rawProposal: string | null = null;
    try {
      // R1: the model may search and read more documents first, up to MAX_READ_ROUNDS rounds; the call after
      // the last round has no read tools, so it has to answer.
      for (let round = 0; ; round++) {
        const tools = [...proposeTools, ...(docTools && round < MAX_READ_ROUNDS ? DOC_TOOLS : [])];
        const events = deps.provider.stream({
          messages,
          tools: tools.length ? tools : undefined,
          maxOutputTokens: weekly ? WEEKLY_REVIEW_MAX_OUTPUT_TOKENS : (deps.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS),
          signal: deps.signal,
          onFinishReason: (reason) => {
            timing.finishReason = reason;
          },
          onUsage: (u) => addUsage(timing, u),
        });
        let roundText = '';
        const reads: DocToolCall[] = [];
        for await (const e of events) {
          timing.firstTokenMs ??= elapsed();
          if (e.type === 'text') {
            const out = filter ? filter.push(e.delta) : e.delta;
            if (out) {
              roundText += out;
              yield { type: 'text', delta: out };
            }
          } else if (e.type === 'tool_call' && e.name === PROPOSE_CHANGES_TOOL.name && rawProposal === null) {
            rawProposal = e.argsJson;
          } else if (e.type === 'tool_call' && isDocTool(e.name)) {
            reads.push({ name: e.name, argsJson: e.argsJson });
          }
        }
        reply += roundText;
        // A proposal ends the turn; so does a round without read calls (or past the limit).
        if (rawProposal !== null || reads.length === 0 || round >= MAX_READ_ROUNDS) break;
        const done = await runDocTools(db, reads, book, alreadyRead);
        timing.readRounds = round + 1;
        timing.documentsRead = (timing.documentsRead ?? 0) + done.read;
        yield { type: 'status', message: done.status || 'Đang đọc tài liệu…' };
        messages.push(...roundMessages(roundText, reads, done));
        // What came before the reading stays on screen; the answer continues after a blank line.
        if (reply.trim()) {
          reply += '\n\n';
          yield { type: 'text', delta: '\n\n' };
        }
      }
      if (filter) {
        const end = filter.end();
        if (end.visibleTail) {
          reply += end.visibleTail;
          yield { type: 'text', delta: end.visibleTail };
        }
        rawProposal = end.rawJson;
      }
    } catch (e) {
      // `Dừng` aborts the request: expected, not a failure worth logging.
      if (!deps.signal?.aborted) {
        const x = e as { name?: string; status?: number };
        console.error('chat turn failed', { name: x?.name, status: x?.status });
      }
      return yield err(PROVIDER_FAILED);
    }
    if (deps.signal?.aborted) return; // stopped: nothing of this reply is saved

    const resolvedProposal = rawProposal !== null ? resolveProposalAliases(rawProposal, book.aliasToReal) : null;
    const parsed = resolvedProposal !== null ? keepWeeklyActions(parseProposal(resolvedProposal), !!weekly) : null;
    if (reply.trim() === '') {
      if (parsed?.ok) {
        reply = parsed.value.summary;
        yield { type: 'text', delta: reply };
        // A report that also asks something (`… hôm nay là ngày gì?`) answered with the tool call alone:
        // ask once more for a written answer, without tools, so the question is not lost.
        if (!weekly && asksSomething(current.content)) {
          const answer = yield* answerAside(deps, messages, parsed.value.summary, timing);
          if (answer) reply += answer;
        }
      } else if (rawProposal === null) {
        console.error('chat turn failed', { name: 'EmptyReply', status: undefined });
        return yield err(PROVIDER_FAILED);
      }
    }
    if (timing.finishReason === 'length') {
      // Cut at the output cap: say so instead of leaving a reply that silently stops mid-sentence.
      reply += TRUNCATED_NOTICE;
      yield { type: 'text', delta: TRUNCATED_NOTICE };
    }

    // 7. Save the reply. Regenerate supersedes old proposals and replaces the old reply only now that the new one exists.
    if (input.regenerate) {
      for (const old of oldReplies) await supersedeForMessage(db, old.id);
    }
    const stats: ReplyStats = {
      inputTokens: timing.inputTokens,
      outputTokens: timing.outputTokens,
      firstTokenMs: timing.firstTokenMs,
      totalMs: elapsed(),
    };
    // contextRefs stay in metadata: history hiding (excluded areas, hidden documents) keys on them.
    const metadata: Record<string, unknown> = { contextRefs: ctx.refs, summaryCount: ctx.summaryCount, truncated: ctx.truncated, stats };
    const saved = input.regenerate
      ? await replaceReplies(db, conversationId, current.id, reply, metadata)
      : await appendMessage(db, conversationId, 'assistant', reply, metadata);

    if (rawProposal !== null && parsed !== null) {
      let dropped: { reason: DroppedProposalReason; issues: string[] } | null = null;
      if (!parsed.ok) {
        dropped = { reason: parsed.reason, issues: parsed.issues };
      } else {
        const pending = await createPendingAction(db, {
          source: 'chat',
          conversationId,
          messageId: saved.id,
          proposal: parsed.value,
          requestText: current.content,
        });
        if (pending.ok) {
          const skipped = parsed.skipped + pending.skipped;
          const notice = skipped > 0 ? skippedActionsNotice(skipped) : '';
          await updateMessageReply(db, saved.id, {
            ...(notice ? { content: reply + notice } : {}),
            metadata: { ...metadata, pendingActionId: pending.id },
          });
          timing.proposal = skipped > 0 ? `stored:skipped_${skipped}` : 'stored';
          // Field paths and fixed validation messages only: never what the user or the model wrote.
          if (notice) console.warn('proposal actions skipped', { schema: parsed.issues ?? [], target: pending.skippedWhy });
          if (notice) yield { type: 'text', delta: notice };
          yield { type: 'proposal', pendingActionId: pending.id };
        } else {
          dropped = { reason: pending.reason, issues: pending.reason === 'invalid_target' ? pending.detail.split(',') : [] };
        }
      }
      if (dropped) {
        // Field paths and action indices only: never what the user or the model wrote.
        console.warn('proposal dropped', dropped);
        timing.proposal = `dropped:${dropped.reason}`;
        const notice = ignoredProposalNotice(dropped.reason);
        await updateMessageReply(db, saved.id, { content: reply + notice });
        yield { type: 'text', delta: notice };
      }
    }

    yield { type: 'done', assistantMessageId: saved.id, contextRefs: ctx.refs, summaryCount: ctx.summaryCount, stats };
  } finally {
    if (locked) inFlight.delete(locked);
  }
}
