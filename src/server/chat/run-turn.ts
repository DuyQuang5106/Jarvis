import type { Db } from '@/db/client';
import type { MessageRow } from '@/db/schema';
import { APP_TZ, todayIn } from '@/lib/dates';
import { firstChars } from '@/lib/utils';
import { buildContext, listAiExcludedAreas, type ContextRef, type ContextScope } from '../ai/context-builder';
import { hiddenDocumentIds } from '../ai/document-visibility';
import { aliasWorkspaceState, resolveProposalAliases } from '../ai/id-aliases';
import { matchAreas } from '../ai/match-areas';
import { buildSystemPrompt } from '../ai/prompt';
import type { AiProvider, ChatMessage } from '../ai/provider';
import { AiCapExceededError } from '../errors';
import { ProposalBlockFilter, parseProposal } from '../proposals/extract';
import { PROPOSE_CHANGES_TOOL } from '../proposals/schema';
import { createPendingAction, ignoredProposalNotice, supersedeForMessage, type DroppedProposalReason } from '../proposals/store';
import { countAiRequest } from '../services/ai-usage';
import {
  appendMessage,
  createConversation,
  getConversation,
  listMessagesBefore,
  replaceReplies,
  updateMessageReply,
} from '../services/conversations';
import { allowsProposal } from './intent';

export type TurnEvent =
  | { type: 'meta'; conversationId: string; userMessageId: string }
  /** Transient progress shown while nothing has been written yet; never saved, never part of the reply. */
  | { type: 'status'; message: string }
  | { type: 'text'; delta: string }
  | { type: 'proposal'; pendingActionId: string }
  | { type: 'done'; assistantMessageId: string; contextRefs: ContextRef[]; summaryCount: number }
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
};
export type TurnInput = { conversationId?: string; message?: string; scope: ContextScope; regenerate?: boolean };

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
export const HIDDEN_HISTORY = '[Tin nhắn cũ đã ẩn vì liên quan mục không gửi cho AI]';

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
};

/** Conversations with a turn in progress in this server process: a second concurrent turn is refused. */
const inFlight = new Set<string>();

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

/** One chat turn; whatever happens (reply, error, `Dừng`), exactly one `chat turn` timing line is logged. */
export async function* runChatTurn(deps: TurnDeps, input: TurnInput): AsyncGenerator<TurnEvent> {
  const started = performance.now();
  const timing: TurnTiming = { contextMs: null, firstTokenMs: null, promptChars: null, documents: null, finishReason: null, proposal: 'none' };
  try {
    yield* turn(deps, input, timing, started);
  } finally {
    console.info('chat turn', {
      ...timing,
      totalMs: Math.round(performance.now() - started),
      ...(deps.model ? { model: deps.model } : {}),
    });
  }
}

async function* turn(deps: TurnDeps, input: TurnInput, timing: TurnTiming, started: number): AsyncGenerator<TurnEvent> {
  const { db } = deps;
  const elapsed = () => Math.round(performance.now() - started);

  // 1. Check the input and find the conversation. No awaits between the busy check and taking the lock.
  let existing: MessageRow[] | null = null;
  let text = '';
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
        conversationId = (await createConversation(db, firstChars(text, TITLE_LEN))).id;
        lock(conversationId);
      }
      current = await appendMessage(db, conversationId, 'user', text);
      before = await listMessagesBefore(db, conversationId, current.id);
    }

    // 3. Meta.
    yield { type: 'meta', conversationId, userMessageId: current.id };

    // 4. Daily cap.
    try {
      await countAiRequest(db, todayIn(APP_TZ, deps.now), deps.dailyCap);
    } catch (e) {
      if (e instanceof AiCapExceededError) return yield err('Đã chạm trần số lượt hỏi AI hôm nay.');
      throw e;
    }

    // 5. Context.
    const contextStarted = performance.now();
    const history = await historyForModel(db, before.slice(-HISTORY));
    const ctx = await buildContext(db, {
      message: current.content,
      recentUserMessages: history.filter((m) => m.role === 'user' && m.content !== HIDDEN_HISTORY).map((m) => m.content),
      scope: input.scope,
      now: deps.now,
    });
    timing.contextMs = Math.round(performance.now() - contextStarted);
    timing.documents = ctx.state.documents?.filter((d) => d.content !== undefined || d.excerpts?.length).length ?? 0;
    yield { type: 'status', message: READING(timing.documents) };

    // 6. Stream. Alias entity UUIDs so external AI proxies that scrub UUIDs cannot corrupt IDs.
    // A pure question gets no proposal machinery: no tool, no `<proposed_actions>` instructions.
    const actionMode = allowsProposal(current.content) ? deps.actionMode : 'off';
    const aliased = aliasWorkspaceState(ctx.state);
    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt({ stateJson: aliased.json, actionMode }) },
      ...history,
      { role: 'user', content: current.content },
    ];
    timing.promptChars = messages.reduce((n, m) => n + m.content.length, 0);
    const tools = actionMode === 'tools' ? [PROPOSE_CHANGES_TOOL] : undefined;
    const filter = actionMode === 'json' ? new ProposalBlockFilter() : null;
    let reply = '';
    let rawProposal: string | null = null;
    try {
      const events = deps.provider.stream({
        messages,
        tools,
        maxOutputTokens: deps.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        signal: deps.signal,
        onFinishReason: (reason) => {
          timing.finishReason = reason;
        },
      });
      for await (const e of events) {
        timing.firstTokenMs ??= elapsed();
        if (e.type === 'text') {
          if (filter) {
            const out = filter.push(e.delta);
            if (out) {
              reply += out;
              yield { type: 'text', delta: out };
            }
          } else {
            reply += e.delta;
            yield { type: 'text', delta: e.delta };
          }
        } else if (e.type === 'tool_call' && e.name === PROPOSE_CHANGES_TOOL.name && rawProposal === null) {
          rawProposal = e.argsJson;
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

    const resolvedProposal = rawProposal !== null ? resolveProposalAliases(rawProposal, aliased.aliasToReal) : null;
    const parsed = resolvedProposal !== null ? parseProposal(resolvedProposal) : null;
    if (reply.trim() === '') {
      if (parsed?.ok) {
        reply = parsed.value.summary;
        yield { type: 'text', delta: reply };
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
    const metadata: Record<string, unknown> = { contextRefs: ctx.refs, summaryCount: ctx.summaryCount, truncated: ctx.truncated };
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
          await updateMessageReply(db, saved.id, { metadata: { ...metadata, pendingActionId: pending.id } });
          timing.proposal = 'stored';
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

    yield { type: 'done', assistantMessageId: saved.id, contextRefs: ctx.refs, summaryCount: ctx.summaryCount };
  } finally {
    if (locked) inFlight.delete(locked);
  }
}
