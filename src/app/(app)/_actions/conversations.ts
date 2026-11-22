'use server';

import type { z } from 'zod';
import { ValidationError } from '@/server/errors';
import { ConversationId, ConversationTitle } from '@/server/schemas';
import { deleteConversation, renameConversation } from '@/server/services/conversations';
import { runAction, type ActionResult } from './result';

function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.');
  return result.data;
}

export async function renameConversationAction(id: string, title: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async (db) => {
    const cid = parse(ConversationId, id);
    await renameConversation(db, cid, parse(ConversationTitle, title));
    return { id: cid };
  }, ['/chat']);
}

export async function deleteConversationAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async (db) => {
    const cid = parse(ConversationId, id);
    await deleteConversation(db, cid);
    return { id: cid };
  }, ['/chat']);
}
