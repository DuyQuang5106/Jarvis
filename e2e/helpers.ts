import { expect, type APIRequestContext } from '@playwright/test';

/**
 * Empties every table via the E2E-only reset route, then applies the flags.
 * Default `onboarded: true` keeps the onboarding dialog away; `seed: true` imports the seed (implies onboarded).
 * Check-ins and the weekly review card are off unless `checkins: true` / `weeklyReview: true`; `activity` saves
 * user messages at given instants; `documents` adds Markdown documents to seeded areas (by name).
 */
export async function resetDb(
  request: APIRequestContext,
  opts: {
    seed?: boolean;
    onboarded?: boolean;
    checkins?: boolean;
    weeklyReview?: boolean;
    activity?: { text: string; at: string }[];
    documents?: { area: string; title: string; body: string }[];
  } = {},
): Promise<void> {
  const res = await request.post('/api/test/reset', { data: opts });
  expect(res.ok(), `POST /api/test/reset -> ${res.status()}`).toBe(true);
}
