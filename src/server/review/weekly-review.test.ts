import { beforeEach, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { activityLogs, aiUsage, checkins, conversations, documents, documentVersions, messages, pendingActions, settings, weeklyReviews } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { allowsProposal } from '../chat/intent';
import { runChatTurn, WEEKLY_REVIEW_MAX_OUTPUT_TOKENS, type TurnEvent } from '../chat/run-turn';
import { MOCK_WEEKLY_REVIEW, createMockProvider } from '../ai/mock';
import { WEEKLY_REVIEW_MARKER } from '../ai/prompt';
import type { AiProvider, StreamRequest } from '../ai/provider';
import { approvePendingAction } from '../proposals/resolve';
import type { StoredProposal } from '../proposals/schema';
import { createArea } from '../services/areas';
import { documentService } from '../services/documents';
import { getSettings } from '../services/settings';
import { WEEK_LIMITS, collectWeekActivity, datedSections, datesIn, weekActivityBlock } from './week-activity';
import { generateWeeklyReview, getWeeklyReviewCard, reviewHighlights, type WeeklyReviewDeps } from './weekly-review';
import { weeklyReviewMessage } from '@/lib/weekly-review-message';

const TZ = 'Asia/Ho_Chi_Minh';
/** Week of Monday 10/03/2025, far from the real clock (rows written at the real time never fall in it). */
const WEEK = '2025-03-10';
/** Sunday 16/03 19:00 in Asia/Ho_Chi_Minh: the week is ready to review. */
const NOW = new Date('2025-03-16T12:00:00Z');
const IN_WEEK = new Date('2025-03-12T02:00:00Z'); // Wed 09:00
const manual = { origin: 'manual' as const };

const STATE = [
  '---',
  'document_type: current_state',
  'generated_date: 2025-03-11',
  '---',
  '# Trạng thái',
  '',
  '## Tiến độ',
  '',
  '- 2025-03-11: học xong chương 4, điểm bài kiểm tra 8/10',
  '- 2025-03-13: học chương 5',
  '- 2025-03-02: tuần trước',
  '',
  '## Quyết định',
  '',
  '- 2025-03-12: bỏ qua phần logic',
  '',
  '## Khác',
  '',
  'Giữ nguyên.',
  '',
].join('\n');

let db: Db;
let areaId: string;
let stateId: string;

beforeEach(async () => {
  db = await createTestDb();
  areaId = (await createArea(db, { kind: 'academic', name: 'Algebra', status: 'active' }, manual)).id;
  stateId = (await documentService.create(db, { areaId, title: '04_STATE.md', bodyMd: STATE }, manual)).id;
});

function spyProvider() {
  const seen: StreamRequest[] = [];
  const provider: AiProvider = {
    stream(req) {
      seen.push(req);
      return createMockProvider().stream(req);
    },
  };
  return { provider, seen };
}
const deps = (provider: AiProvider, more: Partial<WeeklyReviewDeps> = {}): WeeklyReviewDeps => ({
  db, provider, actionMode: 'tools', dailyCap: 200, now: NOW, tz: TZ, ...more,
});

async function userMessage(content: string, createdAt: Date) {
  const [c] = await db.insert(conversations).values({ title: 't' }).returning();
  await db.insert(messages).values({ conversationId: c.id, role: 'user', content, createdAt });
}

const bodyOf = async (id: string) => (await db.select().from(documents).where(eq(documents.id, id)))[0].bodyMd;

// --- week data ---

test('datesIn và datedSections: ngày ISO và dd/mm/yyyy, mục lá, bỏ frontmatter', () => {
  expect(datesIn('- 2025-03-11 và 12/3/2025')).toEqual(['2025-03-11', '2025-03-12']);
  const sections = datedSections(STATE, '2025-03-10', '2025-03-16');
  expect(sections.map((s) => [s.heading, s.count, s.leaf])).toEqual([
    ['Trạng thái', 0, false],
    ['Tiến độ', 2, true],
    ['Quyết định', 1, true],
    ['Khác', 0, true],
  ]);
});

test('collectWeekActivity: log theo mục (bỏ migration/seed), check-in, tin nhắn, tài liệu, dòng tiến độ có ngày và mục nên nén', async () => {
  await userMessage('Ôn chương 5 Algebra', IN_WEEK);
  await userMessage('Buổi sáng 12/03 tôi đã làm: làm bài tập', IN_WEEK);
  await userMessage(weeklyReviewMessage('03/03–09/03'), IN_WEEK);
  await userMessage('Tin nhắn tuần trước', new Date('2025-03-05T02:00:00Z'));
  const log = { areaId, entityType: 'area' as const, entityId: areaId };
  await db.insert(activityLogs).values([
    { ...log, action: 'progress', afterJson: { text: 'Đã học chương 5.' }, origin: 'manual', createdAt: IN_WEEK },
    { ...log, action: 'update', afterJson: { name: 'Algebra' }, origin: 'migration', createdAt: IN_WEEK },
    { ...log, action: 'create', afterJson: { name: 'Algebra' }, origin: 'seed', createdAt: IN_WEEK },
  ]);
  await db.insert(checkins).values({ day: '2025-03-12', slot: 'morning', status: 'recorded', summary: { summary: 'Ôn chương 5.', items: [], covers: [] } });
  await db.update(documents).set({ updatedAt: IN_WEEK }).where(eq(documents.id, stateId));

  const w = await collectWeekActivity(db, WEEK, TZ);
  expect(w.items.map((i) => i.kind).sort()).toEqual(['document', 'log', 'message', 'message']);
  expect(w.checkins).toEqual([{ label: 'sáng 12/03', status: 'recorded', summary: 'Ôn chương 5.' }]);
  expect(w.candidates.map((s) => `${s.document} › ${s.heading}`)).toEqual(['04_STATE.md › Tiến độ']);
  const block = weekActivityBlock(w, TZ);
  expect(block).toContain('### Algebra');
  expect(block).toContain('Ghi nhận tiến độ: Đã học chương 5.');
  expect(block).not.toContain('Tin nhắn tuần trước');
  expect(block).not.toContain('03/03–09/03');
  expect(block).toContain('- sáng 12/03: đã ghi lại · Ôn chương 5.');
  expect(block).toContain('Buổi sáng 12/03 tôi đã làm: làm bài tập');
  expect(block).toContain('- Algebra · 04_STATE.md › Tiến độ: 2 dòng');
  expect(block).toContain('- 2025-03-11: học xong chương 4, điểm bài kiểm tra 8/10');
  expect(block).not.toContain('tuần trước'.concat(':'));
  expect(block.indexOf('## Mục nên nén')).toBeGreaterThan(0);
});

test(`collectWeekActivity: tối đa ${WEEK_LIMITS.message} tin nhắn, mỗi tin ${WEEK_LIMITS.text} ký tự; mục không gửi cho AI bị bỏ`, async () => {
  const [c] = await db.insert(conversations).values({ title: 't' }).returning();
  await db.insert(messages).values(
    Array.from({ length: 70 }, (_, i) => ({ conversationId: c.id, role: 'user' as const, content: `tin ${i} ${'x'.repeat(300)}`, createdAt: new Date(IN_WEEK.getTime() + i * 60_000) })),
  );
  const secret = await createArea(db, { kind: 'project', name: 'Bí mật', status: 'active', aiExcluded: true }, manual);
  await documentService.create(db, { areaId: secret.id, title: 'STATE.md', bodyMd: '## Tiến độ\n\n- 2025-03-11: a\n- 2025-03-12: b\n' }, manual);
  const w = await collectWeekActivity(db, WEEK, TZ);
  const msgs = w.items.filter((i) => i.kind === 'message');
  expect(msgs).toHaveLength(WEEK_LIMITS.message);
  expect(Math.max(...msgs.map((m) => m.text.length))).toBeLessThanOrEqual(WEEK_LIMITS.text + 1); // plus `…`
  expect(w.sections.map((s) => s.area)).toEqual(['Algebra', 'Algebra']);
});

// --- generation ---

test('sinh tổng kết: cuộc chat riêng, bản tổng kết + replace_section chờ duyệt, KHÔNG ghi gì vào tài liệu', async () => {
  await userMessage('Ôn chương 5 Algebra', IN_WEEK);
  const { provider, seen } = spyProvider();
  const result = await generateWeeklyReview(deps(provider), { weekStart: WEEK });
  if (!result.ok) throw new Error(result.error);
  expect(result.generated).toBe(true);
  expect(result.review).toMatchObject({ weekStart: WEEK, label: '10/03–16/03' });
  expect(result.review.highlights).toEqual([MOCK_WEEKLY_REVIEW, 'MOCK_WEEKLY: ghi gọn 04_STATE.md › Tiến độ.']);

  expect(seen).toHaveLength(1);
  const system = seen[0].messages[0].content;
  expect(system).toContain(WEEKLY_REVIEW_MARKER);
  expect(system).toMatch(/<\/workspace_state>\n\n<week_activity>/);
  expect(seen[0].maxOutputTokens).toBe(WEEKLY_REVIEW_MAX_OUTPUT_TOKENS);
  // A long text before the proposal: the `<proposed_actions>` block, not the tool.
  expect(seen[0].tools).toBeUndefined();
  expect(system).toContain('<proposed_actions>');

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, result.review.conversationId));
  expect(conv.title).toBe('Tổng kết tuần 10/03–16/03');
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, conv.id));
  expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
  expect(allowsProposal(msgs[0].content)).toBe(true);
  expect(msgs[1].content).toContain('## Trọng tâm tuần sau');

  const [pending] = await db.select().from(pendingActions);
  expect(pending.id).toBe(result.review.pendingActionId);
  expect((pending.actionsJson as StoredProposal).actions.map((a) => a.action.type)).toEqual(['replace_section']);
  expect(await bodyOf(stateId)).toBe(STATE); // nothing written before approval
  expect(await db.select().from(weeklyReviews)).toEqual([
    expect.objectContaining({ weekStart: WEEK, conversationId: conv.id, pendingActionId: pending.id }),
  ]);
  expect((await db.select().from(aiUsage))[0].count).toBe(1);
});

test('mỗi tuần một bản: gọi lại hoặc song song không sinh thêm; tạo lại có chủ ý thì thay bản cũ', async () => {
  const { provider, seen } = spyProvider();
  const [a, b] = await Promise.all([generateWeeklyReview(deps(provider), { weekStart: WEEK }), generateWeeklyReview(deps(provider), { weekStart: WEEK })]);
  expect(seen).toHaveLength(1);
  expect(a).toEqual(b);
  const again = await generateWeeklyReview(deps(provider), { weekStart: WEEK });
  expect(again).toMatchObject({ ok: true, generated: false });
  expect(seen).toHaveLength(1);

  const redo = await generateWeeklyReview(deps(provider), { weekStart: WEEK, regenerate: true });
  if (!redo.ok || !a.ok) throw new Error('expected reviews');
  expect(seen).toHaveLength(2);
  expect(redo.review.conversationId).not.toBe(a.review.conversationId);
  expect(await db.select().from(weeklyReviews)).toHaveLength(1);
  const statuses = Object.fromEntries((await db.select().from(pendingActions)).map((p) => [p.id, p.status]));
  expect(statuses).toEqual({ [a.review.pendingActionId!]: 'superseded', [redo.review.pendingActionId!]: 'pending' });
});

test('duyệt replace_section: tài liệu ngắn lại, các mục khác giữ nguyên, bản cũ khôi phục được từ lịch sử phiên bản', async () => {
  const result = await generateWeeklyReview(deps(createMockProvider()), { weekStart: WEEK });
  if (!result.ok) throw new Error(result.error);
  const [pending] = await db.select().from(pendingActions);
  const approved = await approvePendingAction(db, pending.id, { selectedKeys: (pending.actionsJson as StoredProposal).actions.map((a) => a.key) });
  expect(approved.status).toBe('applied');
  const after = await bodyOf(stateId);
  expect(after).toContain('MOCK_WEEKLY: gộp 2 dòng tiến độ của tuần.');
  expect(after).not.toContain('học chương 5');
  expect(after).toContain('- 2025-03-12: bỏ qua phần logic');
  expect(after).toContain('Giữ nguyên.');
  expect(after.length).toBeLessThan(STATE.length);

  const versions = await db.select().from(documentVersions).where(eq(documentVersions.documentId, stateId)).orderBy(documentVersions.revision);
  expect(versions.map((v) => [v.revision, v.origin])).toEqual([[1, 'manual'], [2, 'ai_approved']]);
  expect(versions[0].bodyMd).toBe(STATE);
  await documentService.restoreVersion(db, stateId, versions[0].id, manual);
  expect(await bodyOf(stateId)).toBe(STATE);
});

test('applyRevision: tài liệu chưa có phiên bản cho bản hiện tại thì được lưu một bản trước khi sửa', async () => {
  await db.delete(documentVersions).where(eq(documentVersions.documentId, stateId));
  await documentService.applyRevision(db, stateId, 1, { title: '04_STATE.md', bodyMd: '# Mới\n' }, { origin: 'ai_approved' });
  const versions = await db.select().from(documentVersions).where(eq(documentVersions.documentId, stateId)).orderBy(documentVersions.revision);
  expect(versions.map((v) => [v.revision, v.bodyMd])).toEqual([[1, STATE], [2, '# Mới\n']]);
});

test('lỗi provider: không lưu dòng tổng kết, lần sau thử lại được', async () => {
  const failing: AiProvider = { stream: () => (async function* () { throw new Error('down'); })() };
  expect(await generateWeeklyReview(deps(failing), { weekStart: WEEK })).toMatchObject({ ok: false, reason: 'provider' });
  expect(await db.select().from(weeklyReviews)).toEqual([]);
  expect(await generateWeeklyReview(deps(createMockProvider(), { dailyCap: 1 }), { weekStart: WEEK })).toMatchObject({ ok: false, reason: 'cap' });
});

// --- normal turns unchanged ---

test('lượt chat thường không đổi: không có luật tổng kết, không có <week_activity>, 4000 token, tiêu đề theo tin nhắn, giữ mọi loại hành động', async () => {
  const { provider, seen } = spyProvider();
  const events: TurnEvent[] = [];
  for await (const e of runChatTurn({ db, provider, actionMode: 'tools', dailyCap: 200, now: NOW }, { message: 'MOCK_DECISION Algebra: chốt bỏ phần logic', scope: { mode: 'auto' } })) events.push(e);
  expect(events.map((e) => e.type)).toContain('proposal');
  const system = seen[0].messages[0].content;
  expect(system).not.toContain(WEEKLY_REVIEW_MARKER);
  expect(system).not.toContain('week_activity');
  expect(system.endsWith('</workspace_state>')).toBe(true);
  expect(seen[0].maxOutputTokens).toBe(4000);
  expect((await db.select().from(conversations))[0].title).toBe('MOCK_DECISION Algebra: chốt bỏ phần logic');
  const [pending] = await db.select().from(pendingActions);
  expect((pending.actionsJson as StoredProposal).actions.map((a) => a.action.type)).toEqual(['append_to_document']);
});

test('lượt tổng kết chỉ giữ replace_section: hành động khác bị bỏ và báo', async () => {
  const provider: AiProvider = {
    async *stream() {
      const proposal = {
        summary: 'Ghi gọn',
        actions: [
          { type: 'add_progress_log', areaId, text: 'x' },
          { type: 'replace_section', documentId: stateId, heading: 'Tiến độ', markdown: '- 2025-03-11–13: chương 4 (8/10) và 5' },
        ],
      };
      yield { type: 'text', delta: `## Ý chính\n- Tuần tốt.<proposed_actions>${JSON.stringify(proposal)}</proposed_actions>` };
    },
  };
  const result = await generateWeeklyReview(deps(provider), { weekStart: WEEK });
  if (!result.ok) throw new Error(result.error);
  const [pending] = await db.select().from(pendingActions);
  expect((pending.actionsJson as StoredProposal).actions.map((a) => a.action.type)).toEqual(['replace_section']);
  const reply = (await db.select().from(messages)).find((m) => m.role === 'assistant')!;
  expect(reply.content).toContain('Đã bỏ 1 thay đổi');
});

// --- card ---

test('thẻ: chỉ mời tuần có hoạt động; sẵn sàng khi đề xuất còn chờ; hết thẻ sau khi duyệt; tắt được', async () => {
  expect(await getWeeklyReviewCard(db, NOW, TZ)).toBeNull(); // no activity that week
  await userMessage('Ôn chương 5 Algebra', IN_WEEK);
  expect(await getWeeklyReviewCard(db, NOW, TZ)).toEqual({ state: 'pending', weekStart: WEEK, label: '10/03–16/03' });
  // Sunday 17:59: still the week before (no activity there).
  expect(await getWeeklyReviewCard(db, new Date('2025-03-16T10:59:00Z'), TZ)).toBeNull();
  // Tuesday after: the week just ended is still offered.
  expect(await getWeeklyReviewCard(db, new Date('2025-03-18T03:00:00Z'), TZ)).toMatchObject({ state: 'pending', weekStart: WEEK });

  const result = await generateWeeklyReview(deps(createMockProvider()), { weekStart: WEEK });
  if (!result.ok) throw new Error(result.error);
  expect(await getWeeklyReviewCard(db, NOW, TZ)).toMatchObject({ state: 'ready', conversationId: result.review.conversationId });
  const [pending] = await db.select().from(pendingActions);
  await approvePendingAction(db, pending.id, { selectedKeys: (pending.actionsJson as StoredProposal).actions.map((a) => a.key) });
  expect(await getWeeklyReviewCard(db, NOW, TZ)).toBeNull();

  await getSettings(db);
  await db.update(settings).set({ preferencesJson: { weeklyReviewsEnabled: false } });
  expect(await getWeeklyReviewCard(db, new Date('2025-03-23T12:00:00Z'), TZ)).toBeNull();
});

test('reviewHighlights: các dòng dưới "Ý chính", tối đa 3, bỏ định dạng', () => {
  expect(reviewHighlights('## Ý chính\n- **Algebra**: xong chương 5\n- B\n- C\n- D\n## Khác\n- E')).toEqual(['Algebra: xong chương 5', 'B', 'C']);
  expect(reviewHighlights('Mở đầu\n\n1. Một\n2. Hai')).toEqual(['Một', 'Hai']);
  expect(reviewHighlights('')).toEqual([]);
});
