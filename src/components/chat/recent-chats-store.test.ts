import { expect, test } from 'vitest';
import { mergeRecent } from './recent-chats-store';

const row = (id: string, title: string, at: string) => ({ id, title, updatedAt: at });

test('mục mới chạm ở client đứng đầu; mục đã có được đưa lên nhưng giữ tiêu đề của server', () => {
  const rows = [row('a', 'A', '2026-11-22T10:00:00Z'), row('b', 'B (server)', '2026-11-22T09:00:00Z')];
  const local = [
    { id: 'n', title: 'Mới', at: Date.parse('2026-11-22T11:00:00Z') },
    { id: 'b', title: 'B (client)', at: Date.parse('2026-11-22T10:30:00Z') },
  ];
  expect(mergeRecent(rows, local, 30)).toEqual([
    { id: 'n', title: 'Mới' },
    { id: 'b', title: 'B (server)' },
    { id: 'a', title: 'A' },
  ]);
});

test('cắt theo giới hạn', () => {
  const rows = [row('a', 'A', '2026-11-22T10:00:00Z'), row('b', 'B', '2026-11-22T09:00:00Z')];
  expect(mergeRecent(rows, [{ id: 'n', title: 'N', at: Date.parse('2026-11-22T11:00:00Z') }], 2).map((r) => r.id)).toEqual(['n', 'a']);
});
