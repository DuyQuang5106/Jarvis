'use server';

import { importSeed } from '@/server/seed/import-seed';
import { markOnboarded } from '@/server/services/settings';
import { runAction, type ActionResult } from './result';

const PATHS = ['/context', '/chat'];

export async function completeOnboardingAction(input: {
  items: { key: string; name: string }[];
  termGoal: string | null;
}): Promise<ActionResult<{ created: number }>> {
  return runAction((db) => importSeed(db, { items: input.items, termGoal: input.termGoal, now: new Date() }), PATHS);
}

export async function skipOnboardingAction(): Promise<ActionResult> {
  return runAction(async (db) => {
    await markOnboarded(db, new Date());
    return undefined;
  }, PATHS);
}
