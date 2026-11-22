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
