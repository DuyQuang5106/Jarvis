# Phase C — Nhịp 1 (DB, FileStorage, Text Extraction, Folder/Doc Services & File API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chốt xong toàn bộ nền DB (`folders` + mở rộng `documents`), tầng lưu trữ `FileStorage`, trình trích xuất text đa định dạng (`.md`, `.txt`, `.csv`, `.json`, `.pdf`, `.docx`, `.pptx`, ảnh), `folderService` / `documentService`, Server Actions và route `/api/files/*` kèm unit tests — tạo điểm mốc sạch để Phase B agent chạy song song và Nhịp 2 (`C3` UI + Import 271 MB tài liệu HUST) triển khai tiếp.

**Architecture:** Mở rộng schema Postgres/Drizzle (migration `0002`) với bảng `folders` lồng nhau (có `.enableRLS()`) và các cột đa định dạng + `extracted_text` trên `documents`, giúp `search_tsv` hiện có tìm không dấu ngay cả file đính kèm nhị phân. Tách riêng lưu trữ file qua interface `FileStorage` (`memory` cho test, `./.storage/` local dev, Supabase Storage cho production) và phục vụ tệp qua `/api/files/[id]` + upload qua `POST /api/files/upload` đều bảo vệ bởi `withOwner()`.

**Tech Stack:** Next.js 16.4.6, Drizzle ORM 0.45.4, PGlite + Postgres, Zod 4.6.7, `unpdf` (thuần JS cho PDF), Node `node:zlib` (cho `.docx` / `.pptx`), Vitest 5.1.1.

**Spec:** [ADR 002](../../adr/002-folders-and-multiformat-storage.md)

## Global Constraints

- Mọi thao tác ghi DB đều qua `src/server/services/*` và ghi `activity_logs` trong cùng transaction, chạm `areas.updated_at`.
- Mọi đọc/tải/upload dữ liệu đều qua `requireOwner()` / `withOwner()`.
- Mọi bảng mới đều phải bật `.enableRLS()`, đăng ký vào `TABLES`, và không có policy cho `anon`.
- Whitelist tệp an toàn tối đa `25 MB`; từ chối `.html`, `.htm`, `.svg`, `.exe`, `.lnk`; thông báo lỗi tiếng Việt.
- Kế thừa `ai_excluded`: tài liệu nằm trong workspace hoặc bất kỳ thư mục cha nào có `ai_excluded = true` phải bị ẩn khỏi truy vấn AI.

## Review Focus

- **Chống vòng lặp cây thư mục:** di chuyển thư mục vào chính nó hoặc thư mục con bị từ chối bằng `ValidationError` tiếng Việt.
- **Kế thừa `ai_excluded` nhiều tầng:** thư mục ông/bà bật `ai_excluded = true` vẫn ẩn toàn bộ tài liệu cháu/chắt khỏi AI.
- **Path traversal & orphan file:** `storageKey` không cho phép `..`, nếu tạo record DB thất bại thì xóa file vừa ghi ở `FileStorage`.
- **PDF scan ảnh / DOCX hỏng:** không làm crash upload/import; trả `extractedText = ''` (hoặc lỗi validation rõ ràng nếu file rỗng/sai magic bytes).
- **Giới hạn `search_text`:** cắt an toàn ở `500.000` ký tự để Postgres `tsvector` không bị phình hoặc lỗi độ dài row.

---

### Task 1: Enums, Schema (`folders` + extended `documents`), Migration `0002`, Config & Export v3

**Files:**
- Modify: `src/db/enums.ts`
- Modify: `src/db/schema.ts`
- Modify: `src/server/config.ts`
- Modify: `src/server/queries/export.ts`
- Modify: `src/server/queries/export.test.ts`
- Modify: `e2e/settings.spec.ts`
- Modify: `.gitignore`
- Create: `drizzle/0002_*.sql` (generated via `pnpm db:generate`)
- Test: `src/server/config.test.ts`, `src/server/queries/export.test.ts`

- [ ] **Step 1:** Thêm `DOC_ROLES = ['context', 'raw', 'instruction'] as const` (`DocRole`), thêm `'folder'` vào `ENTITY_TYPES` trong `src/db/enums.ts`.
- [ ] **Step 2:** Thêm bảng `folders` (dùng `type AnyPgColumn` cho self-FK `parentId`) và các cột mới (`folderId`, `docRole`, `mimeType`, `fileExt`, `storageKey`, `sizeBytes`, `extractedText`) vào `documents` trong `src/db/schema.ts`; cập nhật `TABLES` (`folders` trước `documents`) và export `FolderRow`.
- [ ] **Step 3:** Cập nhật `src/server/config.ts` thêm `storageDriver` (`'memory' | 'local' | 'supabase'`), `storageDir` (`'./.storage'`), `supabaseStorageBucket`, `supabaseServiceRoleKey`; thêm `/.storage/` vào `.gitignore`.
- [ ] **Step 4:** Nâng `schema_version` lên `3` trong `src/server/queries/export.ts` và cập nhật test trong `export.test.ts` + `e2e/settings.spec.ts`.
- [ ] **Step 5:** Chạy `pnpm db:generate` tạo migration `0002`, rồi chạy test `export.test.ts` & `config.test.ts` & `verify-rls.test.ts`.

### Task 2: `FileStorage` Adapters (`memory`, `local`, `supabase`)

**Files:**
- Create: `src/server/storage/types.ts`
- Create: `src/server/storage/memory.ts`
- Create: `src/server/storage/local.ts`
- Create: `src/server/storage/supabase.ts`
- Create: `src/server/storage/index.ts`
- Test: `src/server/storage/storage.test.ts`

- [ ] **Step 1 (TDD):** Viết test `storage.test.ts` kiểm tra `put/get/delete/exists`, từ chối path traversal (`../escape`), delete an toàn khi không tồn tại.
- [ ] **Step 2:** Implement `memory`, `local` (an toàn đường dẫn qua `path.resolve`), `supabase` (dùng `@supabase/supabase-js` `storage.from(bucket)`) và `getStorage()` trong `index.ts`.
- [ ] **Step 3:** Chạy `pnpm test src/server/storage/storage.test.ts` xác nhận pass.

### Task 3: File Policy & Multi-Format Text Extractor (`extract-text.ts`)

**Files:**
- Install: `unpdf` (via `pnpm add unpdf` với `BypassSandbox: true`)
- Create: `src/server/files/policy.ts`
- Create: `src/server/files/zip-xml.ts`
- Create: `src/server/files/extract-text.ts`
- Test: `src/server/files/extract-text.test.ts`

- [ ] **Step 1:** Cài đặt `unpdf` (kiểm tra hoạt động trên Node 24 & Next.js server).
- [ ] **Step 2 (TDD):** Viết `extract-text.test.ts` phủ: policy từ chối `.svg`/`.html`/`.lnk` và file `> 25 MB`, chấp nhận `.md/.txt/.csv/.json/.pdf/.docx/.pptx/.jpg/.png/.webp`; trích xuất text `.docx` (`word/document.xml`) & `.pptx` (`ppt/slides/slide1.xml`, `slide2.xml` theo đúng thứ tự slide) & text `.pdf`.
- [ ] **Step 3:** Implement `policy.ts`, `zip-xml.ts` (ZIP reader thuần Node dùng `node:zlib` hỗ trợ store & deflate + XML text extractor) và `extract-text.ts`.
- [ ] **Step 4:** Chạy `pnpm test src/server/files/extract-text.test.ts` xác nhận pass.

### Task 4: Schemas, `folderService`, Extended `documentService`, Queries & Labels

**Files:**
- Modify: `src/server/schemas.ts`
- Create: `src/server/services/folders.ts`
- Modify: `src/server/services/documents.ts`
- Create: `src/server/queries/folders.ts`
- Modify: `src/server/queries/documents.ts`
- Modify: `src/server/queries/area-details.ts`
- Modify: `src/server/queries/describe-log.ts`
- Modify: `src/lib/labels.ts`
- Test: `src/server/services/folders.test.ts`, `src/server/services/documents.test.ts`, `src/server/queries/documents.test.ts`, `src/server/queries/area-details.test.ts`

- [ ] **Step 1 (TDD):** Bổ sung tests cho:
  - `folderService`: create, rename, move, chống vòng lặp (tự trỏ hoặc di chuyển vào con), `reorder`, `aiExcluded`, `softDelete` (ẩn luôn thư mục con + tài liệu con), `restore`.
  - `documentService`: tạo với `folderId` / `docRole` / `extractedText`, di chuyển `move`, đổi `setRole`, tìm kiếm FTS không dấu trên cả `extractedText` (ví dụ PDF/PPTX), và kiểm tra kế thừa `ai_excluded` từ thư mục cha/ông.
- [ ] **Step 2:** Cập nhật `schemas.ts`, viết `folders.ts` (service + query `isFolderBranchExcluded`, `listFolders`), mở rộng `documents.ts` (service + query + `area-details.ts`), `describe-log.ts`, `labels.ts`.
- [ ] **Step 3:** Chạy tests services & queries xác nhận pass 100%.

### Task 5: Server Actions & Secure File Routes (`/api/files/upload` + `/api/files/[id]`)

**Files:**
- Create: `src/app/(app)/_actions/folders.ts`
- Modify: `src/app/(app)/_actions/documents.ts`
- Create: `src/app/api/files/upload/route.ts`
- Create: `src/app/api/files/[id]/route.ts`
- Test: `src/app/api/files/files.test.ts`, `src/app/(app)/_actions/documents.test.ts`

- [ ] **Step 1 (TDD):** Viết test route `/api/files/*`: từ chối `401` khi chưa auth, upload tệp hợp lệ (`.txt`, `.pdf`, `.jpg`) tạo DB row + lưu storage + trích xuất text, tải về với header an toàn (`nosniff`, `no-store`, `sandbox` / `inline`), xóa file nháp nếu DB lỗi.
- [ ] **Step 2:** Viết `_actions/folders.ts`, mở rộng `_actions/documents.ts` (`moveDocumentAction`, `setDocumentRoleAction`), và hai API routes (`/api/files/upload`, `/api/files/[id]`) dùng `withOwner()` + `connection()`.
- [ ] **Step 3:** Chạy full suite `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` (với `BypassSandbox: true` cho `build`) xác nhận xanh hoàn toàn làm điểm chốt Nhịp 1!
