import { sanitizeStorageKey, type FileStorage, type StorageObject } from './types';

export function createMemoryStorage(): FileStorage {
  const store = new Map<string, StorageObject>();
  return {
    async put(key, data, contentType) {
      const safe = sanitizeStorageKey(key);
      store.set(safe, { bytes: new Uint8Array(data), contentType });
    },
    async get(key) {
      const safe = sanitizeStorageKey(key);
      const hit = store.get(safe);
      if (!hit) return null;
      return { bytes: new Uint8Array(hit.bytes), contentType: hit.contentType };
    },
    async delete(key) {
      const safe = sanitizeStorageKey(key);
      store.delete(safe);
    },
    async exists(key) {
      const safe = sanitizeStorageKey(key);
      return store.has(safe);
    },
  };
}
