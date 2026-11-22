import { expect, type APIRequestContext } from '@playwright/test';

/**
 * Empties every table via the E2E-only reset route, then applies the flags.
 * Default `onboarded: true` keeps the onboarding dialog away; `seed: true` imports the seed (implies onboarded).
 */
export async function resetDb(request: APIRequestContext, opts: { seed?: boolean; onboarded?: boolean } = {}): Promise<void> {
  const res = await request.post('/api/test/reset', { data: opts });
  expect(res.ok(), `POST /api/test/reset -> ${res.status()}`).toBe(true);
}
