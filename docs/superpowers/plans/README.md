# Personal AI Workspace V1 — Bộ kế hoạch triển khai

**Spec:** [`Personal_AI_Workspace_V1.1_Spec.md`](../../../Personal_AI_Workspace_V1.1_Spec.md) (ở gốc repo). Mọi kế hoạch dưới đây lập luận từ spec này; người thực thi đọc spec trước, rồi đọc file này, rồi mới đọc kế hoạch của phase đang làm.

## Thứ tự thực thi

| # | Kế hoạch | Kết quả chạy được | Criteria của spec |
|---|---|---|---|
| 0 | [Phase 0 — Nền và kiểm chứng](2026-11-22-phase-0-foundation.md) | Khung app đăng nhập được, deploy được, mở được trên iPhone; có báo cáo probe | 1, 11, 13 |
| 1 | [Phase 1 — Context và CRUD](2026-11-22-phase-1-context-crud.md) | Quản lý toàn bộ dữ liệu bằng tay, có log, seed, export | 2, 3, 4, 15, 17 |
| 2 | [Phase 2 — Chat hiểu ngữ cảnh](2026-11-22-phase-2-chat.md) | Hỏi và nhận trả lời dựa trên state trong DB | 5, 6, 9 |
| 3 | [Phase 3 — AI đề xuất cập nhật](2026-11-22-phase-3-ai-updates.md) | Đề xuất → duyệt → ghi; quick capture extraction | 7, 8, 10, 12, 14, 16 |

Làm tuần tự. Không bắt đầu phase sau khi phase trước chưa qua hết mục “Xong khi”. Các mục **(P1)** của spec (Undo, card view, tìm kiếm note, read tool, dump DB định kỳ) **không nằm trong bộ kế hoạch này**; sau khi V1 đạt đủ 17 criteria thì viết kế hoạch riêng.

## Điểm dừng cần owner

Người thực thi **dừng lại và hỏi owner** tại các điểm sau; không tự tạo tài khoản, không tự đặt mật khẩu, không tự điền key:

| Khi nào | Owner cần làm |
|---|---|
| Phase 0, Task 5 (probe) | Cung cấp `AI_API_KEY` và `AI_MODEL` của Fosta trong `.env.local` |
| Phase 0, Task 6 | Tạo Supabase project + user owner, tạo Vercel project, điền biến môi trường, kiểm tra trên iPhone |
| Cuối Phase 2 | Thử ba câu hỏi thật trên bản deploy với Fosta |
| Cuối Phase 3 | Chạy checklist 17 criteria, phần trên iPhone thật |

Mọi việc khác làm được hoàn toàn trên máy local với `DB_DRIVER=pglite`, `AUTH_MODE=dev`, `AI_PROVIDER=mock`.

## Quy ước chung (áp dụng cho mọi task)

**Công cụ:** Node 24, pnpm 10, TypeScript strict, alias `@/*` → `src/*`.

**Thư viện đã chốt:** Next.js (App Router, bản stable mới nhất) · Tailwind + shadcn/ui · Drizzle ORM · `postgres` (postgres.js) cho production · `@electric-sql/pglite` cho dev/test · `@supabase/ssr` · Zod 4 · gói `openai` làm client cho API tương thích OpenAI · `react-markdown` + `remark-gfm` · Vitest · Playwright.

**Không dùng:** Vercel AI SDK (tự stream NDJSON, xem Phase 2), Prisma, bất kỳ thư viện state management nào, thư viện ngày giờ (dùng `Intl`).

**API của thư viện thay đổi theo phiên bản.** Kế hoạch chỉ cố định *hành vi* qua test. Với bốn chỗ sau, đọc tài liệu hiện hành của đúng phiên bản đã cài trước khi viết, và lấy test làm hợp đồng:
- Next.js: tên file middleware/proxy, `cookies()` bất đồng bộ, cấu hình `serverExternalPackages`.
- Supabase SSR cho Next.js: cách tạo server client và làm mới phiên.
- Drizzle: cú pháp bật RLS trên bảng, migrator cho PGlite và postgres.js.
- shadcn CLI: lệnh `init` và `add`.

**Cấu trúc thư mục:**

```text
src/
  app/
    login/                      màn đăng nhập
    (app)/layout.tsx            khung có sidebar, gọi requireOwner()
    (app)/chat/page.tsx         /chat và /chat?c=<conversationId>
    (app)/context/page.tsx      /context?tab=academic|projects&item=<areaId>
    (app)/_actions/*.ts         server actions (mutations từ UI)
    api/chat/route.ts           stream NDJSON
    api/export/route.ts
    api/test/reset/route.ts     chỉ tồn tại khi E2E=1
    manifest.ts
  components/{shell,context,chat,ui}/
  db/{enums.ts,schema.ts,client.ts,testing.ts,test-helpers.ts}
  lib/dates.ts
  server/
    config.ts  auth.ts  errors.ts  schemas.ts
    services/   lớp GHI duy nhất: activity, entities, areas, settings, conversations, ai-usage
    queries/    lớp ĐỌC: snapshot, area-details
    ai/         provider, mock, fosta, match-areas, context-builder, prompt
    chat/       run-turn
    proposals/  schema, validate, describe, extract, resolve
    seed/       seed-data, import-seed
drizzle/        migration SQL sinh bởi drizzle-kit
e2e/            Playwright
scripts/        ai-probe.ts, verify-rls.ts, migrate.ts, seed.ts
```

**Luật kiến trúc:**
1. Mọi thao tác ghi dữ liệu nghiệp vụ đi qua `src/server/services/*`. Component, server action và route handler không gọi `db.insert/update/delete` trực tiếp.
2. Mỗi hàm service ghi dữ liệu và ghi `activity_logs` trong **cùng một transaction**. Service nhận `DbOrTx` và luôn gọi `.transaction()` (lồng nhau thành savepoint).
3. Server action: `requireOwner()` → parse bằng Zod → gọi service → `revalidatePath`. Route handler bọc bằng `withOwner()`.
4. Enum khai báo một lần ở `src/db/enums.ts`, dùng chung cho schema Drizzle và Zod.
5. Tên cột DB dạng `snake_case`, thuộc tính TypeScript và mọi JSON trao đổi với model dạng `camelCase`.
6. Chuỗi hiển thị cho người dùng viết bằng tiếng Việt.

**Test:**
- Unit/integration: Vitest, file `*.test.ts` đặt cạnh mã nguồn. Test có DB dùng `createTestDb()` (PGlite trong bộ nhớ, đã migrate), mỗi test một DB mới.
- E2E: Playwright trong `e2e/`, hai project `desktop` (Chromium) và `iphone` (`devices['iPhone 14']`). Server chạy bằng `pnpm dev:e2e` ở cổng 3100. Mỗi test gọi `POST /api/test/reset` trong `beforeEach`.
- Không test nào được gọi mạng ra ngoài.

**Lệnh:**

| Lệnh | Việc |
|---|---|
| `pnpm dev` | Dev local: PGlite lưu ở `./.pglite`, `AUTH_MODE=dev`, `AI_PROVIDER=mock` |
| `pnpm dev:e2e` | Như trên nhưng PGlite trong bộ nhớ, `E2E=1`, cổng 3100, `AI_ACTION_MODE=tools` |
| `pnpm test` | Vitest chạy một lần |
| `pnpm test:e2e` | Playwright |
| `pnpm typecheck` / `pnpm lint` | `tsc --noEmit` / ESLint |
| `pnpm db:generate` | Sinh migration từ schema |
| `pnpm db:migrate` | Áp migration lên `DATABASE_URL` |
| `pnpm db:seed` | Nhập toàn bộ seed data (dev) |
| `pnpm ai:probe` | Kiểm tra tương thích provider, ghi `docs/ai-probe-report.md` |
| `pnpm verify:rls` | Kiểm tra criterion 13 trên Supabase thật |

**Cú pháp lệnh:** các lệnh trong kế hoạch viết theo bash. Lệnh có biến môi trường đứng trước (ví dụ `AUTH_MODE=dev pnpm start`) khi chạy trong PowerShell đổi thành `$env:AUTH_MODE='dev'; pnpm start`. Script trong `package.json` cần đặt biến môi trường thì dùng `cross-env`.

**Commit:** một commit cuối mỗi task, dạng `feat(scope): ...` / `test(scope): ...` / `chore: ...`. Trước khi commit: `pnpm typecheck && pnpm lint && pnpm test` phải xanh.

## Quyết định bổ sung ở chỗ spec để ngỏ

| Chủ đề | Quyết định |
|---|---|
| Trạng thái milestone | `not_started / in_progress / done` |
| `notes.inbox_status` | `none` (ghi chú thường) / `inbox` (quick capture chưa xử lý) / `processed` |
| `activity_logs.action` | `create / update / delete / archive / progress` |
| “Progress log” do người dùng hoặc AI thêm | Một dòng `activity_logs` với `entity_type='area'`, `action='progress'`, `after_json={text}` |
| `areas.updated_at` | Được cập nhật mỗi khi area **hoặc bất kỳ bản ghi con nào** thay đổi; đây là `last_updated` hiển thị và dùng tính “cũ” |
| Item “cũ” | status thuộc `active/blocked` và số ngày từ `updated_at` > `settings.stale_after_days` (mặc định 7) |
| Cửa sổ thời gian trong snapshot | Task: quá hạn hoặc đến hạn trong 14 ngày, chưa `done`. Assessment: từ hôm nay đến 21 ngày tới |
| Tuần | Thứ Hai đến Chủ nhật |
| Trần request AI | Bảng `ai_usage(day, count)`; trần lấy từ `AI_DAILY_REQUEST_CAP`, mặc định 200 |
| Onboarding | `settings.onboarded_at`; modal hiện khi cột này null |
| Tiêu đề cuộc chat | 60 ký tự đầu của tin nhắn đầu tiên; không gọi LLM |
| Lịch sử gửi cho model | 10 tin nhắn gần nhất của cuộc chat |
| Ngân sách context | 32.000 ký tự JSON (xấp xỉ 8k token) |
| Giới hạn đầu vào | Tin nhắn chat ≤ 8.000 ký tự; note ≤ 20.000 ký tự; tên ≤ 200 ký tự |
| Chế độ JSON của đề xuất | Model đặt JSON giữa thẻ `<proposed_actions>` và `</proposed_actions>` ở cuối câu trả lời |
| Duyệt đề xuất | Tất cả hành động được chọn thành công, hoặc không hành động nào được ghi |
| Mốc xung đột | Server ghi `baseUpdatedAt` khi lưu đề xuất; model không chép timestamp |

## Bản đồ acceptance criteria → nơi kiểm chứng

| # | Kiểm chứng tự động | Kiểm chứng bởi owner |
|---|---|---|
| 1 | `owner.test.ts`, `auth.test.ts`, `config.test.ts` | Đăng nhập trên bản deploy; thử đăng ký bị chặn |
| 2 | `e2e/shell.spec.ts` | — |
| 3 | `entities.test.ts`, `areas.test.ts`, `e2e/context-*.spec.ts` | — |
| 4 | `import-seed.test.ts`, `e2e/onboarding.spec.ts` | — |
| 5 | `context-builder.test.ts`, `e2e/chat.spec.ts` | Hỏi thật với Fosta |
| 6 | `e2e/chat.spec.ts` | — |
| 7 | `run-turn.test.ts` (Phase 3), `e2e/proposal.spec.ts` | Thử thật với Fosta |
| 8 | `resolve.test.ts`, `e2e/proposal.spec.ts` | — |
| 9 | `snapshot.test.ts`, `context-builder.test.ts` | Hỏi thật với Fosta |
| 10 | `run-turn.test.ts`, `extract.test.ts`, `e2e/chat.spec.ts` | — |
| 11 | `e2e/bundle-secrets.spec.ts` | Xem lại biến môi trường trên Vercel |
| 12 | `pnpm test && pnpm test:e2e` xanh | — |
| 13 | `schema.test.ts` (RLS bật trên mọi bảng) | `pnpm verify:rls` trên Supabase thật |
| 14 | `resolve.test.ts`, `e2e/proposal.spec.ts` | — |
| 15 | `dates.test.ts`, `snapshot.test.ts`, `context-builder.test.ts` | — |
| 16 | `e2e/*.spec.ts` project `iphone` | Thử trên iPhone thật |
| 17 | `export.test.ts` | — |
