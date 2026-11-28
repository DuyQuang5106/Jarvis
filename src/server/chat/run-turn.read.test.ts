import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { messages } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { AliasBook, TOOL_RESULTS_NOTE } from '../ai/doc-tools';
import { createMockProvider } from '../ai/mock';
import type { AiProvider, StreamRequest } from '../ai/provider';
import { createArea, updateArea } from '../services/areas';
import { documentService } from '../services/documents';
import { runChatTurn, type TurnDeps, type TurnEvent, type TurnInput } from './run-turn';

const NOW = new Date('2026-11-22T03:00:00Z');
const manual = { origin: 'manual' as const };
let db: Db;
beforeEach(async () => { db = await createTestDb(); });

/** The mock provider, recording each request. */
function recording(inner: AiProvider = createMockProvider()) {
  const calls: StreamRequest[] = [];
  const provider: AiProvider = {
    stream(req) {
      calls.push({ ...req, messages: [...req.messages] });
      return inner.stream(req);
    },
  };
  return { provider, calls };
}

async function turn(input: Partial<TurnInput>, provider: AiProvider, more: Partial<TurnDeps> = {}) {
  const events: TurnEvent[] = [];
  for await (const e of runChatTurn({ db, provider, actionMode: 'tools', dailyCap: 200, now: NOW, ...more }, { scope: { mode: 'auto' }, ...input })) events.push(e);
  return events;
}
const textOf = (events: TurnEvent[]) => events.filter((e) => e.type === 'text').map((e) => (e as { delta: string }).delta).join('');
const statuses = (events: TurnEvent[]) => events.filter((e) => e.type === 'status').map((e) => (e as { message: string }).message);
const toolNames = (req: StreamRequest) => (req.tools ?? []).map((t) => t.name).sort();

async function seed() {
  const net = await createArea(db, { kind: 'academic', name: 'Computer Networks', status: 'active' }, manual);
  const doc = await documentService.create(db, { areaId: net.id, title: 'Checksum notes', bodyMd: '# Checksum\nCRC dùng phép chia đa thức modulo 2.' }, manual);
  return { net, doc };
}

test('R1: tìm rồi đọc một tài liệu, rồi trả lời; chỉ câu trả lời được lưu', async () => {
  await seed();
  const { provider, calls } = recording();
  const events = await turn({ message: 'MOCK_READ checksum' }, provider);
  expect(textOf(events)).toBe('MOCK_READ_DONE: Checksum notes — # Checksum\nCRC dùng phép chia đa thức modulo 2.');
  expect(statuses(events).slice(1)).toEqual(['Đang tìm “checksum”…', 'Đang đọc Checksum notes…']);
  expect(calls).toHaveLength(3);
  expect(toolNames(calls[0])).toEqual(['propose_changes', 'read_documents', 'search_documents']);
  // Rounds travel as an assistant turn plus results marked as data.
  const last = calls[2].messages;
  expect(last.at(-1)?.content).toContain(TOOL_RESULTS_NOTE);
  expect(last.at(-2)).toMatchObject({ role: 'assistant' });
  expect(last.at(-2)?.content).toContain('read_documents {"documentIds":["d');
  // No UUID ever reaches the model.
  expect(JSON.stringify(last)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  const saved = await db.select().from(messages).orderBy(messages.createdAt);
  expect(saved.map((m) => m.content)).toEqual(['MOCK_READ checksum', textOf(events)]);
});

test('R1: tài liệu "Không gửi cho AI" (hoặc mục bị loại) không tìm thấy, không đọc được', async () => {
  const { doc } = await seed();
  await documentService.setAiExcluded(db, doc.id, true, manual);
  const { provider } = recording();
  const events = await turn({ message: 'MOCK_READ checksum' }, provider);
  expect(textOf(events)).toBe('MOCK_READ_NONE: không tìm thấy tài liệu phù hợp.');

  // Asked by its UUID directly: still not read.
  const book = new AliasBook(new Map());
  const { runDocTools } = await import('../ai/doc-tools');
  const round = await runDocTools(db, [{ name: 'read_documents', argsJson: JSON.stringify({ documentIds: [doc.id] }) }], book);
  expect(round.read).toBe(0);
  expect(round.results).not.toContain('CRC');
});

test('R1: mục bị loại khỏi AI thì tài liệu của nó cũng ẩn', async () => {
  const { net, doc } = await seed();
  await updateArea(db, net.id, { aiExcluded: true }, manual);
  const { runDocTools } = await import('../ai/doc-tools');
  const book = new AliasBook(new Map());
  const search = await runDocTools(db, [{ name: 'search_documents', argsJson: '{"query":"checksum"}' }], book);
  expect(search.results).not.toContain('Checksum notes');
  const read = await runDocTools(db, [{ name: 'read_documents', argsJson: JSON.stringify({ documentIds: [doc.id] }) }], book);
  expect(read.read).toBe(0);
});

test('R1: tối đa 3 lượt đọc; lượt sau đó không còn công cụ đọc', async () => {
  await seed();
  const greedy: AiProvider = {
    async *stream(req) {
      if (req.tools?.some((t) => t.name === 'search_documents')) {
        yield { type: 'tool_call', name: 'search_documents', argsJson: '{"query":"checksum"}' };
        return;
      }
      yield { type: 'text', delta: 'Trả lời cuối.' };
    },
  };
  const { provider, calls } = recording(greedy);
  const events = await turn({ message: 'Checksum là gì?' }, provider);
  expect(calls).toHaveLength(4);
  expect(toolNames(calls[3])).not.toContain('search_documents');
  expect(textOf(events)).toBe('Trả lời cuối.');
});

test('R1: provider không dùng tool (chế độ json/off) thì không có công cụ đọc', async () => {
  await seed();
  const { provider, calls } = recording();
  const events = await turn({ message: 'MOCK_READ checksum' }, provider, { actionMode: 'off' });
  expect(calls).toHaveLength(1);
  expect(calls[0].tools).toBeUndefined();
  expect(textOf(events)).toBe('MOCK_READ_NONE: không tìm thấy tài liệu phù hợp.');
});

test('R1: đề xuất sau khi đọc dùng được id ngắn của tài liệu vừa đọc', async () => {
  const { doc } = await seed();
  const reader: AiProvider = {
    async *stream(req) {
      const last = req.messages.at(-1)?.content ?? '';
      if (!last.includes(TOOL_RESULTS_NOTE)) {
        yield { type: 'tool_call', name: 'search_documents', argsJson: '{"query":"checksum"}' };
        return;
      }
      const id = /"documentId":"(d\d+)"/.exec(last)?.[1];
      yield { type: 'text', delta: 'Ghi thêm vào ghi chú.' };
      yield {
        type: 'tool_call',
        name: 'propose_changes',
        argsJson: JSON.stringify({ summary: 'Ghi thêm', actions: [{ type: 'append_to_document', documentId: id, heading: 'Checksum', markdown: '- Thêm ví dụ.' }] }),
      };
    },
  };
  const events = await turn({ message: 'Ghi thêm ví dụ checksum vào ghi chú' }, reader);
  const proposal = events.find((e) => e.type === 'proposal') as { pendingActionId: string } | undefined;
  expect(proposal).toBeDefined();
  const { pendingActions } = await import('@/db/schema');
  const [row] = await db.select().from(pendingActions);
  expect(JSON.stringify(row)).toContain(doc.id);
});

test('AliasBook: tiếp số sau các id đã có, giữ id cũ', () => {
  const map = new Map([['d1', 'u1'], ['d2', 'u2'], ['a1', 'v1']]);
  const book = new AliasBook(map);
  expect(book.alias('d', 'u2')).toBe('d2');
  expect(book.alias('d', 'u9')).toBe('d3');
  expect(book.alias('a', 'v9')).toBe('a2');
  expect(map.get('d3')).toBe('u9');
  expect(book.real('d3')).toBe('u9');
  expect(book.real('zz')).toBeNull();
});
