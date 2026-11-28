# Deploy lên Vercel + Supabase (R4)

Tài liệu cho owner. Các bước có ghi **[bạn]** cần tài khoản, mật khẩu hoặc khóa bí mật, nên bạn tự làm; agent không nhập những thứ đó. Các bước còn lại chạy bằng lệnh trong repo.

Thời gian ước tính: 45–60 phút cho lần đầu.

## 0. Chuẩn bị
- Tài khoản GitHub có repo `Jarvis` đã push bản mới nhất (Vercel lấy code từ GitHub).
- Tài khoản Supabase và Vercel; đăng nhập bằng GitHub là nhanh nhất.

## 1. Tạo project Supabase **[bạn]**
1. supabase.com → New project. Đặt tên `jarvis`, region **Southeast Asia (Singapore)** (vùng phải khớp `vercel.json`, hiện là `sin1` = Singapore), đặt mật khẩu database mạnh và lưu vào trình quản lý mật khẩu.
2. Authentication → Sign In / Providers → Email: bật Email, **tắt "Allow new users to sign up"**. App chỉ có một chủ; không ai tự đăng ký được.
3. Authentication → Users → Add user → Create new user: dùng email của bạn, đặt mật khẩu và tick "Auto Confirm User". Email này sẽ là `APP_OWNER_EMAIL`.
4. Lấy các giá trị sau (Project Settings):
   - **Project URL** (trang Home);
   - Settings → **API Keys**: dùng key mới **Publishable key** (`sb_publishable_…`) cho biến `NEXT_PUBLIC_SUPABASE_ANON_KEY` và **Secret key** (`sb_secret_…`, bấm Reveal) cho `SUPABASE_SERVICE_ROLE_KEY`. Key cũ `anon` / `service_role` (mục Legacy API Keys) vẫn dùng được, nhưng Supabase sẽ ngừng hỗ trợ chúng. Secret key là bí mật, chỉ đặt ở server;
   - **Connection string** (nút Connect):
     - *Session pooler* (cổng 5432): dùng cho cả app trên Vercel lẫn migrate và chuyển dữ liệu từ máy bạn.
     - **Không dùng** *Transaction pooler* (cổng 6543): thư viện `postgres` của app gửi nhiều truy vấn dồn trên một kết nối, và pooler này bị treo với cách gửi đó (đo ngày 27/11/2026: 147/150 truy vấn treo, trong khi Session pooler 0/150). Build production tự dừng nếu `DATABASE_URL` dùng cổng 6543.

## 2. Tạo `.env.production.local` trên máy **[bạn]**
File này nằm ở thư mục gốc repo, đã bị `.gitignore` chặn nên không lên GitHub. Nội dung:

```
MIGRATION_DATABASE_URL=<Session pooler, cổng 5432>
NEXT_PUBLIC_SUPABASE_URL=<Project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
SUPABASE_STORAGE_BUCKET=documents
```

## 3. Tạo bảng và chuyển dữ liệu
Chạy từng lệnh trong PowerShell ở thư mục repo:

1. Tạo bảng trên Supabase:
   ```powershell
   pnpm db:migrate
   ```
2. Tắt `pnpm dev` đang chạy, rồi sao chép dữ liệu ra một bản riêng:
   ```powershell
   Copy-Item -Recurse .pglite $env:TEMP\jarvis-transfer; Remove-Item $env:TEMP\jarvis-transfer\postmaster.pid -ErrorAction SilentlyContinue
   ```
3. Chạy thử. Lệnh này chỉ đếm và kiểm tra, không ghi gì:
   ```powershell
   pnpm transfer:supabase --from $env:TEMP\jarvis-transfer --dry-run
   ```
4. Chuyển thật. Lệnh chép database (khoảng 19 MB, một transaction, tự so số dòng hai bên) rồi tải 282 tệp (khoảng 272 MB) lên bucket riêng tư `documents`:
   ```powershell
   pnpm transfer:supabase --from $env:TEMP\jarvis-transfer
   ```
   Nếu mạng đứt giữa lúc tải tệp, chạy lại với `--files-only`; tệp đã có sẽ được bỏ qua. Script từ chối ghi vào database đã có dữ liệu.
5. Kiểm tra rằng người lạ (anon key) không đọc được bảng nào:
   ```powershell
   pnpm verify:rls
   ```

## 4. Tạo project Vercel **[bạn]**
1. vercel.com → Add New → Project → import repo `Jarvis`. Framework: Next.js. Giữ build mặc định. Region đã được đặt là Singapore (`sin1`) trong `vercel.json`, cạnh database.
2. Environment Variables (Production):

| Biến | Giá trị |
|---|---|
| `DATABASE_URL` | Session pooler (cổng **5432**), cùng giá trị với `MIGRATION_DATABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `SUPABASE_STORAGE_BUCKET` | `documents` |
| `STORAGE_DRIVER` | `supabase` |
| `APP_OWNER_EMAIL` | email owner ở bước 1.3 |
| `AI_PROVIDER` | `fosta` |
| `AI_BASE_URL`, `AI_API_KEY` | như trong `.env.local` |
| `AI_MODEL` | `claude-sonnet-5` |
| `AI_ACTION_MODE` | `tools` |

   Thêm `MIGRATION_DATABASE_URL` = Session pooler (cổng **5432**, giống trong `.env.production.local`), chỉ tick môi trường **Production**. Mỗi lần deploy production, Vercel tự chạy migrate bằng biến này.

   **Không** đặt `E2E`, `AUTH_MODE=dev` hay `DB_DRIVER=pglite`. App tự từ chối khởi động ở production nếu thấy chúng.
3. Deploy. Nếu Vercel báo route `api/weekly-review` vượt giới hạn thời gian của gói Hobby, báo agent để hạ `maxDuration` từ 300 xuống 60.

## 5. Cài lên iPhone **[bạn]**
1. Mở địa chỉ `https://<tên-project>.vercel.app` bằng **Safari**.
2. Bấm Chia sẻ → **Thêm vào Màn hình chính**.
3. Mở Jarvis từ màn hình chính và đăng nhập một lần.
4. Đi qua checklist `docs/acceptance-checklist.md`, đặc biệt các mục 1, 5, 7, 11, 13, 16, 17.

## 6. Sau khi chạy ổn
- Laptop không cần bật nữa. `.pglite` trên máy là bản cũ; đừng dùng song song, vì hai nơi sẽ lệch nhau. Muốn thử tính năng mới ở local thì dùng bản sao.
- Bước tiếp theo là thông báo trên iPhone (N3a), theo `docs/superpowers/plans/2026-11-27-deploy-and-push.md`.

## 7. Pipeline tự động khi push
Push lên `main` thì Vercel chạy `pnpm vercel-build` (`scripts/vercel-build.ts`):
1. tsc, lint, toàn bộ unit test (đã gỡ các biến bí mật, nên test không chạm database hay AI thật);
2. `db:migrate` lên Supabase, chỉ với bản production;
3. `next build`.

Bước nào đỏ thì build dừng và bản đang chạy giữ nguyên. Lên bản lỗi thì vào Deployments, chọn bản trước, rồi bấm **Instant Rollback**. Khi bộ kiểm tra hỏng mà cần sửa gấp, đặt `SKIP_BUILD_CHECKS=1` trên Vercel rồi Redeploy, và gỡ biến đó ngay sau khi sửa xong.

## 8. Thông báo trên iPhone (N3a)
1. Tạo khóa trên máy bạn (lệnh in ra 3 dòng; không dán vào chat, không commit):
   ```powershell
   pnpm push:keys
   ```
2. **[bạn]** Vercel → Settings → Environment Variables (Production): thêm `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` + email của bạn). Thêm cả vào `.env.local` nếu muốn thử ở máy. Redeploy (hoặc push bản mới).
3. Trên iPhone: mở Jarvis **từ biểu tượng ở Màn hình chính** (iOS 16.4 trở lên) → Settings → Thông báo → **Bật thông báo trên thiết bị này** → Cho phép → **Gửi thử**.
4. Đổi khóa thì mọi thiết bị phải bật lại thông báo.

## 9. Gửi thông báo theo giờ (N3b)
Jarvis tự gửi khi: tới giờ một lời nhắc bạn đặt; hết một buổi (check-in); từ tối Chủ nhật (tổng kết tuần); buổi sáng từ 07:30 (việc nên làm). Ngoài lời nhắc, không gửi gì trong giờ yên lặng (mặc định 23:00–07:00); bật/tắt từng loại và đổi giờ yên lặng ở Settings → Thông báo.

Cần một bộ hẹn giờ gọi `POST /api/cron/tick` mỗi 5 phút. Gói Hobby của Vercel chỉ cho cron mỗi ngày một lần, nên dùng `pg_cron` của Supabase:

1. **[bạn]** Tạo một chuỗi bí mật dài (PowerShell):
   ```powershell
   -join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
   ```
   Đặt nó làm `CRON_SECRET` trên Vercel (Production) rồi Redeploy.
2. **[bạn]** Supabase → Database → Extensions: bật `pg_cron` và `pg_net`.
3. **[bạn]** Supabase → SQL Editor, chạy (thay hai chỗ trong `<…>`):
   ```sql
   select cron.schedule(
     'jarvis-tick',
     '*/5 * * * *',
     $$ select net.http_post(
          url := 'https://<tên-miền-của-app>/api/cron/tick',
          headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
          body := '{}'::jsonb
        ) $$
   );
   ```
4. Kiểm tra: Supabase → SQL Editor `select * from cron.job_run_details order by start_time desc limit 5;` (trạng thái `succeeded`), và Vercel → Logs có request `POST /api/cron/tick` trả 200.
5. Gỡ: `select cron.unschedule('jarvis-tick');`

Route từ chối mọi request không mang đúng `Authorization: Bearer <CRON_SECRET>`; thiếu `CRON_SECRET` trên Vercel thì route luôn từ chối.
