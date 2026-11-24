import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { extractHeadings, toggleChecklistAt } from './markdown';

const SAMPLE_GFM = `# Tổng quan môn

Môn học có dấu tiếng Việt: **Tư tưởng Hồ Chí Minh** và \`code inline\`.

## Checklist ôn tập
- [ ] Đọc chương 1
- [x] Làm bài tập [Lab 1](task:11111111-1111-4111-8111-111111111111)

## Bảng điểm
| Thành phần | Trọng số | Điểm |
|---|---|---|
| Giữa kỳ | 30% | 9.0 |

\`\`\`ts
# Not a heading inside code block
- [ ] Not a checklist
const x = 1;
\`\`\`
`;

test('GFM markdown giữ nguyên cấu trúc qua remark-gfm render và round-trip toggle checklist', () => {
  const html = renderToStaticMarkup(createElement(Markdown, { remarkPlugins: [remarkGfm] }, SAMPLE_GFM));
  expect(html).toContain('<h1>Tổng quan môn</h1>');
  expect(html).toContain('<input type="checkbox"');
  expect(html).toContain('<table>');
  expect(html).toContain('<pre><code class="language-ts">');

  const headings = extractHeadings(SAMPLE_GFM);
  expect(headings).toEqual([
    { level: 1, text: 'Tổng quan môn', line: 0 },
    { level: 2, text: 'Checklist ôn tập', line: 4 },
    { level: 2, text: 'Bảng điểm', line: 8 },
  ]);

  const toggled = toggleChecklistAt(SAMPLE_GFM, 0);
  expect(toggled).toContain('- [x] Đọc chương 1');
  expect(toggled).toContain('- [ ] Not a checklist');
  expect(toggleChecklistAt(toggled, 0)).toBe(SAMPLE_GFM);
});
