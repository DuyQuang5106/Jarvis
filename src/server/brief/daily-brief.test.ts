import { beforeEach, expect, test, vi } from 'vitest';
import type { Db } from '@/db/client';
import { aiUsage, dailyBriefs } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { createMockProvider } from '../ai/mock';
import { BRIEF_PROMPT_MARKER } from '../ai/prompt';
import type { AiProvider, StreamRequest } from '../ai/provider';
import { AiProviderError } from '../errors';
import { createArea, updateArea } from '../services/areas';
import { documentService } from '../services/documents';
import { BRIEF_QUESTION, generateDailyBrief, getDailyBrief, parseBriefContent, type BriefDeps } from './daily-brief';

const NOW = new Date('2026-11-25T18:30:00Z'); // 01:30 on 26/11 in Asia/Ho_Chi_Minh
const DAY = '2026-11-26';
const manual = { origin: 'manual' as const };
let db: Db;
beforeEach(async () => { db = await createTestDb(); });

/** Counts calls and records requests; replies like the mock unless `reply` is given. */
function spyProvider(reply?: string) {
  const seen: StreamRequest[] = [];
  const provider: AiProvider = {
    stream(req) {
      seen.push(req);
      if (reply === undefined) return createMockProvider().stream(req);
      return (async function* () { yield { type: 'text' as const, delta: reply }; })();
    },
  };
  return { provider, seen };
}
const deps = (provider: AiProvider, more: Partial<BriefDeps> = {}): BriefDeps => ({ db, provider, dailyCap: 200, now: NOW, ...more });
const usage = async () => (await db.select().from(aiUsage))[0]?.count ?? 0;
const task = { title: 'Ôn chương 5', area: 'Algebra', why: 'Thi giữa kỳ còn 6 ngày.' };

// --- parse / validation ---

test('parse: object JSON trần, giữ upcoming và stale', () => {
  const raw = JSON.stringify({ focus: 'Tập trung Algebra.', tasks: [task], upcoming: 'Algebra 02/12', stale: 'Database' });
  expect(parseBriefContent(raw)).toEqual({ focus: 'Tập trung Algebra.', tasks: [task], upcoming: 'Algebra 02/12', stale: 'Database' });
});

test('parse: bỏ code fence và chữ thừa quanh object, dấu ngoặc trong chuỗi không làm lệch', () => {
  const body = JSON.stringify({ focus: 'Xem {mục} "này" trước }', tasks: [task] });
  expect(parseBriefContent(`Đây là bản tóm tắt:\n\`\`\`json\n${body}\n\`\`\`\nChúc bạn một ngày tốt {ok}.`)).toEqual({
    focus: 'Xem {mục} "này" trước }',
    tasks: [task],
  });
});

test('parse: quá 3 việc thì cắt còn 3; việc thứ tư sai dạng không làm hỏng cả bản', () => {
  const tasks = [1, 2, 3].map((n) => ({ ...task, title: `Việc ${n}` }));
  const out = parseBriefContent(JSON.stringify({ focus: 'x', tasks: [...tasks, { title: 4 }] }));
  expect(out?.tasks.map((t) => t.title)).toEqual(['Việc 1', 'Việc 2', 'Việc 3']);
});

test('parse: chuỗi quá dài bị cắt theo giới hạn, khoảng trắng và xuống dòng được gom lại', () => {
  const out = parseBriefContent({
    focus: `  ${'f'.repeat(300)}`,
    tasks: [{ title: 't'.repeat(100), area: ' Algebra\n', why: 'w'.repeat(200) }],
    upcoming: 'u'.repeat(300),
  })!;
  expect(out.focus).toBe(`${'f'.repeat(200)}…`);
  expect(out.tasks[0]).toEqual({ title: `${'t'.repeat(80)}…`, area: 'Algebra', why: `${'w'.repeat(140)}…` });
  expect(out.upcoming).toBe(`${'u'.repeat(200)}…`);
});

test('parse: upcoming/stale null hoặc rỗng thì bỏ hẳn', () => {
  expect(parseBriefContent({ focus: 'x', tasks: [task], upcoming: null, stale: '   ' })).toEqual({ focus: 'x', tasks: [task] });
});

test.each([
  ['không có object', 'Hôm nay bạn nên ôn Algebra.'],
  ['JSON hỏng', '{"focus": "x", "tasks": [}'],
  ['object chưa đóng', '{"focus": "x", "tasks": [{"title": "a"'],
  ['thiếu focus', JSON.stringify({ tasks: [task] })],
  ['focus rỗng', JSON.stringify({ focus: '  ', tasks: [task] })],
  ['không có việc nào', JSON.stringify({ focus: 'x', tasks: [] })],
  ['tasks không phải mảng', JSON.stringify({ focus: 'x', tasks: 'ôn bài' })],
  ['việc thiếu why', JSON.stringify({ focus: 'x', tasks: [{ title: 'a', area: 'b' }] })],
  ['việc có title không phải chuỗi', JSON.stringify({ focus: 'x', tasks: [{ ...task, title: 5 }] })],
])('parse: %s -> null', (_name, raw) => {
  expect(parseBriefContent(raw)).toBeNull();
});

// --- get vs generate ---

test('chưa có bản nào: getDailyBrief trả null', async () => {
  expect(await getDailyBrief(db, DAY)).toBeNull();
});

test('sinh bản đầu tiên: gọi AI một lần không kèm tool, tính một lượt vào trần, lưu theo ngày Việt Nam', async () => {
  await createArea(db, { kind: 'academic', name: 'Algebra', status: 'active' }, manual);
  await createArea(db, { kind: 'project', name: 'StewieSAT', status: 'blocked' }, manual);
  const { provider, seen } = spyProvider();
  const result = await generateDailyBrief(deps(provider));
  if (!result.ok) throw new Error(result.reason);
  expect(result.generated).toBe(true);
  expect(result.brief.day).toBe(DAY);
  expect(result.brief.content.focus).toContain('MOCK_BRIEF 2026-11-26');
  expect(result.brief.content.tasks.map((t) => t.area).sort()).toEqual(['Algebra', 'StewieSAT']);

  expect(seen).toHaveLength(1);
  expect(seen[0].tools).toBeUndefined();
  expect(seen[0].maxOutputTokens).toBe(800);
  expect(seen[0].messages.map((m) => m.role)).toEqual(['system', 'user']);
  expect(seen[0].messages[0].content).toContain(BRIEF_PROMPT_MARKER);
  expect(seen[0].messages[1].content).toBe(BRIEF_QUESTION);
  expect(await db.select().from(aiUsage)).toEqual([{ day: DAY, count: 1 }]);
  expect(await getDailyBrief(db, DAY)).toEqual(result.brief);
  expect(await getDailyBrief(db, '2026-11-25')).toBeNull();
});

test('context là phạm vi all: tài liệu trạng thái của từng mục vào prompt, mục không gửi cho AI thì không', async () => {
  const algebra = await createArea(db, { kind: 'academic', name: 'Algebra', status: 'active' }, manual);
  const secret = await createArea(db, { kind: 'project', name: 'Nhật ký riêng', status: 'active' }, manual);
  await updateArea(db, secret.id, { aiExcluded: true }, manual);
  await documentService.create(db, { areaId: algebra.id, title: '04_STATE', bodyMd: '# Tiến độ\nĐã học tới đầu chương 5.' }, manual);
  const { provider, seen } = spyProvider();
  const result = await generateDailyBrief(deps(provider));
  expect(result.ok).toBe(true);
  const system = seen[0].messages[0].content;
  expect(system).toContain('Đã học tới đầu chương 5.');
  expect(system).not.toContain('Nhật ký riêng');
  expect(system).not.toContain(algebra.id); // ids are aliased, as in a chat turn
});

test('gọi lần hai trong ngày: trả bản đã lưu, không gọi AI, không tính thêm lượt', async () => {
  await createArea(db, { kind: 'academic', name: 'Algebra', status: 'active' }, manual);
  const { provider, seen } = spyProvider();
  const first = await generateDailyBrief(deps(provider));
  const second = await generateDailyBrief(deps(provider, { now: new Date('2026-11-26T10:00:00Z') }));
  expect(second).toEqual({ ok: true, brief: (first as { brief: unknown }).brief, generated: false });
  expect(seen).toHaveLength(1);
  expect(await usage()).toBe(1);
});

test('sang ngày mới: sinh bản mới, bản hôm qua còn nguyên', async () => {
  await createArea(db, { kind: 'academic', name: 'Algebra', status: 'active' }, manual);
  const { provider, seen } = spyProvider();
  await generateDailyBrief(deps(provider));
  const next = await generateDailyBrief(deps(provider, { now: new Date('2026-11-26T18:00:00Z') })); // 01:00 on 27/11
  expect(next).toMatchObject({ ok: true, generated: true, brief: { day: '2026-11-27' } });
  expect(seen).toHaveLength(2);
  expect((await db.select().from(dailyBriefs)).map((r) => r.day).sort()).toEqual([DAY, '2026-11-27']);
});

test('force: gọi AI lại, ghi đè bản trong ngày, tính thêm một lượt', async () => {
  await createArea(db, { kind: 'academic', name: 'Algebra', status: 'active' }, manual);
  await generateDailyBrief(deps(spyProvider().provider));
  const fresh = spyProvider(JSON.stringify({ focus: 'Bản mới.', tasks: [task] }));
  const result = await generateDailyBrief(deps(fresh.provider, { now: new Date('2026-11-26T02:00:00Z') }), { force: true });
  expect(result).toMatchObject({ ok: true, generated: true, brief: { day: DAY, content: { focus: 'Bản mới.' } } });
  expect(fresh.seen).toHaveLength(1);
  expect(await usage()).toBe(2);
  expect(await db.select().from(dailyBriefs)).toHaveLength(1);
  expect((await getDailyBrief(db, DAY))?.content.focus).toBe('Bản mới.');
});

test('AI trả JSON hỏng: lỗi invalid, không lưu gì, lượt vẫn bị tính', async () => {
  await createArea(db, { kind: 'academic', name: 'Algebra', status: 'active' }, manual);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const result = await generateDailyBrief(deps(spyProvider('Hôm nay bạn nên ôn Algebra nhé.').provider));
  expect(result).toEqual({ ok: false, reason: 'invalid' });
  expect(await db.select().from(dailyBriefs)).toEqual([]);
  expect(await usage()).toBe(1);
  // Sizes only in the log, never the model's words.
  expect(JSON.stringify(warn.mock.calls)).not.toContain('Algebra');
  warn.mockRestore();
});

test('force mà AI trả JSON hỏng: bản cũ trong ngày được giữ nguyên', async () => {
  await createArea(db, { kind: 'academic', name: 'Algebra', status: 'active' }, manual);
  const first = await generateDailyBrief(deps(spyProvider().provider));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(await generateDailyBrief(deps(spyProvider('{"focus": 1}').provider), { force: true })).toEqual({ ok: false, reason: 'invalid' });
  warn.mockRestore();
  expect(await getDailyBrief(db, DAY)).toEqual((first as { brief: unknown }).brief);
});

test('provider lỗi: lỗi provider, không lưu gì', async () => {
  await createArea(db, { kind: 'academic', name: 'Algebra', status: 'active' }, manual);
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const failing: AiProvider = {
    async *stream() { throw new AiProviderError('boom', 502); },
  };
  expect(await generateDailyBrief(deps(failing))).toEqual({ ok: false, reason: 'provider' });
  expect(error).toHaveBeenCalledWith('daily brief failed', { name: 'AiProviderError', status: 502 });
  error.mockRestore();
  expect(await db.select().from(dailyBriefs)).toEqual([]);
});

test('chạm trần trong ngày: lỗi cap, không gọi AI', async () => {
  await createArea(db, { kind: 'academic', name: 'Algebra', status: 'active' }, manual);
  await db.insert(aiUsage).values({ day: DAY, count: 3 });
  const { provider, seen } = spyProvider();
  expect(await generateDailyBrief(deps(provider, { dailyCap: 3 }))).toEqual({ ok: false, reason: 'cap' });
  expect(seen).toHaveLength(0);
  expect(await usage()).toBe(3);
});

test('workspace trống (hoặc chỉ có mục không gửi cho AI): empty, không gọi AI, không tính lượt', async () => {
  const { provider, seen } = spyProvider();
  expect(await generateDailyBrief(deps(provider))).toEqual({ ok: false, reason: 'empty' });
  const secret = await createArea(db, { kind: 'project', name: 'Nhật ký riêng', status: 'active' }, manual);
  await updateArea(db, secret.id, { aiExcluded: true }, manual);
  expect(await generateDailyBrief(deps(provider))).toEqual({ ok: false, reason: 'empty' });
  expect(seen).toHaveLength(0);
  expect(await usage()).toBe(0);
});

test('hai lần sinh đồng thời: chỉ một lần gọi AI, cả hai nhận cùng một bản', async () => {
  await createArea(db, { kind: 'academic', name: 'Algebra', status: 'active' }, manual);
  const { provider, seen } = spyProvider();
  const [a, b] = await Promise.all([generateDailyBrief(deps(provider)), generateDailyBrief(deps(provider))]);
  expect(a).toEqual(b);
  expect(a.ok).toBe(true);
  expect(seen).toHaveLength(1);
  expect(await usage()).toBe(1);
  // The guard is released afterwards: a later forced run calls the AI again.
  await generateDailyBrief(deps(provider), { force: true });
  expect(seen).toHaveLength(2);
});

test('dòng đã lưu mà không đọc được (sai dạng): coi như chưa có và sinh lại', async () => {
  await createArea(db, { kind: 'academic', name: 'Algebra', status: 'active' }, manual);
  await db.insert(dailyBriefs).values({ day: DAY, content: { focus: '' } });
  expect(await getDailyBrief(db, DAY)).toBeNull();
  const result = await generateDailyBrief(deps(spyProvider().provider));
  expect(result).toMatchObject({ ok: true, generated: true });
});
