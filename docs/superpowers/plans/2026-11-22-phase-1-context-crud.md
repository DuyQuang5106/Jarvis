# Phase 1 — Context và CRUD: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner quản lý được toàn bộ môn học và dự án bằng tay trong màn Context, mọi thay đổi có log, có seed qua onboarding và có nút export — không cần AI.

**Architecture:** Một lớp service ghi dữ liệu duy nhất (ghi bản ghi + ghi `activity_logs` trong cùng transaction) được dùng bởi server actions của UI và, ở Phase 3, bởi luồng duyệt đề xuất. Lớp query đọc ra hai cấu trúc dùng chung cho UI và AI: `PortfolioSnapshot` và `AreaDetails`. UI là Server Components đọc dữ liệu, Client Components gọi server actions.

**Tech Stack:** Next.js server actions, Drizzle, Zod 4, shadcn/ui, Vitest + PGlite, Playwright.

**Spec:** `Personal_AI_Workspace_V1.1_Spec.md` — mục 3.3, 4, 5, 9, 10 (Phase 1), criteria 2, 3, 4, 15, 17. Đọc thêm `docs/superpowers/plans/README.md`.

**Điều kiện bắt đầu:** Phase 0 đã xong (schema, `getDb`, `createTestDb`, `requireOwner`, `withOwner`, khung hai màn hình, Playwright).

## Global Constraints

- Mọi thao tác ghi đi qua `src/server/services/*`; mỗi thay đổi thật sinh **đúng một** dòng `activity_logs` trong cùng transaction. Cập nhật không đổi gì thì không sinh log.
- `activity_logs` chỉ thêm; không có hàm sửa hay xóa log.
- Service tự đặt `updatedAt: new Date()`; mọi thay đổi ở bản ghi con cũng đặt lại `areas.updated_at`.
- Trạng thái area do owner đặt; không tự suy ra từ blocker hay task. Không có trường phần trăm tiến độ; mọi con số tiến độ hiển thị kèm mẫu số (ví dụ `5/12 topics`).
- Item lâu không cập nhật chỉ được **đánh dấu**; không tự đổi trạng thái.
- Seed không tạo điểm số, topic, assessment hay deadline. Bản ghi từ seed mang origin `seed`.
- Nhãn trạng thái hiển thị đúng như spec: `Unknown / Not started / Active / Blocked / On hold / Completed`; topic `Not started / Familiar / Practiced / Confident`; task `Todo / Doing / Done / Blocked`; deadline `Hard / Committed / Flexible`.
- Mọi `input`, `textarea`, `select` cỡ chữ từ 16px; vùng chạm từ 44px; không tràn ngang ở bề rộng iPhone.
- Server action không ném lỗi ra client; luôn trả `ActionResult`.

## Review Focus

1. Database trống hoàn toàn → snapshot hợp lệ, màn Context hiển thị trạng thái rỗng có lời hướng dẫn, không lỗi. *(Task 3, Task 4)*
2. Lưu mà không đổi gì, hoặc autosave gửi lại đúng nội dung cũ → không sinh log, `updated_at` không đổi. *(Task 1)*
3. Xóa milestone đang có task gắn vào → task còn nguyên, chỉ mất liên kết. *(Task 1)*
4. Tên toàn khoảng trắng, tên quá dài, alias một ký tự, ngày dạng `22/11` hoặc chuỗi rỗng → bị từ chối với thông báo tiếng Việt; không ghi gì. *(Task 1, Task 4)*
5. Lỗi giữa chừng một thao tác ghi → không còn lại bản ghi mồ côi hay log mồ côi. *(Task 1)*

---

### Task 1: Schema đầu vào, log hoạt động và service cho bản ghi con

**Files:**
- Create: `src/server/schemas.ts`, `src/server/services/activity.ts`, `src/server/services/entities.ts`, `src/db/test-helpers.ts`
- Test: `src/server/services/entities.test.ts`, `src/server/schemas.test.ts`

**Interfaces:**
- Consumes: `Db`, `DbOrTx`, bảng và enum (Phase 0, Task 2); `isValidDateStr`; `NotFoundError`, `ValidationError`
- Produces:
  - `src/server/schemas.ts` — các schema Zod và kiểu suy ra:
    - `DateStr` (chuỗi qua được `isValidDateStr`), `Name` (trim, 1–200 ký tự), `Alias` (trim, 2–50 ký tự)
    - `CreateTaskInput { areaId; title: Name; status?; dueDate?: DateStr | null; dueTime?: 'HH:MM' | null; deadlineType?; estimateMinutes?: int 1–10000 | null; milestoneId?: uuid | null; blockedReason?: string | null; sortOrder?: int }` · `UpdateTaskInput` = mọi trường trên trừ `areaId`, đều tùy chọn
    - `CreateTopicInput { areaId; title: Name; status?; evidence?: string | null; sortOrder? }` · `UpdateTopicInput`
    - `CreateAssessmentInput { areaId; title: Name; dueDate?: DateStr | null; weight?: number 0–100 | null; score?: number ≥ 0 | null; maxScore?: number > 0 | null }` · `UpdateAssessmentInput`
    - `CreateMilestoneInput { areaId; title: Name; acceptanceCriteria?: string | null; targetDate?: DateStr | null; status? }` · `UpdateMilestoneInput`
    - `CreateBlockerInput { areaId; title: Name; lastAttempt?; nextAction?; externalDependency? }` · `UpdateBlockerInput` (thêm `status?`)
    - `CreateNoteInput { areaId?: uuid | null; text: 1–20000 ký tự; inboxStatus?; aiExcluded?: boolean }` · `UpdateNoteInput`
    - `CreateAreaInput`, `UpdateAreaInput` (định nghĩa ở Task 2, đặt cùng file)
    - Thông báo lỗi Zod viết bằng tiếng Việt, nêu tên trường.
  - `src/server/services/activity.ts`:
    - `type WriteMeta = { origin: Origin; batchId?: string }`
    - `recordChange(tx: DbOrTx, e: { areaId: string | null; entityType: EntityType; entityId: string; action: LogAction; before?: unknown; after?: unknown } & WriteMeta): Promise<void>`
    - `touchArea(tx: DbOrTx, areaId: string, at: Date): Promise<void>`
  - `src/server/services/entities.ts`:
    - `interface EntityService<Row, CreateIn, UpdateIn> { create(db: DbOrTx, input: CreateIn, meta: WriteMeta): Promise<Row>; update(db: DbOrTx, id: string, patch: UpdateIn, meta: WriteMeta): Promise<Row>; remove(db: DbOrTx, id: string, meta: WriteMeta): Promise<void> }`
    - `taskService`, `topicService`, `assessmentService`, `milestoneService`, `blockerService`, `noteService`
    - `ENTITY_SERVICES: Record<'task'|'topic'|'assessment'|'milestone'|'blocker'|'note', EntityService<any, any, any>>`
  - `src/db/test-helpers.ts`: `makeArea(db: Db, overrides?: Partial<typeof areas.$inferInsert>): Promise<AreaRow>` (chèn thẳng, mặc định `kind: 'academic'`, `name: 'Mobile Programming'`, `status: 'active'`); `logsFor(db: Db, entityId: string): Promise<ActivityLogRow[]>`

**Quy tắc hành vi:**
- Mỗi hàm parse đầu vào bằng schema tương ứng; lỗi parse ném `ValidationError` với thông báo tiếng Việt.
- `create`/`update`/`remove` chạy trong `db.transaction`: ghi bản ghi → `recordChange` → `touchArea` (bỏ qua khi `areaId` null).
- `before`/`after` là ảnh chụp toàn bộ dòng.
- `update` so sánh patch với dòng hiện tại; không trường nào đổi thì trả dòng hiện tại, **không** ghi log, **không** đổi `updated_at`.
- `update`/`remove` với `id` không tồn tại ném `NotFoundError`.
- `taskService`: `milestoneId` khác null phải thuộc cùng `areaId`, nếu không ném `ValidationError('Milestone không thuộc mục này.')`.
- `blockerService.update`: `status: 'resolved'` đặt `resolvedAt` là thời điểm hiện tại; `status: 'open'` xóa `resolvedAt`.

- [ ] **Step 1: Viết test thất bại**

```ts
// src/server/services/entities.test.ts
import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { activityLogs, areas, tasks } from '@/db/schema';
import { logsFor, makeArea } from '@/db/test-helpers';
import { createTestDb } from '@/db/testing';
import { NotFoundError, ValidationError } from '../errors';
import { blockerService, milestoneService, noteService, taskService, topicService } from './entities';

let db: Db;
const manual = { origin: 'manual' as const };
beforeEach(async () => { db = await createTestDb(); });

test('create ghi đúng một log và làm mới areas.updated_at', async () => {
  const area = await makeArea(db, { updatedAt: new Date('2026-11-01T00:00:00Z') });
  const task = await taskService.create(db, { areaId: area.id, title: 'Lab 1', dueDate: '2026-11-25' }, manual);
  const logs = await logsFor(db, task.id);
  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({ areaId: area.id, entityType: 'task', action: 'create', origin: 'manual', beforeJson: null });
  expect(logs[0].afterJson).toMatchObject({ title: 'Lab 1', dueDate: '2026-11-25', status: 'todo' });
  const [after] = await db.select().from(areas).where(eq(areas.id, area.id));
  expect(after.updatedAt.getTime()).toBeGreaterThan(area.updatedAt.getTime());
});

test('update lưu before/after trong một log', async () => {
  const area = await makeArea(db);
  const topic = await topicService.create(db, { areaId: area.id, title: 'Navigation' }, manual);
  const updated = await topicService.update(db, topic.id, { status: 'familiar' }, { origin: 'ai_approved', batchId: '11111111-1111-4111-8111-111111111111' });
  expect(updated.status).toBe('familiar');
  const logs = await logsFor(db, topic.id);
  expect(logs).toHaveLength(2);
  expect(logs[1]).toMatchObject({ action: 'update', origin: 'ai_approved', batchId: '11111111-1111-4111-8111-111111111111' });
  expect(logs[1].beforeJson).toMatchObject({ status: 'not_started' });
  expect(logs[1].afterJson).toMatchObject({ status: 'familiar' });
});

test('update không đổi gì thì không ghi log và không đổi updated_at', async () => {
  const area = await makeArea(db);
  const topic = await topicService.create(db, { areaId: area.id, title: 'Navigation' }, manual);
  const same = await topicService.update(db, topic.id, { title: 'Navigation', status: 'not_started' }, manual);
  expect(same.updatedAt).toEqual(topic.updatedAt);
  expect(await logsFor(db, topic.id)).toHaveLength(1);
});

test('remove ghi log delete kèm before', async () => {
  const area = await makeArea(db);
  const task = await taskService.create(db, { areaId: area.id, title: 'Lab 1' }, manual);
  await taskService.remove(db, task.id, manual);
  expect(await db.select().from(tasks)).toEqual([]);
  const logs = await logsFor(db, task.id);
  expect(logs[1]).toMatchObject({ action: 'delete', afterJson: null });
  expect(logs[1].beforeJson).toMatchObject({ title: 'Lab 1' });
});

test('id không tồn tại ném NotFoundError', async () => {
  const id = '00000000-0000-4000-8000-000000000000';
  await expect(taskService.update(db, id, { title: 'x' }, manual)).rejects.toBeInstanceOf(NotFoundError);
  await expect(taskService.remove(db, id, manual)).rejects.toBeInstanceOf(NotFoundError);
});

test('lỗi giữa chừng không để lại bản ghi hay log', async () => {
  await expect(taskService.create(db, { areaId: '00000000-0000-4000-8000-000000000000', title: 'x' }, manual)).rejects.toThrow();
  expect(await db.select().from(tasks)).toEqual([]);
  expect(await db.select().from(activityLogs)).toEqual([]);
});

test('xóa milestone giữ task và gỡ liên kết', async () => {
  const area = await makeArea(db, { kind: 'project', name: 'Question House' });
  const ms = await milestoneService.create(db, { areaId: area.id, title: 'Login' }, manual);
  const task = await taskService.create(db, { areaId: area.id, title: 'Fix login', milestoneId: ms.id }, manual);
  await milestoneService.remove(db, ms.id, manual);
  const [after] = await db.select().from(tasks).where(eq(tasks.id, task.id));
  expect(after.milestoneId).toBeNull();
});

test('milestone của area khác bị từ chối', async () => {
  const a = await makeArea(db, { kind: 'project', name: 'A' });
  const b = await makeArea(db, { kind: 'project', name: 'B' });
  const ms = await milestoneService.create(db, { areaId: b.id, title: 'M' }, manual);
  await expect(taskService.create(db, { areaId: a.id, title: 't', milestoneId: ms.id }, manual)).rejects.toBeInstanceOf(ValidationError);
});

test('blocker resolved đặt resolved_at, mở lại thì xóa', async () => {
  const area = await makeArea(db, { kind: 'project', name: 'Question House' });
  const blocker = await blockerService.create(db, { areaId: area.id, title: 'Login Android chưa chạy' }, manual);
  const resolved = await blockerService.update(db, blocker.id, { status: 'resolved' }, manual);
  expect(resolved.resolvedAt).toBeInstanceOf(Date);
  const reopened = await blockerService.update(db, blocker.id, { status: 'open' }, manual);
  expect(reopened.resolvedAt).toBeNull();
});

test('note không gắn area vẫn có log với area_id null', async () => {
  const note = await noteService.create(db, { text: 'Database lab đã nộp', inboxStatus: 'inbox' }, manual);
  expect((await logsFor(db, note.id))[0]).toMatchObject({ areaId: null, entityType: 'note' });
});

test('service chạy được trong transaction bên ngoài và rollback cùng nó', async () => {
  const area = await makeArea(db);
  await expect(db.transaction(async (tx) => {
    await taskService.create(tx, { areaId: area.id, title: 'trong tx' }, manual);
    throw new Error('hủy');
  })).rejects.toThrow('hủy');
  expect(await db.select().from(tasks)).toEqual([]);
  expect(await db.select().from(activityLogs)).toEqual([]);
});
```

```ts
// src/server/schemas.test.ts
import { expect, test } from 'vitest';
import { CreateNoteInput, CreateTaskInput } from './schemas';

const areaId = '11111111-1111-4111-8111-111111111111';

test.each([
  [{ areaId, title: '   ' }, 'tên toàn khoảng trắng'],
  [{ areaId, title: 'x'.repeat(201) }, 'tên quá dài'],
  [{ areaId, title: 'ok', dueDate: '22/11' }, 'ngày sai định dạng'],
  [{ areaId, title: 'ok', dueDate: '' }, 'ngày là chuỗi rỗng'],
  [{ areaId, title: 'ok', dueDate: '2026-02-30' }, 'ngày không tồn tại'],
  [{ areaId, title: 'ok', estimateMinutes: 0 }, 'ước lượng bằng 0'],
  [{ areaId: 'abc', title: 'ok' }, 'areaId không phải uuid'],
])('CreateTaskInput từ chối %o (%s)', (input) => {
  expect(CreateTaskInput.safeParse(input).success).toBe(false);
});

test('tên được trim; dueDate null hợp lệ', () => {
  expect(CreateTaskInput.parse({ areaId, title: '  Lab 1 ', dueDate: null })).toMatchObject({ title: 'Lab 1', dueDate: null });
});

test('note giới hạn 20000 ký tự', () => {
  expect(CreateNoteInput.safeParse({ text: 'x'.repeat(20001) }).success).toBe(false);
  expect(CreateNoteInput.safeParse({ text: '' }).success).toBe(false);
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `pnpm test src/server/services/entities.test.ts src/server/schemas.test.ts`
Expected: FAIL — không tìm thấy module.

- [ ] **Step 3: Cài đặt `schemas.ts`, `activity.ts`, `test-helpers.ts`, `entities.ts`**

Viết một hàm tạo service dùng chung nhận bảng, `entityType`, hai schema và một hook kiểm tra tùy chọn (dùng cho quy tắc milestone và `resolvedAt`); sáu service là sáu lần gọi hàm đó.

- [ ] **Step 4: Chạy lại**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(services): add input schemas, activity log and entity services"
```

---

### Task 2: Service cho area và settings

**Files:**
- Create: `src/server/services/areas.ts`, `src/server/services/settings.ts`
- Modify: `src/server/schemas.ts` (thêm schema area và settings)
- Test: `src/server/services/areas.test.ts`, `src/server/services/settings.test.ts`

**Interfaces:**
- Consumes: `recordChange`, `WriteMeta`, `touchArea` (Task 1)
- Produces:
  - `CreateAreaInput { kind; name: Name; aliases?: Alias[] (tối đa 10, không trùng nhau sau khi bỏ hoa thường); summary?; goal?; status?; priority?; startDate?: DateStr | null; deadlineDate?: DateStr | null; nextAction?: string | null; aiExcluded?: boolean; academic?: { term?; credits?: int 0–30 | null; targetGrade?; gradingScheme?; examFormat?; courseOutline? }; project?: { role?; collaborators?; scope?; cadence? } }`
  - `UpdateAreaInput` — như trên, không có `kind`, mọi trường tùy chọn
  - `UpdateSettingsInput { staleAfterDays?: int 1–90; termGoal?: string | null; defaultFocusMinutes?: int 5–240 | null }`
  - `createArea(db: DbOrTx, input: CreateAreaInput, meta: WriteMeta): Promise<AreaRow>` — tạo luôn dòng `academic_details` hoặc `project_details` theo `kind`
  - `updateArea(db: DbOrTx, id: string, patch: UpdateAreaInput, meta: WriteMeta): Promise<AreaRow>`
  - `archiveArea(db: DbOrTx, id: string, meta: WriteMeta): Promise<void>` · `unarchiveArea(...)` — log action `archive`
  - `addProgressLog(db: DbOrTx, areaId: string, text: string, meta: WriteMeta): Promise<void>` — text 1–2000 ký tự; log `entityType: 'area'`, `action: 'progress'`, `afterJson: { text }`
  - `getSettings(db: DbOrTx): Promise<SettingsRow>` — tạo dòng `id = 1` nếu chưa có
  - `updateSettings(db: DbOrTx, patch: UpdateSettingsInput): Promise<SettingsRow>` · `markOnboarded(db: DbOrTx, at: Date): Promise<void>`

**Quy tắc hành vi:**
- Ảnh chụp `before`/`after` của area có dạng `{ ...areaRow, details: { ...detailsRow } }`.
- `updateArea` không đổi gì thì không ghi log (như Task 1).
- Truyền `academic` cho area loại `project` (hoặc ngược lại) ném `ValidationError('Trường không hợp với loại mục.')`.
- Thay đổi settings không ghi `activity_logs`.

- [ ] **Step 1: Viết test thất bại**

```ts
// src/server/services/areas.test.ts
import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { academicDetails, projectDetails } from '@/db/schema';
import { logsFor } from '@/db/test-helpers';
import { createTestDb } from '@/db/testing';
import { ValidationError } from '../errors';
import { addProgressLog, archiveArea, createArea, updateArea } from './areas';

let db: Db;
const manual = { origin: 'manual' as const };
beforeEach(async () => { db = await createTestDb(); });

test('createArea academic tạo details với target_grade mặc định A', async () => {
  const area = await createArea(db, { kind: 'academic', name: 'Mobile Programming', aliases: ['Mobile'], academic: { term: 'HK1 2026-2027' } }, manual);
  const [details] = await db.select().from(academicDetails).where(eq(academicDetails.areaId, area.id));
  expect(details).toMatchObject({ term: 'HK1 2026-2027', targetGrade: 'A', credits: null });
  expect(area).toMatchObject({ status: 'unknown', aliases: ['Mobile'] });
  const logs = await logsFor(db, area.id);
  expect(logs).toHaveLength(1);
  expect(logs[0].afterJson).toMatchObject({ name: 'Mobile Programming', details: { term: 'HK1 2026-2027' } });
});

test('createArea project tạo project_details', async () => {
  const area = await createArea(db, { kind: 'project', name: 'Question House', project: { role: 'Android dev' } }, manual);
  expect(await db.select().from(projectDetails).where(eq(projectDetails.areaId, area.id))).toHaveLength(1);
});

test('updateArea sửa cả area lẫn details trong một log', async () => {
  const area = await createArea(db, { kind: 'academic', name: 'Database' }, manual);
  await updateArea(db, area.id, { status: 'active', nextAction: 'Xem syllabus', academic: { examFormat: 'Tự luận' } }, manual);
  const logs = await logsFor(db, area.id);
  expect(logs).toHaveLength(2);
  expect(logs[1].beforeJson).toMatchObject({ status: 'unknown', details: { examFormat: null } });
  expect(logs[1].afterJson).toMatchObject({ status: 'active', details: { examFormat: 'Tự luận' } });
});

test('updateArea không đổi gì thì không ghi log', async () => {
  const area = await createArea(db, { kind: 'academic', name: 'Database' }, manual);
  await updateArea(db, area.id, { name: 'Database', status: 'unknown' }, manual);
  expect(await logsFor(db, area.id)).toHaveLength(1);
});

test('trường sai loại và alias không hợp lệ bị từ chối', async () => {
  await expect(createArea(db, { kind: 'project', name: 'X', academic: { term: 'a' } } as any, manual)).rejects.toBeInstanceOf(ValidationError);
  await expect(createArea(db, { kind: 'academic', name: 'C Programming', aliases: ['C'] }, manual)).rejects.toBeInstanceOf(ValidationError);
  await expect(createArea(db, { kind: 'academic', name: 'X', aliases: ['Mobile', 'mobile'] }, manual)).rejects.toBeInstanceOf(ValidationError);
});

test('archiveArea đặt archived_at và ghi log archive', async () => {
  const area = await createArea(db, { kind: 'project', name: 'StewieSAT' }, manual);
  await archiveArea(db, area.id, manual);
  expect((await logsFor(db, area.id))[1]).toMatchObject({ action: 'archive' });
});

test('addProgressLog ghi log progress', async () => {
  const area = await createArea(db, { kind: 'academic', name: 'Mobile Programming' }, manual);
  await addProgressLog(db, area.id, '22/11: đã đọc xong phần Navigation', manual);
  expect((await logsFor(db, area.id))[1]).toMatchObject({ entityType: 'area', action: 'progress', afterJson: { text: '22/11: đã đọc xong phần Navigation' } });
});
```

```ts
// src/server/services/settings.test.ts
import { expect, test } from 'vitest';
import { createTestDb } from '@/db/testing';
import { getSettings, markOnboarded, updateSettings } from './settings';

test('getSettings tạo dòng mặc định một lần', async () => {
  const db = await createTestDb();
  const a = await getSettings(db);
  const b = await getSettings(db);
  expect(a).toMatchObject({ id: 1, timezone: 'Asia/Ho_Chi_Minh', staleAfterDays: 7, onboardedAt: null });
  expect(b.id).toBe(1);
});

test('updateSettings và markOnboarded', async () => {
  const db = await createTestDb();
  expect((await updateSettings(db, { staleAfterDays: 10, termGoal: 'GPA 4.0/4.0, 23 tín chỉ' })).staleAfterDays).toBe(10);
  await markOnboarded(db, new Date('2026-11-22T03:00:00Z'));
  expect((await getSettings(db)).onboardedAt).toEqual(new Date('2026-11-22T03:00:00Z'));
  await expect(updateSettings(db, { staleAfterDays: 0 })).rejects.toThrow();
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `pnpm test src/server/services/areas.test.ts src/server/services/settings.test.ts`
Expected: FAIL — không tìm thấy module.

- [ ] **Step 3: Cài đặt `areas.ts`, `settings.ts` và bổ sung schema**

- [ ] **Step 4: Chạy lại**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(services): add area and settings services"
```

---

### Task 3: Lớp đọc — portfolio snapshot và chi tiết area

**Files:**
- Create: `src/server/queries/snapshot.ts`, `src/server/queries/area-details.ts`
- Test: `src/server/queries/snapshot.test.ts`, `src/server/queries/area-details.test.ts`

**Interfaces:**
- Consumes: `todayIn`, `daysUntil`, `daysSince`, `weekRange`, `weekdayVi`, `APP_TZ`; `getSettings`
- Produces:
  - ```ts
    type AreaSummary = {
      id: string; kind: AreaKind; name: string; aliases: string[];
      status: AreaStatus; priority: Priority; nextAction: string | null;
      deadlineDate: string | null; deadlineDaysLeft: number | null;
      updatedAt: string;              // ISO
      daysSinceUpdate: number; isStale: boolean;
      lastOrigin: Origin | null;      // origin của log gần nhất thuộc area
      aiExcluded: boolean;
      counts: { topics: Record<TopicStatus, number> | null; milestones: Record<MilestoneStatus, number> | null; openTasks: number };
      openBlockers: { id: string; title: string }[];
      missing: MissingFlag[];
    };
    type MissingFlag = 'status_unknown' | 'no_next_action' | 'no_topics' | 'no_assessment_date' | 'no_milestones';
    type PortfolioSnapshot = {
      today: string; weekday: string; week: { start: string; end: string }; timezone: string;
      termGoal: string | null;
      areas: AreaSummary[];           // chưa lưu trữ; xếp theo priority (high→low) rồi name
      dueTasks: { id: string; areaId: string; title: string; status: TaskStatus; dueDate: string; daysLeft: number; deadlineType: DeadlineType }[];
      upcomingAssessments: { id: string; areaId: string; title: string; dueDate: string; daysLeft: number; weight: number | null }[];
      staleAreaIds: string[];         // tối đa 3
    };
    ```
  - `getPortfolioSnapshot(db: DbOrTx, now: Date): Promise<PortfolioSnapshot>`
  - `type AreaDetails = { area: AreaRow; academic: AcademicDetailsRow | null; project: ProjectDetailsRow | null; topics: TopicRow[]; assessments: AssessmentRow[]; milestones: MilestoneRow[]; blockers: BlockerRow[]; tasks: TaskRow[]; notes: NoteRow[]; logs: ActivityLogRow[] }`
  - `getAreaDetails(db: DbOrTx, areaId: string, opts?: { logLimit?: number }): Promise<AreaDetails | null>` — `logLimit` mặc định 50; `topics` theo `sortOrder`; `tasks` theo `sortOrder` rồi `createdAt`; `notes` và `logs` mới nhất trước
  - `listArchivedAreas(db: DbOrTx, kind: AreaKind): Promise<AreaRow[]>`
  - `listInboxNotes(db: DbOrTx): Promise<NoteRow[]>` — `inbox_status = 'inbox'`, mới nhất trước

**Quy tắc tính:**
- `counts.topics` chỉ có ở area `academic`, `counts.milestones` chỉ có ở `project`; loại còn lại là `null`. Mọi khóa trạng thái đều có mặt, kể cả khi bằng 0.
- `isStale`: `status` thuộc `active`/`blocked` **và** `daysSinceUpdate > settings.staleAfterDays`.
- `staleAreaIds`: các area có `status` không thuộc `completed`/`on_hold`, xếp `daysSinceUpdate` giảm dần, lấy 3.
- `dueTasks`: `status != 'done'`, có `dueDate`, `daysLeft <= 14` (gồm cả âm), thuộc area chưa lưu trữ; xếp `dueDate` tăng dần.
- `upcomingAssessments`: `0 <= daysLeft <= 21`; xếp `dueDate` tăng dần.
- `missing`: `status_unknown` khi status là `unknown`; `no_next_action` khi status `active` mà `nextAction` trống; `no_topics` và `no_assessment_date` cho `academic` (cái sau khi không assessment nào có `dueDate`); `no_milestones` cho `project`.

- [ ] **Step 1: Viết test thất bại**

```ts
// src/server/queries/snapshot.test.ts
import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { areas } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { archiveArea, createArea, updateArea } from '../services/areas';
import { assessmentService, blockerService, milestoneService, taskService, topicService } from '../services/entities';
import { getPortfolioSnapshot } from './snapshot';

const NOW = new Date('2026-11-22T03:00:00Z'); // 10:00 Chủ nhật 22/11 giờ VN
const manual = { origin: 'manual' as const };
let db: Db;
beforeEach(async () => { db = await createTestDb(); });
const setUpdatedAt = (id: string, iso: string) => db.update(areas).set({ updatedAt: new Date(iso) }).where(eq(areas.id, id));

test('database trống cho snapshot hợp lệ', async () => {
  expect(await getPortfolioSnapshot(db, NOW)).toEqual({
    today: '2026-11-22', weekday: 'Chủ nhật', week: { start: '2026-11-16', end: '2026-11-22' }, timezone: 'Asia/Ho_Chi_Minh',
    termGoal: null, areas: [], dueTasks: [], upcomingAssessments: [], staleAreaIds: [],
  });
});

test('today đúng lúc 00:30 và 23:30 giờ VN (criterion 15)', async () => {
  expect((await getPortfolioSnapshot(db, new Date('2026-11-21T17:30:00Z'))).today).toBe('2026-11-22');
  expect((await getPortfolioSnapshot(db, new Date('2026-11-22T16:30:00Z'))).today).toBe('2026-11-22');
});

test('cửa sổ task: quá hạn và trong 14 ngày, bỏ task done và task không hạn', async () => {
  const a = await createArea(db, { kind: 'academic', name: 'Database' }, manual);
  const mk = (title: string, dueDate: string | null, status: 'todo' | 'done' = 'todo') => taskService.create(db, { areaId: a.id, title, dueDate, status }, manual);
  await mk('quá hạn', '2026-11-20'); await mk('hôm nay', '2026-11-22'); await mk('ngày 14', '2026-12-06');
  await mk('ngày 15', '2026-12-07'); await mk('xong', '2026-11-23', 'done'); await mk('không hạn', null);
  const snap = await getPortfolioSnapshot(db, NOW);
  expect(snap.dueTasks.map((t) => [t.title, t.daysLeft])).toEqual([['quá hạn', -2], ['hôm nay', 0], ['ngày 14', 14]]);
});

test('cửa sổ assessment: từ hôm nay đến 21 ngày', async () => {
  const a = await createArea(db, { kind: 'academic', name: 'Database' }, manual);
  for (const [title, dueDate] of [['hôm qua', '2026-11-21'], ['hôm nay', '2026-11-22'], ['ngày 21', '2026-12-13'], ['ngày 22', '2026-12-14']])
    await assessmentService.create(db, { areaId: a.id, title, dueDate }, manual);
  expect((await getPortfolioSnapshot(db, NOW)).upcomingAssessments.map((x) => x.title)).toEqual(['hôm nay', 'ngày 21']);
});

test('counts có đủ khóa, kèm blocker đang mở', async () => {
  const course = await createArea(db, { kind: 'academic', name: 'Mobile Programming' }, manual);
  await topicService.create(db, { areaId: course.id, title: 'Navigation', status: 'practiced' }, manual);
  await topicService.create(db, { areaId: course.id, title: 'State', status: 'confident' }, manual);
  await topicService.create(db, { areaId: course.id, title: 'Storage' }, manual);
  await taskService.create(db, { areaId: course.id, title: 'Lab', status: 'doing' }, manual);
  await taskService.create(db, { areaId: course.id, title: 'Đã xong', status: 'done' }, manual);
  const proj = await createArea(db, { kind: 'project', name: 'Question House' }, manual);
  await milestoneService.create(db, { areaId: proj.id, title: 'Login', status: 'in_progress' }, manual);
  const open = await blockerService.create(db, { areaId: proj.id, title: 'Login Android chưa chạy' }, manual);
  const closed = await blockerService.create(db, { areaId: proj.id, title: 'Cũ' }, manual);
  await blockerService.update(db, closed.id, { status: 'resolved' }, manual);
  const snap = await getPortfolioSnapshot(db, NOW);
  const c = snap.areas.find((x) => x.id === course.id)!;
  const p = snap.areas.find((x) => x.id === proj.id)!;
  expect(c.counts).toEqual({ topics: { not_started: 1, familiar: 0, practiced: 1, confident: 1 }, milestones: null, openTasks: 1 });
  expect(p.counts).toEqual({ topics: null, milestones: { not_started: 0, in_progress: 1, done: 0 }, openTasks: 0 });
  expect(p.openBlockers).toEqual([{ id: open.id, title: 'Login Android chưa chạy' }]);
});

test('isStale chỉ áp cho active/blocked quá ngưỡng; staleAreaIds lấy 3 mục cũ nhất chưa đóng', async () => {
  const mk = async (name: string, status: any, iso: string) => { const a = await createArea(db, { kind: 'project', name, status }, manual); await setUpdatedAt(a.id, iso); return a; };
  const d8 = await mk('tám ngày', 'active', '2026-11-14T03:00:00Z');
  const d7 = await mk('bảy ngày', 'active', '2026-11-15T03:00:00Z');
  const done = await mk('xong lâu', 'completed', '2026-10-01T03:00:00Z');
  const unk = await mk('chưa rõ', 'unknown', '2026-11-01T03:00:00Z');
  const hold = await mk('tạm dừng', 'on_hold', '2026-09-01T03:00:00Z');
  const fresh = await mk('mới', 'active', '2026-11-22T01:00:00Z');
  const snap = await getPortfolioSnapshot(db, NOW);
  const by = (id: string) => snap.areas.find((a) => a.id === id)!;
  expect([by(d8.id).isStale, by(d7.id).isStale, by(done.id).isStale, by(unk.id).isStale]).toEqual([true, false, false, false]);
  expect(by(d8.id).daysSinceUpdate).toBe(8);
  expect(snap.staleAreaIds).toEqual([unk.id, d8.id, d7.id]);
  expect(snap.staleAreaIds).not.toContain(hold.id);
  expect(snap.staleAreaIds).not.toContain(fresh.id);
});

test('missing, lastOrigin, bỏ area đã lưu trữ, giữ area ai_excluded', async () => {
  const seeded = await createArea(db, { kind: 'academic', name: 'Algebra' }, { origin: 'seed' });
  const edited = await createArea(db, { kind: 'academic', name: 'Database', aiExcluded: true }, { origin: 'seed' });
  await updateArea(db, edited.id, { status: 'active' }, manual);
  const gone = await createArea(db, { kind: 'project', name: 'Cũ' }, manual);
  await archiveArea(db, gone.id, manual);
  const snap = await getPortfolioSnapshot(db, NOW);
  const by = (id: string) => snap.areas.find((a) => a.id === id);
  expect(by(gone.id)).toBeUndefined();
  expect(by(seeded.id)).toMatchObject({ lastOrigin: 'seed', missing: ['status_unknown', 'no_topics', 'no_assessment_date'] });
  expect(by(edited.id)).toMatchObject({ lastOrigin: 'manual', aiExcluded: true, missing: ['no_next_action', 'no_topics', 'no_assessment_date'] });
});
```

`area-details.test.ts`: tạo một area academic có 2 topic (`sortOrder` 1 và 0), 1 assessment, 2 task, 1 note, rồi kiểm tra `getAreaDetails` trả `topics` theo `sortOrder`, `academic` khác null, `project` là null, `logs` mới nhất trước và tôn trọng `logLimit: 2`; id không tồn tại trả `null`. Kiểm tra `listInboxNotes` chỉ trả note `inbox` và `listArchivedAreas` chỉ trả area đã lưu trữ đúng `kind`.

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `pnpm test src/server/queries`
Expected: FAIL — không tìm thấy module.

- [ ] **Step 3: Cài đặt hai file query**

Snapshot tải toàn bộ bản ghi liên quan bằng một số ít câu truy vấn rồi gom nhóm trong bộ nhớ (quy mô khoảng 14 area); không truy vấn theo từng area.

- [ ] **Step 4: Chạy lại**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(queries): add portfolio snapshot and area details"
```

---

### Task 4: Server actions và danh sách Context

**Files:**
- Create: `src/app/(app)/_actions/result.ts`, `src/app/(app)/_actions/areas.ts`, `src/app/(app)/_actions/entities.ts`, `src/lib/labels.ts`, `src/components/context/{area-list,area-row,stale-strip,add-area-dialog,context-header}.tsx`
- Modify: `src/app/(app)/context/page.tsx`
- Test: `e2e/context-list.spec.ts`

**Interfaces:**
- Consumes: mọi service ở Task 1–2, `getPortfolioSnapshot`, `listArchivedAreas`, `requireOwner`, `getDb`
- Produces:
  - `type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string }`
  - `runAction<T>(fn: (db: Db) => Promise<T>, paths?: string[]): Promise<ActionResult<T>>` — gọi `requireOwner()`, `getDb()`, chạy `fn`, `revalidatePath` từng path (mặc định `['/context']`); `ValidationError`/`NotFoundError` thành `{ ok: false, error: message }`; lỗi khác ghi `console.error` và trả `error: 'Có lỗi xảy ra, thử lại.'`
  - `createAreaAction(input: unknown)`, `updateAreaAction(id: string, patch: unknown)`, `archiveAreaAction(id: string)`, `unarchiveAreaAction(id: string)`, `addProgressLogAction(areaId: string, text: string)` — đều trả `Promise<ActionResult<...>>`, origin `manual`
  - `createEntityAction(type: keyof typeof ENTITY_SERVICES, input: unknown)`, `updateEntityAction(type, id: string, patch: unknown)`, `deleteEntityAction(type, id: string)`
  - `src/lib/labels.ts`: `AREA_STATUS_LABEL`, `TOPIC_STATUS_LABEL`, `TASK_STATUS_LABEL`, `DEADLINE_TYPE_LABEL`, `MILESTONE_STATUS_LABEL` (`Not started / In progress / Done`), `PRIORITY_LABEL` (`High / Medium / Low`), `MISSING_LABEL` (`status_unknown: 'Chưa rõ trạng thái'`, `no_next_action: 'Chưa có việc tiếp theo'`, `no_topics: 'Chưa có topic'`, `no_assessment_date: 'Chưa có ngày thi'`, `no_milestones: 'Chưa có milestone'`)

**Yêu cầu giao diện (spec 3.3):**
- Header: tiêu đề `Context`, hai tab, ô tìm (placeholder `Tìm theo tên`), nút `Thêm`.
- Danh sách dạng compact list của tab đang chọn. Mỗi dòng: tên · badge trạng thái · việc tiếp theo (hoặc milestone/topic đếm kèm mẫu số, ví dụ `2/3 topics Practiced trở lên`) · `Cập nhật dd/MM` · các nhãn `missing` · huy hiệu `n blocker` khi có · nhãn `chưa xác minh lại` khi `lastOrigin === 'seed'` · biểu tượng khóa khi `aiExcluded`.
- Dải `Cần cập nhật` phía trên danh sách: các area `isStale` của **cả hai** tab, mỗi mục ghi `tên · n ngày`; ẩn khi không có.
- Tìm kiếm lọc ngay phía client theo tên và alias, không phân biệt hoa thường và dấu.
- Bấm một dòng đặt `?item=<id>` trên URL (drawer làm ở Task 5).
- Hộp thoại `Thêm`: trường `Tên`, `Tên gọi tắt` (phân tách bằng dấu phẩy), `Trạng thái`, `Ưu tiên`; loại lấy theo tab đang mở; nút `Tạo`. Lỗi từ action hiện ngay trong hộp thoại, trong phần tử `role="alert"`.
- **Đánh dấu cho test:** trong vùng nội dung chính, chỉ danh sách area (`<ul aria-label="Danh sách mục">`) và các danh sách bản ghi bên trong drawer dùng `<li>`. Sidebar, dải `Cần cập nhật` và Inbox không dùng `<li>` (dùng `div`/`article`), để `getByRole('listitem')` ở cấp trang chỉ đếm dòng area.
- Trạng thái rỗng: “Chưa có mục nào. Bấm Thêm để tạo môn học đầu tiên.” (tab Projects: “dự án đầu tiên”).
- Công tắc `Hiện mục đã lưu trữ` cuối danh sách; mục đã lưu trữ có nút `Khôi phục`.

- [ ] **Step 1: Viết E2E thất bại**

```ts
import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

test.beforeEach(async ({ request }) => { await resetDb(request); });

async function addArea(page, name: string, aliases = '') {
  await page.getByRole('button', { name: 'Thêm' }).click();
  await page.getByLabel('Tên', { exact: true }).fill(name);
  if (aliases) await page.getByLabel('Tên gọi tắt').fill(aliases);
  await page.getByRole('button', { name: 'Tạo' }).click();
}

test('trạng thái rỗng', async ({ page }) => {
  await page.goto('/context');
  await expect(page.getByText('Chưa có mục nào. Bấm Thêm để tạo môn học đầu tiên.')).toBeVisible();
});

test('thêm môn, thấy trong danh sách với trạng thái Unknown và nhãn thiếu dữ liệu', async ({ page }) => {
  await page.goto('/context');
  await addArea(page, 'Mobile Programming', 'Mobile');
  const row = page.getByRole('listitem').filter({ hasText: 'Mobile Programming' });
  await expect(row).toContainText('Unknown');
  await expect(row).toContainText('Chưa có topic');
  await page.getByRole('tab', { name: 'Projects' }).click();
  await expect(page.getByText('Mobile Programming')).toHaveCount(0);
});

test('tên toàn khoảng trắng bị từ chối ngay trong hộp thoại', async ({ page }) => {
  await page.goto('/context');
  await addArea(page, '   ');
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(0);
});

test('tìm theo alias, không phân biệt dấu', async ({ page }) => {
  await page.goto('/context');
  await addArea(page, 'Tư tưởng Hồ Chí Minh', 'TTHCM');
  await addArea(page, 'Database');
  await page.getByPlaceholder('Tìm theo tên').fill('tu tuong');
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await page.getByPlaceholder('Tìm theo tên').fill('tthcm');
  await expect(page.getByRole('listitem')).toContainText(['Tư tưởng Hồ Chí Minh']);
});

test('bấm một dòng đưa id lên URL', async ({ page }) => {
  await page.goto('/context');
  await addArea(page, 'Database');
  await page.getByRole('listitem').filter({ hasText: 'Database' }).click();
  await expect(page).toHaveURL(/item=[0-9a-f-]{36}/);
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `pnpm test:e2e e2e/context-list.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Cài đặt actions, labels và các component danh sách**

- [ ] **Step 4: Chạy lại**

Run: `pnpm test:e2e && pnpm typecheck && pnpm lint`
Expected: PASS trên cả `desktop` và `iphone`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(context): add server actions and area list with search and stale strip"
```

---

### Task 5: Drawer chi tiết — Tổng quan và Tasks

**Files:**
- Create: `src/components/context/{area-drawer,overview-form,task-list}.tsx`
- Modify: `src/app/(app)/context/page.tsx` (đọc `?item`, tải `getAreaDetails`)
- Test: `e2e/context-drawer.spec.ts`

**Interfaces:**
- Consumes: `getAreaDetails`, `updateAreaAction`, `archiveAreaAction`, `createEntityAction`, `updateEntityAction`, `deleteEntityAction`, nhãn ở `labels.ts`
- Produces: component `AreaDrawer({ details: AreaDetails, section: string })` với các section đặt tên theo `?section=`: `overview` (mặc định), `tasks`, `topics`, `assessments`, `milestones`, `blockers`, `notes`, `activity`. Task 6 và 7 thêm nội dung cho các section còn lại.

**Yêu cầu giao diện:**
- Drawer là `Sheet` bên phải trên desktop, toàn màn hình khi hẹp hơn 768px; `role="dialog"` có tên là tên area. Đóng drawer xóa `item` và `section` khỏi URL. Tải lại trang với `?item=<id>` mở lại đúng drawer; `item` không tồn tại hiện “Không tìm thấy mục này.”.
- Thanh tab trong drawer: academic thấy `Tổng quan · Tasks · Topics · Assessments · Notes · Activity`; project thấy `Tổng quan · Tasks · Milestones · Blockers · Notes · Activity`. Tab đang chọn nằm trong `?section=`.
- **Tổng quan:** các trường `Tên`, `Tên gọi tắt`, `Mô tả ngắn`, `Mục tiêu`, `Trạng thái`, `Ưu tiên`, `Ngày bắt đầu`, `Deadline`, `Việc tiếp theo`, công tắc `Không gửi cho AI`. Academic thêm `Học kỳ`, `Số tín chỉ`, `Mục tiêu điểm`, `Hình thức đánh giá`, `Hình thức thi`, `Course content overview` (textarea). Project thêm `Vai trò`, `Đối tác/nhóm`, `Phạm vi`, `Nhịp độ mong muốn`. Nút `Lưu` gọi `updateAreaAction` với các trường đã đổi; ô ngày để trống gửi `null`. Nút `Lưu trữ` có bước xác nhận.
- **Tasks:** ô `Thêm task…` (Enter để tạo). Mỗi task: ô chọn trạng thái, tiêu đề sửa tại chỗ, `Hạn`, `Loại deadline`, `Ước lượng (phút)`, nút xóa có xác nhận. Task `Done` hiển thị gạch ngang và xếp cuối. Project: thêm ô chọn `Milestone`.

- [ ] **Step 1: Viết E2E thất bại**

```ts
import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request);
  await page.goto('/context');
  await page.getByRole('button', { name: 'Thêm' }).click();
  await page.getByLabel('Tên', { exact: true }).fill('Computer Networks');
  await page.getByRole('button', { name: 'Tạo' }).click();
  await page.getByRole('listitem').filter({ hasText: 'Computer Networks' }).click();
});

test('drawer mở theo URL và còn nguyên sau khi tải lại', async ({ page }) => {
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  await expect(drawer).toBeVisible();
  await page.reload();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('tab')).toHaveText(['Tổng quan', 'Tasks', 'Topics', 'Assessments', 'Notes', 'Activity']);
});

test('sửa tổng quan được lưu và hiện ở danh sách', async ({ page }) => {
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  await drawer.getByLabel('Trạng thái').selectOption('active');
  await drawer.getByLabel('Việc tiếp theo').fill('Ôn VLSM');
  await drawer.getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.keyboard.press('Escape');
  const row = page.getByRole('listitem').filter({ hasText: 'Computer Networks' });
  await expect(row).toContainText('Active');
  await expect(row).toContainText('Ôn VLSM');
});

test('thêm task, đổi trạng thái, xóa', async ({ page }) => {
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  await drawer.getByRole('tab', { name: 'Tasks' }).click();
  await expect(page).toHaveURL(/section=tasks/);
  await drawer.getByPlaceholder('Thêm task…').fill('Làm lab subnetting');
  await page.keyboard.press('Enter');
  const item = drawer.getByRole('listitem').filter({ hasText: 'Làm lab subnetting' });
  await item.getByLabel('Trạng thái').selectOption('done');
  await page.reload();
  await expect(drawer.getByRole('listitem').filter({ hasText: 'Làm lab subnetting' }).getByLabel('Trạng thái')).toHaveValue('done');
  await drawer.getByRole('listitem').filter({ hasText: 'Làm lab subnetting' }).getByRole('button', { name: 'Xóa' }).click();
  await page.getByRole('button', { name: 'Xác nhận xóa' }).click();
  await expect(drawer.getByRole('listitem')).toHaveCount(0);
});

test('ô nhập trong drawer không nhỏ hơn 16px', async ({ page }) => {
  const sizes = await page.getByRole('dialog').locator('input, textarea, select').evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `pnpm test:e2e e2e/context-drawer.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Cài đặt drawer, form tổng quan và danh sách task**

- [ ] **Step 4: Chạy lại**

Run: `pnpm test:e2e && pnpm typecheck && pnpm lint`
Expected: PASS trên cả hai project.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(context): add detail drawer with overview and tasks"
```

---

### Task 6: Drawer — Topics, Assessments, Milestones, Blockers

**Files:**
- Create: `src/components/context/{topic-list,assessment-list,milestone-list,blocker-list,progress-summary}.tsx`
- Modify: `src/components/context/area-drawer.tsx`
- Test: `e2e/context-sections.spec.ts`

**Interfaces:**
- Consumes: `AreaDrawer`, `createEntityAction`, `updateEntityAction`, `deleteEntityAction`
- Produces: bốn component section, mỗi cái nhận mảng dòng tương ứng và `areaId`

**Yêu cầu giao diện:**
- **Topics:** ô `Thêm topic…`; mỗi topic có tiêu đề, ô chọn trạng thái bốn mức, ô `Bằng chứng` tùy chọn, nút lên/xuống đổi thứ tự (cập nhật `sortOrder`), nút xóa. Đầu section có dòng tổng kết có mẫu số: `n/N topics từ Practiced trở lên`.
- **Assessments:** nút `Thêm assessment`; trường `Tên`, `Ngày`, `Trọng số (%)`, `Điểm`, `Điểm tối đa`; mọi trường trừ tên đều để trống được. Không hiển thị bất kỳ con số tổng hợp hay dự báo điểm nào.
- **Milestones:** `Thêm milestone`; trường `Deliverable`, `Tiêu chí hoàn thành`, `Ngày mục tiêu`, `Trạng thái`. Dòng tổng kết: `n/N milestones Done`.
- **Blockers:** `Thêm blocker`; trường `Vấn đề`, `Bước thử gần nhất`, `Bước tiếp theo`, `Phụ thuộc bên ngoài`; nút `Đã gỡ` chuyển sang `resolved`; blocker đã gỡ thu gọn dưới mục `Đã gỡ (n)`, có nút `Mở lại`.
- Phần “Project health” ở đầu tab `Tổng quan` của project: bốn dòng dữ kiện lấy từ `AreaSummary` — deadline gần nhất, số milestone trễ (quá `targetDate` mà chưa `done`), số blocker đang mở, số ngày chưa cập nhật. Không có điểm số tổng hợp.

- [ ] **Step 1: Viết E2E thất bại**

```ts
import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

async function openNew(page, tab: 'Academic' | 'Projects', name: string) {
  await page.goto('/context');
  await page.getByRole('tab', { name: tab }).click();
  await page.getByRole('button', { name: 'Thêm' }).click();
  await page.getByLabel('Tên', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Tạo' }).click();
  await page.getByRole('listitem').filter({ hasText: name }).click();
  return page.getByRole('dialog', { name });
}

test.beforeEach(async ({ request }) => { await resetDb(request); });

test('topics: thêm, đổi trạng thái, tổng kết có mẫu số', async ({ page }) => {
  const drawer = await openNew(page, 'Academic', 'Mobile Programming');
  await drawer.getByRole('tab', { name: 'Topics' }).click();
  for (const t of ['Navigation', 'State']) { await drawer.getByPlaceholder('Thêm topic…').fill(t); await page.keyboard.press('Enter'); }
  await drawer.getByRole('listitem').filter({ hasText: 'Navigation' }).getByLabel('Trạng thái').selectOption('practiced');
  await expect(drawer.getByText('1/2 topics từ Practiced trở lên')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listitem').filter({ hasText: 'Mobile Programming' })).not.toContainText('Chưa có topic');
});

test('assessment chỉ cần tên; không có dự báo điểm', async ({ page }) => {
  const drawer = await openNew(page, 'Academic', 'Database');
  await drawer.getByRole('tab', { name: 'Assessments' }).click();
  await drawer.getByRole('button', { name: 'Thêm assessment' }).click();
  await drawer.getByLabel('Tên', { exact: true }).fill('Giữa kỳ');
  await drawer.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(drawer.getByRole('listitem').filter({ hasText: 'Giữa kỳ' })).toBeVisible();
  await expect(drawer).not.toContainText(/GPA|dự báo/i);
});

test('blocker: thêm, hiện huy hiệu ở danh sách, gỡ', async ({ page }) => {
  const drawer = await openNew(page, 'Projects', 'Question House');
  await expect(drawer.getByRole('tab')).toHaveText(['Tổng quan', 'Tasks', 'Milestones', 'Blockers', 'Notes', 'Activity']);
  await drawer.getByRole('tab', { name: 'Blockers' }).click();
  await drawer.getByRole('button', { name: 'Thêm blocker' }).click();
  await drawer.getByLabel('Vấn đề').fill('Login Android chưa chạy');
  await drawer.getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.keyboard.press('Escape');
  const row = page.getByRole('listitem').filter({ hasText: 'Question House' });
  await expect(row).toContainText('1 blocker');
  await expect(row).toContainText('Unknown'); // trạng thái area không tự đổi
  await row.click();
  await drawer.getByRole('tab', { name: 'Blockers' }).click();
  await drawer.getByRole('button', { name: 'Đã gỡ' }).click();
  await expect(drawer.getByText('Đã gỡ (1)')).toBeVisible();
});

test('milestone: tổng kết có mẫu số', async ({ page }) => {
  const drawer = await openNew(page, 'Projects', 'StewieSAT');
  await drawer.getByRole('tab', { name: 'Milestones' }).click();
  await drawer.getByRole('button', { name: 'Thêm milestone' }).click();
  await drawer.getByLabel('Deliverable').fill('Trang luyện đề');
  await drawer.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(drawer.getByText('0/1 milestones Done')).toBeVisible();
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `pnpm test:e2e e2e/context-sections.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Cài đặt bốn section và phần project health**

- [ ] **Step 4: Chạy lại**

Run: `pnpm test:e2e && pnpm typecheck && pnpm lint`
Expected: PASS trên cả hai project.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(context): add topics, assessments, milestones and blockers sections"
```

---

### Task 7: Notes, quick capture và timeline hoạt động

**Files:**
- Create: `src/components/context/{notes-panel,activity-timeline,quick-capture,inbox-list}.tsx`, `src/server/queries/describe-log.ts`
- Modify: `src/components/context/area-drawer.tsx`, `src/components/context/context-header.tsx`, `src/app/(app)/context/page.tsx`
- Test: `src/server/queries/describe-log.test.ts`, `e2e/context-notes.spec.ts`

**Interfaces:**
- Consumes: `listInboxNotes`, `createEntityAction('note', …)`, `updateEntityAction`, `deleteEntityAction`, `addProgressLogAction`
- Produces:
  - `describeLog(log: ActivityLogRow): { title: string; changes: { field: string; before: string | null; after: string | null }[] }` — `title` tiếng Việt theo `action` và `entityType` (ví dụ `Tạo task “Lab 1”`, `Sửa topic “Navigation”`, `Xóa task “Lab 1”`, `Lưu trữ mục`, `Ghi nhận tiến độ`); `changes` chỉ gồm trường khác nhau giữa `before` và `after`, bỏ `updatedAt`, `createdAt`, `id`, `areaId`, `sortOrder`; giá trị enum đổi sang nhãn ở `labels.ts`. Hàm này dùng lại ở Phase 3 để vẽ diff của đề xuất.
  - `ORIGIN_LABEL` thêm vào `labels.ts`: `manual: 'Thủ công'`, `ai_approved: 'AI (đã duyệt)'`, `seed: 'Seed'`, `undo: 'Hoàn tác'`

**Yêu cầu giao diện:**
- **Notes (trong drawer):** nút `Thêm ghi chú` tạo note rỗng-chờ-nhập; mỗi note là textarea Markdown, **tự lưu sau 1,5 giây ngừng gõ** và khi rời ô; hiện `Đã lưu` sau khi lưu xong. Mỗi note có công tắc `Không gửi cho AI` và nút xóa. Không tạo note khi nội dung rỗng.
- **Activity:** timeline mới nhất trước; mỗi dòng: thời gian `dd/MM HH:mm` giờ Việt Nam · nhãn origin · `title` · danh sách `trường: trước → sau`. Phía trên có ô `Ghi nhận tiến độ…` + nút `Thêm log` gọi `addProgressLogAction`.
- **Quick capture (header Context):** textarea placeholder `Ghi nhanh…` + nút `Lưu ghi chú`; tạo note `inboxStatus: 'inbox'`, không gắn area. Lưu xong xóa trắng ô và hiện toast `Đã lưu vào Inbox`.
- **Inbox:** mục `Inbox (n)` ngay dưới header, thu gọn được; liệt kê note inbox với nội dung, thời gian, ô chọn `Gắn vào…` (danh sách area; chọn xong gọi `updateEntityAction('note', id, { areaId, inboxStatus: 'processed' })`), nút `Xóa`. Nút `Extract suggestions` hiện nhưng **vô hiệu** kèm chú thích “Có ở Phase 3”.

- [ ] **Step 1: Viết test thất bại**

```ts
// src/server/queries/describe-log.test.ts
import { expect, test } from 'vitest';
import { describeLog } from './describe-log';

const base = { id: 'l', areaId: 'a', entityId: 'e', batchId: null, createdAt: new Date(), origin: 'manual' as const };

test('update chỉ liệt kê trường thay đổi, enum đổi sang nhãn', () => {
  const out = describeLog({ ...base, entityType: 'topic', action: 'update',
    beforeJson: { id: 'e', title: 'Navigation', status: 'not_started', updatedAt: '2026-11-20T00:00:00Z' },
    afterJson: { id: 'e', title: 'Navigation', status: 'familiar', updatedAt: '2026-11-22T00:00:00Z' } } as any);
  expect(out).toEqual({ title: 'Sửa topic “Navigation”', changes: [{ field: 'Trạng thái', before: 'Not started', after: 'Familiar' }] });
});

test('create, delete, progress, archive', () => {
  const mk = (entityType: string, action: string, beforeJson: any, afterJson: any) => describeLog({ ...base, entityType, action, beforeJson, afterJson } as any).title;
  expect(mk('task', 'create', null, { title: 'Lab 1' })).toBe('Tạo task “Lab 1”');
  expect(mk('task', 'delete', { title: 'Lab 1' }, null)).toBe('Xóa task “Lab 1”');
  expect(mk('area', 'progress', null, { text: '22/11: đã đọc xong phần Navigation' })).toBe('Ghi nhận tiến độ');
  expect(mk('area', 'archive', {}, {})).toBe('Lưu trữ mục');
});

test('note dùng 40 ký tự đầu làm tên', () => {
  const out = describeLog({ ...base, entityType: 'note', action: 'create', beforeJson: null, afterJson: { text: 'x'.repeat(60) } } as any);
  expect(out.title).toBe(`Tạo ghi chú “${'x'.repeat(40)}…”`);
});
```

```ts
// e2e/context-notes.spec.ts
import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

test.beforeEach(async ({ request }) => { await resetDb(request); });

test('quick capture vào Inbox rồi gắn vào một môn', async ({ page }) => {
  await page.goto('/context');
  await page.getByRole('button', { name: 'Thêm' }).click();
  await page.getByLabel('Tên', { exact: true }).fill('Database');
  await page.getByRole('button', { name: 'Tạo' }).click();
  await page.getByPlaceholder('Ghi nhanh…').fill('Database lab đã nộp');
  await page.getByRole('button', { name: 'Lưu ghi chú' }).click();
  await expect(page.getByText('Inbox (1)')).toBeVisible();
  await expect(page.getByPlaceholder('Ghi nhanh…')).toHaveValue('');
  await page.getByLabel('Gắn vào…').selectOption({ label: 'Database' });
  await expect(page.getByText('Inbox (1)')).toHaveCount(0);
  await page.getByRole('listitem').filter({ hasText: 'Database' }).click();
  await page.getByRole('dialog').getByRole('tab', { name: 'Notes' }).click();
  await expect(page.getByRole('dialog').getByRole('textbox').first()).toHaveValue('Database lab đã nộp');
});

test('note tự lưu và timeline ghi lại đúng một lần cho mỗi thay đổi', async ({ page }) => {
  await page.goto('/context');
  await page.getByRole('button', { name: 'Thêm' }).click();
  await page.getByLabel('Tên', { exact: true }).fill('Mobile Programming');
  await page.getByRole('button', { name: 'Tạo' }).click();
  await page.getByRole('listitem').filter({ hasText: 'Mobile Programming' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('tab', { name: 'Notes' }).click();
  await drawer.getByRole('button', { name: 'Thêm ghi chú' }).click();
  await drawer.getByRole('textbox').first().fill('Cần xem syllabus');
  await expect(drawer.getByText('Đã lưu')).toBeVisible();
  await drawer.getByRole('tab', { name: 'Activity' }).click();
  await expect(drawer.getByText('Tạo ghi chú “Cần xem syllabus”')).toHaveCount(1);
  await drawer.getByPlaceholder('Ghi nhận tiến độ…').fill('Đã đọc xong chương 1');
  await drawer.getByRole('button', { name: 'Thêm log' }).click();
  await expect(drawer.getByText('Ghi nhận tiến độ')).toBeVisible();
  await expect(drawer.getByText('Thủ công').first()).toBeVisible();
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `pnpm test src/server/queries/describe-log.test.ts && pnpm test:e2e e2e/context-notes.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Cài đặt `describe-log.ts` và các component**

Autosave: giữ nội dung đã lưu gần nhất ở client; chỉ gọi action khi nội dung khác bản đó. Note mới chỉ gọi `createEntityAction` ở lần lưu đầu tiên có nội dung, các lần sau gọi `updateEntityAction`.

- [ ] **Step 4: Chạy lại**

Run: `pnpm test && pnpm test:e2e && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(context): add notes autosave, quick capture inbox and activity timeline"
```

---

### Task 8: Seed data và onboarding

**Files:**
- Create: `src/server/seed/seed-data.ts`, `src/server/seed/import-seed.ts`, `scripts/seed.ts`, `src/components/shell/onboarding-dialog.tsx`, `src/app/(app)/_actions/onboarding.ts`
- Modify: `src/app/(app)/layout.tsx`, `src/app/api/test/reset/route.ts`, `e2e/helpers.ts`, `package.json` (script `db:seed`)
- Test: `src/server/seed/import-seed.test.ts`, `e2e/onboarding.spec.ts`

**Interfaces:**
- Consumes: `createArea`, `getSettings`, `updateSettings`, `markOnboarded`
- Produces:
  - `type SeedItem = { key: string; kind: AreaKind; name: string; aliases: string[]; summary: string | null; status: AreaStatus }`
  - `SEED_ITEMS: readonly SeedItem[]` · `SEED_TERM_GOAL = 'GPA 4.0/4.0, 23 tín chỉ'`
  - `importSeed(db: Db, input: { items: { key: string; name: string }[]; termGoal: string | null; now: Date }): Promise<{ created: number }>` — chỉ nhập `key` có trong `SEED_ITEMS`, cho phép đổi `name`; mọi bản ghi origin `seed`; đặt `termGoal`; gọi `markOnboarded`; chạy trong một transaction; gọi lần hai khi đã onboarded thì ném `ValidationError('Đã hoàn tất thiết lập ban đầu.')`
  - `completeOnboardingAction(input: { items: { key: string; name: string }[]; termGoal: string | null })` · `skipOnboardingAction()` — cái sau chỉ gọi `markOnboarded`
  - `POST /api/test/reset` nhận thêm `{ seed?: boolean; onboarded?: boolean }`: mặc định `onboarded: true` (đặt `onboarded_at`), `seed: true` gọi `importSeed` với toàn bộ `SEED_ITEMS`. `resetDb(request, opts)` trong `e2e/helpers.ts` truyền các cờ này.

**Nội dung `SEED_ITEMS`** (chép đúng, không thêm trường nào khác):

| key | kind | name | aliases | summary | status |
|---|---|---|---|---|---|
| `technical-writing` | academic | Technical Writing | `[]` | null | unknown |
| `database` | academic | Database | `['DB']` | `Có phần Lab` | unknown |
| `algebra` | academic | Algebra | `[]` | `Học cải thiện` | unknown |
| `computer-networks` | academic | Computer Networks | `['Networks']` | `Có phần Lab. Đang theo tiến độ, theo tự đánh giá.` | active |
| `intro-comm-eng` | academic | Introduction to Communications Engineering | `['ICE']` | `Đang theo tiến độ, theo tự đánh giá.` | active |
| `c-programming` | academic | C Programming | `[]` | `Học cải thiện` | unknown |
| `mobile-programming` | academic | Mobile Programming | `['Mobile']` | `Chưa bắt đầu ôn có hệ thống; cần xác minh syllabus và phương thức thi.` | not_started |
| `software-engineering` | academic | Software Engineering | `['SE']` | `Chưa bắt đầu ôn có hệ thống; cần xác minh syllabus và phương thức thi.` | not_started |
| `tthcm` | academic | Tư tưởng Hồ Chí Minh | `['TTHCM']` | null | unknown |
| `llm4ad` | project | LLM4AD/LLMEC | `['LLM4AD', 'LLMEC']` | `Personal research` | unknown |
| `research-assistant` | project | Research Assistant | `['RA']` | `Hỗ trợ nhóm khác` | unknown |
| `question-house` | project | Question House | `['QH']` | `Android app` | unknown |
| `stewiesat` | project | StewieSAT | `[]` | `Website/platform` | unknown |
| `atgt` | project | ATGT Competition | `['ATGT']` | `Thi tháng 1/2027` | unknown |

**Yêu cầu giao diện:** khi `settings.onboardedAt` là null, layout `(app)` hiện hộp thoại `Review & import` không đóng được bằng Escape. Hộp thoại liệt kê seed theo hai nhóm Academic và Projects; mỗi dòng có ô chọn (mặc định chọn), ô sửa tên, mô tả và trạng thái ở dạng chỉ đọc; ô `Mục tiêu học kỳ` điền sẵn `SEED_TERM_GOAL`; ghi chú “Đây là bản nháp từ thông tin cũ. Các mục sẽ mang nhãn ‘chưa xác minh lại’ cho tới khi bạn sửa.”; hai nút `Nhập mục đã chọn` và `Bỏ qua`.

- [ ] **Step 1: Viết test thất bại**

```ts
// src/server/seed/import-seed.test.ts
import { expect, test } from 'vitest';
import { activityLogs, assessments, tasks, topics } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { getPortfolioSnapshot } from '../queries/snapshot';
import { getSettings } from '../services/settings';
import { importSeed } from './import-seed';
import { SEED_ITEMS, SEED_TERM_GOAL } from './seed-data';

const NOW = new Date('2026-11-22T03:00:00Z');
const all = SEED_ITEMS.map((s) => ({ key: s.key, name: s.name }));

test('seed có 9 môn và 5 dự án', () => {
  expect(SEED_ITEMS.filter((s) => s.kind === 'academic')).toHaveLength(9);
  expect(SEED_ITEMS.filter((s) => s.kind === 'project')).toHaveLength(5);
});

test('nhập toàn bộ: origin seed, không bịa dữ liệu (criterion 4)', async () => {
  const db = await createTestDb();
  expect(await importSeed(db, { items: all, termGoal: SEED_TERM_GOAL, now: NOW })).toEqual({ created: 14 });
  const snap = await getPortfolioSnapshot(db, NOW);
  expect(snap.areas).toHaveLength(14);
  expect(snap.areas.every((a) => a.lastOrigin === 'seed')).toBe(true);
  expect(snap.termGoal).toBe('GPA 4.0/4.0, 23 tín chỉ');
  expect(snap.areas.filter((a) => a.status === 'unknown')).toHaveLength(10);
  expect(snap.areas.find((a) => a.name === 'Mobile Programming')!.status).toBe('not_started');
  expect(snap.areas.every((a) => a.deadlineDate === null)).toBe(true);
  for (const table of [topics, tasks, assessments]) expect(await db.select().from(table)).toEqual([]);
  expect((await db.select().from(activityLogs)).every((l) => l.origin === 'seed')).toBe(true);
  expect((await getSettings(db)).onboardedAt).toEqual(NOW);
});

test('chỉ nhập mục được chọn, cho đổi tên, bỏ qua key lạ', async () => {
  const db = await createTestDb();
  const out = await importSeed(db, { items: [{ key: 'database', name: 'Cơ sở dữ liệu' }, { key: 'khong-co', name: 'X' }], termGoal: null, now: NOW });
  expect(out).toEqual({ created: 1 });
  expect((await getPortfolioSnapshot(db, NOW)).areas.map((a) => a.name)).toEqual(['Cơ sở dữ liệu']);
});

test('không nhập lần hai', async () => {
  const db = await createTestDb();
  await importSeed(db, { items: all, termGoal: null, now: NOW });
  await expect(importSeed(db, { items: all, termGoal: null, now: NOW })).rejects.toThrow('Đã hoàn tất thiết lập ban đầu.');
  expect((await getPortfolioSnapshot(db, NOW)).areas).toHaveLength(14);
});
```

```ts
// e2e/onboarding.spec.ts
import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

test('review, bỏ chọn một mục, nhập; hộp thoại không hiện lại', async ({ page, request }) => {
  await resetDb(request, { onboarded: false });
  await page.goto('/context');
  const dialog = page.getByRole('dialog', { name: 'Review & import' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Algebra' }).uncheck();
  await dialog.getByRole('button', { name: 'Nhập mục đã chọn' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('listitem').filter({ hasText: 'chưa xác minh lại' })).toHaveCount(8);
  await expect(page.getByText('Algebra')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Review & import' })).toHaveCount(0);
});

test('Bỏ qua không tạo gì', async ({ page, request }) => {
  await resetDb(request, { onboarded: false });
  await page.goto('/context');
  await page.getByRole('button', { name: 'Bỏ qua' }).click();
  await expect(page.getByText('Chưa có mục nào.')).toBeVisible();
});

test('nhãn chưa xác minh lại biến mất sau lần sửa đầu tiên', async ({ page, request }) => {
  await resetDb(request, { seed: true });
  await page.goto('/context');
  const row = page.getByRole('listitem').filter({ hasText: 'Database' });
  await expect(row).toContainText('chưa xác minh lại');
  await row.click();
  await page.getByRole('dialog').getByLabel('Trạng thái').selectOption('active');
  await page.getByRole('dialog').getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listitem').filter({ hasText: 'Database' })).not.toContainText('chưa xác minh lại');
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `pnpm test src/server/seed && pnpm test:e2e e2e/onboarding.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Cài đặt seed, action, hộp thoại, mở rộng route reset, script `db:seed`**

`scripts/seed.ts` gọi `importSeed` với toàn bộ `SEED_ITEMS`; từ chối chạy khi `NODE_ENV=production`.

- [ ] **Step 4: Chạy lại toàn bộ**

Run: `pnpm test && pnpm test:e2e && pnpm typecheck && pnpm lint`
Expected: PASS; các E2E cũ vẫn xanh vì `resetDb` mặc định `onboarded: true`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(seed): add seed data, import and onboarding review dialog"
```

---

### Task 9: Settings và export

**Files:**
- Create: `src/server/queries/export.ts`, `src/app/api/export/route.ts`, `src/components/shell/settings-dialog.tsx`, `src/app/(app)/_actions/settings.ts`
- Modify: `src/components/shell/sidebar.tsx`
- Test: `src/server/queries/export.test.ts`, `e2e/settings.spec.ts`

**Interfaces:**
- Consumes: `TABLE_NAMES`, mọi bảng trong `schema.ts`, `withOwner`, `getSettings`, `updateSettings`, `signOut`
- Produces:
  - `buildExport(db: DbOrTx, now: Date): Promise<{ schema_version: 1; exported_at: string; tables: Record<string, unknown[]> }>` — khóa của `tables` đúng bằng `TABLE_NAMES`
  - `GET /api/export` — bọc `withOwner`; header `Content-Type: application/json` và `Content-Disposition: attachment; filename="personal-ai-export-<YYYY-MM-DD>.json"` (ngày theo giờ Việt Nam)
  - `updateSettingsAction(patch: unknown): Promise<ActionResult<SettingsRow>>`

**Yêu cầu giao diện:** nút `Settings` ở sidebar mở hộp thoại (không phải trang) gồm: `Mục tiêu học kỳ`, `Coi là cũ sau (ngày)`, `Thời lượng tập trung mặc định (phút)`, nút đổi giao diện sáng/tối, liên kết `Xuất dữ liệu (JSON)` trỏ tới `/api/export`, nút `Đăng xuất`. Múi giờ hiển thị dạng chỉ đọc.

- [ ] **Step 1: Viết test thất bại**

```ts
// src/server/queries/export.test.ts
import { expect, test } from 'vitest';
import { TABLE_NAMES } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { importSeed } from '../seed/import-seed';
import { SEED_ITEMS } from '../seed/seed-data';
import { buildExport } from './export';

test('export đủ mọi bảng và có schema_version (criterion 17)', async () => {
  const db = await createTestDb();
  const now = new Date('2026-11-22T03:00:00Z');
  await importSeed(db, { items: SEED_ITEMS.map((s) => ({ key: s.key, name: s.name })), termGoal: null, now });
  const out = await buildExport(db, now);
  expect(out.schema_version).toBe(1);
  expect(out.exported_at).toBe('2026-11-22T03:00:00.000Z');
  expect(Object.keys(out.tables).sort()).toEqual([...TABLE_NAMES].sort());
  expect(out.tables.areas).toHaveLength(14);
  expect(out.tables.activity_logs).toHaveLength(14);
  expect(() => JSON.stringify(out)).not.toThrow();
});
```

```ts
// e2e/settings.spec.ts
import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

test('đổi ngưỡng cũ và tải export', async ({ page, request, isMobile }) => {
  await resetDb(request, { seed: true });
  await page.goto('/context');
  if (isMobile) await page.getByRole('button', { name: 'Mở menu' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByLabel('Coi là cũ sau (ngày)').fill('10');
  await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.reload();
  const res = await request.get('/api/export');
  expect(res.headers()['content-disposition']).toMatch(/personal-ai-export-\d{4}-\d{2}-\d{2}\.json/);
  const body = await res.json();
  expect(body.schema_version).toBe(1);
  expect(body.tables.settings[0].stale_after_days ?? body.tables.settings[0].staleAfterDays).toBe(10);
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `pnpm test src/server/queries/export.test.ts && pnpm test:e2e e2e/settings.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Cài đặt export, route, hộp thoại Settings**

`buildExport` lặp qua một bản đồ `tên bảng → đối tượng bảng` export từ `schema.ts`, để bảng thêm sau này không thể bị sót.

- [ ] **Step 4: Chạy lại toàn bộ**

Run: `pnpm test && pnpm test:e2e && pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS và build thành công.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(settings): add settings dialog and JSON export"
```

**Xong Phase 1 khi:** mọi test xanh; trên `pnpm dev` làm được trọn user flow C của spec (mở Computer Networks → sửa topic → thêm note → thấy log), và owner đã xem qua giao diện ở bề rộng iPhone.
