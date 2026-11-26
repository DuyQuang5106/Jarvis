import { expect, test } from 'vitest';
import { splitFrontmatter } from './frontmatter';

test('tách frontmatter chuẩn', () => {
  const out = splitFrontmatter('---\nentity: HUST/MI1144E/Algebra\ndocument_type: state_snapshot\nstatus: PARTIAL — unverified\n---\n\n# 04 — STATE\n\nNội dung');
  expect(out.meta).toEqual({ entity: 'HUST/MI1144E/Algebra', document_type: 'state_snapshot', status: 'PARTIAL — unverified' });
  expect(out.body.trimStart().startsWith('# 04 — STATE')).toBe(true);
});

test.each([
  ['# Tiêu đề\n\n---\n\nđường kẻ ngang giữa bài', 'không bắt đầu bằng ---'],
  ['---\nkhông có dòng đóng\n# Tiêu đề\nnội dung', 'thiếu dòng đóng'],
  ['', 'rỗng'],
  ['---\n\n# Tiêu đề\n\nđoạn văn\n\n---\n\nphần sau', 'mở bằng đường kẻ ngang, giữa là Markdown'],
  ['---\n' + 'a: b\n'.repeat(61) + '---\nnội dung', 'dòng đóng quá xa'],
])('không phải frontmatter: %s (%s)', (text) => {
  expect(splitFrontmatter(text)).toEqual({ meta: {}, body: text });
});

test('CRLF, danh sách lồng và giá trị trong ngoặc kép', () => {
  const out = splitFrontmatter('---\r\ndocument_type: "course_map"\r\nsources:\r\n  - a.pdf\r\n---\r\n# Map\r\n');
  expect(out.meta).toEqual({ document_type: 'course_map' });
  expect(out.body).toBe('# Map\r\n');
});
