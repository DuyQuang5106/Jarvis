# Báo cáo probe provider AI

- Ngày chạy: 2026-11-22T05:17:37.117Z
- Model: claude-sonnet-5

| Kiểm tra | Kết quả |
|---|---|
| chat | đạt |
| streaming | đạt |
| tools | 3/3 |
| json | 5/5 |

**Mode khuyến nghị: `tools`**

## Lần chạy trước với `gpt-6.2-sol` (cùng ngày)

| Kiểm tra | Kết quả |
|---|---|
| chat | đạt |
| streaming | trượt (chỉ nhận 1 sự kiện text) |
| tools | 0/3 |
| json | 0/5 |

Mode khuyến nghị lúc đó: `off`. Nguyên nhân kiểm tra tay: model trả về mọi UUID thành `00000000-0000-0000-0000-000000000000`, kể cả khi chỉ được yêu cầu lặp lại nguyên chuỗi. `gpt-6-luna` cũng vậy; `claude-sonnet-5` giữ nguyên UUID. Vì đề xuất cập nhật dựa trên ID thật (spec 6.2), các model GPT trên gateway này không dùng được cho đề xuất. Chọn `claude-sonnet-5`, `AI_ACTION_MODE=tools`.

## Phase 2 — kiểm tra thực tế (2026-11-23)

- Model: `claude-sonnet-5` qua Fosta; dữ liệu: 14 mục seed trong một database tạm (không có dữ liệu thật của owner); `AI_ACTION_MODE=off` cho phase này.

| Câu hỏi | Kết quả |
|---|---|
| `Mobile Programming đang ở tình trạng nào?` | Đạt. Nêu đúng "Chưa bắt đầu", ghi rõ là User reported từ seed chưa xác minh lại, nêu thiếu topic/ngày thi/bước tiếp theo; không bịa điểm hay deadline. Nguồn: Mobile Programming. |
| `Tuần này có gì đáng lo?` | Đạt. Dựa trên `dueTasks`/`upcomingAssessments` trống, nói rõ chỗ thiếu dữ liệu và "chưa cần xem các mục đang trống là dấu hiệu có vấn đề"; không tạo cảnh báo giả. |
| `Hôm nay nên làm gì?` | Đạt. Đúng 3 ưu tiên, mỗi cái có lý do và đánh đổi, có điều kiện về thời gian, phân biệt các mức Confirmed / User reported / Inferred / Unknown. |

Không thấy model làm trái luật trong system prompt.
