import { expect, test } from 'vitest';
import { fromDocumentsMessage, isFromDocumentsRequest } from './from-documents';

test('tin nhắn mẫu nêu tên mục và khác nhau giữa môn học và dự án', () => {
  expect(fromDocumentsMessage({ name: 'Đại số', kind: 'academic' })).toBe(
    'Đọc tài liệu của Đại số và tạo đề xuất: các topic kèm trạng thái, mốc đánh giá, và việc tiếp theo.',
  );
  expect(fromDocumentsMessage({ name: 'Jarvis', kind: 'project' })).toBe(
    'Đọc tài liệu của Jarvis và tạo đề xuất: các milestone kèm trạng thái, và việc tiếp theo.',
  );
});

test.each([
  [fromDocumentsMessage({ name: 'Mạng máy tính là gì?', kind: 'academic' }), true],
  [fromDocumentsMessage({ name: 'Jarvis', kind: 'project' }), true],
  ['đọc tài liệu môn Algebra rồi đề xuất topic giúp tôi', true],
  ['Đề xuất cho tôi cách đọc tài liệu nhanh hơn', false],
  ['Tôi đã đọc tài liệu chương 2', false],
  ['Hôm nay nên làm gì?', false],
])('isFromDocumentsRequest(%s) = %s', (text, expected) => {
  expect(isFromDocumentsRequest(text)).toBe(expected);
});
