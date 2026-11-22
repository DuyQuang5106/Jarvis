import { expect, type APIRequestContext } from '@playwright/test';

/** Empties every table via the E2E-only reset route. `seed` is wired in Phase 1. */
export async function resetDb(request: APIRequestContext, opts: { seed?: boolean } = {}): Promise<void> {
  const res = await request.post('/api/test/reset', { data: opts });
  expect(res.ok(), `POST /api/test/reset -> ${res.status()}`).toBe(true);
}
