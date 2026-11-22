import { beforeEach, expect, test, vi } from 'vitest';
import type { Db } from '@/db/client';
import { conversations, messages } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { createMockProvider } from '../ai/mock';
import type { AiProvider, StreamRequest } from '../ai/provider';
import { createArea } from '../services/areas';
import { topicService } from '../services/entities';
import { runChatTurn, type TurnEvent, type TurnInput } from './run-turn';

const NOW = new Date('2026-11-22T03:00:00Z');
const manual = { origin: 'manual' as const };
let db: Db;
beforeEach(async () => { db = await createTestDb(); });

async function turn(input: Partial<TurnInput>, provider: AiProvider = createMockProvider(), dailyCap = 200) {
  const events: TurnEvent[] = [];
  for await (const e of runChatTurn({ db, provider, actionMode: 'off', dailyCap, now: NOW }, { scope: { mode: 'auto' }, ...input })) events.push(e);
  return events;
}
const textOf = (events: TurnEvent[]) => events.filter((e) => e.type === 'text').map((e) => (e as { delta: string }).delta).join('');
const cid = (events: TurnEvent[]) => (events[0] as { conversationId: string }).conversationId;
const rows = () => db.select().from(messages).orderBy(messages.createdAt);

test('lượt đầu tạo cuộc chat, lưu hai tin nhắn, trả lời từ state trong DB', async () => {
  const mob = await createArea(db, { kind: 'academic', name: 'Mobile Programming', status: 'not_started' }, manual);
  await topicService.create(db, { areaId: mob.id, title: 'Navigation', status: 'practiced' }, manual);
  const events = await turn({ message: 'Mobile Programming đang ở tình trạng nào?' });
  expect(events.map((e) => e.type)).toEqual(['meta', 'text', 'text', 'done']);
  expect(textOf(events)).toBe('MOCK_STATE today=2026-11-22 | Mobile Programming=not_started | detail:Mobile Programming topics:Navigation=practiced');
  const [conv] = await db.select().from(conversations);
  expect(conv.title).toBe('Mobile Programming đang ở tình trạng nào?');
  const saved = await rows();
  expect(saved.map((m) => m.role)).toEqual(['user', 'assistant']);
  expect(saved[1].metadata).toMatchObject({ contextRefs: [{ areaId: mob.id, name: 'Mobile Programming' }], summaryCount: 1, truncated: false });
  expect(events.at(-1)).toMatchObject({ type: 'done', assistantMessageId: saved[1].id, summaryCount: 1 });
});

test('tiêu đề cắt ở 60 ký tự', async () => {
  await turn({ message: 'a'.repeat(100) });
  expect((await db.select().from(conversations))[0].title).toBe('a'.repeat(60));
});

test('lượt sau đọc state mới (criterion 6) và gửi kèm lịch sử', async () => {
  const mob = await createArea(db, { kind: 'academic', name: 'Mobile Programming', status: 'not_started' }, manual);
  const topic = await topicService.create(db, { areaId: mob.id, title: 'Navigation' }, manual);
  const seen: StreamRequest[] = [];
  const spy: AiProvider = { stream: (req) => { seen.push(req); return createMockProvider().stream(req); } };
  const first = await turn({ message: 'Mobile Programming sao rồi' }, spy);
  const conversationId = cid(first);
  await topicService.update(db, topic.id, { status: 'confident' }, manual);
  const second = await turn({ conversationId, message: 'giờ thì sao?' }, spy);
  expect(textOf(second)).toContain('Navigation=confident'); // auto khớp nhờ tin nhắn trước
  expect(seen[1].messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
  expect(seen[1].maxOutputTokens).toBe(1500);
  expect(seen[1].tools).toBeUndefined();
});

test('chỉ gửi 10 tin nhắn gần nhất làm lịch sử', async () => {
  const seen: StreamRequest[] = [];
  const spy: AiProvider = { stream: (req) => { seen.push(req); return createMockProvider().stream(req); } };
  let conversationId: string | undefined;
  for (let i = 0; i < 7; i++) conversationId = cid(await turn({ conversationId, message: `câu ${i}` }, spy));
  expect(seen.at(-1)!.messages).toHaveLength(1 + 10 + 1);
});

test('provider lỗi ngay: giữ tin nhắn người dùng, không lưu assistant', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const events = await turn({ message: 'MOCK_ERROR' });
  expect(events.map((e) => e.type)).toEqual(['meta', 'error']);
  expect((events[1] as { message: string }).message).toBe('Không gọi được AI. Dữ liệu của bạn không bị ảnh hưởng, có thể thử lại.');
  expect((await rows()).map((m) => m.role)).toEqual(['user']);
  expect(log).toHaveBeenCalledWith('chat turn failed', { name: 'AiProviderError', status: undefined });
  log.mockRestore();
});

test('stream đứt giữa chừng: không lưu câu trả lời dở', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const events = await turn({ message: 'MOCK_PARTIAL_ERROR' });
  expect(events.map((e) => e.type)).toEqual(['meta', 'text', 'error']);
  expect((await rows()).map((m) => m.role)).toEqual(['user']);
  log.mockRestore();
});

test('thử lại sau lỗi không nhân đôi tin nhắn người dùng', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const failing: AiProvider = { stream: async function* () { throw Object.assign(new Error('x'), { name: 'AiProviderError' }); } };
  const first = await turn({ message: 'Hôm nay nên làm gì?' }, failing);
  const conversationId = cid(first);
  const retry = await turn({ conversationId, regenerate: true });
  expect(retry.map((e) => e.type)).toEqual(['meta', 'text', 'text', 'done']);
  expect((await rows()).map((m) => m.role)).toEqual(['user', 'assistant']);
  log.mockRestore();
});

test('regenerate thay câu trả lời cuối', async () => {
  const first = await turn({ message: 'xin chào' });
  const conversationId = cid(first);
  const before = await rows();
  await turn({ conversationId, regenerate: true });
  const after = await rows();
  expect(after.map((m) => m.role)).toEqual(['user', 'assistant']);
  expect(after[1].id).not.toBe(before[1].id);
});

test('regenerate thiếu cuộc chat hoặc không có tin nhắn người dùng', async () => {
  expect(await turn({ regenerate: true })).toEqual([{ type: 'error', message: 'Không có tin nhắn để thử lại.' }]);
  const [conv] = await db.insert(conversations).values({ title: 'trống' }).returning();
  expect(await turn({ conversationId: conv.id, regenerate: true })).toEqual([{ type: 'error', message: 'Không có tin nhắn để thử lại.' }]);
});

test('conversationId lạ hoặc sai định dạng', async () => {
  const notFound = [{ type: 'error', message: 'Không tìm thấy cuộc trò chuyện.' }];
  expect(await turn({ conversationId: '00000000-0000-4000-8000-000000000000', message: 'hi' })).toEqual(notFound);
  expect(await turn({ conversationId: 'không-phải-uuid', message: 'hi' })).toEqual(notFound);
  expect(await turn({ conversationId: '00000000-0000-4000-8000-000000000000', regenerate: true })).toEqual(notFound);
  expect(await rows()).toEqual([]);
});

test('đầu vào không hợp lệ', async () => {
  expect(await turn({ message: '   ' })).toEqual([{ type: 'error', message: 'Tin nhắn trống hoặc quá dài.' }]);
  expect(await turn({ message: 'x'.repeat(8001) })).toEqual([{ type: 'error', message: 'Tin nhắn trống hoặc quá dài.' }]);
  expect(await rows()).toEqual([]);
});

test('chạm trần trong ngày', async () => {
  await turn({ message: 'một' }, createMockProvider(), 1);
  const events = await turn({ message: 'hai' }, createMockProvider(), 1);
  expect(events.at(-1)).toEqual({ type: 'error', message: 'Đã chạm trần số lượt hỏi AI hôm nay.' });
});

test('database trống vẫn trả lời được', async () => {
  expect(textOf(await turn({ message: 'Hôm nay nên làm gì?' }))).toBe('MOCK_STATE today=2026-11-22 | ');
});

test('signal được chuyển xuống provider', async () => {
  const ac = new AbortController();
  let seen: AbortSignal | undefined;
  const provider: AiProvider = {
    async *stream(req: StreamRequest) { seen = req.signal; yield { type: 'text', delta: 'x' }; },
  };
  await Array.fromAsync(runChatTurn({ db, provider, actionMode: 'off', dailyCap: 200, now: NOW, signal: ac.signal }, { scope: { mode: 'auto' }, message: 'hi' }));
  expect(seen).toBe(ac.signal);
});
