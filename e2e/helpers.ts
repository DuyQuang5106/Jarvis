import { expect, type APIRequestContext } from '@playwright/test';

/**
 * Empties every table via the E2E-only reset route, then applies the flags.
 * Default `onboarded: true` keeps the onboarding dialog away; `seed: true` imports the seed (implies onboarded).
 * Check-ins are off unless `checkins: true`; `activity` saves user messages at given instants.
 */
export async function resetDb(
  request: APIRequestContext,
  opts: { seed?: boolean; onboarded?: boolean; checkins?: boolean; activity?: { text: string; at: string }[] } = {},
): Promise<void> {
  const res = await request.post('/api/test/reset', { data: opts });
  expect(res.ok(), `POST /api/test/reset -> ${res.status()}`).toBe(true);
}
