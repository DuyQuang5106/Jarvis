import { expect, test } from 'vitest';
import { AiProviderError } from '../errors';
import { createFostaProvider } from './fosta';
import { recommendMode, runProbe } from './probe';
import type { AiProvider, ProviderEvent, StreamRequest } from './provider';

const base = { chat: true, streaming: true, notes: [] };
test('recommendMode', () => {
  expect(recommendMode({ ...base, tools: { passed: 3, total: 3 }, json: { passed: 0, total: 5 } })).toBe('tools');
  expect(recommendMode({ ...base, tools: { passed: 2, total: 3 }, json: { passed: 5, total: 5 } })).toBe('json');
  expect(recommendMode({ ...base, tools: { passed: 0, total: 3 }, json: { passed: 4, total: 5 } })).toBe('off');
});

const AREA = '11111111-1111-4111-8111-111111111111';
const payload = (title = 'Probe task') => ({ summary: 's', actions: [{ type: 'create_task', areaId: AREA, title }] });

function fake(fn: (req: StreamRequest) => ProviderEvent[]): AiProvider {
  return {
    async *stream(req) {
      for (const e of fn(req)) yield e;
    },
  };
}

test('provider trả lời đúng ở cả hai chế độ', async () => {
  const good = fake((req) => {
    if (req.tools?.length) return [{ type: 'tool_call', name: 'propose_changes', argsJson: JSON.stringify(payload()) }];
    if (req.messages.some((m) => m.role === 'system')) {
      return [{ type: 'text', delta: 'Xong.\n<proposed_actions>' }, { type: 'text', delta: `${JSON.stringify(payload())}</proposed_actions>` }];
    }
    return [{ type: 'text', delta: 'xin ' }, { type: 'text', delta: 'chào' }];
  });
  const r = await runProbe(good);
  expect(r.chat).toBe(true);
  expect(r.streaming).toBe(true);
  expect(r.tools).toEqual({ passed: 3, total: 3 });
  expect(r.json).toEqual({ passed: 5, total: 5 });
  expect(recommendMode(r)).toBe('tools');
});

test('tool call sai title hoặc args hỏng tính là lần thử trượt, không ném', async () => {
  let n = 0;
  const p = fake((req) => {
    if (req.tools?.length) {
      n += 1;
      if (n === 1) return [{ type: 'tool_call', name: 'propose_changes', argsJson: JSON.stringify(payload('Sai')) }];
      if (n === 2) return [{ type: 'tool_call', name: 'propose_changes', argsJson: '{not json' }];
      return [{ type: 'tool_call', name: 'propose_changes', argsJson: JSON.stringify(payload()) }];
    }
    return [{ type: 'text', delta: 'a' }];
  });
  const r = await runProbe(p);
  expect(r.tools).toEqual({ passed: 1, total: 3 });
  expect(r.json.passed).toBe(0);
});

test('provider ném AiProviderError mỗi lần gọi: chat false và có note', async () => {
  const p: AiProvider = {
    async *stream() {
      throw new AiProviderError('boom', 500);
    },
  };
  const r = await runProbe(p);
  expect(r.chat).toBe(false);
  expect(r.streaming).toBe(false);
  expect(r.tools.passed).toBe(0);
  expect(r.json.passed).toBe(0);
  expect(r.notes.length).toBeGreaterThan(0);
});

test('tool call sai tên: lần thử trượt', async () => {
  const p = fake((req) => {
    if (req.tools?.length) return [{ type: 'tool_call', name: 'other_tool', argsJson: JSON.stringify(payload()) }];
    return [{ type: 'text', delta: 'a' }, { type: 'text', delta: 'b' }];
  });
  const r = await runProbe(p);
  expect(r.tools.passed).toBe(0);
  expect(r.notes.filter((n) => n.startsWith('tools #'))).toHaveLength(3);
  expect(recommendMode(r)).not.toBe('tools');
});

test('tên tool lặp lại qua các delta (Fosta) vẫn đạt; tool call không tên không được tính', async () => {
  const sse = (chunks: object[]) =>
    new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  const tc = (fn: object) => ({ id: 'x', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: fn }] } }] });
  const args = JSON.stringify(payload());
  const half = Math.floor(args.length / 2);
  let call = 0;
  const fetchImpl = (async (_u: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { tools?: unknown[] };
    if (!body.tools) return sse([{ id: 'x', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: 'a' } }] }]);
    call += 1;
    if (call === 3) return sse([tc({ arguments: args })]); // không có tên
    return sse([
      tc({ name: 'propose_changes', arguments: args.slice(0, half) }),
      tc({ name: 'propose_changes', arguments: args.slice(half) }),
    ]);
  }) as typeof fetch;
  const r = await runProbe(createFostaProvider({ baseUrl: 'https://example.test/v1', apiKey: 'k', model: 'm', fetch: fetchImpl }));
  expect(r.tools).toEqual({ passed: 2, total: 3 });
  expect(r.notes.some((n) => n.startsWith('tools #3'))).toBe(true);
});

test('finish_reason khác stop/tool_calls được ghi vào notes', async () => {
  const p: AiProvider = {
    async *stream(req) {
      req.onFinishReason?.('length');
      yield { type: 'text', delta: 'a' };
    },
  };
  const r = await runProbe(p);
  expect(r.notes).toContain('chat: finish_reason=length');
});

test('finish_reason stop/tool_calls không sinh note', async () => {
  const p = fake((req) => {
    req.onFinishReason?.(req.tools?.length ? 'tool_calls' : 'stop');
    if (req.tools?.length) return [{ type: 'tool_call', name: 'propose_changes', argsJson: JSON.stringify(payload()) }];
    if (req.messages.some((m) => m.role === 'system')) return [{ type: 'text', delta: `<proposed_actions>${JSON.stringify(payload())}</proposed_actions>` }];
    return [{ type: 'text', delta: 'a' }, { type: 'text', delta: 'b' }];
  });
  expect((await runProbe(p)).notes).toEqual([]);
});
