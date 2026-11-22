import { expect, test } from 'vitest';
import { TASK_STATUS_LABEL } from './labels';

test('nhãn status task đúng như spec §3.3', () => {
  expect(TASK_STATUS_LABEL).toEqual({ todo: 'Todo', doing: 'Doing', done: 'Done', blocked: 'Blocked' });
});
