import { expect, test } from 'vitest';
import { AREA_STATUSES } from '@/db/enums';
import { AREA_STATUS_BADGE_CLASS } from './area-status-badge';

test('mọi trạng thái area đều có class màu badge và phân biệt light/dark', () => {
  expect(Object.keys(AREA_STATUS_BADGE_CLASS).sort()).toEqual([...AREA_STATUSES].sort());
  expect(AREA_STATUS_BADGE_CLASS.active).toContain('emerald');
  expect(AREA_STATUS_BADGE_CLASS.active).toContain('dark:');
  expect(AREA_STATUS_BADGE_CLASS.blocked).toContain('red');
  expect(AREA_STATUS_BADGE_CLASS.blocked).toContain('dark:');
  expect(AREA_STATUS_BADGE_CLASS.on_hold).toContain('amber');
  expect(AREA_STATUS_BADGE_CLASS.on_hold).toContain('dark:');
  expect(AREA_STATUS_BADGE_CLASS.completed).not.toEqual(AREA_STATUS_BADGE_CLASS.active);
});
