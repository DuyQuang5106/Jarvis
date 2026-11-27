import { beforeEach, expect, test } from 'vitest';
import type { Db } from '@/db/client';
import { messages, pendingActions } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import type { AiProvider, ProviderEvent, StreamRequest } from '../ai/provider';
import { createArea } from '../services/areas';
import { asksSomething } from './intent';
import { runChatTurn, type TurnEvent } from './run-turn';

const NOW = new Date('2026-11-26T03:00:00Z');
let db: Db;
let areaId: string;

beforeEach(async () => {
  db = await createTestDb();
  areaId = (await createArea(db, { kind: 'academic', name: 'Computer Networks', status: 'active' }, { origin: 'manual' })).id;
});

/** First call: a tool call with no text. Later calls (the aside): `asideReply`. Records every request. */
function toolOnlyProvider(asideReply: string, calls: StreamRequest[]): AiProvider {
  return {
    async *stream(req): AsyncGenerator<ProviderEvent> {
      calls.push(req);
      if (calls.length === 1) {
        const aliasOf = (req.messages[0].content.match(/"id":\s*"(a\d+)"/) ?? [])[1] ?? areaId;
        req.onUsage?.({ inputTokens: 1000, outputTokens: 50 });
        yield {
          type: 'tool_call',
          name: 'propose_changes',
          argsJson: JSON.stringify({ summary: 'Ghi nhận đã học xong Chương 4.', actions: [{ type: 'add_progress_log', areaId: aliasOf, text: 'Bạn báo đã học xong Chương 4.' }] }),
        };
        return;
      }
      req.onUsage?.({ inputTokens: 1100, outputTokens: 20 });
      yield { type: 'text', delta: asideReply };
    },
  };
}

async function run(message: string, provider: AiProvider) {
  const events: TurnEvent[] = [];
  for await (const e of runChatTurn({ db, provider, actionMode: 'tools', dailyCap: 200, now: NOW }, { scope: { mode: 'auto' }, message })) events.push(e);
  return events;
}
const textOf = (events: TurnEvent[]) => events.flatMap((e) => (e.type === 'text' ? [e.delta] : [])).join('');

test('báo tiến độ kèm câu hỏi phụ, model chỉ gửi đề xuất: gọi thêm một lượt để trả lời câu hỏi', async () => {
  const calls: StreamRequest[] = [];
  const events = await run('Computer Networks: tôi đã học xong chương 4. by the way bạn biết hôm nay là ngày gì không', toolOnlyProvider('Hôm nay là Thứ Năm, 26/11/2026.', calls));
  expect(calls).toHaveLength(2);
  expect(calls[1].tools).toBeUndefined();
  expect(textOf(events)).toBe('Ghi nhận đã học xong Chương 4.\n\nHôm nay là Thứ Năm, 26/11/2026.');
  expect(events.some((e) => e.type === 'proposal')).toBe(true);
  const done = events.at(-1) as Extract<TurnEvent, { type: 'done' }>;
  expect(done.stats).toMatchObject({ inputTokens: 2100, outputTokens: 70, totalMs: expect.any(Number) });
  const saved = (await db.select().from(messages)).find((m) => m.role === 'assistant')!;
  expect(saved.content).toContain('Hôm nay là Thứ Năm');
  expect(saved.metadata).toMatchObject({ stats: { inputTokens: 2100, outputTokens: 70 } });
  expect(await db.select().from(pendingActions)).toHaveLength(1);
});

test('model trả lời KHONG_CO: chỉ giữ tóm tắt đề xuất', async () => {
  const calls: StreamRequest[] = [];
  const events = await run('Computer Networks: tôi đã học xong chương 4, đúng không?', toolOnlyProvider('KHONG_CO', calls));
  expect(calls).toHaveLength(2);
  expect(textOf(events)).toBe('Ghi nhận đã học xong Chương 4.');
});

test('báo tiến độ không có câu hỏi: không gọi thêm', async () => {
  const calls: StreamRequest[] = [];
  await run('Computer Networks: tôi đã học xong chương 4, sắp có bài kiểm tra Lab', toolOnlyProvider('x', calls));
  expect(calls).toHaveLength(1);
});

test('asksSomething: câu hỏi ở giữa hay cuối tin, không nhầm tên bài kiểm tra', () => {
  expect(asksSomething('đã học xong chương 4. by the way bạn biết hôm nay là ngày gì không')).toBe(true);
  expect(asksSomething('xong chương 4 rồi, giữa kỳ thi mấy chương?')).toBe(true);
  expect(asksSomething('buổi 4 và 5 sẽ làm bài kiểm tra Lab')).toBe(false);
  expect(asksSomething('tôi đã học xong chương 4')).toBe(false);
});

test('allowsProposal: báo cáo nhắc tới "Kiểm tra trên lớp" vẫn được đề xuất; "kiểm tra lịch thi" vẫn là câu hỏi', async () => {
  const { allowsProposal } = await import('./intent');
  const report = [
    '1. tôi chưa luyện dạng bài nào',
    '2. giữa kỳ thi trắc nghiệm, cuối kỳ nửa trắc nghiệm nửa tự luận, hệ số như thế này:',
    'Kiểm tra trên lớp(Class Test)',
    '20.0%',
    'Thực hành(Practical Work)',
    '30.0%',
    'Mục tiêu của tôi trong tuần này là luyện bài tập chương 1-2-3, nhưng tôi chưa chốt nguồn tài liệu để ôn tập. Nhắc tôi phần này khi đến tối',
  ].join('\n');
  expect(allowsProposal(report)).toBe(true);
  expect(allowsProposal('kiểm tra lịch thi các môn')).toBe(false);
  expect(allowsProposal('hãy tóm tắt tiến độ Algebra')).toBe(false);
  expect(allowsProposal('phân tích tiến độ môn algebra cho tôi')).toBe(false);
  expect(allowsProposal('Mobile Programming đang ở tình trạng nào?')).toBe(false);
});
