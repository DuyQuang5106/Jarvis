# Danh sách nghiệm thu V1 (Acceptance Checklist)

| # | Tiêu chí (Spec mục 11) | Kiểm chứng tự động | Bước kiểm tra tay của owner | Đạt |
|---|---|---|---|---|
| 1 | Chỉ tài khoản owner đăng nhập được. Khi chưa đăng nhập, mọi trang chuyển về màn đăng nhập và mọi API trả 401; không thể tự đăng ký tài khoản mới. | `owner.test.ts`, `auth.test.ts`, `config.test.ts`, `e2e/auth-gate.supabase.spec.ts` | Đăng nhập trên bản deploy; thử đăng ký mới bị chặn. | |
| 2 | Chỉ có hai screen chính Chat và Context; Context có đúng hai tab Academic / Projects. | `e2e/shell.spec.ts` | — | |
| 3 | Thêm/sửa môn, chủ đề, assessment, task, project, milestone, blocker, note từ UI mà không gọi AI; mỗi thay đổi sinh đúng một log. | `entities.test.ts`, `areas.test.ts`, `e2e/context-*.spec.ts` | — | |
| 4 | Khởi tạo được seed data đã được owner duyệt; không tự điền điểm hoặc trạng thái không biết. | `import-seed.test.ts`, `e2e/onboarding.spec.ts` | — | |
| 5 | Nhắn “Mobile Programming đang ở tình trạng nào?” → trả về đúng state/last_updated từ DB. | `context-builder.test.ts`, `e2e/chat.spec.ts` | Hỏi thật với Fosta trên bản deploy. | |
| 6 | Thay đổi topic status bằng UI → mở chat mới vẫn đọc trạng thái mới. | `e2e/chat.spec.ts` | — | |
| 7 | Nhắn “Tôi đã hoàn thành chương 1 Mobile” → AI đề xuất thay đổi; không ghi trước khi approve. | `run-turn.proposals.test.ts`, `e2e/proposal.spec.ts` | Thử thật với Fosta trên bản deploy. | |
| 8 | Duyệt cập nhật → dữ liệu thay đổi đúng một lần (kể cả khi bấm Approve hai lần), log thể hiện thời gian và nguồn; từ chối → không thay đổi. | `resolve.test.ts`, `e2e/proposal.spec.ts` | — | |
| 9 | Nhắn “Tuần này có gì đáng lo?” → chỉ ra các vấn đề có bằng chứng, dữ liệu thiếu phải nêu thiếu. | `snapshot.test.ts`, `context-builder.test.ts` | Hỏi thật với Fosta trên bản deploy. | |
| 10 | Fosta lỗi hoặc tool calling không được hỗ trợ → UI không bị hỏng; không ghi dữ liệu sai; có thông báo lỗi rõ ràng. | `run-turn.test.ts`, `run-turn.proposals.test.ts`, `extract-note.test.ts`, `e2e/chat.spec.ts`, `e2e/proposal.spec.ts` | — | |
| 11 | Không có API key AI hay `DATABASE_URL` trong bundle frontend, log hoặc repo. | `e2e/bundle-secrets.spec.ts` | Xem lại biến môi trường trên Vercel. | |
| 12 | Có `README.md`, `.env.example`, schema migration, lệnh seed, lệnh chạy local, lệnh test; có unit tests cho context builder và approval flow, cùng một end-to-end test cho cập nhật từ chat. Toàn bộ test chạy với mock provider, không cần mạng. | `pnpm test && pnpm test:e2e` xanh | — | |
| 13 | Gọi Data API của Supabase bằng anon key (không đăng nhập) tới bất kỳ bảng nào → không trả về dòng dữ liệu nào. | `schema.test.ts` (RLS bật trên mọi bảng) | Chạy `pnpm verify:rls` trên Supabase thật. | |
| 14 | Sửa một bản ghi bằng UI sau khi AI đã đề xuất thay đổi nó, rồi bấm Approve → hệ thống báo xung đột, không ghi đè mù. | `resolve.test.ts`, `e2e/proposal.spec.ts` | — | |
| 15 | Task có due date là hôm nay (giờ Việt Nam) hiển thị đúng “hôm nay” lúc 00:30 và 23:30; bản ghi có `ai_excluded` không xuất hiện trong payload gửi provider. | `dates.test.ts`, `snapshot.test.ts`, `context-builder.test.ts` | — | |
| 16 | Trên iPhone: `Add to Home Screen` mở app toàn màn hình, không có thanh địa chỉ Safari; đăng nhập một lần trong app đó và phiên vẫn còn sau khi đóng mở lại; chạm vào ô nhập không làm trang tự zoom; composer không bị bàn phím che; ghi một quick capture và duyệt một thẻ đề xuất đều làm được bằng một tay. | `e2e/*.spec.ts` project `iphone` | Thử trên iPhone thật với bản deploy. | |
| 17 | Nút export tải về một file JSON chứa đủ mọi bảng nghiệp vụ và trường `schema_version`. | `export.test.ts` | Tải file export và mở thử. | |

## Sau 2 tuần sử dụng

V1 thành công nếu:
- **(a)** Xem mọi môn và dự án ở một chỗ.
- **(b)** Ghi nhận thay đổi trong dưới một phút với một note hoặc một lần chat.
- **(c)** Hỏi một câu ngắn và nhận đề xuất phù hợp với state mới nhất.
- **(d)** Không phải nhắc lại những việc đã cập nhật.
- **(e)** Phân biệt thông tin xác thực với suy luận của AI.
- **(f)** Cuối tuần thứ hai, phần lớn item active có `last_updated` trong vòng 7 ngày.
