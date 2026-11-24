# Báo cáo probe provider AI

- Ngày chạy: 2026-11-23T15:22:15.089Z
- Model: claude-sonnet-5

| Kiểm tra | Kết quả |
|---|---|
| chat | đạt |
| streaming | đạt |
| tools | 3/3 |
| json | 5/5 |

**Mode khuyến nghị: `tools`**

<!-- phase-b-evaluation -->

## Đánh giá Phase B với dữ liệu mẫu

### Mock · tools

| Hành vi | Kết quả |
| --- | --- |
| Tài liệu cũ và trạng thái có cấu trúc cùng có trong dữ liệu | Đạt |
| Hai tài liệu cùng heading trỏ đúng hai workspace | Đạt |
| Payload gửi provider giữ kín thư mục riêng tư | Đạt |
| Đề xuất Markdown đi qua engine duyệt và chưa ghi | Đạt |

### Mock · json

| Hành vi | Kết quả |
| --- | --- |
| Tài liệu cũ và trạng thái có cấu trúc cùng có trong dữ liệu | Đạt |
| Hai tài liệu cùng heading trỏ đúng hai workspace | Đạt |
| Payload gửi provider giữ kín thư mục riêng tư | Đạt |
| Đề xuất Markdown đi qua engine duyệt và chưa ghi | Đạt |

### Provider thật · json

| Hành vi | Kết quả |
| --- | --- |
| Tài liệu cũ và trạng thái có cấu trúc cùng có trong dữ liệu | Đạt |
| Hai tài liệu cùng heading trỏ đúng hai workspace | Đạt |
| Payload gửi provider giữ kín thư mục riêng tư | Đạt |
| Đề xuất Markdown đi qua engine duyệt và chưa ghi | Trượt |
| Provider trả lời cả hai yêu cầu | Trượt |
| Câu trả lời nhận ra mâu thuẫn tiến độ | Trượt |

### Provider thật · tools

| Hành vi | Kết quả |
| --- | --- |
| Tài liệu cũ và trạng thái có cấu trúc cùng có trong dữ liệu | Đạt |
| Hai tài liệu cùng heading trỏ đúng hai workspace | Đạt |
| Payload gửi provider giữ kín thư mục riêng tư | Đạt |
| Đề xuất Markdown đi qua engine duyệt và chưa ghi | Trượt |
| Provider trả lời cả hai yêu cầu | Trượt |
| Câu trả lời nhận ra mâu thuẫn tiến độ | Trượt |

### Mock · tools

| Hành vi | Kết quả |
| --- | --- |
| Tài liệu cũ và trạng thái có cấu trúc cùng có trong dữ liệu | Đạt |
| Hai tài liệu cùng heading trỏ đúng hai workspace | Đạt |
| Payload gửi provider giữ kín thư mục riêng tư | Đạt |
| Đề xuất Markdown đi qua engine duyệt và chưa ghi | Đạt |

### Provider thật · tools

| Hành vi | Kết quả |
| --- | --- |
| Tài liệu cũ và trạng thái có cấu trúc cùng có trong dữ liệu | Đạt |
| Hai tài liệu cùng heading trỏ đúng hai workspace | Đạt |
| Payload gửi provider giữ kín thư mục riêng tư | Đạt |
| Đề xuất Markdown đi qua engine duyệt và chưa ghi | Trượt |
| Provider trả lời cả hai yêu cầu | Đạt |
| Câu trả lời nhận ra mâu thuẫn tiến độ | Đạt |
