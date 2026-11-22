# PERSONAL AI WORKSPACE — V1
**Product & Technical Design Specification**  
**Phiên bản:** 1.1 — 22/11/2026 (bản rà soát của 1.0; danh sách thay đổi ở Phụ lục A; quyết định triển khai và iPhone ở Phụ lục B)  
**Đối tượng:** Một người dùng duy nhất (owner)  
**Mục tiêu:** Tài liệu giao cho coding agent để xây MVP; mọi chi tiết bên dưới là quyết định thiết kế ban đầu, có thể chỉnh sửa sau khi sử dụng.

**Quy ước ưu tiên:** mục không gắn nhãn là **P0** (bắt buộc cho V1). Mục gắn **(P1)** chỉ làm sau khi toàn bộ P0 của cùng phase đã chạy end-to-end; được phép bỏ nếu thiếu thời gian.

## 1. Tuyên bố sản phẩm

Personal AI Workspace là một ứng dụng web cá nhân có **hai màn hình chính**:

1. **Chat:** giao diện hội thoại tương tự các AI chat hiện đại. AI hiểu bối cảnh học tập và dự án, có thể tư vấn và đề xuất cập nhật dữ liệu.
2. **Context:** quản lý trực quan toàn bộ trạng thái đang diễn ra, chia đúng **hai mục: Academic và Projects**.

**Giá trị cốt lõi:** Người dùng chỉ cần hỏi ngắn như “Hôm nay nên làm gì?”, “Tuần này ổn không?”, “Research đang mắc gì?” mà AI có thể trả lời dựa trên trạng thái mới nhất, nguồn dữ liệu cụ thể và lịch sử thay đổi — không phải yêu cầu giải thích lại bối cảnh.

Ứng dụng **không phải app để học bài**, không thay thế LMS, note-taking học thuật hoặc IDE. Academic chỉ lưu đủ **nội dung và cấu trúc môn học** để theo dõi mức độ sẵn sàng, tiến độ và rủi ro.

**Triết lý:** State-first, AI-second; ít thao tác; minh bạch lý do khuyến nghị; người dùng luôn kiểm soát dữ liệu.

**Rủi ro sản phẩm lớn nhất:** không phải kỹ thuật mà là **state bị cũ** vì owner ngừng cập nhật. Mọi quyết định thiết kế ưu tiên giảm friction nhập liệu và làm lộ rõ dữ liệu cũ, thay vì làm AI “thông minh” hơn.

## 2. Phạm vi V1 và những gì chưa xây

### Phải có trong V1
- Hai màn hình: `/chat` và `/context`; các chi tiết mở dưới dạng panel/drawer, không thành screen thứ ba. Onboarding `Review & import` và Settings đều là modal.
- Chat nhiều cuộc hội thoại, streaming nếu provider hỗ trợ, Markdown, retry, lịch sử chat, prompt gợi ý.
- Context với hai tab Academic / Projects; danh sách, tìm kiếm theo tên, tạo/sửa/lưu trữ mục.
- Drawer chi tiết của mỗi môn/dự án: overview, tiến độ, tasks, notes, logs; riêng Academic có topics và assessments, riêng Projects có milestones và blockers.
- CRUD trực tiếp bằng UI, không cần AI.
- AI đọc ngữ cảnh có cấu trúc; trả lời có giải thích, nêu dữ liệu nào hỗ trợ nhận định và dữ liệu nào chưa có.
- AI **đề xuất** các thay đổi dữ liệu dưới dạng structured actions; UI cho xem bản xem trước và **duyệt** trước khi ghi.
- Quick capture (ghi chú tự do) đặt trong Context và có thể nhắn ngay tại Chat.
- Lưu lịch sử thay đổi (activity logs) trong cùng transaction với thay đổi dữ liệu.
- **Deploy lên cloud** (Vercel + Supabase) để dùng được mọi lúc, không phụ thuộc máy owner đang bật. Đăng nhập riêng tư, chỉ một tài khoản owner, tắt đăng ký mới.
- LLM provider thay được, ban đầu dùng Fosta qua API tương thích OpenAI **nếu vượt qua bài kiểm tra tương thích ở Phase 0** (mục 6.1).
- Xuất toàn bộ dữ liệu ra JSON bằng một nút trong Settings (có từ Phase 1 để dữ liệu thật luôn có đường lui).
- Giao diện desktop-first, layout responsive.
- **Dùng trên iPhone dưới dạng PWA:** mở bằng Safari rồi `Add to Home Screen`, chạy toàn màn hình như một app, đăng nhập một lần và giữ phiên lâu dài. Không build app native, không sideload.

### Không làm trong V1
- Lịch kéo thả/time-blocking, kết nối Google Calendar, push notifications, reminder tự động, cron jobs.
- Tự chạy agent trong nền, multi-agent, LangGraph, fine-tune, vector DB/RAG.
- Tự đồng bộ GitHub, Gmail, Notion hoặc đo thời gian từ thiết bị.
- Hệ thống chấm điểm năng suất/tâm lý bằng AI, dự báo GPA chắc chắn, biểu đồ phức tạp.
- Giải bài, tạo flashcards, luyện quiz hay chấm bài trong Academic.
- Cộng tác nhóm, tài khoản nhiều người, phân quyền phức tạp.
- App iOS native, sideload, App Store; chế độ offline (ứng dụng cần mạng).
- AI đề xuất **xóa** dữ liệu (AI chỉ đề xuất tạo/sửa/đổi trạng thái/lưu trữ; xóa cứng chỉ làm thủ công trong UI).
- Phân loại intent bằng một lượt gọi LLM riêng; tóm tắt hội thoại dài bằng LLM; khôi phục (import) từ file JSON đã xuất.

## 3. Information architecture / UI

### 3.1. Khung chung

```text
┌──────────────────────┬───────────────────────────────────────────────┐
│  Personal AI         │                                               │
│  [ Chat ]            │       NỘI DUNG SCREEN ĐANG CHỌN               │
│  [ Context ]         │                                               │
│                      │                                               │
│  Recent chats        │                                               │
│  • Today plan        │                                               │
│  • Weekly review     │                                               │
│                      │                                               │
│  Settings            │                                               │
└──────────────────────┴───────────────────────────────────────────────┘
```

- Sidebar gọn, có thể thu lại; trên mobile mở bằng menu. **Sidebar chính là nơi hiển thị lịch sử chat** — màn Chat không có cột lịch sử thứ hai.
- Thiết kế trung tính, ít màu, hỗ trợ dark/light mode, font rõ, nhiều khoảng thở.
- Chỉ có **hai đích điều hướng chính**; Settings là modal.
- Drawer chi tiết có URL riêng dạng `/context?tab=academic&item=<id>` để refresh/back hoạt động và Chat có thể link thẳng tới item. Trên mobile, drawer mở toàn màn hình.
- **Yêu cầu riêng cho iPhone PWA:** có web app manifest (`display: standalone`) và `apple-touch-icon`; viewport dùng `viewport-fit=cover` và chừa safe-area (tai thỏ, thanh home); chiều cao dùng `100dvh`; ô nhập có cỡ chữ từ 16px để Safari không tự zoom; composer của Chat và ô quick capture luôn nằm trên bàn phím; vùng chạm tối thiểu 44px. Hai thao tác phải làm được bằng một tay: ghi quick capture và duyệt thẻ đề xuất.

### 3.2. Screen 1 — Chat

**Bố cục:** chat ở giữa, thanh nhập cố định dưới cùng; nút tạo chat mới, đổi tên, xóa chat. Hỗ trợ copy nội dung, regenerate/retry, code block.

**Đầu cuộc chat:** gợi ý năm prompt: `Hôm nay nên làm gì?` · `Đánh giá tuần này` · `Môn nào cần chú ý?` · `Dự án nào đang bị giãn?` · `Cập nhật nhanh`.

`Cập nhật nhanh` là luồng check-in: AI hỏi lần lượt về tối đa ba item lâu chưa cập nhật nhất, owner trả lời tự do, AI gom thành một thẻ đề xuất. Đây là cách giữ state tươi mà không cần cron hay notification.

**Thanh chọn context** (nhỏ, gần composer): `Auto` (mặc định) | `All` | `Academic` | `Projects` | `Specific item`. Ý nghĩa chính xác xem mục 6.2: bản tổng quan toàn bộ luôn được gửi; lựa chọn này chỉ quyết định item nào được **mở rộng chi tiết**.

**Định dạng câu trả lời ưu tiên:** kết luận ngắn → 1–3 bằng chứng → khuyến nghị cụ thể → điều chưa chắc chắn nếu có. Với kế hoạch ngày, tối đa ba ưu tiên chính, kèm lý do. Không tạo ra deadline hoặc tỷ lệ hoàn thành không có nguồn.

**Nguồn đã dùng:** dưới mỗi câu trả lời của AI hiển thị dòng `Dựa trên:` gồm các chip item đã được đưa vào context kèm ngày cập nhật cuối (ví dụ `Mobile Programming · 20/11`), bấm vào mở drawer. Danh sách này do **server ghi lại khi dựng context**, không phụ thuộc vào việc model tự trích dẫn.

**Khi AI muốn sửa dữ liệu:** hiển thị thẻ `Proposed changes` với từng hành động, ví dụ:

```text
Đề xuất cập nhật
☑ Mobile Programming: topic “Navigation” → Familiar
☑ Thêm log: “22/11: đã đọc xong phần Navigation”
[Approve] [Edit] [Reject]
```

- Mỗi hành động có checkbox để duyệt một phần. `Edit` cho sửa giá trị ngay trên thẻ; bản đã sửa được validate lại ở server như đề xuất gốc.
- Không ghi database khi người dùng chưa duyệt. Sau khi duyệt, thông báo **kết quả thực tế** từng hành động (thành công / lỗi / xung đột).
- Nếu dữ liệu đích đã đổi sau thời điểm AI đề xuất, thẻ báo xung đột và hiện giá trị hiện tại; không ghi đè mù.
- Regenerate một tin nhắn làm đề xuất cũ của tin nhắn đó chuyển sang `superseded`.
- **Undo (P1):** chỉ cho lô AI-approved gần nhất, chỉ khi các bản ghi liên quan chưa bị sửa tiếp; thực hiện bằng một thay đổi bù có log riêng, không xóa log cũ.

### 3.3. Screen 2 — Context

Header: `Context` · tab `[Academic] [Projects]` · search · `+ Add` · quick capture.

**Danh sách:** compact list (dạng card là P1); mỗi item thể hiện tên, trạng thái, milestone hoặc việc tiếp theo, ngày cập nhật cuối, cảnh báo khi thông tin thiếu/cũ, huy hiệu số blocker đang mở. Không bắt buộc phải có phần trăm tiến độ. Phía trên danh sách có dải `Cần cập nhật` liệt kê các item active quá 7 ngày chưa đụng tới (ngưỡng chỉnh trong Settings).

**Drawer chi tiết dùng chung:**
- **Overview:** mục tiêu, mô tả ngắn, trạng thái (`Unknown / Not started / Active / Blocked / On hold / Completed`), priority (`High / Medium / Low`), ngày bắt đầu, deadline nếu có, next action, tên gọi tắt (aliases). Trạng thái do owner đặt, **không tự suy ra** từ blocker hay task.
- **Tasks:** việc cụ thể, status (`Todo / Doing / Done / Blocked`), due date tùy chọn, thời lượng ước lượng tùy chọn, loại deadline (`Hard / Committed / Flexible`).
- **Notes:** ghi chú Markdown đơn giản, autosave; tìm kiếm nội dung cơ bản (P1).
- **Activity:** timeline logs gồm thời gian, tác nhân (`manual / ai_approved / seed / undo`), thay đổi và nguồn.

**Academic — trường riêng:**
- Tên môn, học kỳ, số tín chỉ (optional), mục tiêu điểm (mặc định A), ghi chú hình thức đánh giá.
- **Topics tracker:** danh sách chương/chủ đề; trạng thái `Not started / Familiar / Practiced / Confident`; bằng chứng tự khai báo (ví dụ bài tập/quiz/điểm) là tùy chọn.
- **Assessments:** tên kỳ thi/bài lab, ngày, trọng số và điểm nếu biết; không bắt buộc nhập đầy đủ.
- Mục `Course content overview`: syllabus, mục lục, chủ đề chính, liên kết tài liệu để AI biết **môn đang học gì**, không phải để dùng app như tài liệu giảng dạy.
- **Academic progress:** số topic và task đã đạt mục tiêu, đánh giá định tính có dẫn chứng; không đồng nhất với GPA.

**Projects — trường riêng:**
- Mô tả mục tiêu, vai trò của người dùng, đối tác/nhóm nếu muốn, nhịp độ mong muốn (optional).
- **Milestones:** deliverable, target date, status, completion criteria.
- **Blockers:** vấn đề đang mắc, bước thử gần nhất, next experiment/action, phụ thuộc bên ngoài nếu có, trạng thái `Open / Resolved`.
- Project health là **danh sách tín hiệu thực** (deadline gần nhất, milestone trễ, số blocker mở, số ngày chưa cập nhật), không phải một điểm số tổng hợp; **không suy diễn** rằng ít logs = ít làm việc.

**Quyền riêng tư với AI:** mỗi area và mỗi note có công tắc `Không gửi cho AI`. Khi bật, server loại bản ghi đó khỏi mọi context gửi tới provider. Dùng cho nội dung NDA hoặc nhạy cảm.

**Quick capture:** ô nhập một dòng/nhiều dòng: “Database lab đã nộp; Question House chưa fix được login; tuần này cần xem syllabus Mobile”. Mặc định lưu thành inbox note chưa phân loại. Có nút `Extract suggestions` để AI phân loại thành task/log/update; kết quả đi qua **đúng cùng** thẻ đề xuất và luồng duyệt như ở Chat.

## 4. Seed data ban đầu (chỉ là bản nháp, sửa được)

**Academic:** Technical Writing; Database (+ Lab); Algebra (improvement); Computer Networks (+ Lab); Introduction to Communications Engineering; C Programming (improvement); Mobile Programming; Software Engineering; Tư tưởng Hồ Chí Minh.

- Môn có Lab mặc định là **một** area; phần lab thể hiện bằng assessments/tasks. Owner có thể tách ở bước review.
- Term goal: GPA 4.0/4.0, 23 tín chỉ (tổng theo thông tin đã cung cấp; **không tự phân bổ tín chỉ cho các môn**). Lưu ở `settings.term_goal`.
- Computer Networks / Introduction to Communications Engineering: đang theo tiến độ, theo tự đánh giá.
- Mobile Programming / Software Engineering: chưa bắt đầu ôn/học có hệ thống theo cập nhật gần đây; cần xác minh syllabus và phương thức thi.
- Các môn còn lại để status `Unknown` cho tới khi người dùng cập nhật; không tự tạo điểm số.

**Projects:** LLM4AD/LLMEC — personal research; Research Assistant — hỗ trợ nhóm khác; Question House — Android app; StewieSAT — website/platform; ATGT Competition — thi tháng 1/2027.

Các item seed được hiển thị trong modal onboarding `Review & import`; owner có thể sửa hoặc bỏ chọn trước khi lưu. Bản ghi nhập từ seed mang origin `seed` và hiển thị nhãn “chưa xác minh lại” cho tới lần sửa đầu tiên. Không đưa nội dung trò chuyện cũ vào database như thể đã được xác minh mới nhất.

## 5. Dữ liệu và nguồn sự thật

**Nguyên tắc:** Database là nguồn sự thật cho trạng thái hiện tại. Chat transcript chỉ là lịch sử tương tác.

**Không dùng event sourcing.** Các bảng nghiệp vụ (`areas`, `tasks`, `topics`, …) **chính là** trạng thái hiện tại. `activity_logs` là nhật ký kiểm toán chỉ-thêm, được ghi **trong cùng transaction** với mỗi thay đổi; không có bảng `current_state` riêng và không dựng lại state từ log.

### Các bảng tối thiểu

| Bảng | Trường chính | Chức năng |
|---|---|---|
| `areas` | id, kind (`academic/project`), name, aliases (JSON), summary, goal, status, priority, start_date?, deadline_date?, next_action, ai_excluded, archived_at?, created_at, updated_at | Đối tượng cấp cao |
| `academic_details` | area_id, term, credits?, target_grade?, grading_scheme?, exam_format?, course_outline? | Thông tin môn |
| `project_details` | area_id, role?, collaborators?, scope?, cadence? | Thông tin dự án |
| `topics` | id, area_id, title, status, evidence?, sort_order, updated_at | Theo dõi nội dung môn |
| `milestones` | id, area_id, title, acceptance_criteria, target_date?, status, updated_at | Kết quả dự án |
| `blockers` | id, area_id, title, last_attempt?, next_action?, external_dependency?, status (`open/resolved`), created_at, resolved_at?, updated_at | Vướng mắc dự án |
| `tasks` | id, area_id, milestone_id?, title, status, due_date?, due_time?, deadline_type, estimate_minutes?, blocked_reason?, sort_order, updated_at | Công việc |
| `assessments` | id, area_id, title, due_date?, weight?, score?, max_score?, updated_at | Bài thi/lab/điểm thành phần |
| `notes` | id, area_id?, text, inbox_status, ai_excluded, created_at, updated_at | Ghi chú và quick capture |
| `activity_logs` | id, area_id?, entity_type, entity_id, action, before_json?, after_json?, origin, batch_id?, created_at | Nhật ký chỉ-thêm |
| `conversations` | id, title, created_at, updated_at | Cuộc chat |
| `messages` | id, conversation_id, role, content, metadata?, created_at | Hội thoại; `metadata.context_refs` lưu các item đã đưa vào context |
| `pending_actions` | id, conversation_id?, message_id?, note_id?, source (`chat/capture`), actions_json, status (`pending/applied/partially_applied/rejected/superseded/failed`), error?, created_at, resolved_at? | Các thay đổi cần duyệt |
| `settings` | id (một dòng duy nhất), timezone, default_focus_minutes?, stale_after_days, term_goal?, preferences_json | Cấu hình cá nhân |

- Không có `owner_id`: chỉ một tài khoản được phép, mọi route đã chặn ở lớp đăng nhập, và RLS chặn toàn bộ Data API (mục 8). UUID cho ID.
- **Ngày và giờ:** trường chỉ-ngày (`due_date`, `target_date`, `deadline_date`, `start_date`) dùng kiểu `date`, **không** lưu thành timestamp UTC (tránh lệch một ngày ở +07:00). Mốc thời điểm (`created_at`, `updated_at`, …) lưu `timestamptz`; UI hiển thị theo `Asia/Ho_Chi_Minh`.
- Thêm/xóa/sửa task, topic, milestone, blocker, assessment đều tạo log. `activity_logs` không có đường sửa/xóa ở tầng ứng dụng.
- **Provider và model chỉ cấu hình qua biến môi trường** — không có cột trong `settings`, để chỉ có một nguồn sự thật.
- **Nguồn gốc dữ liệu:** vì mọi ghi đều do owner nhập hoặc duyệt, database không lưu “suy luận của AI”. Suy luận chỉ tồn tại trong câu trả lời chat. Cách bản ghi đi vào hệ thống được ghi ở `activity_logs.origin`.
- Nếu một item không được cập nhật lâu, hiển thị `Last updated` và đưa vào dải `Cần cập nhật`; chỉ nhắc kiểm tra, không tự chuyển trạng thái.
- Không dùng một trường `% complete` tự tính tùy tiện; nếu có progress bar phải chỉ rõ mẫu số (ví dụ 3/7 milestones hoặc 5/12 topics).

## 6. AI engine và context pipeline

### 6.1. Mô hình gọi API

```text
User Chat / Quick Capture
  → Next.js server route (kiểm tra phiên đăng nhập owner)
  → Context builder (thuần code, không gọi LLM)
  → Provider adapter (fosta | mock | provider khác)
  → LLM response (+ proposed actions)
  → Validate bằng schema + kiểm tra ID tồn tại
  → Lưu pending_actions → User duyệt trong UI
  → Transaction: ghi dữ liệu + activity log
```

**Chọn provider:** Fosta làm provider test đầu tiên, dùng `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` từ server environment. Không hardcode model tên “6.1 Sol”; model ID thực tế phải lấy từ thông tin provider/test. Không có cơ sở xác thực rằng gateway thực sự chạy model được quảng cáo. Adapter cần hỗ trợ thay bằng nhà cung cấp khác.

**Bài kiểm tra tương thích (Phase 0, bắt buộc trước khi viết code AI):** một script `ai:probe` gọi provider với dữ liệu mô phỏng và ghi báo cáo cho bốn khả năng: (1) chat thường, (2) streaming, (3) tool calling trả đúng arguments theo schema, (4) JSON output hợp lệ theo schema trong 5/5 lần thử. Kết quả quyết định `AI_ACTION_MODE`:

| Mode | Điều kiện | Hành vi |
|---|---|---|
| `tools` | (3) đạt | Model gọi tool `propose_changes` |
| `json` | (3) trượt, (4) đạt | Model xuất khối JSON `proposed_actions`, server parse |
| `off` | cả hai trượt | Chat chỉ tư vấn bằng văn bản; cập nhật làm thủ công |

Cả `tools` và `json` cho ra **cùng một kiểu** `ProposedAction[]` và đi chung một đường validate. Nếu (1) trượt thì đổi provider trước khi làm Phase 2.

**Mock provider:** `AI_PROVIDER=mock` trả câu trả lời và đề xuất cố định theo kịch bản; dùng cho toàn bộ test tự động và để phát triển khi Fosta lỗi. Test không được phụ thuộc mạng.

**Fallback bắt buộc:** Nếu output không hợp lệ, chỉ hiển thị phần văn bản, không tạo pending action, không ghi dữ liệu. Không giả vờ đã update. Khi provider lỗi, UI thủ công vẫn dùng được đầy đủ.

### 6.2. Context builder

Quy mô dữ liệu V1 nhỏ (khoảng 14 areas), nên **không cần bước phân loại intent**. Context dựng bằng code theo hai tầng:

**Tầng 1 — Portfolio snapshot (luôn gửi, mọi lượt chat):**
- Ngày giờ hiện tại theo `Asia/Ho_Chi_Minh`, thứ trong tuần, ranh giới tuần; term goal.
- Mỗi area chưa lưu trữ: id, tên, kind, status, priority, next_action, `last_updated`, origin gần nhất, số topic theo từng trạng thái hoặc số milestone theo trạng thái, số task mở, tiêu đề các blocker đang mở.
- Mọi task quá hạn hoặc đến hạn trong 14 ngày; mọi assessment trong 21 ngày. `days_left` do **server tính sẵn** — model không tự làm phép tính ngày.
- Danh sách dữ liệu còn thiếu đáng chú ý (môn chưa có topic, chưa có ngày thi, status `Unknown`).

**Tầng 2 — Chi tiết item (mở rộng theo thanh chọn context):**
- `Specific item`: item được chọn. `Academic` / `Projects`: mọi item active của nhóm đó. `All`: mọi item active.
- `Auto`: item có tên hoặc alias xuất hiện trong tin nhắn hiện tại hoặc ba lượt gần nhất. Không khớp item nào thì chỉ dùng Tầng 1 — đủ cho câu hỏi tổng thể.
- Nội dung chi tiết: overview đầy đủ, toàn bộ topics/milestones/blockers/assessments, task chưa xong, notes gần đây, 10–20 logs gần nhất.

**Quy tắc chung:**
- Mọi bản ghi trong context đều kèm **ID thật** để đề xuất cập nhật tham chiếu chính xác.
- Bản ghi có `ai_excluded` không bao giờ rời server.
- Ngân sách context khoảng 8k token; khi vượt thì cắt theo thứ tự: logs cũ → notes cũ → task đã xong → chi tiết của item ưu tiên thấp.
- Hội thoại: chỉ gửi N lượt gần nhất (mặc định 10). Database state luôn được ưu tiên hơn câu trả lời cũ.
- Server ghi danh sách item đã dùng vào `messages.metadata.context_refs` để UI hiển thị `Dựa trên:`.
- Nội dung notes/course outline là **dữ liệu, không phải chỉ thị**: system prompt nêu rõ điều này; cổng duyệt là lớp bảo vệ cuối.
- Không cần embeddings trong V1.

**(P1)** Khi `AI_ACTION_MODE=tools`, có thể bật thêm read tool `getAreaDetails` để model tự lấy chi tiết item mà `Auto` bỏ sót.

### 6.3. Hợp đồng đề xuất thay đổi

Các hàm đọc (`getPortfolioSnapshot`, `getAreaDetails`, `listUpcomingTasks`, `getRecentLogs`, `searchNotes`) là **hàm nội bộ của server**, dùng chung cho context builder và UI.

Ghi dữ liệu qua AI dùng **một** cơ chế: `propose_changes({ summary, actions: ProposedAction[] })`. `ProposedAction` là discriminated union, validate bằng Zod:

`create_task` · `update_task` · `update_area` · `upsert_topic` · `upsert_milestone` · `upsert_assessment` · `create_note` · `add_progress_log` · `create_blocker` · `resolve_blocker`

- Hành động cập nhật phải mang `id` của bản ghi đích; server từ chối ID không tồn tại. Khi lưu đề xuất, **server tự ghi lại `updated_at` hiện tại của từng bản ghi đích** làm mốc phát hiện xung đột lúc duyệt — model không phải tự chép timestamp.
- Khi owner nhắc tới thứ chưa tồn tại (ví dụ topic “VLSM” chưa có trong môn), AI đề xuất **tạo mới** và nói rõ là tạo mới, không gán nhầm vào bản ghi gần giống.
- Luồng: `propose → validate → lưu pending → preview diff → approve (toàn bộ/một phần/đã sửa) → validate lại → commit → log`.
- **Idempotency:** endpoint approve chuyển trạng thái `pending → applied` bằng cập nhật có điều kiện trong cùng transaction với thay đổi dữ liệu; lần gọi thứ hai không tìm thấy bản `pending` nên không ghi gì.
- Mỗi lô duyệt có một `batch_id` chung trên các log, phục vụ hiển thị và Undo.
- Không có hành động xóa trong V1.

### 6.4. Quy tắc trả lời (system behavior)

1. Tôn trọng mục tiêu GPA 4.0 nhưng không giả định tất cả môn đều cần số giờ bằng nhau.
2. Academic dùng cho tracking, **không tự khởi động buổi giảng bài**, trừ khi sau này người dùng mở rộng phạm vi sản phẩm.
3. Không tự tạo deadline, phần trăm tiến độ, điểm số hay tuyên bố đã hoàn thành nếu thiếu bằng chứng.
4. Khi đưa nhận định, phân biệt bốn mức: `Confirmed` (có bằng chứng ghi trong dữ liệu: điểm, ngày thi, trường evidence), `User reported` (owner tự đặt, không kèm bằng chứng; bản ghi origin `seed` cũng thuộc mức này và cần nói rõ là chưa xác minh lại), `Inferred` (suy luận của AI trong câu trả lời), `Unknown` (dữ liệu trống).
5. Khi hỏi “nên làm gì”, đề xuất tối đa ba ưu tiên, chỉ rõ đánh đổi và điều kiện giả định về thời gian trống. Nếu không biết thời gian, cho kế hoạch ngắn có điều kiện; hỏi một câu chỉ khi thật sự cần.
6. Khi một task bị dời nhiều lần, nêu **giả thuyết** về blocker/avoidance, không kết luận tâm lý.
7. Chỉ cập nhật khi được duyệt, không che giấu lỗi ghi dữ liệu; khi provider lỗi, UI manual vẫn dùng được.
8. Việc không gửi bí mật/nội dung NDA tới provider được **thực thi ở server** qua cờ `ai_excluded` và việc context builder chỉ đọc các bảng của ứng dụng — không trông vào lời dặn trong prompt. Ứng dụng không đọc source code hay file ngoài database.
9. Dùng ngày giờ và `days_left` server cung cấp; không tự tính ngày.

## 7. Các user flows tối thiểu

**A. Hỏi kế hoạch hôm nay**
- Mở Chat → chọn gợi ý `Hôm nay nên làm gì?` → server dựng snapshot → AI trả lời ba việc ưu tiên với lý do và các giả định → nếu người dùng yêu cầu, AI đề xuất tạo task hoặc đổi due date → duyệt → Context cập nhật.

**B. Cập nhật tiến độ bằng ngôn ngữ tự nhiên**
- Người dùng: “Hôm nay tôi học phần VLSM và giải được 5 bài; đánh dấu đang luyện tập.”
- `Auto` khớp alias/tên môn → AI thấy topic VLSM (hoặc đề xuất tạo mới nếu chưa có) → thẻ đề xuất: topic → `Practiced`, evidence “5 bài”, thêm log → user Approve → lưu transaction → các cuộc chat sau đọc state mới.

**C. Cập nhật thủ công**
- Context → Academic → mở Computer Networks → sửa topic status / thêm note → save → log được tạo → Chat có context mới mà không cần kể lại.

**D. Xử lý blocker ở dự án**
- Context → Projects → Question House → thêm blocker `Login Android chưa chạy` → cập nhật bước thử trước đó → Chat: “Tại sao tôi cứ né Question House?” → AI kiểm tra blocker và lịch sử đổi task, đưa ra **giả thuyết có bằng chứng**, đề xuất một next action nhỏ.

**E. Rà soát tổng thể**
- Chat: `Tuần này có gì đáng lo?` → hệ thống nêu các deadline gần, item chưa bắt đầu, milestone không tiến, dữ liệu cũ, cùng mức độ chắc chắn và biện pháp cụ thể. Không tạo cảnh báo giả từ thiếu dữ liệu.

**F. Check-in nhanh**
- Chat: `Cập nhật nhanh` → AI hỏi về tối đa ba item lâu chưa cập nhật nhất → owner trả lời một tin → một thẻ đề xuất gom các thay đổi → duyệt. Mục tiêu: dưới một phút.

## 8. Kiến trúc công nghệ V1

- **Frontend + backend:** Next.js + TypeScript (App Router / server route handlers).
- **UI:** Tailwind CSS + shadcn/ui; markdown renderer; responsive, dark/light mode.
- **Database:** Supabase Postgres, truy cập bằng **Drizzle** (đã chọn; nhẹ trên serverless). Dùng connection string dạng pooler cho môi trường serverless, tắt prepared statements theo hướng dẫn của Supabase.
- **Truy cập dữ liệu:** **toàn bộ** truy vấn chạy ở server qua Drizzle. Trình duyệt không query Supabase trực tiếp; Supabase client phía trình duyệt chỉ dùng cho đăng nhập.
- **Auth:** Supabase Auth, đăng nhập bằng **email + mật khẩu**; tắt public signup trong cấu hình project; server kiểm tra email của phiên khớp `APP_OWNER_EMAIL` ở mọi route và server action. **Không dùng magic link:** trên iOS, link trong email mở bằng Safari chứ không mở app ở màn hình chính, và hai nơi này không dùng chung phiên đăng nhập. Owner tự đặt và tự nhập mật khẩu; coding agent không tạo hay lưu mật khẩu thật.
- **Môi trường dev và test:** dev local và test tự động đều chạy trên PGlite (Postgres chạy trong tiến trình) với phiên đăng nhập giả lập (`DB_DRIVER=pglite`, `AUTH_MODE=dev`), không cần Supabase hay mạng. Build production **từ chối khởi động** nếu gặp một trong hai giá trị đó.
- **AI SDK:** Vercel AI SDK với provider OpenAI-compatible, hoặc OpenAI SDK thuần; bọc sau một interface `AiProvider` có hai cài đặt `fosta` và `mock`.
- **Deploy:** Vercel cho web, Supabase cho DB; đặt vùng chạy function của Vercel **cùng khu vực** với database (ví dụ Singapore) để giảm độ trễ. Route chat đặt `maxDuration` đủ cho streaming trong giới hạn gói Vercel đang dùng. Project cần **repo Git riêng, private** để nối với Vercel (thư mục hiện nằm trong một repo cha).
- **Security:**
  - **Bật RLS trên mọi bảng và không tạo policy nào** cho role `anon`/`authenticated` — bắt buộc dù không query từ client. Lý do: anon key nằm trong bundle frontend, và Data API của Supabase có thể phục vụ các bảng trong schema `public` cho bất kỳ ai cầm key đó nếu bảng không bật RLS. Kiểm chứng bằng acceptance criterion 13.
  - Auth mọi trang, route và server action; request ghi có `Origin` lạ bị từ chối.
  - Validate phía server bằng Zod, giới hạn kích thước payload và số token mỗi request, logs không chứa API key hay nội dung context.
  - Không dựng hạ tầng rate limit riêng; thay bằng trần số request AI mỗi ngày đếm trong DB, để một vòng lặp lỗi không đốt hết quota.
  - Chỉ gửi context cần thiết tới provider bên thứ ba.
- **Sao lưu:** nút export JSON là đường lui chính; owner nên tải về định kỳ. Kiểm tra gói Supabase đang dùng có backup tự động hay không và có tạm dừng project khi lâu không hoạt động hay không. **(P1)** dump database định kỳ bằng GitHub Actions.
- **Migration:** provider adapter không gắn chặt model; dữ liệu không phụ thuộc Fosta; file export JSON có trường `schema_version`.

### Environment example

```dotenv
DATABASE_URL=...               # pooler connection string, server only
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...   # chỉ dùng cho đăng nhập
APP_OWNER_EMAIL=...
DB_DRIVER=postgres             # postgres | pglite (pglite chỉ cho dev/test)
AUTH_MODE=supabase             # supabase | dev (dev chỉ cho dev/test)
AI_DAILY_REQUEST_CAP=200
AI_PROVIDER=fosta              # fosta | mock
AI_BASE_URL=https://codex.fosta.app/v1
AI_API_KEY=...
AI_MODEL=...                   # provider-compatible model ID, verify before use
AI_ACTION_MODE=off             # tools | json | off — đặt theo kết quả ai:probe
```

Không dùng `SUPABASE_SERVICE_ROLE_KEY` trong V1. Không commit `.env`, không đưa key AI hay `DATABASE_URL` vào frontend; biến môi trường production đặt trong Vercel. Trong bản thử nghiệm đầu tiên dùng dữ liệu mô phỏng/đã loại thông tin nhạy cảm; chỉ đưa dữ liệu thực vào sau khi cân nhắc rủi ro của gateway bên thứ ba.

## 9. API / service endpoints gợi ý

| Route | Ý nghĩa |
|---|---|
| `POST /api/chat` | Stream câu trả lời; dựng context; nhận đề xuất |
| `GET/POST /api/conversations`, `PATCH/DELETE /api/conversations/:id` | Danh sách, tạo, đổi tên, xóa chat |
| `GET/POST /api/areas` | List/create Academic hoặc Project |
| `GET/PATCH /api/areas/:id` | Chi tiết/cập nhật overview/lưu trữ |
| `GET/POST/PATCH/DELETE /api/tasks` | CRUD tasks |
| `GET/POST/PATCH/DELETE /api/topics` | Academic topics |
| `GET/POST/PATCH/DELETE /api/assessments` | Academic assessments |
| `GET/POST/PATCH/DELETE /api/milestones` | Projects milestones |
| `GET/POST/PATCH/DELETE /api/blockers` | Projects blockers |
| `GET/POST/PATCH/DELETE /api/notes` | Notes và inbox |
| `POST /api/notes/:id/extract` | Quick capture → pending action |
| `GET /api/activity?areaId=...` | Timeline logs |
| `GET /api/portfolio/snapshot` | Tổng hợp read-only cho UI và AI |
| `POST /api/actions/:id/approve` | Duyệt (toàn bộ/một phần/đã sửa), transaction + log |
| `POST /api/actions/:id/reject` | Từ chối đề xuất |
| `POST /api/actions/:id/undo` | (P1) Hoàn tác lô gần nhất |
| `GET /api/export` | Xuất dữ liệu cá nhân JSON |

Đây là gợi ý hợp đồng API; coding agent có thể gộp route hoặc dùng server actions nếu implementation gọn hơn mà vẫn đảm bảo CRUD và audit. Mọi thao tác ghi đi qua **một lớp service duy nhất** (ghi dữ liệu + log trong một transaction), dùng chung cho UI thủ công và luồng duyệt đề xuất.

## 10. Kế hoạch thực thi giao cho coding agent

**Phase 0 — Nền và kiểm chứng:** Scaffold Next.js, Drizzle schema + migration trên Supabase Postgres, bật RLS mọi bảng, đăng nhập owner-only bằng email + mật khẩu, manifest PWA + icon, **deploy bản khung lên Vercel**, interface `AiProvider` + mock, script `ai:probe` chạy với Fosta và ghi báo cáo.  
*Xong khi:* bản deploy mở và đăng nhập được trên máy tính **và** trên iPhone qua `Add to Home Screen` (owner tự kiểm tra); criteria 1, 11, 13 đạt; có báo cáo probe và giá trị `AI_ACTION_MODE` đã chọn.

**Phase 1 — Working shell:** Hai screen, sidebar, lớp service ghi + log, CRUD Areas/Tasks/Topics/Assessments/Milestones/Blockers/Notes, drawer có URL, dải `Cần cập nhật`, onboarding `Review & import`, export JSON. UI dùng tốt khi AI tắt.  
*Xong khi:* criteria 2, 3, 4, 15, 17 đạt.

**Phase 2 — Context-aware Chat:** conversations/messages, streaming, adapter Fosta, context builder hai tầng, dòng `Dựa trên:`, prompt gợi ý.  
*Xong khi:* criteria 5, 6, 9 đạt; unit test context builder xanh với mock provider.

**Phase 3 — AI updates & polish:** `propose_changes`, pending actions, thẻ duyệt (một phần/sửa/xung đột), quick capture extraction, luồng `Cập nhật nhanh`, xử lý lỗi, responsive, README, E2E test. Sau đó mới tới các mục P1 (Undo, card view, tìm kiếm note, read tool).  
*Xong khi:* criteria 7, 8, 10, 12, 14, 16 đạt.

**Ưu tiên:** Demo được luồng end-to-end ngay sau mỗi phase; mỗi màn hình mới phải được kiểm tra ở bề rộng iPhone ngay trong phase tạo ra nó, không dồn responsive về cuối; không dựng hạ tầng mới nếu chưa có tính năng V1 cần nó. Nếu Phase 0 cho kết quả `off`, vẫn làm trọn Phase 1–2; Phase 3 chỉ làm sau khi đổi được provider hỗ trợ `tools` hoặc `json`.

## 11. Acceptance criteria — V1 được coi là hoàn thành khi

1. Chỉ tài khoản owner đăng nhập được. Khi chưa đăng nhập, mọi trang chuyển về màn đăng nhập và mọi API trả 401; không thể tự đăng ký tài khoản mới.
2. Chỉ có hai screen chính Chat và Context; Context có đúng hai tab Academic / Projects.
3. Thêm/sửa môn, chủ đề, assessment, task, project, milestone, blocker, note từ UI mà không gọi AI; mỗi thay đổi sinh đúng một log.
4. Khởi tạo được seed data đã được owner duyệt; không tự điền điểm hoặc trạng thái không biết.
5. Nhắn “Mobile Programming đang ở tình trạng nào?” → trả về đúng state/last_updated từ DB.
6. Thay đổi topic status bằng UI → mở chat mới vẫn đọc trạng thái mới.
7. Nhắn “Tôi đã hoàn thành chương 1 Mobile” → AI đề xuất thay đổi; không ghi trước khi approve.
8. Duyệt cập nhật → dữ liệu thay đổi đúng một lần (kể cả khi bấm Approve hai lần), log thể hiện thời gian và nguồn; từ chối → không thay đổi.
9. Nhắn “Tuần này có gì đáng lo?” → chỉ ra các vấn đề có bằng chứng, dữ liệu thiếu phải nêu thiếu.
10. Fosta lỗi hoặc tool calling không được hỗ trợ → UI không bị hỏng; không ghi dữ liệu sai; có thông báo lỗi rõ ràng.
11. Không có API key AI hay `DATABASE_URL` trong bundle frontend, log hoặc repo.
12. Có `README.md`, `.env.example`, schema migration, lệnh seed, lệnh chạy local, lệnh test; có unit tests cho context builder và approval flow, cùng một end-to-end test cho cập nhật từ chat. **Toàn bộ test chạy với mock provider, không cần mạng.**
13. Gọi Data API của Supabase bằng anon key (không đăng nhập) tới bất kỳ bảng nào → không trả về dòng dữ liệu nào.
14. Sửa một bản ghi bằng UI sau khi AI đã đề xuất thay đổi nó, rồi bấm Approve → hệ thống báo xung đột, không ghi đè mù.
15. Task có due date là hôm nay (giờ Việt Nam) hiển thị đúng “hôm nay” lúc 00:30 và 23:30; bản ghi có `ai_excluded` không xuất hiện trong payload gửi provider.
16. Trên iPhone: `Add to Home Screen` mở app toàn màn hình, không có thanh địa chỉ Safari; đăng nhập một lần trong app đó và phiên vẫn còn sau khi đóng mở lại; chạm vào ô nhập không làm trang tự zoom; composer không bị bàn phím che; ghi một quick capture và duyệt một thẻ đề xuất đều làm được bằng một tay.
17. Nút export tải về một file JSON chứa đủ mọi bảng nghiệp vụ và trường `schema_version`.

## 12. Definition of success sau 2 tuần sử dụng

V1 thành công nếu người dùng có thể: (a) xem mọi môn và dự án ở một chỗ; (b) ghi nhận thay đổi trong dưới một phút với một note hoặc một lần chat; (c) hỏi một câu ngắn và nhận đề xuất phù hợp với state mới nhất; (d) không phải nhắc lại những việc đã cập nhật; (e) phân biệt thông tin xác thực với suy luận của AI; (f) **cuối tuần thứ hai, phần lớn item active có `last_updated` trong vòng 7 ngày** — chỉ dấu rằng thói quen cập nhật đã hình thành.

Không tối ưu “AI thông minh đến mức nào” trong V1; tối ưu **độ tin cậy của state, friction nhập liệu thấp và chất lượng quyết định có giải thích**.

---

### Chỉ dẫn cuối cùng cho coding agent

Build the smallest working single-user app that satisfies this spec. Do not add pages beyond the two primary screens, do not introduce multi-agent orchestration, vector search, event sourcing, or an LLM-based intent classifier, do not invent progress data, and never silently execute LLM-proposed writes. The app is deployed on Vercel with Supabase Postgres and a single owner account (email + password, no magic links, signups disabled); enable RLS with no policies on every table and keep all queries server-side. The owner's iPhone uses the deployed site as a PWA via Add to Home Screen; do not build a native or sideloaded iOS app, and check every screen at iPhone width as you build it. Work in order: Phase 0 (scaffold, RLS, auth, skeleton deploy, provider probe, mock provider) → schema + manual CRUD → context-aware chat → approval-based AI updates. Finish every P0 item of a phase before touching any P1 item. Keep the AI provider replaceable and handle Fosta API incompatibilities gracefully. All automated tests must pass against the mock provider. Deliver runnable code, tests, migrations, seed preview, and setup instructions.

---

## Phụ lục A — Thay đổi so với bản 1.0

**Sửa mâu thuẫn nội bộ**
- Ví dụ thẻ đề xuất dùng topic status `In progress` không có trong enum → đổi thành `Familiar`.
- Seed dùng `Status unknown` nhưng enum trạng thái area không có → thêm `Unknown`.
- UI và tool có Blockers nhưng thiếu bảng và route → thêm bảng `blockers`, route, action.
- Assessments có bảng nhưng thiếu route và action ghi → thêm.
- `current_state` được nhắc nhưng không định nghĩa → nói rõ không event sourcing; bảng nghiệp vụ là state, log ghi cùng transaction.
- Provider/model vừa ở `settings` vừa ở env → chỉ còn env.
- Lịch sử chat bị mô tả ở cả sidebar lẫn cột trái của Chat → chỉ còn sidebar.
- `areas` thiếu các trường mà Overview yêu cầu (ngày bắt đầu, deadline, lưu trữ); `academic_details` thiếu mục tiêu điểm; `project_details` thiếu nhịp độ → bổ sung. Trường `target` mơ hồ → thay bằng `goal`.

**Sửa rủi ro kỹ thuật**
- RLS từ “nếu query từ client” thành **bắt buộc trên mọi bảng**, kèm criterion 13.
- Trường ngày dùng kiểu `date` thay vì timestamp UTC; server tính sẵn `days_left`; ngày giờ hiện tại đưa vào context.
- Context phải mang ID thật và `updated_at`; thêm kiểm tra xung đột khi duyệt (criterion 14).
- Quy tắc “không gửi bí mật tới Fosta” chuyển từ lời dặn trong prompt thành cờ `ai_excluded` thực thi ở server.
- Bỏ “rate limit cơ bản” (cần hạ tầng ngoài) → trần request AI mỗi ngày đếm trong DB.
- Bỏ `SUPABASE_SERVICE_ROLE_KEY`; chọn dứt khoát Drizzle và mô hình “mọi truy vấn ở server”.

**Đơn giản hóa**
- Bỏ bước “Intent” → context builder hai tầng thuần code, dùng alias để khớp item.
- Chín write tool riêng → một `propose_changes` với union action; chế độ `tools`/`json`/`off` dùng chung đường validate.
- Read tools thành hàm nội bộ; model tự gọi read tool là P1.
- AI không đề xuất xóa; tóm tắt hội thoại dài thay bằng cắt N lượt gần nhất.
- Gắn nhãn P1 cho: Undo, card view, tìm kiếm nội dung note, read tool.

**Bổ sung để phục vụ đúng mục tiêu gốc**
- Phase 0 với script `ai:probe` và tiêu chí chọn mode; mock provider cho test.
- Tiêu chí “xong” của từng phase gắn với số acceptance criteria.
- Dòng `Dựa trên:` do server ghi (minh bạch nguồn không phụ thuộc model).
- Dải `Cần cập nhật` và luồng `Cập nhật nhanh` (giữ state tươi mà không cần cron/notification).
- Duyệt một phần, sửa trước khi duyệt, `superseded` khi regenerate; định nghĩa hẹp cho Undo.
- Định nghĩa cụ thể bốn mức `Confirmed / User reported / Inferred / Unknown`.
- Export chuyển lên Phase 1; thêm criteria 13–15 và tiêu chí thành công (f).

## Phụ lục B — Quyết định triển khai và iPhone

**Quyết định cuối:** deploy lên Vercel + Supabase; iPhone dùng bản deploy dưới dạng PWA.

**Các phương án đã cân nhắc và loại**
- *Chỉ chạy localhost:* gọn nhất, nhưng không dùng được trên điện thoại.
- *Localhost + Tailscale:* dùng được trên iPhone, nhưng chỉ khi laptop đang bật và không ngủ. Owner cần ghi nhanh cả lúc laptop tắt, nên loại.
- *Sideload app iOS:* cần máy Mac để build, app ký bằng Apple ID miễn phí hết hạn sau 7 ngày, và vẫn phải kết nối về server. PWA đạt cùng trải nghiệm mà không có các chi phí này.

**Thay đổi kéo theo so với Phụ lục A**
- Đăng nhập bằng email + mật khẩu, không magic link (vì cách iOS tách phiên giữa Safari và app ở màn hình chính).
- Bỏ `owner_id`: một tài khoản, chặn ở lớp đăng nhập, RLS chặn Data API.
- Vùng chạy function đặt cùng khu vực với database; repo Git riêng cho project.
- Test chạy trên PGlite, dev dùng một Supabase project riêng.
- Thêm yêu cầu giao diện iPhone PWA (mục 3.1), criterion 16 (iPhone) và 17 (export); Phase 0 phải deploy bản khung và mở được trên iPhone.

**Đánh đổi đã chấp nhận**
- Dữ liệu cá nhân nằm trên dịch vụ bên thứ ba (Supabase), và context của Chat vẫn được gửi tới provider AI.
- Ứng dụng cần mạng; không có chế độ offline.
- Phụ thuộc giới hạn của gói miễn phí Vercel/Supabase; cần kiểm tra chính sách backup và tạm dừng project.
