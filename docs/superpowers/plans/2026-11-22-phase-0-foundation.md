# Phase 0 — Nền và kiểm chứng: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng khung ứng dụng có database, đăng nhập một owner, hai màn hình rỗng, PWA, lớp provider AI có mock, và chứng minh được nó deploy và mở trên iPhone.

**Architecture:** Next.js App Router chạy toàn bộ truy vấn ở server qua Drizzle. Driver database và chế độ đăng nhập chọn bằng biến môi trường: PGlite + phiên giả lập cho dev/test, Supabase Postgres + Supabase Auth cho production; một bộ kiểm tra cấu hình chặn tổ hợp không an toàn. Provider AI nằm sau interface `AiProvider` với hai cài đặt `mock` và `fosta`.

**Tech Stack:** Next.js, TypeScript, Tailwind, shadcn/ui, Drizzle, postgres.js, PGlite, `@supabase/ssr`, Zod 4, `openai`, Vitest, Playwright.

**Spec:** `Personal_AI_Workspace_V1.1_Spec.md` — mục 5, 6.1, 8, 10 (Phase 0), criteria 1, 11, 13. Đọc thêm `docs/superpowers/plans/README.md` (quy ước chung, cấu trúc thư mục, bảng lệnh).

## Global Constraints

- Chỉ hai đích điều hướng chính: `/chat` và `/context`. Settings là modal.
- Toàn bộ truy vấn DB chạy ở server. Trình duyệt chỉ dùng Supabase client để đăng nhập.
- RLS bật trên **mọi** bảng, không tạo policy nào.
- Đăng nhập bằng email + mật khẩu. Không magic link. Không có đường đăng ký.
- Build production từ chối khởi động nếu `AUTH_MODE=dev`, `DB_DRIVER=pglite` hoặc `E2E=1`.
- Trường chỉ-ngày dùng kiểu `date` và đi qua code dưới dạng chuỗi `YYYY-MM-DD`. Mốc thời điểm dùng `timestamptz`. Múi giờ hiển thị: `Asia/Ho_Chi_Minh`.
- Không có `owner_id`. Không dùng `SUPABASE_SERVICE_ROLE_KEY`.
- Key AI và `DATABASE_URL` không bao giờ xuất hiện trong bundle frontend, log hay repo.
- Test không gọi mạng ra ngoài.

## Review Focus

1. Production khởi động với cờ dev (`AUTH_MODE=dev`, `DB_DRIVER=pglite`, `E2E=1`) → phải dừng ngay với thông báo nêu tên cờ. *(Task 3)*
2. Email owner khác hoa/thường hoặc có khoảng trắng thừa so với `APP_OWNER_EMAIL` → vẫn nhận là owner; email khác → không. *(Task 3)*
3. Provider trả 401/429/500 hoặc body không phải stream → ném `AiProviderError` có `status`, không làm sập tiến trình. *(Task 5)*
4. Arguments của tool call đến rời rạc qua nhiều chunk → ghép lại thành một JSON hoàn chỉnh. *(Task 5)*
5. Thời điểm sát nửa đêm giờ Việt Nam và chuỗi ngày không hợp lệ (`2026-02-30`, `22/11`) → tính đúng ngày, từ chối chuỗi sai. *(Task 1)*

---

### Task 1: Khung dự án và thư viện ngày giờ

**Files:**
- Create: toàn bộ khung Next.js ở gốc repo, `vitest.config.ts`, `.env.example`, `src/lib/dates.ts`
- Modify: `README.md` (đang là UTF-16, ghi lại bằng UTF-8), `.gitignore`, `package.json`
- Test: `src/lib/dates.test.ts`

**Interfaces:**
- Produces:
  - `APP_TZ = 'Asia/Ho_Chi_Minh'`
  - `todayIn(tz: string, now: Date): string` — `YYYY-MM-DD`
  - `daysUntil(dateStr: string, today: string): number` — âm nghĩa là quá hạn
  - `daysSince(at: Date, today: string, tz: string): number`
  - `weekRange(today: string): { start: string; end: string }` — thứ Hai đến Chủ nhật
  - `weekdayVi(dateStr: string): string` — `'Thứ Hai'` … `'Chủ nhật'`
  - `formatDateVi(dateStr: string): string` — `'22/11'`
  - `isValidDateStr(s: string): boolean`

- [ ] **Step 1: Scaffold vào thư mục tạm rồi chuyển lên gốc**

Gốc repo đã có file nên không scaffold trực tiếp được.

```bash
pnpm create next-app@latest tmp-scaffold --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --disable-git --yes
```

Chuyển mọi thứ trong `tmp-scaffold/` (kể cả file ẩn) lên gốc, **trừ** `README.md`; xóa `tmp-scaffold/`. Nếu một cờ không còn tồn tại, chạy `--help` và chọn cờ tương đương.

- [ ] **Step 2: Cài công cụ test và thêm script**

```bash
pnpm add -D vitest
```

Thêm vào `package.json` các script `test` (`vitest run`), `typecheck` (`tsc --noEmit`). `vitest.config.ts`: môi trường `node`, alias `@` → `./src`, `include: ['src/**/*.test.ts', 'scripts/**/*.test.ts']`.

- [ ] **Step 3: Ghi `.gitignore`, `.env.example`, `README.md`**

`.gitignore` thêm: `.env*` (trừ `.env.example`), `.pglite/`, `test-results/`, `playwright-report/`.
`.env.example`: chép nguyên khối “Environment example” ở mục 8 của spec, thêm `PGLITE_DIR=./.pglite`, `MIGRATION_DATABASE_URL=`, `E2E=`.
`README.md` (UTF-8): tên dự án, một dòng mô tả, liên kết tới spec và `docs/superpowers/plans/README.md`.

- [ ] **Step 4: Viết test thất bại cho `dates`**

```ts
import { describe, expect, test } from 'vitest';
import { APP_TZ, daysSince, daysUntil, formatDateVi, isValidDateStr, todayIn, weekRange, weekdayVi } from './dates';

describe('todayIn', () => {
  test('00:30 giờ VN đã là ngày mới', () => {
    expect(todayIn(APP_TZ, new Date('2026-11-21T17:30:00Z'))).toBe('2026-11-22');
  });
  test('23:30 giờ VN chưa sang ngày', () => {
    expect(todayIn(APP_TZ, new Date('2026-11-22T16:30:00Z'))).toBe('2026-11-22');
  });
});

test('daysUntil', () => {
  expect(daysUntil('2026-11-22', '2026-11-22')).toBe(0);
  expect(daysUntil('2026-12-01', '2026-11-22')).toBe(9);
  expect(daysUntil('2026-11-20', '2026-11-22')).toBe(-2);
  expect(daysUntil('2027-01-01', '2026-12-31')).toBe(1);
});

test('daysSince tính theo ngày lịch ở múi giờ VN', () => {
  // 2026-11-14T20:00Z = 03:00 ngày 15/11 giờ VN
  expect(daysSince(new Date('2026-11-14T20:00:00Z'), '2026-11-22', APP_TZ)).toBe(7);
});

test('weekRange: thứ Hai đến Chủ nhật', () => {
  expect(weekRange('2026-11-22')).toEqual({ start: '2026-11-16', end: '2026-11-22' }); // Chủ nhật
  expect(weekRange('2026-11-23')).toEqual({ start: '2026-11-23', end: '2026-11-29' }); // thứ Hai
});

test('hiển thị tiếng Việt', () => {
  expect(weekdayVi('2026-11-22')).toBe('Chủ nhật');
  expect(weekdayVi('2026-11-23')).toBe('Thứ Hai');
  expect(formatDateVi('2026-11-22')).toBe('22/11');
});

test('isValidDateStr', () => {
  expect(isValidDateStr('2026-11-22')).toBe(true);
  expect(isValidDateStr('2026-02-30')).toBe(false);
  expect(isValidDateStr('22/11')).toBe(false);
  expect(isValidDateStr('2026-11-22T00:00:00Z')).toBe(false);
});
```

- [ ] **Step 5: Chạy để thấy thất bại**

Run: `pnpm test src/lib/dates.test.ts`
Expected: FAIL — không tìm thấy module `./dates`.

- [ ] **Step 6: Cài đặt `src/lib/dates.ts`**

Dùng `Intl.DateTimeFormat('en-CA', { timeZone })` để lấy ngày theo múi giờ. Phép tính giữa hai chuỗi ngày làm trên `Date.UTC(y, m - 1, d)`; không tạo `Date` từ chuỗi ngày bằng giờ địa phương.

- [ ] **Step 7: Chạy lại**

Run: `pnpm test src/lib/dates.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS, không lỗi.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app and add date utilities"
```

---

### Task 2: Schema database, client và migration

**Files:**
- Create: `src/db/enums.ts`, `src/db/schema.ts`, `src/db/client.ts`, `src/db/testing.ts`, `drizzle.config.ts`, `scripts/migrate.ts`, `drizzle/*` (sinh tự động)
- Modify: `package.json` (script `db:generate`, `db:migrate`), `next.config.ts` (`serverExternalPackages` chứa `@electric-sql/pglite`)
- Test: `src/db/schema.test.ts`

**Interfaces:**
- Produces:
  - `src/db/enums.ts` — mỗi enum là một mảng `as const` cùng kiểu suy ra:
    `AREA_KINDS ['academic','project']`, `AREA_STATUSES ['unknown','not_started','active','blocked','on_hold','completed']`, `PRIORITIES ['high','medium','low']`, `TOPIC_STATUSES ['not_started','familiar','practiced','confident']`, `TASK_STATUSES ['todo','doing','done','blocked']`, `DEADLINE_TYPES ['hard','committed','flexible']`, `MILESTONE_STATUSES ['not_started','in_progress','done']`, `BLOCKER_STATUSES ['open','resolved']`, `INBOX_STATUSES ['none','inbox','processed']`, `LOG_ACTIONS ['create','update','delete','archive','progress']`, `ORIGINS ['manual','ai_approved','seed','undo']`, `ENTITY_TYPES ['area','task','topic','assessment','milestone','blocker','note']`, `PENDING_STATUSES ['pending','applied','partially_applied','rejected','superseded','failed']`, `PENDING_SOURCES ['chat','capture']`, `MESSAGE_ROLES ['user','assistant']`
  - `src/db/schema.ts` — 15 bảng (dưới đây) và kiểu `AreaRow`, `TaskRow`, … bằng `$inferSelect`
  - `src/db/client.ts`:
    - `type Db` (database Drizzle dialect Postgres gắn `schema`), `type Tx` (tham số của callback `db.transaction`), `type DbOrTx = Db | Tx`
    - `getDb(): Promise<Db>` — singleton trên `globalThis`; chọn driver theo config; với PGlite thì tự áp migration ở lần gọi đầu
  - `src/db/testing.ts`: `createTestDb(): Promise<Db>` — PGlite trong bộ nhớ, mới hoàn toàn, đã migrate
  - `TABLE_NAMES: readonly string[]` export từ `schema.ts` — tên 15 bảng

**Định nghĩa bảng** (mọi `id` là `uuid` khóa chính mặc định ngẫu nhiên, trừ chỗ ghi khác; `created_at`/`updated_at` là `timestamptz not null default now()`; cột enum lưu `text` kèm ràng buộc kiểu từ `enums.ts`; cột `date` dùng `mode: 'string'`):

| Bảng | Cột |
|---|---|
| `areas` | id · kind (not null) · name (not null) · aliases `jsonb` string[] (not null, `[]`) · summary · goal · status (not null, `unknown`) · priority (not null, `medium`) · start_date `date` · deadline_date `date` · next_action · ai_excluded `bool` (not null, false) · archived_at `timestamptz` · created_at · updated_at |
| `academic_details` | area_id (PK, FK → areas, cascade) · term · credits `int` · target_grade (default `A`) · grading_scheme · exam_format · course_outline |
| `project_details` | area_id (PK, FK → areas, cascade) · role · collaborators · scope · cadence |
| `topics` | id · area_id (FK cascade, not null) · title (not null) · status (not null, `not_started`) · evidence · sort_order `int` (not null, 0) · created_at · updated_at |
| `milestones` | id · area_id (FK cascade, not null) · title (not null) · acceptance_criteria · target_date `date` · status (not null, `not_started`) · created_at · updated_at |
| `blockers` | id · area_id (FK cascade, not null) · title (not null) · last_attempt · next_action · external_dependency · status (not null, `open`) · resolved_at `timestamptz` · created_at · updated_at |
| `tasks` | id · area_id (FK cascade, not null) · milestone_id (FK → milestones, set null) · title (not null) · status (not null, `todo`) · due_date `date` · due_time `time` · deadline_type (not null, `flexible`) · estimate_minutes `int` · blocked_reason · sort_order `int` (not null, 0) · created_at · updated_at |
| `assessments` | id · area_id (FK cascade, not null) · title (not null) · due_date `date` · weight `real` · score `real` · max_score `real` · created_at · updated_at |
| `notes` | id · area_id (FK set null) · text (not null) · inbox_status (not null, `none`) · ai_excluded `bool` (not null, false) · created_at · updated_at |
| `activity_logs` | id · area_id (FK set null) · entity_type (not null) · entity_id `uuid` (not null) · action (not null) · before_json `jsonb` · after_json `jsonb` · origin (not null) · batch_id `uuid` · created_at |
| `conversations` | id · title (not null) · created_at · updated_at |
| `messages` | id · conversation_id (FK cascade, not null) · role (not null) · content (not null) · metadata `jsonb` · created_at |
| `pending_actions` | id · conversation_id (FK cascade) · message_id (FK → messages, set null) · note_id (FK → notes, set null) · source (not null) · actions_json `jsonb` (not null) · status (not null, `pending`) · error · created_at · resolved_at `timestamptz` |
| `settings` | id `int` (PK, luôn bằng 1) · timezone (not null, `Asia/Ho_Chi_Minh`) · default_focus_minutes `int` · stale_after_days `int` (not null, 7) · term_goal · preferences_json `jsonb` (not null, `{}`) · onboarded_at `timestamptz` |
| `ai_usage` | day `date` (PK) · count `int` (not null, 0) |

Chỉ mục: `tasks(area_id)`, `tasks(due_date)`, `topics(area_id)`, `activity_logs(area_id, created_at)`, `activity_logs(entity_id)`, `messages(conversation_id, created_at)`, `pending_actions(status)`.

- [ ] **Step 1: Cài thư viện**

```bash
pnpm add drizzle-orm postgres @electric-sql/pglite zod
pnpm add -D drizzle-kit tsx
```

- [ ] **Step 2: Viết test thất bại**

```ts
import { sql } from 'drizzle-orm';
import { expect, test } from 'vitest';
import { areas, tasks, TABLE_NAMES } from './schema';
import { createTestDb } from './testing';

test('có đúng 15 bảng', async () => {
  const db = await createTestDb();
  const rows = await db.execute(sql`select tablename from pg_tables where schemaname = 'public' and tablename not like '__drizzle%' order by tablename`);
  expect(rows.rows.map((r: any) => r.tablename)).toEqual([...TABLE_NAMES].sort());
  expect(TABLE_NAMES).toHaveLength(15);
});

test('mọi bảng đều bật RLS (criterion 13)', async () => {
  const db = await createTestDb();
  const rows = await db.execute(sql`
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname not like '__drizzle%' and not c.relrowsecurity`);
  expect(rows.rows).toEqual([]);
});

test('không có policy nào', async () => {
  const db = await createTestDb();
  const rows = await db.execute(sql`select policyname from pg_policies where schemaname = 'public'`);
  expect(rows.rows).toEqual([]);
});

test('cột date đi và về dưới dạng chuỗi YYYY-MM-DD', async () => {
  const db = await createTestDb();
  const [area] = await db.insert(areas).values({ kind: 'academic', name: 'Database' }).returning();
  const [task] = await db.insert(tasks).values({ areaId: area.id, title: 'Lab 1', dueDate: '2026-11-22' }).returning();
  expect(task.dueDate).toBe('2026-11-22');
});

test('giá trị mặc định của area', async () => {
  const db = await createTestDb();
  const [area] = await db.insert(areas).values({ kind: 'project', name: 'StewieSAT' }).returning();
  expect(area).toMatchObject({ status: 'unknown', priority: 'medium', aliases: [], aiExcluded: false, archivedAt: null });
});

test('mỗi createTestDb là một database riêng', async () => {
  const a = await createTestDb();
  const b = await createTestDb();
  await a.insert(areas).values({ kind: 'project', name: 'X' });
  expect(await b.select().from(areas)).toEqual([]);
});
```

- [ ] **Step 3: Chạy để thấy thất bại**

Run: `pnpm test src/db/schema.test.ts`
Expected: FAIL — không tìm thấy `./schema`.

- [ ] **Step 4: Viết `enums.ts`, `schema.ts`, `drizzle.config.ts` và sinh migration**

Bật RLS trên từng bảng bằng API của phiên bản Drizzle đã cài; nếu API không sinh ra câu lệnh, thêm tay `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` vào file migration. Không dùng `FORCE ROW LEVEL SECURITY` (role sở hữu bảng phải đọc ghi bình thường).

Run: `pnpm db:generate`
Expected: có file SQL mới trong `drizzle/`.

- [ ] **Step 5: Viết `client.ts`, `testing.ts`, `scripts/migrate.ts`**

`getDb()` đọc `DB_DRIVER` trực tiếp từ `process.env` ở task này (Task 3 sẽ thay bằng `getConfig()`). Với `postgres`: `postgres(DATABASE_URL, { prepare: false })`. Với `pglite`: `PGLITE_DIR` bằng `memory` thì tạo trong bộ nhớ, ngược lại lưu vào thư mục đó. `scripts/migrate.ts` áp migration lên `MIGRATION_DATABASE_URL`, nếu trống thì dùng `DATABASE_URL`. Kết quả của `db.execute` khác nhau giữa hai driver (PGlite trả `{ rows }`, postgres.js trả mảng); nếu kiểu `Db` chung không cho đọc `.rows`, thêm vào `testing.ts` hàm `rowsOf(result: unknown): any[]` và dùng nó trong test thay cho `.rows`.

- [ ] **Step 6: Chạy lại**

Run: `pnpm test src/db/schema.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(db): add schema with RLS, drizzle client and migrations"
```

---

### Task 3: Cấu hình, chốt an toàn và đăng nhập

**Files:**
- Create: `src/server/config.ts`, `src/server/errors.ts`, `src/server/owner.ts` (hàm thuần, không import gì của Next.js), `src/server/auth.ts` (phần phụ thuộc Next.js và Supabase), `src/server/supabase.ts`, `src/instrumentation.ts`, `src/app/login/page.tsx`, `src/app/login/actions.ts`, file middleware/proxy làm mới phiên Supabase
- Modify: `src/db/client.ts` (dùng `getConfig()`)
- Test: `src/server/config.test.ts`, `src/server/owner.test.ts`, `src/server/auth.test.ts`

**Interfaces:**
- Consumes: `getDb()` (Task 2)
- Produces:
  - `type AppConfig = { nodeEnv: 'development'|'test'|'production'; dbDriver: 'postgres'|'pglite'; databaseUrl?: string; pgliteDir: string; authMode: 'supabase'|'dev'; supabaseUrl?: string; supabaseAnonKey?: string; ownerEmail?: string; aiProvider: 'fosta'|'mock'; aiBaseUrl?: string; aiApiKey?: string; aiModel?: string; aiActionMode: 'tools'|'json'|'off'; aiDailyRequestCap: number; e2e: boolean }`
  - `loadConfig(env: Record<string, string | undefined>): AppConfig` — mặc định ngoài production: `dbDriver='pglite'`, `authMode='dev'`, `aiProvider='mock'`; mặc định chung: `aiActionMode='off'`, `aiDailyRequestCap=200`, `pgliteDir='./.pglite'`
  - `assertSafeConfig(cfg: AppConfig): void` — ném `ConfigError`
  - `getConfig(): AppConfig` — `loadConfig(process.env)` có cache
  - Trong `owner.ts`: `isOwnerEmail(candidate: string | null | undefined, ownerEmail: string | undefined): boolean` · `type Owner = { email: string }` · `resolveOwner(cfg: AppConfig, getSessionEmail: () => Promise<string | null>): Promise<Owner | null>` · `isSameOrigin(req: Request): boolean` — `true` khi không có header `Origin` hoặc host của `Origin` bằng header `Host`
  - Trong `auth.ts`: `getOwner(): Promise<Owner | null>` · `requireOwner(): Promise<Owner>` (chưa đăng nhập thì `redirect('/login')`)
  - Trong `auth.ts`: `withOwner<C>(handler: (req: Request, owner: Owner, ctx: C) => Promise<Response>): (req: Request, ctx: C) => Promise<Response>` — chưa đăng nhập trả `401` với body `{"error":"unauthorized"}`; request không phải `GET`/`HEAD` mà `isSameOrigin` là false trả `403` với body `{"error":"forbidden"}`
  - `src/server/errors.ts`: `ConfigError`, `NotFoundError`, `ValidationError`, `AiProviderError` (có `status?: number`), `AiCapExceededError`

- [ ] **Step 1: Viết test thất bại**

```ts
// src/server/config.test.ts
import { expect, test } from 'vitest';
import { assertSafeConfig, loadConfig } from './config';

const prod = { NODE_ENV: 'production', DATABASE_URL: 'postgres://x', NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon', APP_OWNER_EMAIL: 'me@example.com' };

test('mặc định ngoài production là pglite + dev + mock', () => {
  expect(loadConfig({ NODE_ENV: 'development' })).toMatchObject({ dbDriver: 'pglite', authMode: 'dev', aiProvider: 'mock', aiActionMode: 'off', aiDailyRequestCap: 200 });
});

test('mặc định production là postgres + supabase', () => {
  const cfg = loadConfig(prod);
  expect(cfg).toMatchObject({ dbDriver: 'postgres', authMode: 'supabase' });
  expect(() => assertSafeConfig(cfg)).not.toThrow();
});

test.each([
  [{ AUTH_MODE: 'dev' }, /AUTH_MODE=dev/],
  [{ DB_DRIVER: 'pglite' }, /DB_DRIVER=pglite/],
  [{ E2E: '1' }, /E2E=1/],
])('production từ chối %o', (extra, message) => {
  expect(() => assertSafeConfig(loadConfig({ ...prod, ...extra }))).toThrow(message);
});

test('production thiếu biến bắt buộc thì nêu tên biến', () => {
  expect(() => assertSafeConfig(loadConfig({ NODE_ENV: 'production' }))).toThrow(/DATABASE_URL/);
  expect(() => assertSafeConfig(loadConfig({ ...prod, APP_OWNER_EMAIL: undefined }))).toThrow(/APP_OWNER_EMAIL/);
});

test('giá trị enum sai bị từ chối khi load', () => {
  expect(() => loadConfig({ NODE_ENV: 'development', AI_ACTION_MODE: 'auto' })).toThrow(/AI_ACTION_MODE/);
});
```

```ts
// src/server/owner.test.ts
import { expect, test, vi } from 'vitest';
import { loadConfig } from './config';
import { isOwnerEmail, isSameOrigin, resolveOwner } from './owner';

test('isSameOrigin', () => {
  const req = (headers: Record<string, string>) => new Request('https://app.example.com/api/chat', { method: 'POST', headers });
  expect(isSameOrigin(req({ host: 'app.example.com' }))).toBe(true);
  expect(isSameOrigin(req({ host: 'app.example.com', origin: 'https://app.example.com' }))).toBe(true);
  expect(isSameOrigin(req({ host: 'app.example.com', origin: 'https://evil.example.net' }))).toBe(false);
  expect(isSameOrigin(req({ host: 'app.example.com', origin: 'null' }))).toBe(false);
});

test('isOwnerEmail bỏ qua hoa thường và khoảng trắng', () => {
  expect(isOwnerEmail(' Me@Example.com ', 'me@example.com')).toBe(true);
  expect(isOwnerEmail('other@example.com', 'me@example.com')).toBe(false);
  expect(isOwnerEmail(null, 'me@example.com')).toBe(false);
  expect(isOwnerEmail('me@example.com', undefined)).toBe(false);
});

const supa = loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'x', NEXT_PUBLIC_SUPABASE_URL: 'x', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'x', APP_OWNER_EMAIL: 'me@example.com' });

test('chế độ supabase: chỉ email owner được nhận', async () => {
  expect(await resolveOwner(supa, async () => 'ME@example.com')).toEqual({ email: 'me@example.com' });
  expect(await resolveOwner(supa, async () => 'other@example.com')).toBeNull();
  expect(await resolveOwner(supa, async () => null)).toBeNull();
});

test('chế độ dev: không đọc phiên', async () => {
  const getSessionEmail = vi.fn(async () => null);
  expect(await resolveOwner(loadConfig({ NODE_ENV: 'development' }), getSessionEmail)).toEqual({ email: 'dev@local' });
  expect(getSessionEmail).not.toHaveBeenCalled();
});
```

`src/server/auth.test.ts` kiểm `withOwner`, dùng `vi.mock` thay các module của Next.js và Supabase mà `auth.ts` import, và điều khiển phiên đăng nhập giả: (1) không có phiên → `401`, handler không được gọi; (2) có phiên owner, `GET` → handler được gọi với owner đó; (3) có phiên owner, `POST` kèm `Origin` khác host → `403`, handler không được gọi.

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `pnpm test src/server/config.test.ts src/server/owner.test.ts src/server/auth.test.ts`
Expected: FAIL — không tìm thấy module.

- [ ] **Step 3: Cài đặt `config.ts`, `errors.ts`, `owner.ts`, `auth.ts`, `supabase.ts`**

```bash
pnpm add @supabase/ssr @supabase/supabase-js
```

`getOwner()` gọi `resolveOwner(getConfig(), ...)` với hàm lấy email từ `supabase.auth.getUser()` của server client. Làm theo hướng dẫn Supabase SSR cho đúng phiên bản Next.js đã cài (cookie, file làm mới phiên).

- [ ] **Step 4: Gắn chốt an toàn và trang đăng nhập**

`src/instrumentation.ts`: hàm `register()` gọi `assertSafeConfig(getConfig())`.
`/login`: form email + mật khẩu, server action gọi `signInWithPassword`; sai thông tin hiển thị “Email hoặc mật khẩu không đúng.”; đúng nhưng không phải owner thì đăng xuất ngay và hiển thị cùng thông báo đó. Không có liên kết đăng ký hay quên mật khẩu. Ở `AUTH_MODE=dev`, `/login` chuyển thẳng về `/chat`. Thêm server action `signOut()`.

- [ ] **Step 5: Chạy lại**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Kiểm tra chốt an toàn bằng tay**

Run: `pnpm build` rồi `AUTH_MODE=dev pnpm start`
Expected: tiến trình dừng với lỗi chứa `AUTH_MODE=dev`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(auth): add config guard, owner-only auth and login page"
```

---

### Task 4: Khung giao diện, PWA và Playwright

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/app/(app)/chat/page.tsx`, `src/app/(app)/context/page.tsx`, `src/components/shell/{sidebar,mobile-nav,theme-toggle}.tsx`, `src/app/manifest.ts`, `public/icons/{icon-192.png,icon-512.png,apple-touch-icon.png}`, `src/app/api/test/reset/route.ts`, `playwright.config.ts`, `e2e/helpers.ts`
- Modify: `src/app/layout.tsx` (viewport, theme, metadata), `src/app/page.tsx` (chuyển hướng `/chat`), `src/app/globals.css` (safe-area, cỡ chữ ô nhập), `package.json` (script `dev:e2e`, `test:e2e`)
- Test: `e2e/shell.spec.ts`, `e2e/bundle-secrets.spec.ts`

**Interfaces:**
- Consumes: `requireOwner()`, `withOwner()`, `getConfig()`, `getDb()`, `TABLE_NAMES`
- Produces:
  - `POST /api/test/reset` — body `{ seed?: boolean }`; xóa sạch mọi bảng trong `TABLE_NAMES`; trả `404` khi `config.e2e` là false. (`seed: true` được nối vào ở Phase 1, Task 8.)
  - `e2e/helpers.ts`: `resetDb(request: APIRequestContext, opts?: { seed?: boolean }): Promise<void>`
  - Layout `(app)` nhận `children` và hiển thị sidebar có khe `data-testid="recent-chats"` (rỗng ở phase này) và nút `Settings`

**Yêu cầu giao diện (spec 3.1):**
- Sidebar: tên “Personal AI”, hai liên kết `Chat` và `Context`, vùng “Recent chats”, nút `Settings` (chưa mở gì ở phase này). Thu gọn được trên desktop; trên màn hẹp hơn 768px thì ẩn và mở bằng nút menu.
- `/chat` và `/context` ở phase này chỉ hiển thị tiêu đề. `/context` có đúng hai tab `Academic` và `Projects`, tab đang chọn nằm trong URL (`?tab=academic|projects`, mặc định `academic`).
- Dark/light theo hệ thống, có nút đổi; lựa chọn lưu ở `localStorage`.
- Viewport: `width=device-width, initial-scale=1, viewport-fit=cover`. Khung ngoài cao `100dvh`, có padding `env(safe-area-inset-*)`. Mọi `input`, `textarea`, `select` có `font-size` tối thiểu 16px. Vùng chạm tối thiểu 44px.
- Manifest: `name: 'Personal AI Workspace'`, `short_name: 'Personal AI'`, `display: 'standalone'`, `start_url: '/chat'`, hai icon 192 và 512; thẻ `apple-touch-icon` trong `<head>`. Icon là hình vuông một màu có chữ “AI”, tự sinh bằng script hoặc vẽ SVG rồi xuất PNG.

- [ ] **Step 1: Cài shadcn/ui và Playwright**

Khởi tạo shadcn theo CLI hiện hành, thêm các component: `button input textarea tabs sheet dialog select checkbox switch badge dropdown-menu sonner`.

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium webkit
```

`playwright.config.ts`: `baseURL: 'http://localhost:3100'`; `webServer.command: 'pnpm dev:e2e'`; hai project `desktop` (`devices['Desktop Chrome']`) và `iphone` (`devices['iPhone 14']`); `workers: 1` (các test dùng chung một database trong bộ nhớ).
Script `dev:e2e` đặt: `E2E=1 PGLITE_DIR=memory AUTH_MODE=dev DB_DRIVER=pglite AI_PROVIDER=mock AI_ACTION_MODE=tools AI_API_KEY=e2e-secret-ai-key DATABASE_URL=postgres://e2e-secret-db-url` và chạy `next dev -p 3100`. Dùng `cross-env` để chạy được trên Windows.

- [ ] **Step 2: Viết E2E thất bại**

```ts
// e2e/shell.spec.ts
import { expect, test } from '@playwright/test';
import { resetDb } from './helpers';

test.beforeEach(async ({ request }) => { await resetDb(request); });

test('trang gốc chuyển về /chat', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/chat$/);
});

test('chỉ có hai đích điều hướng chính', async ({ page, isMobile }) => {
  await page.goto('/chat');
  if (isMobile) await page.getByRole('button', { name: 'Mở menu' }).click();
  const links = page.getByRole('navigation', { name: 'Chính' }).getByRole('link');
  await expect(links).toHaveText(['Chat', 'Context']);
});

test('Context có đúng hai tab và tab nằm trong URL', async ({ page }) => {
  await page.goto('/context');
  await expect(page.getByRole('tab')).toHaveText(['Academic', 'Projects']);
  await page.getByRole('tab', { name: 'Projects' }).click();
  await expect(page).toHaveURL(/tab=projects/);
});

test('manifest PWA', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ display: 'standalone', start_url: '/chat', short_name: 'Personal AI' });
});

test('không tràn ngang và viewport dùng viewport-fit=cover', async ({ page }) => {
  for (const path of ['/chat', '/context']) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
});
```

```ts
// e2e/bundle-secrets.spec.ts — criterion 11
import { expect, test } from '@playwright/test';

test('bundle frontend không chứa key AI hay DATABASE_URL', async ({ page }) => {
  const bodies: string[] = [];
  page.on('response', async (res) => {
    if (res.request().resourceType() === 'script') bodies.push(await res.text().catch(() => ''));
  });
  for (const path of ['/chat', '/context']) await page.goto(path, { waitUntil: 'networkidle' });
  const all = bodies.join('\n') + (await page.content());
  expect(all).not.toContain('e2e-secret-ai-key');
  expect(all).not.toContain('e2e-secret-db-url');
});
```

- [ ] **Step 3: Chạy để thấy thất bại**

Run: `pnpm test:e2e`
Expected: FAIL ở các test trong `shell.spec.ts`.

- [ ] **Step 4: Cài đặt layout, sidebar, hai trang, manifest, route reset**

- [ ] **Step 5: Chạy lại**

Run: `pnpm test:e2e`
Expected: PASS trên cả `desktop` và `iphone`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(shell): add two-screen shell, PWA manifest and e2e harness"
```

---

### Task 5: Lớp provider AI, mock, adapter Fosta và probe

**Files:**
- Create: `src/server/ai/provider.ts`, `src/server/ai/mock.ts`, `src/server/ai/fosta.ts`, `src/server/ai/probe.ts`, `scripts/ai-probe.ts`
- Modify: `package.json` (script `ai:probe`)
- Test: `src/server/ai/mock.test.ts`, `src/server/ai/fosta.test.ts`, `src/server/ai/probe.test.ts`

**Interfaces:**
- Consumes: `getConfig()`, `AiProviderError`
- Produces:
  - `type ChatMessage = { role: 'system'|'user'|'assistant'; content: string }`
  - `type ToolDef = { name: string; description: string; parameters: Record<string, unknown> }` (JSON Schema)
  - `type ProviderEvent = { type: 'text'; delta: string } | { type: 'tool_call'; name: string; argsJson: string }`
  - `type StreamRequest = { messages: ChatMessage[]; tools?: ToolDef[]; maxOutputTokens: number; signal?: AbortSignal }`
  - `interface AiProvider { stream(req: StreamRequest): AsyncIterable<ProviderEvent> }`
  - `getProvider(): AiProvider` — theo `config.aiProvider`
  - `collect(events: AsyncIterable<ProviderEvent>): Promise<{ text: string; toolCalls: { name: string; argsJson: string }[] }>`
  - `createMockProvider(): AiProvider`
  - `createFostaProvider(opts: { baseUrl: string; apiKey: string; model: string; fetch?: typeof fetch }): AiProvider`
  - `type ProbeReport = { chat: boolean; streaming: boolean; tools: { passed: number; total: number }; json: { passed: number; total: number }; notes: string[] }`
  - `runProbe(provider: AiProvider): Promise<ProbeReport>` · `recommendMode(r: ProbeReport): 'tools'|'json'|'off'`

**Hành vi mock ở phase này** (xét tin nhắn `user` cuối cùng, gọi là `u`):
- `u` chứa `MOCK_ERROR` → ném `AiProviderError('mock failure')` trước khi phát sự kiện nào.
- `u` chứa `MOCK_PARTIAL_ERROR` → phát `{ type: 'text', delta: 'Đang trả lời' }` rồi ném `AiProviderError`.
- Còn lại → phát hai sự kiện text: `'MOCK_REPLY: '` rồi `u`.

Phase 2 và Phase 3 sẽ mở rộng mock; không thêm hành vi nào khác ở đây.

**Adapter Fosta:** dùng gói `openai` với `baseURL`, `apiKey`, `fetch` truyền vào. Gọi `chat.completions.create({ model, messages, stream: true, max_tokens: maxOutputTokens, tools })`, với `tools` đổi sang dạng `{ type: 'function', function: { name, description, parameters } }` và bỏ hẳn trường này khi không có tool. Mỗi `delta.content` khác rỗng phát một sự kiện `text`. `delta.tool_calls` gom theo `index` (nối `function.arguments`); khi stream kết thúc, phát mỗi tool call một sự kiện `tool_call`. Mọi lỗi từ SDK bọc lại thành `AiProviderError` kèm `status` nếu có. Không ghi key hay nội dung tin nhắn vào log.

**Probe** (chỉ dùng dữ liệu giả, không đọc database):
1. `chat`: hỏi “Trả lời đúng một từ: xin chào” → đạt nếu có text khác rỗng.
2. `streaming`: đạt nếu nhận từ hai sự kiện `text` trở lên cho câu hỏi “Đếm từ 1 đến 20, mỗi số một dòng”.
3. `tools` (3 lần): kèm tool `propose_changes` có schema `{ summary: string, actions: [{ type: 'create_task', areaId: string, title: string }] }`, yêu cầu “Tạo task tên Probe task cho area 11111111-1111-4111-8111-111111111111”. Một lần đạt khi có đúng một tool call, `argsJson` parse được, `actions[0].title === 'Probe task'` và `areaId` đúng.
4. `json` (5 lần): không kèm tool; system prompt yêu cầu đặt đúng object ấy giữa `<proposed_actions>` và `</proposed_actions>` ở cuối. Một lần đạt khi tách được khối, parse được, và hai trường trên đúng.

`recommendMode`: `tools.passed === tools.total` → `'tools'`; ngược lại nếu `json.passed === json.total` → `'json'`; còn lại `'off'`.
`scripts/ai-probe.ts`: tạo provider Fosta từ env, chạy `runProbe`, ghi `docs/ai-probe-report.md` (ngày chạy, model, bốn kết quả, mode khuyến nghị) và in mode ra màn hình. Nếu `chat` trượt, thoát mã 1 với thông báo “Provider không dùng được, đổi provider trước khi làm Phase 2”.

- [ ] **Step 1: Cài `openai` và viết test thất bại**

```bash
pnpm add openai
```

```ts
// src/server/ai/mock.test.ts
import { expect, test } from 'vitest';
import { AiProviderError } from '../errors';
import { createMockProvider } from './mock';
import { collect } from './provider';

const ask = (content: string) => createMockProvider().stream({ messages: [{ role: 'user', content }], maxOutputTokens: 100 });

test('mặc định lặp lại tin nhắn trong hai chunk', async () => {
  const events = [];
  for await (const e of ask('xin chào')) events.push(e);
  expect(events).toEqual([{ type: 'text', delta: 'MOCK_REPLY: ' }, { type: 'text', delta: 'xin chào' }]);
});

test('MOCK_ERROR ném lỗi trước khi phát gì', async () => {
  await expect(collect(ask('MOCK_ERROR'))).rejects.toBeInstanceOf(AiProviderError);
});

test('MOCK_PARTIAL_ERROR phát một phần rồi ném lỗi', async () => {
  const seen: string[] = [];
  await expect((async () => { for await (const e of ask('MOCK_PARTIAL_ERROR')) if (e.type === 'text') seen.push(e.delta); })()).rejects.toBeInstanceOf(AiProviderError);
  expect(seen).toEqual(['Đang trả lời']);
});
```

```ts
// src/server/ai/fosta.test.ts
import { expect, test } from 'vitest';
import { AiProviderError } from '../errors';
import { createFostaProvider } from './fosta';
import { collect } from './provider';

function sse(chunks: object[]): Response {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}
const chunk = (delta: object) => ({ id: 'x', object: 'chat.completion.chunk', choices: [{ index: 0, delta }] });
const make = (fetchImpl: typeof fetch) => createFostaProvider({ baseUrl: 'https://example.test/v1', apiKey: 'k', model: 'm', fetch: fetchImpl });
const req = { messages: [{ role: 'user' as const, content: 'hi' }], maxOutputTokens: 50 };

test('gom text delta', async () => {
  const provider = make(async () => sse([chunk({ content: 'Xin ' }), chunk({ content: 'chào' })]));
  expect(await collect(provider.stream(req))).toEqual({ text: 'Xin chào', toolCalls: [] });
});

test('ghép arguments của tool call đến rời rạc', async () => {
  const provider = make(async () => sse([
    chunk({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'propose_changes', arguments: '{"summary":' } }] }),
    chunk({ tool_calls: [{ index: 0, function: { arguments: '"ok","actions":[]}' } }] }),
  ]));
  const out = await collect(provider.stream({ ...req, tools: [{ name: 'propose_changes', description: 'd', parameters: { type: 'object' } }] }));
  expect(out.toolCalls).toEqual([{ name: 'propose_changes', argsJson: '{"summary":"ok","actions":[]}' }]);
});

test('gửi tools đúng dạng và bỏ trường tools khi không có', async () => {
  const bodies: any[] = [];
  const fetchImpl = (async (_url: any, init: any) => { bodies.push(JSON.parse(init.body)); return sse([chunk({ content: 'a' })]); }) as typeof fetch;
  await collect(make(fetchImpl).stream(req));
  await collect(make(fetchImpl).stream({ ...req, tools: [{ name: 't', description: 'd', parameters: { type: 'object' } }] }));
  expect(bodies[0].tools).toBeUndefined();
  expect(bodies[1].tools).toEqual([{ type: 'function', function: { name: 't', description: 'd', parameters: { type: 'object' } } }]);
  expect(bodies[0]).toMatchObject({ model: 'm', stream: true, max_tokens: 50 });
});

test.each([401, 429, 500])('HTTP %i thành AiProviderError có status', async (status) => {
  const provider = make(async () => new Response(JSON.stringify({ error: { message: 'no' } }), { status, headers: { 'content-type': 'application/json' } }));
  await expect(collect(provider.stream(req))).rejects.toMatchObject({ name: 'AiProviderError', status });
});

test('body 200 không phải stream thành AiProviderError', async () => {
  const provider = make(async () => new Response('<html>gateway</html>', { status: 200, headers: { 'content-type': 'text/html' } }));
  await expect(collect(provider.stream(req))).rejects.toBeInstanceOf(AiProviderError);
});
```

```ts
// src/server/ai/probe.test.ts
import { expect, test } from 'vitest';
import { recommendMode } from './probe';

const base = { chat: true, streaming: true, notes: [] };
test('recommendMode', () => {
  expect(recommendMode({ ...base, tools: { passed: 3, total: 3 }, json: { passed: 0, total: 5 } })).toBe('tools');
  expect(recommendMode({ ...base, tools: { passed: 2, total: 3 }, json: { passed: 5, total: 5 } })).toBe('json');
  expect(recommendMode({ ...base, tools: { passed: 0, total: 3 }, json: { passed: 4, total: 5 } })).toBe('off');
});
```

Tắt cơ chế tự thử lại của SDK (`maxRetries: 0`) để các test lỗi chạy nhanh.

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `pnpm test src/server/ai`
Expected: FAIL — không tìm thấy module.

- [ ] **Step 3: Cài đặt `provider.ts`, `mock.ts`, `fosta.ts`, `probe.ts`, `scripts/ai-probe.ts`**

- [ ] **Step 4: Chạy lại**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ai): add provider interface, mock, Fosta adapter and probe"
```

- [ ] **Step 6: ĐIỂM DỪNG — chạy probe với Fosta**

Hỏi owner: đã điền `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` vào `.env.local` chưa. Khi đã có:

Run: `pnpm ai:probe`
Expected: tạo `docs/ai-probe-report.md` và in ra mode khuyến nghị.

Báo kết quả cho owner. Commit báo cáo: `git add docs/ai-probe-report.md && git commit -m "docs: add AI provider probe report"`. Nếu `chat` trượt, dừng kế hoạch và báo owner cần đổi provider.

---

### Task 6: Kiểm tra RLS trên Supabase thật, tài liệu và bản deploy khung

**Files:**
- Create: `scripts/verify-rls.ts`, `vercel.json`
- Modify: `README.md`, `package.json` (script `verify:rls`)
- Test: `scripts/verify-rls.test.ts`

**Interfaces:**
- Consumes: `TABLE_NAMES`
- Produces: `checkRls(opts: { supabaseUrl: string; anonKey: string; tables: readonly string[]; fetch?: typeof fetch }): Promise<{ table: string; ok: boolean; detail: string }[]>` — với mỗi bảng gọi `GET {supabaseUrl}/rest/v1/{table}?select=*&limit=1` kèm header `apikey` và `Authorization: Bearer {anonKey}`; `ok` khi status không phải 2xx **hoặc** body là mảng rỗng.

- [ ] **Step 1: Viết test thất bại**

```ts
import { expect, test } from 'vitest';
import { checkRls } from './verify-rls';

const run = (responder: (table: string) => Response) =>
  checkRls({ supabaseUrl: 'https://x.supabase.co', anonKey: 'anon', tables: ['areas', 'tasks'],
    fetch: (async (url: any) => responder(String(url).split('/rest/v1/')[1].split('?')[0])) as typeof fetch });

test('mảng rỗng hoặc lỗi quyền là đạt', async () => {
  const out = await run((t) => t === 'areas' ? new Response('[]', { status: 200 }) : new Response('{"message":"permission denied"}', { status: 401 }));
  expect(out.map((r) => r.ok)).toEqual([true, true]);
});

test('trả về dòng dữ liệu là trượt và nêu tên bảng', async () => {
  const out = await run((t) => new Response(t === 'tasks' ? '[{"id":"1"}]' : '[]', { status: 200 }));
  expect(out.find((r) => r.table === 'tasks')).toMatchObject({ ok: false });
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `pnpm test scripts/verify-rls.test.ts`
Expected: FAIL — không tìm thấy module.

- [ ] **Step 3: Cài đặt script**

Phần chạy trực tiếp đọc `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY`, in bảng kết quả, thoát mã 1 nếu có bảng trượt. `vercel.json`: `{ "regions": ["sin1"] }`.

- [ ] **Step 4: Chạy lại**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS và build thành công.

- [ ] **Step 5: Viết phần cài đặt trong `README.md`**

Các mục: chạy local (`pnpm install`, `pnpm dev`), bảng lệnh, biến môi trường, và “Triển khai lần đầu” chép đúng các bước owner ở Step 7 dưới đây.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ops): add RLS verification script, Vercel region and setup docs"
```

- [ ] **Step 7: ĐIỂM DỪNG — owner triển khai bản khung**

Đưa cho owner danh sách sau và chờ họ báo xong từng mục. Không tự làm thay.

1. Supabase: tạo project ở khu vực Singapore. Trong Authentication, tắt cho phép người dùng mới đăng ký. Tạo một user bằng email của owner với mật khẩu do owner tự đặt.
2. Lấy `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, connection string dạng transaction pooler (cho `DATABASE_URL`) và dạng session pooler (cho `MIGRATION_DATABASE_URL`); đặt vào `.env.production.local` trên máy.
3. Chạy `pnpm db:migrate` với các biến đó, rồi `pnpm verify:rls`. Kỳ vọng: mọi bảng `ok` (criterion 13).
4. Đẩy code lên GitHub (chỉ khi owner yêu cầu), tạo project Vercel từ repo, điền đủ biến môi trường production gồm `APP_OWNER_EMAIL`, `DB_DRIVER=postgres`, `AUTH_MODE=supabase`, các biến `AI_*` và `AI_ACTION_MODE` theo báo cáo probe.
5. Mở bản deploy trên máy tính: chưa đăng nhập thì bị đưa về `/login`; đăng nhập được bằng tài khoản owner (criterion 1).
6. Trên iPhone: mở bản deploy bằng Safari, `Add to Home Screen`, mở từ màn hình chính, đăng nhập, đóng hẳn app rồi mở lại → vẫn còn đăng nhập.

**Xong Phase 0 khi:** `pnpm test` và `pnpm test:e2e` xanh; có `docs/ai-probe-report.md`; owner xác nhận sáu mục trên.
