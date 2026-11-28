import { expect, test } from 'vitest';
import { TABLE_NAMES } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { importSeed } from '../seed/import-seed';
import { SEED_ITEMS } from '../seed/seed-data';
import { buildExport } from './export';

test('export đủ mọi bảng và có schema_version (criterion 17)', async () => {
  const db = await createTestDb();
  const now = new Date('2026-11-22T03:00:00Z');
  await importSeed(db, { items: SEED_ITEMS.map((s) => ({ key: s.key, name: s.name })), termGoal: null, now });
  const out = await buildExport(db, now);
  expect(out.schema_version).toBe(3);
  expect(out.exported_at).toBe('2026-11-22T03:00:00.000Z');
  // Every table except device push endpoints and keys (secrets tied to one browser).
  expect(Object.keys(out.tables).sort()).toEqual(TABLE_NAMES.filter((t) => t !== 'push_subscriptions').sort());
  expect(out.tables.areas).toHaveLength(14);
  expect(out.tables.activity_logs).toHaveLength(14);
  expect(() => JSON.stringify(out)).not.toThrow();
});
