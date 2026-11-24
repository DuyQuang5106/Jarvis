import { expect, test } from 'vitest';
import { PROPOSE_CHANGES_TOOL, ProposeChangesSchema } from './schema';

const A = '11111111-1111-4111-8111-111111111111';
const T = '22222222-2222-4222-8222-222222222222';
const wrap = (action: unknown) => ({ summary: 'Cập nhật', actions: [action] });

test.each<[unknown]>([
  [{ type: 'upsert_topic', areaId: A, id: T, status: 'practiced', evidence: '5 bài' }],
  [{ type: 'upsert_topic', areaId: A, title: 'VLSM', status: 'practiced' }],
  [{ type: 'create_task', areaId: A, title: 'Ôn VLSM', dueDate: '2026-11-25', deadlineType: 'committed' }],
  [{ type: 'update_task', id: T, patch: { dueDate: null } }],
  [{ type: 'update_area', id: A, patch: { status: 'active', nextAction: 'Xem syllabus' } }],
  [{ type: 'add_progress_log', areaId: A, text: '22/11: đã đọc xong phần Navigation' }],
  [{ type: 'create_note', areaId: null, text: 'ghi chú' }],
  [{ type: 'create_blocker', areaId: A, title: 'Login Android chưa chạy' }],
  [{ type: 'resolve_blocker', id: T }],
  [{ type: 'upsert_milestone', areaId: A, title: 'M1', targetDate: '2026-12-01', status: 'in_progress' }],
  [{ type: 'upsert_milestone', areaId: A, id: T, status: 'done' }],
  [{ type: 'upsert_assessment', areaId: A, title: 'Giữa kỳ', weight: 30, dueDate: '2026-12-10' }],
  [{ type: 'upsert_assessment', areaId: A, id: T, score: 8.5, maxScore: 10 }],
])('hợp lệ: %o', (action) => {
  expect(ProposeChangesSchema.safeParse(wrap(action)).success).toBe(true);
});

test.each<[unknown, string]>([
  [{ type: 'delete_task', id: T }, 'không có hành động xóa'],
  [{ type: 'upsert_topic', areaId: A, status: 'in_progress', id: T }, 'status ngoài enum'],
  [{ type: 'upsert_topic', areaId: A, status: 'practiced' }, 'tạo topic thiếu title'],
  [{ type: 'upsert_topic', areaId: A, id: T }, 'cập nhật không có trường nào'],
  [{ type: 'upsert_milestone', areaId: A, status: 'done' }, 'tạo milestone thiếu title'],
  [{ type: 'upsert_milestone', areaId: A, id: T }, 'cập nhật milestone không có trường nào'],
  [{ type: 'upsert_assessment', areaId: A, weight: 20 }, 'tạo assessment thiếu title'],
  [{ type: 'upsert_assessment', areaId: A, id: T }, 'cập nhật assessment không có trường nào'],
  [{ type: 'update_task', id: T, patch: {} }, 'patch rỗng'],
  [{ type: 'update_area', id: A, patch: {} }, 'patch area rỗng'],
  [{ type: 'create_task', areaId: A, title: 'x', dueDate: '22/11' }, 'ngày sai định dạng'],
  [{ type: 'create_task', areaId: 'mobile-programming', title: 'x' }, 'areaId không phải uuid'],
  [{ type: 'add_progress_log', areaId: A, text: '' }, 'text rỗng'],
])('không hợp lệ: %o (%s)', (action) => {
  expect(ProposeChangesSchema.safeParse(wrap(action)).success).toBe(false);
});

test('giới hạn số hành động và summary', () => {
  const one = { type: 'resolve_blocker', id: T };
  expect(ProposeChangesSchema.safeParse({ summary: 's', actions: Array(20).fill(one) }).success).toBe(true);
  expect(ProposeChangesSchema.safeParse({ summary: 's', actions: Array(21).fill(one) }).success).toBe(false);
  expect(ProposeChangesSchema.safeParse({ summary: 's', actions: [] }).success).toBe(false);
  expect(ProposeChangesSchema.safeParse({ summary: '', actions: [one] }).success).toBe(false);
  expect(ProposeChangesSchema.safeParse({ summary: 'a'.repeat(301), actions: [one] }).success).toBe(false);
});

test('khóa lạ bị bỏ, không làm hỏng đề xuất', () => {
  const out = ProposeChangesSchema.parse(wrap({ type: 'resolve_blocker', id: T, confidence: 0.9 }));
  expect(out.actions[0]).toEqual({ type: 'resolve_blocker', id: T });
});

test('tool definition là JSON Schema của schema đề xuất', () => {
  expect(PROPOSE_CHANGES_TOOL.name).toBe('propose_changes');
  expect(PROPOSE_CHANGES_TOOL.parameters).toMatchObject({ type: 'object', required: expect.arrayContaining(['summary', 'actions']) });
});
