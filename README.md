# Personal AI Workspace

Không gian làm việc cá nhân có trợ lý AI, dùng cho một người dùng duy nhất.

- Đặc tả: [Personal_AI_Workspace_V1.1_Spec.md](./Personal_AI_Workspace_V1.1_Spec.md)
- Kế hoạch triển khai: [docs/superpowers/plans/README.md](./docs/superpowers/plans/README.md)

## Chạy local

Yêu cầu: Node 24, pnpm 10.

```bash
pnpm install
pnpm dev
pnpm db:seed   # tùy chọn: nạp toàn bộ seed data vào PGlite local
```

`pnpm dev` dùng PGlite (lưu ở `./.pglite`), `AUTH_MODE=dev` và `AI_PROVIDER=mock` nên không cần Supabase hay khóa AI. Mở http://localhost:3000.

## Lệnh

| Lệnh | Việc |
|---|---|
| `pnpm dev` | Dev local: PGlite lưu ở `./.pglite`, `AUTH_MODE=dev`, `AI_PROVIDER=mock` |
| `pnpm dev:e2e` | Như trên nhưng PGlite trong bộ nhớ, `E2E=1`, cổng 3100, `AI_ACTION_MODE=tools` |
| `pnpm dev:e2e:supabase` | Server e2e thứ hai ở cổng 3101 với `AUTH_MODE=supabase` (Supabase giả, không với tới); Playwright tự chạy |
| `pnpm build` / `pnpm start` | Build và chạy bản production |
| `pnpm test` | Vitest chạy một lần |
| `pnpm test:e2e` | Playwright |
| `pnpm typecheck` / `pnpm lint` | `tsc --noEmit` / ESLint |
| `pnpm db:generate` | Sinh migration từ schema |
| `pnpm db:migrate` | Áp migration lên `MIGRATION_DATABASE_URL` (hoặc `DATABASE_URL`) |
| `pnpm db:seed` | Nhập toàn bộ seed data (dev) |
| `pnpm ai:probe` | Kiểm tra tương thích provider, ghi `docs/ai-probe-report.md` |
| `pnpm ai:eval` | Hỏi các câu trong `docs/ai-eval-cases.json` qua lượt chat thật trên **bản sao** database (`EVAL_PGLITE_DIR`), ghi `docs/ai-eval-report.md`; thoát mã 1 nếu có case trượt |
| `pnpm verify:rls` | Kiểm tra criterion 13 trên Supabase thật |

## Biến môi trường

Mẫu nằm ở `.env.example`. Copy thành `.env.local` (dev) hoặc `.env.production.local` (chạy lệnh với Supabase thật).

| Biến | Ý nghĩa |
|---|---|
| `DATABASE_URL` | Connection string transaction pooler của Supabase. Chỉ dùng ở server |
| `MIGRATION_DATABASE_URL` | Connection string session pooler, dùng cho `pnpm db:migrate` |
| `NEXT_PUBLIC_SUPABASE_URL` | URL project Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Khóa anon, chỉ dùng cho đăng nhập và `pnpm verify:rls` |
| `APP_OWNER_EMAIL` | Email của owner, tài khoản duy nhất được vào app |
| `DB_DRIVER` | `postgres` (production) hoặc `pglite` (chỉ dev/test) |
| `AUTH_MODE` | `supabase` (production) hoặc `dev` (chỉ dev/test) |
| `AI_PROVIDER` | `fosta` hoặc `mock` |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | Cấu hình provider AI |
| `AI_ACTION_MODE` | `tools`, `json` hoặc `off`; đặt theo `docs/ai-probe-report.md` |
| `AI_DAILY_REQUEST_CAP` | Trần số request AI mỗi ngày (mặc định 200) |
| `AI_CONTEXT_MAX_CHARS` | Số ký tự `<workspace_state>` tối đa mỗi lượt chat (mặc định 120000, tối thiểu 16000) |
| `AI_MAX_OUTPUT_TOKENS` | Token trả lời tối đa mỗi lượt chat (mặc định 4000, khoảng 500–16000) |
| `PGLITE_DIR` | Thư mục PGlite khi `DB_DRIVER=pglite` |
| `EVAL_PGLITE_DIR` | Chỉ cho `pnpm ai:eval`: thư mục **bản sao** PGlite (không được trùng `PGLITE_DIR` hay `./.pglite`) |
| `E2E` | Đặt `1` khi chạy e2e (do `pnpm dev:e2e` tự đặt) |

Không commit file `.env*` chứa giá trị thật.

## Triển khai lần đầu

Các bước dưới đây do owner tự làm.

1. **Supabase.** Tạo project ở khu vực Singapore. Trong Authentication, tắt cho phép người dùng mới đăng ký (disable public sign-ups). Tạo một user bằng email của owner với mật khẩu do owner tự đặt, và xác nhận user đó đã được tạo và ở trạng thái confirmed.
2. **Biến môi trường trên máy.** Lấy `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, connection string dạng transaction pooler (cho `DATABASE_URL`) và dạng session pooler (cho `MIGRATION_DATABASE_URL`); đặt vào `.env.production.local` trên máy.
3. **Probe AI.** Điền `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` vào `.env.local`, chạy `pnpm ai:probe`, rồi đặt `AI_ACTION_MODE` theo mode khuyến nghị trong `docs/ai-probe-report.md`.
4. **Migration và kiểm tra RLS.** Chạy `pnpm db:migrate` với các biến ở bước 2, rồi `pnpm verify:rls`. Kỳ vọng: mọi bảng `ok` (criterion 13). Kết quả này chứng minh vai trò `anon` không đọc được dữ liệu. Lưu ý: bật RLS mà không có policy nào thì vai trò `authenticated` cũng bị từ chối khi gọi qua Data API; app chỉ truy cập dữ liệu qua `DATABASE_URL` ở server. Bảng chỉ `ok` khi trả về mảng rỗng hoặc lỗi quyền 42501; mọi phản hồi khác là trượt. Trượt với 401 "Invalid API key" nghĩa là kiểm tra lại anon key; 404 nghĩa là URL sai hoặc migration chưa được áp.
5. **Vercel.** Đẩy code lên GitHub (chỉ khi owner yêu cầu), tạo project Vercel từ repo (`vercel.json` đã chọn vùng `sin1`), điền đủ biến môi trường production gồm `APP_OWNER_EMAIL`, `DB_DRIVER=postgres`, `AUTH_MODE=supabase`, các biến `AI_*` và `AI_ACTION_MODE` theo báo cáo probe.
6. **Kiểm tra trên máy tính.** Mở bản deploy: chưa đăng nhập thì bị đưa về `/login`; đăng nhập được bằng tài khoản owner (criterion 1).
7. **Kiểm tra trên iPhone.** Mở bản deploy bằng Safari, `Add to Home Screen`, mở từ màn hình chính, đăng nhập, đóng hẳn app rồi mở lại: vẫn còn đăng nhập.

## Đổi provider AI

Đổi `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` trong biến môi trường, chạy `pnpm ai:probe` để kiểm tra tương thích, rồi đặt `AI_ACTION_MODE` (`tools`, `json` hoặc `off`) theo kết quả trong [docs/ai-probe-report.md](./docs/ai-probe-report.md).

Sau đó đo chất lượng trả lời bằng câu hỏi thật. Lượt chat ghi tin nhắn và đề xuất vào database, nên luôn chạy trên bản sao (dừng `pnpm dev` trước khi sao chép):

```bash
cp -r .pglite .pglite-eval
EVAL_PGLITE_DIR=./.pglite-eval AI_MODEL=<model> pnpm ai:eval
```

Kết quả nằm ở `docs/ai-eval-report.md` (mỗi case chỉ giữ tối đa 300 ký tự câu trả lời). Thêm câu hỏi vào `docs/ai-eval-cases.json`; các trường `answerMustMatch`/`answerMustNotMatch` là regex không phân biệt hoa thường, `contextMustInclude`/`contextMustNotInclude` so với tên tài liệu AI đã đọc.

## Sao lưu

Dùng nút Export JSON trong Settings (gọi `GET /api/export`) để tải toàn bộ dữ liệu định kỳ. Kiểm tra thêm chính sách backup và tạm dừng project của gói Supabase đang dùng.

## Quyền riêng tư

Dữ liệu nằm trên Supabase Postgres (RLS bật, không có policy cho Data API). Khi chat hoặc chạy `Extract suggestions`, context được gửi tới provider AI đã cấu hình. Công tắc `Không gửi cho AI` chặn dữ liệu của mục hoặc ghi chú đó đi tới provider.

## Dùng trên iPhone

Mở bản deploy bằng Safari → Chia sẻ → `Add to Home Screen` để chạy dưới dạng PWA toàn màn hình.

## Chuyển dữ liệu sang tài liệu (A10)

Trước khi chạy chuyển dữ liệu thật trên Supabase:
1. Tải bản sao lưu JSON từ nút Export trong Settings (`GET /api/export`).
2. Chạy thử dry-run trên bản sao PGlite để kiểm tra báo cáo ký tự và số tài liệu: `pnpm exec tsx scripts/migrate-to-documents.ts`.
3. Khi báo cáo khớp (`fieldCharsBefore === fieldCharsAfter` và `noteCharsBefore === noteCharsAfter`), mới chạy áp dụng (`--apply`). Không xóa các cột form cũ cho tới khi xác nhận ổn định ở bước A11.
