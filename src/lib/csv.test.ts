import { expect, test } from 'vitest';
import { parseCsv } from './csv';

test('parseCsv xử lý BOM, dấu phẩy trong ngoặc kép, dấu ngoặc kép thoát và xuống dòng trong ô', () => {
  const raw = '\uFEFFid,question,note\r\nE001,"Câu 1, phần A","Dòng 1\n""trích dẫn"""\r\nE002,Đơn giản,OK\r\n';
  const parsed = parseCsv(raw);
  expect(parsed.headers).toEqual(['id', 'question', 'note']);
  expect(parsed.rows).toEqual([
    ['E001', 'Câu 1, phần A', 'Dòng 1\n"trích dẫn"'],
    ['E002', 'Đơn giản', 'OK'],
  ]);
  expect(parsed.truncated).toBe(false);
});

test('parseCsv cắt đúng maxRows và chuẩn hóa số cột theo header', () => {
  const lines = ['a,b', '1,2,extra', '3', '4,5'].join('\n');
  const parsed = parseCsv(lines, 2);
  expect(parsed.rows).toEqual([
    ['1', '2', 'extra'],
    ['3', ''],
  ]);
  expect(parsed.truncated).toBe(true);
});

test('parseCsv trả rỗng với chuỗi trống', () => {
  expect(parseCsv('   \n  ')).toEqual({ headers: [], rows: [], totalRows: 0, truncated: false });
});
