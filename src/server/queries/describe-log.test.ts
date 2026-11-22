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

// Ruling P1-R10: long free text never lands in a change line; private notes never show their text.
test('trường văn bản dài hơn 80 ký tự hiện dạng “đã sửa (n ký tự)”, ngắn thì giữ nguyên', () => {
  const long = 'a'.repeat(81);
  const longer = 'b'.repeat(120);
  const out = describeLog({ ...base, entityType: 'area', action: 'update',
    beforeJson: { name: 'DB', summary: long, goal: 'ngắn', nextAction: 'x'.repeat(80), details: { courseOutline: null } },
    afterJson: { name: 'DB', summary: longer, goal: 'vẫn ngắn', nextAction: 'y'.repeat(80), details: { courseOutline: 'c'.repeat(200) } } } as any);
  expect(out.changes).toEqual([
    { field: 'Tóm tắt', before: null, after: null, summary: 'đã sửa (120 ký tự)' },
    { field: 'Mục tiêu', before: 'ngắn', after: 'vẫn ngắn' },
    { field: 'Việc tiếp theo', before: 'x'.repeat(80), after: 'y'.repeat(80) },
    { field: 'Đề cương', before: null, after: null, summary: 'đã sửa (200 ký tự)' },
  ]);
});

test('mọi trường văn bản dài trong danh sách đều được rút gọn', () => {
  const fields = ['text', 'courseOutline', 'summary', 'goal', 'evidence', 'acceptanceCriteria', 'lastAttempt', 'nextAction', 'externalDependency', 'gradingScheme', 'examFormat'];
  for (const f of fields) {
    const out = describeLog({ ...base, entityType: 'blocker', action: 'update', beforeJson: { title: 'T', [f]: null }, afterJson: { title: 'T', [f]: 'z'.repeat(90) } } as any);
    expect(out.changes, f).toEqual([{ field: expect.any(String), before: null, after: null, summary: 'đã sửa (90 ký tự)' }]);
  }
  // A field outside the list (title) keeps its full value.
  const title = describeLog({ ...base, entityType: 'task', action: 'update', beforeJson: { title: 'T' }, afterJson: { title: 't'.repeat(150) } } as any);
  expect(title.changes).toEqual([{ field: 'Tiêu đề', before: 'T', after: 't'.repeat(150) }]);
});

test('create đếm độ dài sau, delete đếm độ dài trước', () => {
  const created = describeLog({ ...base, entityType: 'note', action: 'create', beforeJson: null, afterJson: { text: 'n'.repeat(100), aiExcluded: false } } as any);
  expect(created.changes).toContainEqual({ field: 'Nội dung', before: null, after: null, summary: 'đã sửa (100 ký tự)' });
  const deleted = describeLog({ ...base, entityType: 'note', action: 'delete', beforeJson: { text: 'n'.repeat(95), aiExcluded: false }, afterJson: null } as any);
  expect(deleted.changes).toContainEqual({ field: 'Nội dung', before: null, after: null, summary: 'đã sửa (95 ký tự)' });
  const progress = describeLog({ ...base, entityType: 'area', action: 'progress', beforeJson: null, afterJson: { text: 'p'.repeat(81) } } as any);
  expect(progress.changes).toEqual([{ field: 'Nội dung', before: null, after: null, summary: 'đã sửa (81 ký tự)' }]);
});

test('ghi chú riêng tư: tiêu đề không chứa nội dung, dòng text chỉ ghi số ký tự', () => {
  const mk = (action: string, beforeJson: any, afterJson: any) => describeLog({ ...base, entityType: 'note', action, beforeJson, afterJson } as any);
  const created = mk('create', null, { text: 'bí mật', aiExcluded: true });
  expect(created.title).toBe('Tạo ghi chú riêng tư');
  expect(JSON.stringify(created)).not.toContain('bí mật');
  expect(created.changes).toContainEqual({ field: 'Nội dung', before: null, after: null, summary: 'đã sửa (6 ký tự)' });

  const edited = mk('update', { text: 'bí mật', aiExcluded: true }, { text: 'bí mật hơn', aiExcluded: true });
  expect(edited).toEqual({ title: 'Sửa ghi chú riêng tư', changes: [{ field: 'Nội dung', before: null, after: null, summary: 'đã sửa (10 ký tự)' }] });

  // Turned private after the fact: the snapshot that has aiExcluded=true is enough.
  const toggled = mk('update', { text: 'bí mật', aiExcluded: false }, { text: 'bí mật', aiExcluded: true });
  expect(toggled.title).toBe('Sửa ghi chú riêng tư');
  expect(JSON.stringify(toggled)).not.toContain('bí mật');
  expect(toggled.changes).toEqual([{ field: 'Không gửi cho AI', before: 'Không', after: 'Có' }]);

  const deleted = mk('delete', { text: 'bí mật', aiExcluded: true }, null);
  expect(deleted.title).toBe('Xóa ghi chú riêng tư');
  expect(JSON.stringify(deleted)).not.toContain('bí mật');

  // An ordinary note still shows its text.
  expect(mk('create', null, { text: 'công khai', aiExcluded: false }).title).toBe('Tạo ghi chú “công khai”');
});
