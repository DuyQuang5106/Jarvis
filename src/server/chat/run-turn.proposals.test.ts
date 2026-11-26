import { beforeEach, expect, test, vi } from 'vitest';
import type { Db } from '@/db/client';
import { messages, pendingActions, topics } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { createMockProvider } from '../ai/mock';
import type { AiProvider, StreamRequest } from '../ai/provider';
import { ignoredProposalNotice } from '../proposals/store';
import { createArea } from '../services/areas';
import { topicService } from '../services/entities';
import { runChatTurn, type TurnEvent, type TurnInput } from './run-turn';

const NOW = new Date('2026-11-22T03:00:00Z');
const manual = { origin: 'manual' as const };
let db: Db;
let areaId: string;
let topicId: string;

beforeEach(async () => {
  db = await createTestDb();
  const a = await createArea(db, { kind: 'academic', name: 'Mobile Programming', aliases: ['Mobile'], status: 'active' }, manual);
  areaId = a.id;
  topicId = (await topicService.create(db, { areaId, title: 'Chương 1' }, manual)).id;
});

async function turn(actionMode: 'tools' | 'json' | 'off', input: Partial<TurnInput>, provider: AiProvider = createMockProvider()) {
  const events: TurnEvent[] = [];
  for await (const e of runChatTurn({ db, provider, actionMode, dailyCap: 200, now: NOW }, { scope: { mode: 'auto' }, ...input })) {
    events.push(e);
  }
  return events;
}

const text = (events: TurnEvent[]) =>
  events
    .filter((e): e is Extract<TurnEvent, { type: 'text' }> => e.type === 'text')
    .map((e) => e.delta)
    .join('');

test.each(['tools', 'json'] as const)('chế độ %s: tạo pending, KHÔNG ghi dữ liệu (criterion 7)', async (mode) => {
  const events = await turn(mode, { message: 'Tôi đã hoàn thành chương 1 Mobile' });
  expect(events.map((e) => e.type).slice(-2)).toEqual(['proposal', 'done']);
  expect(text(events)).toBe('Ghi nhận. Đề xuất cập nhật.');
  expect(text(events)).not.toContain('proposed_actions');
  const [pending] = await db.select().from(pendingActions);
  expect(pending).toMatchObject({ status: 'pending', source: 'chat' });
  expect((pending.actionsJson as { actions: { action: { type: string } }[] }).actions.map((a) => a.action.type)).toEqual([
    'upsert_topic',
    'add_progress_log',
  ]);
  expect((pending.actionsJson as { actions: { baseUpdatedAt: unknown }[] }).actions[0].baseUpdatedAt).toEqual(expect.any(String));
  expect((await db.select().from(topics))[0].status).toBe('not_started');
  const assistant = (await db.select().from(messages)).find((m) => m.role === 'assistant')!;
  expect(assistant.content).toBe('Ghi nhận. Đề xuất cập nhật.');
  expect(assistant.metadata).toMatchObject({ pendingActionId: pending.id });
  expect(pending.messageId).toBe(assistant.id);
});

test('chế độ off: không truyền tool, không có đề xuất', async () => {
  const events = await turn('off', { message: 'Tôi đã hoàn thành chương 1 Mobile' });
  expect(events.some((e) => e.type === 'proposal')).toBe(false);
  expect(await db.select().from(pendingActions)).toEqual([]);
});

test.each(['tools', 'json'] as const)('chế độ %s: đề xuất không hợp lệ bị bỏ, có dòng báo (criterion 10)', async (mode) => {
  const events = await turn(mode, { message: 'MOCK_BAD_PROPOSAL' });
  expect(events.some((e) => e.type === 'proposal')).toBe(false);
  const notice = ignoredProposalNotice('invalid_target');
  expect(text(events)).toBe('Đề xuất lỗi.' + notice);
  expect(await db.select().from(pendingActions)).toEqual([]);
  expect((await db.select().from(messages)).find((m) => m.role === 'assistant')!.content).toBe('Đề xuất lỗi.' + notice);
});

test('regenerate chuyển đề xuất cũ sang superseded', async () => {
  const first = await turn('tools', { message: 'Tôi đã hoàn thành chương 1 Mobile' });
  const conversationId = (first[0] as { conversationId: string }).conversationId;
  await turn('tools', { conversationId, regenerate: true });
  const all = await db.select().from(pendingActions).orderBy(pendingActions.createdAt);
  expect(all.map((p) => p.status)).toEqual(['superseded', 'pending']);
  void topicId;
});

test.each(['tools', 'json'] as const)('chế độ %s: câu hỏi thuần không nhận tool, không có đề xuất', async (mode) => {
  const seen: StreamRequest[] = [];
  const spy: AiProvider = { stream: (req) => { seen.push(req); return createMockProvider().stream(req); } };
  // The mock proposes for MOCK_BAD_PROPOSAL whenever it is offered the chance.
  const events = await turn(mode, { message: 'MOCK_BAD_PROPOSAL sao rồi?' }, spy);
  expect(seen[0].tools).toBeUndefined();
  expect(seen[0].messages[0].content).not.toContain('<proposed_actions>');
  expect(events.some((e) => e.type === 'proposal')).toBe(false);
  expect(text(events)).not.toContain('proposed_');
  expect(await db.select().from(pendingActions)).toEqual([]);
});

test('đề xuất chỉ ghi hạn vào tài liệu: bỏ, báo lý do deadline_route', async () => {
  const provider: AiProvider = {
    async *stream() {
      yield { type: 'text', delta: 'Ghi hạn.' };
      yield {
        type: 'tool_call',
        name: 'propose_changes',
        argsJson: JSON.stringify({ summary: 'Hạn', actions: [{ type: 'append_to_document', documentId: '00000000-0000-4000-8000-000000000001', markdown: 'Nộp ngày mai.' }] }),
      };
    },
  };
  const events = await turn('tools', { message: 'Hạn nộp báo cáo Mobile là ngày mai, ghi vào tài liệu' }, provider);
  expect(text(events)).toBe('Ghi hạn.' + ignoredProposalNotice('deadline_route'));
  expect(await db.select().from(pendingActions)).toEqual([]);
});

test('bỏ đề xuất: console.warn có lý do, không có nội dung tin nhắn; log thời gian ghi dropped', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  await turn('tools', { message: 'MOCK_BAD_PROPOSAL bí mật 42' });
  expect(warn).toHaveBeenCalledWith('proposal dropped', { reason: 'invalid_target', issues: ['actions[0]'] });
  expect(JSON.stringify(warn.mock.calls)).not.toContain('bí mật');
  expect(info.mock.calls[0][1]).toMatchObject({ proposal: 'dropped:invalid_target' });
  warn.mockRestore();
  info.mockRestore();
});

test('json hỏng định dạng: bỏ, báo lý do parse', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const provider: AiProvider = { async *stream() { yield { type: 'text', delta: 'Xong. <proposed_actions>{"summary":</proposed_actions>' }; } };
  const events = await turn('json', { message: 'ghi lại giúp tôi' }, provider);
  expect(text(events)).toBe('Xong. ' + ignoredProposalNotice('parse'));
  expect(warn).toHaveBeenCalledWith('proposal dropped', { reason: 'parse', issues: [] });
  warn.mockRestore();
});

test('đề xuất được lưu: log thời gian ghi stored', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  await turn('tools', { message: 'Tôi đã hoàn thành chương 1 Mobile' });
  expect(info.mock.calls[0][1]).toMatchObject({ proposal: 'stored' });
  info.mockRestore();
});
