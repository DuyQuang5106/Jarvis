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
     - *Transaction pooler* (cổng 6543) cho app chạy trên Vercel;
     - *Session pooler* (cổng 5432) cho migrate và chuyển dữ liệu từ máy bạn.

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
| `DATABASE_URL` | Transaction pooler (cổng **6543**) |
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
