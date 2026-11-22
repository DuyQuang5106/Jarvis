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
  { id: 'ra', name: 'Research Assistant', aliases: ['RA'] },
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
  ['RA đang mắc gì', ['ra']],
  ['SE thế nào', ['se']],
])('khớp: %s', (text, expected) => {
  expect(matchAreas([text], areas)).toEqual(expected);
});

test.each([
  'automobile industry',
  'research đang mắc gì',
  'use case này sao',
  'hôm nay học C',
  'Hôm nay nên làm gì?',
  'Tuần này tôi sẽ làm gì?', // "sẽ" is not the alias SE: short aliases keep their diacritics
  'kết quả ra sao', // "ra" is a common word: the alias RA must be typed in capitals
  'se thế nào', // "se" too
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

test('alias ngắn giữ dấu: chỉ khớp token gốc cùng chữ cái và dấu', () => {
  const vi = [{ id: 'dao', name: 'Triết học', aliases: ['Đạo'] }];
  expect(matchAreas(['đạo đức học'], vi)).toEqual(['dao']);
  expect(matchAreas(['dao kéo'], vi)).toEqual([]);
  expect(matchAreas(['ĐẠO là gì'], vi)).toEqual(['dao']);
});

test('tên mục vẫn khớp không phân biệt dấu dù ngắn', () => {
  expect(matchAreas(['dao kéo'], [{ id: 'dao', name: 'Đạo', aliases: [] }])).toEqual(['dao']);
});
