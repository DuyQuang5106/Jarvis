import { expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeArea } from '@/db/test-helpers';
import { pendingActions } from '@/db/schema';
import { createTestDb } from '@/db/testing';
import { createMockProvider } from '../ai/mock';
import { runChatTurn, type TurnEvent } from '../chat/run-turn';
import { documentService } from '../services/documents';
import { topicService } from '../services/entities';
import { approvePendingAction } from './resolve';
import type { StoredProposal } from './schema';
import { createPendingAction } from './store';

/** The id of a proposal that must have been stored. */
function storedId(result: Awaited<ReturnType<typeof createPendingAction>>): string {
  if (!result.ok) throw new Error(`proposal dropped: ${result.reason}`);
  return result.id;
}

const manual = { origin: 'manual' } as const;

test('mock định tuyến tiến độ sang topic, vướng mắc sang blocker và hạn sang task có dueDate', async () => {
  const db = await createTestDb();
  const algebra = await makeArea(db, { name: 'Algebra' });
  const project = await makeArea(db, { kind: 'project', name: 'Dự án Robocon' });
  const topic = await topicService.create(db, { areaId: algebra.id, title: 'Chương 1' }, manual);
  async function actions(message: string) {
    const events: TurnEvent[] = [];
    for await (const event of runChatTurn({ db, provider: createMockProvider(), actionMode: 'json', now: new Date(), dailyCap: 20 }, {
      message, scope: { mode: 'auto' },
    })) events.push(event);
    const proposal = events.find((event) => event.type === 'proposal');
    if (!proposal || proposal.type !== 'proposal') throw new Error('Thiếu đề xuất.');
    const [row] = await db.select().from(pendingActions).where(eq(pendingActions.id, proposal.pendingActionId));
    return (row.actionsJson as StoredProposal).actions.map(({ action }) => action);
  }
  expect(await actions('Tôi đã hoàn thành chương 1 Algebra')).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'upsert_topic', id: topic.id, status: 'confident' }),
  ]));
  expect(await actions('Báo blocker cho Dự án Robocon')).toEqual([
    expect.objectContaining({ type: 'create_blocker', areaId: project.id }),
  ]);
  expect(await actions('Hạn nộp Algebra là 2026-11-30')).toEqual([
    expect.objectContaining({ type: 'create_task', areaId: algebra.id, dueDate: '2026-11-30' }),
  ]);
});

test('duyệt một phần vẫn phải giữ bản ghi deadline khi có thay đổi Markdown', async () => {
  const db = await createTestDb();
  const area = await makeArea(db, { name: 'Algebra' });
  const doc = await documentService.create(db, { areaId: area.id, title: 'Kế hoạch', bodyMd: '# Lịch' }, manual);
  const pending = await createPendingAction(db, {
    source: 'chat', requestText: 'Hạn nộp vào ngày mai. Ghi thêm vào tài liệu.', proposal: {
      summary: 'Thêm hạn', actions: [
        { type: 'append_to_document', documentId: doc.id, markdown: 'Nộp vào ngày mai.' },
        { type: 'create_task', areaId: area.id, title: 'Nộp bài', dueDate: '2026-11-25' },
      ],
    },
  });
  const id = storedId(pending);
  expect(await approvePendingAction(db, id, { selectedKeys: [0] })).toMatchObject({ status: 'invalid' });
  expect(await approvePendingAction(db, id, { selectedKeys: [1] })).toMatchObject({ status: 'partially_applied' });
});
