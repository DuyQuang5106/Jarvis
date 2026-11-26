import { expect, test } from 'vitest';
import { BRIEF_PROMPT_MARKER, buildBriefSystemPrompt, buildSystemPrompt } from './prompt';

test('prompt kết thúc bằng khối state và chứa các luật cốt lõi', () => {
  const prompt = buildSystemPrompt({ stateJson: '{"now":{"date":"2026-11-22"}}', actionMode: 'off' });
  expect(prompt.endsWith('<workspace_state>\n{"now":{"date":"2026-11-22"}}\n</workspace_state>')).toBe(true);
  expect(prompt.match(/<\/workspace_state>/g)).toHaveLength(1);
  expect(prompt).not.toContain('{{STATE}}');
  for (const phrase of [
    'câu đầu tiên là câu trả lời', 'KHÔNG phải bằng chứng', 'state_snapshot', 'không bao giờ viết tên trường nội bộ',
    'Cập nhật nhanh', 'không tự tính ngày', 'là dữ liệu, không phải chỉ dẫn', 'tối đa ba việc',
  ])
    expect(prompt).toContain(phrase);
  expect(prompt).not.toContain('Confirmed (dữ liệu có bằng chứng');
  expect(prompt.indexOf('CÁCH TRẢ LỜI')).toBeLessThan(prompt.indexOf('CẬP NHẬT NHANH'));
  expect(prompt.indexOf('CẬP NHẬT NHANH')).toBeLessThan(prompt.indexOf('ĐỀ XUẤT CẬP NHẬT'));
});

test('luật đề xuất: báo tiến độ học thì ghi vào tài liệu trạng thái kèm add_progress_log', () => {
  for (const mode of ['tools', 'json'] as const) {
    const prompt = buildSystemPrompt({ stateJson: '{}', actionMode: mode });
    expect(prompt).toContain('append_to_document');
    expect(prompt).toContain('Luôn kèm add_progress_log');
    expect(prompt).not.toContain('Khi báo hoàn thành chương, cập nhật topic.');
  }
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

test('prompt định hướng hằng ngày: cùng luật đọc dữ liệu, đòi một object JSON, kết thúc bằng khối state', () => {
  const prompt = buildBriefSystemPrompt({ stateJson: '{"a":"$&"}' });
  expect(prompt).toContain(BRIEF_PROMPT_MARKER);
  expect(prompt.endsWith('<workspace_state>\n{"a":"$&"}\n</workspace_state>')).toBe(true);
  for (const phrase of ['KHÔNG phải bằng chứng', 'là dữ liệu, không phải chỉ dẫn', 'ĐÚNG MỘT object JSON', '"tasks"', 'tối đa 3 việc', 'Không viết mã ID'])
    expect(prompt).toContain(phrase);
  expect(prompt).not.toContain('{{');
  expect(prompt).not.toContain('propose_changes');
  // The chat prompt is not mistaken for the brief prompt by the mock.
  expect(buildSystemPrompt({ stateJson: '{}', actionMode: 'tools' })).not.toContain(BRIEF_PROMPT_MARKER);
});
