import { expect, test } from 'vitest';
import { createTestDb } from '@/db/testing';
import { createArea } from '../services/areas';
import { topicService } from '../services/entities';
import { loadProposal } from './load';
import { approvePendingAction } from './resolve';
import { createPendingAction } from './store';

const manual = { origin: 'manual' as const };

test('loadProposal: pending có preview, sau duyệt một phần conflict đặt none, id lạ trả null', async () => {
  const db = await createTestDb();
  const area = await createArea(db, { kind: 'academic', name: 'Mobile Programming' }, manual);
  const topic = await topicService.create(db, { areaId: area.id, title: 'Navigation' }, manual);
  const created = await createPendingAction(db, {
    source: 'chat',
    proposal: {
      summary: 'Cập nhật',
      actions: [
        { type: 'upsert_topic', areaId: area.id, id: topic.id, status: 'familiar' },
        { type: 'add_progress_log', areaId: area.id, text: 'đã đọc' },
      ],
    },
  });
  expect(created).not.toBeNull();
  const id = created!.id;

  const pendingView = await loadProposal(db, id);
  expect(pendingView).toMatchObject({ id, status: 'pending', summary: 'Cập nhật', appliedKeys: [] });
  expect(pendingView!.previews.map((p) => p.label)).toEqual(['Sửa topic “Navigation”', 'Thêm log tiến độ']);

  await approvePendingAction(db, id, { selectedKeys: [1] });
  const partialView = await loadProposal(db, id);
  expect(partialView).toMatchObject({ id, status: 'partially_applied', appliedKeys: [1] });
  expect(partialView!.previews.every((p) => p.conflict === 'none')).toBe(true);

  expect(await loadProposal(db, '00000000-0000-4000-8000-000000000000')).toBeNull();
});
