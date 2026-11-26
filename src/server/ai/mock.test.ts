import { expect, test } from 'vitest';
import { fromDocumentsMessage } from '@/lib/from-documents';
import { AiProviderError } from '../errors';
import { ProposeChangesSchema } from '../proposals/schema';
import { createMockProvider } from './mock';
import { MOCK_CHECKIN_SUMMARY } from './mock';
import { buildBriefSystemPrompt, buildCheckinSystemPrompt, buildSystemPrompt } from './prompt';
import { collect } from './provider';

const ask = (content: string) => createMockProvider().stream({ messages: [{ role: 'user', content }], maxOutputTokens: 100 });

test('mặc định lặp lại tin nhắn trong hai chunk', async () => {
  const events = [];
  for await (const e of ask('xin chào')) events.push(e);
  expect(events).toEqual([{ type: 'text', delta: 'MOCK_REPLY: ' }, { type: 'text', delta: 'xin chào' }]);
});

test('MOCK_IMAGE trả về markdown có ảnh ngoài site', async () => {
  const events = [];
  for await (const e of ask('MOCK_IMAGE')) events.push(e);
  expect(events).toEqual([{ type: 'text', delta: 'Ảnh đây: ![x](https://example.invalid/leak?d=1) hết.' }]);
});

test('MOCK_ERROR ném lỗi trước khi phát gì', async () => {
  await expect(collect(ask('MOCK_ERROR'))).rejects.toBeInstanceOf(AiProviderError);
});

test('MOCK_PARTIAL_ERROR phát một phần rồi ném lỗi', async () => {
  const seen: string[] = [];
  await expect((async () => { for await (const e of ask('MOCK_PARTIAL_ERROR')) if (e.type === 'text') seen.push(e.delta); })()).rejects.toBeInstanceOf(AiProviderError);
  expect(seen).toEqual(['Đang trả lời']);
});

test('MOCK_SLOW dừng ngay khi signal bị hủy', async () => {
  const ctrl = new AbortController();
  const seen: string[] = [];
  const run = (async () => {
    for await (const e of createMockProvider().stream({ messages: [{ role: 'user', content: 'MOCK_SLOW' }], maxOutputTokens: 100, signal: ctrl.signal })) {
      if (e.type === 'text') {
        seen.push(e.delta);
        ctrl.abort();
      }
    }
  })();
  await expect(run).rejects.toBeInstanceOf(AiProviderError);
  expect(seen).toEqual(['MOCK_SLOW_CHUNK_1 ']);
});

test('MOCK_STATE ghép area và detail từ khối workspace_state', async () => {
  const state = {
    now: { date: '2026-11-22' },
    areas: [{ name: 'Mobile', status: 'active' }, { name: 'Web', status: 'not_started' }],
    details: [{ name: 'Mobile', topics: [{ title: 'Nav', status: 'practiced' }, { title: 'State', status: 'new' }] }],
  };
  const system = `intro\n\n<workspace_state>\n${JSON.stringify(state)}\n</workspace_state>`;
  const { text } = await collect(createMockProvider().stream({
    messages: [{ role: 'system', content: system }, { role: 'user', content: 'hi' }],
    maxOutputTokens: 100,
  }));
  expect(text).toBe('MOCK_STATE today=2026-11-22 | Mobile=active; Web=not_started | detail:Mobile topics:Nav=practiced,State=new');
});

test('đề xuất qua tool_call hoặc <proposed_actions> cắt đôi thẻ mở', async () => {
  const state = {
    now: { date: '2026-11-22' },
    areas: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Mobile', status: 'active' }],
    details: [{ areaId: '11111111-1111-4111-8111-111111111111', name: 'Mobile', topics: [{ id: '22222222-2222-4222-8222-222222222222', title: 'Nav', status: 'not_started' }] }],
  };
  const systemTools = `intro\n\n<workspace_state>\n${JSON.stringify(state)}\n</workspace_state>`;
  const toolRes = await collect(createMockProvider().stream({
    messages: [{ role: 'system', content: systemTools }, { role: 'user', content: 'Tôi đã xong Nav' }],
    tools: [{ name: 'propose_changes', description: 'x', parameters: {} }],
    maxOutputTokens: 100,
  }));
  expect(toolRes.text).toBe('Ghi nhận. Đề xuất cập nhật.');
  expect(toolRes.toolCalls).toHaveLength(1);
  expect(toolRes.toolCalls[0].name).toBe('propose_changes');

  const systemJson = `intro <proposed_actions>\n\n<workspace_state>\n${JSON.stringify(state)}\n</workspace_state>`;
  const jsonEvents = [];
  for await (const e of createMockProvider().stream({
    messages: [{ role: 'system', content: systemJson }, { role: 'user', content: 'Phân loại ghi chú Mobile' }],
    maxOutputTokens: 100,
  })) jsonEvents.push(e);
  expect(jsonEvents.map((e) => (e.type === 'text' ? e.delta : ''))).toEqual([
    'Đề xuất từ ghi chú.',
    '<proposed_',
    expect.stringContaining('actions>'),
  ]);

  const badRes = await collect(createMockProvider().stream({
    messages: [{ role: 'system', content: systemTools }, { role: 'user', content: 'MOCK_BAD_PROPOSAL' }],
    tools: [{ name: 'propose_changes', description: 'x', parameters: {} }],
    maxOutputTokens: 100,
  }));
  expect(badRes.text).toBe('Đề xuất lỗi.');
  expect(badRes.toolCalls).toHaveLength(1);
});

test('MOCK_LENGTH phát "Phần đầu" rồi báo finish_reason length', async () => {
  const reasons: (string | null)[] = [];
  const { text } = await collect(createMockProvider().stream({
    messages: [{ role: 'user', content: 'MOCK_LENGTH' }],
    maxOutputTokens: 100,
    onFinishReason: (r) => reasons.push(r),
  }));
  expect(text).toBe('Phần đầu');
  expect(reasons).toEqual(['length']);
});

test('prompt định hướng hằng ngày: trả một object JSON trong code fence, nhắc tên các mục có trong state', async () => {
  const state = {
    now: { date: '2026-11-26' },
    areas: ['Algebra', 'Database', 'StewieSAT', 'Physics'].map((name, i) => ({ id: `a${i + 1}`, name, status: 'active' })),
    details: [],
  };
  const { text, toolCalls } = await collect(createMockProvider().stream({
    messages: [
      { role: 'system', content: buildBriefSystemPrompt({ stateJson: JSON.stringify(state) }) },
      { role: 'user', content: 'Hôm nay nên làm gì?' },
    ],
    maxOutputTokens: 800,
  }));
  expect(toolCalls).toEqual([]);
  expect(text.startsWith('```json\n')).toBe(true);
  const brief = JSON.parse(text.replace(/^```json\n/, '').replace(/\n```$/, ''));
  expect(brief.focus).toBe('MOCK_BRIEF 2026-11-26: bắt đầu với Algebra.');
  expect(brief.tasks.map((t: { area: string }) => t.area)).toEqual(['Algebra', 'Database', 'StewieSAT']);
  expect(brief.stale).toBe('Algebra, Database, StewieSAT');
});

test('Tạo từ tài liệu: đề xuất topic, một assessment "(dự kiến)" và một việc cho đúng mục đang xem, không lặp bản ghi đã có', async () => {
  const areaId = '11111111-1111-4111-8111-111111111111';
  const ask = async (detail: Record<string, unknown>) => {
    const state = { now: { date: '2026-11-26' }, areas: [{ id: areaId, name: 'Algebra', status: 'active' }], details: [{ areaId, name: 'Algebra', topics: [], ...detail }] };
    const res = await collect(createMockProvider().stream({
      messages: [
        { role: 'system', content: `intro\n\n<workspace_state>\n${JSON.stringify(state)}\n</workspace_state>` },
        { role: 'user', content: fromDocumentsMessage({ name: 'Algebra', kind: detail.kind === 'project' ? 'project' : 'academic' }) },
      ],
      tools: [{ name: 'propose_changes', description: 'x', parameters: {} }],
      maxOutputTokens: 100,
    }));
    return { text: res.text, proposal: res.toolCalls[0] ? ProposeChangesSchema.parse(JSON.parse(res.toolCalls[0].argsJson)) : null };
  };

  const fresh = await ask({ kind: 'academic' });
  expect(fresh.text).toBe('Đề xuất tạo bản ghi từ tài liệu.');
  expect(fresh.proposal!.actions.map((a) => [a.type, 'title' in a ? a.title : null])).toEqual([
    ['upsert_topic', 'Chương 1'], ['upsert_topic', 'Chương 2'], ['upsert_topic', 'Chương 3'],
    ['upsert_assessment', 'Giữa kỳ (dự kiến)'], ['create_task', 'Làm bài tập Chương 1'],
  ]);
  expect(fresh.proposal!.actions[0]).toMatchObject({ areaId, status: 'familiar', evidence: expect.stringContaining('Tài liệu') });
  expect(fresh.proposal!.actions[3]).toMatchObject({ areaId, dueDate: '2026-12-10' });

  const again = await ask({
    kind: 'academic',
    topics: [{ id: 'x', title: 'Chương 1', status: 'familiar' }, { id: 'y', title: 'Chương 2', status: 'not_started' }],
    assessments: [{ title: 'Giữa kỳ (dự kiến)' }],
  });
  expect(again.proposal!.actions.map((a) => a.type)).toEqual(['upsert_topic', 'create_task']);

  const project = await ask({ kind: 'project' });
  expect(project.proposal!.actions.map((a) => a.type)).toEqual(['upsert_milestone', 'upsert_milestone', 'create_task']);

  const done = await ask({
    kind: 'project',
    milestones: [{ title: 'Bản chạy được đầu tiên' }, { title: 'Bản dùng thử' }],
    tasks: [{ title: 'Làm bài tập Chương 1' }],
  });
  expect(done).toEqual({ text: 'Tài liệu không có gì mới để đề xuất.', proposal: null });
});

test('prompt tóm tắt buổi: JSON cố định nhắc mục thật mà hoạt động có nhắc, kể cả khi hoạt động chứa MOCK_ERROR', async () => {
  const run = (activity: string) => collect(createMockProvider().stream({
    messages: [
      { role: 'system', content: buildCheckinSystemPrompt({ areaNames: ['Algebra', 'StewieSAT'] }) },
      { role: 'user', content: activity },
    ],
    maxOutputTokens: 600,
  }));
  const parse = (text: string) => JSON.parse(text.replace(/^```json\n/, '').replace(/\n```$/, ''));
  const named = parse((await run('<activity>\n09:00 · tin nhắn · Sửa anten StewieSAT MOCK_ERROR\n</activity>')).text);
  expect(named).toEqual({ summary: MOCK_CHECKIN_SUMMARY, items: [{ area: 'StewieSAT', text: 'Làm việc với StewieSAT' }] });
  expect(parse((await run('<activity>\nđọc email\n</activity>')).text).items[0].area).toBe('Algebra');
});

test('tin nhắn "Ghi lại buổi …": đề xuất add_progress_log cho mục được nhắc', async () => {
  const areaId = '11111111-1111-4111-8111-111111111111';
  const state = { now: { date: '2026-11-26' }, areas: [{ id: areaId, name: 'Algebra', status: 'active' }], details: [] };
  const res = await collect(createMockProvider().stream({
    messages: [
      { role: 'system', content: buildSystemPrompt({ stateJson: JSON.stringify(state), actionMode: 'tools' }) },
      { role: 'user', content: 'Ghi lại buổi sáng 26/11: Algebra: Ôn chương 5' },
    ],
    tools: [{ name: 'propose_changes', description: '', parameters: {} }],
    maxOutputTokens: 100,
  }));
  const proposal = ProposeChangesSchema.parse(JSON.parse(res.toolCalls[0].argsJson));
  expect(proposal.actions).toEqual([{ type: 'add_progress_log', areaId, text: 'Algebra: Ôn chương 5' }]);
});
