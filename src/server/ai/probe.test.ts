import { expect, test } from 'vitest';
import { AiProviderError } from '../errors';
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
