'use server';

import { ENTITY_SERVICES } from '@/server/services/entities';
import { ValidationError } from '@/server/errors';
import { moveTopic } from '@/server/services/topic-order';
import { runAction, type ActionResult } from './result';

type EntityType = keyof typeof ENTITY_SERVICES;
const manual = { origin: 'manual' } as const;

function service(type: EntityType) {
  const s = Object.hasOwn(ENTITY_SERVICES, type) ? ENTITY_SERVICES[type] : undefined;
  if (!s) throw new ValidationError('Loại bản ghi không hợp lệ.');
  return s;
}

export async function createEntityAction(type: EntityType, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async (db) => {
    const row = await service(type).create(db, input, manual);
    return { id: row.id as string };
  });
}

export async function updateEntityAction(type: EntityType, id: string, patch: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async (db) => {
    const row = await service(type).update(db, id, patch, manual);
    return { id: row.id as string };
  });
}

export async function deleteEntityAction(type: EntityType, id: string): Promise<ActionResult> {
  return runAction(async (db) => {
    await service(type).remove(db, id, manual);
    return undefined;
  });
}

export async function moveTopicAction(topicId: string, direction: 'up' | 'down'): Promise<ActionResult> {
  return runAction(async (db) => {
    if (direction !== 'up' && direction !== 'down') throw new ValidationError('Hướng không hợp lệ.');
    await moveTopic(db, topicId, direction, manual);
    return undefined;
  });
}
