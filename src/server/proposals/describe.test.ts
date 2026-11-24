import { expect, test } from 'vitest';
import { createTestDb } from '@/db/testing';
import { createArea } from '../services/areas';
import { topicService } from '../services/entities';
import { describeStored } from './describe';
import { stampActions } from './validate';

const manual = { origin: 'manual' as const };

test('xem trước: nhãn, diff trước → sau, phát hiện xung đột và bản ghi đã mất', async () => {
  const db = await createTestDb();
  const course = await createArea(db, { kind: 'academic', name: 'Mobile Programming' }, manual);
  const topic = await topicService.create(db, { areaId: course.id, title: 'Navigation' }, manual);
  const stamped = await stampActions(db, [
    { type: 'upsert_topic', areaId: course.id, id: topic.id, status: 'familiar', title: 'Navigation' },
    { type: 'upsert_topic', areaId: course.id, title: 'VLSM', status: 'practiced' },
    { type: 'add_progress_log', areaId: course.id, text: '22/11: đã đọc xong phần Navigation' },
  ]);
  if (!stamped.ok) throw new Error('stamp');
  let previews = await describeStored(db, stamped.stored);
  expect(previews[0]).toEqual({
    key: 0,
    type: 'upsert_topic',
    areaId: course.id,
    areaName: 'Mobile Programming',
    label: 'Sửa topic “Navigation”',
    changes: [{ field: 'Trạng thái', before: 'Not started', after: 'Familiar' }],
    isCreate: false,
    conflict: 'none',
  });
  expect(previews[1]).toMatchObject({
    label: 'Tạo topic “VLSM”',
    isCreate: true,
    changes: expect.arrayContaining([{ field: 'Trạng thái', before: null, after: 'Practiced' }]),
  });
  expect(previews[2]).toMatchObject({
    label: 'Thêm log tiến độ',
    changes: [{ field: 'Nội dung', before: null, after: '22/11: đã đọc xong phần Navigation' }],
  });

  await topicService.update(db, topic.id, { evidence: 'quiz 8/10' }, manual);
  previews = await describeStored(db, stamped.stored);
  expect(previews[0].conflict).toBe('changed');

  await topicService.remove(db, topic.id, manual);
  previews = await describeStored(db, stamped.stored);
  expect(previews[0]).toMatchObject({ conflict: 'missing' });
});
