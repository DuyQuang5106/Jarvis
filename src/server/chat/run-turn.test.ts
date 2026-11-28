import { eq } from 'drizzle-orm';
import { beforeEach, expect, test, vi } from 'vitest';
import type { Db } from '@/db/client';
import { conversations, messages } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { createMockProvider } from '../ai/mock';
import type { AiProvider, StreamRequest } from '../ai/provider';
import { createArea, updateArea } from '../services/areas';
import { noteService, taskService, topicService } from '../services/entities';
import { documentService } from '../services/documents';
import { runChatTurn, TRUNCATED_NOTICE, type TurnDeps, type TurnEvent, type TurnInput } from './run-turn';

const NOW = new Date('2026-11-22T03:00:00Z');
const manual = { origin: 'manual' as const };
let db: Db;
beforeEach(async () => { db = await createTestDb(); });

async function turn(input: Partial<TurnInput>, provider: AiProvider = createMockProvider(), extra: number | Partial<TurnDeps> = {}) {
  const more = typeof extra === 'number' ? { dailyCap: extra } : extra;
  const events: TurnEvent[] = [];
  for await (const e of runChatTurn({ db, provider, actionMode: 'off', dailyCap: 200, now: NOW, ...more }, { scope: { mode: 'auto' }, ...input })) events.push(e);
  return events;
}
const textOf = (events: TurnEvent[]) => events.filter((e) => e.type === 'text').map((e) => (e as { delta: string }).delta).join('');
const cid = (events: TurnEvent[]) => (events[0] as { conversationId: string }).conversationId;
const rows = () => db.select().from(messages).orderBy(messages.createdAt);

test('lượt đầu tạo cuộc chat, lưu hai tin nhắn, trả lời từ state trong DB', async () => {
  const mob = await createArea(db, { kind: 'academic', name: 'Mobile Programming', status: 'not_started' }, manual);
  await topicService.create(db, { areaId: mob.id, title: 'Navigation', status: 'practiced' }, manual);
  const events = await turn({ message: 'Mobile Programming đang ở tình trạng nào?' });
  expect(events.map((e) => e.type)).toEqual(['meta', 'status', 'text', 'text', 'done']);
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

test('tiêu đề không cắt đôi emoji', async () => {
  await turn({ message: `${'a'.repeat(59)}😀😀` });
  expect((await db.select().from(conversations))[0].title).toBe(`${'a'.repeat(59)}😀`);
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
  expect(seen[1].maxOutputTokens).toBe(4000);
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
  expect(events.map((e) => e.type)).toEqual(['meta', 'status', 'error']);
  expect((events[2] as { message: string }).message).toBe('Không gọi được AI. Dữ liệu của bạn không bị ảnh hưởng, có thể thử lại.');
  expect((await rows()).map((m) => m.role)).toEqual(['user']);
  expect(log).toHaveBeenCalledWith('chat turn failed', { name: 'AiProviderError', status: undefined });
  log.mockRestore();
});

test('stream đứt giữa chừng: không lưu câu trả lời dở', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const events = await turn({ message: 'MOCK_PARTIAL_ERROR' });
  expect(events.map((e) => e.type)).toEqual(['meta', 'status', 'text', 'error']);
  expect((await rows()).map((m) => m.role)).toEqual(['user']);
  log.mockRestore();
});

test('thử lại sau lỗi không nhân đôi tin nhắn người dùng', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const failing: AiProvider = { stream: async function* () { throw Object.assign(new Error('x'), { name: 'AiProviderError' }); } };
  const first = await turn({ message: 'Hôm nay nên làm gì?' }, failing);
  const conversationId = cid(first);
  const retry = await turn({ conversationId, regenerate: true });
  expect(retry.map((e) => e.type)).toEqual(['meta', 'status', 'text', 'text', 'done']);
  expect((await rows()).map((m) => m.role)).toEqual(['user', 'assistant']);
  log.mockRestore();
});

test('regenerate thay câu trả lời cuối', async () => {
  const first = await turn({ message: 'xin chào' });
  const conversationId = cid(first);
  const before = await rows();
  const again = await turn({ conversationId, regenerate: true });
  const after = await rows();
  expect(after.map((m) => m.role)).toEqual(['user', 'assistant']);
  expect(after[0].id).toBe(before[0].id);
  expect(after[1].id).not.toBe(before[1].id);
  expect(again.at(-1)).toMatchObject({ type: 'done', assistantMessageId: after[1].id });
});

/** Saves one good turn, then returns its conversation and the saved rows. */
async function goodTurn() {
  const conversationId = cid(await turn({ message: 'xin chào' }));
  return { conversationId, before: await rows() };
}

test('regenerate lỗi ở provider: giữ câu trả lời cũ', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { conversationId, before } = await goodTurn();
  const failing: AiProvider = { stream: async function* () { throw Object.assign(new Error('x'), { name: 'AiProviderError' }); } };
  const events = await turn({ conversationId, regenerate: true }, failing);
  expect(events.at(-1)).toMatchObject({ type: 'error' });
  expect(await rows()).toEqual(before);
  log.mockRestore();
});

test('regenerate bị trần chặn: giữ câu trả lời cũ', async () => {
  const { conversationId, before } = await goodTurn();
  const events = await turn({ conversationId, regenerate: true }, createMockProvider(), 1);
  expect(events.at(-1)).toEqual({ type: 'error', message: 'Đã chạm trần số lượt hỏi AI hôm nay.' });
  expect(await rows()).toEqual(before);
});

test('regenerate bị Dừng: giữ câu trả lời cũ, không ghi log lỗi', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { conversationId, before } = await goodTurn();
  const ac = new AbortController();
  const provider: AiProvider = {
    async *stream(req) {
      yield { type: 'text', delta: 'một phần' };
      if (req.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      await new Promise((_, reject) => req.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    },
  };
  const events: TurnEvent[] = [];
  const deps = { db, provider, actionMode: 'off' as const, dailyCap: 200, now: NOW, signal: ac.signal };
  for await (const e of runChatTurn(deps, { scope: { mode: 'auto' }, conversationId, regenerate: true })) {
    events.push(e);
    if (e.type === 'text') ac.abort();
  }
  expect(events.map((e) => e.type)).toEqual(['meta', 'status', 'text', 'error']);
  expect(await rows()).toEqual(before);
  expect(log).not.toHaveBeenCalled();
  log.mockRestore();
});

test('provider trả lời rỗng: coi như lỗi, không lưu tin assistant rỗng', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const empty: AiProvider = { async *stream() { yield { type: 'text', delta: '  ' }; } };
  const events = await turn({ message: 'xin chào' }, empty);
  expect(events.at(-1)).toEqual({ type: 'error', message: 'Không gọi được AI. Dữ liệu của bạn không bị ảnh hưởng, có thể thử lại.' });
  expect((await rows()).map((m) => m.role)).toEqual(['user']);
  log.mockRestore();
});

test('meta mang id của đúng tin người dùng vừa lưu; các lượt nối tiếp ghép đúng cặp', async () => {
  const seen: StreamRequest[] = [];
  const spy: AiProvider = { stream: (req) => { seen.push(req); return createMockProvider().stream(req); } };
  const a = await turn({ message: 'câu một' }, spy);
  const conversationId = cid(a);
  const b = await turn({ conversationId, message: 'câu hai' }, spy);
  const saved = await rows();
  expect(saved.map((m) => [m.role, m.content.startsWith('MOCK') ? 'reply' : m.content])).toEqual([
    ['user', 'câu một'], ['assistant', 'reply'], ['user', 'câu hai'], ['assistant', 'reply'],
  ]);
  expect(a[0]).toMatchObject({ type: 'meta', userMessageId: saved[0].id });
  expect(b[0]).toMatchObject({ type: 'meta', userMessageId: saved[2].id });
  expect(seen[0].messages.slice(1)).toEqual([{ role: 'user', content: 'câu một' }]);
  expect(seen[1].messages.slice(1).map((m) => m.content)).toEqual(['câu một', saved[1].content, 'câu hai']);
});

test('lượt thứ hai trong lúc lượt đầu còn chạy: báo bận, không lưu gì thêm', async () => {
  const conversationId = cid(await turn({ message: 'mở đầu' }));
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const slow: AiProvider = { async *stream() { yield { type: 'text', delta: 'chậm' }; await gate; yield { type: 'text', delta: ' xong' }; } };
  const first = runChatTurn({ db, provider: slow, actionMode: 'off', dailyCap: 200, now: NOW }, { scope: { mode: 'auto' }, conversationId, message: 'câu A' });
  const firstEvents: TurnEvent[] = [];
  for (;;) {
    const r = await first.next();
    firstEvents.push(r.value as TurnEvent);
    if ((r.value as TurnEvent).type === 'text') break;
  }
  const busy = [{ type: 'error', message: 'Đang có một câu trả lời khác trong cuộc chat này, đợi xong rồi thử lại.' }];
  expect(await turn({ conversationId, message: 'câu B' })).toEqual(busy);
  expect(await turn({ conversationId, regenerate: true })).toEqual(busy);
  release();
  for await (const e of first) firstEvents.push(e);
  expect(firstEvents.at(-1)).toMatchObject({ type: 'done' });
  const saved = await rows();
  expect(saved.map((m) => m.content)).toEqual(['mở đầu', saved[1].content, 'câu A', 'chậm xong']);
  // The lock is released: the next turn runs.
  expect((await turn({ conversationId, message: 'câu C' })).at(-1)).toMatchObject({ type: 'done' });
});

test('lịch sử không gửi lại nội dung của mục vừa bị loại khỏi AI', async () => {
  const area = await createArea(db, { kind: 'project', name: 'Dự án Bí Mật', status: 'active' }, manual);
  await taskService.create(db, { areaId: area.id, title: 'Ký hợp đồng NDA-7731' }, manual);
  await noteService.create(db, { areaId: area.id, text: 'Mật khẩu kho là cá-voi-xanh' }, manual);
  const seen: StreamRequest[] = [];
  const parrot: AiProvider = {
    async *stream(req) {
      seen.push(req);
      // Like a model quoting the state: the reply repeats the task title and the note text.
      yield { type: 'text', delta: 'Còn Ký hợp đồng NDA-7731; ghi chú: Mật khẩu kho là cá-voi-xanh' };
    },
  };
  const conversationId = cid(await turn({ message: 'Dự án Bí Mật tới đâu rồi?' }, parrot));
  expect(JSON.stringify(seen[0])).toContain('cá-voi-xanh'); // the area was expanded the first time
  await updateArea(db, area.id, { aiExcluded: true }, manual);
  await turn({ conversationId, message: 'còn gì nữa không?' }, parrot);
  const sent = JSON.stringify(seen[1]);
  for (const secret of ['Dự án Bí Mật', 'NDA-7731', 'cá-voi-xanh']) expect(sent).not.toContain(secret);
  expect(seen[1].messages.slice(1)).toEqual([
    { role: 'user', content: '[Tin nhắn cũ đã ẩn vì liên quan mục không gửi cho AI]' },
    { role: 'assistant', content: '[Tin nhắn cũ đã ẩn vì liên quan mục không gửi cho AI]' },
    { role: 'user', content: 'còn gì nữa không?' },
  ]);
});

test('tin nhắn nhắc mục không gửi cho AI: không gọi AI, giải thích cách bật lại', async () => {
  const area = await createArea(db, { kind: 'academic', name: 'Computer Networks', aliases: ['Mạng máy tính'], status: 'active' }, manual);
  await updateArea(db, area.id, { aiExcluded: true }, manual);
  const seen: StreamRequest[] = [];
  const spy: AiProvider = { stream: (req) => { seen.push(req); return createMockProvider().stream(req); } };
  const events = await turn({ message: 'cập nhật tiến độ: buổi tối tôi học computer networks, xong Parity' }, spy);
  expect(seen).toHaveLength(0);
  expect(events.map((e) => e.type)).toEqual(['meta', 'text', 'done']);
  expect(textOf(events)).toContain('**Computer Networks** đang bật "Không gửi cho AI"');
  expect(textOf(events)).toContain('Tạo lại');
  const saved = await rows();
  expect(saved.map((m) => m.role)).toEqual(['user', 'assistant']);
  expect(saved[1].metadata).toMatchObject({ stats: { inputTokens: 0, outputTokens: 0 } });

  // Turned back on, "Tạo lại" answers the same message with the AI and replaces the notice.
  await updateArea(db, area.id, { aiExcluded: false }, manual);
  const again = await turn({ conversationId: cid(events), regenerate: true }, spy);
  expect(seen).toHaveLength(1);
  expect(textOf(again)).not.toContain('Không gửi cho AI');
  expect((await rows()).map((m) => m.role)).toEqual(['user', 'assistant']);

  // By alias, too; a message about another area is not blocked.
  await updateArea(db, area.id, { aiExcluded: true }, manual);
  expect(textOf(await turn({ message: 'Mạng máy tính thi khi nào?' }, spy))).toContain('Không gửi cho AI');
  await turn({ message: 'hôm nay nên làm gì?' }, spy);
  expect(seen).toHaveLength(2);
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

test('phát status trước text và báo số tài liệu', async () => {
  const algebra = await createArea(db, { kind: 'academic', name: 'Algebra', status: 'active' }, manual);
  await documentService.create(db, { areaId: algebra.id, title: '04_STATE', bodyMd: '# Trạng thái\nĐang học chương 5.' }, manual);
  await documentService.create(db, { areaId: algebra.id, title: '06_TIMELINE', bodyMd: '# Lịch\nThi ngày 2027-01-05.' }, manual);
  const events = await turn({ message: 'Algebra sao rồi' });
  const i = events.findIndex((e) => e.type === 'status');
  expect(i).toBeGreaterThan(-1);
  expect(i).toBeLessThan(events.findIndex((e) => e.type === 'text'));
  expect((events[i] as { message: string }).message).toBe('Đang đọc 2 tài liệu…');
  expect((await rows()).at(-1)!.content).not.toContain('Đang đọc');
});

test('không có tài liệu: status là Đang suy nghĩ…', async () => {
  const events = await turn({ message: 'xin chào' });
  expect(events.find((e) => e.type === 'status')).toEqual({ type: 'status', message: 'Đang suy nghĩ…' });
});

test('finish_reason length: thêm ghi chú bị cắt và lưu cùng nội dung', async () => {
  const events = await turn({ message: 'MOCK_LENGTH' });
  expect(textOf(events)).toBe('Phần đầu' + TRUNCATED_NOTICE);
  expect((await rows()).at(-1)!.content).toBe('Phần đầu' + TRUNCATED_NOTICE);
});

test('finish_reason khác length: không thêm ghi chú', async () => {
  const provider: AiProvider = { async *stream(req) { yield { type: 'text', delta: 'Đủ.' }; req.onFinishReason?.('stop'); } };
  expect(textOf(await turn({ message: 'xin chào' }, provider))).toBe('Đủ.');
});

test('truyền maxOutputTokens từ deps', async () => {
  const seen: StreamRequest[] = [];
  const spy: AiProvider = { stream: (req) => { seen.push(req); return createMockProvider().stream(req); } };
  await turn({ message: 'xin chào' }, spy, { maxOutputTokens: 6000 });
  expect(seen[0].maxOutputTokens).toBe(6000);
});

test('log thời gian không chứa nội dung', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  await turn({ message: 'nội dung bí mật 123' });
  const line = JSON.stringify(info.mock.calls);
  expect(line).toContain('firstTokenMs');
  expect(line).not.toContain('bí mật');
  expect(info).toHaveBeenCalledTimes(1);
  expect(info.mock.calls[0][0]).toBe('chat turn');
  expect(info.mock.calls[0][1]).toMatchObject({ documents: 0, finishReason: null, proposal: 'none' });
  info.mockRestore();
});

test('log thời gian vẫn ghi đúng một dòng khi provider lỗi', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  await turn({ message: 'MOCK_ERROR' });
  expect(info).toHaveBeenCalledTimes(1);
  expect(info.mock.calls[0][1]).toMatchObject({ firstTokenMs: null, proposal: 'none' });
  info.mockRestore();
  log.mockRestore();
});

test('ô chat: "Chung" và mỗi môn một ô, tin nhắn sau vào đúng ô cũ', async () => {
  const area = await createArea(db, { kind: 'academic', name: 'Algebra', status: 'active' }, manual);
  const g1 = cid(await turn({ message: 'chào', thread: { general: true } }));
  const g2 = cid(await turn({ message: 'chào lần nữa', thread: { general: true } }));
  expect(g2).toBe(g1);
  const a1 = cid(await turn({ message: 'Algebra học gì', thread: { areaId: area.id }, scope: { mode: 'item', areaId: area.id } }));
  const a2 = cid(await turn({ message: 'tiếp', thread: { areaId: area.id }, scope: { mode: 'item', areaId: area.id } }));
  expect(a2).toBe(a1);
  expect(a1).not.toBe(g1);
  const convs = await db.select().from(conversations);
  expect(convs.map((c) => [c.kind, c.title]).sort()).toEqual([['area', 'Algebra'], ['general', 'Chung']]);
  expect(await turn({ message: 'x', thread: { areaId: '00000000-0000-4000-8000-000000000000' } })).toEqual([{ type: 'error', message: 'Không tìm thấy cuộc trò chuyện.' }]);
});

/** Moves a conversation's messages two days before NOW, one second apart, keeping their order. */
async function ageMessages(conversationId: string) {
  const rows = await db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt, messages.id);
  for (const [i, m] of rows.entries()) {
    await db.update(messages).set({ createdAt: new Date(NOW.getTime() - 2 * 86_400_000 + i * 1000) }).where(eq(messages.id, m.id));
  }
}

test('H2: ô chat chỉ gửi lại cho AI tin trong 24 giờ; cuộc chat cũ giữ cách cũ', async () => {
  const seen: StreamRequest[] = [];
  const spy: AiProvider = { stream: (req) => { seen.push(req); return createMockProvider().stream(req); } };
  const general = cid(await turn({ message: 'hôm qua tôi học CRC', thread: { general: true } }, spy));
  // Make the first exchange two days old.
  await ageMessages(general);
  await turn({ message: 'hôm nay thì sao', thread: { general: true } }, spy);
  expect(seen.at(-1)!.messages.map((m) => m.role)).toEqual(['system', 'user']);

  const old = cid(await turn({ message: 'cuộc chat cũ' }, spy));
  await ageMessages(old);
  await turn({ conversationId: old, message: 'tiếp' }, spy);
  expect(seen.at(-1)!.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
});
