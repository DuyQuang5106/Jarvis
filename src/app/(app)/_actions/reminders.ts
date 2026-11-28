'use server';

import { markDone, snooze } from '@/server/reminders/reminders';
import { runAction, type ActionResult } from './result';

export async function finishReminderAction(id: string): Promise<ActionResult<undefined>> {
  return runAction(async (db) => {
    await markDone(db, id);
    return undefined;
  }, ['/chat']);
}

export async function snoozeReminderAction(id: string): Promise<ActionResult<undefined>> {
  return runAction(async (db) => {
    await snooze(db, id, new Date());
    return undefined;
  }, ['/chat']);
}
