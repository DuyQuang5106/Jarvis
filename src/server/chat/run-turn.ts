import type { Db } from '@/db/client';
import type { MessageRow } from '@/db/schema';
import { APP_TZ, todayIn } from '@/lib/dates';
import { buildContext, type ContextRef, type ContextScope } from '../ai/context-builder';
import { buildSystemPrompt } from '../ai/prompt';
import type { AiProvider, ChatMessage } from '../ai/provider';
import { AiCapExceededError } from '../errors';
import { countAiRequest } from '../services/ai-usage';
import { appendMessage, createConversation, deleteMessage, getConversation } from '../services/conversations';

export type TurnEvent =
  | { type: 'meta'; conversationId: string; userMessageId: string }
  | { type: 'text'; delta: string }
  | { type: 'proposal'; pendingActionId: string } // emitted from Phase 3
  | { type: 'done'; assistantMessageId: string; contextRefs: ContextRef[]; summaryCount: number }
  | { type: 'error'; message: string };
export type TurnDeps = { db: Db; provider: AiProvider; actionMode: 'tools' | 'json' | 'off'; dailyCap: number; now: Date };
export type TurnInput = { conversationId?: string; message?: string; scope: ContextScope; regenerate?: boolean };

const MAX_MESSAGE = 8000;
const TITLE_LEN = 60;
const HISTORY = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const err = (message: string): TurnEvent => ({ type: 'error', message });

async function loadMessages(db: Db, conversationId: string): Promise<MessageRow[] | null> {
  if (!UUID.test(conversationId)) return null;
  return (await getConversation(db, conversationId))?.messages ?? null;
}

export async function* runChatTurn(deps: TurnDeps, input: TurnInput): AsyncGenerator<TurnEvent> {
  const { db } = deps;

  // 1. Prepare the user message.
  let conversationId: string;
  if (input.regenerate) {
    if (!input.conversationId) return yield err('Không có tin nhắn để thử lại.');
    const existing = await loadMessages(db, input.conversationId);
    if (!existing) return yield err('Không tìm thấy cuộc trò chuyện.');
    conversationId = input.conversationId;
    const last = existing.at(-1);
    if (last?.role === 'assistant') await deleteMessage(db, last.id);
  } else {
    const text = (input.message ?? '').trim();
    if (text.length < 1 || text.length > MAX_MESSAGE) return yield err('Tin nhắn trống hoặc quá dài.');
    if (input.conversationId) {
      if (!(await loadMessages(db, input.conversationId))) return yield err('Không tìm thấy cuộc trò chuyện.');
      conversationId = input.conversationId;
    } else {
      conversationId = (await createConversation(db, text.slice(0, TITLE_LEN))).id;
    }
    await appendMessage(db, conversationId, 'user', text);
  }

  const all = (await loadMessages(db, conversationId)) ?? [];
  let userIdx = -1;
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].role === 'user') {
      userIdx = i;
      break;
    }
  }
  if (userIdx < 0) return yield err('Không có tin nhắn để thử lại.');
  const current = all[userIdx];
  const before = all.slice(0, userIdx);

  // 2. Meta.
  yield { type: 'meta', conversationId, userMessageId: current.id };

  // 3. Daily cap.
  try {
    await countAiRequest(db, todayIn(APP_TZ, deps.now), deps.dailyCap);
  } catch (e) {
    if (e instanceof AiCapExceededError) return yield err('Đã chạm trần số lượt hỏi AI hôm nay.');
    throw e;
  }

  // 4. Context.
  const ctx = await buildContext(db, {
    message: current.content,
    recentUserMessages: before.filter((m) => m.role === 'user').map((m) => m.content),
    scope: input.scope,
    now: deps.now,
  });

  // 5. Stream.
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt({ stateJson: ctx.json, actionMode: deps.actionMode }) },
    ...before.slice(-HISTORY).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: current.content },
  ];
  let reply = '';
  try {
    for await (const e of deps.provider.stream({ messages, maxOutputTokens: 1500 })) {
      if (e.type === 'text') {
        reply += e.delta;
        yield { type: 'text', delta: e.delta };
      }
    }
  } catch (e) {
    const x = e as { name?: string; status?: number };
    console.error('chat turn failed', { name: x?.name, status: x?.status });
    return yield err('Không gọi được AI. Dữ liệu của bạn không bị ảnh hưởng, có thể thử lại.');
  }

  // 6. Save the reply.
  const saved = await appendMessage(db, conversationId, 'assistant', reply, {
    contextRefs: ctx.refs,
    summaryCount: ctx.summaryCount,
    truncated: ctx.truncated,
  });
  yield { type: 'done', assistantMessageId: saved.id, contextRefs: ctx.refs, summaryCount: ctx.summaryCount };
}
