/* eslint-disable @typescript-eslint/no-explicit-any -- loose log fixtures */
import { expect, test } from 'vitest';
import { describeLog } from './describe-log';

const base = { id: 'l', areaId: 'a', entityId: 'e', batchId: null, createdAt: new Date(), origin: 'manual' as const };

test('update chỉ liệt kê trường thay đổi, enum đổi sang nhãn', () => {
  const out = describeLog({ ...base, entityType: 'topic', action: 'update',
    beforeJson: { id: 'e', title: 'Navigation', status: 'not_started', updatedAt: '2026-11-20T00:00:00Z' },
    afterJson: { id: 'e', title: 'Navigation', status: 'familiar', updatedAt: '2026-11-22T00:00:00Z' } } as any);
  expect(out).toEqual({ title: 'Sửa topic “Navigation”', changes: [{ field: 'Trạng thái', before: 'Not started', after: 'Familiar' }] });
});

test('create, delete, progress, archive', () => {
  const mk = (entityType: string, action: string, beforeJson: any, afterJson: any) => describeLog({ ...base, entityType, action, beforeJson, afterJson } as any).title;
  expect(mk('task', 'create', null, { title: 'Lab 1' })).toBe('Tạo task “Lab 1”');
  expect(mk('task', 'delete', { title: 'Lab 1' }, null)).toBe('Xóa task “Lab 1”');
  expect(mk('area', 'progress', null, { text: '22/11: đã đọc xong phần Navigation' })).toBe('Ghi nhận tiến độ');
  expect(mk('area', 'archive', {}, {})).toBe('Lưu trữ mục');
});

test('note dùng 40 ký tự đầu làm tên', () => {
  const out = describeLog({ ...base, entityType: 'note', action: 'create', beforeJson: null, afterJson: { text: 'x'.repeat(60) } } as any);
  expect(out.title).toBe(`Tạo ghi chú “${'x'.repeat(40)}…”`);
});

test('bỏ trường kỹ thuật, nhãn ngày/boolean/null, làm phẳng details của area', () => {
  const out = describeLog({ ...base, entityType: 'area', action: 'update',
    beforeJson: { id: 'e', name: 'DB', areaId: 'a', sortOrder: 1, createdAt: 'x', deadlineDate: null, aiExcluded: false, details: { examFormat: 'Viết' } },
    afterJson: { id: 'e', name: 'DB', areaId: 'a', sortOrder: 2, createdAt: 'y', deadlineDate: '2026-12-05', aiExcluded: true, details: { examFormat: 'Trắc nghiệm' } } } as any);
  expect(out.title).toBe('Sửa mục “DB”');
  expect(out.changes).toEqual([
    { field: 'Hạn', before: null, after: '05/12/2026' },
    { field: 'Không gửi cho AI', before: 'Không', after: 'Có' },
    { field: 'Hình thức thi', before: 'Viết', after: 'Trắc nghiệm' },
  ]);
});
