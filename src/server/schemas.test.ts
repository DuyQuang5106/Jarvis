import { expect, test } from 'vitest';
import { CreateNoteInput, CreateTaskInput } from './schemas';

const areaId = '11111111-1111-4111-8111-111111111111';

test.each([
  [{ areaId, title: '   ' }, 'tên toàn khoảng trắng'],
  [{ areaId, title: 'x'.repeat(201) }, 'tên quá dài'],
  [{ areaId, title: 'ok', dueDate: '22/11' }, 'ngày sai định dạng'],
  [{ areaId, title: 'ok', dueDate: '' }, 'ngày là chuỗi rỗng'],
  [{ areaId, title: 'ok', dueDate: '2026-02-30' }, 'ngày không tồn tại'],
  [{ areaId, title: 'ok', estimateMinutes: 0 }, 'ước lượng bằng 0'],
  [{ areaId: 'abc', title: 'ok' }, 'areaId không phải uuid'],
])('CreateTaskInput từ chối %o (%s)', (input, label) => {
  expect(CreateTaskInput.safeParse(input).success, label).toBe(false);
});

test('tên được trim; dueDate null hợp lệ', () => {
  expect(CreateTaskInput.parse({ areaId, title: '  Lab 1 ', dueDate: null })).toMatchObject({ title: 'Lab 1', dueDate: null });
});

test('note giới hạn 20000 ký tự', () => {
  expect(CreateNoteInput.safeParse({ text: 'x'.repeat(20001) }).success).toBe(false);
  expect(CreateNoteInput.safeParse({ text: '' }).success).toBe(false);
});
