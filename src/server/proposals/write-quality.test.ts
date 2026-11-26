import { expect, test } from 'vitest';
import { makeArea } from '@/db/test-helpers';
import { createTestDb } from '@/db/testing';
import { documentService } from '../services/documents';
import { editDocument, looseHeading } from './document-actions';
import { loadProposal } from './load';
import { approvePendingAction } from './resolve';
import { createPendingAction } from './store';

const manual = { origin: 'manual' } as const;
const STATE = [
  '# Computer Networks',
  '',
  '## 1. Executive state (time-sensitive)',
  '',
  'Đang học.',
  '',
  '## 4. Practical/lab state',
  '',
  'Lab 1–3.',
  '',
  '## 6. Active course events — **dates not yet confirmed**',
  '',
  '- Giữa kỳ: chưa rõ.',
  '',
].join('\n');

const doc = { title: '04_STATE.md', bodyMd: STATE };
const append = (heading: string) => ({ type: 'append_to_document' as const, documentId: 'x', heading, markdown: '- 2026-11-26: mới.' });

test('looseHeading bỏ #, số thứ tự, chữ đậm, dấu, hoa thường', () => {
  expect(looseHeading('## 6. Active course events — **dates not yet confirmed**')).toBe('active course events — dates not yet confirmed');
  expect(looseHeading('Trạng thái hiện tại:')).toBe('trang thai hien tai');
});

test('khớp heading gần đúng: thiếu số, thiếu chữ đậm, chỉ phần đầu', () => {
  for (const heading of [
    '6. Active course events — **dates not yet confirmed**',
    'Active course events — dates not yet confirmed',
    '6. Active course events',
    'active course events',
  ]) {
    const edit = editDocument(doc, append(heading));
    expect(edit, heading).not.toBeNull();
    expect(edit!.body).toMatch(/- Giữa kỳ: chưa rõ\.\n\n- 2026-11-26: mới\.\n/);
  }
});

test('heading mơ hồ hoặc không có thật: không đoán', () => {
  const twoState = STATE + '\n## 7. Executive notes\n\nX.\n';
  expect(editDocument({ ...doc, bodyMd: twoState }, append('Executive'))).toBeNull();
  expect(editDocument(doc, append('Không có mục này'))).toBeNull();
});

test('cùng một dòng cho hai tài liệu, hoặc dòng đã có: chỉ giữ một lần ghi', async () => {
  const db = await createTestDb();
  const area = await makeArea(db, { name: 'Computer Networks' });
  const state = await documentService.create(db, { areaId: area.id, title: '04_STATE.md', bodyMd: STATE }, manual);
  const log = await documentService.create(db, { areaId: area.id, title: '05_LOG.md', bodyMd: '# Log\n\n## Nhật ký\n\n- 2026-11-20: Lab 1 xong.\n' }, manual);
  const result = await createPendingAction(db, { source: 'chat', proposal: { summary: 'Ghi', actions: [
    { type: 'append_to_document', documentId: state.id, heading: '4. Practical/lab state', markdown: '- 2026-11-26: Bạn đã qua cả 3 nội dung lab.' },
    { type: 'append_to_document', documentId: log.id, heading: 'Nhật ký', markdown: '- 2026-11-26: **Bạn đã qua cả 3 nội dung lab.**' },
    { type: 'append_to_document', documentId: log.id, heading: 'Nhật ký', markdown: '- 2026-11-26: Lab 1 xong.' },
    { type: 'add_progress_log', areaId: area.id, text: 'Bạn đã qua cả 3 nội dung lab.' },
  ] } });
  expect(result).toMatchObject({ ok: true, skipped: 0 });
  const view = await loadProposal(db, (result as { id: string }).id);
  expect(view!.actions.map((a) => a.action.type)).toEqual(['append_to_document', 'add_progress_log']);
});

test('sau khi duyệt, thẻ vẫn hiện thay đổi lúc duyệt (không lặp dòng vừa thêm)', async () => {
  const db = await createTestDb();
  const area = await makeArea(db, { name: 'Computer Networks' });
  const state = await documentService.create(db, { areaId: area.id, title: '04_STATE.md', bodyMd: STATE }, manual);
  const result = await createPendingAction(db, { source: 'chat', proposal: { summary: 'Ghi', actions: [
    { type: 'append_to_document', documentId: state.id, heading: '1. Executive state (time-sensitive)', markdown: '- 2026-11-26: Bạn đã học xong Chương 4.' },
  ] } });
  const id = (result as { id: string }).id;
  expect(await approvePendingAction(db, id, { selectedKeys: [0] })).toMatchObject({ status: 'applied' });
  const diff = (await loadProposal(db, id))!.previews[0].diff!;
  expect(diff.before.trim()).toBe('Đang học.');
  expect(diff.after.match(/học xong Chương 4/g)).toHaveLength(1);
});
