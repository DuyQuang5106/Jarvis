import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { ValidationError } from '@/server/errors';
import { sanitizeStorageKey, type FileStorage } from './types';

function resolveInside(rootDir: string, key: string): string {
  const safe = sanitizeStorageKey(key);
  const root = resolve(rootDir);
  const full = resolve(root, safe);
  if (full !== root && !full.startsWith(root + sep)) {
    throw new ValidationError('Khóa lưu trữ không hợp lệ.');
  }
  return full;
}

const metaPath = (filePath: string) => `${filePath}.meta.json`;

export function createLocalStorage(rootDir: string): FileStorage {
  return {
    async put(key, data, contentType) {
      const target = resolveInside(rootDir, key);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, data);
      await writeFile(metaPath(target), JSON.stringify({ contentType }), 'utf8');
    },
    async get(key) {
      const target = resolveInside(rootDir, key);
      try {
        const bytes = await readFile(target);
        let contentType = 'application/octet-stream';
        try {
          const meta = JSON.parse(await readFile(metaPath(target), 'utf8')) as { contentType?: string };
          if (meta.contentType) contentType = meta.contentType;
        } catch {
          // Sidecar optional if files were seeded manually.
        }
        return { bytes: new Uint8Array(bytes), contentType };
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
        throw err;
      }
    },
    async delete(key) {
      const target = resolveInside(rootDir, key);
      await Promise.all([
        rm(target, { force: true }),
        rm(metaPath(target), { force: true }),
      ]);
    },
    async exists(key) {
      const target = resolveInside(rootDir, key);
      try {
        await access(target);
        return true;
      } catch {
        return false;
      }
    },
  };
}
