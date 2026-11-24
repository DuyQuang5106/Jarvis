import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { messages, pendingActions, topics } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { createMockProvider } from '../ai/mock';
import { IGNORED_PROPOSAL_NOTICE } from '../proposals/store';
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

async function turn(actionMode: 'tools' | 'json' | 'off', input: Partial<TurnInput>) {
  const events: TurnEvent[] = [];
  for await (const e of runChatTurn({ db, provider: createMockProvider(), actionMode, dailyCap: 200, now: NOW }, { scope: { mode: 'auto' }, ...input })) {
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
  expect(text(events)).toBe('Đề xuất lỗi.' + IGNORED_PROPOSAL_NOTICE);
  expect(await db.select().from(pendingActions)).toEqual([]);
  expect((await db.select().from(messages)).find((m) => m.role === 'assistant')!.content).toBe('Đề xuất lỗi.' + IGNORED_PROPOSAL_NOTICE);
});

test('regenerate chuyển đề xuất cũ sang superseded', async () => {
  const first = await turn('tools', { message: 'Tôi đã hoàn thành chương 1 Mobile' });
  const conversationId = (first[0] as { conversationId: string }).conversationId;
  await turn('tools', { conversationId, regenerate: true });
  const all = await db.select().from(pendingActions).orderBy(pendingActions.createdAt);
  expect(all.map((p) => p.status)).toEqual(['superseded', 'pending']);
  void topicId;
});
