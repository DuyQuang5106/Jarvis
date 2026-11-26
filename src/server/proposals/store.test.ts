import { expect, test } from 'vitest';
import { createTestDb } from '@/db/testing';
import { createArea } from '../services/areas';
import { createPendingAction, ignoredProposalNotice } from './store';

const manual = { origin: 'manual' as const };
const GHOST = '00000000-0000-4000-8000-000000000000';

test('createPendingAction: ok kèm id, hoặc lý do bị bỏ', async () => {
  const db = await createTestDb();
  const area = await createArea(db, { kind: 'academic', name: 'Algebra' }, manual);
  const ok = await createPendingAction(db, { source: 'chat', proposal: { summary: 's', actions: [{ type: 'create_task', areaId: area.id, title: 'Đọc' }] } });
  expect(ok).toEqual({ ok: true, id: expect.any(String), skipped: 0, skippedWhy: [] });
  // Một hành động trỏ sai đích: giữ phần còn lại, đếm phần bị bỏ.
  const partial = await createPendingAction(db, {
    source: 'chat',
    proposal: {
      summary: 's',
      actions: [
        { type: 'update_task', id: GHOST, patch: { status: 'done' } },
        { type: 'add_progress_log', areaId: area.id, text: 'Đầu chương 5' },
      ],
    },
  });
  expect(partial).toEqual({ ok: true, id: expect.any(String), skipped: 1, skippedWhy: [expect.stringMatching(/^actions\[0\]: /)] });
  const ghost = await createPendingAction(db, { source: 'chat', proposal: { summary: 's', actions: [{ type: 'update_task', id: GHOST, patch: { status: 'done' } }] } });
  expect(ghost).toEqual({ ok: false, reason: 'invalid_target', detail: 'actions[0]' });
  const deadline = await createPendingAction(db, {
    source: 'chat',
    requestText: 'Hạn nộp là ngày mai',
    proposal: { summary: 's', actions: [{ type: 'append_to_document', documentId: GHOST, markdown: 'Nộp ngày mai.' }] },
  });
  expect(deadline).toMatchObject({ ok: false, reason: 'deadline_route', detail: expect.any(String) });
});

test.each([
  ['parse', 'không đúng định dạng nên đã bị bỏ qua'],
  ['schema', 'không đúng định dạng nên đã bị bỏ qua'],
  ['deadline_route', 'chỉ ghi hạn vào tài liệu mà không tạo task hay lịch thi có ngày, nên đã bị bỏ qua'],
  ['invalid_target', 'trỏ tới một mục không còn tồn tại nên đã bị bỏ qua'],
] as const)('ignoredProposalNotice(%s)', (reason, phrase) => {
  const notice = ignoredProposalNotice(reason);
  expect(notice.startsWith('\n\n_(AI có đề xuất cập nhật nhưng ')).toBe(true);
  expect(notice.endsWith(' Chưa có gì được thay đổi.)_')).toBe(true);
  expect(notice).toContain(phrase);
});
