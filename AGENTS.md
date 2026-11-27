<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Quy tắc cho agent làm việc trong repo này

- Không đụng `./.pglite` (dữ liệu thật của owner) và server trên cổng 3000. Thử AI thật chỉ trên bản sao: sao chép `.pglite` ra thư mục tạm, xóa `postmaster.pid` trong bản sao, rồi chạy `EVAL_PGLITE_DIR=<bản sao> pnpm ai:eval [case…]`.
- Không push khi owner chưa yêu cầu. Không in hay commit `.env*`.
- Push lên `main` là deploy production (Vercel tự build bằng `pnpm vercel-build`: tsc, lint, unit test, rồi `db:migrate` lên Supabase, rồi `next build`; kiểm tra đỏ thì bản cũ giữ nguyên). Vì vậy migration chỉ được thêm bảng/cột, không xóa hay đổi tên trong cùng lần deploy với code mới: code đang chạy phải sống được với schema mới.
- Script dùng PGlite phải gọi `process.exit` ở cuối, nếu không sẽ treo.
- Trước khi commit: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`. E2e chạy ở cổng 3100 (`pnpm exec playwright test`).
- Giao diện tiếng Việt, comment tiếng Anh. Mọi trang hoặc server component riêng tư gọi `requireOwner()` trong Suspense sau `await connection()`.
- Việc gọi AI kéo dài (từ khoảng 10 giây) đi qua route handler, không qua server action: server action chạy tuần tự theo tab và sẽ chặn các thao tác khác.
- Mọi thay đổi dữ liệu do AI đề xuất phải qua thẻ duyệt (`pending_actions`); không ghi thẳng.
- Kế hoạch và tiêu chí nằm trong `TODO.md` và `docs/superpowers/plans/`.
