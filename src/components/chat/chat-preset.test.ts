import { expect, test } from 'vitest';
import { queueChatPreset, takeChatPreset } from './chat-preset';

test('tin nhắn chờ chỉ được lấy đúng một lần', () => {
  expect(takeChatPreset()).toBeNull();
  queueChatPreset({ scope: { mode: 'item', areaId: 'a' }, message: 'Đọc tài liệu' });
  expect(takeChatPreset()).toEqual({ scope: { mode: 'item', areaId: 'a' }, message: 'Đọc tài liệu' });
  expect(takeChatPreset()).toBeNull();
});
