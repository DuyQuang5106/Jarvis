import { expect, test } from 'vitest';
import { allowsProposal } from './intent';

test.each([
  ['algebra đang học đến đâu rồi', false],
  ['algebra tôi đang học đến đâu rồi?', false],
  ['phân tích tiến độ môn algebra cho tôi', false],
  ['Hôm nay nên làm gì?', false],
  ['kiểm tra lịch thi các môn', false],
  ['thêm tiến độ hiện tại: đang học đến đầu chương 5', true],
  ['Algebra: tôi đang học đến đầu chương 5', true],
  ['Tôi đã hoàn thành chương 1 Mobile', true],
  ['ghi lại giúp: giữa kỳ Database được 8/10', true],
  ['Database lab đã nộp', true],
  ['cập nhật giúp tôi lịch thi Algebra ngày 2027-01-05 được không?', true],
  ['xin chào', true],
])('allowsProposal(%s) = %s', (text, expected) => {
  expect(allowsProposal(text)).toBe(expected);
});

test.each([
  ['Giữa kỳ Database được 8,5 điểm', true],
  ['Bao nhiêu điểm thì qua môn?', false],
  ['Mobile Programming đang ở tình trạng nào?', false],
  ['Computer Networks: tôi đã xong phần VLSM, giải được 5 bài', true],
  ['Computer Networks sao rồi?', false],
  ['tạo', true],
  ['tại sao vậy', true],
  ['Đọc tài liệu của Algebra và tạo đề xuất: các topic kèm trạng thái, mốc đánh giá, và việc tiếp theo.', true],
  ['Đọc tài liệu của Mạng là gì? và tạo đề xuất: các milestone kèm trạng thái, và việc tiếp theo.', true],
  ['đọc tài liệu Algebra rồi đề xuất topic được không?', true],
])('khớp trọn từ: allowsProposal(%s) = %s', (text, expected) => {
  expect(allowsProposal(text)).toBe(expected);
});
