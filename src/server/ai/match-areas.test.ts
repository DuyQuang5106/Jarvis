import { expect, test } from 'vitest';
import { matchAreas, normalizeVi } from './match-areas';

const areas = [
  { id: 'mob', name: 'Mobile Programming', aliases: ['Mobile'] },
  { id: 'se', name: 'Software Engineering', aliases: ['SE'] },
  { id: 'hcm', name: 'Tư tưởng Hồ Chí Minh', aliases: ['TTHCM'] },
  { id: 'c', name: 'C Programming', aliases: [] },
  { id: 'llm', name: 'LLM4AD/LLMEC', aliases: ['LLM4AD', 'LLMEC'] },
  { id: 'qh', name: 'Question House', aliases: ['QH'] },
  { id: 'db', name: 'Database', aliases: ['DB'] },
];

test('normalizeVi', () => {
  expect(normalizeVi('  Tư tưởng  Hồ Chí Minh ')).toBe('tu tuong ho chi minh');
  expect(normalizeVi('Đã XONG!')).toBe('da xong');
  expect(normalizeVi('LLM4AD/LLMEC')).toBe('llm4ad llmec');
});

test.each([
  ['Mobile Programming đang ở tình trạng nào?', ['mob']],
  ['mobile sao rồi', ['mob']],
  ['tu tuong ho chi minh thi khi nao', ['hcm']],
  ['TTHCM ôn tới đâu', ['hcm']],
  ['Tại sao tôi cứ né Question House?', ['qh']],
  ['qh với db tuần này', ['qh', 'db']],
  ['llmec đang mắc gì', ['llm']],
  ['Database lab đã nộp', ['db']],
])('khớp: %s', (text, expected) => {
  expect(matchAreas([text], areas)).toEqual(expected);
});

test.each([
  'automobile industry',
  'research đang mắc gì',
  'use case này sao',
  'hôm nay học C',
  'Hôm nay nên làm gì?',
  '',
])('không khớp: %s', (text) => {
  expect(matchAreas([text], areas)).toEqual([]);
});

test('khớp qua nhiều text, không trùng, giữ thứ tự của areas', () => {
  expect(matchAreas(['còn SE thì sao', 'Mobile ổn không', 'mobile programming'], areas)).toEqual(['mob', 'se']);
});

test('C Programming khớp khi gõ đủ tên', () => {
  expect(matchAreas(['c programming tuần này'], areas)).toEqual(['c']);
});
