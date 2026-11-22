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
