import { expect, test } from 'vitest';
import { formatEntityMarkdownLink, parseEntityLink } from './doc-links';

test('parseEntityLink và formatEntityMarkdownLink cho task và milestone', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  expect(parseEntityLink(`task:${id}`)).toEqual({ kind: 'task', id });
  expect(parseEntityLink(`milestone:${id}`)).toEqual({ kind: 'milestone', id });
  expect(parseEntityLink('https://example.com')).toBeNull();
  expect(parseEntityLink('task:bad')).toBeNull();
  expect(formatEntityMarkdownLink('task', id, 'Làm [lab] 1')).toBe(`[Làm \\[lab\\] 1](task:${id})`);
});
