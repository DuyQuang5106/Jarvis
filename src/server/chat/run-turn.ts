import type { Db } from '@/db/client';
import type { MessageRow } from '@/db/schema';
import { APP_TZ, todayIn } from '@/lib/dates';
import { firstChars } from '@/lib/utils';
import { buildContext, listAiExcludedAreas, type ContextRef, type ContextScope } from '../ai/context-builder';
import { matchAreas } from '../ai/match-areas';
import { buildSystemPrompt } from '../ai/prompt';
import type { AiProvider, ChatMessage } from '../ai/provider';
import { AiCapExceededError } from '../errors';
import { countAiRequest } from '../services/ai-usage';
import {
  appendMessage,
  createConversation,
  getConversation,
  listMessagesBefore,
  replaceReplies,
} from '../services/conversations';

export type TurnEvent =
  | { type: 'meta'; conversationId: string; userMessageId: string }
  | { type: 'text'; delta: string }
  | { type: 'proposal'; pendingActionId: string } // emitted from Phase 3
  | { type: 'done'; assistantMessageId: string; contextRefs: ContextRef[]; summaryCount: number }
  | { type: 'error'; message: string };
export type TurnDeps = { db: Db; provider: AiProvider; actionMode: 'tools' | 'json' | 'off'; dailyCap: number; now: Date; signal?: AbortSignal };
export type TurnInput = { conversationId?: string; message?: string; scope: ContextScope; regenerate?: boolean };

const MAX_MESSAGE = 8000;
const TITLE_LEN = 60;
const HISTORY = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOT_FOUND = 'Không tìm thấy cuộc trò chuyện.';
const NOTHING_TO_RETRY = 'Không có tin nhắn để thử lại.';
const BUSY = 'Đang có một câu trả lời khác trong cuộc chat này, đợi xong rồi thử lại.';
const PROVIDER_FAILED = 'Không gọi được AI. Dữ liệu của bạn không bị ảnh hưởng, có thể thử lại.';
/** Stands in for a history message that touches an area now excluded from AI. */
export const HIDDEN_HISTORY = '[Tin nhắn cũ đã ẩn vì liên quan mục không gửi cho AI]';

const err = (message: string): TurnEvent => ({ type: 'error', message });

/** Conversations with a turn in progress in this server process: a second concurrent turn is refused. */
const inFlight = new Set<string>();

async function loadMessages(db: Db, conversationId: string): Promise<MessageRow[] | null> {
  if (!UUID.test(conversationId)) return null;
  return (await getConversation(db, conversationId))?.messages ?? null;
}

const refAreaIds = (metadata: unknown): string[] => {
  const refs = (metadata as { contextRefs?: unknown } | null)?.contextRefs;
  return Array.isArray(refs) ? refs.map((r) => (r as { areaId?: unknown })?.areaId).filter((id): id is string => typeof id === 'string') : [];
};

/** History as sent to the model: a message tied to an area excluded since (by its refs or its text) is replaced. */
async function historyForModel(db: Db, history: MessageRow[]): Promise<ChatMessage[]> {
  const excluded = await listAiExcludedAreas(db);
  const excludedIds = new Set(excluded.map((a) => a.id));
  return history.map((m) => {
    const hidden =
      excluded.length > 0 &&
      (refAreaIds(m.metadata).some((id) => excludedIds.has(id)) || matchAreas([m.content], excluded).length > 0);
    return { role: m.role, content: hidden ? HIDDEN_HISTORY : m.content };
  });
}

export async function* runChatTurn(deps: TurnDeps, input: TurnInput): AsyncGenerator<TurnEvent> {
  const { db } = deps;

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
    if (input.regenerate) {
      conversationId = input.conversationId!;
      const msgs = existing!;
      const idx = msgs.findLastIndex((m) => m.role === 'user');
      if (idx < 0) return yield err(NOTHING_TO_RETRY);
      lock(conversationId);
      current = msgs[idx];
      before = msgs.slice(0, idx);
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
    const ctx = await buildContext(db, {
      message: current.content,
      recentUserMessages: before.filter((m) => m.role === 'user').map((m) => m.content),
      scope: input.scope,
      now: deps.now,
    });

    // 6. Stream.
    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt({ stateJson: ctx.json, actionMode: deps.actionMode }) },
      ...(await historyForModel(db, before.slice(-HISTORY))),
      { role: 'user', content: current.content },
    ];
    let reply = '';
    try {
      for await (const e of deps.provider.stream({ messages, maxOutputTokens: 1500, signal: deps.signal })) {
        if (e.type === 'text') {
          reply += e.delta;
          yield { type: 'text', delta: e.delta };
        }
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
    if (reply.trim() === '') {
      console.error('chat turn failed', { name: 'EmptyReply', status: undefined });
      return yield err(PROVIDER_FAILED);
    }

    // 7. Save the reply. Regenerate replaces the old reply only now that the new one exists.
    const metadata = { contextRefs: ctx.refs, summaryCount: ctx.summaryCount, truncated: ctx.truncated };
    const saved = input.regenerate
      ? await replaceReplies(db, conversationId, current.id, reply, metadata)
      : await appendMessage(db, conversationId, 'assistant', reply, metadata);
    yield { type: 'done', assistantMessageId: saved.id, contextRefs: ctx.refs, summaryCount: ctx.summaryCount };
  } finally {
    if (locked) inFlight.delete(locked);
  }
}
