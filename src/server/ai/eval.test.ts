import { beforeEach, expect, test, vi } from 'vitest';
import type { Db } from '@/db/client';
import { conversations } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { createArea } from '../services/areas';
import { documentService } from '../services/documents';
import { formatEvalReport, parseEvalCases, runEval, type EvalCase } from './eval';
import { createMockProvider } from './mock';

const NOW = new Date('2026-11-22T03:00:00Z');
const manual = { origin: 'manual' as const };
let db: Db;

beforeEach(async () => {
  db = await createTestDb();
  const algebra = await createArea(db, { kind: 'academic', name: 'Algebra', status: 'active' }, manual);
  await documentService.create(db, { areaId: algebra.id, title: '04_STATE', bodyMd: '# Trạng thái\n\nĐang học chương 5.' }, manual);
  vi.spyOn(console, 'info').mockImplementation(() => {});
  return () => vi.restoreAllMocks();
});

const run = (cases: EvalCase[]) => runEval({ db, provider: createMockProvider(), actionMode: 'tools', now: NOW }, cases);

test('một case đạt, một trượt vì câu trả lời, một trượt vì ngữ cảnh; mỗi case một cuộc chat mới', async () => {
  const results = await run([
    { id: 'pass', question: 'Algebra sao rồi', contextMustInclude: ['04_state'], contextMustNotInclude: ['06_TIMELINE'], answerMustMatch: ['algebra=active'], answerMustNotMatch: ['status_unknown'], expectProposal: false, maxFirstTokenMs: 60_000 },
    { id: 'answer', question: 'Algebra sao rồi', answerMustMatch: ['chương\\s*5'] },
    { id: 'context', question: 'Algebra sao rồi', contextMustInclude: ['06_TIMELINE'] },
  ]);
  expect(results.map((r) => [r.id, r.pass])).toEqual([['pass', true], ['answer', false], ['context', false]]);
  expect(results[0].failures).toEqual([]);
  expect(results[1].failures).toEqual(['câu trả lời không khớp /chương\\s*5/i']);
  expect(results[2].failures).toEqual(['ngữ cảnh thiếu "06_TIMELINE"']);
  expect(results[0]).toMatchObject({ documents: 1, promptChars: expect.any(Number), firstTokenMs: expect.any(Number), totalMs: expect.any(Number) });
  expect(results[0].promptChars).toBeGreaterThan(0);
  expect(await db.select().from(conversations)).toHaveLength(3);
});

test('đề xuất, ngữ cảnh cấm, câu trả lời cấm và lỗi provider đều thành lý do trượt', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const results = await run([
    { id: 'proposal', question: 'MOCK_BAD_PROPOSAL', expectProposal: false },
    { id: 'no-proposal', question: 'Algebra sao rồi', expectProposal: true, contextMustNotInclude: ['04_STATE'], answerMustNotMatch: ['MOCK_STATE'] },
    { id: 'error', question: 'MOCK_ERROR' },
  ]);
  expect(results[0].pass).toBe(true); // a dropped proposal is not a proposal card
  expect(results[1].failures).toEqual(['ngữ cảnh không được có "04_STATE"', 'câu trả lời không được khớp /MOCK_STATE/i', 'cần có đề xuất']);
  expect(results[2].pass).toBe(false);
  expect(results[2].failures[0]).toMatch(/^lỗi: /);
});

test('case thiếu trường bắt buộc bị từ chối; báo cáo cắt câu trả lời ở 300 ký tự', () => {
  expect(() => parseEvalCases('[{"id":"x"}]')).toThrow();
  expect(parseEvalCases('[{"id":"x","question":"q","expectProposal":false}]')).toEqual([{ id: 'x', question: 'q', expectProposal: false }]);
  const md = formatEvalReport({
    date: '2026-11-26T00:00:00.000Z',
    model: 'm',
    actionMode: 'tools',
    results: [{ id: 'a|b', pass: false, failures: ['x'], firstTokenMs: 1, totalMs: 2, documents: 3, promptChars: 4, reply: 'y'.repeat(500) }],
  });
  expect(md).toContain('- Model: m');
  expect(md).toContain('a\\|b');
  expect(md).toContain('y'.repeat(300) + '…');
  expect(md).not.toContain('y'.repeat(301));
});
