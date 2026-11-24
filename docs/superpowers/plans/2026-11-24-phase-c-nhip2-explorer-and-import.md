# Phase C — Nhịp 2 (Mini File Explorer UI, Đa định dạng Viewers & Import Tài liệu HUST 2026.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nâng cấp Workspace cột trái thành Mini File Explorer (cây thư mục lồng nhau + upload/di chuyển/lọc đa định dạng), thêm trình xem chuyên biệt cho `.csv`, `.txt`/`.json`, `.pdf`, `.docx`/`.pptx`, ảnh bên cạnh `DocEditor` `.md`, rồi chuẩn hóa và import toàn bộ 8 gói ChatGPT + 149 file thô `C:\Users\LENOVO\OneDrive\HUST\2026.1\` vào `.pglite` local.

**Architecture:** Mở rộng thuần UI (`src/components/context/*`) và script migration (`src/server/migration/*`, `scripts/*`), tái sử dụng toàn bộ DB schema `folders` + `documents`, `folderService`, `documentService`, `ingestUploadedFile`, `/api/files/upload` và `/api/files/[id]` đã chốt ở commit `4af0e4d`. Tuyệt đối không sửa `src/db/schema.ts`, `drizzle/`, `src/server/ai/*`, `src/server/proposals/*`, `src/components/chat/*` để agent Phase B chạy song song không xung đột.

**Tech Stack:** Next.js 16.4.6, React 19.3, Tailwind + shadcn/ui, Lucide icons, Vitest 5.1.1, Playwright 1.65.1.

**Spec:** [ADR 002](../../adr/002-folders-and-multiformat-storage.md)

## Global Constraints

- Mọi thao tác chạm trên iPhone `>= 44px`, ô nhập `>= 16px` (`text-base`), không tràn ngang (`scrollWidth <= clientWidth`).
- Bảng `.csv` hoặc `<pre>` text/code dài phải cuộn ngang bên trong container riêng (`overflow-x-auto`), không đẩy vỡ layout.
- Upload file qua `POST /api/files/upload` (`FormData`) và tải/xem qua `/api/files/[id]`; không dùng Server Action cho binary 25 MB.
- Script import HUST phải **idempotent** (chạy lại không nhân đôi folder/document) và **không sửa/xóa bản gốc** trên `OneDrive`.

---

### Task 1: CSV Parser Helper & Multi-Format Viewer (`file-viewer.tsx`)

**Files:**
- Create: `src/lib/csv.ts`
- Create: `src/lib/csv.test.ts`
- Create: `src/components/context/file-viewer.tsx`

- [ ] **Step 1 (TDD):** Viết `src/lib/csv.test.ts` kiểm tra parse CSV có dấu ngoặc kép, dấu phẩy trong ô, xuống dòng trong ô, UTF-8 BOM, và cắt preview an toàn khi quá nhiều dòng.
- [ ] **Step 2:** Implement `src/lib/csv.ts` (`parseCsv(text, maxRows?)`).
- [ ] **Step 3:** Tạo `src/components/context/file-viewer.tsx` cho mọi định dạng ngoài `.md`:
  - Thanh header chung: đổi tên inline/input (`renameDocumentAction`), chọn vai trò `docRole` (`setDocumentRoleAction`), chọn thư mục (`moveDocumentAction`), công tắc `Không gửi cho AI`, nút tải về `/api/files/${doc.id}`.
  - `.txt` / `.json`: chỉnh sửa text monospace + autosave (`updateDocumentBodyAction` + conflict handling) hoặc format JSON đẹp khi xem trước.
  - `.csv`: bảng cuộn (`overflow-x-auto`) + ô lọc nhanh các dòng + nút chuyển xem văn bản thô để sửa.
  - `.png` / `.jpg` / `.jpeg` / `.webp`: `<img>` từ `/api/files/${doc.id}?disposition=inline` trong khung responsive.
  - `.pdf`: nút nổi bật `Mở PDF ở tab mới` + `Tải xuống`, khung `<iframe src="/api/files/${doc.id}?disposition=inline">` (desktop) và tab `Văn bản trích xuất` (hữu ích trên iPhone và tìm nhanh nội dung).
  - `.docx` / `.pptx`: thẻ thông tin tệp (kích thước, đuôi tệp, nút `Tải xuống`) + trình đọc `extractedText`.

### Task 2: URL `folder` Param, `FolderExplorer` Tree & `WorkspaceView` Integration

**Files:**
- Modify: `src/components/context/use-context-params.ts`
- Create: `src/components/context/folder-explorer.tsx`
- Modify: `src/components/context/workspace-view.tsx`
- Modify: `src/components/context/doc-search-dialog.tsx`

- [ ] **Step 1:** Thêm `folder` param và `setFolder` vào `useContextParams` (`closeItem()` xóa luôn `folder`).
- [ ] **Step 2:** Tạo `FolderExplorer` hỗ trợ:
  - Dựng cây `folders` lồng nhau + tài liệu gốc (`folderId === null`) + tài liệu trong từng thư mục.
  - Mở rộng / thu gọn thư mục (tự động mở đường dẫn chứa `activeDocId`, và tự mở thư mục khớp khi lọc).
  - Tạo thư mục (tại gốc hoặc bên trong thư mục đang chọn), tạo `.md` trống/từ mẫu vào thư mục đang chọn, nút `Tải tệp lên` gửi `POST /api/files/upload`.
  - Đổi tên thư mục, bật/tắt `Không gửi cho AI` ở cấp thư mục (hiển thị icon khóa AI cho cả thư mục con/tệp kế thừa), di chuyển thư mục/tệp tới thư mục khác, xóa mềm (có xác nhận).
  - Icon + badge theo loại tệp (`MD`, `CSV`, `JSON`, `TXT`, `PDF`, `DOCX`, `PPTX`, `IMG`) và vai trò (`Gốc`, `AI`).
- [ ] **Step 3:** Tích hợp `FolderExplorer`, `FileViewer`, và `DocEditor` (bổ sung header chọn vai trò & di chuyển thư mục cho `.md` nếu cần hoặc wrapper chung) vào `WorkspaceView`; cập nhật `DocSearchDialog` hiển thị `fileExt` + `DOC_ROLE_LABEL`.

### Task 3: Standardized HUST 2026.1 Bulk Import (`import-hust-materials.ts`)

**Files:**
- Create: `src/server/migration/import-hust-materials.ts`
- Create: `src/server/migration/import-hust-materials.test.ts`
- Create: `scripts/import-hust-materials.ts`

- [ ] **Step 1 (TDD):** Viết `import-hust-materials.test.ts` với fixture giả lập cấu trúc ChatGPT pack + raw OneDrive tree (gồm `.md`, `.csv`, `.json`, `.docx`, `.pdf`, `.lnk`), kiểm chứng:
  - Phân loại chuẩn vào 4 thư mục (`00_Kiểm_kê`, `01_Context`, `02_Tài_liệu_học`, `03_Đề_thi_&_Ôn_tập`), chuẩn hóa tên file `VALIDATION` / `CONTEXT` / `STATE`..., giữ thư mục con trong `02`/`03`.
  - Bỏ qua `.lnk`, trích xuất text và đặt đúng `docRole` (`context` vs `raw`).
  - Chạy lại lần 2 là **idempotent** (0 file tạo thêm).
- [ ] **Step 2:** Implement `import-hust-materials.ts` + CLI `scripts/import-hust-materials.ts` (`--dry-run` / `--apply`).
- [ ] **Step 3:** Chạy `scripts/import-hust-materials.ts --dry-run` rồi `--apply` vào `.pglite` (và `./.storage`) để nạp toàn bộ 8 gói ChatGPT + 149 file thô HUST `2026.1` (báo cáo số lượng cụ thể).

### Task 4: E2E Coverage (`e2e/explorer.spec.ts`) & Full Verification

**Files:**
- Create: `e2e/explorer.spec.ts`

- [ ] **Step 1:** Viết `e2e/explorer.spec.ts` kiểm tra trên cả `desktop` và `iphone`:
  - Tạo thư mục cha/con, tạo `.md` trong thư mục, tải tệp `.csv` và `.txt` và ảnh `.png` lên qua UI, xem bảng CSV & ảnh, di chuyển tài liệu giữa các thư mục, tìm kiếm không dấu ra nội dung trong tệp tải lên, bật `Không gửi cho AI` cho thư mục, xóa mềm thư mục có xác nhận, không tràn ngang.
- [ ] **Step 2:** Chạy `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` (`BypassSandbox: true`), `pnpm test:e2e` (`BypassSandbox: true`) xác nhận xanh 100%.
