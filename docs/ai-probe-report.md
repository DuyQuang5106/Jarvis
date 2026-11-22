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
