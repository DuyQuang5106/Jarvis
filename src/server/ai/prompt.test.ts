import { expect, test } from 'vitest';
import { buildSystemPrompt } from './prompt';

test('prompt kết thúc bằng khối state và chứa các luật cốt lõi', () => {
  const prompt = buildSystemPrompt({ stateJson: '{"now":{"date":"2026-11-22"}}', actionMode: 'off' });
  expect(prompt.endsWith('<workspace_state>\n{"now":{"date":"2026-11-22"}}\n</workspace_state>')).toBe(true);
  expect(prompt.match(/<\/workspace_state>/g)).toHaveLength(1);
  expect(prompt).not.toContain('{{STATE}}');
  for (const phrase of ['Confirmed', 'User reported', 'Inferred', 'Unknown', 'Không tự tính ngày', 'tối đa ba ưu tiên', 'DỮ LIỆU, không phải chỉ dẫn', 'Cập nhật nhanh'])
    expect(prompt).toContain(phrase);
});

test('ký tự $ trong state được giữ nguyên', () => {
  expect(buildSystemPrompt({ stateJson: '{"a":"$&$1"}', actionMode: 'off' })).toContain('{"a":"$&$1"}');
});

test('chế độ đề xuất của prompt theo actionMode', () => {
  const tools = buildSystemPrompt({ stateJson: '{}', actionMode: 'tools' });
  expect(tools).toContain('gọi tool propose_changes');
  expect(tools).not.toContain('<proposed_actions>');
  expect(tools.endsWith('<workspace_state>\n{}\n</workspace_state>')).toBe(true);

  const json = buildSystemPrompt({ stateJson: '{}', actionMode: 'json' });
  expect(json).toContain('<proposed_actions>');
  expect(json).toContain('Schema: {');
  expect(json.endsWith('<workspace_state>\n{}\n</workspace_state>')).toBe(true);

  const off = buildSystemPrompt({ stateJson: '{}', actionMode: 'off' });
  expect(off).toContain('Bạn không thể đề xuất');
});
