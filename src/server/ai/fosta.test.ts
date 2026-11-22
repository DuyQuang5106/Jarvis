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
  const bodies: Record<string, unknown>[] = [];
  const fetchImpl = (async (_url: unknown, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return sse([chunk({ content: 'a' })]); }) as typeof fetch;
  await collect(make(fetchImpl).stream(req));
  await collect(make(fetchImpl).stream({ ...req, tools: [{ name: 't', description: 'd', parameters: { type: 'object' } }] }));
  expect(bodies[0]!.tools).toBeUndefined();
  expect(bodies[1]!.tools).toEqual([{ type: 'function', function: { name: 't', description: 'd', parameters: { type: 'object' } } }]);
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
