# Kế hoạch Implement: Lịch thi dự kiến theo chu kỳ, AI Deep-Dive Documents & Skill Đánh giá Tiến độ

> **Mục tiêu:** Giải quyết triệt để tình trạng AI chỉ nhìn thấy 1–2 đoạn cắt ngắn (`one-shot context`), thiếu mốc thời gian thi thật/dự kiến, và chưa biết chủ động đọc sâu Đề cương / Kế hoạch / Đề thi để đánh giá tiến độ **nhanh hay chậm** một cách có căn cứ.

---

## 1. Trả lời câu hỏi kiến trúc: Skill + Dữ liệu + Tool đọc sâu có đủ không?

**Có — nhưng cần đủ cả 2 vế (Công cụ lấy dữ liệu + Skill suy luận):**

1. **Vế dữ liệu & truy xuất (chỗ đang hổng hiện tại):**
   - Trong `runChatTurn` hiện nay, server chỉ nhét 1 lần ngữ cảnh tĩnh tối đa `12.800` ký tự (`selectDocumentContext`) rồi khóa hết chỉ còn 1 tool ghi là `propose_changes`. Vì vậy khi người dùng hỏi *"phân tích tiến độ môn Algebra"*, AI **không có cách nào tự mở thêm** `20251.MI1144E_DCHP.pdf`, `02_COURSE_MAP.md`, `06_TIMELINE.md`, hay các đề thi trong `03_Đề_thi_&_Ôn_tập`.
   - Đồng thời, DB hiện chưa có **mốc lịch thi dự kiến** (ví dụ: tuần 1 học kỳ bắt đầu ngày nào, cửa sổ thi cuối kỳ dự kiến rơi vào tuần/ngày nào, độ chắc chắn `estimated` hay `official`) và **chu kỳ nhắc rà soát lịch**.
2. **Vế suy luận (Skill):**
   - Một khi đã có **5 đầu vào**:
     1. Ngày hiện tại (`now.date` + tuần học kỳ hiện tại)
     2. Ngày thi dự kiến / chính thức (`exam_date` + `confidence`)
     3. Kế hoạch chi tiết (`06_TIMELINE.md`, `tasks`, `milestones`)
     4. Nội dung & trọng số môn học (`02_COURSE_MAP.md`, `Đề cương PDF`, `topics`)
     5. Nội dung & cấu trúc đề thi các năm (`03_Đề_thi_&_Ôn_tập`)
   - Thì việc đánh giá **nhanh / đúng nhịp / chậm**, chỉ ra phần **chưa vững nhưng hay thi**, và lập kế hoạch bù **hoàn toàn có thể chuẩn hóa thành một `Skill` Markdown rõ ràng** (quy trình 4 bước + bảng tiêu chí + ngưỡng cảnh báo).

---

## 2. Thiết kế chi tiết 4 phần cần implement

### Phần A — Lịch thi dự kiến & Chu kỳ nhắc cập nhật (`Exam Schedule & Sync Cadence`)

#### A1. Dữ liệu & Schema (`src/db/schema.ts`, `drizzle/`)
- Mở rộng bảng `assessments`:
  - `dateConfidence`: enum `'official' | 'estimated' | 'tentative'` (mặc định `'estimated'` nếu suy từ đề cương/tuần học, `'official'` nếu từ lịch thi trường/giảng viên).
  - `examWindowStart`: `date` nullable, `examWindowEnd`: `date` nullable (dùng khi mới biết thi vào *"tuần 17–18"* mà chưa có ngày giờ cụ thể).
  - `sourceNote`: `text` nullable (ví dụ `"Suy từ DCHP tuần 17"` hoặc `"Lịch phòng Đào tạo công bố"`).
  - `scheduleVerifiedAt`: `timestamp` nullable (lần cuối user xác nhận hoặc rà soát lại lịch này).
- Mở rộng bảng `settings`:
  - `termStartDate`: `date` nullable (Ngày bắt đầu Tuần 1 học kỳ, ví dụ `2026-09-07` cho kỳ `2026.1` → server tự quy đổi mọi mốc *"Tuần N"* trong đề cương/tài liệu sang khoảng ngày thật!).
  - `scheduleReviewIntervalDays`: `integer` default `14` (chu kỳ bình thường nhắc rà soát lịch thi/kế hoạch); tự động rút xuống `7` ngày khi còn `<= 28` ngày trước kỳ thi dự kiến, và `3` ngày khi còn `<= 14` ngày nếu `dateConfidence !== 'official'`.

#### A2. Logic tính toán & cảnh báo (`src/server/queries/snapshot.ts`, `src/server/ai/context-builder.ts`)
- Bổ sung vào `WorkspaceState.now`:
  - `academicWeek`: số tuần hiện tại của học kỳ nếu `settings.termStartDate` đã đặt (`Math.floor((today - termStartDate) / 7) + 1`).
- Bổ sung cờ thiếu & nhắc định kỳ trong `AreaSummary.missing` / `ExamCadenceAlert`:
  - `no_exam_schedule`: Môn `academic` ở trạng thái `active` chưa có bất kỳ `assessment` nào có `dueDate` hoặc `examWindowStart`.
  - `exam_schedule_unverified`: Đã có lịch dự kiến (`estimated`/`tentative`) nhưng quá `scheduleReviewIntervalDays` kể từ `scheduleVerifiedAt` (hoặc chưa có `official` khi đã sát ngày thi).
- Hiển thị nhắc nhẹ trên UI `/context` (huy hiệu ở thẻ môn & mục `Cập nhật nhanh`) và đưa vào `<workspace_state>` để AI chủ động nhắc ở cuối câu trả lời khi đến hạn chu kỳ rà soát.

---

### Phần B — Công cụ AI đọc sâu tài liệu theo yêu cầu (`B3+` Read-Only Deep-Dive Loop)

#### B1. Bộ tool chỉ đọc (`src/server/ai/doc-tools.ts`)
Dùng chung bảng ánh xạ ID ngắn (`a1`, `d1`, `f1`...) của `aliasWorkspaceState` để miễn nhiễm proxy che UUID, chỉ cấp khi `actionMode === 'tools'`:
1. `list_area_documents({ areaId })`:
   - Trả về danh sách gọn các thư mục + tài liệu trong workspace (`documentId: "d1"`, `folderPath`, `title`, `docRole`, `fileExt`, `charCount`, `updated_at`, `chunkCount`).
   - Cho AI biết ngay môn này đang có đề cương PDF gì, đề thi nào, timeline nào.
2. `search_documents({ areaId?, query, limit? })`:
   - Gọi lại `searchContext` (Postgres FTS bỏ dấu tiếng Việt `normalizeVi`) để tìm đúng đoạn nằm trong tài liệu `raw` (PDF đề thi, slide bài giảng, đề cương).
   - Giới hạn kết quả gọn (tối đa `8` đoạn, mỗi đoạn `<= 900` ký tự) kèm `documentId`, `title`, `heading_path`, `ordinal`.
3. `read_document_chunks({ documentId, fromOrdinal?, count? })`:
   - Đọc nối tiếp các chunk của một tài liệu cụ thể (tối đa `4` chunks / lần gọi, `<= 3.600` ký tự) hoặc đọc `outline` + phần đầu `02_COURSE_MAP.md` / `06_TIMELINE.md` / đề cương / đề thi.

#### B2. Ràng buộc an toàn & ngân sách (`src/server/chat/run-turn.ts`)
- **Riêng tư tuyệt đối (`ai_excluded`):** Mọi hàm trong `doc-tools.ts` bắt buộc đi qua `visibleDocumentConditions(db)` (ẩn workspace `ai_excluded`, thư mục cha `ai_excluded`, tài liệu `ai_excluded`, `doc_role = 'instruction'`, và `deleted_at IS NOT NULL`).
- **Chống lặp vô hạn & tràn token:**
  - Tối đa **`MAX_TOOL_ROUNDS = 3`** vòng lặp gọi tool đọc trước khi ép lượt gọi cuối trả lời cho người dùng (vẫn giữ `propose_changes` làm tool kết thúc nếu cần đề xuất cập nhật).
  - Tổng ký tự trả về từ tool đọc trong 1 turn bị chặn trần (ví dụ `<= 14.000` ký tự).
  - Trong `runChatTurn`, mỗi vòng tool mới chỉ làm dày thêm `messages` tạm thời của lượt gọi model đó (không lưu raw tool dump vào bảng `messages` chat).
  - Khi tool đọc trả về đoạn từ tài liệu `d_x`, tự động thêm vào `contextRefs` cuối lượt để chip **"Dựa trên:"** mở thẳng đúng PDF / Markdown đó trên `/context`.
- **Stream UX & tránh nghẽn giữa chừng (`src/server/ai/fosta.ts`, `src/server/chat/run-turn.ts`):**
  - Emit trạng thái nhẹ trong stream (hoặc event tiến độ `{ type: 'status', label: 'Đang đọc Đề cương & Đề thi Algebra…' }`) để UI không đứng im gây cảm giác đơ trong lúc AI đang gọi tool.
  - Tăng timeout hợp lý & kiểm tra `thinking`/model trong cấu hình (`gpt-6.2-sol` ổn định hơn `claude-sonnet-5` trên `codex.fosta.app`).

---

### Phần C — Skill Đánh giá Tiến độ & Phân tích Môn học (`Pacing & Deep-Dive Skill`)

#### C1. Vị trí & tích hợp (`C5` nền tảng + Skill mặc định `src/server/ai/skills/study-pacing.md`)
- Lưu thành một Skill chuẩn (hoặc tích hợp vào khối `<workspace_instructions>` của `buildSystemPrompt` khi câu hỏi liên quan tiến độ/kế hoạch/ôn thi học phần `academic`).
- Quy định rõ quy trình suy luận bắt buộc cho AI:
  1. **Kiểm tra đủ 5 trụ cột trước khi kết luận:**
     - *(1) Thời gian hiện tại:* `now.date` và `now.academicWeek` (nếu có).
     - *(2) Mốc thi dự kiến/chính thức:* lấy từ `assessments`; nếu trống → dùng `list_area_documents` / `search_documents` tìm trong `06_TIMELINE.md`, `07_MISSING_INFO.md`, hoặc file đề cương (`*DCHP*`, `*syllabus*`).
     - *(3) Kế hoạch chi tiết:* đọc `06_TIMELINE.md` / `tasks` / `milestones` / `05_LOG.md`.
     - *(4) Nội dung & cấu trúc môn học:* đọc `02_COURSE_MAP.md` + `Đề cương PDF` (danh sách chương, CLO, tỷ trọng điểm quá trình/giữa kỳ/cuối kỳ).
     - *(5) Trọng tâm đề thi thật:* tìm trong `03_Đề_thi_&_Ôn_tập` (`list_area_documents` + `read_document_chunks` tối đa 1–2 đề tiêu biểu) để biết dạng câu hỏi thực tế, mức độ khó, chương nào ra nhiều điểm nhất.
  2. **Khung đánh giá Nhanh / Đúng nhịp / Chậm:**
     - Tính **áp lực thời gian** = `tuần/ngày còn lại tới kỳ thi` so với `số chương/chủ đề chưa đạt trạng thái practiced/confident`.
     - So sánh **tiến độ thực tế** (từ `topics` + `notes` + `05_LOG.md`) với **kế hoạch tuần** (`06_TIMELINE.md` hoặc tiến độ tuyến tính theo `academicWeek` trong đề cương).
     - Gắn nhãn kết luận minh bạch: **Vượt nhịp / Đúng nhịp / Chậm nhẹ / Chậm rõ** — kèm điều kiện nếu đang dựa vào `lịch thi dự kiến (Estimated)` chứ chưa có lịch chính thức.
  3. **Khuyến nghị theo độ ăn điểm trong đề thi:**
     - Ưu tiên tối đa 3 phần dựa trên: *trọng số đề thi × độ hổng kiến thức × thời gian còn lại*.
  4. **Đề xuất hành động (tùy chọn):**
     - Nếu đọc tài liệu thấy lịch thi dự kiến / danh sách chương (`topics`) chưa có trong dữ liệu có cấu trúc của app → chủ động gọi `propose_changes` (có duyệt) để nạp `topics` / `assessments` (`dateConfidence: 'estimated'`) từ tài liệu vào DB cho các lần sau đỡ phải đọc lại.

---

### Phần D — Chuẩn hóa dữ liệu khởi tạo (`Bootstrap` cho 9 môn HUST 2026.1)

- Chạy hoặc tạo script/lệnh hỗ trợ đọc `02_COURSE_MAP.md`, `06_TIMELINE.md`, `07_MISSING_INFO.md` của 9 môn HUST đã import để gợi ý (dạng pending proposal hoặc script có `--dry-run`) tạo sẵn:
  - `settings.termStartDate` cho học kỳ `2026.1`,
  - `assessments` (`Giữa kỳ`, `Cuối kỳ` kèm `examWindowStart`/`End` & `dateConfidence: 'estimated'`),
  - `topics` theo từng chương trong Course Map để đánh dấu `not_started` / `familiar` / `practiced` / `confident`.

---

### Phần E — Chặn đề xuất cập nhật nhầm khi người dùng chỉ hỏi (`Proposal Intent Guard`)

#### Vấn đề thực tế đã ghi nhận
- Khi người dùng hỏi câu thuần truy vấn thông tin (ví dụ: *"algebra tôi đang học đến đâu rồi"*), model có lúc **gọi nhầm `propose_changes`** (`update_area` sửa trường `summary` thành câu meta *"Chưa xác định được tiến độ hiện tại..."*) thay vì đọc sâu tài liệu rồi trả lời, và khi `reply` trống thì UI chỉ hiển thị câu tóm tắt đề xuất kèm thẻ `Approve / Edit / Reject`.

#### Thiết kế sửa lỗi (`D5`)
1. **Ràng buộc prompt & tool routing (`src/server/ai/prompt.ts`):**
   - Tách rõ 2 ý định: **Câu hỏi tìm hiểu/phân tích** (*"đang học đến đâu rồi?"*, *"nhanh hay chậm?"*, *"nên học gì?"*) chỉ dùng **tool đọc (`D2`)** để trả lời, **tuyệt đối không gọi `propose_changes`** trừ khi người dùng báo một sự kiện/tiến độ mới hoặc yêu cầu tạo/cập nhật/lên lịch.
   - Không đề xuất ghi chú meta kiểu *"hồ sơ chưa xác nhận"* vào `areas.summary` hay `topics` khi không có thông tin mới từ người dùng.
2. **Làm sạch schema & chặn cấp server (`src/server/proposals/schema.ts`, `src/server/chat/run-turn.ts`):**
   - Rà soát bỏ hẳn trường legacy `summary`/`goal` khỏi `AreaPatchSchema` (theo hướng A10/A11 đã chuyển phần tổng quan sang tài liệu Markdown) hoặc chặn các `update_area` chỉ viết lại mô tả meta không xuất phát từ thay đổi trạng thái vận hành thật.
   - Bổ sung kiểm tra ở tầng `runChatTurn` (`actionMode` / intent guard): nếu tin nhắn là câu hỏi thuần tra cứu không chứa khai báo cập nhật/deadline/yêu cầu sửa và model lại gọi `propose_changes` vô lý (đặc biệt khi `reply.trim() === ''`), bỏ qua đề xuất thừa đó hoặc ép AI trả lời câu hỏi thay vì hiện thẻ duyệt gây nhiễu.
3. **Bộ test hồi quy:**
   - Thêm test case (mock + live `gpt-6.2-sol`) cho câu *"algebra tôi đang học đến đâu rồi"*: **0 `propose_changes`**, câu trả lời bắt buộc tổng hợp từ `notes`, `05_LOG.md`, `06_TIMELINE.md`, `02_COURSE_MAP.md`.

---

## 3. Lộ trình triển khai đề xuất (4 bước nhỏ, kiểm thử được từng bước)

1. **Bước 1 — Schema & UI cho `Lịch thi dự kiến` + `termStartDate` + `Chu kỳ nhắc`:**
   - Sửa `src/db/schema.ts`, sinh migration mới, cập nhật `snapshot.ts`, `assessments` panel, và `Settings` (nhập ngày bắt đầu Tuần 1 + chu kỳ kiểm tra lịch).
   - Unit test cho tính `academicWeek`, tính chu kỳ quá hạn `exam_schedule_unverified`, và siết chu kỳ khi cận thi.
2. **Bước 2 — Read-only Deep-Dive Tools trong `runChatTurn` (`B3+`):**
   - Viết `src/server/ai/doc-tools.ts` (`list_area_documents`, `search_documents`, `read_document_chunks`) dùng ID alias `a1`/`d1`.
   - Mở rộng `runChatTurn` hỗ trợ tối đa 3 vòng tool đọc + gộp `contextRefs` + event `status`.
   - Unit test kiểm tra privacy (`ai_excluded` tuyệt đối không lộ qua tool), cap số vòng lặp, và mock multi-turn tool call.
3. **Bước 3 — `Skill Đánh giá Tiến độ & Phân tích Môn học`:**
   - Tạo `src/server/ai/skills/study-pacing.md` (và cơ chế nạp skill nền `C5` sạch tách biệt khỏi dữ liệu).
   - Bổ sung kịch bản test mới vào `scripts/evaluate-phase-b.ts` (hoặc `scripts/evaluate-deep-dive-pacing.ts`): câu hỏi *"phân tích tiến độ môn Algebra — nhanh hay chậm?"* với mock & live provider (`gpt-6.2-sol`), xác minh AI thực sự gọi `list_area_documents` / `read_document_chunks` vào Đề cương + Đề thi trước khi trả lời.
4. **Bước 4 — Bootstrap dữ liệu lịch & topic từ bộ tài liệu HUST 2026.1 + Chặn đề xuất nhầm (`D5`) + E2E:**
   - Cập nhật dữ liệu lịch dự kiến cho 9 môn, hoàn thiện `D5` chặn `propose_changes` trên câu hỏi thuần truy vấn (*"algebra tôi đang học đến đâu rồi"*), viết E2E kiểm tra chu kỳ nhắc lịch & UI chat hiện trạng thái đang đào sâu tài liệu.

---

## 4. Danh sách tệp dự kiến chạm tới khi triển khai

- **Mới:**
  - `src/server/ai/doc-tools.ts` + `src/server/ai/doc-tools.test.ts`
  - `src/server/ai/skills/study-pacing.md` + `src/server/ai/skills/index.ts`
  - `drizzle/0003_*.sql` (migration thêm `dateConfidence`, `examWindowStart`, `examWindowEnd`, `scheduleVerifiedAt`, `settings.termStartDate`, `settings.scheduleReviewIntervalDays`)
- **Cập nhật:**
  - `src/db/schema.ts`, `src/server/schemas.ts`
  - `src/server/queries/snapshot.ts`, `src/server/ai/context-builder.ts`, `src/server/ai/prompt.ts`
  - `src/server/chat/run-turn.ts`, `src/components/chat/use-chat-stream.ts`, `src/components/chat/chat-view.tsx`
  - `src/components/context/assessments-panel.tsx`, `src/components/settings/`
  - `src/server/proposals/schema.ts`, `src/server/proposals/resolve.ts` (cho phép cập nhật `dateConfidence` & `scheduleVerifiedAt`)
