# ADR 002: Mini File Explorer, Thư mục Lồng nhau & Lưu trữ Tài liệu Đa định dạng (Phase C0–C3)

- **Ngày:** 24/11/2026
- **Trạng thái:** Đề xuất để owner duyệt trước khi lập plan chi tiết & implement `C1–C3` + script import tài liệu HUST 2026.1
- **Liên kết:** [TODO.md — Workstream 3 (Phase C)](../../TODO.md), [ADR 001](./001-document-first-workspace.md)

---

## 1. Bối cảnh & Mục tiêu

Sau Wave 3 (`A4–A9`), mỗi workspace trong `/context` đã có Document Editor Markdown (GFM) phẳng. Tuy nhiên dữ liệu học tập thực tế của owner gồm hai lớp rất lớn:
1. **8 gói ngữ cảnh chắt lọc từ ChatGPT** (~83 file: `.md`, `.csv`, `.json` manifest).
2. **Tài liệu thô từ `C:\Users\LENOVO\OneDrive\HUST\2026.1\`** (150 file, ~271 MB: `.pdf` lên tới 13.85 MB/file, `.docx`, `.pptx`, `.txt`, `.jpg`, trừ 1 shortcut `.lnk` cần bỏ qua).

Để quản lý thuận tiện như một **Mini File Explorer**, app cần:
- Cây thư mục lồng nhau (`folders`),
- Lưu trữ và xem/tải đa định dạng tệp an toàn (không nhồi 271 MB binary vào Postgres/PGlite),
- Trích xuất văn bản (`extracted_text`) để tìm kiếm không dấu (`A7`) và chuẩn bị cho AI RAG (`Phase B`),
- Chuẩn hóa và import toàn bộ 8 gói ChatGPT + tài liệu thô OneDrive vào cấu trúc thư mục thống nhất trên toàn bộ các môn học.

**Ngoài phạm vi đợt này (làm ở Phase B & C4–C5 sau):**
- AI đọc chunk (`document_chunks`), đề xuất sửa section hoặc AI đề xuất tạo/di chuyển thư mục (`B1–B9`, `C4`, `C5`). Tuy nhiên schema & dữ liệu của đợt này sẽ gán sẵn `doc_role` (`context` | `raw` | `instruction`) và `search_text` để Phase B/C4 cắm vào dùng ngay.

---

## 2. Phương án đã cân nhắc & Lựa chọn

| Tiêu chí | Phương án A (Text-only trên Phase A hiện tại) | Phương án B (**Đã chọn**: `folders` + `FileStorage` + Mini File Explorer `C0–C3`) |
|---|---|---|
| **Cấu trúc** | Danh sách phẳng `.md` + trang mục lục dẫn đường dẫn OneDrive | Cây thư mục lồng nhau (`folders`) dùng chung cho mọi môn và dự án |
| **File PDF/PPTX/DOCX/ảnh (~271 MB)** | Không mở trực tiếp trên web được | Lưu qua `FileStorage` (`./.storage/` local, Supabase Storage private bucket khi deploy), xem/tải trực tiếp qua `/api/files/[id]` |
| **Tìm kiếm không dấu (`A7`)** | Chỉ tìm được file `.md` | Tự trích xuất `extracted_text` (PDF, DOCX, PPTX, CSV, TXT, JSON) vào `search_text`/`search_tsv` |
| **Đánh đổi** | Làm nhanh 1 bước, nhưng không giải quyết được nhu cầu "file explorer thu nhỏ" | Cần migrate schema + thêm `FileStorage` + UI cây thư mục trước khi import |

---

## 3. Quyết định Kiến trúc (`C0`)

### 3.1. Phân loại 3 nhóm tệp & Ranh giới xử lý

1. **Nhóm 1 — Markdown (`.md`):**
   - Sửa trực tiếp bằng `DocEditor` GFM hiện có, lưu `body_md`, autosave, revision, lịch sử `document_versions`, chèn liên kết `task:`/`milestone:`.
2. **Nhóm 2 — Văn bản & Dữ liệu nhẹ đọc được (`.txt`, `.csv`, `.json`):**
   - Lưu nội dung text trong `body_md` (kèm `mime_type`, `file_ext`), đồng bộ `search_text`.
   - **Trình xem:** `.txt` / `.json` dùng trình xem/sửa văn bản monospace (autosave & version như `.md`); `.csv` mặc định hiển thị **bảng có thể cuộn ngang/dọc & tìm lọc nhẹ**, kèm tab chuyển xem dạng văn bản thô để sửa nếu cần.
3. **Nhóm 3 — Tệp nhị phân đính kèm (`.pdf`, `.docx`, `.pptx`, `.png`, `.jpg`, `.jpeg`, `.webp`):**
   - Lưu file gốc trong `FileStorage` qua `storage_key` (không đặt `bytea`/base64 vào DB để không phình `.pglite` và chậm `/api/export`).
   - Lưu metadata (`mime_type`, `file_ext`, `storage_key`, `size_bytes`) và nội dung trích xuất thuần (`extracted_text`) trong bảng `documents` để tìm kiếm FTS không dấu hoạt động đồng nhất.
   - **Trình xem:** Ảnh render trực tiếp `<img>`; PDF nhúng `<iframe>` (hoặc link mở tab mới + tải xuống, kèm xem văn bản trích xuất để đọc tiện trên iPhone); `.docx` / `.pptx` hiển thị thẻ thông tin + nút tải xuống + bản xem nhanh văn bản trích xuất theo từng trang/slide.
   - Cho phép **thay thế file (upload bản mới)** hoặc tải xuống; không giả lập sửa binary trực tiếp trên web.

### 3.2. Giới hạn & Whitelist an toàn (MIME / XSS)

- **Giới hạn dung lượng upload/import:** **25 MB / tệp** (đáp ứng toàn bộ file thực tế trong `OneDrive\HUST\2026.1\`, lớn nhất hiện là `13.85 MB`).
- **Whitelist đuôi & MIME:**
  - Text: `.md` (`text/markdown`), `.txt` (`text/plain`), `.csv` (`text/csv`), `.json` (`application/json`).
  - Binary: `.pdf` (`application/pdf`), `.docx` (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`), `.pptx` (`application/vnd.openxmlformats-officedocument.presentationml.presentation`), `.png` (`image/png`), `.jpg`/`.jpeg` (`image/jpeg`), `.webp` (`image/webp`).
- **Từ chối tuyệt đối:** `.html`, `.htm`, `.svg`, file thực thi (`.exe`, `.bat`, `.ps1`, `.sh`), và shortcut Windows (`.lnk` — script import tự động bỏ qua và ghi log báo cáo).
- **Bảo mật phục vụ tệp (`/api/files/[id]`):**
  - Bắt buộc qua `withOwner()` + `connection()` (từ chối `401` nếu chưa đăng nhập).
  - Header bắt buộc: `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, `Content-Security-Policy: default-src 'none'; sandbox` cho file tải trực tiếp; dùng `Content-Disposition: attachment` cho `.docx`/`.pptx`/`.json`/`.csv` và `inline` cho ảnh & PDF khi preview.
  - **Lưu ý CSP hiện tại ở [next.config.ts](../../next.config.ts):** hiện `CSP` đặt `object-src 'none'`. Trên Chromium, `<iframe>` trỏ tới `application/pdf` có thể bị chặn plugin PDF nếu thiếu `frame-src 'self'` hoặc `object-src 'self'` khi viewer nhúng PDF. Sẽ cấu hình tối thiểu `frame-src 'self' blob:` (giữ nguyên `object-src 'none'` nếu test cho thấy `<iframe src="/api/files/[id]">` chạy tốt, hoặc nếu Chromium đòi `object-src` thì chỉ mở PDF bằng nút "Mở tab mới" + text trích xuất inline để giữ `object-src 'none'` chặt tuyệt đối). Quyết định cụ thể sẽ kiểm chứng ngay trong E2E Chromium & WebKit ở bước triển khai C2/C3.

### 3.3. Kiến trúc `FileStorage` (Local Dev/Test vs Production)

- Interface `FileStorage` (`src/server/storage/types.ts`):
  - `put(key: string, data: Uint8Array, contentType: string): Promise<void>`
  - `get(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null>`
  - `delete(key: string): Promise<void>`
- **Chọn adapter theo cấu hình (`src/server/config.ts`):**
  - `memory`: khi `PGLITE_DIR === 'memory'` (Vitest & Playwright E2E) — lưu trong `Map` để test sạch sẽ, không xả file ra đĩa.
  - `local`: khi `STORAGE_DRIVER=local` hoặc mặc định dev local (`.pglite` trên đĩa) — lưu tại `STORAGE_DIR` (mặc định `./.storage`, thêm vào `.gitignore`), key dạng `<areaId>/<docId>.<ext>` (kiểm tra chống path traversal).
  - `supabase`: cho production Vercel + Supabase (`SUPABASE_STORAGE_BUCKET`, `SUPABASE_SERVICE_ROLE_KEY`), tải lên private bucket và stream/redirect có xác thực qua `/api/files/[id]`.
- **Chiến lược `export` (`/api/export`):**
  - `buildExport` (`schema_version: 3`) xuất toàn bộ bảng `folders` và cột metadata + `extracted_text` + `body_md` của `documents` (giữ export JSON nhẹ ~vài MB ngay cả khi `.storage` nặng 271 MB; thêm thông tin `storageKey` + `sizeBytes` để đối chiếu sao lưu thư mục `.storage` / Supabase bucket).

### 3.4. Schema & Service (`C1`)

- **Bảng mới `folders` (có `.enableRLS()`, đưa vào `TABLES`):**
  - `id` (uuid PK), `area_id` (FK → `areas.id` cascade), `parent_id` (uuid nullable FK tự tham chiếu `folders.id`), `name` (1–200 ký tự), `sort_order` (int), `ai_excluded` (boolean), `deleted_at` (tz nullable), `created_at`, `updated_at`.
  - Index `(area_id, parent_id, sort_order)`.
- **Mở rộng `documents`:**
  - `folder_id` (uuid nullable FK → `folders.id` set null; `null` = gốc workspace),
  - `doc_role` (`'context' | 'raw' | 'instruction'`, mặc định `'context'`),
  - `mime_type` (text, mặc định `'text/markdown'`),
  - `file_ext` (text, mặc định `'md'`),
  - `storage_key` (text nullable),
  - `size_bytes` (integer nullable),
  - `extracted_text` (text, mặc định `''`).
- **Enum (`src/db/enums.ts`):** thêm `DOC_ROLES = ['context', 'raw', 'instruction']` và `ENTITY_TYPES` thêm `'folder'`.
- **`folderService` (`src/server/services/folders.ts`) & `documentService` mở rộng:**
  - Mọi thao tác (`create`, `rename`, `move`, `reorder`, `softDelete`, `restore`, `setAiExcluded`) ghi `activity_logs` trong cùng transaction và chạm `areas.updated_at`.
  - **Chống vòng lặp cây:** `moveFolder(folderId, targetParentId)` kiểm tra duyệt ngược tổ tiên từ `targetParentId` lên gốc; nếu gặp `folderId` hoặc khác `areaId` thì từ chối với lỗi xác thực tiếng Việt.
  - **Xóa mềm thư mục:** đặt `deleted_at` cho thư mục và toàn bộ thư mục con + tài liệu bên trong (cùng một `batchId` hoặc atomic transaction), cho phép xem/khôi phục hoặc giữ an toàn file trong `FileStorage`.
  - **Kế thừa riêng tư (`ai_excluded`):** helper kiểm tra một document có bị ẩn khỏi AI nếu `area.aiExcluded || doc.aiExcluded || anyAncestorFolder.aiExcluded`.

### 3.5. Trích xuất văn bản (`C2`)

- `.md`, `.txt`, `.csv`, `.json`: đọc trực tiếp UTF-8.
- `.docx` / `.pptx`: giải nén ZIP bằng `node:zlib` tích hợp sẵn (không cần native binary) để đọc `word/document.xml` / `ppt/slides/slide*.xml`, lọc tag XML giữ đoạn/ngắt dòng sạch sẽ.
- `.pdf`: dùng parser thuần JS (`pdf-parse` hoặc `unpdf`, kiểm chứng chạy được cả trong Next.js server & Node script); nếu là PDF scan ảnh không có text layer thì giữ `extracted_text = ''` (không lỗi import, đánh dấu trạng thái trong UI là "PDF ảnh / chưa có lớp chữ").
- Giới hạn `extracted_text` / `search_text` hợp lý (ví dụ cắt index tìm kiếm ở 500.000 ký tự nếu tài liệu cực dài) để Postgres `tsvector` luôn nhanh.

### 3.6. UI Mini File Explorer & Trình xem Đa định dạng (`C3`)

```
+---------------------------+----------------------------------------+----------------------+
| Mini File Explorer        | Viewer / Editor trung tâm             | Panel Vận hành       |
| [Lọc tệp & thư mục...]    | [Breadcrumb: Môn > Thư mục > Tệp]      | Vận hành | Tasks |   |
| [+ Thư mục] [+ MD] [Tải]  | [Badge: Context / Tài liệu gốc]      | Topics | Assessments |
| ▼ 📁 00_Kiểm_kê           |                                        | Activity             |
|   📄 00_SOURCE_AUDIT.md   |  - .md  -> DocEditor (GFM + checklist) |                      |
|   {} manifest.json        |  - .txt/.json -> Editor/Viewer text    |                      |
| ▼ 📁 01_Context           |  - .csv -> Bảng dữ liệu + lọc          |                      |
|   📄 01_CONTEXT.md        |  - ảnh  -> Preview zoom vừa khung      |                      |
|   📄 04_STATE.md          |  - .pdf -> Mở tab mới / Tải + Tab text |                      |
| ▶ 📁 02_Tài_liệu_học      |  - .docx/.pptx -> Thẻ tệp + Tab text   |                      |
| ▶ 📁 03_Đề_thi_&_Ôn_tập   |                                        |                      |
+---------------------------+----------------------------------------+----------------------+
```

- Nút chuyển thư mục đích (`Di chuyển tới…`), đổi tên thư mục/tệp, bật/tắt `Không gửi cho AI` cho từng thư mục, nút lên/xuống hoặc sắp xếp giữ ổn định.
- Mobile (iPhone): Explorer mở trong Sheet trượt bên trái (`>= 44px`), bảng CSV/trình xem cuộn nội bộ không tràn ngang màn hình (`scrollWidth <= clientWidth`).

---

## 4. Kế hoạch Chuẩn hóa & Import Dữ liệu HUST 2026.1

Script `scripts/import-hust-materials.ts` (hỗ trợ `--dry-run` và `--apply`, **idempotent** theo cặp `(areaId, folderPath, title)`):

1. **Ánh xạ vào đúng 9 môn học có sẵn trong `.pglite`** (khớp theo mã/tên trong `areas`, giữ nguyên toàn bộ ID, tasks, logs hiện có của user):
   - `Database` ← `Database_IT3292E_Personal_AI_Workspace_Context_2026-11-24` + `IT3290E - DATABASE AND DB LAB`
   - `Software Engineering` ← `IT4082E_Personal_AI_Workspace_Context` + `IT4082E - SOFTWARE ENGINEERING`
   - `Introduction to Communications Engineering` ← `IT4593E_Personal_AI_Workspace_context` + `IT4593E - INTRODUCTION TO COMMS ENGINEERING`
   - `Mobile Programming` ← `IT4785E_Personal_AI_Workspace_Context` + `IT4785E - MOBILE PROGRAMMING`
   - `Computer Networks` ← `Personal_AI_Workspace_Computer_Networks` + `IT3080E - COMPUTER NETWORKS`
   - `C Programming` ← `Personal_AI_Workspace_IT3220_Context_Pack` + `IT3220 - C PROGRAMMING INTRODUCTION`
   - `Algebra` ← `Personal_AI_Workspace_MI1144E_context_2026-11-24` + `MI1144E - ALGEBRA`
   - `Tư tưởng Hồ Chí Minh` ← `TTHCM_SSH1151_20261_Context_Pack` + `SSH1151 - TU TUONG HO CHI MINH`
   - `Technical Writing` ← `IT2030 - TECHNICAL WRITING AND PRESENTATION` (chỉ có 3 file thô, chưa có gói ChatGPT)
2. **Cây thư mục chuẩn cho mỗi môn:**
   - `00_Kiểm_kê` (`doc_role = 'context'`): chuẩn hóa tên `00_SOURCE_AUDIT.md`, `08_VALIDATION.md` (gộp từ `VALIDATION_REPORT.md` / `COMPLETENESS_AUDIT.md` / `VALIDATION.md`), `manifest.json`.
   - `01_Context` (`doc_role = 'context'`): chuẩn hóa đánh số `01_CONTEXT.md`, `02_COURSE_MAP.md`, `04_STATE.md`, `05_LOG.md`, `06_TIMELINE.md`, `07_MISSING_INFO.md`, `README.md`, và file đặc thù như `GROUP_PROJECT_SWAPREADY.md`.
   - `02_Tài_liệu_học` (`doc_role = 'raw'`): slide `.pptx`, bài giảng `.pdf`, bài tập/lab `.docx`, ghi chú `.txt` (giữ cấu trúc thư mục con nếu có, ví dụ `HR_Database/` trong Database).
   - `03_Đề_thi_&_Ôn_tập` (`doc_role = 'raw'`): `03_EXAM_ANALYSIS.md`, `QUESTION_INDEX.csv`, `QUESTION_BANK_INDEX.md`, `QUESTION_LEVEL_20231.md`, cùng toàn bộ đề giữa kỳ / cuối kỳ / quiz / ảnh tự luận (`.pdf`, `.jpg`, `.docx`, `.txt`).
3. **Bỏ qua an toàn:** `Perplexity.lnk` trong `IT3290E - DATABASE AND DB LAB` (báo rõ trong log import).
4. **Chạy kèm `A10` (`migrate-to-documents`)** hoặc bổ sung thông tin tóm tắt sẵn có nếu chưa trùng để không mất dữ liệu cũ.
