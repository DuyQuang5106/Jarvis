# Context 2.0 — hiển thị trạng thái, không chỉ liệt kê (28/11/2026)

Tài liệu chốt hướng cho P1, P2, U1 trong `TODO.md`. Nguồn: bài nghiên cứu owner dán vào chat ngày 28/11/2026, đã đối chiếu với dữ liệu thật của Jarvis.

## Màn Context phải trả lời sáu câu hỏi
1. Tôi đang làm những gì? 2. Đang ở đâu? 3. Hướng tới đâu? 4. Có vấn đề gì? 5. Làm gì tiếp? 6. Điều gì đã đổi?

## Nền tảng
- **Tổng quan trước, phóng to và lọc, chi tiết khi cần** (Shneiderman, 1996), làm theo kiểu tiết lộ dần (progressive disclosure, Nielsen Norman Group).
- **Personal Informatics** (Li, Dey, Forlizzi, CHI 2010): chuẩn bị → thu thập → tổng hợp → nhìn lại → hành động. Người dùng bỏ cuộc nhiều nhất ở khâu thu thập, nên **không chỉ số nào bắt người dùng tự nhập**: mọi số tính từ dữ liệu sẵn có hoặc từ điều kể trong chat (qua thẻ duyệt).
- **Tiến độ ≠ thành thạo ≠ sức khỏe.** Gộp vào một con số % dễ dẫn tới việc chạy theo con số (định luật Goodhart). Trạng thái (Active) khác sức khỏe (đúng hướng hay có rủi ro), như Linear/Asana tách "status" và "health".
- Chưa đủ dữ liệu thì nói **"Chưa xác định"**, không hiện 0%. Không có % tổng cho mọi thứ.

## Dữ liệu đã có và cái còn thiếu
Đã có: mục tiêu (`goal`, điểm mục tiêu), lịch thi/hạn/milestone, ưu tiên, việc tiếp theo, blocker, độ mới dữ liệu, nhật ký thay đổi, ghi chú, check-in, tổng kết tuần, `evidence` của topic, điểm bài kiểm tra (`score/maxScore`), nguồn của mỗi thay đổi (tay / AI đã duyệt).

Còn thiếu: cách tính **bao phủ/thành thạo**, **sức khỏe**, **task đếm được**, **thay đổi tuần này**, và cách hiển thị ba tầng.

## Chỉ số (P1)
| Chỉ số | Cách tính |
|---|---|
| Bao phủ (môn học) | topic ở mức "làm quen" trở lên / tổng topic |
| Thành thạo (môn học) | (vững × 1 + đã luyện × 0,5) / tổng topic; điểm bài kiểm tra đã lưu là bằng chứng kèm theo |
| Tiến độ (dự án) | milestone xong / tổng milestone |
| Sức khỏe | phần còn lại so với số ngày tới mốc gần nhất và nhịp 14 ngày qua (từ log): kịp → Đúng hướng; không kịp → Có rủi ro; quá hạn hoặc blocker mở → Lệch hướng; thiếu topic/mốc → Chưa đủ dữ liệu. Luôn kèm một câu lý do có số |
| Task đếm được | `progress_done/progress_total` tùy chọn (ví dụ 3/10 buổi); task khác là ô tick |
| Thay đổi tuần này | topic lên mức, task xong, mốc mới/đổi trong 7 ngày, từ log |

Quy tắc trọng số riêng từng môn là tùy chọn nâng cao, làm sau.

## Ba tầng hiển thị (P2, U1)
1. **Tổng quan** (5 giây): Cần chú ý · Sắp tới hạn 7 ngày · Thay đổi tuần này; thẻ "Nên làm gì bây giờ" từ thẻ định hướng hằng ngày.
2. **Thẻ môn/dự án**: nhãn sức khỏe + lý do, thanh hai lớp (nhạt = đã học, đậm = đã vững), đếm ngược, việc tiếp theo; mở rộng tại chỗ để thấy các chương và task đang làm.
3. **Không gian làm việc** của môn: giữ như hiện nay.

## Tạm gác
Tầng "Area" riêng (đã có tab Academic/Projects), đồ thị phụ thuộc, mô phỏng "nếu… thì", dự báo khối lượng việc (cần ước tính phút cho từng task).
