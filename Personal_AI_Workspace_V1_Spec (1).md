# PERSONAL AI WORKSPACE — V1
**Product & Technical Design Specification**  
**Phiên bản:** 1.0 — 22/11/2026  
**Đối tượng:** Một người dùng duy nhất (owner)  
**Mục tiêu:** Tài liệu giao cho coding agent để xây MVP; mọi chi tiết bên dưới là quyết định thiết kế ban đầu, có thể chỉnh sửa sau khi sử dụng.

## 1. Tuyên bố sản phẩm

Personal AI Workspace là một ứng dụng web cá nhân có **hai màn hình chính**:

1. **Chat:** giao diện hội thoại tương tự các AI chat hiện đại. AI hiểu bối cảnh học tập và dự án, có thể tư vấn và đề xuất cập nhật dữ liệu.
2. **Context:** quản lý trực quan toàn bộ trạng thái đang diễn ra, chia đúng **hai mục: Academic và Projects**.

**Giá trị cốt lõi:** Người dùng chỉ cần hỏi ngắn như “Hôm nay nên làm gì?”, “Tuần này ổn không?”, “Research đang mắc gì?” mà AI có thể trả lời dựa trên trạng thái mới nhất, nguồn dữ liệu cụ thể và lịch sử thay đổi — không phải yêu cầu giải thích lại bối cảnh.

Ứng dụng **không phải app để học bài**, không thay thế LMS, note-taking học thuật hoặc IDE. Academic chỉ lưu đủ **nội dung và cấu trúc môn học** để theo dõi mức độ sẵn sàng, tiến độ và rủi ro.

**Triết lý:** State-first, AI-second; ít thao tác; minh bạch lý do khuyến nghị; người dùng luôn kiểm soát dữ liệu.

## 2. Phạm vi V1 và những gì chưa xây

### Phải có trong V1
- Hai màn hình: `/chat` và `/context`; các chi tiết mở dưới dạng panel/drawer, không thành screen thứ ba.
- Chat nhiều cuộc hội thoại, streaming nếu provider hỗ trợ, Markdown, retry, lịch sử chat, prompt gợi ý.
- Context với hai tab Academic / Projects; danh sách, tìm kiếm, tạo/sửa/lưu trữ mục.
- Trang chi tiết dạng drawer của mỗi môn/dự án: overview, tiến độ, tasks, notes, logs; riêng Academic có topics, riêng Projects có milestones và blockers.
- CRUD trực tiếp bằng UI, không cần AI.
- AI đọc ngữ cảnh có cấu trúc; trả lời có giải thích, nêu dữ liệu nào hỗ trợ nhận định và dữ liệu nào chưa có.
- AI **đề xuất** các thay đổi dữ liệu qua tool calls / structured actions; UI cho xem bản xem trước và **duyệt** trước khi ghi.
- Quick capture (ghi chú tự do) đặt trong Context và có thể nhắn ngay tại Chat.
- Lưu lịch sử thay đổi (activity logs); cập nhật `current_state` nhất quán.
- Đăng nhập riêng tư, một owner; cấu hình LLM provider thay được, ban đầu dùng Fosta qua API tương thích OpenAI nếu kiểm thử đạt.
- Giao diện desktop-first nhưng dùng ổn trên điện thoại.

### Không làm trong V1
- Lịch kéo thả/time-blocking, kết nối Google Calendar, push notifications, reminder tự động, cron jobs.
- Tự chạy agent trong nền, multi-agent, LangGraph, fine-tune, vector DB/RAG.
- Tự đồng bộ GitHub, Gmail, Notion hoặc đo thời gian từ thiết bị.
- Hệ thống chấm điểm năng suất/tâm lý bằng AI, dự báo GPA chắc chắn, biểu đồ phức tạp.
- Giải bài, tạo flashcards, luyện quiz hay chấm bài trong Academic.
- Cộng tác nhóm, tài khoản nhiều người, phân quyền phức tạp.

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

- Sidebar gọn, có thể thu lại; trên mobile mở bằng menu.
- Thiết kế trung tính, ít màu, hỗ trợ dark/light mode, font rõ, nhiều khoảng thở.
- Chỉ có **hai đích điều hướng chính**; Settings là modal.

### 3.2. Screen 1 — Chat

**Bố cục:** lịch sử bên trái, chat ở giữa, thanh nhập cố định dưới cùng; nút tạo chat mới, đổi tên, xóa chat. Hỗ trợ copy nội dung, regenerate/retry, code block.

**Đầu cuộc chat:** gợi ý bốn prompt: `Hôm nay nên làm gì?` · `Đánh giá tuần này` · `Môn nào cần chú ý?` · `Dự án nào đang bị giãn?`.

**Thanh chọn context** (nhỏ, gần composer): `Auto` (mặc định) | `All` | `Academic` | `Projects` | `Specific item`. `Auto` tự lấy những mục phù hợp; `All` dùng khi người dùng hỏi tổng thể.

**Định dạng câu trả lời ưu tiên:** kết luận ngắn → 1–3 bằng chứng → khuyến nghị cụ thể → điều chưa chắc chắn nếu có. Với kế hoạch ngày, tối đa ba ưu tiên chính, kèm lý do. Không tạo ra deadline hoặc tỷ lệ hoàn thành không có nguồn.

**Khi AI muốn sửa dữ liệu:** hiển thị thẻ `Proposed changes` với từng hành động, ví dụ:

```text
Đề xuất cập nhật
• Mobile Programming: topic “Navigation” → In progress
• Thêm log: “22/11: đã đọc xong phần Navigation”
[Approve] [Edit] [Reject]
```

Không ghi database khi người dùng chưa duyệt. Sau khi duyệt, thông báo kết quả thực tế, cho phép Undo thao tác gần nhất nếu khả thi.

### 3.3. Screen 2 — Context

Header: `Context` · tab `[Academic] [Projects]` · search · `+ Add` · quick capture.

**Danh sách:** dạng card hoặc compact list tùy chọn; mỗi item thể hiện tên, trạng thái, milestone hoặc việc tiếp theo, ngày cập nhật cuối, cảnh báo khi thông tin thiếu/cũ. Không bắt buộc phải có phần trăm tiến độ.

**Drawer chi tiết dùng chung:**
- **Overview:** mục tiêu, mô tả ngắn, trạng thái (`Not started / Active / Blocked / On hold / Completed`), priority, ngày bắt đầu, deadline nếu có, next action.
- **Tasks:** việc cụ thể, status (`Todo / Doing / Done / Blocked`), due date tùy chọn, thời lượng ước lượng tùy chọn, loại deadline (`Hard / Committed / Flexible`).
- **Notes:** ghi chú Markdown đơn giản, autosave, search nội dung cơ bản.
- **Activity:** timeline logs gồm thời gian, tác nhân (manual/AI-approved), thay đổi và nguồn.

**Academic — trường riêng:**
- Tên môn, học kỳ, số tín chỉ (optional), mục tiêu điểm (mặc định A), ghi chú hình thức đánh giá.
- **Topics tracker:** danh sách chương/chủ đề; trạng thái `Not started / Familiar / Practiced / Confident`; bằng chứng tự khai báo (ví dụ bài tập/quiz/điểm) là tùy chọn.
- Assessments: tên kỳ thi/bài lab, ngày, trọng số và điểm nếu biết; không bắt buộc nhập đầy đủ.
- Mục `Course content overview`: syllabus, mục lục, chủ đề chính, liên kết tài liệu để AI biết **môn đang học gì**, không phải để dùng app như tài liệu giảng dạy.
- **Academic progress:** số topic và task đã đạt mục tiêu, đánh giá định tính có dẫn chứng; không đồng nhất với GPA.

**Projects — trường riêng:**
- Mô tả mục tiêu, vai trò của người dùng, đối tác/nhóm nếu muốn, nhịp độ mong muốn (optional).
- **Milestones:** deliverable, target date, status, completion criteria.
- **Blockers:** vấn đề đang mắc, bước thử gần nhất, next experiment/action, phụ thuộc bên ngoài nếu có.
- Project health hiển thị từ deadline, milestone, blocker và thời gian không có cập nhật; **không suy diễn** rằng ít logs = ít làm việc.

**Quick capture:** ô nhập một dòng/nhiều dòng: “Database lab đã nộp; Question House chưa fix được login; tuần này cần xem syllabus Mobile”. Mặc định lưu thành inbox note chưa phân loại. Có nút `Extract suggestions` để AI phân loại thành task/log/update; phải duyệt trước khi áp dụng.

## 4. Seed data ban đầu (chỉ là bản nháp, sửa được)

**Academic:** Technical Writing; Database (+ Lab); Algebra (improvement); Computer Networks (+ Lab); Introduction to Communications Engineering; C Programming (improvement); Mobile Programming; Software Engineering; Tư tưởng Hồ Chí Minh.

- Term goal: GPA 4.0/4.0, 23 tín chỉ (tổng theo thông tin đã cung cấp; **không tự phân bổ tín chỉ cho các môn**).
- Computer Networks / Introduction to Communications Engineering: đang theo tiến độ, theo tự đánh giá.
- Mobile Programming / Software Engineering: chưa bắt đầu ôn/học có hệ thống theo cập nhật gần đây; cần xác minh syllabus và phương thức thi.
- Các môn còn lại để `Status unknown` cho tới khi người dùng cập nhật; không tự tạo điểm số.

**Projects:** LLM4AD/LLMEC — personal research; Research Assistant — hỗ trợ nhóm khác; Question House — Android app; StewieSAT — website/platform; ATGT Competition — thi tháng 1/2027.

Các item seed được hiển thị trong bước onboarding `Review & import`; owner có thể sửa hoặc bỏ chọn trước khi lưu. Không đưa nội dung trò chuyện cũ vào database như thể đã được xác minh mới nhất.

## 5. Dữ liệu và nguồn sự thật

**Nguyên tắc:** Database là nguồn sự thật cho trạng thái hiện tại. Chat transcript chỉ là lịch sử tương tác. `Event Log` lưu điều đã thay đổi; `Current State` là bản tổng hợp hiện hành dùng để hiển thị nhanh.

### Các bảng/collection tối thiểu

| Bảng | Trường chính | Chức năng |
|---|---|---|
| `areas` | id, kind (`academic/project`), name, summary, status, priority, target, next_action, created_at, updated_at | Đối tượng cấp cao |
| `academic_details` | area_id, term, credits?, grading_scheme?, exam_format?, course_outline? | Thông tin môn |
| `project_details` | area_id, role?, collaborators?, scope? | Thông tin dự án |
| `topics` | id, area_id, title, status, evidence?, order | Theo dõi nội dung môn |
| `milestones` | id, area_id, title, acceptance_criteria, target_date?, status | Kết quả dự án |
| `tasks` | id, area_id, milestone_id?, title, status, due_at?, deadline_type, estimate_minutes?, blocked_reason?, sort_order | Công việc |
| `assessments` | id, area_id, title, due_at?, weight?, score?, max_score? | Bài thi/lab/điểm thành phần |
| `notes` | id, area_id?, text, created_at, updated_at, inbox_status | Ghi chú và quick capture |
| `activity_logs` | id, area_id?, entity_type, entity_id, action, before_json?, after_json?, origin, created_at | Nhật ký bất biến ở mức ứng dụng |
| `conversations` | id, title, created_at, updated_at | Cuộc chat |
| `messages` | id, conversation_id, role, content, metadata?, created_at | Hội thoại |
| `pending_actions` | id, conversation_id?, proposed_json, status, created_at, resolved_at? | Các thay đổi cần duyệt |
| `settings` | owner_id, timezone, default_focus_minutes?, provider, model, preferences_json | Cấu hình cá nhân |

- Mọi record có owner_id hoặc được kiểm soát thông qua quan hệ thuộc owner. UUID cho ID.
- Timestamp lưu UTC; UI hiển thị múi giờ `Asia/Ho_Chi_Minh` (+07:00).
- Thêm/xóa/sửa task, topic, milestone đều cập nhật timeline. `activity_logs` không được viết lại để che dấu thay đổi.
- Đối với những trạng thái AI suy luận, lưu `source = AI suggestion` hoặc `confidence` tách khỏi dữ liệu xác nhận bởi người dùng.
- Nếu một item không được cập nhật lâu, hiển thị `Last updated`; chỉ nhắc kiểm tra, không tự chuyển sang `At risk`.
- Không dùng một trường `% complete` tự tính tùy tiện; nếu có progress bar phải chỉ rõ mẫu số (ví dụ 3/7 milestones hoặc 5/12 topics).

## 6. AI engine và context pipeline

### 6.1. Mô hình gọi API

```text
User Chat / Quick Capture
  → Next.js server route
  → Intent + context builder
  → DB query: state + relevant tasks/notes/logs
  → Provider adapter (Fosta initially)
  → LLM response (+ proposed tool calls)
  → Validate proposed actions
  → User approves in UI
  → Transactional DB update + activity log
```

**Chọn provider:** Fosta làm provider test đầu tiên, dùng `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` từ server environment. Không hardcode model tên “6.1 Sol”; model ID thực tế phải lấy từ thông tin provider/test. Không có cơ sở xác thực rằng gateway thực sự chạy model được quảng cáo. Adapter cần hỗ trợ thay bằng nhà cung cấp khác.

**Fallback bắt buộc:** Nếu Fosta không hỗ trợ tool calling/structured outputs đúng chuẩn, ứng dụng vẫn dùng được Chat và UI CRUD. Backend có thể yêu cầu model xuất `proposed_actions` JSON và validate chặt chẽ; nếu JSON không hợp lệ, chỉ trả lời văn bản, không ghi dữ liệu. Không giả vờ đã update.

### 6.2. Context builder

- Mỗi lần chat: system instruction ngắn + user settings + danh mục areas dạng **compact state index** (tên/status/next_action/last_updated).
- Dựa trên intent, mở rộng dữ liệu item liên quan: tasks, topics/milestones, notes liên quan, gần nhất 10–20 logs; chỉ lấy nhiều logs khi cần phân tích lịch sử.
- Câu hỏi `overall`, `tuần này ổn không` → lấy snapshot của tất cả areas + upcoming deadlines + blocked/missing/overdue tasks.
- Câu hỏi về một môn/dự án → lấy deep context của item đó.
- Chat conversation: chỉ đưa những lượt gần đây và bản tóm tắt khi dài; database state luôn được ưu tiên hơn câu trả lời cũ.
- Không cần embeddings trong V1; tìm kiếm theo tên, keyword và quan hệ DB. Các mục lớn sau này mới cần semantic retrieval.
- Context phải kèm `last_updated`, nguồn và dữ liệu còn thiếu để AI không coi giả định là sự thật.

### 6.3. Tool contracts gợi ý

**Read:** `listAreas`, `getAreaDetails`, `listUpcomingTasks`, `getRecentLogs`, `searchNotes`, `getPortfolioSnapshot`.

**Write (approval required):** `createTask`, `updateTask`, `updateArea`, `upsertTopic`, `upsertMilestone`, `createNote`, `addProgressLog`, `createBlocker`, `resolveBlocker`.

Bất cứ thay đổi nào qua AI đều theo luồng `propose → preview diff → approve → validate → commit → log`; các hành động xóa cần xác nhận riêng. Có chống trùng đề xuất, idempotency key và transaction để không nhân đôi task/log do retry.

### 6.4. Quy tắc trả lời (system behavior)

1. Tôn trọng mục tiêu GPA 4.0 nhưng không giả định tất cả môn đều cần số giờ bằng nhau.
2. Academic dùng cho tracking, **không tự khởi động buổi giảng bài**, trừ khi sau này người dùng mở rộng phạm vi sản phẩm.
3. Không tự tạo deadline, phần trăm tiến độ, điểm số hay tuyên bố đã hoàn thành nếu thiếu bằng chứng.
4. Phân biệt `Confirmed`, `User reported`, `Inferred`, `Unknown` khi đưa nhận định.
5. Khi hỏi “nên làm gì”, đề xuất tối đa ba ưu tiên, chỉ rõ đánh đổi và điều kiện giả định về thời gian trống. Nếu không biết thời gian, cho kế hoạch ngắn có điều kiện; hỏi một câu chỉ khi thật sự cần.
6. Khi một task bị dời nhiều lần, nêu **giả thuyết** về blocker/avoidance, không kết luận tâm lý.
7. Chỉ cập nhật khi được duyệt, không che giấu lỗi ghi dữ liệu; khi provider lỗi, UI manual vẫn dùng được.
8. Không tự động đọc/gửi các bí mật, credentials, nội dung NDA hay source code dự án tới Fosta.

## 7. Các user flows tối thiểu

**A. Hỏi kế hoạch hôm nay**
- Mở Chat → chọn gợi ý `Hôm nay nên làm gì?` → backend lấy tasks/deadlines/areas → AI trả lời ba việc ưu tiên với lý do và các giả định → nếu người dùng yêu cầu, AI đề xuất tạo task hoặc đổi due date → duyệt → Context cập nhật.

**B. Cập nhật tiến độ bằng ngôn ngữ tự nhiên**
- Người dùng: “Hôm nay tôi học phần VLSM và giải được 5 bài; đánh dấu đang luyện tập.”
- AI nhận diện đúng môn/topic → hiện thẻ đề xuất cập nhật topic + log → user Approve → lưu transaction → các cuộc chat sau đọc state mới.

**C. Cập nhật thủ công**
- Context → Academic → mở Computer Networks → sửa topic status / thêm note → save → log được tạo → Chat có context mới mà không cần kể lại.

**D. Xử lý blocker ở dự án**
- Context → Projects → Question House → thêm blocker `Login Android chưa chạy` → cập nhật bước thử trước đó → Chat: “Tại sao tôi cứ né Question House?” → AI kiểm tra blocker và lịch sử đổi task, đưa ra **giả thuyết có bằng chứng**, đề xuất một next action nhỏ.

**E. Rà soát tổng thể**
- Chat: `Tuần này có gì đáng lo?` → hệ thống nêu các deadline gần, item chưa bắt đầu, milestone không tiến, dữ liệu cũ, cùng mức độ chắc chắn và biện pháp cụ thể. Không tạo cảnh báo giả từ thiếu dữ liệu.

## 8. Kiến trúc công nghệ V1

- **Frontend + backend:** Next.js + TypeScript (App Router / server route handlers).
- **UI:** Tailwind CSS + shadcn/ui; markdown renderer; responsive, dark/light mode.
- **Database/Auth:** Supabase Postgres + Supabase Auth (allowlist một owner, không mở public signup); dùng Prisma hoặc Drizzle, chỉ chọn **một** ORM.
- **AI SDK:** OpenAI-compatible SDK hoặc AI SDK có adapter; base URL / model / key server-side; thực hiện kiểm thử tương thích trước khi triển khai đầy đủ tool use.
- **Deploy:** Vercel cho web, Supabase cho DB; không dựa vào SQLite file ephemeral trên serverless production.
- **Security:** auth mọi route, Row Level Security nếu query Supabase từ client, server-side validation, rate limit cơ bản, giới hạn payload, logs không chứa API key. Chỉ gửi context cần thiết tới provider bên thứ ba.
- **Migration:** provider adapter không gắn chặt model; dữ liệu không phụ thuộc Fosta và có thể xuất JSON backup.

### Environment example

```dotenv
DATABASE_URL=...
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...  # server only, nếu thật sự cần
AI_BASE_URL=https://codex.fosta.app/v1
AI_API_KEY=...
AI_MODEL=...                   # provider-compatible model ID, verify before use
APP_OWNER_EMAIL=...
```

Không commit `.env`, không đưa key vào frontend. Trong bản thử nghiệm đầu tiên dùng dữ liệu mô phỏng/đã loại thông tin nhạy cảm; chỉ đưa dữ liệu thực vào sau khi cân nhắc rủi ro của gateway bên thứ ba.

## 9. API / service endpoints gợi ý

| Route | Ý nghĩa |
|---|---|
| `POST /api/chat` | Stream câu trả lời; context selection; tool proposal |
| `GET/POST /api/areas` | List/create Academic hoặc Project |
| `GET/PATCH /api/areas/:id` | Chi tiết/cập nhật overview |
| `GET/POST/PATCH /api/tasks` | CRUD tasks |
| `GET/POST/PATCH /api/topics` | Academic topics |
| `GET/POST/PATCH /api/milestones` | Projects milestones |
| `GET/POST/PATCH /api/notes` | Notes và inbox |
| `GET /api/activity?areaId=...` | Timeline logs |
| `GET /api/portfolio/snapshot` | Tổng hợp read-only cho UI và AI |
| `POST /api/actions/:id/approve` | Duyệt đề xuất, transaction + log |
| `POST /api/actions/:id/reject` | Từ chối đề xuất |
| `GET /api/export` | Xuất dữ liệu cá nhân JSON |

Đây là gợi ý hợp đồng API, coding agent có thể gộp các route nếu implementation gọn hơn mà vẫn đảm bảo CRUD, quyền truy cập và audit.

## 10. Kế hoạch thực thi giao cho coding agent

**Phase 1 — Working shell:** Scaffold Next.js, Auth, DB migration + seed preview, hai screen, sidebar, CRUD Academic/Projects/Tasks/Notes, logs; UI sử dụng tốt khi AI API tắt.

**Phase 2 — Context-aware Chat:** conversations/messages, streaming chat, Fosta adapter, context-builder, read tools; demo hỏi trạng thái học tập/dự án và trả lời từ DB chứ không đoán.

**Phase 3 — AI updates & polish:** pending actions/approval, transactional writes, quick capture extraction, overview review prompts, error handling, responsive, export, README + automated tests.

**Ưu tiên:** Demo được luồng end-to-end ngay sau mỗi phase; không dựng hạ tầng mới nếu chưa có tính năng V1 cần nó.

## 11. Acceptance criteria — V1 được coi là hoàn thành khi

1. Đăng nhập owner, người không được phép không xem được dữ liệu.
2. Chỉ có hai screen chính Chat và Context; Context có đúng hai tab Academic / Projects.
3. Thêm/sửa môn, chủ đề, task, project, milestone, note từ UI mà không gọi AI.
4. Khởi tạo được seed data đã được owner duyệt; không tự điền điểm hoặc trạng thái không biết.
5. Nhắn “Mobile Programming đang ở tình trạng nào?” → trả về đúng state/last_updated từ DB.
6. Thay đổi topic status bằng UI → mở chat mới vẫn đọc trạng thái mới.
7. Nhắn “Tôi đã hoàn thành chương 1 Mobile” → AI đề xuất thay đổi; không ghi trước khi approve.
8. Duyệt cập nhật → dữ liệu thay đổi đúng một lần, log thể hiện thời gian và nguồn; từ chối → không thay đổi.
9. Nhắn “Tuần này có gì đáng lo?” → chỉ ra các vấn đề có bằng chứng, dữ liệu thiếu phải nêu thiếu.
10. Fosta lỗi hoặc tool calling không được hỗ trợ → UI không bị hỏng; không ghi dữ liệu sai; có thông báo lỗi rõ ràng.
11. Không có API key trong bundle frontend, log public hoặc repo.
12. Có `README.md`, `.env.example`, schema migration, lệnh seed, lệnh chạy local, lệnh test; có ít nhất unit tests cho context builder và approval flow, cùng một end-to-end test cho cập nhật từ chat.

## 12. Definition of success sau 2 tuần sử dụng

V1 thành công nếu người dùng có thể: (a) xem mọi môn và dự án ở một chỗ; (b) ghi nhận thay đổi trong dưới một phút với một note hoặc một lần chat; (c) hỏi một câu ngắn và nhận đề xuất phù hợp với state mới nhất; (d) không phải nhắc lại những việc đã cập nhật; (e) phân biệt thông tin xác thực với suy luận của AI.

Không tối ưu “AI thông minh đến mức nào” trong V1; tối ưu **độ tin cậy của state, friction nhập liệu thấp và chất lượng quyết định có giải thích**.

---

### Chỉ dẫn cuối cùng cho coding agent

Build the smallest working single-user app that satisfies this spec. Do not add pages beyond the two primary screens, do not introduce multi-agent orchestration or vector search, do not invent progress data, and never silently execute LLM-proposed writes. Start with schema + manual CRUD, then connect context-aware chat, then add approval-based AI updates. Keep the AI provider replaceable and handle Fosta API incompatibilities gracefully. Deliver runnable code, tests, migrations, seed preview, and setup instructions.
