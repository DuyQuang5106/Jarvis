import { beforeEach, expect, test, vi } from 'vitest';
import type { Db } from '@/db/client';
import { activityLogs, aiUsage, checkins, conversations, dailyBriefs, documents, messages, pendingActions } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { answerMessage, recordMessage } from '@/lib/checkin-message';
import { DEFAULT_DAY_SLOTS } from '@/lib/day-slots';
import { allowsProposal } from '../chat/intent';
import { MOCK_CHECKIN_SUMMARY, createMockProvider } from '../ai/mock';
import { CHECKIN_PROMPT_MARKER } from '../ai/prompt';
import type { AiProvider, StreamRequest } from '../ai/provider';
import { AiProviderError } from '../errors';
import { createArea, updateArea } from '../services/areas';
import { ACTIVITY_LIMIT, ACTIVITY_TEXT_MAX, slotActivity } from './activity';
import {
  CHECKIN_MAX_OUTPUT_TOKENS,
  getOrCreateCheckin,
  getPendingCheckin,
  loadCheckinConfig,
  parseCheckinSummary,
  resolveCheckin,
  type CheckinConfig,
  type CheckinDeps,
} from './checkin';

// Fixed dates far from the real clock: rows the services write at the real time never fall in these slots.
const DAY = '2025-03-10';
const PREV = '2025-03-09';
const at = (iso: string) => new Date(iso);
/** 11:30 on 10/03 in Asia/Ho_Chi_Minh: the morning (06–11) has just ended. */
const NOW = at('2025-03-10T04:30:00Z');
/** 09:00 on 10/03: inside the morning. */
const IN_MORNING = at('2025-03-10T02:00:00Z');
const manual = { origin: 'manual' as const };
const cfg: CheckinConfig = { checkinsEnabled: true, daySlots: DEFAULT_DAY_SLOTS, tz: 'Asia/Ho_Chi_Minh' };

let db: Db;
beforeEach(async () => { db = await createTestDb(); });

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
const deps = (provider: AiProvider, more: Partial<CheckinDeps> = {}): CheckinDeps => ({ db, provider, dailyCap: 200, now: NOW, cfg, ...more });
const usage = async () => (await db.select().from(aiUsage))[0]?.count ?? 0;

async function userMessage(content: string, createdAt: Date) {
  const [c] = await db.insert(conversations).values({ title: 't' }).returning();
  await db.insert(messages).values({ conversationId: c.id, role: 'user', content, createdAt });
}

/** The earlier slots of the 24-hour window, handled: only the morning of DAY is left. */
async function handleEarlierSlots() {
  await db.insert(checkins).values(['noon', 'afternoon', 'evening'].map((slot) => ({ day: PREV, slot: slot as 'noon', status: 'skipped' as const })));
}

// --- slotActivity ---

test('slotActivity: tin nhắn, log tiến độ, tài liệu sửa và đề xuất đã duyệt trong buổi; bỏ log migration/seed và ngoài buổi', async () => {
  const algebra = await createArea(db, { kind: 'academic', name: 'Algebra', status: 'active' }, manual);
  const start = at('2025-03-09T23:00:00Z');
  const end = at('2025-03-10T04:00:00Z');
  await userMessage('Làm xong bài tập chương 5 Algebra', IN_MORNING);
  await userMessage('Tin nhắn hôm trước', at('2025-03-09T10:00:00Z'));
  const log = { areaId: algebra.id, entityType: 'area' as const, entityId: algebra.id };
  await db.insert(activityLogs).values([
    { ...log, action: 'progress', afterJson: { text: 'Đã học tới chương 5.' }, origin: 'manual', createdAt: at('2025-03-10T02:10:00Z') },
    { ...log, action: 'update', afterJson: { name: 'Algebra' }, origin: 'migration', createdAt: at('2025-03-10T02:20:00Z') },
    { ...log, action: 'create', afterJson: { name: 'Algebra' }, origin: 'seed', createdAt: at('2025-03-10T02:30:00Z') },
  ]);
  const [edited] = await db
    .insert(documents)
    .values({ areaId: algebra.id, title: '04_STATE.md', updatedAt: at('2025-03-10T03:00:00Z') })
    .returning();
  // Imported in the same slot: its `updated_at` moved, but only a migration log exists, so it is not work.
  const [imported] = await db
    .insert(documents)
    .values({ areaId: algebra.id, title: '05_LOG.md', updatedAt: at('2025-03-10T03:05:00Z') })
    .returning();
  const docLog = { areaId: algebra.id, entityType: 'document' as const, action: 'update' as const };
  await db.insert(activityLogs).values([
    { ...docLog, entityId: edited.id, origin: 'manual', createdAt: at('2025-03-10T03:00:00Z') },
    { ...docLog, entityId: imported.id, origin: 'migration', createdAt: at('2025-03-10T03:05:00Z') },
  ]);
  await db.insert(pendingActions).values({
    source: 'chat', actionsJson: { summary: 'Cập nhật tiến độ Algebra', actions: [] }, status: 'applied', resolvedAt: at('2025-03-10T03:10:00Z'),
  });
  await db.insert(pendingActions).values({
    source: 'chat', actionsJson: { summary: 'Bị từ chối', actions: [] }, status: 'rejected', resolvedAt: at('2025-03-10T03:20:00Z'),
  });

  const { items, hasActivity } = await slotActivity(db, start, end);
  expect(hasActivity).toBe(true);
  expect(items.map((i) => [i.kind, i.area, i.text])).toEqual([
    ['message', null, 'Làm xong bài tập chương 5 Algebra'],
    ['log', 'Algebra', 'Ghi nhận tiến độ: Đã học tới chương 5.'],
    ['document', 'Algebra', 'Sửa tài liệu “04_STATE.md”'],
    ['proposal', null, 'Duyệt đề xuất: Cập nhật tiến độ Algebra'],
  ]);
});

test('slotActivity: không gửi gì của mục không gửi cho AI, bỏ tin nhắn do thẻ check-in gửi', async () => {
  const secret = await createArea(db, { kind: 'project', name: 'Nhật ký riêng', status: 'active' }, manual);
  await updateArea(db, secret.id, { aiExcluded: true }, manual);
  await userMessage('Hôm nay viết Nhật ký riêng', IN_MORNING);
  await userMessage(recordMessage('tối 09/03', [{ area: '', text: 'Đọc sách' }]), IN_MORNING);
  await userMessage(answerMessage('tối 09/03', 'Đọc sách'), IN_MORNING);
  await db.insert(activityLogs).values({
    areaId: secret.id, entityType: 'area', entityId: secret.id, action: 'progress', afterJson: { text: 'x' }, origin: 'manual', createdAt: IN_MORNING,
  });
  await db.insert(documents).values({ areaId: secret.id, title: 'riêng.md', updatedAt: IN_MORNING });
  expect(await slotActivity(db, at('2025-03-09T23:00:00Z'), at('2025-03-10T04:00:00Z'))).toEqual({ items: [], hasActivity: false });
});

test(`slotActivity: tối đa ${ACTIVITY_LIMIT} mục (mới nhất), mỗi mục cắt ${ACTIVITY_TEXT_MAX} ký tự`, async () => {
  const [c] = await db.insert(conversations).values({ title: 't' }).returning();
  await db.insert(messages).values(
    Array.from({ length: 40 }, (_, i) => ({
      conversationId: c.id, role: 'user' as const, content: `${i} ${'x'.repeat(300)}`, createdAt: new Date(IN_MORNING.getTime() + i * 60_000),
    })),
  );
  const { items } = await slotActivity(db, at('2025-03-09T23:00:00Z'), at('2025-03-10T04:00:00Z'));
  expect(items).toHaveLength(ACTIVITY_LIMIT);
  expect(items[0].text.startsWith('10 ')).toBe(true);
  expect(items.at(-1)!.text.startsWith('39 ')).toBe(true);
  expect(items.every((i) => i.text.length <= ACTIVITY_TEXT_MAX + 1)).toBe(true);
});

// --- pending card ---

test('buổi không có hoạt động: thẻ hỏi, không gọi AI, không tính lượt, gợi ý từ thẻ định hướng hôm đó', async () => {
  await handleEarlierSlots();
  await db.insert(dailyBriefs).values({
    day: DAY,
    content: { focus: 'x', tasks: [1, 2, 3, 4].map((n) => ({ title: `Việc ${n}`, area: 'Algebra', why: 'y' })) },
  });
  const { provider, seen } = spyProvider();
  const result = await getOrCreateCheckin(deps(provider));
  expect(result).toEqual({
    ok: true,
    generated: false,
    checkin: {
      day: DAY,
      slots: [{ day: DAY, slot: 'morning' }],
      label: 'Sáng nay',
      phrase: 'sáng 10/03',
      hasActivity: false,
      suggestions: ['Việc 1', 'Việc 2', 'Việc 3'],
    },
  });
  expect(seen).toHaveLength(0);
  expect(await usage()).toBe(0);
  expect(await db.select().from(checkins).then((r) => r.filter((x) => x.day === DAY))).toEqual([]);
});

test('buổi có hoạt động: một lần gọi AI không tool, chỉ nạp hoạt động và tên mục; mở lại không sinh lại', async () => {
  await handleEarlierSlots();
  await createArea(db, { kind: 'academic', name: 'Algebra', status: 'active', summary: 'TÓM_TẮT_KHÔNG_GỬI' }, manual);
  await createArea(db, { kind: 'project', name: 'StewieSAT', status: 'active' }, manual);
  await userMessage('Làm xong bài tập chương 5 Algebra', IN_MORNING);
  const { provider, seen } = spyProvider();
  const first = await getOrCreateCheckin(deps(provider));
  expect(first).toMatchObject({
    ok: true,
    generated: true,
    checkin: { label: 'Sáng nay', hasActivity: true, summary: { summary: MOCK_CHECKIN_SUMMARY, items: [{ area: 'Algebra', text: 'Làm việc với Algebra' }] } },
  });
  expect(seen).toHaveLength(1);
  const req = seen[0];
  expect(req.tools).toBeUndefined();
  expect(req.maxOutputTokens).toBe(CHECKIN_MAX_OUTPUT_TOKENS);
  expect(req.messages[0].content).toContain(CHECKIN_PROMPT_MARKER);
  expect(req.messages[0].content).toContain('Algebra\nStewieSAT');
  expect(req.messages[1].content).toContain('Làm xong bài tập chương 5 Algebra');
  expect(JSON.stringify(req.messages)).not.toContain('TÓM_TẮT_KHÔNG_GỬI');
  expect(JSON.stringify(req.messages)).not.toContain('workspace_state');
  expect(await usage()).toBe(1);
  expect(await db.select().from(checkins).then((r) => r.find((x) => x.day === DAY))).toMatchObject({ slot: 'morning', status: 'pending' });

  const again = await getOrCreateCheckin(deps(provider, { now: at('2025-03-10T05:00:00Z') }));
  expect(again).toMatchObject({ ok: true, generated: false, checkin: { summary: { summary: MOCK_CHECKIN_SUMMARY } } });
  expect(seen).toHaveLength(1);
  expect(await getPendingCheckin(db, NOW, cfg)).toEqual((first as { checkin: unknown }).checkin);
});

test('hai yêu cầu song song: chỉ một lần gọi AI', async () => {
  await handleEarlierSlots();
  await userMessage('Ôn chương 5', IN_MORNING);
  const { provider, seen } = spyProvider();
  const [a, b] = await Promise.all([getOrCreateCheckin(deps(provider)), getOrCreateCheckin(deps(provider))]);
  expect(a).toEqual(b);
  expect(seen).toHaveLength(1);
  expect(await usage()).toBe(1);
});

test('lần dùng đầu tiên (chưa có dòng check-in nào): chỉ các buổi đã kết thúc hôm nay', async () => {
  await userMessage('Tối qua ôn chương 4', at('2025-03-09T12:00:00Z')); // 19:00 on 09/03
  expect(await getPendingCheckin(db, NOW, cfg)).toMatchObject({ label: 'Sáng nay', slots: [{ day: DAY, slot: 'morning' }], hasActivity: false });
  // 06:30 on 10/03: nothing has ended today yet, so no card at all (not last evening).
  expect(await getPendingCheckin(db, at('2025-03-09T23:30:00Z'), cfg)).toBeNull();
  // Once a slot is handled, yesterday's slots of that first day are never asked about later either.
  await resolveCheckin(db, NOW, cfg, 'skip', [{ day: DAY, slot: 'morning' }]);
  expect(await getPendingCheckin(db, at('2025-03-10T06:05:00Z'), cfg)).toMatchObject({ label: 'Trưa nay' });
  expect(await getPendingCheckin(db, at('2025-03-11T00:30:00Z'), cfg)).toMatchObject({ label: 'Trưa, chiều và tối qua' });
});

test('lỡ nhiều buổi: gộp thành một thẻ, tóm tắt một lần cho cả các buổi', async () => {
  // Check-ins in use since 09/03.
  await db.insert(checkins).values({ day: PREV, slot: 'morning', status: 'skipped', createdAt: at('2025-03-09T04:00:00Z') });
  await userMessage('Tối qua ôn chương 4', at('2025-03-09T12:00:00Z')); // 19:00 on 09/03
  await userMessage('Sáng nay ôn chương 5', IN_MORNING);
  const { provider, seen } = spyProvider();
  const result = await getOrCreateCheckin(deps(provider));
  expect(result).toMatchObject({
    ok: true,
    checkin: { label: 'Trưa, chiều và tối qua và sáng nay', phrase: 'trưa, chiều và tối 09/03 và sáng 10/03', hasActivity: true },
  });
  expect(seen).toHaveLength(1);
  expect(seen[0].messages[1].content).toContain('Tối qua ôn chương 4');
  expect(seen[0].messages[1].content).toContain('Sáng nay ôn chương 5');
  expect(await db.select().from(checkins)).toHaveLength(5);
});

test('mỗi buổi tối đa một thẻ: xử lý xong thì không hiện lại; buổi sau mới có thẻ mới', async () => {
  await userMessage('Ôn chương 5', IN_MORNING);
  const { provider } = spyProvider();
  const first = await getOrCreateCheckin(deps(provider));
  if (!first.ok || !first.checkin) throw new Error('expected a card');
  await resolveCheckin(db, NOW, cfg, 'record', first.checkin.slots);
  expect(await getPendingCheckin(db, NOW, cfg)).toBeNull();
  expect(await getPendingCheckin(db, at('2025-03-10T05:59:00Z'), cfg)).toBeNull(); // 12:59, noon not over
  // 13:05: only the noon slot, which had no activity.
  expect(await getPendingCheckin(db, at('2025-03-10T06:05:00Z'), cfg)).toMatchObject({ label: 'Trưa nay', hasActivity: false });
  const statuses = (await db.select().from(checkins)).map((r) => `${r.day}:${r.slot}=${r.status}`).sort();
  // First use: only today's morning was on the card.
  expect(statuses).toEqual([`${DAY}:morning=recorded`]);
});

test('buổi mới kết thúc khi tóm tắt cũ còn chờ: sinh lại cho cả các buổi', async () => {
  await handleEarlierSlots();
  await userMessage('Ôn chương 5', IN_MORNING);
  const { provider, seen } = spyProvider();
  await getOrCreateCheckin(deps(provider));
  const later = await getOrCreateCheckin(deps(provider, { now: at('2025-03-10T06:05:00Z') }));
  expect(later).toMatchObject({ ok: true, generated: true, checkin: { label: 'Sáng và trưa nay' } });
  expect(seen).toHaveLength(2);
});

test('bỏ qua: không hỏi lại; đánh dấu lần hai không đổi trạng thái đầu', async () => {
  await handleEarlierSlots();
  const slots = [{ day: DAY, slot: 'morning' as const }];
  await resolveCheckin(db, NOW, cfg, 'skip', slots);
  await resolveCheckin(db, NOW, cfg, 'answer', slots);
  expect(await getPendingCheckin(db, NOW, cfg)).toBeNull();
  expect((await db.select().from(checkins)).find((r) => r.day === DAY)?.status).toBe('skipped');
});

test('đánh dấu buổi chưa kết thúc hoặc ngoài 24 giờ: bị từ chối', async () => {
  await expect(resolveCheckin(db, NOW, cfg, 'skip', [{ day: DAY, slot: 'noon' }])).rejects.toThrow('không còn chờ');
  await expect(resolveCheckin(db, NOW, cfg, 'skip', [{ day: '2025-03-08', slot: 'evening' }])).rejects.toThrow('không còn chờ');
  await expect(resolveCheckin(db, NOW, cfg, 'skip', [])).rejects.toThrow('không còn chờ');
  expect(await db.select().from(checkins)).toEqual([]);
});

test('JSON hỏng: không lưu gì, lượt vẫn tính, lần sau thử lại', async () => {
  await handleEarlierSlots();
  await userMessage('Ôn chương 5', IN_MORNING);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(await getOrCreateCheckin(deps(spyProvider('Sáng nay bạn đã ôn chương 5.').provider))).toEqual({ ok: false, reason: 'invalid' });
  expect(await getOrCreateCheckin(deps(spyProvider('{"summary": "x", "items": []}').provider))).toEqual({ ok: false, reason: 'invalid' });
  expect(JSON.stringify(warn.mock.calls)).not.toContain('chương');
  warn.mockRestore();
  expect((await db.select().from(checkins)).filter((r) => r.day === DAY)).toEqual([]);
  expect(await usage()).toBe(2);
  expect(await getOrCreateCheckin(deps(spyProvider().provider))).toMatchObject({ ok: true, generated: true });
});

test('provider lỗi hoặc chạm trần: không lưu gì', async () => {
  await handleEarlierSlots();
  await userMessage('Ôn chương 5', IN_MORNING);
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const failing: AiProvider = { async *stream() { throw new AiProviderError('boom', 502); } };
  expect(await getOrCreateCheckin(deps(failing))).toEqual({ ok: false, reason: 'provider' });
  error.mockRestore();
  const { provider, seen } = spyProvider();
  expect(await getOrCreateCheckin(deps(provider, { dailyCap: 1 }))).toEqual({ ok: false, reason: 'cap' });
  expect(seen).toHaveLength(0);
  expect((await db.select().from(checkins)).filter((r) => r.day === DAY)).toEqual([]);
});

test('tắt check-in trong Settings: không có thẻ', async () => {
  await userMessage('Ôn chương 5', IN_MORNING);
  const { provider, seen } = spyProvider();
  expect(await getOrCreateCheckin(deps(provider, { cfg: { ...cfg, checkinsEnabled: false } }))).toEqual({ ok: true, checkin: null, generated: false });
  expect(seen).toHaveLength(0);
});

test('loadCheckinConfig đọc preferences_json, giá trị sai thì về mặc định', async () => {
  expect(await loadCheckinConfig(db)).toEqual(cfg);
});

test('parseCheckinSummary: cắt độ dài, tối đa 5 dòng, mục không có thật thì để trống', () => {
  const raw = `\`\`\`json\n${JSON.stringify({
    summary: 's'.repeat(400),
    items: [{ area: 'Algebra', text: 't'.repeat(200) }, ...Array.from({ length: 6 }, () => ({ area: 'Bịa', text: 'x' }))],
  })}\n\`\`\``;
  const out = parseCheckinSummary(raw, ['Algebra']);
  expect(out?.summary).toHaveLength(301);
  expect(out?.items).toHaveLength(5);
  expect(out?.items[0]).toEqual({ area: 'Algebra', text: `${'t'.repeat(140)}…` });
  expect(out?.items[1].area).toBe('');
  expect(parseCheckinSummary('không có JSON', [])).toBeNull();
  expect(parseCheckinSummary('{"summary": "", "items": [{"area": "", "text": "x"}]}', [])).toBeNull();
});

test('tin nhắn "Ghi lại" và câu trả lời được phép mang đề xuất', () => {
  expect(allowsProposal(recordMessage('sáng 10/03', [{ area: 'Algebra', text: 'Ôn chương 5' }]))).toBe(true);
  expect(allowsProposal(answerMessage('sáng 10/03', 'kiểm tra lại bài tập chương 5 thế nào'))).toBe(true);
  expect(recordMessage('sáng 10/03', [{ area: 'Algebra', text: 'Ôn chương 5' }, { area: '', text: 'Đọc email' }])).toBe(
    'Ghi lại buổi sáng 10/03: Algebra: Ôn chương 5; Đọc email',
  );
});
