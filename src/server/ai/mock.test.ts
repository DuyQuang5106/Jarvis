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
