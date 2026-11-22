import { expect, test } from 'vitest';
import { toNdjsonStream } from './ndjson';

async function read(stream: ReadableStream<Uint8Array>) { return await new Response(stream).text(); }

test('mỗi sự kiện một dòng JSON', async () => {
  async function* gen() { yield { type: 'text', delta: 'Xin "chào"\n' } as const; yield { type: 'error', message: 'x' } as const; }
  const lines = (await read(toNdjsonStream(gen()))).split('\n').filter(Boolean);
  expect(lines.map((l) => JSON.parse(l))).toEqual([{ type: 'text', delta: 'Xin "chào"\n' }, { type: 'error', message: 'x' }]);
});

test('generator ném lỗi thì kết thúc bằng một sự kiện error', async () => {
  async function* gen() { yield { type: 'text', delta: 'a' } as const; throw new Error('bí mật nội bộ'); }
  const out = await read(toNdjsonStream(gen()));
  expect(out).not.toContain('bí mật nội bộ');
  expect(JSON.parse(out.trim().split('\n').at(-1)!)).toEqual({ type: 'error', message: 'Có lỗi xảy ra, thử lại.' });
});

test('flush từng sự kiện ngay khi được yield', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  async function* gen() { yield { type: 'text', delta: 'a' } as const; await gate; yield { type: 'text', delta: 'b' } as const; }
  const reader = toNdjsonStream(gen()).getReader();
  const first = await reader.read();
  expect(new TextDecoder().decode(first.value)).toBe('{"type":"text","delta":"a"}\n');
  release();
  expect((await reader.read()).done).toBe(false);
  expect((await reader.read()).done).toBe(true);
});

test('hủy stream thì dừng generator', async () => {
  let finished = false;
  async function* gen() { try { yield { type: 'text', delta: 'a' } as const; yield { type: 'text', delta: 'b' } as const; } finally { finished = true; } }
  const reader = toNdjsonStream(gen()).getReader();
  await reader.read();
  await reader.cancel();
  expect(finished).toBe(true);
});
