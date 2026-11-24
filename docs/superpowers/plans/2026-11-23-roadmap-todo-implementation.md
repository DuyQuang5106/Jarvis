# Jarvis — Kế hoạch triển khai tổng thể từ TODO.md

> **Ngày lập:** 23/11/2026
> **Trạng thái nền hiện tại:** Phase 0–2 đã merge vào `main`. Phase 3 (`docs/superpowers/plans/2026-11-22-phase-3-ai-updates.md`) đã có plan chi tiết nhưng chưa bắt đầu.
> **Mục tiêu:** Triển khai toàn bộ `TODO.md` (Mục 1, Phase A: Document-First Context Workspace, Phase B: AI Context Integration) theo lộ trình an toàn, giữ nguyên tính ổn định của `main`, tuân thủ 7 luật kiến trúc trong `docs/superpowers/plans/README.md`.

---

## Tổng quan kiến trúc & Điểm neo trong Repo

Trước khi chia đợt triển khai, đây là các điểm neo thực tế trong codebase hiện tại:
- **Database & Enum:** `src/db/schema.ts` (15 bảng trong `TABLES`, mọi bảng đều `.enableRLS()`), `src/db/enums.ts` (`ENTITY_TYPES`, `ORIGINS`, `LOG_ACTIONS`, `PENDING_STATUSES`).
- **Ghi dữ liệu & Log:** `src/server/services/activity.ts` (`recordChange`, `touchArea` trong cùng Drizzle transaction).
- **Export:** `src/server/queries/export.ts` (`buildExport` duyệt `TABLES`, hiện `schema_version: 1`).
- **Snapshot & AI Context:** `src/server/queries/snapshot.ts` (`AreaSummary`, `MissingFlag`), `src/server/ai/context-builder.ts` (`DEFAULT_MAX_CHARS = 32000`, `ai_excluded` filtering), `src/server/ai/match-areas.ts` (`normalizeVi`).
- **UI Context:** `src/components/context/context-view.tsx`, `src/components/context/area-row.tsx` (dòng 37 đang dùng `<Badge variant="secondary">`), `src/components/context/notes-panel.tsx` (mẫu autosave tuần tự `chain.current` + `AUTOSAVE_MS = 1500` + flush khi `visibilitychange`/`pagehide`).

---

## Lộ trình triển khai theo 6 Đợt (Waves)

```text
[Quick Win: Mục 1] ──┐
                     ├──▶ [Wave 1: B0 / Phase 3] ──▶ [Wave 2: A0 → A1 → A2 → A3 + A10 dry-run]
                     │                                          │
                     │                                          ▼
                     │    [Wave 4: A10 thật → A11] ◀── [Wave 3: A4 → A5 → A6 → A7 → A8 → A9]
                     │            │
                     │            ▼
                     └──▶ [Wave 5: B10 → B1 → B2 → B4 (+B3)] ──▶ [Wave 6: B5 → B6 → B7 → B9 → B8 → B11]
```

> **Lưu ý về Scope:** Vì Phase A và Phase B là hai subsystem lớn và `A0` cần chốt lựa chọn kỹ thuật (Tiptap vs CodeMirror, cấu trúc `document_chunks`), bản kế hoạch này đóng vai trò **Master Plan** chia rõ từng Wave, interface, file tác động và tiêu chí kiểm thử. Khi bắt đầu Wave 3 và Wave 5, có thể tách thêm sub-plan chi tiết từng task nếu cần.

---

## Quick Win — Mục 1: Màu trạng thái `AreaStatus` (Làm ngay, ~30 phút)

**Mục tiêu:** Thay badge xám đơn điệu cho `AREA_STATUS_LABEL` bằng map màu rõ ràng, đủ tương phản ở cả light/dark mode, vẫn giữ nhãn chữ.

- **Files:**
  - Modify: `src/lib/labels.ts` hoặc `src/components/context/styles.ts` (thêm `AREA_STATUS_BADGE_CLASS: Record<AreaStatus, string>`).
  - Modify: `src/components/context/area-row.tsx:37` và `src/components/context/area-drawer.tsx` (dùng chung helper/component badge trạng thái).
  - Test: `e2e/context-list.spec.ts` (kiểm tra class/màu cho trạng thái `active`, `blocked`, `on_hold`, `completed`).
- **Mapping đề xuất:**
  - `active`: xanh lá (`bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30`)
  - `blocked`: đỏ (`bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30`)
  - `on_hold`: vàng (`bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30`)
  - `completed`, `not_started`, `unknown`: xám/trung tính.
- **Verify:** `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e e2e/context-list.spec.ts`.

---

## Wave 1 — B0: Hoàn tất Phase 3 (AI đề xuất cập nhật có duyệt)

**Mục tiêu:** Dựng engine đề xuất (`pending_actions`, `propose_changes`, thẻ duyệt, `approve`/`reject`/`rebase`, quick capture extraction) làm nền duy nhất cho cả bản ghi có cấu trúc và tài liệu sau này.

- **Thực thi:** Chạy đúng theo kế hoạch đã viết sẵn tại [`docs/superpowers/plans/2026-11-22-phase-3-ai-updates.md`](2026-11-22-phase-3-ai-updates.md).
- **Điều kiện xong (Gate):** Toàn bộ unit test + `e2e/proposal.spec.ts` xanh trên `desktop` và `iphone`; đạt criteria 7, 8, 10, 12, 14, 16 của spec.

---

## Wave 2 — Phase A Foundation (A0 → A3 + A10 Dry-Run)

> **Nguyên tắc:** Chưa đụng UI người dùng; xây xong tầng DB, service, query, action và kiểm thử script chuyển dữ liệu trên bản sao PGlite trước.

### Task A0: Chốt ADR & Cập nhật Spec
- **Create:** `docs/adr/001-document-first-workspace.md`
- **Modify:** `Personal_AI_Workspace_V1.1_Spec.md` (mục 2, 3.3, 5)
- **Nội dung cần chốt với owner trước khi qua A4:**
  1. **Định dạng lưu:** Markdown (GFM) chuẩn.
  2. **Editor (A4):** Spike nhanh 2 phương án — (1) Tiptap + markdown extension vs (2) CodeMirror 6 Markdown + live preview — đo: round-trip GFM (heading, list, checklist, table, code block), bộ gõ tiếng Việt có dấu trên iOS Safari, font ≥16px, kích thước bundle.
  3. **Vị trí Workspace:** Toàn màn hình trong `/context?tab=...&item=<id>&doc=<docId>` (giữ đúng 2 màn hình chính `/chat` và `/context`).
  4. **Trường giữ cấu trúc vs chuyển sang tài liệu:** Giữ `status`, `priority`, `startDate`, `deadlineDate`, `nextAction`, `aiExcluded`, `aliases`, `archivedAt`, cùng `tasks`, `milestones`, `blockers`, `topics`, `assessments`, `activity_logs`. Chuyển `areas.summary`, `areas.goal`, `academic_details.*`, `project_details.*`, và `notes` thuộc area.
  5. **Chính sách version & log:** Gộp log `update` theo phiên sửa (khoảng cách ≥ 5 phút hoặc đổi tài liệu); giới hạn số version/tài liệu (ví dụ tối đa 50 bản, dọn bản cũ theo FIFO trừ mốc `ai_approved`/`migration`).

### Task A1: Schema & Migration cho `documents` và `document_versions`
- **Modify:** `src/db/enums.ts` (`ENTITY_TYPES` thêm `'document'`, `ORIGINS` thêm `'migration'`).
- **Modify:** `src/db/schema.ts`:
  - Thêm bảng `documents`: `id`, `areaId` (FK `areas.id` cascade), `title` (text), `bodyMd` (text), `sortOrder` (int), `templateKey` (text nullable), `aiExcluded` (boolean), `revision` (int default 1), `searchText` (text), `searchTsv` (`tsvector` generated always hoặc trigger/cột cập nhật), `deletedAt` (timestamp nullable), `createdAt`, `updatedAt`. Index GIN trên `searchTsv`, index trên `(areaId, sortOrder)`.
  - Thêm bảng `document_versions`: `id`, `documentId` (FK `documents.id` cascade), `revision` (int), `title`, `bodyMd`, `origin`, `batchId` (uuid nullable), `createdAt`. Index `(documentId, revision)`.
  - Thêm bảng ánh xạ `note_document_map` (hoặc cột `migratedDocumentId` trên `notes`) phục vụ A10 để log cũ và `pending_actions` vẫn tra được `note_id → document_id`.
  - Đăng ký vào `TABLES`. Tất cả bật `.enableRLS()`.
- **Modify:** `src/server/queries/export.ts` (tăng `schema_version` lên `2`).
- **Generate & Verify:** `pnpm db:generate`, `pnpm test` (`schema.test.ts`, `export.test.ts`), `pnpm verify:rls`.

### Task A2: `documentService` (Tầng ghi duy nhất)
- **Create:** `src/server/services/documents.ts`
- **Test:** `src/server/services/documents.test.ts`
- **Hàm cần có (nhận `DbOrTx` + `WriteMeta`):**
  - `createDocument(db, input, meta)`
  - `renameDocument(db, id, title, meta)`
  - `updateDocumentBody(db, id, bodyMd, expectedRevision, meta)` — kiểm tra `revision === expectedRevision` (nếu lệch ném lỗi `ConflictError`), tăng `revision`, cập nhật `searchText` bằng `normalizeVi(`${title}\n${bodyMd}`)`, chạm `areas.updatedAt`, gộp log `update` theo phiên ≥ 5 phút, tạo `document_versions` khi bắt đầu phiên mới / `ai_approved` / `undo` / `migration`.
  - `reorderDocuments(db, areaId, orderedIds, meta)`
  - `softDeleteDocument(db, id, meta)` & `restoreDocument(db, id, meta)`
  - `restoreDocumentVersion(db, documentId, versionId, meta)` (tạo version mới với origin `'undo'`, không xóa lịch sử).

### Task A3: Queries & Server Actions cho tài liệu
- **Create:** `src/server/queries/documents.ts` (`listDocuments(db, areaId)`, `getDocument(db, id)`, `listDocumentVersions(db, id)`).
- **Modify:** `src/server/schemas.ts` (Zod schema kiểm UUID, title 1–200 ký tự, `bodyMd` ≤ 200.000 ký tự với thông báo lỗi tiếng Việt).
- **Create:** `src/app/(app)/_actions/documents.ts` (bọc `runAction`, gọi `requireOwner()`, `revalidatePath('/context')`).
- **Test:** `src/server/queries/documents.test.ts`, `src/app/(app)/_actions/documents.test.ts`.

### Task A10 (Giai đoạn 1 — Dry-run sớm): Script chuyển dữ liệu
- **Create:** `scripts/migrate-to-documents.ts` (hỗ trợ `--dry-run` và `--apply`).
- **Mục tiêu:** Chuyển `areas.summary`, `areas.goal`, `academic_details`, `project_details` thành tài liệu `"Tổng quan (đã chuyển)"`; chuyển `notes` có `areaId != null` thành tài liệu riêng (giữ `aiExcluded`, `createdAt`, ghi vào `note_document_map`; giữ nguyên Inbox notes trong `notes`).
- **Test:** `scripts/migrate-to-documents.test.ts` (chạy trên PGlite: kiểm tra idempotency, bảo toàn tổng ký tự, bảo toàn `aiExcluded`, rollback per-area khi lỗi).

---

## Wave 3 — Phase A UI & Workspace (A4 → A9)

> **Nguyên tắc:** Có thể đặt sau flag/param hoặc chuyển dần từ drawer cũ sang workspace toàn màn hình trong `/context` để không làm gián đoạn việc dùng app hàng ngày.

1. **A4 — Editor tài liệu (`src/components/context/doc-editor.tsx`):**
   - Dùng thư viện đã chốt ở A0; hỗ trợ GFM (heading, list, checklist bấm được trên iOS, bảng, code block), undo/redo trong phiên.
   - Tái dùng mẫu autosave tuần tự `chain.current` của `notes-panel.tsx` (`AUTOSAVE_MS = 1500`, `visibilitychange`, `pagehide`).
   - Xử lý xung đột `expectedRevision`: hiện banner `"Tài liệu đã thay đổi ở nơi khác"` với nút tải bản mới hoặc giữ bản đang gõ để sao chép.
   - E2E (`e2e/doc-editor.spec.ts` trên `desktop` và `iphone`): gõ + reload, toggle checklist, xung đột 2 tab.
2. **A5 — Giao diện Context Workspace (`src/components/context/workspace-view.tsx`):**
   - Bố cục 3 phần trên desktop: Explorer tài liệu bên trái | Editor rộng ở giữa | Panel vận hành (Thông tin vận hành gọn + Tasks, Milestones, Blockers, Topics, Assessments, Activity) bên phải/tab.
   - Trên `iphone`: Explorer mở dạng Sheet, Editor toàn màn hình, vùng chạm ≥44px, input ≥16px, không tràn ngang.
   - URL sync: `/context?tab=...&item=<id>&doc=<docId>`.
3. **A6 — Lịch sử phiên bản & Khôi phục:**
   - Drawer/modal xem `document_versions`, diff theo dòng dễ đọc trên mobile, nút Khôi phục (gọi `restoreDocumentVersion`).
4. **A7 — Tìm kiếm tài liệu:**
   - Query `searchDocuments(db, { query, areaId? })` dùng `search_tsv` (cấu hình `simple` trên `normalizeVi(query)`), bỏ qua `deletedAt != null`.
   - Highlight đoạn trích, bấm mở đúng `?item=<areaId>&doc=<docId>`.
5. **A8 — Liên kết tới Task & Milestone:**
   - Cú pháp Markdown chuẩn `[Tên](task:<uuid>)` và `[Tên](milestone:<uuid>)`.
   - Bộ chọn chèn liên kết trong workspace + custom renderer hiển thị chip trạng thái sống (hoặc `"liên kết hỏng"` nếu đã xóa).
6. **A9 — Template tùy chọn (P2):**
   - Bộ template mặc định cho Academic và Project khi tạo tài liệu mới; luôn cho phép tạo tài liệu trống.

---

## Wave 4 — Phase A Migration thật & Dọn dẹp (A10 thật → A11)

1. **A10 (Chạy thật):**
   - **Điểm dừng với owner:** Xuất JSON sao lưu từ Settings (`/api/export`) → chạy thử `--dry-run` trên bản sao → chạy `--apply` lên Supabase thật → đối chiếu báo cáo tổng ký tự và số lượng note.
2. **A11 — Tích hợp & Dọn dẹp:**
   - Cập nhật `src/server/queries/snapshot.ts` (`AreaSummary.missing` bỏ cờ của trường đã chuyển, thêm `no_documents` nếu cần).
   - Cập nhật `src/server/seed/import-seed.ts` & onboarding để tạo tài liệu khởi tạo (không bắt buộc).
   - Chuyển các `pending_actions` đang chờ có đụng `summary`/`goal` sang `superseded` và gỡ khỏi schema đề xuất cũ.
   - Cập nhật toàn bộ `e2e/*.spec.ts` theo Workspace UI mới.
   - **Điểm dừng với owner:** Chỉ tạo migration `DROP COLUMN` cho các cột cũ sau khi owner xác nhận dùng ổn định và đã có bản export mới nhất.

---

## Wave 5 — Phase B Retrieval & Context (B10 → B1 → B2 → B4, tùy chọn B3)

> **Nguyên tắc:** Làm lớp bảo vệ riêng tư (`B10`) trước khi đưa bất kỳ nội dung tài liệu nào vào prompt AI.

1. **B10 — Riêng tư cho tài liệu (`ai_excluded`):**
   - Lọc bỏ mọi tài liệu có `aiExcluded = true` hoặc thuộc area `aiExcluded = true` khỏi: Tầng 2 (`buildContext`), chunk truy hồi, `recentLogs` (`entityType === 'document'`), và lịch sử chat có `contextRefs` trỏ tới tài liệu bị loại (mở rộng P2-R3 trong `src/server/ai/context-builder.ts`).
   - Test kiểm tra toàn bộ payload (`system` + `messages`) gửi tới provider.
2. **B1 — Chỉ mục truy hồi `document_chunks`:**
   - Thêm bảng `document_chunks` (`id`, `documentId`, `areaId`, `headingPath`, `ordinal`, `text`, `searchText`, `searchTsv` GIN) cập nhật trong cùng transaction của `documentService`.
   - Hàm `searchContext(db, query, { areaIds?, limit })` trả về chunk xếp hạng FTS, tuyệt đối lọc `aiExcluded = false` và `deletedAt IS NULL`.
3. **B2 — Mở rộng `buildContext`:**
   - Giữ nguyên Tầng 1 (trạng thái có cấu trúc) không bao giờ bị cắt.
   - Thêm Tầng 2 tài liệu: dàn ý (`title` + `headings`) của workspace trong scope + top-K chunk khớp tin nhắn hiện tại và 3 tin nhắn gần nhất.
   - Áp trần ngân sách tài liệu (ví dụ ≤ 40% của `DEFAULT_MAX_CHARS = 32000`), cắt xác định trong `src/server/ai/context-truncate.ts`.
   - Mở rộng `ContextRef` thêm `documentId?` để dòng `"Dựa trên:"` trong Chat mở thẳng `/context?item=...&doc=...`.
4. **B4 — Độ tin cậy & Độ mới ngữ cảnh:**
   - Kèm `updatedAt`, `daysSinceUpdate`, `lastOrigin` vào mỗi chunk.
   - Cập nhật `src/server/ai/prompt.ts`: trạng thái có cấu trúc thắng tài liệu khi mâu thuẫn; đoạn cũ hơn `staleAfterDays` được đánh dấu có thể lỗi thời.
5. **B3 — Công cụ đọc cho AI (P2, chỉ làm nếu thực tế cần):**
   - Thêm tool `search_documents` và `read_document` khi `AI_ACTION_MODE=tools`, có giới hạn số lượt gọi/turn và kiểm tra `ai_excluded`.

---

## Wave 6 — Phase B Document Proposals, Approval & Eval (B5 → B6 → B7 → B9 → B8 → B11)

1. **B5 — Mở rộng `ProposedAction` (`src/server/proposals/schema.ts` & `validate.ts`):**
   - Thêm 5 action: `create_document`, `append_to_document`, `replace_section`, `set_checklist_item`, `rename_document` (tuyệt đối **không có** hành động xóa).
   - Backend kiểm tra: tài liệu tồn tại, không xóa mềm, không `aiExcluded`, `heading` hoặc `itemText` khớp duy nhất 1 vị trí. Lưu thêm `baseRevision` và `sectionHash` vào `StoredAction`.
   - Cập nhật `scripts/ai-probe.ts` thêm ca kiểm tra hành động tài liệu.
2. **B6 — Áp dụng & Kiểm soát xung đột theo Section:**
   - Trong `src/server/proposals/resolve.ts`: khóa dòng đích (`FOR UPDATE`) trong transaction cùng với các thao tác cấu trúc; gọi `documentService` với origin `'ai_approved'` và chung `batchId`.
   - Nếu `sectionHash` hiện tại khác lúc đề xuất → báo xung đột riêng cho action đó, không ghi đè. Nếu section khác thay đổi → vẫn áp dụng được.
3. **B7 — UI duyệt có Diff:**
   - Mở rộng thẻ đề xuất của Phase 3: hiển thị đường dẫn `Workspace › Tài liệu › Section`, diff thêm/bớt theo dòng (thu gọn đoạn dài), cho phép sửa trước khi duyệt và duyệt một phần trên iPhone (≥44px, không tràn ngang).
4. **B9 — Định tuyến đề xuất đúng đích:**
   - Quy tắc trong prompt + cảnh báo kiểm tra ở server: deadline/hạn → bắt buộc `task`/`assessment` có `dueDate`; blocker → bảng `blockers`; hoàn thành topic → bảng `topics`.
5. **B8 — Hoàn tác lô AI (Undo):**
   - Với lô AI gần nhất: nếu đích chưa bị sửa tiếp sau `batchId` → tạo thao tác bù cho bản ghi cấu trúc + khôi phục version trước cho tài liệu (origin `'undo'`). Nếu đích đã bị sửa tiếp → điều hướng tới lịch sử version.
6. **B11 — Bộ test nhất quán ngữ cảnh:**
   - Fixture đầy đủ các ca khó (tài liệu mâu thuẫn cấu trúc, tài liệu cũ, `ai_excluded`, hỏi xuyên workspace, trùng heading) + cập nhật `docs/ai-probe-report.md`.

---

## Hạng mục ngoài V1 / Để sau (Từ TODO Mục 2)

- **Thông báo lịch trên iPhone (Mục 2):** Giữ ngoài phạm vi V1. Nếu sau này muốn làm nhẹ, ưu tiên **Hướng A** (1 route `/api/calendar.ics?token=...` xuất hạn task và ngày assessment, thêm một lần vào Apple Calendar trên iPhone). Không làm Web Push / cron job ở giai đoạn này.

---

## Điểm bắt đầu đề xuất ngay bây giờ

1. Làm **Quick Win (Mục 1)** để làm nóng và kiểm tra pipeline test/e2e.
2. Chạy **Wave 1 (Phase 3)** theo `docs/superpowers/plans/2026-11-22-phase-3-ai-updates.md` (hoặc song song chốt **A0 ADR** với owner).
