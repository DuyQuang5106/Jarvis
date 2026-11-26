import { expect, test } from 'vitest';
import { normalizeVi } from '../ai/match-areas';
import { allowsProposal, reportsNewInformation } from './intent';

const tells = (text: string) => reportsNewInformation(normalizeVi(text), text);

test.each([
  'Dự án Question House: quyết định dùng Supabase thay vì Firebase vì cần truy vấn SQL',
  'Nhóm chốt dùng React Native cho bản đầu',
  'Từ tuần sau sẽ dùng Postgres cho phần lưu trữ',
  'StewieSAT chuyển sang dùng bộ điều khiển mới',
  'Research Assistant: LangChain thì không dùng nữa',
  'Đã thử chạy mô hình trên GPU, nhanh gấp 3 lần',
  'Kết quả thử nghiệm: độ chính xác đạt 82%',
  'Bản build iOS bị lỗi khi đăng nhập',
  'Mình bị kẹt ở phần xác thực OAuth',
  'Phát hiện dữ liệu huấn luyện bị trùng 10%',
  'Thay đổi kế hoạch: làm bản web trước, app để sau',
  'Algebra có thông báo: thi cuối kỳ dạng tự luận 90 phút, được mang 1 tờ A4 ghi chú',
  'Thầy thông báo lùi hạn nộp báo cáo sang tuần sau',
  'Nhóm thống nhất họp vào thứ Năm',
  'ATGT Competition có deadline mới là 2026-12-10',
])('kể thông tin mới: %s', (text) => {
  expect(tells(text)).toBe(true);
  expect(allowsProposal(text)).toBe(true);
});

test.each([
  'Có nên chuyển sang Supabase không?',
  'Question House nên dùng Supabase hay Firebase?',
  'Kết quả thi giữa kỳ Algebra là gì',
  'Kết quả thử nghiệm hôm qua thế nào?',
  'Bao giờ có kết quả?',
  'Quyết định dùng Supabase có ổn không?',
  'Chốt phương án nào thì hợp lý?',
  'Tại sao bản build bị lỗi?',
  'Mình đang vướng chỗ nào?',
  'Đã thử cách nào cho lỗi đăng nhập chưa?',
  'Có thông báo gì mới của Algebra không?',
  'Khi nào lùi hạn?',
  'Kiểm tra giúp phát hiện trùng lặp dữ liệu',
])('hỏi, cùng từ khóa: %s', (text) => {
  expect(tells(text)).toBe(false);
  expect(allowsProposal(text)).toBe(false);
});

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
