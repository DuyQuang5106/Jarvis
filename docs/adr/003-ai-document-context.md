# ADR 003 — Truy hồi tài liệu và thay đổi có duyệt

**Ngày** 24/11/2026

## Chỉ mục và riêng tư

Tận dụng `documents.search_tsv` và chỉ mục GIN để chọn tài liệu ứng viên. Trong mỗi lượt chat, tách nội dung hiện tại từ `body_md` và `extracted_text` thành đoạn, rồi xếp hạng với Postgres FTS cấu hình `simple` trên văn bản đã bỏ dấu. Chọn cách tính lúc truy vấn giúp sửa, di chuyển, xóa mềm và đổi quyền riêng tư có hiệu lực ngay mà không cần đồng bộ bảng phụ.

Lọc quyền workspace, tài liệu và thư mục tổ tiên trước khi đọc nội dung ứng viên. Tài liệu `instruction` được loại khỏi luồng Phase B. Cùng một điều kiện hiển thị được dùng cho truy hồi, lọc log và lịch sử chat có dẫn nguồn tài liệu. Dữ liệu tài liệu được đặt trong `workspace_state`. Khi workspace được chọn, ưu tiên dàn ý và đoạn trọng tâm của tài liệu chắt lọc. Tài liệu thô chỉ góp đoạn khớp truy vấn. Ngân sách tài liệu tối đa 12.800 ký tự JSON và giữ nguyên tầng trạng thái tổng quan.

## Chọn đích cập nhật

| Người dùng báo | Đích chính | Tài liệu |
| --- | --- | --- |
| Hạn nộp hoặc ngày đánh giá | Task hoặc assessment có `dueDate` | Có thể thêm bối cảnh theo yêu cầu |
| Vướng mắc dự án | Blocker | Có thể ghi diễn giải theo yêu cầu |
| Hoàn thành chương | Topic | Có thể ghi một dòng tiến độ theo yêu cầu |

Server kiểm tra định tuyến hạn nộp có ngày rõ trong câu yêu cầu khi lưu đề xuất và khi chọn từng hành động để duyệt. Chế độ JSON và tools dùng cùng schema.

## Duyệt và hoàn tác

Đề xuất sửa tài liệu được gắn revision và hash của đích. Server khóa tài liệu, workspace và chuỗi tổ tiên khi duyệt, xác minh lại quyền và neo sửa, rồi ghi mỗi tài liệu tối đa một revision, một phiên bản và một log trong transaction chung của lô. Đổi tên dựa trên tên, cập nhật phần dựa trên section, cập nhật checklist dựa trên đúng dòng. Khi thêm cuối tài liệu, đích là toàn bộ tài liệu.

Hoàn tác đọc snapshot trước và sau từ log của lô và khóa đích trong transaction. Nếu đích đã thay đổi thì giữ bản hiện tại và liên kết tới tài liệu để người dùng xem lịch sử. Lô được hoàn tác bằng bản ghi bù có nguồn `undo`. Tài liệu mới được xóa mềm, tài liệu đã sửa nhận revision mới với nội dung trước lần duyệt. Log tiến độ có dòng bù để giữ lịch sử.

## Sửa đổi 26/11/2026

Đo trên bản sao dữ liệu thật cho thấy trích đoạn theo từ khóa bỏ sót tài liệu trạng thái và chỉ gửi khối frontmatter. Quy tắc mới (thay con số 12.800 ký tự ở trên):

- Ngân sách `<workspace_state>` mặc định 120.000 ký tự (`AI_CONTEXT_MAX_CHARS`, tối thiểu 16.000). Tài liệu dùng tối đa 70% phần còn lại sau Tầng 1; Tầng 1 không bao giờ bị cắt.
- Frontmatter YAML được bỏ trước khi chia đoạn hoặc gửi; `document_type` thành `docType`.
- Khi có workspace được chọn: nạp toàn văn (`content`) mọi tài liệu `context` của workspace theo thứ tự trạng thái → lịch → nhật ký → bối cảnh → đề cương → thông tin thiếu → khác → kiểm kê nguồn, xen kẽ theo vòng giữa các workspace. Tài liệu không vừa được cắt còn 4.000 ký tự đầu, rồi mới chỉ liệt kê tên và dàn ý (`omitted`). Phần còn lại dành cho tối đa 8 trích đoạn tài liệu gốc.
- Câu hỏi tổng thể: mỗi workspace đang mở, không bị loại khỏi AI, góp một tài liệu trạng thái (toàn văn nếu tổng vừa 60% ngân sách tài liệu, nếu không thì cắt đều, tối thiểu 1.500 ký tự mỗi tài liệu). Trích đoạn (tối đa 6) chỉ chạy khi câu hỏi còn từ khóa dài từ 3 ký tự sau khi bỏ từ thông dụng.
- `recentLogs` tối đa 8 dòng, bỏ log nhập dữ liệu (`migration`, `seed`) và log tạo tài liệu.
- Khi vượt ngân sách, cắt theo thứ tự: trích đoạn tài liệu gốc → log → ghi chú → tài liệu lõi từ cuối sang `omitted` → chi tiết workspace từ cuối; tài liệu trạng thái đứng đầu bị cắt sau cùng. Chip "Dựa trên:" chỉ gồm tài liệu còn `content` hoặc trích đoạn.
- Mọi truy vấn mới dùng cùng điều kiện hiển thị (workspace, tài liệu, thư mục tổ tiên `ai_excluded`, tài liệu `instruction`).
