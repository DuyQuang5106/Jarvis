import { expect, test } from 'vitest';
import { createTestDb } from '@/db/testing';
import { AiCapExceededError } from '../errors';
import { countAiRequest } from './ai-usage';

test('đếm theo ngày và chặn ở trần', async () => {
  const db = await createTestDb();
  expect(await countAiRequest(db, '2026-11-22', 2)).toBe(1);
  expect(await countAiRequest(db, '2026-11-22', 2)).toBe(2);
  await expect(countAiRequest(db, '2026-11-22', 2)).rejects.toBeInstanceOf(AiCapExceededError);
  expect(await countAiRequest(db, '2026-11-23', 2)).toBe(1);
});

test('trần 0 chặn ngay', async () => {
  const db = await createTestDb();
  await expect(countAiRequest(db, '2026-11-22', 0)).rejects.toBeInstanceOf(AiCapExceededError);
});
