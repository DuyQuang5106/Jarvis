import { beforeEach, expect, test, vi } from 'vitest';
import type { Db } from '@/db/client';
import { pendingActions } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { createMockProvider } from '../ai/mock';
import type { AiProvider } from '../ai/provider';
import { createArea } from '../services/areas';
import { noteService } from '../services/entities';
import { extractNoteProposal } from './extract-note';

const NOW = new Date('2026-11-22T03:00:00Z');
const manual = { origin: 'manual' as const };
let db: Db;

beforeEach(async () => {
  db = await createTestDb();
  await createArea(db, { kind: 'academic', name: 'Database', status: 'active' }, manual);
});

const deps = (over: Partial<Parameters<typeof extractNoteProposal>[0]> = {}) => ({
  db,
  provider: createMockProvider(),
  actionMode: 'tools' as const,
  dailyCap: 200,
  now: NOW,
  ...over,
});
const inbox = (text: string, extra: { aiExcluded?: boolean } = {}) =>
  noteService.create(db, { text, inboxStatus: 'inbox', ...extra }, manual);

test.each(['tools', 'json'] as const)('chế độ %s: tạo đề xuất gắn với note, note vẫn ở inbox', async (actionMode) => {
  const note = await inbox('Database lab đã nộp');
  const out = await extractNoteProposal(deps({ actionMode }), note.id);
  expect(out.status).toBe('proposed');
  const [pending] = await db.select().from(pendingActions);
  expect(pending).toMatchObject({ source: 'capture', noteId: note.id, status: 'pending' });
  expect((pending.actionsJson as { actions: { action: unknown }[] }).actions[0].action).toMatchObject({
    type: 'create_task',
    title: 'Việc từ ghi chú',
  });
});

test('extract lần hai thay đề xuất cũ', async () => {
  const note = await inbox('Database lab đã nộp');
  await extractNoteProposal(deps(), note.id);
  await extractNoteProposal(deps(), note.id);
  const all = await db.select().from(pendingActions).orderBy(pendingActions.createdAt);
  expect(all.map((p) => p.status)).toEqual(['superseded', 'pending']);
});

test('các trường hợp không gọi provider', async () => {
  const stream = vi.fn();
  const provider = { stream } as unknown as AiProvider;
  const priv = await inbox('Database bí mật', { aiExcluded: true });
  const filed = await noteService.create(db, { text: 'Database', inboxStatus: 'none' }, manual);
  const ok = await inbox('Database lab');
  expect(await extractNoteProposal(deps({ provider }), priv.id)).toEqual({
    status: 'none',
    reason: 'Ghi chú này đang tắt gửi cho AI.',
  });
  expect(await extractNoteProposal(deps({ provider }), filed.id)).toEqual({
    status: 'none',
    reason: 'Ghi chú không còn trong Inbox.',
  });
  expect(await extractNoteProposal(deps({ provider, actionMode: 'off' }), ok.id)).toEqual({
    status: 'none',
    reason: 'Chế độ đề xuất đang tắt.',
  });
  expect(stream).not.toHaveBeenCalled();
});

test('không có gì để đề xuất, và provider lỗi', async () => {
  const none = await inbox('mua sữa');
  expect(await extractNoteProposal(deps(), none.id)).toEqual({
    status: 'none',
    reason: 'AI không tìm thấy cập nhật nào hợp lệ trong ghi chú.',
  });
  const failing: AiProvider = {
    async *stream() {
      throw new Error('x');
      yield { type: 'text', delta: '' };
    },
  };
  const note = await inbox('Database lab');
  expect(await extractNoteProposal(deps({ provider: failing }), note.id)).toEqual({
    status: 'none',
    reason: 'Không gọi được AI. Ghi chú vẫn nằm trong Inbox.',
  });
  expect(await db.select().from(pendingActions)).toEqual([]);
});
