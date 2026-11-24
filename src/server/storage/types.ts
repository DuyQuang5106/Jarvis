import { ValidationError } from '@/server/errors';

export type StorageObject = { bytes: Uint8Array; contentType: string };

export interface FileStorage {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StorageObject | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

const SEGMENT = /^[a-zA-Z0-9._-]+$/;

/** Validates and normalizes relative forward-slash storage keys (`<areaId>/<docId>.ext`). */
export function sanitizeStorageKey(key: string): string {
  if (!key || key.startsWith('/') || key.includes('\\')) {
    throw new ValidationError('Khóa lưu trữ không hợp lệ.');
  }
  const parts = key.split('/');
  if (parts.some((p) => !p || p === '.' || p === '..' || !SEGMENT.test(p))) {
    throw new ValidationError('Khóa lưu trữ không hợp lệ.');
  }
  return parts.join('/');
}
