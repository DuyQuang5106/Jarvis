# ADR 001: Document-First Context Workspace (Phase A)

- **Ngày:** 23/11/2026
- **Trạng thái:** Đề xuất để owner duyệt trước Wave 3 (UI A4–A9); đã chốt làm nền cho Wave 2 (Schema & Service A1–A3)

## 1. Bối cảnh

Mỗi môn học và dự án trong `/context` hiện bị chia thành các ô form cố định (`areas.summary`, `areas.goal`, `academic_details.*`, `project_details.*`) và danh sách `notes` rời rạc trong một Drawer hẹp. Mô hình này gây gò bó khi lưu syllabus, nhật ký kỹ thuật, hay nhiều tài liệu theo chủ đề.

## 2. Các quyết định kiến trúc

### 2.1. Định dạng lưu chuẩn
- **GFM Markdown (`body_md` text)** là định dạng lưu chuẩn duy nhất cho mọi tài liệu trong bảng `documents`.
- Mọi thao tác đọc/diff/tìm kiếm/xuất JSON và ngữ cảnh AI đều làm việc trực tiếp trên `body_md`.

### 2.2. Lựa chọn Editor (Đánh giá cho A4)
So sánh hai hướng trước khi triển khai UI:

| Tiêu chí | Phương án A: WYSIWYG (Tiptap + `tiptap-markdown`) | Phương án B (Khuyến nghị): Markdown-native (CodeMirror 6 / Textarea + Preview GFM) |
|---|---|---|
| **Round-trip GFM** (heading, list, checklist, bảng, code block, link `task:<uuid>`) | Rủi ro biến đổi khoảng trắng, escape ký tự, bảng hoặc cú pháp mở rộng khi serialize lại | **Bảo toàn 100%** vì người dùng sửa trực tiếp trên văn bản GFM chuẩn |
| **Gõ tiếng Việt có dấu trên iOS Safari** | `contenteditable` thường gặp lỗi lặp dấu / nhảy con trỏ với Telex/VNI | Ổn định trên iOS; cỡ chữ `>= 16px` kiểm soát trực tiếp qua CSS |
| **Checklist trên iPhone** | Bấm trực tiếp trong node view | Chế độ Preview (dùng `react-markdown` + `remark-gfm` sẵn có) cho bấm checkbox để toggle đúng dòng `- [ ]` ↔ `- [x]` trong `body_md` |
| **Kích thước bundle** | Nặng (~150–250 KB gzipped gồm ProseMirror + Tiptap) | Nhẹ (tận dụng `react-markdown` + `remark-gfm` sẵn có; CodeMirror core + markdown ~45–60 KB gzipped) |

**Kết luận khuyến nghị:** Chọn **Phương án B** (Markdown editor với nút chuyển/song song Xem trước GFM + bấm checklist trực tiếp). Điểm dừng xác nhận với owner trước khi cài package ở A4.

### 2.3. Vị trí Workspace trong UI (Luật hai màn hình)
- Workspace đặt ở **chế độ toàn màn hình ngay bên trong `/context`** qua query URL:
  - Danh sách Context: `/context?tab=academic|projects`
  - Mở Workspace: `/context?tab=academic|projects&item=<areaId>&doc=<docId>`
- Không thêm route màn hình chính thứ ba; giữ đúng 2 đích điều hướng `/chat` và `/context`.
- Trên desktop: cây tài liệu bên trái, editor rộng ở giữa, panel vận hành (Tasks, Milestones, Blockers, Topics, Assessments, Activity) bên phải/tab. Trên iPhone: explorer mở dạng Sheet, editor toàn màn hình, nút đóng `>= 44px`.

### 2.4. Ranh giới giữa Bản ghi có cấu trúc và Tài liệu
- **Giữ cấu trúc** (để truy vấn, lọc hạn, tính `snapshot`, và AI định tuyến chính xác):
  - `areas`: `status`, `priority`, `start_date`, `deadline_date`, `next_action`, `ai_excluded`, `aliases`, `archived_at`.
  - Bảng con: `tasks`, `milestones`, `blockers`, `topics`, `assessments`, `activity_logs`.
- **Chuyển sang tài liệu Markdown (`documents`)**:
  - `areas.summary`, `areas.goal`;
  - Toàn bộ `academic_details` (`term`, `credits`, `target_grade`, `grading_scheme`, `exam_format`, `course_outline`);
  - Toàn bộ `project_details` (`role`, `collaborators`, `scope`, `cadence`);
  - Các `notes` đã gắn `area_id != null` (ghi chú Inbox `area_id IS NULL` giữ nguyên ở `notes`).

### 2.5. Chính sách Version, Revision & Activity Log
- **Optimistic concurrency (`revision`):** `documents.revision` là số nguyên tăng `1` mỗi lần `updateBody` thành công. Nếu `expectedRevision` gửi lên khác `revision` hiện tại, server từ chối bằng `ConflictError` (409/ActionResult lỗi xung đột), không ghi đè.
- **Gộp `activity_logs` không nhiễu:**
  - `create`, `rename`, `softDelete`, `restore`: mỗi thao tác ghi 1 dòng log (`entity_type = 'document'`).
  - `updateBody`: gộp vào **cùng 1 dòng log `update`** nếu dòng log gần nhất của chính `document_id` đó có `action = 'update'`, cùng `origin`, và thời gian tạo cách hiện tại `< 5 phút` (cùng phiên sửa). Quá 5 phút hoặc khác `origin` mới tạo dòng log `update` mới.
  - Giá trị nội dung dài (`bodyMd`) trong `describeLog` được rút gọn theo quy tắc P1-R10 (`đã sửa (N ký tự)`), giữ nguyên `aiExcluded` riêng tư (`tài liệu riêng tư`).
- **Chính sách `document_versions`:**
  - Tạo bản ghi `document_versions` khi: (1) bắt đầu một phiên sửa mới (tức lần lưu đầu tiên sau khi tạo hoặc sau ≥5 phút không sửa), (2) `ai_approved`, (3) `undo` (khôi phục version), hoặc (4) `migration`.
  - **Không** tạo version cho từng lần autosave trong cùng phiên sửa.
  - Giới hạn tối đa **50 versions** cho mỗi tài liệu; khi vượt quá, xóa các bản `manual` cũ nhất trước, rồi mới tới các bản cũ nhất theo thứ tự FIFO.

### 2.6. Tìm kiếm toàn văn (A7 & Phase B)
- Ứng dụng chạy Postgres (PGlite ở dev/test, Supabase Postgres ở production), không dùng SQLite FTS5.
- Cột `documents.search_text` lưu văn bản đã bỏ dấu bằng `normalizeVi(title + '\n' + body_md)`.
- Cột `documents.search_tsv` (`tsvector` sinh từ `to_tsvector('simple', search_text)`) kèm index GIN giúp tìm kiếm không phân biệt dấu (`"tu tuong"` khớp `"tư tưởng"`).
