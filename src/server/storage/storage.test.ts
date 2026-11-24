import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { createLocalStorage } from './local';
import { createMemoryStorage } from './memory';
import type { FileStorage } from './types';

function runStorageSuite(name: string, make: () => { storage: FileStorage; cleanup: () => void }) {
  describe(name, () => {
    let cleanup: (() => void) | null = null;
    afterEach(() => {
      cleanup?.();
      cleanup = null;
    });

    test('put, exists, get, delete hoạt động đúng và delete an toàn khi không tồn tại', async () => {
      const ctx = make();
      cleanup = ctx.cleanup;
      const bytes = new Uint8Array([1, 2, 3, 4]);
      const key = 'area-1/doc-1.pdf';

      expect(await ctx.storage.exists(key)).toBe(false);
      expect(await ctx.storage.get(key)).toBeNull();

      await ctx.storage.put(key, bytes, 'application/pdf');
      expect(await ctx.storage.exists(key)).toBe(true);
      const read = await ctx.storage.get(key);
      expect(read).not.toBeNull();
      expect(Array.from(read!.bytes)).toEqual([1, 2, 3, 4]);
      expect(read!.contentType).toBe('application/pdf');

      await ctx.storage.delete(key);
      expect(await ctx.storage.exists(key)).toBe(false);
      expect(await ctx.storage.get(key)).toBeNull();
      await expect(ctx.storage.delete(key)).resolves.toBeUndefined();
    });

    test('từ chối khóa chứa path traversal hoặc ký tự lạ', async () => {
      const ctx = make();
      cleanup = ctx.cleanup;
      for (const bad of ['../secret', 'a/../b', '/abs/path', 'a\\b.txt', '', 'a//b']) {
        await expect(ctx.storage.put(bad, new Uint8Array([1]), 'text/plain')).rejects.toThrow(/Khóa lưu trữ/);
        await expect(ctx.storage.get(bad)).rejects.toThrow(/Khóa lưu trữ/);
      }
    });
  });
}

runStorageSuite('memory storage', () => ({
  storage: createMemoryStorage(),
  cleanup: () => {},
}));

runStorageSuite('local disk storage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jarvis-storage-'));
  return {
    storage: createLocalStorage(dir),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
});
