# TODO — để phát triển sau

**Trạng thái dự án lúc cập nhật (23/11/2026):** Phase 0–2 đã merge vào `main` (nền tảng, màn Context, Chat dựa trên dữ liệu). Phase 3 — AI đề xuất cập nhật có duyệt — đã có kế hoạch chi tiết ở `docs/superpowers/plans/2026-11-22-phase-3-ai-updates.md` nhưng **chưa bắt đầu**. Không mục nào dưới đây đã được làm.

**Quy ước:** Ưu tiên `P0` = bắt buộc để workstream dùng được; `P1` = nên có trong cùng đợt; `P2` = làm sau được. Mọi mục mới đều ở trạng thái **Not Started**.

---

## Mục cũ (giữ nguyên)

### 1. Trạng thái `Active` hiện màu xanh

- **Hiện tại:** mọi trạng thái dùng cùng một badge xám (`src/components/context/area-row.tsx:37`, `<Badge variant="secondary">`).
- **Việc cần làm:** thêm map màu theo trạng thái (ví dụ `active` xanh lá, `blocked` đỏ, `on_hold` vàng, `completed` xám nhạt), dùng chung cho danh sách và drawer. Màu phải đủ tương phản ở cả chế độ sáng và tối, và nhãn chữ vẫn giữ nguyên (không chỉ dựa vào màu).
- **Độ khó:** thấp, khoảng 30 phút kèm e2e.

### 2. Thông báo trên iPhone cho lịch học và các lịch khác

- **Ngoài phạm vi V1:** spec mục 2 loại trừ push notification, reminder tự động và cron jobs.
- **App chưa có dữ liệu lịch:** database hiện không có bảng lịch học hay lịch lặp lại, chỉ có hạn của task và ngày assessment.
- **Không đọc được lịch trên máy:** một web app (PWA) không thể đọc lịch có sẵn trong ứng dụng Calendar của iPhone. Nếu lịch đó đã có trong Calendar, iPhone đã tự nhắc rồi.
- **Hướng A — xuất lịch dạng ICS (khuyến nghị, độ khó thấp–trung bình):** app tạo một đường link lịch (`.ics`) riêng tư, gồm hạn task, ngày thi và (sau này) lịch học. Bạn thêm link đó vào Calendar trên iPhone một lần, iPhone tự đồng bộ và tự nhắc. Không cần push hay server chạy nền, chỉ cần một route trả về file ICS có token bí mật trong URL.
- **Hướng B — Web Push (độ khó cao):** iOS 16.4+ cho phép PWA đã thêm vào màn hình chính nhận push. Cần:
  - service worker và màn xin quyền thông báo;
  - khóa VAPID và bảng lưu push subscription;
  - một job chạy định kỳ (Vercel Cron hoặc Supabase `pg_cron`) để quyết định khi nào gửi;
  - bảng lịch học / lịch lặp lại mới.

  Push trên iOS cũng kém ổn định hơn nhắc của Calendar.

### 3. Tự động cập nhật dữ liệu theo prompt của tôi

> **Đã gộp vào kế hoạch:** cách hiểu (a) là Phase 3 đã lên kế hoạch; cách hiểu (b) được triển khai trong **Phase B** bên dưới (B5–B7). Giữ bảng phân tích để tham khảo.

| Cách hiểu | Độ khó | Ghi chú |
|---|---|---|
| **a. Cập nhật dữ liệu trong app** (trạng thái môn, topic, task, log) bằng một câu chat | Đã có kế hoạch | Đây chính là **Phase 3**: AI đề xuất thay đổi, bạn bấm duyệt, rồi mới ghi. Khoảng 6 task. |
| **b. AI sửa nội dung văn bản trong app** (ghi chú, course outline, mô tả môn) | Trung bình | → **Phase B** (B5–B7). |
| **c. Ghi thẳng, không cần duyệt** | Thấp về kỹ thuật, rủi ro cao | Trái nguyên tắc của spec ("không bao giờ ghi khi chưa duyệt"). Không lên kế hoạch. |
| **d. Cập nhật tài liệu bên ngoài** (Google Docs, Notion…) | Cao | Spec loại trừ đồng bộ Notion và Gmail. Không lên kế hoạch. |

---

## Workstream 1 — Phase A: Document-First Context Workspace

**Mục tiêu:** mỗi môn học và dự án trở thành một *Context Workspace* chứa không giới hạn tài liệu Markdown, thay cho bộ trường form cố định. Bản ghi có cấu trúc (task, hạn, milestone, blocker, topic, assessment, activity log) được giữ nguyên để truy vấn, lên lịch và tính toán.

**Hiện trạng liên quan (để tránh làm trùng):**
- **Trường form linh hoạt sẽ chuyển thành tài liệu:**
  - `areas.summary`, `areas.goal`;
  - `academic_details.grading_scheme`, `exam_format`, `course_outline`, `term`, `credits`, `target_grade`;
  - `project_details.role`, `collaborators`, `scope`, `cadence`.
- **Đã có một dạng "tài liệu" thô:** bảng `notes` (Markdown, autosave, cờ `ai_excluded`, chuỗi lưu tuần tự trong `notes-panel.tsx`, flush khi app vào nền). Phase A tái dùng mẫu autosave này thay vì viết lại.
- **Trường vận hành giữ nguyên dạng cấu trúc:** `areas.status`, `priority`, `start_date`, `deadline_date`, `next_action`, `ai_excluded`, `aliases`, `archived_at`. Snapshot và AI đang dùng các trường này.

### A0 — Chốt quyết định kiến trúc trước khi code
- **Mô tả:** viết một ghi chú quyết định (ADR) ngắn trong `docs/` chốt: định dạng lưu, thư viện editor, vị trí workspace trong UI, danh sách trường giữ cấu trúc, chính sách version và log. Cập nhật spec mục 2, 3.3 và 5 cho khớp.
- **Ưu tiên:** P0 · **Phụ thuộc:** không
- **Tiêu chí chấp nhận:**
  - Chốt Markdown (GFM) là định dạng lưu chuẩn; editor phải round-trip không mất heading, list, checklist, bảng, code block (có test round-trip).
  - Chọn editor sau khi thử nhanh hai phương án: WYSIWYG xuất Markdown (ví dụ Tiptap + markdown) hoặc editor Markdown có xem trước (ví dụ CodeMirror). Tiêu chí: round-trip, gõ tiếng Việt có dấu trên iOS, ô nhập ≥16px, kích thước bundle.
  - Chốt workspace nằm trong `/context` dưới dạng chế độ toàn màn hình (`/context?item=<id>&doc=<docId>`), vẫn chỉ hai đích điều hướng chính.
  - Spec được sửa ở các mục liên quan và được owner đồng ý.
- **Trạng thái:** Not Started

### A1 — Schema và migration cho tài liệu
- **Mô tả:** thêm bảng `documents` và `document_versions`, kèm index tìm kiếm. Cập nhật `TABLES`, `ENTITY_TYPES` (thêm `document`), `ORIGINS` (thêm `migration`), RLS và export.
- **Ưu tiên:** P0 · **Phụ thuộc:** A0
- **Tiêu chí chấp nhận:**
  - `documents`: `id`, `area_id` (FK, cascade), `title` (1–200), `body_md`, `sort_order`, `template_key?`, `ai_excluded`, `revision` (int, tăng mỗi lần lưu), `search_text` (đã bỏ dấu, chữ thường), `search_tsv` (tsvector sinh tự động, index GIN), `deleted_at?` (xóa mềm), `created_at`, `updated_at`.
  - `document_versions`: `id`, `document_id` (FK), `revision`, `title`, `body_md`, `origin`, `batch_id?`, `created_at`.
  - Bật RLS, không policy; `pnpm verify:rls` và test schema phủ hai bảng mới.
  - `buildExport` tự có hai bảng mới qua `TABLES`; `schema_version` tăng lên 2.
  - Migration chạy được trên PGlite (test) và Supabase Postgres; có test tạo, sửa và xóa mềm.
- **Trạng thái:** Not Started

### A2 — Service ghi tài liệu (theo luật kiến trúc 1–2)
- **Mô tả:** `documentService` trong `src/server/services/`: `create`, `rename`, `updateBody`, `reorder`, `softDelete`, `restore`, `restoreVersion`. Mỗi thao tác ghi dữ liệu và log trong cùng transaction.
- **Ưu tiên:** P0 · **Phụ thuộc:** A1
- **Tiêu chí chấp nhận:**
  - `updateBody(id, body, expectedRevision)` từ chối với lỗi xung đột nếu `revision` hiện tại khác; thành công thì tăng `revision`, cập nhật `search_text` và chạm `areas.updated_at`.
  - **Log không nhiễu:** tạo, đổi tên, xóa, khôi phục mỗi thao tác một log. Sửa nội dung gộp thành **một** log `update` cho mỗi phiên sửa (mở lại sau ≥5 phút không sửa, hoặc đổi tài liệu, mới tính phiên mới). Nội dung dài trong log được rút gọn theo P1-R10.
  - **Chính sách version:** tạo `document_versions` khi bắt đầu phiên sửa mới, khi AI áp dụng thay đổi, khi khôi phục; không tạo cho từng lần autosave. Có giới hạn số version tối đa mỗi tài liệu, kèm cách dọn bản cũ.
  - Unit test: xung đột revision, gộp log, version, xóa mềm/khôi phục, rollback khi lỗi giữa chừng.
- **Trạng thái:** Not Started

### A3 — Lớp đọc và server actions cho tài liệu
- **Mô tả:** `listDocuments(areaId)`, `getDocument(id)`, `listVersions(id)`; server actions qua `runAction` (Zod kiểm `id`, tiêu đề, độ dài nội dung).
- **Ưu tiên:** P0 · **Phụ thuộc:** A2
- **Tiêu chí chấp nhận:**
  - Mọi đọc dữ liệu cho render nằm trong gate `requireOwner()` (luật 7).
  - Giới hạn kích thước một tài liệu (ví dụ 200.000 ký tự) có thông báo lỗi tiếng Việt.
  - Action trả `ActionResult`, không ném lỗi ra client.
- **Trạng thái:** Not Started

### A4 — Editor tài liệu
- **Mô tả:** component editor theo quyết định A0, hỗ trợ heading, list, checklist, bảng, code block, autosave, undo/redo trong phiên.
- **Ưu tiên:** P0 · **Phụ thuộc:** A0, A3
- **Tiêu chí chấp nhận:**
  - Autosave dùng chuỗi lưu tuần tự như `notes-panel.tsx`: debounce, lưu khi rời ô, flush khi `visibilitychange`/`pagehide`, trạng thái "Đang lưu…"/"Đã lưu", không bao giờ tạo hai bản khi lưu dồn.
  - Khi server báo xung đột revision: không ghi đè; hiện "Tài liệu đã thay đổi ở nơi khác" với lựa chọn tải bản mới (giữ bản đang gõ để chép) hoặc xem khác biệt.
  - Undo/redo trong phiên (Ctrl/Cmd+Z), checklist bấm được trên iPhone, ô nhập ≥16px, vùng chạm ≥44px, không tràn ngang.
  - e2e trên desktop và iphone: tạo, gõ, tải lại vẫn còn; checklist; bảng; xung đột giữa hai tab.
- **Trạng thái:** Not Started

### A5 — Thiết kế lại giao diện Workspace
- **Mô tả:** chế độ workspace trong `/context`: cây tài liệu bên trái, editor rộng ở giữa, panel vận hành (Tasks, Milestones, Blockers, Topics, Assessments, Activity) mở bên phải hoặc dạng tab.
- **Ưu tiên:** P0 · **Phụ thuộc:** A4
- **Tiêu chí chấp nhận:**
  - Danh sách môn/dự án hiện tại vẫn giữ (tìm kiếm, dải "Cần cập nhật"); bấm một mục mở workspace thay cho drawer form.
  - Form Tổng quan cũ được thay bằng khối "Thông tin vận hành" gọn: trạng thái, ưu tiên, ngày bắt đầu, deadline, việc tiếp theo, tên gọi tắt, công tắc "Không gửi cho AI".
  - Explorer: tạo, đổi tên, xóa (có xác nhận, xóa mềm), kéo hoặc nút lên/xuống để sắp xếp, tìm theo tiêu đề.
  - Trên iPhone: explorer mở dạng sheet, editor chiếm toàn màn hình, nút đóng ≥44px.
  - URL phản ánh tài liệu đang mở; Back và tải lại mở đúng tài liệu.
  - Academic và Projects dùng chung một engine và một bộ component (chỉ khác template và panel hiện mặc định).
- **Trạng thái:** Not Started

### A6 — Lịch sử phiên bản và khôi phục
- **Mô tả:** xem danh sách version của tài liệu, so khác biệt với bản hiện tại, khôi phục.
- **Ưu tiên:** P1 · **Phụ thuộc:** A2, A4
- **Tiêu chí chấp nhận:**
  - Danh sách hiện thời điểm, nguồn (`manual`, `ai_approved`, `migration`, `undo`).
  - Diff dạng dòng dễ đọc trên iPhone.
  - Khôi phục tạo version mới (không xóa lịch sử) và một log `update` với origin `undo`.
- **Trạng thái:** Not Started

### A7 — Tìm kiếm tài liệu
- **Mô tả:** tìm toàn văn trong một workspace và trên toàn bộ Context, không phân biệt dấu.
- **Ưu tiên:** P1 · **Phụ thuộc:** A1, A3
- **Tiêu chí chấp nhận:**
  - Dùng Postgres full-text (`search_tsv`, cấu hình `simple` trên văn bản đã bỏ dấu bằng cùng hàm `normalizeVi` của server). Xem quyết định kiến trúc số 1 về FTS5.
  - Kết quả có tiêu đề, workspace, đoạn trích có tô từ khóa; bấm mở đúng tài liệu.
  - Gõ "tu tuong" tìm thấy "tư tưởng"; tài liệu đã xóa mềm không hiện.
  - Cùng một hàm truy vấn sẽ được Phase B dùng lại (B1).
- **Trạng thái:** Not Started

### A8 — Liên kết từ tài liệu tới task và milestone
- **Mô tả:** chèn liên kết tới task/milestone có sẵn trong tài liệu; hiển thị dạng chip có trạng thái sống.
- **Ưu tiên:** P1 · **Phụ thuộc:** A4, A5
- **Tiêu chí chấp nhận:**
  - Cú pháp lưu trong Markdown ổn định và đọc được bằng mắt (ví dụ `[Tên task](task:<uuid>)`), nên vẫn là Markdown hợp lệ khi xuất.
  - Bộ chọn "Chèn liên kết" tìm task/milestone của workspace hiện tại.
  - Chip hiện trạng thái hiện tại (Todo/Done…, hạn); bấm mở panel tương ứng.
  - Bản ghi đã xóa hiện "liên kết hỏng", không làm vỡ trang.
- **Trạng thái:** Not Started

### A9 — Template tùy chọn
- **Mô tả:** khi tạo tài liệu có thể chọn template; không bao giờ bắt buộc.
- **Ưu tiên:** P2 · **Phụ thuộc:** A2, A5
- **Tiêu chí chấp nhận:**
  - Bộ mặc định: Academic ("Tổng quan môn", "Syllabus & hình thức thi", "Tiến độ ôn tập"); Project ("Tổng quan dự án", "Nhật ký kỹ thuật", "Blockers & thử nghiệm").
  - Workspace mới có thể bắt đầu trống.
  - Template chỉ là nội dung khởi tạo; không tạo trường bắt buộc nào.
- **Trạng thái:** Not Started

### A10 — Chuyển dữ liệu form hiện có sang tài liệu (migration an toàn)
- **Mô tả:** script và migration chuyển các trường linh hoạt và ghi chú gắn với môn/dự án thành tài liệu, không mất thông tin.
- **Ưu tiên:** P0 · **Phụ thuộc:** A1, A2 (chạy thật sau A5)
- **Tiêu chí chấp nhận:**
  - **Mỗi môn/dự án có một tài liệu "Tổng quan (đã chuyển)":** các trường linh hoạt được đặt dưới heading tương ứng, giữ nguyên văn bản gốc. Văn bản có ký tự Markdown đặc biệt được giữ nguyên trong khối trích dẫn hoặc code nếu cần, để không đổi nghĩa.
  - **Ghi chú gắn với môn/dự án:** mỗi ghi chú thành một tài liệu (tiêu đề = dòng đầu, tối đa 80 ký tự), giữ `ai_excluded` và thời điểm tạo. Ghi chú trong Inbox giữ nguyên trong bảng `notes`.
  - **Lưu ánh xạ** `note_id → document_id` (bảng hoặc cột) để log cũ, đề xuất đang chờ và bộ lọc riêng tư vẫn tra được.
  - **Chạy thử (dry-run)** in báo cáo: số mục, số tài liệu sẽ tạo, tổng ký tự trước/sau cho từng trường. Chạy thật **idempotent** (đánh dấu từng mục đã chuyển), mỗi mục một transaction, origin `migration`.
  - **Xác minh sau khi chạy:** tổng ký tự trường gốc = tổng ký tự nội dung đã chuyển (bỏ phần heading); số ghi chú = số tài liệu từ ghi chú.
  - **Không xóa cột cũ** trong đợt này: các cột chỉ còn đọc (UI không sửa nữa), xóa ở A11 sau ít nhất một đợt dùng thật.
  - **Hướng dẫn trong README:** xuất JSON sao lưu trước; chạy dry-run trên bản sao (PGlite nạp từ bản export) trước khi chạy trên Supabase.
- **Trạng thái:** Not Started

### A11 — Tích hợp và dọn dẹp
- **Mô tả:** cập nhật snapshot, seed/onboarding, export, e2e cho mô hình mới; xóa cột cũ khi đã ổn định.
- **Ưu tiên:** P1 · **Phụ thuộc:** A5, A10
- **Tiêu chí chấp nhận:**
  - `AreaSummary.missing` bỏ các cờ dựa trên trường đã chuyển, thêm cờ `no_documents` nếu hữu ích; snapshot và context builder (Phase 2) vẫn chạy và test xanh.
  - Onboarding có thể tạo sẵn tài liệu từ template (không bắt buộc).
  - Đề xuất Phase 3 đang chờ có đụng trường đã chuyển (`update_area.summary`, `goal`) bị chuyển sang `superseded`, và các field này bị bỏ khỏi schema hành động.
  - Migration xóa cột cũ chỉ chạy sau khi owner xác nhận; có bản export trước đó.
  - Toàn bộ e2e được cập nhật theo UI mới và xanh trên desktop và iphone.
- **Trạng thái:** Not Started

---

## Workstream 2 — Phase B: AI Context Integration

**Mục tiêu:** Chat tìm và đọc đúng tài liệu liên quan, kết hợp với trạng thái có cấu trúc, và đề xuất cập nhật tài liệu hoặc bản ghi. Mọi thay đổi do AI đề xuất phải được duyệt, kiểm tra ở backend, ghi lịch sử và hoàn tác được.

**Không làm trùng:** cơ chế đề xuất, duyệt, kiểm tra xung đột và ghi log cho **bản ghi có cấu trúc** đã được thiết kế trong Phase 3 (`pending_actions`, `propose_changes`, chế độ `tools`/`json`/`off`, `approve`/`reject`/`rebase`, thẻ duyệt). Phase B **mở rộng** engine đó cho tài liệu, không dựng engine thứ hai.

### B0 — Hoàn tất Phase 3 làm nền
- **Mô tả:** triển khai Phase 3 theo kế hoạch hiện có: engine đề xuất, duyệt và áp dụng cho bản ghi có cấu trúc.
- **Ưu tiên:** P0 · **Phụ thuộc:** Phase 2 (đã xong)
- **Tiêu chí chấp nhận:** đạt mục "Xong khi" của Phase 3; criteria 7, 8, 10, 12, 14, 16 của spec đạt.
- **Trạng thái:** Not Started

### B1 — Chỉ mục truy hồi tài liệu
- **Mô tả:** chia tài liệu thành đoạn theo heading để tìm và trích dẫn; cập nhật chỉ mục trong cùng transaction khi tài liệu đổi.
- **Ưu tiên:** P0 · **Phụ thuộc:** A1, A2, A7
- **Tiêu chí chấp nhận:**
  - Bảng `document_chunks` (`document_id`, `heading_path`, `ordinal`, `text`, `search_tsv`) hoặc tính khi truy vấn; lựa chọn được ghi lại trong ADR.
  - Hàm `searchContext(query, { areaIds?, limit })` trả đoạn xếp hạng theo FTS, có `documentId`, `heading_path`, `updated_at`.
  - Không bao giờ trả đoạn của tài liệu hoặc workspace `ai_excluded`.
  - Test: tìm không dấu, xếp hạng, loại trừ riêng tư, cập nhật chỉ mục sau khi sửa.
- **Trạng thái:** Not Started

### B2 — Chọn ngữ cảnh tài liệu cho mỗi lượt chat
- **Mô tả:** mở rộng `buildContext` (Phase 2): thêm dàn ý tài liệu, nội dung tài liệu chắt lọc ưu tiên và các đoạn liên quan nhất từ tài liệu thô cho câu hỏi theo từng workspace và xuyên workspace.
- **Ưu tiên:** P0 · **Phụ thuộc:** B1, B10
- **Tiêu chí chấp nhận:**
  - Phân biệt vai trò tài liệu: tài liệu **`context` / được ghim** (ví dụ bản tóm tắt dự án trích từ ChatGPT) được ưu tiên đưa dàn ý & phần cốt lõi vào ngữ cảnh khi workspace đó được chọn; tài liệu **`raw`** (syllabus, đề thi, PDF…) chỉ gửi top-K đoạn khớp câu hỏi và 3 tin nhắn trước để tiết kiệm token và tránh nhiễu.
  - Câu hỏi tổng thể ("tuần này…"): top-K đoạn xuyên workspace, ưu tiên workspace active, tài liệu `context` và tài liệu mới sửa.
  - Ngân sách riêng cho tài liệu (ví dụ ≤40% của 32.000 ký tự), thứ tự cắt xác định và có test. Tầng 1 (trạng thái có cấu trúc) không bao giờ bị cắt.
  - `contextRefs` có thêm `documentId`; dòng "Dựa trên:" có chip mở đúng tài liệu.
  - Unit test với mock provider cho từng phạm vi.
- **Trạng thái:** Not Started

### B3 — Công cụ đọc tài liệu cho AI (tùy chọn)
- **Mô tả:** khi `AI_ACTION_MODE=tools`, cho model gọi `search_documents(query)` và `read_document(id, heading?)` để lấy thêm khi ngữ cảnh ban đầu thiếu.
- **Ưu tiên:** P2 · **Phụ thuộc:** B2
- **Tiêu chí chấp nhận:**
  - Có giới hạn số lần gọi mỗi lượt.
  - Tôn trọng `ai_excluded`.
  - Chế độ `json`/`off` vẫn hoạt động chỉ với truy hồi phía server.
- **Trạng thái:** Not Started

### B4 — Độ tin cậy và độ mới của ngữ cảnh
- **Mô tả:** gắn siêu dữ liệu độ mới cho mỗi đoạn tài liệu và cập nhật system prompt để xử lý thông tin cũ hoặc mâu thuẫn.
- **Ưu tiên:** P1 · **Phụ thuộc:** B2
- **Tiêu chí chấp nhận:**
  - Mỗi đoạn kèm `updated_at`, `days_since_update` (server tính) và nguồn sửa gần nhất (`manual`, `ai_approved`, `migration`).
  - Prompt: trạng thái có cấu trúc thắng tài liệu khi mâu thuẫn và AI phải nói rõ chỗ mâu thuẫn. Đoạn cũ hơn `stale_after_days` được coi là "có thể đã lỗi thời". Phân loại `Confirmed` / `User reported` / `Inferred` / `Unknown` áp dụng cho cả nội dung tài liệu.
  - Test với mock: ngữ cảnh mâu thuẫn tạo đúng các trường cần thiết trong state JSON.
- **Trạng thái:** Not Started

### B5 — Loại hành động đề xuất cho tài liệu
- **Mô tả:** mở rộng union `ProposedAction` của Phase 3 với các thao tác tài liệu có neo chính xác.
- **Ưu tiên:** P0 · **Phụ thuộc:** B0, A2
- **Tiêu chí chấp nhận:**
  - Các loại mới:
    - `create_document {areaId, title, markdown}`
    - `append_to_document {documentId, heading?, markdown}`
    - `replace_section {documentId, heading, markdown}`
    - `set_checklist_item {documentId, itemText, checked}`
    - `rename_document {documentId, title}`
  - **Không có hành động xóa.**
  - **Kiểm tra ở backend:** tài liệu tồn tại, không `ai_excluded`, không bị xóa mềm. Heading hoặc `itemText` phải khớp đúng một vị trí. Có giới hạn độ dài.
  - **Server tự ghi mốc khi lưu đề xuất:** `baseRevision` và hash của section đích.
  - Chế độ `json` (`<proposed_actions>`) phủ các loại mới; `ai:probe` có thêm một ca hành động tài liệu.
- **Trạng thái:** Not Started

### B6 — Áp dụng có kiểm soát xung đột
- **Mô tả:** áp dụng thao tác tài liệu trong cùng transaction với thao tác có cấu trúc của một lô duyệt.
- **Ưu tiên:** P0 · **Phụ thuộc:** B5
- **Tiêu chí chấp nhận:**
  - Cả lô thành công hoặc không ghi gì.
  - Mỗi tài liệu bị đổi: tăng `revision`, tạo version (origin `ai_approved`, chung `batchId`), một log.
  - **Xung đột theo section:** nếu chính section đích đã đổi (hash khác) thì báo xung đột, không ghi đè. Chỗ khác của tài liệu đổi thì vẫn áp dụng được (giảm xung đột giả).
  - Dòng đích bị khóa (`FOR UPDATE`) trong transaction.
  - Test: hai lần duyệt đồng thời chỉ áp dụng một lần; sửa tay section đích rồi duyệt → xung đột; sửa section khác rồi duyệt → áp dụng.
- **Trạng thái:** Not Started

### B7 — Giao diện duyệt có diff
- **Mô tả:** mở rộng thẻ đề xuất của Phase 3: mỗi hành động tài liệu hiện đích (workspace › tài liệu › section) và diff.
- **Ưu tiên:** P0 · **Phụ thuộc:** B6
- **Tiêu chí chấp nhận:**
  - Diff dòng có tô thêm/bớt; đoạn dài thu gọn được.
  - Sửa nội dung đề xuất trước khi duyệt (được kiểm tra lại ở server); duyệt một phần.
  - Đọc được bằng một tay trên iPhone, không tràn ngang.
  - e2e với mock provider: đề xuất cập nhật tài liệu → duyệt → tài liệu đổi đúng một lần và có version; từ chối → không đổi.
- **Trạng thái:** Not Started

### B8 — Hoàn tác thay đổi do AI
- **Mô tả:** hoàn tác lô AI vừa áp dụng.
- **Ưu tiên:** P1 · **Phụ thuộc:** B6, A6
- **Tiêu chí chấp nhận:**
  - **Hoàn tác thẳng:** khi đích chưa bị sửa tiếp. Bản ghi có cấu trúc dùng thay đổi bù; tài liệu khôi phục version trước. Log với origin `undo`, không xóa log cũ.
  - **Đích đã bị sửa tiếp:** không hoàn tác thẳng; đưa người dùng tới lịch sử version để khôi phục có chủ đích.
  - Test cả hai nhánh.
- **Trạng thái:** Not Started

### B9 — Định tuyến đề xuất tới đúng đích
- **Mô tả:** quy tắc trong prompt kèm kiểm tra ở server để mỗi loại thông tin vào đúng chỗ.
- **Ưu tiên:** P1 · **Phụ thuộc:** B5
- **Tiêu chí chấp nhận:**
  - **Bảng ưu tiên được ghi trong ADR:**
    - Hạn hoặc deadline → luôn là task hoặc assessment có `dueDate`, không bao giờ chỉ nằm trong tài liệu.
    - Blocker → bản ghi blocker, có thể thêm ghi chú vào tài liệu dự án.
    - Hoàn thành topic → cập nhật topic có cấu trúc, có thể thêm một dòng vào tài liệu tiến độ nếu có.
  - Server từ chối đề xuất chỉ ghi ngày vào tài liệu khi câu chat nói rõ một hạn (ví dụ cảnh báo trong thẻ duyệt).
  - Test với mock cho ba ví dụ: hoàn thành topic Algebra, blocker dự án, deadline mới.
- **Trạng thái:** Not Started

### B10 — Riêng tư cho tài liệu
- **Mô tả:** mở rộng mọi đường loại trừ `ai_excluded` hiện có sang tài liệu.
- **Ưu tiên:** P0 · **Phụ thuộc:** A1, A2
- **Tiêu chí chấp nhận:**
  - Tài liệu `ai_excluded` (hoặc thuộc workspace `ai_excluded`) không xuất hiện trong: Tầng 2, đoạn truy hồi, `recentLogs`, công cụ đọc, lịch sử chat (mở rộng P2-R3: tin nhắn có `contextRefs` trỏ tới tài liệu bị loại thì bị ẩn).
  - Test trên **toàn bộ** payload gửi provider (system và mọi message), giống test Phase 2.
- **Trạng thái:** Not Started

### B11 — Bộ test nhất quán ngữ cảnh
- **Mô tả:** bộ test và script đánh giá cho các tình huống ngữ cảnh khó.
- **Ưu tiên:** P1 · **Phụ thuộc:** B2–B10
- **Tiêu chí chấp nhận:**
  - **Fixture:** tài liệu mâu thuẫn với trạng thái có cấu trúc; tài liệu cũ; tài liệu riêng tư; câu hỏi xuyên workspace; hai tài liệu cùng heading.
  - **Unit test với mock** kiểm ngữ cảnh được chọn và state JSON.
  - **Script đánh giá thật** (giống `ai:probe`) chạy trên dữ liệu seed, ghi kết quả vào `docs/ai-probe-report.md` theo checklist hành vi mong đợi.
  - **Test hồi quy:** không bao giờ ghi đè bản mới hơn.
- **Trạng thái:** Not Started

---

## Workstream 3 — Phase C: Quản lý thư mục & Tài liệu đa định dạng (Mini File Explorer + AI Folder Management)

**Mục tiêu:** Nâng cấp Document Explorer từ danh sách tài liệu `.md` phẳng thành một **Mini File Explorer** hỗ trợ cây thư mục lồng nhau và nhiều định dạng tệp (`.md`, `.txt`, code, `.csv`, `.json`, `.pdf`, ảnh, `.docx`…), đồng thời cho phép AI đọc nội dung trích xuất và **đề xuất sắp xếp, tạo, đổi tên, di chuyển thư mục/tệp** qua quy trình duyệt an toàn.

**Không làm trùng:** Tiếp tục mở rộng `documents`, `document_versions` (Phase A) và engine đề xuất + chỉ mục truy hồi của Phase 3 / Phase B (`propose_changes`, `Approve / Edit / Reject`, `ai_excluded`), không tạo hệ thống quyền hay engine đề xuất riêng.

### C0 — Chốt kiến trúc thư mục & lưu trữ tệp (ADR-002)
- **Mô tả:** Viết ADR ngắn trong `docs/adr/` chốt: cấu trúc cây `folders`, danh sách MIME/đuôi tệp hỗ trợ, ranh giới loại tệp *sửa trực tiếp* vs *chỉ xem & trích xuất*, kiến trúc `FileStorage` (local disk / memory cho dev & test vs Supabase Storage private bucket cho production), chính sách dung lượng tối đa và chiến lược backup/export khi có tệp nhị phân.
- **Ưu tiên:** P0 · **Phụ thuộc:** A1
- **Tiêu chí chấp nhận:**
  - Chốt adapter `FileStorage` (`put`, `getSignedUrl`/`stream`, `delete`) chạy đồng nhất trên test/PGlite local và Supabase production.
  - Phân định rõ 3 nhóm tệp: (1) Markdown `.md` (editor GFM + version + AI sửa section), (2) văn bản/dữ liệu đọc được (`.txt`, `.csv`, `.json`, code — xem/sửa text hoặc xem bảng), (3) tệp nhị phân (`.pdf`, ảnh, `.docx` — lưu Object Storage, trích xuất `extracted_text` để tìm kiếm/AI đọc, hỗ trợ upload bản mới).
  - Xác định giới hạn kích thước mỗi tệp (ví dụ 10–25 MB) và whitelist MIME an toàn (chống SVG script / XSS khi preview).
- **Trạng thái:** Not Started

### C1 — Schema & Service cây thư mục (`folders`)
- **Mô tả:** Thêm bảng `folders` (`id`, `area_id`, `parent_id` tự tham chiếu, `name`, `sort_order`, `ai_excluded`, `deleted_at`, `created_at`, `updated_at`) và gắn `documents.folder_id` (nullable = ở thư mục gốc workspace) cùng `doc_role` (`context` | `raw` | `instruction`, mặc định `context`) + `pinned` boolean. Xây `folderService` theo luật kiến trúc 1–2 (mọi thao tác ghi đều ghi `activity_logs` trong cùng transaction).
- **Ưu tiên:** P0 · **Phụ thuộc:** C0, A2
- **Tiêu chí chấp nhận:**
  - Hỗ trợ tạo, đổi tên, di chuyển thư mục/tài liệu (`moveNode`), sắp xếp `sort_order`, đổi vai trò tài liệu (`context` đã chắt lọc vs `raw` tài liệu gốc như syllabus/đề thi), xóa mềm theo nhánh và khôi phục.
  - **Chống vòng lặp cây:** backend bắt buộc kiểm tra và từ chối di chuyển một thư mục vào chính nó hoặc thư mục con của nó.
  - **Kế thừa riêng tư:** nếu bất kỳ thư mục cha nào bật `ai_excluded = true`, toàn bộ thư mục con và tệp bên trong mặc định bị loại khỏi tìm kiếm AI và ngữ cảnh chat.
  - Tùy chọn tạo sẵn bộ thư mục gợi ý không bắt buộc khi mở workspace mới (ví dụ `Context/` cho bản chắt lọc từ ChatGPT và `Tài liệu gốc/` cho syllabus, đề, slide).
  - Bật RLS (`enableRLS()`), cập nhật `TABLES`, `ENTITY_TYPES` (thêm `folder`), export `schema_version`, có unit test đầy đủ (di chuyển vòng lặp, kế thừa `ai_excluded`, rollback).
- **Trạng thái:** Not Started

### C2 — Upload, lưu trữ tệp & Trình trích xuất nội dung (`extracted_text`)
- **Mô tả:** Cho phép tải lên tệp ngoài `.md` vào thư mục của workspace, lưu tệp nhị phân qua `FileStorage` và trích xuất văn bản thuần vào DB (`mime_type`, `file_ext`, `storage_key`, `size_bytes`, `extracted_text`) để đồng bộ FTS (`search_tsv`) và `document_chunks` (Phase B).
- **Ưu tiên:** P0 · **Phụ thuộc:** C0, C1, A7
- **Tiêu chí chấp nhận:**
  - Upload qua kéo-thả hoặc nút chọn tệp trong Explorer (desktop & iPhone Files), kiểm tra MIME + dung lượng ở server trước khi ghi.
  - Tệp text/CSV/JSON tự động đưa vào `search_text` / `search_tsv`; tệp PDF (và DOCX nếu bật) trích xuất text không dấu vào chỉ mục tìm kiếm để gõ không dấu vẫn tìm ra tệp.
  - Mọi route đọc/tải tệp đều qua gate `requireOwner()` và không lộ URL công khai không hết hạn; header `Content-Security-Policy` & `Content-Disposition` an toàn (không thực thi HTML/SVG upload).
  - Test: kiểm tra MIME sai/quá dung lượng bị từ chối bằng tiếng Việt, tệp `ai_excluded` không tải/truy hồi cho AI, xóa mềm giữ tệp an toàn trước khi dọn.
- **Trạng thái:** Not Started

### C3 — Giao diện Mini File Explorer & Trình xem đa định dạng
- **Mô tả:** Nâng cấp cột trái Workspace thành **Mini File Explorer**: cây thư mục thu gọn/mở rộng được, breadcrumb đường dẫn, tìm nhanh theo tên tệp/thư mục, kéo thả hoặc menu chuyển thư mục, upload nhiều định dạng và trình xem/sửa tương ứng ở giữa màn hình.
- **Ưu tiên:** P0 · **Phụ thuộc:** C1, C2, A5
- **Tiêu chí chấp nhận:**
  - Cây thư mục có nút mở rộng/thu gọn, tạo thư mục con, tạo file `.md`, upload tệp, đổi tên tại chỗ, di chuyển tới thư mục khác, xóa mềm (có xác nhận).
  - **Trình xem/sửa theo loại tệp:** `.md` dùng `DocEditor` hiện có; `.txt`/`.json`/code hiển thị gọn có line/monospace; `.csv` xem dạng bảng dễ cuộn; ảnh xem trực tiếp; `.pdf` xem preview + nút tải xuống; tệp khác hiện metadata (tên, kích thước, loại, thư mục) + nút tải xuống.
  - Ghi nhớ trạng thái mở thư mục và URL phản ánh thư mục/tệp đang chọn (`?item=<areaId>&folder=<folderId>&doc=<docId>`).
  - Dùng tốt một tay trên iPhone (Sheet cây thư mục, chạm ≥44px, input ≥16px, bảng/preview không làm tràn ngang trang).
  - e2e trên desktop và iphone: tạo thư mục lồng nhau, chuyển file vào thư mục, upload tệp mẫu, xem preview và tìm kiếm ra tệp.
- **Trạng thái:** Not Started

### C4 — AI quản lý thư mục & sắp xếp tệp (có duyệt)
- **Mô tả:** Mở rộng `ProposedAction` và ngữ cảnh AI để AI nhìn được cấu trúc cây thư mục hiện tại của workspace và đề xuất tổ chức, phân loại hoặc đặt tài liệu mới vào đúng thư mục.
- **Ưu tiên:** P1 · **Phụ thuộc:** C1, B5–B7
- **Tiêu chí chấp nhận:**
  - Gửi kèm cây thư mục gọn (`folderId`, `path`, `documentCount`) của các workspace được chọn vào ngữ cảnh chat (tôn trọng `ai_excluded`).
  - Các action mới trong `propose_changes`:
    - `create_folder {areaId, parentId?, name}`
    - `rename_folder {folderId, name}`
    - `move_node {nodeType: 'folder' | 'document', id, targetFolderId: string | null}`
    - `create_document` mở rộng thêm `folderId?` tùy chọn để tạo tài liệu mới vào đúng thư mục.
  - **Không có hành động AI xóa thư mục hay xóa tệp, và AI không được sửa file có `doc_role = 'instruction'`.**
  - **Thẻ duyệt cây thay đổi:** Hiển thị rõ đường dẫn cũ → mới (hoặc cây thư mục dự kiến sẽ tạo/chuyển), hỗ trợ bỏ chọn từng bước hoặc sửa tên/thư mục đích trước khi bấm `Approve`.
  - Áp dụng chung transaction (khóa kiểm tra xung đột parent/cycle ở server), tạo log với nguồn `ai_approved` và hỗ trợ hoàn tác (`undo`, tương tự B8).
  - Test & e2e với mock provider: chat yêu cầu *"sắp xếp lại tài liệu môn học theo từng chương / phân loại đề thi và slide"* → AI đề xuất tạo thư mục + di chuyển tệp → duyệt → cây thư mục đổi đúng và không đụng thư mục `ai_excluded`.
- **Trạng thái:** Not Started

### C5 — Skills & Hướng dẫn AI kiểu `skills.md` (toàn cục & theo Workspace)
- **Mô tả:** Cho phép định nghĩa tập hợp quy tắc/kỹ năng hướng dẫn AI hành xử (tương đương Custom Instructions của ChatGPT Projects / `skills.md`) ở cấp toàn app (trong Settings hoặc thư viện chung) và cấp từng Workspace (ví dụ: quy trình bóc tách syllabus ra assessment/topic, phong cách lập kế hoạch học tập, quy tắc review dự án code).
- **Ưu tiên:** P1 · **Phụ thuộc:** B2, C1
- **Tiêu chí chấp nhận:**
  - Tách biệt rõ khối **`<workspace_instructions>`** (chỉ nhận từ nguồn `instruction` do chính owner tạo/sửa) với khối **`<workspace_state>`** (nơi chứa dữ liệu, tài liệu chắt lọc và tài liệu thô vốn luôn bị xem là *DỮ LIỆU* không được ra lệnh cho AI).
  - Hỗ trợ gắn các `skill` Markdown có sẵn hoặc tự viết (bật/tắt theo Workspace hoặc toàn cục), có giới hạn ngân sách ký tự rõ ràng (ví dụ tối đa 2.000–4.000 ký tự mỗi lượt) để không chèn ép dữ liệu thật.
  - **An toàn quyền ghi:** Tài liệu thô upload (`.pdf`, `.md` ngoại lai…) không bao giờ được gắn nhãn `instruction`, và AI trong chat không có action tạo hay chỉnh sửa `instruction` / `skills.md`.
  - Unit test: kiểm tra `instruction` được đưa đúng vị trí vào system prompt, tôn trọng `ai_excluded`, bị cắt theo trần ngân sách nếu quá dài, và AI không thể sửa `instruction`.
- **Trạng thái:** Not Started

---

## Quyết định kiến trúc cần chú ý khi triển khai

1. **SQLite FTS5 không áp dụng được.** Ứng dụng chạy Postgres (Supabase ở production, PGlite khi dev/test), không phải SQLite. Phương án tương đương nhẹ nhất: Postgres full-text search (`tsvector` + index GIN, cấu hình `simple`) trên một cột văn bản đã bỏ dấu bằng chính hàm `normalizeVi` đang dùng cho Chat. Postgres không có từ điển tiếng Việt, nên bỏ dấu và tách từ đơn giản là đủ. Có thể thêm `pg_trgm` cho tìm gần đúng nếu PGlite hỗ trợ (cần kiểm chứng). Không cần vector DB.
2. **"Local-first" và kiến trúc hiện tại.** Owner đã chọn deploy lên Vercel và Supabase để dùng trên iPhone. Dev và test vẫn chạy local hoàn toàn bằng PGlite. Soạn thảo offline có đồng bộ (CRDT) nằm ngoài phạm vi; nếu cần thì là một workstream riêng.
3. **Quy tắc hai màn hình.** Workspace rộng không vừa drawer hiện tại. Đề xuất: chế độ toàn màn hình trong `/context` (URL có `item` và `doc`), vẫn chỉ hai đích điều hướng. Cần sửa spec (A0).
4. **Markdown là định dạng lưu chuẩn.** Dễ cho AI đọc, dễ diff, dễ tìm, dễ xuất. Rủi ro là editor WYSIWYG làm mất định dạng khi round-trip; bắt buộc có test round-trip trước khi chốt editor.
5. **Ranh giới cấu trúc và tài liệu.** Giữ cấu trúc cho mọi thứ cần truy vấn, lên lịch hoặc tính toán: trạng thái, ưu tiên, các ngày, việc tiếp theo, task, assessment, milestone, blocker, topic, activity log. Tài liệu chỉ chứa bối cảnh linh hoạt. Topic, assessment và blocker cũng giữ cấu trúc vì snapshot và Chat đang dựa vào chúng.
6. **Log và version phải gộp.** Autosave 1,5 giây đã từng làm lịch sử đầy nhiễu ở Phase 1. Tài liệu phải gộp theo phiên sửa (A2), nếu không Activity và ngữ cảnh AI sẽ bị chiếm chỗ.
7. **Xung đột theo section thay vì cả tài liệu.** Tránh việc mỗi lần autosave làm mọi đề xuất AI đang chờ thành "xung đột".
8. **Một engine đề xuất duy nhất.** Phase B mở rộng Phase 3, không dựng engine song song. Undo (từng là P1 của spec) được làm ở B8.
9. **Ngân sách ngữ cảnh.** Tài liệu có thể rất dài; chỉ gửi dàn ý và các đoạn liên quan nhất, không gửi nguyên tài liệu.
10. **Lưu trữ tệp đa định dạng (Phase C).** Không nhét file nhị phân (PDF, ảnh, DOCX) vào Postgres/PGlite dưới dạng `bytea` hay base64 để tránh phình DB và nặng JSON export. Dùng abstraction `FileStorage` (thư mục local/memory khi dev & test; private bucket của Supabase Storage khi production) và chỉ lưu metadata + `extracted_text` trong Postgres để FTS & AI dùng chung.
11. **Thư mục và bảo mật xem trước.** Kế thừa `ai_excluded` theo cây thư mục (tắt AI ở thư mục cha → ẩn toàn bộ thư mục con/tệp con). Chặn thực thi script khi preview tệp upload (không render HTML/SVG thô cùng origin, dùng CSP & `Content-Disposition` an toàn).
12. **Tách biệt Tài liệu thô, Context chắt lọc và `skills.md`.** Tài liệu thô (`raw`: syllabus, đề, PDF) chỉ index để tìm kiếm/trích đoạn; tài liệu chắt lọc (`context`: bản trích xuất từ ChatGPT, tổng quan) được ưu tiên đọc; còn hướng dẫn hành vi kiểu `skills.md` (`instruction`) chỉ do owner tự sửa và đưa vào vùng instruction riêng có trần token để chống prompt injection từ tài liệu ngoại lai.

## Rủi ro khi chuyển dữ liệu (A10)

- **Mất hoặc đổi nghĩa văn bản khi chuyển trường sang Markdown:** ký tự như `#`, `*`, `|` trong văn bản gốc có thể bị hiểu thành định dạng. Cần giữ nguyên văn và xác minh bằng tổng ký tự.
- **Chạy hai lần tạo tài liệu trùng:** cần đánh dấu từng mục đã chuyển (idempotent).
- **Lỗi giữa chừng để lại trạng thái dở dang:** mỗi mục một transaction; có báo cáo mục nào đã/chưa chuyển.
- **Đổi ID từ ghi chú sang tài liệu:** activity log cũ, đề xuất Phase 3 đang chờ (`pending_actions.note_id`) và bộ lọc riêng tư cho log ghi chú (Phase 2) đều tham chiếu `note_id`. Cần bảng ánh xạ và test riêng tư sau chuyển.
- **Cờ riêng tư bị rơi:** `ai_excluded` của ghi chú và workspace phải được giữ; cần test "dữ liệu riêng tư trước khi chuyển vẫn không tới AI sau khi chuyển".
- **Đề xuất AI đang chờ thành sai đích:** các đề xuất đụng `summary` hoặc `goal` phải chuyển `superseded` trước khi bỏ trường.
- **Chạy trên dữ liệu thật ở Supabase:** bắt buộc xuất JSON trước, chạy thử trên bản sao, và không xóa cột cũ trong cùng đợt.
- **Bản export cũ (`schema_version` 1)** không có tài liệu. Nếu sau này làm tính năng nhập lại, phải hỗ trợ cả hai phiên bản.
- **E2E vỡ hàng loạt** vì drawer form bị thay; cần thời gian cập nhật test tương ứng (A11).

## Thứ tự triển khai an toàn đề xuất

1. **B0 — Phase 3 như đã lên kế hoạch.** Có ngay engine duyệt, kiểm tra xung đột và ghi log; Phase B chỉ cần mở rộng.
2. **A0 → A1 → A2 → A3:** nền dữ liệu và service, chưa đụng UI.
3. **Viết script A10 ở chế độ dry-run sớm** (chạy trên bản sao) để phát hiện vấn đề dữ liệu trước khi thiết kế UI xong.
4. **A4 → A5 → A6 → A7 → A8 → A9:** editor và workspace mới, chạy song song với giao diện cũ sau một cờ cấu hình cho tới khi ổn.
5. **A10 chạy thật** (sau khi export), rồi **A11** (dọn dẹp; xóa cột cũ để sau cùng).
6. **B10 → B1 → B2 → B4:** riêng tư trước, rồi truy hồi và ngữ cảnh.
7. **B5 → B6 → B7 → B9 → B8:** đề xuất, áp dụng, duyệt, định tuyến, hoàn tác.
8. **B11** chạy liên tục từ B2 trở đi; **B3** chỉ làm nếu thực tế cho thấy truy hồi phía server chưa đủ.
9. **C0 → C1 → C2 → C3:** chốt kiến trúc lưu trữ, thêm bảng `folders` và upload/trích xuất text, nâng cấp Explorer thành Mini File Explorer + trình xem đa định dạng.
10. **C4 & C5** (sau C1 và B5–B7): mở rộng đề xuất AI cho quản lý cây thư mục & phân loại tệp có duyệt, kèm hệ thống `skills.md` / AI Instructions toàn cục & theo từng Workspace.
