import { getConfig } from '@/server/config';
import { createLocalStorage } from './local';
import { createMemoryStorage } from './memory';
import { createSupabaseStorage } from './supabase';
import type { FileStorage } from './types';

export type { FileStorage, StorageObject } from './types';
export { sanitizeStorageKey } from './types';

const globalForStorage = globalThis as unknown as { __jarvisStorage?: FileStorage };

export function getStorage(): FileStorage {
  if (globalForStorage.__jarvisStorage) return globalForStorage.__jarvisStorage;
  const cfg = getConfig();
  let instance: FileStorage;
  if (cfg.storageDriver === 'memory') {
    instance = createMemoryStorage();
  } else if (cfg.storageDriver === 'supabase') {
    if (!cfg.supabaseUrl || !cfg.supabaseServiceRoleKey || !cfg.supabaseStorageBucket) {
      throw new Error('Thiếu cấu hình Supabase Storage.');
    }
    instance = createSupabaseStorage({
      url: cfg.supabaseUrl,
      serviceRoleKey: cfg.supabaseServiceRoleKey,
      bucket: cfg.supabaseStorageBucket,
    });
  } else {
    instance = createLocalStorage(cfg.storageDir);
  }
  globalForStorage.__jarvisStorage = instance;
  return instance;
}
