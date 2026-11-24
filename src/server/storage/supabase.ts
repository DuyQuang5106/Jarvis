import { createClient } from '@supabase/supabase-js';
import { sanitizeStorageKey, type FileStorage } from './types';

export function createSupabaseStorage(opts: { url: string; serviceRoleKey: string; bucket: string }): FileStorage {
  const client = createClient(opts.url, opts.serviceRoleKey, { auth: { persistSession: false } });
  const bucket = client.storage.from(opts.bucket);

  return {
    async put(key, data, contentType) {
      const safe = sanitizeStorageKey(key);
      const { error } = await bucket.upload(safe, data, { contentType, upsert: true });
      if (error) throw new Error(`Không tải lên được tệp (${error.message}).`);
    },
    async get(key) {
      const safe = sanitizeStorageKey(key);
      const { data, error } = await bucket.download(safe);
      if (error || !data) return null;
      const ab = await data.arrayBuffer();
      return { bytes: new Uint8Array(ab), contentType: data.type || 'application/octet-stream' };
    },
    async delete(key) {
      const safe = sanitizeStorageKey(key);
      await bucket.remove([safe]);
    },
    async exists(key) {
      const safe = sanitizeStorageKey(key);
      const slash = safe.lastIndexOf('/');
      const dir = slash >= 0 ? safe.slice(0, slash) : '';
      const name = slash >= 0 ? safe.slice(slash + 1) : safe;
      const { data, error } = await bucket.list(dir, { search: name, limit: 1 });
      if (error || !data) return false;
      return data.some((entry) => entry.name === name);
    },
  };
}
