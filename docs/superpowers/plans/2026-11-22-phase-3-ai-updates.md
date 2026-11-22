# Phase 3 — AI đề xuất cập nhật: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI đề xuất thay đổi dữ liệu từ Chat và từ quick capture; owner xem trước, duyệt toàn bộ hoặc một phần, sửa hoặc từ chối; chỉ khi duyệt mới ghi, đúng một lần, có log.

**Architecture:** Model phát ra một đề xuất `{ summary, actions[] }` qua tool `propose_changes` (chế độ `tools`) hoặc khối `<proposed_actions>` cuối câu trả lời (chế độ `json`); cả hai đi chung một đường: parse bằng Zod → kiểm tra ID với database và ghi mốc `baseUpdatedAt` → lưu `pending_actions`. Khi duyệt, một transaction chuyển trạng thái `pending → applied` có điều kiện, kiểm tra xung đột theo mốc, rồi gọi đúng các service của Phase 1 với origin `ai_approved`.

**Tech Stack:** Zod 4 (`z.toJSONSchema`), Drizzle transaction, server actions, Vitest + PGlite, Playwright với mock provider.

**Spec:** `Personal_AI_Workspace_V1.1_Spec.md` — mục 3.2 (thẻ Proposed changes), 3.3 (Quick capture), 6.1, 6.3, 7 (flow B, D, F), 10 (Phase 3), criteria 7, 8, 10, 12, 14, 16. Đọc thêm `docs/superpowers/plans/README.md`.

**Điều kiện bắt đầu:** Phase 2 xong. `AI_ACTION_MODE` theo báo cáo probe là `tools` hoặc `json`. Nếu là `off`, **dừng lại và báo owner**: theo spec mục 10, Phase 3 chỉ làm sau khi đổi được sang provider hỗ trợ `tools` hoặc `json`.

## Global Constraints

- Không ghi dữ liệu nghiệp vụ nào trước khi owner duyệt. Lưu `pending_actions` không phải là ghi dữ liệu nghiệp vụ.
- Duyệt: mọi hành động được chọn thành công, hoặc không hành động nào được ghi.
- Bấm duyệt nhiều lần hay đồng thời chỉ áp dụng một lần.
- Bản ghi đích đã đổi hoặc đã mất sau thời điểm đề xuất → báo xung đột, không ghi đè mù.
- Đề xuất không hợp lệ (JSON hỏng, sai schema, ID không tồn tại) → bỏ cả đề xuất, giữ phần văn bản, thêm một dòng báo đã bỏ qua. Không bao giờ nói đã cập nhật khi chưa.
- AI không đề xuất xóa. Mười loại hành động đúng như spec 6.3.
- Mọi ghi qua duyệt mang origin `ai_approved` và chung một `batchId`.
- Một đề xuất tối đa 20 hành động.
- Thẻ đề xuất dùng được bằng một tay trên iPhone: nút từ 44px, không cần cuộn ngang.

## Review Focus

1. Model đưa ID không tồn tại, ID của loại bản ghi khác, hoặc `areaId` không khớp với bản ghi → bỏ cả đề xuất, không tạo dòng pending. *(Task 1, Task 2)*
2. Thẻ `<proposed_actions>` bị cắt đôi giữa hai chunk, thiếu thẻ đóng, hoặc JSON bọc trong code fence → không ký tự nào của khối lọt ra phần văn bản hiển thị; parse vẫn đúng. *(Task 2)*
3. Hai lần duyệt đồng thời → dữ liệu đổi đúng một lần. *(Task 3)*
4. Bản ghi đích bị sửa hoặc bị xóa bằng UI giữa lúc đề xuất và lúc duyệt → xung đột, không ghi gì. *(Task 3)*
5. Giá trị ngoài enum, ngày dạng `22/11`, 21 hành động, patch rỗng → bị schema từ chối. *(Task 1)*

---

### Task 1: Schema đề xuất, kiểm tra với database và bản xem trước

**Files:**
- Create: `src/server/proposals/schema.ts`, `src/server/proposals/validate.ts`, `src/server/proposals/describe.ts`
- Modify: `src/server/queries/describe-log.ts` (export `FIELD_LABEL`, `formatFieldValue`, `entityName`)
- Test: `src/server/proposals/schema.test.ts`, `src/server/proposals/validate.test.ts`, `src/server/proposals/describe.test.ts`

**Interfaces:**
- Consumes: các schema đầu vào ở `src/server/schemas.ts`, `ToolDef`, `describeLog` và các helper của nó
- Produces:
  - `ProposedAction` — discriminated union theo `type` (mọi `id`, `areaId`, `milestoneId` là uuid; trường chi tiết tái dùng ràng buộc của `schemas.ts`):

    | `type` | Trường |
    |---|---|
    | `create_task` | `areaId`, `title`, `status?`, `dueDate?`, `deadlineType?`, `estimateMinutes?`, `milestoneId?` |
    | `update_task` | `id`, `patch` = `{ title?, status?, dueDate?, deadlineType?, estimateMinutes?, blockedReason? }` có ít nhất một trường |
    | `update_area` | `id`, `patch` = `{ status?, priority?, nextAction?, summary?, goal?, startDate?, deadlineDate? }` có ít nhất một trường |
    | `upsert_topic` | `areaId`, `id?`, `title?`, `status?`, `evidence?` — không có `id` thì bắt buộc `title`; có `id` thì cần ít nhất một trường khác |
    | `upsert_milestone` | `areaId`, `id?`, `title?`, `acceptanceCriteria?`, `targetDate?`, `status?` — cùng luật |
    | `upsert_assessment` | `areaId`, `id?`, `title?`, `dueDate?`, `weight?`, `score?`, `maxScore?` — cùng luật |
    | `create_note` | `areaId?` (uuid hoặc null), `text` |
    | `add_progress_log` | `areaId`, `text` (1–2000 ký tự) |
    | `create_blocker` | `areaId`, `title`, `lastAttempt?`, `nextAction?`, `externalDependency?` |
    | `resolve_blocker` | `id` |

  - `ProposeChangesSchema = z.object({ summary: 1–300 ký tự, actions: mảng 1–20 ProposedAction })` · `type ProposeChanges`
  - `PROPOSE_CHANGES_TOOL: ToolDef` — `name: 'propose_changes'`, `description: 'Đề xuất thay đổi dữ liệu để người dùng duyệt. Không thay đổi nào được ghi trước khi họ duyệt.'`, `parameters: z.toJSONSchema(ProposeChangesSchema)`
  - `type StoredAction = { key: number; action: ProposedAction; baseUpdatedAt: string | null }`
  - `type StoredProposal = { summary: string; actions: StoredAction[]; appliedKeys?: number[] }` — nội dung cột `pending_actions.actions_json`
  - `stampActions(db: DbOrTx, actions: ProposedAction[]): Promise<{ ok: true; stored: StoredAction[] } | { ok: false; errors: { index: number; message: string }[] }>`
  - `type ActionPreview = { key: number; type: ProposedAction['type']; areaId: string | null; areaName: string | null; label: string; changes: { field: string; before: string | null; after: string | null }[]; isCreate: boolean; conflict: 'none' | 'changed' | 'missing' }`
  - `describeStored(db: DbOrTx, stored: StoredAction[]): Promise<ActionPreview[]>`

**Quy tắc `stampActions`** (chỉ cần một hành động lỗi là `ok: false`; `key` bằng vị trí trong mảng):
- Hành động có `id`: bản ghi phải tồn tại **đúng loại** (`update_task` → `tasks`, `update_area` → `areas`, `upsert_topic` → `topics`, …). Với `upsert_*` có `id`, `areaId` của bản ghi phải bằng `action.areaId`. `baseUpdatedAt` = `updatedAt.toISOString()` của bản ghi.
- Hành động tạo mới: `areaId` phải tồn tại; `baseUpdatedAt` = null. `create_note` với `areaId` null là hợp lệ.
- Area đích (trực tiếp hoặc qua bản ghi con) đã lưu trữ → lỗi “Mục đã lưu trữ.”.
- `milestoneId` phải thuộc cùng area. `upsert_topic`/`upsert_assessment` chỉ cho area `academic`; `upsert_milestone`/`create_blocker` chỉ cho area `project`.
- `resolve_blocker` với blocker đã `resolved` → lỗi “Blocker đã được gỡ.”.

**Quy tắc `describeStored`:**
- `label` tiếng Việt: `Tạo task “…”`, `Sửa task “…”`, `Sửa mục “…”`, `Tạo topic “…”`, `Sửa topic “…”`, tương tự cho milestone và assessment, `Thêm ghi chú`, `Thêm log tiến độ`, `Tạo blocker “…”`, `Gỡ blocker “…”`. Tên trong ngoặc là tiêu đề hiện tại của bản ghi (cập nhật) hoặc tiêu đề đề xuất (tạo mới).
- `changes`: với cập nhật, mỗi trường trong patch mà giá trị khác hiện tại cho một dòng `trước → sau`; với tạo mới, mỗi trường có giá trị cho một dòng với `before: null`. Nhãn trường và nhãn enum lấy từ `FIELD_LABEL` / `formatFieldValue`. `milestoneId` hiện bằng tiêu đề milestone (tra trong DB), không hiện uuid.
- `conflict`: `missing` khi bản ghi đích không còn; `changed` khi `updatedAt` hiện tại khác `baseUpdatedAt`; còn lại `none`. Hành động tạo mới: `missing` khi area không còn hoặc đã lưu trữ, ngược lại `none`.

- [ ] **Step 1: Viết test thất bại**

```ts
// src/server/proposals/schema.test.ts
import { expect, test } from 'vitest';
import { PROPOSE_CHANGES_TOOL, ProposeChangesSchema } from './schema';

const A = '11111111-1111-4111-8111-111111111111';
const T = '22222222-2222-4222-8222-222222222222';
const wrap = (action: unknown) => ({ summary: 'Cập nhật', actions: [action] });

test.each([
  [{ type: 'upsert_topic', areaId: A, id: T, status: 'practiced', evidence: '5 bài' }],
  [{ type: 'upsert_topic', areaId: A, title: 'VLSM', status: 'practiced' }],
  [{ type: 'create_task', areaId: A, title: 'Ôn VLSM', dueDate: '2026-11-25', deadlineType: 'committed' }],
  [{ type: 'update_task', id: T, patch: { dueDate: null } }],
  [{ type: 'update_area', id: A, patch: { status: 'active', nextAction: 'Xem syllabus' } }],
  [{ type: 'add_progress_log', areaId: A, text: '22/11: đã đọc xong phần Navigation' }],
  [{ type: 'create_note', areaId: null, text: 'ghi chú' }],
  [{ type: 'create_blocker', areaId: A, title: 'Login Android chưa chạy' }],
  [{ type: 'resolve_blocker', id: T }],
])('hợp lệ: %o', (action) => {
  expect(ProposeChangesSchema.safeParse(wrap(action)).success).toBe(true);
});

test.each([
  [{ type: 'delete_task', id: T }, 'không có hành động xóa'],
  [{ type: 'upsert_topic', areaId: A, status: 'in_progress', id: T }, 'status ngoài enum'],
  [{ type: 'upsert_topic', areaId: A, status: 'practiced' }, 'tạo topic thiếu title'],
  [{ type: 'upsert_topic', areaId: A, id: T }, 'cập nhật không có trường nào'],
  [{ type: 'update_task', id: T, patch: {} }, 'patch rỗng'],
  [{ type: 'create_task', areaId: A, title: 'x', dueDate: '22/11' }, 'ngày sai định dạng'],
  [{ type: 'create_task', areaId: 'mobile-programming', title: 'x' }, 'areaId không phải uuid'],
  [{ type: 'add_progress_log', areaId: A, text: '' }, 'text rỗng'],
])('không hợp lệ: %o (%s)', (action) => {
  expect(ProposeChangesSchema.safeParse(wrap(action)).success).toBe(false);
});

test('giới hạn số hành động và summary', () => {
  const one = { type: 'resolve_blocker', id: T };
  expect(ProposeChangesSchema.safeParse({ summary: 's', actions: Array(20).fill(one) }).success).toBe(true);
  expect(ProposeChangesSchema.safeParse({ summary: 's', actions: Array(21).fill(one) }).success).toBe(false);
  expect(ProposeChangesSchema.safeParse({ summary: 's', actions: [] }).success).toBe(false);
  expect(ProposeChangesSchema.safeParse({ summary: '', actions: [one] }).success).toBe(false);
});

test('khóa lạ bị bỏ, không làm hỏng đề xuất', () => {
  const out = ProposeChangesSchema.parse(wrap({ type: 'resolve_blocker', id: T, confidence: 0.9 }));
  expect(out.actions[0]).toEqual({ type: 'resolve_blocker', id: T });
});

test('tool definition là JSON Schema của schema đề xuất', () => {
  expect(PROPOSE_CHANGES_TOOL.name).toBe('propose_changes');
  expect(PROPOSE_CHANGES_TOOL.parameters).toMatchObject({ type: 'object', required: expect.arrayContaining(['summary', 'actions']) });
});
```

```ts
// src/server/proposals/validate.test.ts
import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { createTestDb } from '@/db/testing';
import { archiveArea, createArea } from '../services/areas';
import { blockerService, milestoneService, taskService, topicService } from '../services/entities';
import { stampActions } from './validate';

const manual = { origin: 'manual' as const };
const GHOST = '00000000-0000-4000-8000-000000000000';
let db: Db;
beforeEach(async () => { db = await createTestDb(); });

test('ghi mốc baseUpdatedAt cho cập nhật, null cho tạo mới', async () => {
  const course = await createArea(db, { kind: 'academic', name: 'Mobile Programming' }, manual);
  const topic = await topicService.create(db, { areaId: course.id, title: 'Navigation' }, manual);
  const out = await stampActions(db, [
    { type: 'upsert_topic', areaId: course.id, id: topic.id, status: 'familiar' },
    { type: 'add_progress_log', areaId: course.id, text: 'đã đọc' },
  ]);
  expect(out).toEqual({ ok: true, stored: [
    { key: 0, action: { type: 'upsert_topic', areaId: course.id, id: topic.id, status: 'familiar' }, baseUpdatedAt: topic.updatedAt.toISOString() },
    { key: 1, action: { type: 'add_progress_log', areaId: course.id, text: 'đã đọc' }, baseUpdatedAt: null },
  ] });
});

test('ID không tồn tại, sai loại, sai area đều làm hỏng cả đề xuất', async () => {
  const course = await createArea(db, { kind: 'academic', name: 'Mobile Programming' }, manual);
  const other = await createArea(db, { kind: 'academic', name: 'Database' }, manual);
  const topic = await topicService.create(db, { areaId: course.id, title: 'Navigation' }, manual);
  const task = await taskService.create(db, { areaId: course.id, title: 'Lab' }, manual);
  const bad = async (action: any) => (await stampActions(db, [{ type: 'add_progress_log', areaId: course.id, text: 'ok' }, action]));
  expect(await bad({ type: 'update_task', id: GHOST, patch: { status: 'done' } })).toMatchObject({ ok: false, errors: [{ index: 1 }] });
  expect(await bad({ type: 'update_task', id: topic.id, patch: { status: 'done' } })).toMatchObject({ ok: false }); // id của topic
  expect(await bad({ type: 'upsert_topic', areaId: other.id, id: topic.id, status: 'familiar' })).toMatchObject({ ok: false }); // sai area
  expect(await bad({ type: 'create_task', areaId: GHOST, title: 'x' })).toMatchObject({ ok: false });
  void task;
});

test('loại area, milestone khác area, area đã lưu trữ, blocker đã gỡ', async () => {
  const course = await createArea(db, { kind: 'academic', name: 'Database' }, manual);
  const proj = await createArea(db, { kind: 'project', name: 'Question House' }, manual);
  const other = await createArea(db, { kind: 'project', name: 'StewieSAT' }, manual);
  const ms = await milestoneService.create(db, { areaId: other.id, title: 'M' }, manual);
  const blocker = await blockerService.create(db, { areaId: proj.id, title: 'Login' }, manual);
  await blockerService.update(db, blocker.id, { status: 'resolved' }, manual);
  const old = await createArea(db, { kind: 'project', name: 'Cũ' }, manual);
  await archiveArea(db, old.id, manual);
  const fails = async (action: any) => (await stampActions(db, [action])).ok === false;
  expect(await fails({ type: 'upsert_topic', areaId: proj.id, title: 'x' })).toBe(true);
  expect(await fails({ type: 'create_blocker', areaId: course.id, title: 'x' })).toBe(true);
  expect(await fails({ type: 'create_task', areaId: proj.id, title: 'x', milestoneId: ms.id })).toBe(true);
  expect(await fails({ type: 'create_task', areaId: old.id, title: 'x' })).toBe(true);
  expect(await fails({ type: 'resolve_blocker', id: blocker.id })).toBe(true);
  expect(await fails({ type: 'create_note', areaId: null, text: 'ok' })).toBe(false);
});
```

```ts
// src/server/proposals/describe.test.ts
import { expect, test } from 'vitest';
import { createTestDb } from '@/db/testing';
import { createArea } from '../services/areas';
import { topicService } from '../services/entities';
import { describeStored } from './describe';
import { stampActions } from './validate';

const manual = { origin: 'manual' as const };

test('xem trước: nhãn, diff trước → sau, phát hiện xung đột và bản ghi đã mất', async () => {
  const db = await createTestDb();
  const course = await createArea(db, { kind: 'academic', name: 'Mobile Programming' }, manual);
  const topic = await topicService.create(db, { areaId: course.id, title: 'Navigation' }, manual);
  const stamped = await stampActions(db, [
    { type: 'upsert_topic', areaId: course.id, id: topic.id, status: 'familiar', title: 'Navigation' },
    { type: 'upsert_topic', areaId: course.id, title: 'VLSM', status: 'practiced' },
    { type: 'add_progress_log', areaId: course.id, text: '22/11: đã đọc xong phần Navigation' },
  ]);
  if (!stamped.ok) throw new Error('stamp');
  let previews = await describeStored(db, stamped.stored);
  expect(previews[0]).toEqual({ key: 0, type: 'upsert_topic', areaId: course.id, areaName: 'Mobile Programming', label: 'Sửa topic “Navigation”',
    changes: [{ field: 'Trạng thái', before: 'Not started', after: 'Familiar' }], isCreate: false, conflict: 'none' });
  expect(previews[1]).toMatchObject({ label: 'Tạo topic “VLSM”', isCreate: true, changes: expect.arrayContaining([{ field: 'Trạng thái', before: null, after: 'Practiced' }]) });
  expect(previews[2]).toMatchObject({ label: 'Thêm log tiến độ', changes: [{ field: 'Nội dung', before: null, after: '22/11: đã đọc xong phần Navigation' }] });

  await topicService.update(db, topic.id, { evidence: 'quiz 8/10' }, manual);
  previews = await describeStored(db, stamped.stored);
  expect(previews[0].conflict).toBe('changed');

  await topicService.remove(db, topic.id, manual);
  previews = await describeStored(db, stamped.stored);
  expect(previews[0]).toMatchObject({ conflict: 'missing' });
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `pnpm test src/server/proposals`
Expected: FAIL — không tìm thấy module.

- [ ] **Step 3: Cài đặt `schema.ts`, `validate.ts`, `describe.ts`**

- [ ] **Step 4: Chạy lại**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(proposals): add action schema, database stamping and previews"
```

---

### Task 2: Tách đề xuất khỏi output của model và nối vào `runChatTurn`

**Files:**
- Create: `src/server/proposals/extract.ts`, `src/server/proposals/store.ts`
- Modify: `src/server/ai/prompt.ts`, `src/server/chat/run-turn.ts`, `src/server/ai/mock.ts`
- Test: `src/server/proposals/extract.test.ts`, `src/server/chat/run-turn.proposals.test.ts`, cập nhật `src/server/ai/prompt.test.ts`, `src/server/ai/mock.test.ts`

**Interfaces:**
- Consumes: `ProposeChangesSchema`, `PROPOSE_CHANGES_TOOL`, `stampActions`, `StoredProposal`, `TurnEvent`
- Produces:
  - `PROPOSAL_OPEN = '<proposed_actions>'`, `PROPOSAL_CLOSE = '</proposed_actions>'`
  - `class ProposalBlockFilter { push(delta: string): string; end(): { visibleTail: string; rawJson: string | null } }` — `push` trả phần văn bản an toàn để hiển thị ngay; giữ lại phần đuôi có thể là tiền tố của `PROPOSAL_OPEN`; sau khi gặp thẻ mở thì mọi thứ phía sau bị giữ. `end` trả phần đuôi còn giữ (khi chưa gặp thẻ mở) và nội dung giữa hai thẻ (thiếu thẻ đóng thì lấy tới hết).
  - `parseProposal(raw: string): { ok: true; value: ProposeChanges } | { ok: false }` — bỏ khoảng trắng và code fence (```` ``` ```` hoặc ```` ```json ````) bao quanh rồi `JSON.parse` và `safeParse`
  - `createPendingAction(db: DbOrTx, input: { source: 'chat' | 'capture'; conversationId?: string; messageId?: string; noteId?: string; proposal: ProposeChanges }): Promise<{ id: string } | null>` — gọi `stampActions`; lỗi thì trả `null` và không ghi gì
  - `supersedeForMessage(db: DbOrTx, messageId: string): Promise<void>` · `supersedeForNote(db: DbOrTx, noteId: string): Promise<void>` — chuyển các dòng `pending` tương ứng sang `superseded`, đặt `resolved_at`
  - `IGNORED_PROPOSAL_NOTICE = '\n\n_(AI có đề xuất cập nhật nhưng đề xuất không hợp lệ nên đã bị bỏ qua. Chưa có gì được thay đổi; bạn có thể cập nhật trong Context.)_'`
  - `metadata` của tin nhắn assistant thêm `pendingActionId?: string`

**Phần thêm vào system prompt** (chèn ngay trước khối `<workspace_state>`):

Chế độ `tools`:
```text
ĐỀ XUẤT CẬP NHẬT
- Khi người dùng báo tiến độ, báo một thay đổi, hoặc yêu cầu sửa dữ liệu, hãy gọi tool propose_changes. Không gọi khi họ chỉ hỏi.
- Chỉ đề xuất điều người dùng đã nói rõ. Không suy diễn thêm trạng thái, deadline hay điểm số.
- Dùng đúng id và areaId có trong <workspace_state>. Nếu thứ người dùng nhắc tới chưa tồn tại (ví dụ một topic chưa có), đề xuất tạo mới và nói rõ là tạo mới; không gán vào bản ghi gần giống.
- Ngày viết dạng YYYY-MM-DD.
- Bạn không thể xóa dữ liệu. Bạn không tự ghi được gì: mọi đề xuất chờ người dùng duyệt, nên đừng nói là đã cập nhật.
- Luôn kèm một câu trả lời ngắn bằng văn bản mô tả điều bạn đề xuất.
```

Chế độ `json`: cùng nội dung, thay dòng đầu bằng:
```text
- Khi người dùng báo tiến độ, báo một thay đổi, hoặc yêu cầu sửa dữ liệu, hãy đặt Ở CUỐI câu trả lời một khối <proposed_actions>{...}</proposed_actions> chứa đúng một object JSON theo schema dưới đây, không kèm code fence. Không thêm khối này khi họ chỉ hỏi.
```
và thêm sau cùng dòng `Schema: ` nối với `JSON.stringify(PROPOSE_CHANGES_TOOL.parameters)`.

Chế độ `off`:
```text
ĐỀ XUẤT CẬP NHẬT
- Bạn không thể đề xuất hay ghi thay đổi dữ liệu. Khi người dùng muốn cập nhật, hướng dẫn họ sửa trong màn Context.
```

**Thay đổi trong `runChatTurn`:**
- `tools`: truyền `tools: [PROPOSE_CHANGES_TOOL]`; lấy `argsJson` của tool call `propose_changes` đầu tiên làm đề xuất thô.
- `json`: cho mọi `delta` đi qua `ProposalBlockFilter`; chỉ phát ra phần `push` trả về (bỏ qua chuỗi rỗng); khi stream xong phát thêm `visibleTail` nếu khác rỗng; `rawJson` là đề xuất thô.
- `off`: như Phase 2.
- Sau khi stream xong, nếu có đề xuất thô: lưu tin nhắn assistant trước, rồi `parseProposal` → `createPendingAction` (source `chat`, kèm `conversationId`, `messageId`).
  - Thành công: ghi `pendingActionId` vào `metadata`, phát `{ type: 'proposal', pendingActionId }` **trước** `done`.
  - Thất bại ở bất kỳ bước nào: phát thêm một sự kiện `text` với `IGNORED_PROPOSAL_NOTICE` và nối nó vào nội dung đã lưu; không có sự kiện `proposal`.
- Nếu model chỉ gọi tool mà không có văn bản: nội dung tin nhắn là `summary` của đề xuất (phát nó thành một sự kiện `text`).
- `regenerate`: trước khi xóa tin nhắn assistant cũ, gọi `supersedeForMessage` cho nó.

**Mở rộng mock** (xét `u` và state đã parse; `đề xuất` được phát theo chế độ: có `propose_changes` trong `req.tools` → một sự kiện `tool_call` sau phần text; không có tools nhưng system prompt chứa `<proposed_actions>` → phát thêm text gồm thẻ mở + JSON + thẻ đóng, **cắt đôi ở giữa thẻ mở** thành hai sự kiện; còn lại → không phát đề xuất):
- `u` chứa `MOCK_BAD_PROPOSAL` → text `Đề xuất lỗi.` + đề xuất `{ summary: 'Hỏng', actions: [{ type: 'update_task', id: '00000000-0000-4000-8000-000000000000', patch: { status: 'done' } }] }`.
- `u` bắt đầu bằng `Phân loại ghi chú` (luồng capture, Task 5): tìm area đầu tiên trong `state.areas` có tên (qua `normalizeVi`) xuất hiện trong `u`; có thì text `Đề xuất từ ghi chú.` + `{ summary: 'Từ ghi chú', actions: [{ type: 'create_task', areaId, title: 'Việc từ ghi chú' }] }`; không có thì chỉ text `Không có đề xuất.`.
- `u` khớp `/hoàn thành|đã xong/i` và `state.details` có một detail còn ít nhất một topic → text `Ghi nhận. Đề xuất cập nhật.` + `{ summary: 'Cập nhật tiến độ', actions: [{ type: 'upsert_topic', areaId, id: <topic đầu tiên>, status: 'confident' }, { type: 'add_progress_log', areaId, text: u }] }`.
- Các nhánh cũ giữ nguyên và xét sau các nhánh trên.

- [ ] **Step 1: Viết test thất bại**

```ts
// src/server/proposals/extract.test.ts
import { expect, test } from 'vitest';
import { ProposalBlockFilter, parseProposal } from './extract';

const T = '22222222-2222-4222-8222-222222222222';
const json = JSON.stringify({ summary: 's', actions: [{ type: 'resolve_blocker', id: T }] });

function run(chunks: string[]) {
  const f = new ProposalBlockFilter();
  let visible = '';
  for (const c of chunks) visible += f.push(c);
  const end = f.end();
  return { visible: visible + end.visibleTail, rawJson: end.rawJson };
}

test('không có khối: mọi thứ hiển thị nguyên vẹn', () => {
  expect(run(['Xin ', 'chào < 3 > 2'])).toEqual({ visible: 'Xin chào < 3 > 2', rawJson: null });
});

test('khối trọn trong một chunk', () => {
  expect(run([`Ghi nhận.\n<proposed_actions>${json}</proposed_actions>`])).toEqual({ visible: 'Ghi nhận.\n', rawJson: json });
});

test.each([1, 5, 10, 17])('thẻ mở bị cắt ở vị trí %i không lọt ký tự nào', (cut) => {
  const full = `Ghi nhận. <proposed_actions>${json}</proposed_actions>`;
  const at = 'Ghi nhận. '.length + cut;
  const out = run([full.slice(0, at), full.slice(at)]);
  expect(out).toEqual({ visible: 'Ghi nhận. ', rawJson: json });
});

test('từng ký tự một', () => {
  const full = `A<b>B <proposed_actions>${json}</proposed_actions>`;
  expect(run([...full])).toEqual({ visible: 'A<b>B ', rawJson: json });
});

test('thiếu thẻ đóng: lấy tới hết; văn bản sau thẻ đóng bị bỏ', () => {
  expect(run([`x<proposed_actions>${json}`]).rawJson).toBe(json);
  expect(run([`x<proposed_actions>${json}</proposed_actions> thừa`])).toEqual({ visible: 'x', rawJson: json });
});

test('đuôi giống tiền tố thẻ nhưng không phải thẻ thì được trả lại khi kết thúc', () => {
  expect(run(['giá trị <prop'])).toEqual({ visible: 'giá trị <prop', rawJson: null });
});

test('parseProposal: thuần, có khoảng trắng, có code fence, hỏng, sai schema', () => {
  expect(parseProposal(json)).toMatchObject({ ok: true });
  expect(parseProposal(`\n  ${json}\n`)).toMatchObject({ ok: true });
  expect(parseProposal('```json\n' + json + '\n```')).toMatchObject({ ok: true });
  expect(parseProposal('{"summary":')).toEqual({ ok: false });
  expect(parseProposal('{"summary":"s","actions":[{"type":"delete_task"}]}')).toEqual({ ok: false });
});
```

```ts
// src/server/chat/run-turn.proposals.test.ts
import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { messages, pendingActions, topics } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { createMockProvider } from '../ai/mock';
import { IGNORED_PROPOSAL_NOTICE } from '../proposals/store';
import { createArea } from '../services/areas';
import { topicService } from '../services/entities';
import { runChatTurn, type TurnEvent } from './run-turn';

const NOW = new Date('2026-11-22T03:00:00Z');
const manual = { origin: 'manual' as const };
let db: Db; let areaId: string; let topicId: string;
beforeEach(async () => {
  db = await createTestDb();
  const a = await createArea(db, { kind: 'academic', name: 'Mobile Programming', aliases: ['Mobile'], status: 'active' }, manual);
  areaId = a.id;
  topicId = (await topicService.create(db, { areaId, title: 'Chương 1' }, manual)).id;
});
async function turn(actionMode: 'tools' | 'json' | 'off', input: any) {
  const events: TurnEvent[] = [];
  for await (const e of runChatTurn({ db, provider: createMockProvider(), actionMode, dailyCap: 200, now: NOW }, { scope: { mode: 'auto' }, ...input })) events.push(e);
  return events;
}
const text = (events: TurnEvent[]) => events.filter((e) => e.type === 'text').map((e: any) => e.delta).join('');

test.each(['tools', 'json'] as const)('chế độ %s: tạo pending, KHÔNG ghi dữ liệu (criterion 7)', async (mode) => {
  const events = await turn(mode, { message: 'Tôi đã hoàn thành chương 1 Mobile' });
  expect(events.map((e) => e.type).slice(-2)).toEqual(['proposal', 'done']);
  expect(text(events)).toBe('Ghi nhận. Đề xuất cập nhật.');
  expect(text(events)).not.toContain('proposed_actions');
  const [pending] = await db.select().from(pendingActions);
  expect(pending).toMatchObject({ status: 'pending', source: 'chat' });
  expect((pending.actionsJson as any).actions.map((a: any) => a.action.type)).toEqual(['upsert_topic', 'add_progress_log']);
  expect((pending.actionsJson as any).actions[0].baseUpdatedAt).toEqual(expect.any(String));
  expect((await db.select().from(topics))[0].status).toBe('not_started');
  const assistant = (await db.select().from(messages)).find((m) => m.role === 'assistant')!;
  expect(assistant.content).toBe('Ghi nhận. Đề xuất cập nhật.');
  expect(assistant.metadata).toMatchObject({ pendingActionId: pending.id });
  expect(pending.messageId).toBe(assistant.id);
});

test('chế độ off: không truyền tool, không có đề xuất', async () => {
  const events = await turn('off', { message: 'Tôi đã hoàn thành chương 1 Mobile' });
  expect(events.some((e) => e.type === 'proposal')).toBe(false);
  expect(await db.select().from(pendingActions)).toEqual([]);
});

test.each(['tools', 'json'] as const)('chế độ %s: đề xuất không hợp lệ bị bỏ, có dòng báo (criterion 10)', async (mode) => {
  const events = await turn(mode, { message: 'MOCK_BAD_PROPOSAL' });
  expect(events.some((e) => e.type === 'proposal')).toBe(false);
  expect(text(events)).toBe('Đề xuất lỗi.' + IGNORED_PROPOSAL_NOTICE);
  expect(await db.select().from(pendingActions)).toEqual([]);
  expect((await db.select().from(messages)).find((m) => m.role === 'assistant')!.content).toBe('Đề xuất lỗi.' + IGNORED_PROPOSAL_NOTICE);
});

test('regenerate chuyển đề xuất cũ sang superseded', async () => {
  const first = await turn('tools', { message: 'Tôi đã hoàn thành chương 1 Mobile' });
  const conversationId = (first[0] as any).conversationId;
  await turn('tools', { conversationId, regenerate: true });
  const all = await db.select().from(pendingActions).orderBy(pendingActions.createdAt);
  expect(all.map((p) => p.status)).toEqual(['superseded', 'pending']);
  void topicId;
});
```

Cập nhật `prompt.test.ts`: `tools` chứa `gọi tool propose_changes` và không chứa `<proposed_actions>`; `json` chứa `<proposed_actions>` và `Schema: {`; `off` chứa `Bạn không thể đề xuất`; cả ba vẫn kết thúc bằng khối state. Cập nhật `mock.test.ts` cho ba nhánh mới ở cả hai cách phát.

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `pnpm test src/server/proposals/extract.test.ts src/server/chat src/server/ai`
Expected: FAIL.

- [ ] **Step 3: Cài đặt `extract.ts`, `store.ts`, phần thêm của prompt, mock và `runChatTurn`**

- [ ] **Step 4: Chạy lại**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS, kể cả các test Phase 2 của `run-turn.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(proposals): extract proposals from model output and store as pending"
```

---

### Task 3: Duyệt, từ chối và xử lý xung đột

**Files:**
- Create: `src/server/proposals/resolve.ts`
- Test: `src/server/proposals/resolve.test.ts`

**Interfaces:**
- Consumes: `StoredProposal`, `StoredAction`, `ProposedAction`, `stampActions`, `describeStored`, `ENTITY_SERVICES`, `updateArea`, `addProgressLog`, `noteService`
- Produces:
  - ```ts
    type ApproveResult =
      | { status: 'applied' | 'partially_applied'; appliedKeys: number[]; batchId: string }
      | { status: 'conflict'; conflicts: { key: number; kind: 'changed' | 'missing' }[] }
      | { status: 'invalid'; errors: { key: number; message: string }[] }
      | { status: 'already_resolved' }
      | { status: 'failed'; error: string };
    ```
  - `approvePendingAction(db: Db, id: string, input: { selectedKeys: number[]; edits?: Record<number, unknown> }): Promise<ApproveResult>`
  - `rejectPendingAction(db: Db, id: string): Promise<{ status: 'rejected' | 'already_resolved' }>`
  - `rebasePendingAction(db: Db, id: string): Promise<{ status: 'rebased' | 'already_resolved' }>` — với mỗi hành động có bản ghi đích còn tồn tại, đặt lại `baseUpdatedAt` theo giá trị hiện tại; hành động có đích đã mất giữ nguyên
  - `applyAction(tx: DbOrTx, action: ProposedAction, meta: WriteMeta): Promise<void>` — ánh xạ mười loại hành động sang service Phase 1

**Thuật toán `approvePendingAction`** (toàn bộ trong một `db.transaction`):
1. `UPDATE pending_actions SET status = 'applied', resolved_at = now WHERE id = $id AND status = 'pending' RETURNING *`. Không có dòng → trả `already_resolved`.
2. `selectedKeys` rỗng hoặc chứa key không tồn tại → ném lỗi nội bộ để rollback, trả `invalid`.
3. Với mỗi key có trong `edits`: parse bằng schema `ProposedAction`; `type`, `id` và `areaId` phải giữ nguyên so với hành động gốc; sai → rollback, trả `invalid` kèm thông báo. Hành động đã sửa thay cho bản gốc nhưng **giữ `baseUpdatedAt` gốc**.
4. Khóa các bản ghi đích của hành động được chọn bằng `SELECT … FOR UPDATE` (trong cùng transaction), **rồi** kiểm tra xung đột bằng `describeStored`. Có cái nào khác `none` → rollback, trả `conflict`. Lưu ý: ghi vào bản ghi con làm đổi `areas.updated_at`, và `moveTopic` đổi `updatedAt` của các topic cùng area, nên `update_area` hay `upsert_topic` của topic bên cạnh có thể báo xung đột dù trường cần sửa không đổi — đó là xung đột lành tính, an toàn, và vẫn hiện như xung đột (`Vẫn áp dụng` để tiếp tục).
5. Tạo một `batchId` (uuid); gọi `applyAction` lần lượt với `{ origin: 'ai_approved', batchId }`. Service ném `ValidationError`/`NotFoundError` → rollback, trả `invalid`.
6. Nếu số key được chọn ít hơn tổng số hành động, đặt `status = 'partially_applied'`. Ghi `appliedKeys` vào `actions_json`.
7. Nếu dòng pending có `note_id`: cập nhật note đó `inboxStatus: 'processed'` qua `noteService` cùng `batchId`.
8. Lỗi không lường trước: rollback; **sau** transaction, đặt riêng `status = 'failed'` và `error` (chỉ khi dòng vẫn `pending`), trả `failed` với thông báo “Không áp dụng được thay đổi.”.

Mọi nhánh rollback đều để dòng pending ở trạng thái `pending`, trừ nhánh 8.

**Ánh xạ `applyAction`:** `create_task` → `taskService.create`; `update_task` → `taskService.update(id, patch)`; `update_area` → `updateArea(id, patch)`; `upsert_*` có `id` → `update` với các trường còn lại, không `id` → `create`; `create_note` → `noteService.create` (`inboxStatus: 'none'`); `add_progress_log` → `addProgressLog`; `create_blocker` → `blockerService.create`; `resolve_blocker` → `blockerService.update(id, { status: 'resolved' })`.

- [ ] **Step 1: Viết test thất bại**

```ts
import { eq } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { activityLogs, notes, pendingActions, tasks, topics } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { createArea } from '../services/areas';
import { noteService, topicService } from '../services/entities';
import { approvePendingAction, rebasePendingAction, rejectPendingAction } from './resolve';
import { createPendingAction } from './store';

const manual = { origin: 'manual' as const };
let db: Db; let areaId: string; let topicId: string;
beforeEach(async () => {
  db = await createTestDb();
  areaId = (await createArea(db, { kind: 'academic', name: 'Mobile Programming' }, manual)).id;
  topicId = (await topicService.create(db, { areaId, title: 'Navigation' }, manual)).id;
});
const propose = async (extra: any[] = [], opts: any = {}) => (await createPendingAction(db, { source: 'chat', ...opts, proposal: { summary: 'Cập nhật', actions: [
  { type: 'upsert_topic', areaId, id: topicId, status: 'familiar' },
  { type: 'add_progress_log', areaId, text: '22/11: đã đọc xong phần Navigation' },
  ...extra,
] } }))!.id;
const topic = async () => (await db.select().from(topics).where(eq(topics.id, topicId)))[0];
const pending = async (id: string) => (await db.select().from(pendingActions).where(eq(pendingActions.id, id)))[0];
const aiLogs = async () => (await db.select().from(activityLogs)).filter((l) => l.origin === 'ai_approved');

test('duyệt toàn bộ: ghi đúng, log ai_approved chung batch (criterion 8)', async () => {
  const id = await propose();
  const out = await approvePendingAction(db, id, { selectedKeys: [0, 1] });
  expect(out).toMatchObject({ status: 'applied', appliedKeys: [0, 1] });
  expect((await topic()).status).toBe('familiar');
  const logs = await aiLogs();
  expect(logs).toHaveLength(2);
  expect(new Set(logs.map((l) => l.batchId))).toEqual(new Set([(out as any).batchId]));
  expect(await pending(id)).toMatchObject({ status: 'applied', resolvedAt: expect.any(Date) });
});

test('duyệt hai lần: lần hai không ghi gì', async () => {
  const id = await propose();
  await approvePendingAction(db, id, { selectedKeys: [0, 1] });
  expect(await approvePendingAction(db, id, { selectedKeys: [0, 1] })).toEqual({ status: 'already_resolved' });
  expect(await aiLogs()).toHaveLength(2);
});

test('hai lần duyệt đồng thời: đúng một lần được áp dụng', async () => {
  const id = await propose();
  const results = await Promise.all([approvePendingAction(db, id, { selectedKeys: [0, 1] }), approvePendingAction(db, id, { selectedKeys: [0, 1] })]);
  expect(results.map((r) => r.status).sort()).toEqual(['already_resolved', 'applied']);
  expect(await aiLogs()).toHaveLength(2);
});

test('duyệt một phần', async () => {
  const id = await propose();
  const out = await approvePendingAction(db, id, { selectedKeys: [1] });
  expect(out).toMatchObject({ status: 'partially_applied', appliedKeys: [1] });
  expect((await topic()).status).toBe('not_started');
  expect(await aiLogs()).toHaveLength(1);
  expect(((await pending(id)).actionsJson as any).appliedKeys).toEqual([1]);
});

test('bản ghi đổi sau khi đề xuất: xung đột, không ghi gì, vẫn pending (criterion 14)', async () => {
  const id = await propose();
  await topicService.update(db, topicId, { status: 'practiced' }, manual);
  expect(await approvePendingAction(db, id, { selectedKeys: [0, 1] })).toEqual({ status: 'conflict', conflicts: [{ key: 0, kind: 'changed' }] });
  expect((await topic()).status).toBe('practiced');
  expect(await aiLogs()).toHaveLength(0);
  expect((await pending(id)).status).toBe('pending');
});

test('bỏ chọn hành động xung đột thì phần còn lại áp dụng được', async () => {
  const id = await propose();
  await topicService.update(db, topicId, { status: 'practiced' }, manual);
  expect(await approvePendingAction(db, id, { selectedKeys: [1] })).toMatchObject({ status: 'partially_applied' });
});

test('rebase sau khi đã xem giá trị mới thì duyệt được', async () => {
  const id = await propose();
  await topicService.update(db, topicId, { evidence: 'quiz 8/10' }, manual);
  expect(await rebasePendingAction(db, id)).toEqual({ status: 'rebased' });
  expect(await approvePendingAction(db, id, { selectedKeys: [0] })).toMatchObject({ status: 'partially_applied' });
  expect(await topic()).toMatchObject({ status: 'familiar', evidence: 'quiz 8/10' });
});

test('bản ghi đích bị xóa: xung đột missing, rebase không cứu được', async () => {
  const id = await propose();
  await topicService.remove(db, topicId, manual);
  expect(await approvePendingAction(db, id, { selectedKeys: [0] })).toEqual({ status: 'conflict', conflicts: [{ key: 0, kind: 'missing' }] });
  await rebasePendingAction(db, id);
  expect(await approvePendingAction(db, id, { selectedKeys: [0] })).toMatchObject({ status: 'conflict' });
});

test('sửa trước khi duyệt: được validate lại, không cho đổi đích', async () => {
  const id = await propose([{ type: 'create_task', areaId, title: 'Ôn Navigation' }]);
  expect(await approvePendingAction(db, id, { selectedKeys: [2], edits: { 2: { type: 'create_task', areaId, title: '   ' } } })).toMatchObject({ status: 'invalid', errors: [{ key: 2 }] });
  expect(await approvePendingAction(db, id, { selectedKeys: [0], edits: { 0: { type: 'upsert_topic', areaId, id: '00000000-0000-4000-8000-000000000000', status: 'confident' } } })).toMatchObject({ status: 'invalid' });
  expect((await pending(id)).status).toBe('pending');
  const ok = await approvePendingAction(db, id, { selectedKeys: [0, 2], edits: { 0: { type: 'upsert_topic', areaId, id: topicId, status: 'confident' }, 2: { type: 'create_task', areaId, title: 'Ôn Navigation tối nay', dueDate: '2026-11-22' } } });
  expect(ok).toMatchObject({ status: 'partially_applied', appliedKeys: [0, 2] });
  expect((await topic()).status).toBe('confident');
  expect((await db.select().from(tasks))[0]).toMatchObject({ title: 'Ôn Navigation tối nay', dueDate: '2026-11-22' });
});

test('một hành động lỗi làm rollback tất cả', async () => {
  const id = await propose([{ type: 'create_task', areaId, title: 'x' }]);
  const out = await approvePendingAction(db, id, { selectedKeys: [0, 2, 1], edits: { 2: { type: 'create_task', areaId, title: 'x', estimateMinutes: -5 } } });
  expect(out.status).toBe('invalid');
  expect((await topic()).status).toBe('not_started');
  expect(await aiLogs()).toHaveLength(0);
});

test('selectedKeys rỗng hoặc lạ là invalid', async () => {
  const id = await propose();
  expect((await approvePendingAction(db, id, { selectedKeys: [] })).status).toBe('invalid');
  expect((await approvePendingAction(db, id, { selectedKeys: [9] })).status).toBe('invalid');
  expect((await pending(id)).status).toBe('pending');
});

test('từ chối: không đổi gì, sau đó không duyệt được', async () => {
  const id = await propose();
  expect(await rejectPendingAction(db, id)).toEqual({ status: 'rejected' });
  expect(await rejectPendingAction(db, id)).toEqual({ status: 'already_resolved' });
  expect(await approvePendingAction(db, id, { selectedKeys: [0] })).toEqual({ status: 'already_resolved' });
  expect((await topic()).status).toBe('not_started');
});

test('đề xuất từ capture: duyệt xong note chuyển processed', async () => {
  const note = await noteService.create(db, { text: 'Mobile: xong Navigation', inboxStatus: 'inbox' }, manual);
  const id = await propose([], { source: 'capture', noteId: note.id });
  await approvePendingAction(db, id, { selectedKeys: [0, 1] });
  expect((await db.select().from(notes).where(eq(notes.id, note.id)))[0].inboxStatus).toBe('processed');
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `pnpm test src/server/proposals/resolve.test.ts`
Expected: FAIL — không tìm thấy module.

- [ ] **Step 3: Cài đặt `resolve.ts`**

Dùng một lớp lỗi nội bộ mang sẵn `ApproveResult` để ném ra khỏi callback transaction (gây rollback) rồi bắt lại bên ngoài và trả kết quả đó.

- [ ] **Step 4: Chạy lại**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(proposals): add idempotent approve, reject and conflict handling"
```

---

### Task 4: Thẻ đề xuất trong Chat

**Files:**
- Create: `src/app/(app)/_actions/proposals.ts`, `src/components/chat/proposal-card.tsx`, `src/components/chat/proposal-action-editor.tsx`, `src/server/proposals/load.ts`
- Modify: `src/components/chat/{chat-view,message-bubble}.tsx`, `src/app/(app)/chat/page.tsx`
- Test: `src/server/proposals/load.test.ts`, `e2e/proposal.spec.ts`

**Interfaces:**
- Consumes: `approvePendingAction`, `rejectPendingAction`, `rebasePendingAction`, `describeStored`, `ApproveResult`, `ActionPreview`, `runAction`
- Produces:
  - `type ProposalView = { id: string; status: PendingStatus; summary: string; previews: ActionPreview[]; actions: StoredAction[]; appliedKeys: number[] }`
  - `loadProposal(db: DbOrTx, id: string): Promise<ProposalView | null>` — với đề xuất đã kết thúc, `conflict` của mọi preview đặt `none`
  - `getProposalAction(id: string): Promise<ActionResult<ProposalView>>`
  - `approveProposalAction(id: string, input: { selectedKeys: number[]; edits?: Record<number, unknown> }): Promise<ActionResult<ApproveResult>>` — revalidate `/context` và `/chat`
  - `rejectProposalAction(id: string)`, `rebaseProposalAction(id: string)` — trả `ActionResult<ProposalView>`
  - `ProposalCard({ proposalId }: { proposalId: string })` — component client, tự tải bằng `getProposalAction`; dùng lại ở Task 5

**Yêu cầu giao diện (spec 3.2):**
- Thẻ có tiêu đề `Đề xuất cập nhật` và `summary`, `data-testid="proposal-card"`. Mỗi hành động một dòng: ô chọn (mặc định chọn) · `label` · tên area · các dòng `trường: trước → sau`.
- Ba nút đúng nhãn spec: `Approve`, `Edit`, `Reject`. `Approve` vô hiệu khi không chọn dòng nào và trong lúc đang gửi.
- `Edit` chuyển thẻ sang chế độ sửa: mỗi hành động hiện các ô nhập cho trường sửa được của loại đó (tiêu đề, trạng thái, ngày, nội dung…); `Xong` quay lại xem trước với giá trị mới; khi duyệt, các hành động đã sửa gửi trong `edits`.
- Kết quả sau khi duyệt:
  - `applied` / `partially_applied`: thẻ đổi sang trạng thái chỉ đọc, ghi `Đã áp dụng n/N thay đổi`, dòng được áp dụng có dấu tích, dòng không chọn ghi `Bỏ qua`.
  - `conflict`: hiện `role="alert"` với “Dữ liệu đã thay đổi sau khi AI đề xuất. Chưa có gì được ghi.”; dòng `changed` gắn nhãn `Đã thay đổi` và hiện giá trị hiện tại; dòng `missing` gắn nhãn `Không còn tồn tại` và bị bỏ chọn, khóa ô chọn. Có nút `Vẫn áp dụng` (gọi `rebaseProposalAction` rồi tải lại bản xem trước; người dùng bấm `Approve` lần nữa).
  - `invalid`: hiện thông báo lỗi cạnh dòng tương ứng, thẻ vẫn ở trạng thái chờ.
  - `already_resolved`: tải lại thẻ theo trạng thái hiện tại.
  - `failed`: “Không áp dụng được thay đổi.”.
- `Reject`: thẻ ghi `Đã từ chối`. `superseded`: thẻ ghi `Đã thay bằng đề xuất mới`, không có nút.
- Thẻ xuất hiện dưới tin nhắn assistant khi nhận sự kiện `proposal`, và khi tải lại trang nhờ `metadata.pendingActionId`.
- Trên iPhone ba nút xếp một hàng, mỗi nút cao tối thiểu 44px, thẻ không gây cuộn ngang.

- [ ] **Step 1: Viết test thất bại**

`load.test.ts`: tạo một đề xuất hai hành động, kiểm tra `loadProposal` trả `status: 'pending'`, hai preview đúng `label`; sau `approvePendingAction` với `selectedKeys: [1]` thì `status: 'partially_applied'`, `appliedKeys: [1]`, mọi `conflict` là `none`; id không tồn tại trả `null`.

```ts
// e2e/proposal.spec.ts
import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

test.beforeEach(async ({ request, page }) => {
  await resetDb(request, { seed: true });
  await page.goto('/context');
  await page.getByRole('listitem').filter({ hasText: 'Mobile Programming' }).click();
  const drawer = page.getByRole('dialog', { name: 'Mobile Programming' });
  await drawer.getByRole('tab', { name: 'Topics' }).click();
  await drawer.getByPlaceholder('Thêm topic…').fill('Chương 1');
  await page.keyboard.press('Enter');
  await expect(drawer.getByRole('listitem').filter({ hasText: 'Chương 1' })).toBeVisible();
});

async function ask(page) {
  await page.goto('/chat');
  await page.getByPlaceholder('Nhắn gì đó…').fill('Tôi đã hoàn thành chương 1 Mobile Programming');
  await page.getByRole('button', { name: 'Gửi' }).click();
  const card = page.getByTestId('proposal-card');
  await expect(card).toContainText('Sửa topic “Chương 1”');
  return card;
}
async function topicStatus(page) {
  await page.goto('/context');
  await page.getByRole('listitem').filter({ hasText: 'Mobile Programming' }).click();
  const drawer = page.getByRole('dialog', { name: 'Mobile Programming' });
  await drawer.getByRole('tab', { name: 'Topics' }).click();
  return drawer.getByRole('listitem').filter({ hasText: 'Chương 1' }).getByLabel('Trạng thái');
}

test('đề xuất hiện ra nhưng chưa ghi gì (criterion 7)', async ({ page }) => {
  const card = await ask(page);
  await expect(card).toContainText('Trạng thái: Not started → Confident');
  await expect(card).toContainText('Thêm log tiến độ');
  await expect(card.getByRole('button')).toHaveText(['Approve', 'Edit', 'Reject']);
  await expect(await topicStatus(page)).toHaveValue('not_started');
});

test('duyệt: dữ liệu đổi, log ghi nguồn AI, thẻ còn sau khi tải lại (criterion 8, 12)', async ({ page }) => {
  const card = await ask(page);
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(card).toContainText('Đã áp dụng 2/2 thay đổi');
  await page.reload();
  await expect(page.getByTestId('proposal-card')).toContainText('Đã áp dụng 2/2 thay đổi');
  await expect(page.getByTestId('proposal-card').getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(await topicStatus(page)).toHaveValue('confident');
  await page.getByRole('dialog').getByRole('tab', { name: 'Activity' }).click();
  await expect(page.getByRole('dialog').getByText('AI (đã duyệt)')).toHaveCount(2);
});

test('từ chối: không đổi gì (criterion 8)', async ({ page }) => {
  const card = await ask(page);
  await card.getByRole('button', { name: 'Reject' }).click();
  await expect(card).toContainText('Đã từ chối');
  await expect(await topicStatus(page)).toHaveValue('not_started');
});

test('duyệt một phần', async ({ page }) => {
  const card = await ask(page);
  await card.getByRole('checkbox', { name: /Thêm log tiến độ/ }).uncheck();
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(card).toContainText('Đã áp dụng 1/2 thay đổi');
  await expect(await topicStatus(page)).toHaveValue('confident');
});

test('sửa bằng UI sau khi AI đề xuất rồi duyệt: báo xung đột, không ghi đè (criterion 14)', async ({ page, context }) => {
  const card = await ask(page);
  const other = await context.newPage();
  await (await topicStatus(other)).selectOption('familiar');
  await other.close();
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(card.getByRole('alert')).toContainText('Dữ liệu đã thay đổi sau khi AI đề xuất. Chưa có gì được ghi.');
  await expect(card).toContainText('Đã thay đổi');
  await expect(await topicStatus(page)).toHaveValue('familiar');
});

test('thẻ dùng được trên màn hẹp (criterion 16)', async ({ page }) => {
  const card = await ask(page);
  for (const name of ['Approve', 'Edit', 'Reject']) {
    const box = await card.getByRole('button', { name }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('đề xuất không hợp lệ: chỉ có văn bản và dòng báo (criterion 10)', async ({ page }) => {
  await page.goto('/chat');
  await page.getByPlaceholder('Nhắn gì đó…').fill('MOCK_BAD_PROPOSAL');
  await page.getByRole('button', { name: 'Gửi' }).click();
  await expect(page.locator('[data-role="assistant"]').last()).toContainText('đề xuất không hợp lệ nên đã bị bỏ qua');
  await expect(page.getByTestId('proposal-card')).toHaveCount(0);
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `pnpm test src/server/proposals/load.test.ts && pnpm test:e2e e2e/proposal.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Cài đặt `load.ts`, actions, `ProposalCard` và trình sửa hành động; nối vào `MessageBubble` qua prop `footer`**

- [ ] **Step 4: Chạy lại toàn bộ**

Run: `pnpm test && pnpm test:e2e && pnpm typecheck && pnpm lint`
Expected: PASS trên cả `desktop` và `iphone`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(chat): add proposal card with approve, edit, reject and conflict flow"
```

---

### Task 5: Extract từ quick capture và luồng “Cập nhật nhanh”

**Files:**
- Create: `src/server/proposals/extract-note.ts`
- Modify: `src/server/ai/context-builder.ts`, `src/server/queries/area-details.ts` (`listInboxNotes`), `src/app/(app)/_actions/proposals.ts`, `src/components/context/inbox-list.tsx`
- Test: `src/server/proposals/extract-note.test.ts`, cập nhật `src/server/ai/context-builder.test.ts`, `e2e/capture-extract.spec.ts`

**Interfaces:**
- Consumes: `buildContext`, `buildSystemPrompt`, `collect`, `ProposalBlockFilter`, `parseProposal`, `createPendingAction`, `supersedeForNote`, `countAiRequest`, `PROPOSE_CHANGES_TOOL`, `ProposalCard`
- Produces:
  - `extractNoteProposal(deps: { db: Db; provider: AiProvider; actionMode: 'tools' | 'json' | 'off'; dailyCap: number; now: Date }, noteId: string): Promise<{ status: 'proposed'; pendingActionId: string } | { status: 'none'; reason: string }>`
  - `extractNoteAction(noteId: string): Promise<ActionResult<{ status: 'proposed'; pendingActionId: string } | { status: 'none'; reason: string }>>`
  - `listInboxNotes` trả thêm `pendingActionId: string | null` (id của đề xuất `pending` gắn với note)

**Quy tắc `extractNoteProposal`:**
- Trả `none` với `reason` tương ứng, **không gọi provider**, khi: note không tồn tại hoặc không ở `inbox` (“Ghi chú không còn trong Inbox.”); note `aiExcluded` (“Ghi chú này đang tắt gửi cho AI.”); `actionMode === 'off'` (“Chế độ đề xuất đang tắt.”); chạm trần (“Đã chạm trần số lượt hỏi AI hôm nay.”).
- Dựng context với `scope: { mode: 'auto' }` và `message` là nội dung note. Tin nhắn `user` gửi model: `Phân loại ghi chú sau thành các hành động cập nhật. Chỉ đề xuất điều ghi chú nói rõ; phần nào không rõ thuộc mục nào thì bỏ qua.\n\n<note>\n{text}\n</note>` (ký tự `<` trong `text` thay bằng `<`).
- Lấy đề xuất thô theo chế độ như Task 2. Không có đề xuất, parse lỗi hoặc `createPendingAction` trả `null` → `none` với “AI không tìm thấy cập nhật nào hợp lệ trong ghi chú.”. Provider ném lỗi → `none` với “Không gọi được AI. Ghi chú vẫn nằm trong Inbox.”.
- Thành công: `supersedeForNote(noteId)` trước, rồi tạo pending mới (source `capture`, `noteId`). Note giữ `inbox` cho tới khi duyệt (Task 3 chuyển nó sang `processed`).

**“Cập nhật nhanh” trong `buildContext`:** khi `scope.mode === 'auto'` và `normalizeVi(message) === 'cap nhat nhanh'`, các area trong `staleAreaIds` được mở rộng chi tiết (thêm vào danh sách khớp).

**Giao diện:** nút `Extract suggestions` trong Inbox hoạt động: bấm → hiện trạng thái đang xử lý → nếu `proposed` thì hiện `ProposalCard` ngay dưới note; nếu `none` thì hiện `reason` cạnh note. Note có sẵn đề xuất `pending` hiện thẻ ngay khi mở trang. Sau khi duyệt, note rời khỏi Inbox. Khi server cho biết chế độ là `off`, nút bị vô hiệu kèm chú thích “Chế độ đề xuất đang tắt.”. Note `aiExcluded` vô hiệu nút.

- [ ] **Step 1: Viết test thất bại**

```ts
// src/server/proposals/extract-note.test.ts
import { beforeEach, expect, test, vi } from 'vitest';
import type { Db } from '@/db/client';
import { pendingActions } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { createMockProvider } from '../ai/mock';
import { createArea } from '../services/areas';
import { noteService } from '../services/entities';
import { extractNoteProposal } from './extract-note';

const NOW = new Date('2026-11-22T03:00:00Z');
const manual = { origin: 'manual' as const };
let db: Db;
beforeEach(async () => {
  db = await createTestDb();
  await createArea(db, { kind: 'academic', name: 'Database', status: 'active' }, manual);
});
const deps = (over: any = {}) => ({ db, provider: createMockProvider(), actionMode: 'tools' as const, dailyCap: 200, now: NOW, ...over });
const inbox = (text: string, extra: any = {}) => noteService.create(db, { text, inboxStatus: 'inbox', ...extra }, manual);

test.each(['tools', 'json'] as const)('chế độ %s: tạo đề xuất gắn với note, note vẫn ở inbox', async (actionMode) => {
  const note = await inbox('Database lab đã nộp');
  const out = await extractNoteProposal(deps({ actionMode }), note.id);
  expect(out.status).toBe('proposed');
  const [pending] = await db.select().from(pendingActions);
  expect(pending).toMatchObject({ source: 'capture', noteId: note.id, status: 'pending' });
  expect((pending.actionsJson as any).actions[0].action).toMatchObject({ type: 'create_task', title: 'Việc từ ghi chú' });
});

test('extract lần hai thay đề xuất cũ', async () => {
  const note = await inbox('Database lab đã nộp');
  await extractNoteProposal(deps(), note.id);
  await extractNoteProposal(deps(), note.id);
  expect((await db.select().from(pendingActions).orderBy(pendingActions.createdAt)).map((p) => p.status)).toEqual(['superseded', 'pending']);
});

test('các trường hợp không gọi provider', async () => {
  const stream = vi.fn();
  const provider = { stream } as any;
  const priv = await inbox('Database bí mật', { aiExcluded: true });
  const filed = await noteService.create(db, { text: 'Database', inboxStatus: 'none' }, manual);
  const ok = await inbox('Database lab');
  expect(await extractNoteProposal(deps({ provider }), priv.id)).toEqual({ status: 'none', reason: 'Ghi chú này đang tắt gửi cho AI.' });
  expect(await extractNoteProposal(deps({ provider }), filed.id)).toEqual({ status: 'none', reason: 'Ghi chú không còn trong Inbox.' });
  expect(await extractNoteProposal(deps({ provider, actionMode: 'off' }), ok.id)).toEqual({ status: 'none', reason: 'Chế độ đề xuất đang tắt.' });
  expect(stream).not.toHaveBeenCalled();
});

test('không có gì để đề xuất, và provider lỗi', async () => {
  const none = await inbox('mua sữa');
  expect(await extractNoteProposal(deps(), none.id)).toEqual({ status: 'none', reason: 'AI không tìm thấy cập nhật nào hợp lệ trong ghi chú.' });
  const failing = { stream: async function* () { throw new Error('x'); } } as any;
  const note = await inbox('Database lab');
  expect(await extractNoteProposal(deps({ provider: failing }), note.id)).toEqual({ status: 'none', reason: 'Không gọi được AI. Ghi chú vẫn nằm trong Inbox.' });
  expect(await db.select().from(pendingActions)).toEqual([]);
});
```

Thêm vào `context-builder.test.ts`:

```ts
test('"Cập nhật nhanh" mở rộng chi tiết các mục cũ nhất', async () => {
  const a = await createArea(db, { kind: 'project', name: 'Question House', status: 'active' }, manual);
  const b = await createArea(db, { kind: 'academic', name: 'Database', status: 'completed' }, manual);
  const ctx = await build('Cập nhật nhanh');
  expect(ctx.state.staleAreaIds).toEqual([a.id]);
  expect(ctx.state.details.map((d) => d.areaId)).toEqual([a.id]);
  void b;
});
```

```ts
// e2e/capture-extract.spec.ts
import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

test('quick capture → Extract suggestions → duyệt → note rời Inbox (flow B của spec)', async ({ page, request }) => {
  await resetDb(request, { seed: true });
  await page.goto('/context');
  await page.getByPlaceholder('Ghi nhanh…').fill('Database lab đã nộp');
  await page.getByRole('button', { name: 'Lưu ghi chú' }).click();
  await expect(page.getByText('Inbox (1)')).toBeVisible();
  await page.getByRole('button', { name: 'Extract suggestions' }).click();
  const card = page.getByTestId('proposal-card');
  await expect(card).toContainText('Tạo task “Việc từ ghi chú”');
  await expect(card).toContainText('Database');
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Inbox (1)')).toHaveCount(0);
  await page.getByRole('listitem').filter({ hasText: 'Database' }).click();
  await page.getByRole('dialog').getByRole('tab', { name: 'Tasks' }).click();
  await expect(page.getByRole('dialog').getByRole('listitem').filter({ hasText: 'Việc từ ghi chú' })).toBeVisible();
});

test('ghi chú không khớp mục nào: báo rõ, note ở lại', async ({ page, request }) => {
  await resetDb(request, { seed: true });
  await page.goto('/context');
  await page.getByPlaceholder('Ghi nhanh…').fill('mua sữa');
  await page.getByRole('button', { name: 'Lưu ghi chú' }).click();
  await page.getByRole('button', { name: 'Extract suggestions' }).click();
  await expect(page.getByText('AI không tìm thấy cập nhật nào hợp lệ trong ghi chú.')).toBeVisible();
  await expect(page.getByText('Inbox (1)')).toBeVisible();
});

test('Cập nhật nhanh hỏi về mục cũ nhất', async ({ page, request }) => {
  await resetDb(request, { seed: true });
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Cập nhật nhanh' }).click();
  await expect(page.locator('[data-role="assistant"]').last()).toContainText('detail:');
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `pnpm test src/server/proposals/extract-note.test.ts src/server/ai/context-builder.test.ts && pnpm test:e2e e2e/capture-extract.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Cài đặt `extract-note.ts`, action, nhánh “Cập nhật nhanh” và phần Inbox**

- [ ] **Step 4: Chạy lại toàn bộ**

Run: `pnpm test && pnpm test:e2e && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(capture): add quick capture extraction and quick check-in flow"
```

---

### Task 6: Hoàn thiện, tài liệu và nghiệm thu

**Files:**
- Create: `docs/acceptance-checklist.md`
- Modify: `README.md`, `.env.example`
- Test: `e2e/acceptance-smoke.spec.ts`

**Interfaces:**
- Consumes: toàn bộ ứng dụng
- Produces: tài liệu vận hành và bản ghi nghiệm thu

- [ ] **Step 1: Viết E2E xuyên suốt (thất bại nếu còn thiếu mảnh nào)**

```ts
// e2e/acceptance-smoke.spec.ts — một lượt đi qua user flow A → B → C → D của spec
import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

test('từ onboarding tới cập nhật qua chat', async ({ page, request }) => {
  await resetDb(request, { onboarded: false });
  await page.goto('/chat');
  await page.getByRole('dialog', { name: 'Review & import' }).getByRole('button', { name: 'Nhập mục đã chọn' }).click();

  // C: cập nhật thủ công
  await page.goto('/context');
  await page.getByRole('listitem').filter({ hasText: 'Computer Networks' }).click();
  const drawer = page.getByRole('dialog', { name: 'Computer Networks' });
  await drawer.getByRole('tab', { name: 'Topics' }).click();
  await drawer.getByPlaceholder('Thêm topic…').fill('VLSM');
  await page.keyboard.press('Enter');
  await expect(drawer.getByRole('listitem').filter({ hasText: 'VLSM' })).toBeVisible();

  // A: hỏi kế hoạch
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Hôm nay nên làm gì?' }).click();
  await expect(page.locator('[data-role="assistant"]').last()).toContainText('Computer Networks=active');

  // B: cập nhật bằng ngôn ngữ tự nhiên
  await page.getByPlaceholder('Nhắn gì đó…').fill('Computer Networks: tôi đã xong phần VLSM, giải được 5 bài');
  await page.getByRole('button', { name: 'Gửi' }).click();
  const card = page.getByTestId('proposal-card');
  await expect(card).toContainText('Sửa topic “VLSM”');
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(card).toContainText('Đã áp dụng 2/2 thay đổi');

  // state mới được đọc ở cuộc chat khác mà không cần kể lại
  await page.goto('/chat');
  await page.getByPlaceholder('Nhắn gì đó…').fill('Computer Networks sao rồi?');
  await page.getByRole('button', { name: 'Gửi' }).click();
  await expect(page.locator('[data-role="assistant"]').last()).toContainText('VLSM=confident');
});
```

- [ ] **Step 2: Chạy toàn bộ bộ test**

Run: `pnpm test && pnpm test:e2e && pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS và build thành công. Test nào đỏ thì sửa ở đúng task sở hữu đoạn mã đó rồi chạy lại.

- [ ] **Step 3: Hoàn thiện `README.md` và `.env.example`**

README gồm các mục, theo thứ tự: giới thiệu một đoạn · chạy local (`pnpm install`, `pnpm dev`, `pnpm db:seed`) · bảng lệnh (chép từ `docs/superpowers/plans/README.md`) · bảng biến môi trường (tên, bắt buộc ở đâu, ý nghĩa) · triển khai lần đầu (Supabase, migrate, `verify:rls`, Vercel) · đổi provider AI (đổi `AI_BASE_URL`/`AI_MODEL`, chạy `pnpm ai:probe`, đặt `AI_ACTION_MODE` theo kết quả) · sao lưu (nút export trong Settings, khuyến nghị tải về định kỳ, kiểm tra chính sách backup của gói Supabase) · quyền riêng tư (dữ liệu nằm trên Supabase, context gửi tới provider AI, công tắc `Không gửi cho AI` chỉ chặn chiều tới provider) · dùng trên iPhone (`Add to Home Screen`). `.env.example` khớp với mọi biến `loadConfig` đọc.

- [ ] **Step 4: Viết `docs/acceptance-checklist.md`**

Một bảng 17 dòng theo đúng 17 criteria ở mục 11 của spec. Cột: `#` · nguyên văn tiêu chí · kiểm chứng tự động (tên file test, chép từ bảng bản đồ trong `docs/superpowers/plans/README.md`) · bước kiểm tra tay của owner · ô `Đạt` để trống. Thêm bên dưới năm ý (a)–(f) của mục 12 trong spec dưới tiêu đề “Sau 2 tuần sử dụng” để owner tự đánh giá.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: finalize README, env example and acceptance checklist"
```

- [ ] **Step 6: ĐIỂM DỪNG — owner nghiệm thu trên bản deploy**

Đưa cho owner `docs/acceptance-checklist.md` và chờ họ đi hết danh sách. Các mục chỉ owner làm được:

1. Đẩy code và deploy (khi owner yêu cầu); chạy `pnpm db:migrate` với biến production nếu có migration mới; chạy lại `pnpm verify:rls` (criterion 13).
2. Trên bản deploy với Fosta: nhắn “Tôi đã hoàn thành chương 1 Mobile” → có thẻ đề xuất, chưa ghi gì; duyệt → Context đổi đúng một lần (criteria 7, 8).
3. Trên iPhone, mở từ màn hình chính: không có thanh địa chỉ Safari; chạm ô nhập không zoom; composer không bị bàn phím che; ghi một quick capture và duyệt một thẻ đề xuất bằng một tay (criterion 16).
4. Tải file export và mở thử (criterion 17).

Ghi kết quả vào cột `Đạt` và commit file checklist. Mục nào không đạt: mô tả lại hiện tượng cho owner, sửa ở task tương ứng, chạy lại bộ test rồi nhờ owner kiểm tra lại mục đó.

**Xong Phase 3 — và xong V1 — khi:** cả 17 dòng trong `docs/acceptance-checklist.md` được owner đánh dấu đạt.
