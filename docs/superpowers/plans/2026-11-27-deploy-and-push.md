# Kế hoạch: deploy (R4) và thông báo trên iPhone (N3, N4)

> Ngày: 2026-11-27. Trạng thái: chờ owner chốt **nơi chạy** (mục 2) trước khi làm Task 1.
> Mã việc: R4 = deploy, N3 = thông báo đúng giờ, N4 = nhắc việc do bạn nhờ trong chat (mới).

## 1. Vì sao hôm nay Jarvis "chưa thể nhắc"

Ba thứ còn thiếu, và thiếu cái nào thì cũng không có thông báo:

1. **iPhone không với tới app.** App chỉ chạy ở `localhost` trên laptop. iPhone cần một địa chỉ HTTPS thật để cài app ra màn hình chính.
2. **App chưa có service worker.** Đây là đoạn code nằm trên iPhone, nhận thông báo kể cả khi app đang đóng.
3. **Không có gì chạy theo giờ.** Server chỉ làm việc khi bạn gửi request. Muốn "đến tối thì nhắc", phải có một bộ hẹn giờ (cron) gọi server mỗi vài phút để kiểm tra xem đã đến lúc gửi gì chưa.

Câu "Mình không thể tự gửi nhắc nhở" của Jarvis là đúng với hiện trạng. Kế hoạch này lấp lần lượt ba chỗ đó.

## 2. Chọn nơi chạy

| Tiêu chí | A. Vercel + Supabase (thuê, gói miễn phí) | B. Máy chủ ở nhà | C. VPS thuê (vd. Hetzner, DigitalOcean) |
|---|---|---|---|
| Công sửa code | **Ít nhất**: code đã viết cho Supabase Auth, Storage, Postgres + RLS | Trung bình: Docker, HTTPS, sao lưu; Auth/Storage vẫn dùng Supabase hoặc phải thay | Như B |
| Chi phí | 0đ (Vercel Hobby dành cho dùng cá nhân; Supabase Free 500 MB) | 0đ thêm, nhưng tốn điện và công trông | ~100–150k đ/tháng |
| Chạy theo giờ | Vercel Hobby giới hạn cron (khoảng 1 lần/ngày, giờ không chính xác) → dùng **Supabase `pg_cron` + `pg_net`** gọi app mỗi 5 phút (có sẵn ở gói Free) | Tự do (cron hệ thống) | Tự do |
| Thời gian chạy một request | Có trần (đang đặt `maxDuration = 60`); lượt AI dài ~30 giây vẫn vừa | Không trần | Không trần |
| Độ ổn định | Cao | Phụ thuộc điện, mạng nhà; máy tắt là mất nhắc | Cao |
| HTTPS cho iPhone | Có sẵn | Cần **Tailscale** (riêng tư, iPhone cài app Tailscale) hoặc **Cloudflare Tunnel** (công khai, cần tên miền ~250k đ/năm) | Cần tên miền + Caddy |
| Dữ liệu nằm ở đâu | Máy chủ Supabase (chọn vùng Singapore) | Ở nhà | Máy thuê |
| pgvector cho trí nhớ dài hạn (L1) | Có sẵn | Phải cài | Phải cài |

**Khuyến nghị: A trước, giữ đường lui sang B.**
- A là đường ngắn nhất tới thông báo trên iPhone, vì code đã sẵn cho nó.
- Dữ liệu là Postgres chuẩn, nên chuyển sang B sau này chỉ là dump rồi restore cộng đổi biến môi trường.
- Chỉ chọn B ngay nếu máy ở nhà **bật 24/7**, có Docker, và bạn muốn dữ liệu ở nhà hơn là thuận tiện.
- Một phương án lai: app và Postgres chạy ở nhà, vẫn dùng Supabase Auth và Storage. Phương án này tốn công hơn A nhưng ít hơn B "thuần".

Câu hỏi cần owner trả lời để chốt:
1. Máy ở nhà chạy hệ điều hành gì, có Docker không, có bật 24/7 không?
2. Bạn có ngại dữ liệu học tập nằm trên Supabase (Singapore) không?

## 3. Kiến trúc trên điện thoại

```
iPhone                                         Server (Vercel hoặc máy nhà)               Apple
┌──────────────────────────────┐               ┌────────────────────────────────┐
│ Jarvis (PWA, màn hình chính) │──HTTPS──────▶ │ Next.js: chat, context, API    │
│  - giao diện = trang web     │               │ Postgres: dữ liệu + bảng       │
│  - service worker (sw.js)  ◀─┼───────┐       │   push_subscriptions, reminders│
└──────────────────────────────┘       │       │ /api/cron/tick (mỗi 5 phút)    │
                                       │       │   → việc nào đến giờ?          │
                                       │       │   → web-push ký VAPID, mã hóa ──┼──▶ web.push.apple.com
                                       │       └────────────────────────────────┘        (APNs)
                                       └──────────── thông báo tới máy ◀─────────────────────┘
```

- **PWA là gì:** vẫn là trang web, nhưng khi "Thêm vào màn hình chính" từ Safari, nó mở như một app riêng, không có thanh địa chỉ. Code giao diện vẫn tải từ server. Không cần App Store hay tài khoản Apple Developer.
- **Thông báo trên iOS (từ 16.4):** chỉ hoạt động với PWA đã thêm vào màn hình chính, và chỉ xin quyền được khi bạn bấm một nút trong app. Sau khi bạn cho phép, iPhone cấp một "địa chỉ nhận" (push subscription) trỏ tới máy chủ Apple; app gửi địa chỉ đó lên server lưu lại.
- **Khi đến giờ:**
  1. Cron gọi `/api/cron/tick`.
  2. Server thấy, ví dụ, "hết buổi chiều và có hoạt động".
  3. Server gửi một gói tin nhỏ, đã mã hóa, tới Apple.
  4. Apple chuyển gói tin tới iPhone.
  5. Service worker hiện thông báo.
  6. Bấm vào thông báo thì app mở đúng thẻ, ví dụ `/chat?checkin=…`.
- **Nội dung AI tạo lúc mở, không phải lúc gửi.** Thông báo chỉ nói "Hết buổi chiều — tóm tắt nhanh nhé?". Tóm tắt (N1) được sinh khi bạn mở app. Cách này không tốn lượt AI cho thông báo bạn bỏ qua, và không gửi nội dung học tập qua máy chủ Apple.
- **Giới hạn cần biết:**
  - Xóa app khỏi màn hình chính là mất đăng ký nhận thông báo.
  - Chế độ Tập trung (Focus) vẫn có thể chặn.
  - Không có "push im lặng" để chạy nền.
  - Thông báo có thể trễ vài phút.

## 4. Các việc

### Task 1 — R4: Deploy (theo lựa chọn ở mục 2; mô tả cho A)
- **Owner tự làm:**
  - tạo project Supabase (vùng Singapore) và project Vercel;
  - nhập biến môi trường;
  - đăng nhập lần đầu.
  Agent không nhập mật khẩu hay khóa.
- **Agent:**
  - viết `docs/deploy.md` từng bước;
  - chạy `drizzle` migrate lên Supabase (gồm 0003–0005);
  - script chuyển dữ liệu từ `.pglite` lên Supabase (đọc bản sao, ghi qua `DATABASE_URL`, có `--dry-run`, cuối script gọi `process.exit`);
  - kiểm tra `verify:rls`.
- **Tiêu chí:**
  - mở được app trên iPhone qua HTTPS;
  - thêm được vào màn hình chính;
  - đăng nhập được;
  - dữ liệu 14 mục còn nguyên;
  - chạy checklist 17 tiêu chí.

### Task 2 — N3a: Hạ tầng push
- Khóa VAPID tạo bằng script, lưu ở biến môi trường (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`), không commit.
- `public/sw.js`:
  - `push` → `showNotification(title, { body, data: { url } })`;
  - `notificationclick` → mở hoặc focus đúng URL.
  - Đăng ký service worker trong layout client, chỉ trên HTTPS.
- Bảng `push_subscriptions` (endpoint unique, keys, user agent, created_at, last_success_at, failed_count). Bảng phải có RLS và nằm trong `TABLES`.
- Thêm mục "Thông báo" trong Settings:
  - nút "Bật thông báo" (gọi `Notification.requestPermission()` trong click handler);
  - nút "Gửi thử";
  - danh sách thiết bị kèm nút gỡ.
  - Trên Safari chưa cài app: hiện hướng dẫn "Chia sẻ → Thêm vào màn hình chính".
- `src/server/push/send.ts` dùng thư viện `web-push`:
  - trả về 404/410 → xóa subscription;
  - lỗi khác → tăng `failed_count`.
- **Tiêu chí:**
  - "Gửi thử" tới iPhone trong vòng 1 phút;
  - bấm vào mở app;
  - unit test cho send (giả lập `web-push`).
  - e2e chỉ kiểm tra giao diện Settings (Playwright không nhận push thật).

### Task 3 — N3b: Gửi theo giờ
- Route `POST /api/cron/tick` kiểm `Authorization: Bearer ${CRON_SECRET}`, không cần phiên đăng nhập.
- Nguồn gọi route:
  - Supabase `pg_cron` mỗi 5 phút gọi qua `pg_net` (lựa chọn A);
  - hoặc cron hệ thống (lựa chọn B).
- Mỗi lần tick, xét lần lượt:
  1. hết buổi có hoạt động → thông báo check-in (N1);
  2. 20:00 Chủ nhật → tổng kết tuần (N2);
  3. 07:30 → định hướng ngày (M5);
  4. nhắc việc đến hạn (Task 4).
- Bảng `notification_log` (kind, key như `checkin:2026-11-27:afternoon`, sent_at, unique trên key) để không gửi trùng khi tick chạy hai lần.
- Settings: bật/tắt từng loại và giờ yên lặng (mặc định 23:00–07:00). Dùng `x-e2e-now` để test giờ.
- **Tiêu chí:**
  - đúng giờ thì có đúng một thông báo;
  - tắt loại nào thì loại đó im;
  - giờ yên lặng thì không gửi;
  - tick gọi lặp không gửi lại.

### Task 4 — N4: "Nhắc tôi … khi đến tối"
- Hành động đề xuất mới `create_reminder { text, remindAt (ISO), areaId? }`, qua thẻ duyệt như mọi thay đổi khác.
- Prompt hiểu cách nói giờ: "tối nay" = 20:00, "sáng mai" = 07:30, "chiều" = 15:00, giờ cụ thể. Dùng `now`, không tự tính ngày ngoài dữ liệu.
- Bảng `reminders` (text, remind_at, area_id, status pending/sent/dismissed). Tick gửi khi `remind_at <= now`.
- Màn Chat hiện thẻ "Nhắc việc" khi mở từ thông báo, có hai nút: "Xong" và "Nhắc lại sau 1 giờ".
- Khi chưa có push (localhost), thẻ nhắc vẫn hiện lúc mở app sau giờ hẹn. Như vậy N4 dùng được ngay cả trước Task 2.
- **Tiêu chí:** ca `ai:eval` "Nhắc tôi chốt nguồn tài liệu khi đến tối" phải ra `create_reminder` hôm nay 20:00; duyệt xong thì đến giờ có thông báo.

### Thứ tự
- **N4** (phần trong app) làm được ngay, không cần deploy.
- **R4 → N3a → N3b** nối tiếp nhau.
- Cách **ICS** (link lịch cho ứng dụng Calendar, mục cũ số 2 trong `TODO.md`) là phương án bổ sung rẻ cho ngày thi và hạn nộp. Có thể làm sau N3.
