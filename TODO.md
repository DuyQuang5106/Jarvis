# TODO — để phát triển sau

**Trạng thái dự án lúc cập nhật (26/11/2026):** Phase 0–3, Phase A, Phase B và Phase C0–C3 đã merge vào `main` (391 unit test xanh). Dùng thử với dữ liệu 9 môn HUST cho thấy Chat **chưa đạt**: trả lời "chưa xác định", chậm và bị cắt. Nguyên nhân đã đo được và lộ trình sửa nằm ở mục **"Điểm nghẽn và lộ trình"** ngay dưới đây; đó là ưu tiên số 1, trước mọi mục khác trong file.

**Quy ước:** Ưu tiên `P0` = bắt buộc để workstream dùng được; `P1` = nên có trong cùng đợt; `P2` = làm sau được.

---

## Hàng đợi — thứ tự làm (xếp lại 28/11/2026, owner sửa thứ tự ở đây)

Mọi việc chưa xong, gom về một chỗ. Chi tiết và tiêu chí của từng mục nằm ở bảng của đợt tương ứng bên dưới. Cỡ: S ≈ nửa ngày, M ≈ 1–2 ngày, L ≈ 3 ngày trở lên.

| # | Mục | Việc | Vì sao đặt ở đây | Cỡ | Phụ thuộc |
|---|---|---|---|---|---|
| 1 | V1 | Chế độ Context + Chat trên laptop: 50:50, Context trái, Chat phải, thanh bên tự ẩn | Dùng hằng ngày, nhỏ, owner vừa yêu cầu | S | — |
| 2 | P1 | Chỉ số trạng thái: Bao phủ, Thành thạo, Sức khỏe, task đếm được, Thay đổi tuần này | Bắt buộc phải có (P0); là nền cho màn Context mới | M | — |
| 3 | P2 | Màn Context ba tầng theo mockup đã duyệt (laptop và iPhone) | Biến P1 thành thứ nhìn thấy được | M | P1 |
| 4 | L0 | Giữ vĩnh viễn phiên bản trước mỗi lần nén của tổng kết tuần | Mất rồi không lấy lại được; việc nhỏ | S | — |
| 5 | N3a | Hạ tầng thông báo iPhone: bật thông báo, nút gửi thử | Owner muốn có thông báo; nền cho N3b và N4 | M | — |
| 6 | N4 | Nhắc việc từ chat ("nhắc tôi 8h tối mai…") qua thẻ duyệt | Dùng được ngay khi có N3a | M | N3a |
| 7 | N3b | Thông báo theo lịch: cuối buổi (check-in), tối Chủ nhật (tổng kết), hạn sắp tới | Jarvis tự "gõ cửa" khi bạn quên mở app | M | N3a |
| 8 | H1 + H2 | Mỗi môn một ô chat; lịch sử gửi AI theo thời gian | Hợp với V1: mở môn nào bên trái thì chat bên phải theo môn đó | L | P2 |
| 9 | U1 + U2 | Phần còn lại của giao diện điện thoại (Chat, Cài đặt, điều hướng tab dưới) | Màn Context điện thoại đã nằm trong P2 | L | P2, H1 |
| 10 | M2 | Cờ dự kiến/chính thức cho lịch thi (thay cho chữ "(dự kiến)" trong tên) | Nhỏ, chèn vào lúc nào cũng được | S | — |
| 11 | R4 | Chạy checklist 17 tiêu chí trên iPhone thật | Việc của owner, lúc nào cũng được | S | — |
| 12 | R1 | AI tự đọc thêm tài liệu khi ngữ cảnh thiếu (tối đa 3 vòng) | Cải thiện chất lượng trả lời | M | — |
| 13 | R2 | Kỹ năng: đánh giá tiến độ ôn thi, lập kế hoạch tuần | Dùng chỉ số P1 | M | R1, P1 |
| 14 | H3 | Nhiều chủ đề trong một ô chat | Chỉ làm nếu H1–H2 chưa đủ | M | H2 |
| 15 | R3 | AI sắp xếp thư mục có duyệt | Ít cần với một người dùng | M | — |
| 16 | L1–L4 | Trí nhớ dài hạn: kho ký ức, tự nhớ lại, trích nguồn, hiểu thói quen | Xa; cần L0 và R1 trước | L | L0, R1 |

Việc lặt vặt còn treo: case `ai:eval` cho thẻ định hướng hằng ngày (M5); dữ liệu môn Tư tưởng còn topic "Soạn đề cương ôn tập" tạo sai trước bản sửa 27/11 (owner xóa tay rồi nhờ Jarvis tạo lại thành task).

---

## Điểm nghẽn và lộ trình (26/11/2026)

### Điểm nghẽn, xếp theo mức ảnh hưởng (đo trên bản sao dữ liệu thật)

1. **AI không được đưa đúng nội dung.** Hỏi "algebra đang học đến đâu rồi" thì context có 9 tài liệu nhưng không có `04_STATE.md`; 6 tài liệu lõi mỗi cái chỉ đóng góp ~170 ký tự là khối YAML đầu file. Hỏi "Hôm nay nên làm gì?" thì context kéo đoạn quiz PDF ngẫu nhiên. Một phần ba ngân sách (11 trên 31 nghìn ký tự) là log của lượt import.
2. **Model và cấu hình làm chậm và cắt câu trả lời.** `gpt-6.2-sol` mất 44 giây mới ra chữ đầu tiên; `claude-sonnet-5` mất 5 giây. Giới hạn đầu ra 1.500 token, không báo khi bị cắt, không có trạng thái chờ.
3. **Dữ liệu có cấu trúc trống hoàn toàn** (0 topic, 0 assessment, 0 task) trong khi mọi hiểu biết nằm trong 70 tài liệu (442 nghìn ký tự). Prompt cũ lại dạy AI coi bảng trống là "Confirmed: 0 topic". Không có cầu nối tài liệu → bản ghi, nên chưa thể vẽ tiến độ hay tóm tắt hằng ngày.
4. **Vòng "học từ người dùng" yếu.** Báo tiến độ chỉ sinh một dòng log; tài liệu trạng thái không được cập nhật, nên lần hỏi sau AI vẫn không biết. (Lỗi "đề xuất không hợp lệ" đã hết sau commit alias ID ngày 24/11: tái hiện lại với cả hai model đều hợp lệ.)
5. **AI chỉ có một lượt, không tự đọc thêm được** khi context ban đầu thiếu (B3/D2).
6. **Không có bộ đánh giá bằng câu hỏi thật.** 391 test xanh chỉ kiểm cơ chế với AI giả lập, nên chất lượng câu trả lời tụt mà không test nào báo.
7. **Chưa có lớp chủ động:** không tóm tắt hằng ngày, không hiển thị tiến độ.

### Đợt 1 — Chat đúng, nhanh, không cụt (P0, xong 26/11/2026)

Kế hoạch chi tiết: `docs/superpowers/plans/2026-11-26-dot-1-chat-quality.md`. Gộp và thay các mục **D0, D5, D6** bên dưới.

| Mục | Nội dung | Tiêu chí chấp nhận | Trạng thái |
|---|---|---|---|
| Q1 | Bỏ YAML frontmatter, đọc loại tài liệu | Không đoạn nào gửi cho AI chứa `document_type:` | Done |
| Q2 | Context v2: nạp trọn tài liệu lõi theo ưu tiên, ngân sách 120 nghìn ký tự, bỏ log import | Hỏi về Algebra thì `04_STATE.md` đứng đầu và vào trọn; câu hỏi tổng thể có tài liệu trạng thái của từng môn | Done |
| Q3 | Prompt v2: trả lời thẳng, dựa tài liệu, không lộ tên trường nội bộ | Câu trả lời không còn `status_unknown`, `no_topics`; bảng trống không bị coi là bằng chứng | Done |
| Q4 | Giới hạn đầu ra 4.000 token (cấu hình được), báo khi bị cắt, trạng thái "Đang đọc N tài liệu…", log thời gian | Không còn câu trả lời cụt không lời giải thích | Done |
| Q5 | Chỉ đề xuất khi người dùng báo hoặc ra lệnh; nêu lý do khi bỏ đề xuất | Hỏi thuần không sinh thẻ duyệt; mỗi lần bỏ đề xuất có lý do đọc được | Done |
| Q6 | `pnpm ai:eval`: 6 câu hỏi thật chạy trên bản sao dữ liệu | Đạt 6/6; chữ đầu tiên dưới 20 giây | Done |
| Q7 | Chọn model mặc định theo số đo của Q6 | `.env.local` và README ghi model được chọn kèm số đo | Done |

**Kết quả đo (26/11/2026, 6 câu hỏi thật trên bản sao dữ liệu, `docs/ai-eval-report.md`):**

| Model | Case đạt | Chữ đầu tiên | Tổng thời gian |
|---|---|---|---|
| `claude-sonnet-5` (đã chọn làm mặc định) | 6/6 | 5–16 giây | 6–19 giây |
| `gpt-6.2-sol` | 5/6 (một case quá 20 giây) | 20–65 giây | 23–84 giây |

Sửa thêm ngoài kế hoạch: đề xuất gồm nhiều thay đổi không còn bị bỏ cả gói khi một thay đổi sai; phần hợp lệ được giữ và câu trả lời ghi rõ đã bỏ bao nhiêu.

### Đợt 2 — Trí nhớ có cấu trúc, tóm tắt hằng ngày, tiến độ trực quan (P0, sau Đợt 1)

| Mục | Nội dung | Phụ thuộc | Tiêu chí chấp nhận | Trạng thái |
|---|---|---|---|---|
| M1 | **Cầu nối tài liệu → bản ghi** (thay D4): AI đọc tài liệu trạng thái, lịch và đề cương của một môn rồi đề xuất tạo topic (kèm trạng thái), lịch thi dự kiến và việc tiếp theo; người dùng duyệt theo lô | Đợt 1 | Sau khi duyệt, mỗi môn có topic và ít nhất một mốc đánh giá (ghi rõ "dự kiến" nếu chưa chính thức); không tạo gì khi chưa duyệt | Done (26/11/2026: nút "Tạo từ tài liệu"/"Cập nhật từ tài liệu" trong Context mở Chat theo đúng môn và gửi lệnh mẫu qua cơ chế đề xuất sẵn có; unit test và e2e `from-documents.spec.ts` với AI giả lập đạt trên desktop và iPhone — không ghi gì trước khi duyệt, duyệt xong có topic và mốc "(dự kiến)"; chưa kiểm tra với model thật trên tài liệu thật) Đã thử với `claude-sonnet-5` trên bản sao dữ liệu thật (case `from-documents` trong `ai:eval`): Algebra ra 5 topic, 1 mốc thi dự kiến, 3 task. |
| M2 | **Lịch thi dự kiến** (D1): thêm cờ dự kiến/chính thức cho assessment và ngày bắt đầu học kỳ | M1 | Giao diện và AI luôn phân biệt "dự kiến" với "chính thức" | Not Started |
| M3 | **Báo tiến độ cập nhật cả tài liệu trạng thái** (yêu cầu "gợi ý cập nhật tài liệu từ prompt"): khi người dùng báo tiến độ, đề xuất gồm cập nhật topic, thêm dòng vào mục tiến độ của tài liệu trạng thái, và log | Đợt 1 | Báo "Algebra học tới đầu chương 5" → duyệt → hỏi lại ở cuộc chat mới, AI trả lời đúng chương 5 | Done (26/11/2026: case `report-progress` + `recall-after-report` trong `ai:eval` đạt với `claude-sonnet-5`) |
| M4 | **Gợi ý cập nhật tài liệu dự án từ hội thoại**: cuối mỗi lượt có thông tin mới mà chưa được ghi (quyết định, blocker, kết quả thử nghiệm), AI chủ động đề xuất ghi vào đúng tài liệu của dự án, có diff để duyệt | M3 | Kể một quyết định kỹ thuật trong chat → có thẻ đề xuất sửa tài liệu dự án tương ứng; chỉ hỏi thì không có | Done (26/11/2026: `reportsNewInformation` nhận diện câu kể quyết định/kết quả/vướng mắc/thông báo, câu hỏi cùng từ khóa vẫn không có đề xuất (unit test 15 câu kể, 13 câu hỏi); luật prompt ghi vào đúng mục có thật của 04_STATE/05_LOG hoặc tạo `STATE.md` cho mục chưa có tài liệu; mock `MOCK_DECISION`; e2e `doc-update-suggestion.spec.ts` đạt trên desktop và iPhone — dự án chưa có tài liệu → thẻ `create_document` có diff, chưa ghi gì trước khi duyệt, duyệt xong `STATE.md` hiện trong Context; câu hỏi thuần không có thẻ. `ai:eval` với `claude-sonnet-5` trên bản sao dữ liệu thật: `project-decision` đạt (create_document STATE.md, chữ đầu ~7,1 s), `course-announcement` đạt (append_to_document vào 04_STATE mục có thật + 06_TIMELINE + add_progress_log, ~8,7 s), `project-question` đạt (không đề xuất, ~3,3 s)) |
| M5 | **Tóm tắt định hướng hằng ngày**: lần mở app đầu tiên trong ngày sinh một thẻ ngắn ở đầu màn Chat gồm 3 việc nên làm hôm nay (kèm lý do), hạn sắp tới, mục lâu chưa cập nhật; có nút "Làm mới" và "Bắt đầu việc 1". Lưu theo ngày, không cần cron | M1, Đợt 1 | Thẻ xuất hiện đúng một lần mỗi ngày, đọc trong dưới 30 giây, mọi việc nêu ra đều truy được về dữ liệu; có e2e với AI giả lập và một case trong `ai:eval` | Done (26/11/2026: unit test và e2e `daily-brief.spec.ts` với AI giả lập đạt trên desktop và iPhone — thẻ có 3 việc, tải lại không sinh lại, "Bắt đầu việc 1" gửi tin nhắn; chưa thêm case vào `ai:eval` và chưa đo với model thật) |
| M6 | **Tiến độ trực quan trong Context**: mỗi môn/dự án có thanh tiến độ (số topic đã vững trên tổng, luôn kèm mẫu số), đếm ngược tới mốc đánh giá gần nhất, ngày cập nhật cuối; trang tổng quan xếp các môn theo mức cần chú ý | M1 | Nhìn danh sách là biết môn nào chậm; không hiển thị phần trăm khi chưa có topic (hiện lời mời chạy M1) | Done (26/11/2026: thanh tiến độ kèm "x/y topic vững", đếm ngược mốc gần nhất, "Cập nhật n ngày trước" và sắp xếp "Cần chú ý" ở danh sách và trong màn của từng môn; unit test hàm sắp xếp/đếm ngày và e2e đạt trên desktop và iPhone, không có phần trăm hay thanh khi chưa có topic; chưa kiểm tra với dữ liệu thật sau khi chạy M1 bằng model thật) |

### Đợt 2b — Nhịp ngày và tuần (P1, ý tưởng 26/11/2026, chưa làm)

Mục tiêu: Jarvis tự hỏi và tự tổng kết theo nhịp sống, để dữ liệu được cập nhật kể cả khi bạn quên báo. Mọi thay đổi vẫn đi qua thẻ duyệt như hiện nay.

**Ràng buộc kỹ thuật cần biết trước:** một web app không tự bật lên đúng giờ. Muốn Jarvis "gõ cửa" lúc 11h hay 18h phải có Web Push (iOS 16.4+, app đã thêm vào màn hình chính) và một job chạy định kỳ trên server (Vercel Cron), tức là phải deploy trước. Vì vậy chia hai bước: bước 1 hỏi khi bạn mở app (làm được ngay trên localhost), bước 2 mới thêm thông báo đúng giờ.

| Mục | Nội dung | Phụ thuộc | Tiêu chí chấp nhận | Trạng thái |
|---|---|---|---|---|
| N1 | **Check-in theo buổi (khi mở app)**: ngày chia 4 buổi theo giờ Việt Nam: sáng 06–11, trưa 11–13, chiều 13–18, tối 18–23 (chỉnh được trong Settings). Lần mở app đầu tiên sau khi một buổi kết thúc, đầu màn Chat hiện thẻ cho buổi vừa qua. **Nếu trong buổi đó bạn đã tương tác** (tin nhắn, log tiến độ, sửa tài liệu, duyệt đề xuất): thẻ tóm tắt việc đã làm và hỏi "Ghi lại như vậy nhé?", bấm là ra đề xuất cập nhật (log + tài liệu trạng thái, đường M3). **Nếu chưa tương tác**: thẻ hỏi ngắn "Buổi sáng bạn đã làm gì?" kèm vài gợi ý từ thẻ định hướng hôm đó; trả lời đi qua Chat như báo tiến độ. Bỏ qua được, không hỏi lại buổi đã bỏ. Nhiều buổi bị lỡ thì gộp thành một thẻ | M3, M5 | Mỗi buổi tối đa một thẻ; buổi có tương tác thì tóm tắt chỉ nêu việc truy được về dữ liệu của buổi đó; buổi không tương tác thì không gọi AI (chỉ hiện câu hỏi); unit test chia buổi theo múi giờ; e2e với AI giả lập | Done (26/11/2026: `src/lib/day-slots.ts` chia buổi theo giờ VN, chỉnh và bật/tắt được trong Settings (lưu ở `preferences_json`, giờ chồng lấn bị từ chối); bảng `checkins` (migration `0004_overrated_scarlet_witch`), mỗi buổi một dòng, buổi đã xử lý không hiện lại, các buổi lỡ trong 24 giờ gộp thành một thẻ; buổi có hoạt động (tin nhắn, log tiến độ, tài liệu sửa, đề xuất đã duyệt) thì một lượt AI không tool qua `GET /api/checkin` chỉ với danh sách hoạt động và tên mục, tóm tắt lưu tạm để mở lại không sinh lại, "Ghi lại" gửi tin nhắn qua Chat và ra thẻ đề xuất; buổi không hoạt động thì không gọi AI, chỉ hỏi kèm gợi ý từ thẻ định hướng. 43 unit test mới (591 tổng); e2e `checkin.spec.ts` đạt trên desktop và iPhone (giờ server giả bằng header `x-e2e-now`, chỉ có hiệu lực khi E2E=1). Thử với `claude-sonnet-5` trên bản sao dữ liệu thật: buổi sáng có 3 tin nhắn và 1 log tiến độ → 3 dòng tóm tắt đều truy được về hoạt động đã chèn, ~15,8 giây; buổi không hoạt động không gọi provider) |
| N2 | **Tổng kết tuần và nén context dài hạn**: lần mở app đầu tiên từ tối Chủ nhật (hoặc bấm tay), AI đọc log, check-in, tin nhắn và thay đổi tài liệu trong tuần rồi sinh: (1) bản tổng kết tuần (đã xong gì từng môn/dự án, so với kế hoạch, việc trôi, đề xuất trọng tâm tuần sau), lưu thành tài liệu `Tuần <số>` trong một thư mục tổng kết; (2) đề xuất cập nhật tài liệu trạng thái của từng môn bằng `replace_section` (nén các dòng tiến độ lẻ trong tuần thành một đoạn cô đọng), có diff để duyệt từng mục. Bản cũ vẫn khôi phục được qua lịch sử phiên bản | M4, N1 | Duyệt xong, tài liệu trạng thái ngắn lại mà không mất thông tin (case `ai:eval`: hỏi lại tiến độ sau khi nén vẫn đúng); không ghi gì khi chưa duyệt; mỗi tuần một bản tổng kết | Done (26/11/2026: tuần thứ Hai–Chủ nhật theo giờ VN (`src/lib/weeks.ts`), tuần hiện tại được mời từ Chủ nhật 18:00, tuần trước còn được mời cả tuần sau nếu chưa tổng kết và có hoạt động; bảng `weekly_reviews` (migration `0005_friendly_quasar`), mỗi tuần một bản, tạo lại có chủ ý thì thay bản cũ; `POST /api/weekly-review` chạy `runChatTurn` ở chế độ `weeklyReview` (scope all + khối `<week_activity>`: log theo mục, check-in, tối đa 60 tin nhắn, tài liệu sửa, dòng tiến độ có ngày trong 04_STATE/05_LOG, danh sách mục nên nén; 6000 token; chỉ giữ `replace_section`, tối đa 8) nên tái dùng alias, lưu đề xuất và thông báo; bản tổng kết nằm trong cuộc chat "Tổng kết tuần 23/11–29/11" (không phải tài liệu `Tuần <số>` như mô tả gốc), thẻ ở đầu Chat mới tự sinh, hiện ý chính và "Mở tổng kết và duyệt", có liên kết "Tổng kết tuần này" và bật/tắt trong Settings; duyệt `replace_section` tạo phiên bản, bản cũ khôi phục được. 21 unit test mới (612 tổng); e2e `weekly-review.spec.ts` đạt trên desktop và iPhone. `claude-sonnet-5` trên bản sao: report-progress → weekly-review (2 `replace_section`, duyệt) → recall-after-weekly đều đạt (12,7 / 35,7 / 11,4 giây); `04_STATE.md` của Algebra 5.832 ký tự → 5.913 sau report-progress → 5.294 sau khi duyệt nén, vẫn trả lời đúng chương 6) |
| N3 | **Thông báo đúng giờ trên iPhone (Web Push)**: cuối mỗi buổi và tối Chủ nhật gửi thông báo mở thẳng thẻ N1/N2; tắt được từng loại, có giờ yên lặng | N1, N2, R4 (deploy) | Thông báo tới đúng giờ trên iPhone đã cài PWA; bấm vào mở đúng thẻ; tắt là hết | Not Started |
| N4 | **Nhắc việc từ chat** ("nhắc tôi … khi đến tối"): hành động `create_reminder` qua thẻ duyệt, bảng `reminders`, thẻ nhắc khi mở app; có push thì gửi thông báo đúng giờ | M3 (thẻ duyệt); push qua N3 | Ca eval ra `create_reminder` đúng giờ; duyệt xong đến giờ có nhắc | Not Started |

**Độ khó ước lượng:** N1 trung bình (tái dùng khung thẻ định hướng M5: bảng lưu theo ngày, sinh khi mở app). N2 trung bình–cao (đọc khối lượng lớn, rủi ro nén làm mất ý, cần eval). N3 cao (service worker, khóa VAPID, bảng subscription, cron; xem phân tích ở mục cũ số 2).

**Thứ tự khuyến nghị:** M4 → N1 → N2, rồi deploy (R4) → N3. M2 làm xen kẽ bất kỳ lúc nào.

### Đợt 2c — Mỗi môn/đầu việc một ô chat (P1, quyết định 27/11/2026, chưa làm)

Lý do: lịch sử hiện là danh sách cuộc chat đặt tên theo câu đầu tiên ("alo", "hôm nay thứ 3 được ng…"), mở lại gần như không dùng được. Trí nhớ thật của Jarvis nằm ở tài liệu và log (đã có thẻ duyệt), nên cuộc chat chỉ cần là **nơi làm việc theo chủ đề**, không cần là kho lưu trữ. Mỗi lượt AI chỉ đọc 10 tin gần nhất, nên một ô chat dài mãi không làm tăng chi phí.

Đánh giá: nên làm. Ngữ cảnh tự đúng môn (không cần đoán môn từ câu hỏi), báo tiến độ ở ô Algebra thì đề xuất rơi vào Algebra, mở app là thấy ngay cuộc trao đổi gần nhất của từng môn. Rủi ro và cách xử lý:
- Câu hỏi chung ("hôm nay nên làm gì", thẻ định hướng, check-in, tổng kết tuần) không thuộc môn nào → có thêm một ô **Chung**, giữ cách chọn ngữ cảnh tự động như hiện nay.
- Báo tiến độ nhầm ô, hoặc một câu nhắc hai môn → ô môn chỉ là ưu tiên ngữ cảnh, đề xuất vẫn được ghi sang môn khác nếu tin nhắn nói rõ.
- Tin cũ trong ô (từ hôm trước) làm AI hiểu sai "hôm nay" → lịch sử gửi AI chỉ lấy tin trong một khoảng gần (ví dụ 24 giờ hoặc từ dấu "Bắt đầu chủ đề mới"), giao diện vẫn cuộn xem được tất cả.
- Ô chat rất dài tải chậm trên iPhone → tải 50 tin cuối, cuộn lên tải thêm.
- Cần nhiều hơn một ô cho một môn → bước sau: nút "Chủ đề mới" tạo dấu phân cách trong cùng ô; tách thành nhiều ô chỉ khi thực sự cần.

| Mục | Nội dung | Phụ thuộc | Tiêu chí chấp nhận | Trạng thái |
|---|---|---|---|---|
| H1 | **Ô chat theo mục**: cột `area_id` (nullable) và `kind` (`area` / `general` / `system`) cho `conversations` (migration chỉ thêm cột); mỗi mục đang mở có đúng một ô, tạo khi gửi tin đầu tiên; ô **Chung** cho câu hỏi tổng thể. Danh sách bên trái thay bằng: Chung, rồi các môn/dự án (xếp theo tin mới nhất, kèm dòng cuối và thời gian). Ô môn khóa ngữ cảnh vào môn đó (scope `item`) nhưng đề xuất vẫn được nhắm mục khác. Cuộc chat cũ chuyển vào mục **Lưu trữ** (không xóa); thẻ định hướng, check-in và tổng kết tuần chạy trong ô Chung | Đợt 2 | Gửi tin ở ô Algebra → tài liệu Algebra trong ngữ cảnh mà không cần nhắc tên môn; mở lại app thấy đúng ô và tin cũ; không mất cuộc chat cũ nào; e2e desktop và iPhone | Not Started |
| H2 | **Lịch sử gửi AI theo thời gian và dấu chủ đề**: chỉ tin trong 24 giờ gần nhất (tối đa 10) hoặc sau dấu "Chủ đề mới"; tải tin theo trang khi cuộn | H1 | Hỏi "hôm nay là ngày mấy" trong ô có tin của hôm trước vẫn đúng; ô 1.000 tin mở dưới 1 giây | Not Started |
| H3 | **Nhiều chủ đề trong một ô** (khi cần): nút "Chủ đề mới", tiêu đề chủ đề do AI đặt, nhảy nhanh giữa các chủ đề | H2 | Chỉ làm nếu dùng H1–H2 thấy một ô/môn không đủ | Not Started |

### Đợt 2d — Giao diện riêng cho điện thoại (P1) và tiến độ có công thức (P0, bắt buộc phải có), yêu cầu 27/11/2026, chưa làm

**Vì sao:** app chủ yếu dùng trên iPhone, nhưng giao diện hiện là bản laptop thu nhỏ: chật, nhiều thứ phải cuộn ngang hoặc bấm nhiều lớp. Tiến độ hiện chỉ có một kiểu (M6: số topic vững trên tổng, dự án đếm milestone), không phản ánh được cách bạn thực sự đo từng môn (ví dụ "10 buổi luyện bài tập", "hết chương 4", điểm bài kiểm tra).

**Đánh giá:**
- **Giao diện riêng cho điện thoại:** nên làm, và nên làm trước hoặc cùng lúc với H1 (mỗi môn một ô chat), vì H1 cũng thay cấu trúc điều hướng. Làm hai lần sẽ phí. Không cần viết app native: vẫn là PWA, chỉ đổi bố cục theo kích thước màn hình (cùng dữ liệu, cùng server).
- **Tiến độ có công thức:** tính năng cốt lõi, bắt buộc phải có (owner, 27/11/2026). Công thức phải là **dữ liệu có cấu trúc** (các thành phần có trọng số), không phải công thức tự do. App tính được, kiểm tra được, và AI chỉ đề xuất công thức hay cập nhật số liệu qua thẻ duyệt. Rủi ro là phức tạp hóa: bắt đầu với vài kiểu thành phần là đủ, thêm kiểu khi thực sự cần.

| Mục | Nội dung | Phụ thuộc | Tiêu chí chấp nhận | Trạng thái |
|---|---|---|---|---|
| U1 | **Khảo sát và thiết kế giao diện điện thoại**: liệt kê chỗ vướng trên iPhone (chụp màn hình từng trang), rồi chốt cấu trúc mobile: thanh tab dưới cùng (Hôm nay · Chat · Môn & dự án · Cài đặt), màn hình theo tầng (danh sách → chi tiết môn → tài liệu) thay vì nhiều cột, nút bấm ≥ 44 pt, ô nhập chat không bị bàn phím che, an toàn với notch/thanh home. Laptop giữ bố cục nhiều cột | H1 (thiết kế chung điều hướng) | Bản thiết kế (ảnh mẫu) được bạn duyệt trước khi code | Not Started |
| U2 | **Làm giao diện điện thoại theo U1** | U1 | Mọi việc thường ngày (chat, báo tiến độ, duyệt thẻ, xem môn, đọc tài liệu) làm được bằng một tay, không cuộn ngang; e2e iPhone cho từng trang; checklist `docs/acceptance-checklist.md` đạt trên iPhone thật | Not Started |
| P1 | **Chỉ số trạng thái tính từ dữ liệu sẵn có** (hướng 28/11/2026, xem `docs/context-2.md`). Nguyên tắc: không chỉ số nào bắt người dùng tự nhập; mọi số tính từ topic, task, milestone, lịch thi, điểm và log, hoặc từ điều kể trong chat (qua thẻ duyệt). (a) Môn học: **Bao phủ** = topic từ "làm quen" trở lên / tổng; **Thành thạo** = (vững ×1 + đã luyện ×0,5) / tổng, kèm điểm bài kiểm tra đã lưu làm bằng chứng. Dự án: milestone xong / tổng. Chưa có topic/milestone → "Chưa xác định", không hiện 0%. (b) **Sức khỏe** Đúng hướng / Có rủi ro / Lệch hướng / Chưa đủ dữ liệu: so số phần còn lại với số ngày tới mốc gần nhất và nhịp 14 ngày qua (topic lên mức, milestone xong, đọc từ log); quá hạn hoặc blocker mở → Lệch hướng; luôn kèm một câu lý do có số. (c) **Task đếm được**: cột tùy chọn `progress_done`/`progress_total` (migration chỉ thêm cột); AI đề xuất tăng số khi người dùng kể ("xong buổi 3"); task không đếm được vẫn là ô tick. (d) **Thay đổi tuần này**: số topic lên mức, task xong, mốc mới/đổi trong 7 ngày, từ log. (e) Quy tắc trọng số riêng từng môn (ví dụ 40% lý thuyết + 40% luyện bài + 20% điểm) giữ làm tùy chọn nâng cao, làm sau | M3 | Unit test từng chỉ số với dữ liệu mẫu (gồm ca thiếu dữ liệu, quá hạn, nhịp bằng 0); case `ai:eval` "xong buổi 3" → đề xuất tăng task 2/10 → 3/10; câu lý do sức khỏe khớp số liệu | Not Started |
| P2 | **Màn Context ba tầng** theo mockup đã duyệt (U1): (1) **Tổng quan** đọc trong 5 giây: Cần chú ý · Sắp tới hạn 7 ngày · Thay đổi tuần này, cùng thẻ "Nên làm gì bây giờ" lấy từ thẻ định hướng; không có % tổng cho mọi thứ. (2) **Thẻ môn/dự án**: nhãn sức khỏe + lý do, thanh hai lớp Bao phủ/Thành thạo (hoặc milestone), đếm ngược, việc tiếp theo; bấm để mở rộng tại chỗ: các chương (vạch màu theo mức) và task đang làm (task đếm được có thanh nhỏ). (3) **Không gian làm việc** của môn giữ như hiện nay | P1, U1 | Nhìn tổng quan 5 giây biết môn nào cần chú ý và vì sao; tìm được việc tiếp theo mà không mở trang khác; mọi con số truy được về dữ liệu; e2e desktop và iPhone | Not Started |

**Thứ tự khuyến nghị:** P1 (logic, có test) → U1 mockup Context + điện thoại để duyệt → P2 + U2 (+ H1) → (e) của P1. Màn Chat/Context cạnh nhau (laptop) và vuốt (iPhone) đã làm 27/11/2026.

### Đợt 2e — Chế độ Context + Chat trên laptop (P1, yêu cầu 28/11/2026)

Bản đầu (27/11/2026) đặt Chat bên trái, Context là khung nhỏ bên phải (42%), mở từ nút "Context bên cạnh" trong màn Chat. Owner muốn đảo lại: Context là phần quan sát chính, Chat là chỗ thao tác để chỉnh Context.

| Mục | Nội dung | Phụ thuộc | Tiêu chí chấp nhận | Trạng thái |
|---|---|---|---|---|
| V1 | **Context trái, Chat phải, chia 50:50**: đổi vị trí hai bên, mỗi bên một nửa chiều rộng; vẫn bật/tắt được và nhớ lựa chọn. **Thanh bên của app (Chat, Context, Recent chats) mặc định ẩn trong chế độ này**, hiện ra khi con trỏ tới gần mép trái (khoảng 16 px) và ẩn lại khi chuột rời đi; bàn phím vẫn mở được (Tab vào hoặc phím tắt) và có nút ghim để giữ nó mở. Duyệt thẻ trong Chat thì Context tự tải lại như bản đầu. Màn hình hẹp (dưới 1024 px) giữ cách cũ: một màn, vuốt để chuyển | — | Hai bên đúng 50:50 ở 1280 và 1920 px; thanh bên không chiếm chỗ cho tới khi chuột tới mép trái, không nhảy khi gõ chat; mở được bằng bàn phím; e2e desktop | Not Started |

### Đợt 3 — Trợ lý tự đào sâu và có kỹ năng (P1)

| Mục | Nội dung | Phụ thuộc | Trạng thái |
|---|---|---|---|
| R1 | Vòng lặp công cụ chỉ đọc (B3/D2): `list_area_documents`, `search_documents`, `read_document` tối đa 3 vòng, có trạng thái "Đang đọc …" | Đợt 1 | Not Started |
| R2 | Kỹ năng theo ngữ cảnh (C5/D3): đánh giá tiến độ ôn thi, lập kế hoạch tuần | R1, M2 | Not Started |
| R3 | AI sắp xếp thư mục có duyệt (C4) | Đợt 1 | Not Started |
| R4 | Deploy (Vercel + Supabase khuyến nghị, hoặc máy nhà; xem `docs/superpowers/plans/2026-11-27-deploy-and-push.md`) và chạy checklist 17 tiêu chí trên iPhone | Đợt 1 | Partially Done (27/11/2026: chạy trên Vercel `sin1` + Supabase Singapore, mỗi push lên `main` tự kiểm tra → migrate → build; app dùng Session pooler vì Transaction pooler treo. Còn: checklist 17 tiêu chí trên iPhone thật) |

---

### Đợt 4 — Trí nhớ dài hạn: nhớ lại việc đã làm từ lâu (P2, xa, ý tưởng 26/11/2026)

**Mục tiêu:** hỏi "hồi tháng 9 mình xử lý lỗi UART của StewieSAT thế nào?" hay "lần trước ôn Database mình yếu phần nào?" thì Jarvis nhớ lại được, kể cả khi tài liệu trạng thái đã được nén từ lâu.

**Ý tưởng cốt lõi:** tách hai thứ hiện đang lẫn vào nhau.
- *Bản tóm tắt sống* (`04_STATE`, được tổng kết tuần nén lại): gọn, dùng để trả lời câu hỏi hằng ngày.
- *Nhật ký gốc không bao giờ bị nén*: tin nhắn, log tiến độ, check-in, bản tổng kết tuần, mọi phiên bản tài liệu, có ngày và nguồn.

Khi gặp câu hỏi về quá khứ, AI chủ động truy vấn nhật ký gốc (tìm theo nghĩa và theo khoảng thời gian), đọc lại các mảnh liên quan, rồi **tái dựng** câu trả lời kèm ngày và nguồn, thay vì chỉ dựa vào bản tóm tắt.

| Mục | Nội dung | Phụ thuộc | Tiêu chí chấp nhận | Trạng thái |
|---|---|---|---|---|
| L0 | **Không làm mất nguồn gốc** (nên làm sớm hơn phần còn lại, vì mất rồi không lấy lại được): hiện mỗi tài liệu chỉ giữ 50 phiên bản (`MAX_VERSIONS_PER_DOC`). Phiên bản trước một lần nén (`replace_section` do tổng kết tuần) phải được giữ vĩnh viễn, hoặc chuyển nội dung bị nén vào kho lưu trữ | N2 | Sau một năm nén hằng tuần vẫn đọc lại được mọi dòng tiến độ gốc kèm ngày | Not Started |
| L1 | **Kho ký ức có chỉ mục**: gom các nguồn trên thành "mảnh ký ức" có ngày, mục, loại, đoạn văn gốc; tìm toàn văn tiếng Việt không dấu cộng tìm theo nghĩa (embedding, ví dụ `pgvector` trên Postgres) | L0 | Truy vấn theo nghĩa và khoảng thời gian trả về đúng mảnh trên bộ câu hỏi mẫu | Not Started |
| L2 | **AI tự truy vấn để nhớ lại**: công cụ chỉ đọc `recall(query, from?, to?, area?)` và `read_source(id)`, dùng chung vòng lặp công cụ của R1; AI tự quyết khi nào cần nhớ lại (câu hỏi có mốc thời gian quá khứ, "lần trước", "hồi đó"…) | R1, L1 | Case `ai:eval`: hỏi về việc đã bị nén khỏi `04_STATE` từ nhiều tuần trước vẫn trả lời đúng, kèm ngày | Not Started |
| L3 | **Tái dựng và trích nguồn**: câu trả lời về quá khứ ghi rõ "theo ghi chép ngày …", phân biệt điều nhớ chắc (có nguồn) với điều suy ra; mâu thuẫn giữa các thời điểm thì nói ra | L2 | Mọi khẳng định về quá khứ truy được về một mảnh ký ức; không bịa ngày | Not Started |
| L4 | **Trí nhớ về bản thân người dùng**: thói quen học, điểm mạnh/yếu lặp lại, cách thích được giúp; rút ra từ tổng kết tuần, lưu thành tài liệu riêng, người dùng duyệt và sửa được | N2, L1 | Thẻ định hướng và tổng kết tuần dùng được các điều này, và chỉ ra nguồn | Not Started |

**Ghi chú:** việc tìm theo nghĩa cần Postgres có `pgvector` (Supabase có sẵn; máy chủ ở nhà thì cài thêm) và một model embedding. Quyết định nơi deploy (Vercel + Supabase hay máy chủ ở nhà) nên chốt trước L1.

## Mục cũ (giữ nguyên)

### 1. Trạng thái `Active` hiện màu xanh — **Done** (commit `86c9253`)

- **Hiện tại:** mọi trạng thái dùng cùng một badge xám (`src/components/context/area-row.tsx:37`, `<Badge variant="secondary">`).
- **Việc cần làm:** thêm map màu theo trạng thái (ví dụ `active` xanh lá, `blocked` đỏ, `on_hold` vàng, `completed` xám nhạt), dùng chung cho danh sách và drawer. Màu phải đủ tương phản ở cả chế độ sáng và tối, và nhãn chữ vẫn giữ nguyên (không chỉ dựa vào màu).
- **Độ khó:** thấp, khoảng 30 phút kèm e2e.

### 2. Thông báo trên iPhone cho lịch học và các lịch khác

- **Ngoài phạm vi V1:** spec mục 2 loại trừ push notification, reminder tự động và cron jobs.
- **App chưa có dữ liệu lịch:** database hiện không có bảng lịch học hay lịch lặp lại, chỉ có hạn của task và ngày assessment.
- **Không đọc được lịch trên máy:** một web app (PWA) không thể đọc lịch có sẵn trong ứng dụng Calendar của iPhone. Nếu lịch đó đã có trong Calendar, iPhone đã tự nhắc rồi.
- **Hướng A — xuất lịch dạng ICS (khuyến nghị, độ khó thấp–trung bình):** app tạo một đường link lịch (`.ics`) riêng tư, gồm hạn task, ngày thi và (sau này) lịch học. Bạn thêm link đó vào Calendar trên iPhone một lần, iPhone tự đồng bộ và tự nhắc. Không cần push hay server chạy nền, chỉ cần một route trả về file ICS có token bí mật trong URL.
- **Hướng B — Web Push (độ khó cao):** iOS 16.4+ cho phép PWA đã thêm vào màn hình chính nhận push. Cần:
  - service worker và màn xin quyền thông báo;
  - khóa VAPID và bảng lưu push subscription;
  - một job chạy định kỳ (Vercel Cron hoặc Supabase `pg_cron`) để quyết định khi nào gửi;
  - bảng lịch học / lịch lặp lại mới.

  Push trên iOS cũng kém ổn định hơn nhắc của Calendar.

### 3. Tự động cập nhật dữ liệu theo prompt của tôi

> **Đã gộp vào kế hoạch:** cách hiểu (a) là Phase 3 đã lên kế hoạch; cách hiểu (b) được triển khai trong **Phase B** bên dưới (B5–B7). Giữ bảng phân tích để tham khảo.

| Cách hiểu | Độ khó | Ghi chú |
|---|---|---|
| **a. Cập nhật dữ liệu trong app** (trạng thái môn, topic, task, log) bằng một câu chat | Đã có kế hoạch | Đây chính là **Phase 3**: AI đề xuất thay đổi, bạn bấm duyệt, rồi mới ghi. Khoảng 6 task. |
| **b. AI sửa nội dung văn bản trong app** (ghi chú, course outline, mô tả môn) | Trung bình | → **Phase B** (B5–B7). |
| **c. Ghi thẳng, không cần duyệt** | Thấp về kỹ thuật, rủi ro cao | Trái nguyên tắc của spec ("không bao giờ ghi khi chưa duyệt"). Không lên kế hoạch. |
| **d. Cập nhật tài liệu bên ngoài** (Google Docs, Notion…) | Cao | Spec loại trừ đồng bộ Notion và Gmail. Không lên kế hoạch. |

---

## Workstream 1 — Phase A: Document-First Context Workspace

**Mục tiêu:** mỗi môn học và dự án trở thành một *Context Workspace* chứa không giới hạn tài liệu Markdown, thay cho bộ trường form cố định. Bản ghi có cấu trúc (task, hạn, milestone, blocker, topic, assessment, activity log) được giữ nguyên để truy vấn, lên lịch và tính toán.

**Hiện trạng liên quan (để tránh làm trùng):**
- **Trường form linh hoạt sẽ chuyển thành tài liệu:**
  - `areas.summary`, `areas.goal`;
  - `academic_details.grading_scheme`, `exam_format`, `course_outline`, `term`, `credits`, `target_grade`;
  - `project_details.role`, `collaborators`, `scope`, `cadence`.
- **Đã có một dạng "tài liệu" thô:** bảng `notes` (Markdown, autosave, cờ `ai_excluded`, chuỗi lưu tuần tự trong `notes-panel.tsx`, flush khi app vào nền). Phase A tái dùng mẫu autosave này thay vì viết lại.
- **Trường vận hành giữ nguyên dạng cấu trúc:** `areas.status`, `priority`, `start_date`, `deadline_date`, `next_action`, `ai_excluded`, `aliases`, `archived_at`. Snapshot và AI đang dùng các trường này.

### A0 — Chốt quyết định kiến trúc trước khi code
- **Mô tả:** viết một ghi chú quyết định (ADR) ngắn trong `docs/` chốt: định dạng lưu, thư viện editor, vị trí workspace trong UI, danh sách trường giữ cấu trúc, chính sách version và log. Cập nhật spec mục 2, 3.3 và 5 cho khớp.
- **Ưu tiên:** P0 · **Phụ thuộc:** không
- **Tiêu chí chấp nhận:**
  - Chốt Markdown (GFM) là định dạng lưu chuẩn; editor phải round-trip không mất heading, list, checklist, bảng, code block (có test round-trip).
  - Chọn editor sau khi thử nhanh hai phương án: WYSIWYG xuất Markdown (ví dụ Tiptap + markdown) hoặc editor Markdown có xem trước (ví dụ CodeMirror). Tiêu chí: round-trip, gõ tiếng Việt có dấu trên iOS, ô nhập ≥16px, kích thước bundle.
  - Chốt workspace nằm trong `/context` dưới dạng chế độ toàn màn hình (`/context?item=<id>&doc=<docId>`), vẫn chỉ hai đích điều hướng chính.
  - Spec được sửa ở các mục liên quan và được owner đồng ý.
- **Trạng thái:** Done (đã merge vào `main`)

### A1 — Schema và migration cho tài liệu
- **Mô tả:** thêm bảng `documents` và `document_versions`, kèm index tìm kiếm. Cập nhật `TABLES`, `ENTITY_TYPES` (thêm `document`), `ORIGINS` (thêm `migration`), RLS và export.
- **Ưu tiên:** P0 · **Phụ thuộc:** A0
- **Tiêu chí chấp nhận:**
  - `documents`: `id`, `area_id` (FK, cascade), `title` (1–200), `body_md`, `sort_order`, `template_key?`, `ai_excluded`, `revision` (int, tăng mỗi lần lưu), `search_text` (đã bỏ dấu, chữ thường), `search_tsv` (tsvector sinh tự động, index GIN), `deleted_at?` (xóa mềm), `created_at`, `updated_at`.
  - `document_versions`: `id`, `document_id` (FK), `revision`, `title`, `body_md`, `origin`, `batch_id?`, `created_at`.
  - Bật RLS, không policy; `pnpm verify:rls` và test schema phủ hai bảng mới.
  - `buildExport` tự có hai bảng mới qua `TABLES`; `schema_version` tăng lên 2.
  - Migration chạy được trên PGlite (test) và Supabase Postgres; có test tạo, sửa và xóa mềm.
- **Trạng thái:** Done (đã merge vào `main`)

### A2 — Service ghi tài liệu (theo luật kiến trúc 1–2)
- **Mô tả:** `documentService` trong `src/server/services/`: `create`, `rename`, `updateBody`, `reorder`, `softDelete`, `restore`, `restoreVersion`. Mỗi thao tác ghi dữ liệu và log trong cùng transaction.
- **Ưu tiên:** P0 · **Phụ thuộc:** A1
- **Tiêu chí chấp nhận:**
  - `updateBody(id, body, expectedRevision)` từ chối với lỗi xung đột nếu `revision` hiện tại khác; thành công thì tăng `revision`, cập nhật `search_text` và chạm `areas.updated_at`.
  - **Log không nhiễu:** tạo, đổi tên, xóa, khôi phục mỗi thao tác một log. Sửa nội dung gộp thành **một** log `update` cho mỗi phiên sửa (mở lại sau ≥5 phút không sửa, hoặc đổi tài liệu, mới tính phiên mới). Nội dung dài trong log được rút gọn theo P1-R10.
  - **Chính sách version:** tạo `document_versions` khi bắt đầu phiên sửa mới, khi AI áp dụng thay đổi, khi khôi phục; không tạo cho từng lần autosave. Có giới hạn số version tối đa mỗi tài liệu, kèm cách dọn bản cũ.
  - Unit test: xung đột revision, gộp log, version, xóa mềm/khôi phục, rollback khi lỗi giữa chừng.
- **Trạng thái:** Done (đã merge vào `main`)

### A3 — Lớp đọc và server actions cho tài liệu
- **Mô tả:** `listDocuments(areaId)`, `getDocument(id)`, `listVersions(id)`; server actions qua `runAction` (Zod kiểm `id`, tiêu đề, độ dài nội dung).
- **Ưu tiên:** P0 · **Phụ thuộc:** A2
- **Tiêu chí chấp nhận:**
  - Mọi đọc dữ liệu cho render nằm trong gate `requireOwner()` (luật 7).
  - Giới hạn kích thước một tài liệu (ví dụ 200.000 ký tự) có thông báo lỗi tiếng Việt.
  - Action trả `ActionResult`, không ném lỗi ra client.
- **Trạng thái:** Done (đã merge vào `main`)

### A4 — Editor tài liệu
- **Mô tả:** component editor theo quyết định A0, hỗ trợ heading, list, checklist, bảng, code block, autosave, undo/redo trong phiên.
- **Ưu tiên:** P0 · **Phụ thuộc:** A0, A3
- **Tiêu chí chấp nhận:**
  - Autosave dùng chuỗi lưu tuần tự như `notes-panel.tsx`: debounce, lưu khi rời ô, flush khi `visibilitychange`/`pagehide`, trạng thái "Đang lưu…"/"Đã lưu", không bao giờ tạo hai bản khi lưu dồn.
  - Khi server báo xung đột revision: không ghi đè; hiện "Tài liệu đã thay đổi ở nơi khác" với lựa chọn tải bản mới (giữ bản đang gõ để chép) hoặc xem khác biệt.
  - Undo/redo trong phiên (Ctrl/Cmd+Z), checklist bấm được trên iPhone, ô nhập ≥16px, vùng chạm ≥44px, không tràn ngang.
  - e2e trên desktop và iphone: tạo, gõ, tải lại vẫn còn; checklist; bảng; xung đột giữa hai tab.
- **Trạng thái:** Done (đã merge vào `main`)

### A5 — Thiết kế lại giao diện Workspace
- **Mô tả:** chế độ workspace trong `/context`: cây tài liệu bên trái, editor rộng ở giữa, panel vận hành (Tasks, Milestones, Blockers, Topics, Assessments, Activity) mở bên phải hoặc dạng tab.
- **Ưu tiên:** P0 · **Phụ thuộc:** A4
- **Tiêu chí chấp nhận:**
  - Danh sách môn/dự án hiện tại vẫn giữ (tìm kiếm, dải "Cần cập nhật"); bấm một mục mở workspace thay cho drawer form.
  - Form Tổng quan cũ được thay bằng khối "Thông tin vận hành" gọn: trạng thái, ưu tiên, ngày bắt đầu, deadline, việc tiếp theo, tên gọi tắt, công tắc "Không gửi cho AI".
  - Explorer: tạo, đổi tên, xóa (có xác nhận, xóa mềm), kéo hoặc nút lên/xuống để sắp xếp, tìm theo tiêu đề.
  - Trên iPhone: explorer mở dạng sheet, editor chiếm toàn màn hình, nút đóng ≥44px.
  - URL phản ánh tài liệu đang mở; Back và tải lại mở đúng tài liệu.
  - Academic và Projects dùng chung một engine và một bộ component (chỉ khác template và panel hiện mặc định).
- **Trạng thái:** Done (đã merge vào `main`)

### A6 — Lịch sử phiên bản và khôi phục
- **Mô tả:** xem danh sách version của tài liệu, so khác biệt với bản hiện tại, khôi phục.
- **Ưu tiên:** P1 · **Phụ thuộc:** A2, A4
- **Tiêu chí chấp nhận:**
  - Danh sách hiện thời điểm, nguồn (`manual`, `ai_approved`, `migration`, `undo`).
  - Diff dạng dòng dễ đọc trên iPhone.
  - Khôi phục tạo version mới (không xóa lịch sử) và một log `update` với origin `undo`.
- **Trạng thái:** Done (đã merge vào `main`)

### A7 — Tìm kiếm tài liệu
- **Mô tả:** tìm toàn văn trong một workspace và trên toàn bộ Context, không phân biệt dấu.
- **Ưu tiên:** P1 · **Phụ thuộc:** A1, A3
- **Tiêu chí chấp nhận:**
  - Dùng Postgres full-text (`search_tsv`, cấu hình `simple` trên văn bản đã bỏ dấu bằng cùng hàm `normalizeVi` của server). Xem quyết định kiến trúc số 1 về FTS5.
  - Kết quả có tiêu đề, workspace, đoạn trích có tô từ khóa; bấm mở đúng tài liệu.
  - Gõ "tu tuong" tìm thấy "tư tưởng"; tài liệu đã xóa mềm không hiện.
  - Cùng một hàm truy vấn sẽ được Phase B dùng lại (B1).
- **Trạng thái:** Done (đã merge vào `main`)

### A8 — Liên kết từ tài liệu tới task và milestone
- **Mô tả:** chèn liên kết tới task/milestone có sẵn trong tài liệu; hiển thị dạng chip có trạng thái sống.
- **Ưu tiên:** P1 · **Phụ thuộc:** A4, A5
- **Tiêu chí chấp nhận:**
  - Cú pháp lưu trong Markdown ổn định và đọc được bằng mắt (ví dụ `[Tên task](task:<uuid>)`), nên vẫn là Markdown hợp lệ khi xuất.
  - Bộ chọn "Chèn liên kết" tìm task/milestone của workspace hiện tại.
  - Chip hiện trạng thái hiện tại (Todo/Done…, hạn); bấm mở panel tương ứng.
  - Bản ghi đã xóa hiện "liên kết hỏng", không làm vỡ trang.
- **Trạng thái:** Done (đã merge vào `main`)

### A9 — Template tùy chọn
- **Mô tả:** khi tạo tài liệu có thể chọn template; không bao giờ bắt buộc.
- **Ưu tiên:** P2 · **Phụ thuộc:** A2, A5
- **Tiêu chí chấp nhận:**
  - Bộ mặc định: Academic ("Tổng quan môn", "Syllabus & hình thức thi", "Tiến độ ôn tập"); Project ("Tổng quan dự án", "Nhật ký kỹ thuật", "Blockers & thử nghiệm").
  - Workspace mới có thể bắt đầu trống.
  - Template chỉ là nội dung khởi tạo; không tạo trường bắt buộc nào.
- **Trạng thái:** Done (đã merge vào `main`)

### A10 — Chuyển dữ liệu form hiện có sang tài liệu (migration an toàn)
- **Mô tả:** script và migration chuyển các trường linh hoạt và ghi chú gắn với môn/dự án thành tài liệu, không mất thông tin.
- **Ưu tiên:** P0 · **Phụ thuộc:** A1, A2 (chạy thật sau A5)
- **Tiêu chí chấp nhận:**
  - **Mỗi môn/dự án có một tài liệu "Tổng quan (đã chuyển)":** các trường linh hoạt được đặt dưới heading tương ứng, giữ nguyên văn bản gốc. Văn bản có ký tự Markdown đặc biệt được giữ nguyên trong khối trích dẫn hoặc code nếu cần, để không đổi nghĩa.
  - **Ghi chú gắn với môn/dự án:** mỗi ghi chú thành một tài liệu (tiêu đề = dòng đầu, tối đa 80 ký tự), giữ `ai_excluded` và thời điểm tạo. Ghi chú trong Inbox giữ nguyên trong bảng `notes`.
  - **Lưu ánh xạ** `note_id → document_id` (bảng hoặc cột) để log cũ, đề xuất đang chờ và bộ lọc riêng tư vẫn tra được.
  - **Chạy thử (dry-run)** in báo cáo: số mục, số tài liệu sẽ tạo, tổng ký tự trước/sau cho từng trường. Chạy thật **idempotent** (đánh dấu từng mục đã chuyển), mỗi mục một transaction, origin `migration`.
  - **Xác minh sau khi chạy:** tổng ký tự trường gốc = tổng ký tự nội dung đã chuyển (bỏ phần heading); số ghi chú = số tài liệu từ ghi chú.
  - **Không xóa cột cũ** trong đợt này: các cột chỉ còn đọc (UI không sửa nữa), xóa ở A11 sau ít nhất một đợt dùng thật.
  - **Hướng dẫn trong README:** xuất JSON sao lưu trước; chạy dry-run trên bản sao (PGlite nạp từ bản export) trước khi chạy trên Supabase.
- **Trạng thái:** Done (đã merge vào `main`)

### A11 — Tích hợp và dọn dẹp
- **Mô tả:** cập nhật snapshot, seed/onboarding, export, e2e cho mô hình mới; xóa cột cũ khi đã ổn định.
- **Ưu tiên:** P1 · **Phụ thuộc:** A5, A10
- **Tiêu chí chấp nhận:**
  - `AreaSummary.missing` bỏ các cờ dựa trên trường đã chuyển, thêm cờ `no_documents` nếu hữu ích; snapshot và context builder (Phase 2) vẫn chạy và test xanh.
  - Onboarding có thể tạo sẵn tài liệu từ template (không bắt buộc).
  - Đề xuất Phase 3 đang chờ có đụng trường đã chuyển (`update_area.summary`, `goal`) bị chuyển sang `superseded`, và các field này bị bỏ khỏi schema hành động.
  - Migration xóa cột cũ chỉ chạy sau khi owner xác nhận; có bản export trước đó.
  - Toàn bộ e2e được cập nhật theo UI mới và xanh trên desktop và iphone.
- **Trạng thái:** Done (đã merge vào `main`)

---

## Workstream 2 — Phase B: AI Context Integration

**Mục tiêu:** Chat tìm và đọc đúng tài liệu liên quan, kết hợp với trạng thái có cấu trúc, và đề xuất cập nhật tài liệu hoặc bản ghi. Mọi thay đổi do AI đề xuất phải được duyệt, kiểm tra ở backend, ghi lịch sử và hoàn tác được.

**Không làm trùng:** cơ chế đề xuất, duyệt, kiểm tra xung đột và ghi log cho **bản ghi có cấu trúc** đã được thiết kế trong Phase 3 (`pending_actions`, `propose_changes`, chế độ `tools`/`json`/`off`, `approve`/`reject`/`rebase`, thẻ duyệt). Phase B **mở rộng** engine đó cho tài liệu, không dựng engine thứ hai.

### B0 — Hoàn tất Phase 3 làm nền
- **Mô tả:** triển khai Phase 3 theo kế hoạch hiện có: engine đề xuất, duyệt và áp dụng cho bản ghi có cấu trúc.
- **Ưu tiên:** P0 · **Phụ thuộc:** Phase 2 (đã xong)
- **Tiêu chí chấp nhận:** đạt mục "Xong khi" của Phase 3; criteria 7, 8, 10, 12, 14, 16 của spec đạt.
- **Trạng thái:** Done (đã merge vào `main`)

### B1 — Chỉ mục truy hồi tài liệu
- **Mô tả:** chia tài liệu thành đoạn theo heading để tìm và trích dẫn; cập nhật chỉ mục trong cùng transaction khi tài liệu đổi.
- **Ưu tiên:** P0 · **Phụ thuộc:** A1, A2, A7
- **Tiêu chí chấp nhận:**
  - Bảng `document_chunks` (`document_id`, `heading_path`, `ordinal`, `text`, `search_tsv`) hoặc tính khi truy vấn; lựa chọn được ghi lại trong ADR.
  - Hàm `searchContext(query, { areaIds?, limit })` trả đoạn xếp hạng theo FTS, có `documentId`, `heading_path`, `updated_at`.
  - Không bao giờ trả đoạn của tài liệu hoặc workspace `ai_excluded`.
  - Test: tìm không dấu, xếp hạng, loại trừ riêng tư, cập nhật chỉ mục sau khi sửa.
- **Trạng thái:** Done (đã merge vào `main`)

### B2 — Chọn ngữ cảnh tài liệu cho mỗi lượt chat
- **Mô tả:** mở rộng `buildContext` (Phase 2): thêm dàn ý tài liệu, nội dung tài liệu chắt lọc ưu tiên và các đoạn liên quan nhất từ tài liệu thô cho câu hỏi theo từng workspace và xuyên workspace.
- **Ưu tiên:** P0 · **Phụ thuộc:** B1, B10
- **Tiêu chí chấp nhận:**
  - Phân biệt vai trò tài liệu: tài liệu **`context` / được ghim** (ví dụ bản tóm tắt dự án trích từ ChatGPT) được ưu tiên đưa dàn ý & phần cốt lõi vào ngữ cảnh khi workspace đó được chọn; tài liệu **`raw`** (syllabus, đề thi, PDF…) chỉ gửi top-K đoạn khớp câu hỏi và 3 tin nhắn trước để tiết kiệm token và tránh nhiễu.
  - Câu hỏi tổng thể ("tuần này…"): top-K đoạn xuyên workspace, ưu tiên workspace active, tài liệu `context` và tài liệu mới sửa.
  - Ngân sách riêng cho tài liệu (ví dụ ≤40% của 32.000 ký tự), thứ tự cắt xác định và có test. Tầng 1 (trạng thái có cấu trúc) không bao giờ bị cắt.
  - `contextRefs` có thêm `documentId`; dòng "Dựa trên:" có chip mở đúng tài liệu.
  - Unit test với mock provider cho từng phạm vi.
- **Trạng thái:** Done (đã merge vào `main`)

### B3 — Công cụ đọc tài liệu cho AI (tùy chọn → nâng cấp ở Phase D2)
- **Mô tả:** khi `AI_ACTION_MODE=tools`, cho model gọi `list_area_documents`, `search_documents(query)` và `read_document_chunks(id, ...)` để chủ động đào sâu tài liệu gốc (Đề cương, Kế hoạch, Đề thi các năm) khi ngữ cảnh ban đầu thiếu. Chi tiết thiết kế nằm ở `docs/superpowers/plans/2026-11-24-deep-dive-pacing-skill-and-exam-schedule.md` (gắn với **D2** bên dưới).
- **Ưu tiên:** P0 (nâng từ P2 lên P0) · **Phụ thuộc:** B2
- **Tiêu chí chấp nhận:**
  - Có giới hạn số vòng lặp gọi tool mỗi lượt (tối đa 3 vòng) và trần tổng ký tự.
  - Tôn trọng tuyệt đối `ai_excluded` ở cả workspace, thư mục cha, và tài liệu.
  - Chế độ `json`/`off` vẫn hoạt động chỉ với truy hồi phía server.
- **Trạng thái:** Not Started (kế hoạch chi tiết trong **D2**)

### B4 — Độ tin cậy và độ mới của ngữ cảnh
- **Mô tả:** gắn siêu dữ liệu độ mới cho mỗi đoạn tài liệu và cập nhật system prompt để xử lý thông tin cũ hoặc mâu thuẫn.
- **Ưu tiên:** P1 · **Phụ thuộc:** B2
- **Tiêu chí chấp nhận:**
  - Mỗi đoạn kèm `updated_at`, `days_since_update` (server tính) và nguồn sửa gần nhất (`manual`, `ai_approved`, `migration`).
  - Prompt: trạng thái có cấu trúc thắng tài liệu khi mâu thuẫn và AI phải nói rõ chỗ mâu thuẫn. Đoạn cũ hơn `stale_after_days` được coi là "có thể đã lỗi thời". Phân loại `Confirmed` / `User reported` / `Inferred` / `Unknown` áp dụng cho cả nội dung tài liệu.
  - Test với mock: ngữ cảnh mâu thuẫn tạo đúng các trường cần thiết trong state JSON.
- **Trạng thái:** Done (đã merge vào `main`)

### B5 — Loại hành động đề xuất cho tài liệu
- **Mô tả:** mở rộng union `ProposedAction` của Phase 3 với các thao tác tài liệu có neo chính xác.
- **Ưu tiên:** P0 · **Phụ thuộc:** B0, A2
- **Tiêu chí chấp nhận:**
  - Các loại mới:
    - `create_document {areaId, title, markdown}`
    - `append_to_document {documentId, heading?, markdown}`
    - `replace_section {documentId, heading, markdown}`
    - `set_checklist_item {documentId, itemText, checked}`
    - `rename_document {documentId, title}`
  - **Không có hành động xóa.**
  - **Kiểm tra ở backend:** tài liệu tồn tại, không `ai_excluded`, không bị xóa mềm. Heading hoặc `itemText` phải khớp đúng một vị trí. Có giới hạn độ dài.
  - **Server tự ghi mốc khi lưu đề xuất:** `baseRevision` và hash của section đích.
  - Chế độ `json` (`<proposed_actions>`) phủ các loại mới; `ai:probe` có thêm một ca hành động tài liệu.
- **Trạng thái:** Done (đã merge vào `main`)

### B6 — Áp dụng có kiểm soát xung đột
- **Mô tả:** áp dụng thao tác tài liệu trong cùng transaction với thao tác có cấu trúc của một lô duyệt.
- **Ưu tiên:** P0 · **Phụ thuộc:** B5
- **Tiêu chí chấp nhận:**
  - Cả lô thành công hoặc không ghi gì.
  - Mỗi tài liệu bị đổi: tăng `revision`, tạo version (origin `ai_approved`, chung `batchId`), một log.
  - **Xung đột theo section:** nếu chính section đích đã đổi (hash khác) thì báo xung đột, không ghi đè. Chỗ khác của tài liệu đổi thì vẫn áp dụng được (giảm xung đột giả).
  - Dòng đích bị khóa (`FOR UPDATE`) trong transaction.
  - Test: hai lần duyệt đồng thời chỉ áp dụng một lần; sửa tay section đích rồi duyệt → xung đột; sửa section khác rồi duyệt → áp dụng.
- **Trạng thái:** Done (đã merge vào `main`)

### B7 — Giao diện duyệt có diff
- **Mô tả:** mở rộng thẻ đề xuất của Phase 3: mỗi hành động tài liệu hiện đích (workspace › tài liệu › section) và diff.
- **Ưu tiên:** P0 · **Phụ thuộc:** B6
- **Tiêu chí chấp nhận:**
  - Diff dòng có tô thêm/bớt; đoạn dài thu gọn được.
  - Sửa nội dung đề xuất trước khi duyệt (được kiểm tra lại ở server); duyệt một phần.
  - Đọc được bằng một tay trên iPhone, không tràn ngang.
  - e2e với mock provider: đề xuất cập nhật tài liệu → duyệt → tài liệu đổi đúng một lần và có version; từ chối → không đổi.
- **Trạng thái:** Done (đã merge vào `main`)

### B8 — Hoàn tác thay đổi do AI
- **Mô tả:** hoàn tác lô AI vừa áp dụng.
- **Ưu tiên:** P1 · **Phụ thuộc:** B6, A6
- **Tiêu chí chấp nhận:**
  - **Hoàn tác thẳng:** khi đích chưa bị sửa tiếp. Bản ghi có cấu trúc dùng thay đổi bù; tài liệu khôi phục version trước. Log với origin `undo`, không xóa log cũ.
  - **Đích đã bị sửa tiếp:** không hoàn tác thẳng; đưa người dùng tới lịch sử version để khôi phục có chủ đích.
  - Test cả hai nhánh.
- **Trạng thái:** Done (đã merge vào `main`)

### B9 — Định tuyến đề xuất tới đúng đích
- **Mô tả:** quy tắc trong prompt kèm kiểm tra ở server để mỗi loại thông tin vào đúng chỗ.
- **Ưu tiên:** P1 · **Phụ thuộc:** B5
- **Tiêu chí chấp nhận:**
  - **Bảng ưu tiên được ghi trong ADR:**
    - Hạn hoặc deadline → luôn là task hoặc assessment có `dueDate`, không bao giờ chỉ nằm trong tài liệu.
    - Blocker → bản ghi blocker, có thể thêm ghi chú vào tài liệu dự án.
    - Hoàn thành topic → cập nhật topic có cấu trúc, có thể thêm một dòng vào tài liệu tiến độ nếu có.
  - Server từ chối đề xuất chỉ ghi ngày vào tài liệu khi câu chat nói rõ một hạn (ví dụ cảnh báo trong thẻ duyệt).
  - Test với mock cho ba ví dụ: hoàn thành topic Algebra, blocker dự án, deadline mới.
- **Trạng thái:** Done (đã merge vào `main`)

### B10 — Riêng tư cho tài liệu
- **Mô tả:** mở rộng mọi đường loại trừ `ai_excluded` hiện có sang tài liệu.
- **Ưu tiên:** P0 · **Phụ thuộc:** A1, A2
- **Tiêu chí chấp nhận:**
  - Tài liệu `ai_excluded` (hoặc thuộc workspace `ai_excluded`) không xuất hiện trong: Tầng 2, đoạn truy hồi, `recentLogs`, công cụ đọc, lịch sử chat (mở rộng P2-R3: tin nhắn có `contextRefs` trỏ tới tài liệu bị loại thì bị ẩn).
  - Test trên **toàn bộ** payload gửi provider (system và mọi message), giống test Phase 2.
- **Trạng thái:** Done (đã merge vào `main`)

### B11 — Bộ test nhất quán ngữ cảnh
- **Mô tả:** bộ test và script đánh giá cho các tình huống ngữ cảnh khó.
- **Ưu tiên:** P1 · **Phụ thuộc:** B2–B10
- **Tiêu chí chấp nhận:**
  - **Fixture:** tài liệu mâu thuẫn với trạng thái có cấu trúc; tài liệu cũ; tài liệu riêng tư; câu hỏi xuyên workspace; hai tài liệu cùng heading.
  - **Unit test với mock** kiểm ngữ cảnh được chọn và state JSON.
  - **Script đánh giá thật** (giống `ai:probe`) chạy trên dữ liệu seed, ghi kết quả vào `docs/ai-probe-report.md` theo checklist hành vi mong đợi.
  - **Test hồi quy:** không bao giờ ghi đè bản mới hơn.
- **Trạng thái:** Done (đã merge vào `main`)

---

## Workstream 3 — Phase C: Quản lý thư mục & Tài liệu đa định dạng (Mini File Explorer + AI Folder Management)

**Mục tiêu:** Nâng cấp Document Explorer từ danh sách tài liệu `.md` phẳng thành một **Mini File Explorer** hỗ trợ cây thư mục lồng nhau và nhiều định dạng tệp (`.md`, `.txt`, code, `.csv`, `.json`, `.pdf`, ảnh, `.docx`…), đồng thời cho phép AI đọc nội dung trích xuất và **đề xuất sắp xếp, tạo, đổi tên, di chuyển thư mục/tệp** qua quy trình duyệt an toàn.

**Không làm trùng:** Tiếp tục mở rộng `documents`, `document_versions` (Phase A) và engine đề xuất + chỉ mục truy hồi của Phase 3 / Phase B (`propose_changes`, `Approve / Edit / Reject`, `ai_excluded`), không tạo hệ thống quyền hay engine đề xuất riêng.

### C0 — Chốt kiến trúc thư mục & lưu trữ tệp (ADR-002)
- **Mô tả:** Viết ADR ngắn trong `docs/adr/` chốt: cấu trúc cây `folders`, danh sách MIME/đuôi tệp hỗ trợ, ranh giới loại tệp *sửa trực tiếp* vs *chỉ xem & trích xuất*, kiến trúc `FileStorage` (local disk / memory cho dev & test vs Supabase Storage private bucket cho production), chính sách dung lượng tối đa và chiến lược backup/export khi có tệp nhị phân.
- **Ưu tiên:** P0 · **Phụ thuộc:** A1
- **Tiêu chí chấp nhận:**
  - Chốt adapter `FileStorage` (`put`, `getSignedUrl`/`stream`, `delete`) chạy đồng nhất trên test/PGlite local và Supabase production.
  - Phân định rõ 3 nhóm tệp: (1) Markdown `.md` (editor GFM + version + AI sửa section), (2) văn bản/dữ liệu đọc được (`.txt`, `.csv`, `.json`, code — xem/sửa text hoặc xem bảng), (3) tệp nhị phân (`.pdf`, ảnh, `.docx` — lưu Object Storage, trích xuất `extracted_text` để tìm kiếm/AI đọc, hỗ trợ upload bản mới).
  - Xác định giới hạn kích thước mỗi tệp (ví dụ 10–25 MB) và whitelist MIME an toàn (chống SVG script / XSS khi preview).
- **Trạng thái:** Done (đã merge vào `main`)

### C1 — Schema & Service cây thư mục (`folders`)
- **Mô tả:** Thêm bảng `folders` (`id`, `area_id`, `parent_id` tự tham chiếu, `name`, `sort_order`, `ai_excluded`, `deleted_at`, `created_at`, `updated_at`) và gắn `documents.folder_id` (nullable = ở thư mục gốc workspace) cùng `doc_role` (`context` | `raw` | `instruction`, mặc định `context`) + `pinned` boolean. Xây `folderService` theo luật kiến trúc 1–2 (mọi thao tác ghi đều ghi `activity_logs` trong cùng transaction).
- **Ưu tiên:** P0 · **Phụ thuộc:** C0, A2
- **Tiêu chí chấp nhận:**
  - Hỗ trợ tạo, đổi tên, di chuyển thư mục/tài liệu (`moveNode`), sắp xếp `sort_order`, đổi vai trò tài liệu (`context` đã chắt lọc vs `raw` tài liệu gốc như syllabus/đề thi), xóa mềm theo nhánh và khôi phục.
  - **Chống vòng lặp cây:** backend bắt buộc kiểm tra và từ chối di chuyển một thư mục vào chính nó hoặc thư mục con của nó.
  - **Kế thừa riêng tư:** nếu bất kỳ thư mục cha nào bật `ai_excluded = true`, toàn bộ thư mục con và tệp bên trong mặc định bị loại khỏi tìm kiếm AI và ngữ cảnh chat.
  - Tùy chọn tạo sẵn bộ thư mục gợi ý không bắt buộc khi mở workspace mới (ví dụ `Context/` cho bản chắt lọc từ ChatGPT và `Tài liệu gốc/` cho syllabus, đề, slide).
  - Bật RLS (`enableRLS()`), cập nhật `TABLES`, `ENTITY_TYPES` (thêm `folder`), export `schema_version`, có unit test đầy đủ (di chuyển vòng lặp, kế thừa `ai_excluded`, rollback).
- **Trạng thái:** Done (đã merge vào `main`)

### C2 — Upload, lưu trữ tệp & Trình trích xuất nội dung (`extracted_text`)
- **Mô tả:** Cho phép tải lên tệp ngoài `.md` vào thư mục của workspace, lưu tệp nhị phân qua `FileStorage` và trích xuất văn bản thuần vào DB (`mime_type`, `file_ext`, `storage_key`, `size_bytes`, `extracted_text`) để đồng bộ FTS (`search_tsv`) và `document_chunks` (Phase B).
- **Ưu tiên:** P0 · **Phụ thuộc:** C0, C1, A7
- **Tiêu chí chấp nhận:**
  - Upload qua kéo-thả hoặc nút chọn tệp trong Explorer (desktop & iPhone Files), kiểm tra MIME + dung lượng ở server trước khi ghi.
  - Tệp text/CSV/JSON tự động đưa vào `search_text` / `search_tsv`; tệp PDF (và DOCX nếu bật) trích xuất text không dấu vào chỉ mục tìm kiếm để gõ không dấu vẫn tìm ra tệp.
  - Mọi route đọc/tải tệp đều qua gate `requireOwner()` và không lộ URL công khai không hết hạn; header `Content-Security-Policy` & `Content-Disposition` an toàn (không thực thi HTML/SVG upload).
  - Test: kiểm tra MIME sai/quá dung lượng bị từ chối bằng tiếng Việt, tệp `ai_excluded` không tải/truy hồi cho AI, xóa mềm giữ tệp an toàn trước khi dọn.
- **Trạng thái:** Done (đã merge vào `main`)

### C3 — Giao diện Mini File Explorer & Trình xem đa định dạng
- **Mô tả:** Nâng cấp cột trái Workspace thành **Mini File Explorer**: cây thư mục thu gọn/mở rộng được, breadcrumb đường dẫn, tìm nhanh theo tên tệp/thư mục, kéo thả hoặc menu chuyển thư mục, upload nhiều định dạng và trình xem/sửa tương ứng ở giữa màn hình.
- **Ưu tiên:** P0 · **Phụ thuộc:** C1, C2, A5
- **Tiêu chí chấp nhận:**
  - Cây thư mục có nút mở rộng/thu gọn, tạo thư mục con, tạo file `.md`, upload tệp, đổi tên tại chỗ, di chuyển tới thư mục khác, xóa mềm (có xác nhận).
  - **Trình xem/sửa theo loại tệp:** `.md` dùng `DocEditor` hiện có; `.txt`/`.json`/code hiển thị gọn có line/monospace; `.csv` xem dạng bảng dễ cuộn; ảnh xem trực tiếp; `.pdf` xem preview + nút tải xuống; tệp khác hiện metadata (tên, kích thước, loại, thư mục) + nút tải xuống.
  - Ghi nhớ trạng thái mở thư mục và URL phản ánh thư mục/tệp đang chọn (`?item=<areaId>&folder=<folderId>&doc=<docId>`).
  - Dùng tốt một tay trên iPhone (Sheet cây thư mục, chạm ≥44px, input ≥16px, bảng/preview không làm tràn ngang trang).
  - e2e trên desktop và iphone: tạo thư mục lồng nhau, chuyển file vào thư mục, upload tệp mẫu, xem preview và tìm kiếm ra tệp.
- **Trạng thái:** Done (đã merge vào `main`)

### C4 — AI quản lý thư mục & sắp xếp tệp (có duyệt)
- **Mô tả:** Mở rộng `ProposedAction` và ngữ cảnh AI để AI nhìn được cấu trúc cây thư mục hiện tại của workspace và đề xuất tổ chức, phân loại hoặc đặt tài liệu mới vào đúng thư mục.
- **Ưu tiên:** P1 · **Phụ thuộc:** C1, B5–B7
- **Tiêu chí chấp nhận:**
  - Gửi kèm cây thư mục gọn (`folderId`, `path`, `documentCount`) của các workspace được chọn vào ngữ cảnh chat (tôn trọng `ai_excluded`).
  - Các action mới trong `propose_changes`:
    - `create_folder {areaId, parentId?, name}`
    - `rename_folder {folderId, name}`
    - `move_node {nodeType: 'folder' | 'document', id, targetFolderId: string | null}`
    - `create_document` mở rộng thêm `folderId?` tùy chọn để tạo tài liệu mới vào đúng thư mục.
  - **Không có hành động AI xóa thư mục hay xóa tệp, và AI không được sửa file có `doc_role = 'instruction'`.**
  - **Thẻ duyệt cây thay đổi:** Hiển thị rõ đường dẫn cũ → mới (hoặc cây thư mục dự kiến sẽ tạo/chuyển), hỗ trợ bỏ chọn từng bước hoặc sửa tên/thư mục đích trước khi bấm `Approve`.
  - Áp dụng chung transaction (khóa kiểm tra xung đột parent/cycle ở server), tạo log với nguồn `ai_approved` và hỗ trợ hoàn tác (`undo`, tương tự B8).
  - Test & e2e với mock provider: chat yêu cầu *"sắp xếp lại tài liệu môn học theo từng chương / phân loại đề thi và slide"* → AI đề xuất tạo thư mục + di chuyển tệp → duyệt → cây thư mục đổi đúng và không đụng thư mục `ai_excluded`.
- **Trạng thái:** Not Started

### C5 — Skills & Hướng dẫn AI kiểu `skills.md` (toàn cục & theo Workspace)
- **Mô tả:** Cho phép định nghĩa tập hợp quy tắc/kỹ năng hướng dẫn AI hành xử (tương đương Custom Instructions của ChatGPT Projects / `skills.md`) ở cấp toàn app (trong Settings hoặc thư viện chung) và cấp từng Workspace (ví dụ: quy trình đánh giá tiến độ học tập theo lịch thi & đề cương ở **D3**, quy trình bóc tách syllabus ra assessment/topic, quy tắc review dự án code).
- **Ưu tiên:** P1 · **Phụ thuộc:** B2, C1
- **Tiêu chí chấp nhận:**
  - Tách biệt rõ khối **`<workspace_instructions>`** (chỉ nhận từ nguồn `instruction` do chính owner tạo/sửa) với khối **`<workspace_state>`** (nơi chứa dữ liệu, tài liệu chắt lọc và tài liệu thô vốn luôn bị xem là *DỮ LIỆU* không được ra lệnh cho AI).
  - Hỗ trợ gắn các `skill` Markdown có sẵn hoặc tự viết (bật/tắt theo Workspace hoặc toàn cục), có giới hạn ngân sách ký tự rõ ràng (ví dụ tối đa 2.000–4.000 ký tự mỗi lượt) để không chèn ép dữ liệu thật.
  - **An toàn quyền ghi:** Tài liệu thô upload (`.pdf`, `.md` ngoại lai…) không bao giờ được gắn nhãn `instruction`, và AI trong chat không có action tạo hay chỉnh sửa `instruction` / `skills.md`.
  - Unit test: kiểm tra `instruction` được đưa đúng vị trí vào system prompt, tôn trọng `ai_excluded`, bị cắt theo trần ngân sách nếu quá dài, và AI không thể sửa `instruction`.
- **Trạng thái:** Not Started

---

## Workstream 4 — Phase D: Lịch thi dự kiến theo chu kỳ, AI Deep-Dive Tools & Pacing Skill

**Mục tiêu:** Khắc phục toàn bộ các lỗi thực tế phát hiện khi dùng thử với dữ liệu 9 môn HUST 2026.1 (cắt ngữ cảnh mất `04_STATE.md` / dính YAML frontmatter, thiếu lịch thi dự kiến & chu kỳ rà soát, AI chưa đào sâu tài liệu, đề xuất nhầm khi chỉ hỏi, và nghẽn stream/khó debug lỗi).

> **Tài liệu thiết kế & kế hoạch implement chi tiết:** `docs/superpowers/plans/2026-11-24-deep-dive-pacing-skill-and-exam-schedule.md`

### Tổng hợp các vấn đề thực tế đã phát hiện qua ảnh kiểm thử (24/11/2026)

1. **Bỏ sót `04_STATE.md` & gửi nhầm phần YAML frontmatter thay vì nội dung thật** *(ảnh hỏi "algebra đang học đến đâu rồi" ra `0 topic`, không thấy tiến độ 4/10 Chương 5)*:
   - `selectDocumentContext` (`src/server/ai/document-context.ts`) đang `.slice(0, 6)` tài liệu `context`, khiến `04_STATE.md` (file thứ 7 của Algebra) **bị cắt rớt hẳn** dù chứa tiến độ mới nhất (*4/10 Chương 5*, điểm *24/30*, dự kiến thi *đầu 01/2027*).
   - Mỗi tài liệu chỉ lấy đúng **1 chunk (~850 ký tự)** đầu tiên khớp từ khóa, mà các file vừa import lại có khối YAML frontmatter (`--- entity: ... ---`) + đoạn mở đầu dài nên `05_LOG.md`, `07_MISSING_INFO.md` chỉ gửi phần header mà mất toàn bộ bảng trạng thái/log bên dưới. *(→ **D0**)*
2. **Dữ liệu có cấu trúc sau import vẫn trống (`topics: 0`, `assessments: 0`) & thiếu lịch thi dự kiến theo chu kỳ**:
   - Tài liệu đã nạp vào `documents` (231/232 file; riêng `DATABASE LAB REPORT.docx` là file đám mây OneDrive chưa sync offline), nhưng bảng `topics` và `assessments` vẫn trống nên AI đếm ra `0 topic` và `no_assessment_date`.
   - Chưa có trường ngày bắt đầu học kỳ (`termStartDate`), lịch thi dự kiến (`estimated` vs `official`) và chu kỳ nhắc kiểm tra/cập nhật lại lịch định kỳ. *(→ **D1, D4**)*
3. **AI chưa tự đào sâu vào Đề cương / Kế hoạch / Đề thi để đánh giá tiến độ nhanh hay chậm**:
   - Mô hình one-shot context hiện tại không có tool chỉ đọc để chủ động mở thêm `02_COURSE_MAP.md`, `06_TIMELINE.md`, `DCHP.pdf` hay các đề thi trong `03_Đề_thi_&_Ôn_tập`, và chưa có Skill đánh giá tốc độ học dựa trên 5 trụ cột (ngày hiện tại + ngày thi + kế hoạch chi tiết + nội dung môn + đề thi). *(→ **D2, D3**)*
4. **Đề xuất cập nhật nhầm khi người dùng chỉ hỏi** *(ảnh hỏi "algebra tôi đang học đến đâu rồi" lại ra thẻ `Sửa mục Algebra` + `Approve / Edit / Reject`)*:
   - Model tự gọi nhầm `propose_changes` (`update_area` sửa trường `summary` thành câu meta *"chưa xác nhận tiến độ"*), và khi `reply` text trống thì `runChatTurn` hiển thị tóm tắt proposal thay cho câu trả lời. *(→ **D5**)*
5. **Response chậm, nghẽn giữa chữ, hoặc báo `"Có lỗi xảy ra, thử lại."` / `"đề xuất không hợp lệ"` khó chẩn đoán** *(các ảnh khựng chữ `"bài đánh giá hay nhiệ"`, lỗi chung khi dev/build lệch, và ảnh báo đề xuất bị bỏ qua)*:
   - `claude-sonnet-5` trên `codex.fosta.app` hay khựng/timeout giữa chừng (đã đổi `.env.local` sang `gpt-6.2-sol`, cần restart `pnpm dev` để nhận env mới).
   - Khi chạy `pnpm build` song song lúc `pnpm dev` đang mở có thể gây lệch chunk/state khiến stream trả `"Có lỗi xảy ra, thử lại."`.
   - `ndjson.ts` và `run-turn.ts` hiện không log chi tiết lý do khi proposal bị từ chối (`parseProposal` / `stampActions` / `hasDeadlineRoute`) và thiếu trạng thái streaming khi model đang xử lý tool, khiến người dùng khó biết vì sao bị từ chối hoặc bị treo. *(→ **D6**)*

### D0 — Vá truy xuất ngữ cảnh ban đầu (`document-context.ts`: bỏ YAML frontmatter & mở rộng `context`)
- **Mô tả:** Loại bỏ khối YAML frontmatter (`--- ... ---`) trước khi chia chunk trong `splitDocument`, bỏ giới hạn `.slice(0, 6)` đối với nhóm tài liệu `docRole === 'context'` của workspace đang chọn, và cho phép các file trạng thái/kế hoạch (`04_STATE`, `05_LOG`, `06_TIMELINE`) gửi nhiều chunk nội dung hơn trong ngân sách `DOCUMENT_CONTEXT_MAX`.
- **Ưu tiên:** P0 · **Phụ thuộc:** B2
- **Tiêu chí chấp nhận:**
  - Chunk đầu tiên gửi cho AI của các file Markdown có frontmatter là nội dung/bảng dữ liệu thật, không bị khối `--- entity: ... ---` chiếm chỗ.
  - Khi hỏi về một môn có 7+ file `context` (như Algebra), `04_STATE.md` luôn nằm trong `documents[]` và `Dựa trên:` chips.
  - Hỏi *"algebra đang học đến đâu rồi"* AI đọc thấy ngay tiến độ *4/10 Chương 5*, điểm *24/30*, dự kiến thi *đầu 01/2027* ngay trong câu trả lời.
- **Trạng thái:** Gộp vào **Đợt 1** (Q1–Q5)

### D1 — Thông tin ngữ cảnh còn thiếu: Lịch thi dự kiến & Chu kỳ nhắc cập nhật lịch
- **Mô tả:** Bổ sung mốc `termStartDate` (ngày bắt đầu Tuần 1 học kỳ trong `settings` để quy đổi *"Tuần N"* sang ngày thật) và trường lịch thi dự kiến cho `assessments` (`dateConfidence`: `'official' | 'estimated' | 'tentative'`, `examWindowStart`/`examWindowEnd`, `scheduleVerifiedAt`), kèm **chu kỳ nhắc cập nhật lịch định kỳ** (`scheduleReviewIntervalDays`, tự động rút ngắn khi cận kỳ thi mà lịch vẫn ở mức `estimated`).
- **Ưu tiên:** P0 · **Phụ thuộc:** Phase 2
- **Tiêu chí chấp nhận:**
  - `AreaSummary.missing` & `<workspace_state>` gắn cờ rõ: `no_exam_schedule` (môn `active` chưa có lịch thi chính thức lẫn dự kiến) và `exam_schedule_unverified` (lịch dự kiến đã quá chu kỳ cần rà soát lại).
  - Giao diện `/context` (huy hiệu danh sách, bảng Assessments, Settings) hiển thị rõ lịch dự kiến khác với lịch chính thức, cho phép bấm xác nhận đã rà soát lịch định kỳ.
  - AI trong `/chat` & `Cập nhật nhanh` tự động nhắc người dùng cập nhật lại lịch thi/kế hoạch khi quá chu kỳ, và luôn ghi rõ mức `Estimated` nếu ngày thi chưa chính thức.
- **Trạng thái:** Gộp vào **Đợt 2** (M2)

### D2 — Vòng lặp AI đọc sâu tài liệu cụ thể (Read-Only Deep-Dive Tool Loop)
- **Mô tả:** Mở rộng `runChatTurn` (hiện thực hóa **B3+**) cho phép AI chủ động gọi các tool chỉ đọc (`list_area_documents`, `search_documents`, `read_document_chunks`) dùng mã ID ngắn (`a1`, `d1`) khi cần kiểm tra kỹ Đề cương PDF, `06_TIMELINE.md`, `02_COURSE_MAP.md` hoặc Đề thi các năm trong `03_Đề_thi_&_Ôn_tập`.
- **Ưu tiên:** P0 · **Phụ thuộc:** B2, C3, cơ chế alias ID
- **Tiêu chí chấp nhận:**
  - Tối đa 3 vòng tool đọc mỗi lượt và có trần tổng ký tự trả về (ví dụ ≤14.000 ký tự) để không phình token hay treo response.
  - Tài liệu đọc thêm qua tool tự động xuất hiện trong chip `"Dựa trên:"` (`contextRefs`).
  - Tuyệt đối không trả nội dung từ workspace/thư mục/tài liệu `ai_excluded` hay `instruction`.
  - Stream phát tín hiệu trạng thái khi AI đang đọc tài liệu để tránh cảm giác nghẽn/đơ trên UI; cấu hình model mặc định tránh model hay timeout trên gateway.
- **Trạng thái:** Not Started

### D3 — Skill Đánh giá Tiến độ & Phân tích Ôn thi (`study-pacing.md`)
- **Mô tả:** Xây dựng Skill chuẩn hóa quy trình suy luận cho AI khi người dùng hỏi *"tiến độ môn này nhanh hay chậm?"*, *"hôm nay nên học gì để kịp thi?"*: bắt buộc kiểm tra & truy xuất đủ **5 trụ cột** (`now.date`/tuần học kỳ + `ngày thi dự kiến` + `kế hoạch chi tiết` + `nội dung/trọng số môn học` + `nội dung đề thi`), đối chiếu tiến độ thực tế (`topics`/`05_LOG.md`) với quỹ thời gian & trọng số đề thi để kết luận rõ ràng.
- **Ưu tiên:** P0 · **Phụ thuộc:** D1, D2, C5
- **Tiêu chí chấp nhận:**
  - Nếu thiếu dữ liệu trong ngữ cảnh ban đầu, AI gọi tool **D2** tìm trong tài liệu trước khi kết luận `Unknown`.
  - Kết luận tách minh bạch `Confirmed` vs `Estimated` (lịch thi dự kiến) vs `Unknown`, kèm tối đa 3 ưu tiên ôn tập theo độ ăn điểm trong đề thi và gợi ý `propose_changes` để nạp `topics`/`assessments` vào DB (có duyệt).
  - Có bộ test đánh giá (mock + live) trên dữ liệu môn HUST 2026.1 thật (ví dụ câu hỏi *"phân tích tiến độ môn Algebra — nhanh hay chậm?"*).
- **Trạng thái:** Not Started

### D4 — Bootstrap lịch thi dự kiến & topics cho các môn HUST 2026.1 đã import
- **Mô tả:** Script/công cụ hỗ trợ đọc `02_COURSE_MAP.md`, `06_TIMELINE.md`, `07_MISSING_INFO.md` và đề cương PDF để gợi ý tạo sẵn `assessments` (lịch thi dự kiến) và danh sách chương `topics` cho 9 môn học kỳ 2026.1.
- **Ưu tiên:** P1 · **Phụ thuộc:** D1
- **Tiêu chí chấp nhận:**
  - Hỗ trợ `--dry-run`, idempotent, không ghi đè dữ liệu người dùng đã sửa tay.
- **Trạng thái:** Gộp vào **Đợt 2** (M1)

### D5 — Chặn đề xuất cập nhật nhầm khi người dùng chỉ hỏi (`Proposal Intent Guard`)
- **Mô tả:** Sửa lỗi model tự gọi `propose_changes` (ví dụ ghi đè `areas.summary` bằng câu *"tiến độ hiện tại chưa xác nhận..."*) khi người dùng chỉ hỏi thuần túy như *"algebra tôi đang học đến đâu rồi"*, khiến câu trả lời bị thay bằng thẻ `Approve / Edit / Reject` gây nhiễu.
- **Ưu tiên:** P0 · **Phụ thuộc:** B9, D2
- **Tiêu chí chấp nhận:**
  - Prompt & backend phân biệt rõ câu hỏi tra cứu/phân tích với câu báo tiến độ hoặc yêu cầu sửa/lên lịch; dọn/chặn `update_area.summary` ghi chú meta không có thông tin mới.
  - Khi người dùng hỏi *"algebra tôi đang học đến đâu rồi"*, không phát sinh thẻ `propose_changes` ngoài ý muốn (trừ khi người dùng thực sự yêu cầu lên lịch/cập nhật) và câu trả lời tổng hợp đầy đủ từ tài liệu + ghi chú.
  - Có unit test & eval test hồi quy cho câu hỏi trạng thái thuần túy.
- **Trạng thái:** Gộp vào **Đợt 1** (Q1–Q5)

### D6 — Ổn định streaming, trạng thái chờ & log chẩn đoán lỗi Chat/Proposal
- **Mô tả:** Khắc phục trải nghiệm nghẽn giữa chừng hoặc báo lỗi chung chung (`"Có lỗi xảy ra, thử lại."` / `"AI có đề xuất cập nhật nhưng đề xuất không hợp lệ"`): thêm log server rõ nguyên nhân khi proposal bị từ chối (`parseProposal`, `stampActions`, `routing`), cảnh báo/hiển thị trạng thái khi AI đang đọc tài liệu hoặc phản hồi chậm, và đảm bảo luồng `runChatTurn` tách sạch câu trả lời với thẻ đề xuất (không để `reply` rỗng biến mất khi proposal bị bỏ qua).
- **Ưu tiên:** P0 · **Phụ thuộc:** D0, D2
- **Tiêu chí chấp nhận:**
  - Server log rõ mã/lý do proposal invalid ở dev (không lộ dữ liệu nhạy cảm ra client) để dễ debug.
  - Khi stream chậm hoặc đang chạy tool loop, UI hiển thị trạng thái tiến trình và timeout/retry rõ ràng thay vì đứng im giữa chữ.
  - Khi đề xuất bị bỏ qua nhưng model không viết văn bản kèm theo, giữ thông báo hữu ích hoặc giữ câu trả lời của AI tách bạch.
- **Trạng thái:** Gộp vào **Đợt 1** (Q1–Q5)

---

## Quyết định kiến trúc cần chú ý khi triển khai

1. **SQLite FTS5 không áp dụng được.** Ứng dụng chạy Postgres (Supabase ở production, PGlite khi dev/test), không phải SQLite. Phương án tương đương nhẹ nhất: Postgres full-text search (`tsvector` + index GIN, cấu hình `simple`) trên một cột văn bản đã bỏ dấu bằng chính hàm `normalizeVi` đang dùng cho Chat. Postgres không có từ điển tiếng Việt, nên bỏ dấu và tách từ đơn giản là đủ. Có thể thêm `pg_trgm` cho tìm gần đúng nếu PGlite hỗ trợ (cần kiểm chứng). Không cần vector DB.
2. **"Local-first" và kiến trúc hiện tại.** Owner đã chọn deploy lên Vercel và Supabase để dùng trên iPhone. Dev và test vẫn chạy local hoàn toàn bằng PGlite. Soạn thảo offline có đồng bộ (CRDT) nằm ngoài phạm vi; nếu cần thì là một workstream riêng.
3. **Quy tắc hai màn hình.** Workspace rộng không vừa drawer hiện tại. Đề xuất: chế độ toàn màn hình trong `/context` (URL có `item` và `doc`), vẫn chỉ hai đích điều hướng. Cần sửa spec (A0).
4. **Markdown là định dạng lưu chuẩn.** Dễ cho AI đọc, dễ diff, dễ tìm, dễ xuất. Rủi ro là editor WYSIWYG làm mất định dạng khi round-trip; bắt buộc có test round-trip trước khi chốt editor.
5. **Ranh giới cấu trúc và tài liệu.** Giữ cấu trúc cho mọi thứ cần truy vấn, lên lịch hoặc tính toán: trạng thái, ưu tiên, các ngày, việc tiếp theo, task, assessment, milestone, blocker, topic, activity log. Tài liệu chỉ chứa bối cảnh linh hoạt. Topic, assessment và blocker cũng giữ cấu trúc vì snapshot và Chat đang dựa vào chúng.
6. **Log và version phải gộp.** Autosave 1,5 giây đã từng làm lịch sử đầy nhiễu ở Phase 1. Tài liệu phải gộp theo phiên sửa (A2), nếu không Activity và ngữ cảnh AI sẽ bị chiếm chỗ.
7. **Xung đột theo section thay vì cả tài liệu.** Tránh việc mỗi lần autosave làm mọi đề xuất AI đang chờ thành "xung đột".
8. **Một engine đề xuất duy nhất.** Phase B mở rộng Phase 3, không dựng engine song song. Undo (từng là P1 của spec) được làm ở B8.
9. **Ngân sách ngữ cảnh.** Tài liệu có thể rất dài; chỉ gửi dàn ý và các đoạn liên quan nhất, không gửi nguyên tài liệu.
10. **Lưu trữ tệp đa định dạng (Phase C).** Không nhét file nhị phân (PDF, ảnh, DOCX) vào Postgres/PGlite dưới dạng `bytea` hay base64 để tránh phình DB và nặng JSON export. Dùng abstraction `FileStorage` (thư mục local/memory khi dev & test; private bucket của Supabase Storage khi production) và chỉ lưu metadata + `extracted_text` trong Postgres để FTS & AI dùng chung.
11. **Thư mục và bảo mật xem trước.** Kế thừa `ai_excluded` theo cây thư mục (tắt AI ở thư mục cha → ẩn toàn bộ thư mục con/tệp con). Chặn thực thi script khi preview tệp upload (không render HTML/SVG thô cùng origin, dùng CSP & `Content-Disposition` an toàn).
12. **Tách biệt Tài liệu thô, Context chắt lọc và `skills.md`.** Tài liệu thô (`raw`: syllabus, đề, PDF) chỉ index để tìm kiếm/trích đoạn; tài liệu chắt lọc (`context`: bản trích xuất từ ChatGPT, tổng quan) được ưu tiên đọc; còn hướng dẫn hành vi kiểu `skills.md` (`instruction`) chỉ do owner tự sửa và đưa vào vùng instruction riêng có trần token để chống prompt injection từ tài liệu ngoại lai.

## Rủi ro khi chuyển dữ liệu (A10)

- **Mất hoặc đổi nghĩa văn bản khi chuyển trường sang Markdown:** ký tự như `#`, `*`, `|` trong văn bản gốc có thể bị hiểu thành định dạng. Cần giữ nguyên văn và xác minh bằng tổng ký tự.
- **Chạy hai lần tạo tài liệu trùng:** cần đánh dấu từng mục đã chuyển (idempotent).
- **Lỗi giữa chừng để lại trạng thái dở dang:** mỗi mục một transaction; có báo cáo mục nào đã/chưa chuyển.
- **Đổi ID từ ghi chú sang tài liệu:** activity log cũ, đề xuất Phase 3 đang chờ (`pending_actions.note_id`) và bộ lọc riêng tư cho log ghi chú (Phase 2) đều tham chiếu `note_id`. Cần bảng ánh xạ và test riêng tư sau chuyển.
- **Cờ riêng tư bị rơi:** `ai_excluded` của ghi chú và workspace phải được giữ; cần test "dữ liệu riêng tư trước khi chuyển vẫn không tới AI sau khi chuyển".
- **Đề xuất AI đang chờ thành sai đích:** các đề xuất đụng `summary` hoặc `goal` phải chuyển `superseded` trước khi bỏ trường.
- **Chạy trên dữ liệu thật ở Supabase:** bắt buộc xuất JSON trước, chạy thử trên bản sao, và không xóa cột cũ trong cùng đợt.
- **Bản export cũ (`schema_version` 1)** không có tài liệu. Nếu sau này làm tính năng nhập lại, phải hỗ trợ cả hai phiên bản.
- **E2E vỡ hàng loạt** vì drawer form bị thay; cần thời gian cập nhật test tương ứng (A11).

## Thứ tự triển khai an toàn đề xuất

1. **B0 — Phase 3 như đã lên kế hoạch.** Có ngay engine duyệt, kiểm tra xung đột và ghi log; Phase B chỉ cần mở rộng.
2. **A0 → A1 → A2 → A3:** nền dữ liệu và service, chưa đụng UI.
3. **Viết script A10 ở chế độ dry-run sớm** (chạy trên bản sao) để phát hiện vấn đề dữ liệu trước khi thiết kế UI xong.
4. **A4 → A5 → A6 → A7 → A8 → A9:** editor và workspace mới, chạy song song với giao diện cũ sau một cờ cấu hình cho tới khi ổn.
5. **A10 chạy thật** (sau khi export), rồi **A11** (dọn dẹp; xóa cột cũ để sau cùng).
6. **B10 → B1 → B2 → B4:** riêng tư trước, rồi truy hồi và ngữ cảnh.
7. **B5 → B6 → B7 → B9 → B8:** đề xuất, áp dụng, duyệt, định tuyến, hoàn tác.
8. **B11** chạy liên tục từ B2 trở đi; **B3** chỉ làm nếu thực tế cho thấy truy hồi phía server chưa đủ.
9. **C0 → C1 → C2 → C3:** chốt kiến trúc lưu trữ, thêm bảng `folders` và upload/trích xuất text, nâng cấp Explorer thành Mini File Explorer + trình xem đa định dạng *(đã xong)*.
10. **C4 & C5** (sau C1 và B5–B7): mở rộng đề xuất AI cho quản lý cây thư mục & phân loại tệp có duyệt, kèm hệ thống `skills.md` / AI Instructions toàn cục & theo từng Workspace.
11. **Phase D (D0 → D1 → D2 → D3 → D5 → D6 → D4):** vá lọc YAML frontmatter & giới hạn `context` (**D0**), bổ sung dữ liệu lịch thi dự kiến + chu kỳ rà soát lịch (**D1**), công cụ AI đọc sâu tài liệu cụ thể (**D2**), Skill đánh giá tiến độ nhanh/chậm (**D3**), chặn đề xuất cập nhật nhầm khi chỉ hỏi (**D5**), ổn định streaming & log chẩn đoán (**D6**), và bootstrap lịch/topics cho bộ môn HUST 2026.1 (**D4**). Xem chi tiết tại `docs/superpowers/plans/2026-11-24-deep-dive-pacing-skill-and-exam-schedule.md`.
