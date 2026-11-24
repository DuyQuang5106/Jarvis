import { expect, test } from 'vitest';
import { computeLineDiff } from './line-diff';

test('computeLineDiff tách đúng các dòng giữ nguyên, xóa và thêm', () => {
  expect(computeLineDiff('a\nb\nc', 'a\nb2\nc\nd')).toEqual([
    { kind: 'same', text: 'a' },
    { kind: 'del', text: 'b' },
    { kind: 'add', text: 'b2' },
    { kind: 'same', text: 'c' },
    { kind: 'add', text: 'd' },
  ]);
  expect(computeLineDiff('', 'x')).toEqual([{ kind: 'add', text: 'x' }]);
  expect(computeLineDiff('x', '')).toEqual([{ kind: 'del', text: 'x' }]);
});
