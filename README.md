# Personal AI Workspace

Không gian làm việc cá nhân có trợ lý AI, dùng cho một người dùng duy nhất.

- Đặc tả: [Personal_AI_Workspace_V1.1_Spec.md](./Personal_AI_Workspace_V1.1_Spec.md)
- Kế hoạch triển khai: [docs/superpowers/plans/README.md](./docs/superpowers/plans/README.md)

## Chạy local

Yêu cầu: Node 24, pnpm 10.

```bash
pnpm install
pnpm dev
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
| `pnpm ai:probe` | Kiểm tra tương thích provider, ghi `docs/ai-probe-report.md` |
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
| `PGLITE_DIR` | Thư mục PGlite khi `DB_DRIVER=pglite` |
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
