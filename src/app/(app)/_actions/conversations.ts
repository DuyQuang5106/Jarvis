'use server';

import { deleteConversation, renameConversation } from '@/server/services/conversations';
import { runAction, type ActionResult } from './result';

export async function renameConversationAction(id: string, title: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async (db) => {
    await renameConversation(db, id, title);
    return { id };
  }, ['/chat']);
}

export async function deleteConversationAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async (db) => {
    await deleteConversation(db, id);
    return { id };
  }, ['/chat']);
}
