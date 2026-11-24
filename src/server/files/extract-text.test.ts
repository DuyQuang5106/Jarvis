import { deflateRawSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { extractTextFromBuffer } from './extract-text';
import { MAX_FILE_BYTES, classifyUploadedFile } from './policy';

/** Builds a minimal valid deflated ZIP archive from UTF-8 entries for unit testing DOCX/PPTX extraction. */
function makeZip(entries: { name: string; content: string }[]): Uint8Array {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const raw = Buffer.from(entry.content, 'utf8');
    const comp = deflateRawSync(raw);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    localParts.push(local, comp);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centralParts.push(central);

    offset += local.length + comp.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return new Uint8Array(Buffer.concat([...localParts, centralBuf, eocd]));
}

test('policy chấp nhận định dạng cho phép và từ chối SVG, HTML, LNK, quá 25MB', () => {
  expect(classifyUploadedFile({ filename: 'Lecture_1.PDF', mimeType: 'application/pdf', sizeBytes: 1024 })).toMatchObject({
    ext: 'pdf',
    kind: 'binary',
    title: 'Lecture_1.PDF',
    mimeType: 'application/pdf',
  });
  expect(classifyUploadedFile({ filename: 'QUESTION_INDEX.csv', mimeType: 'application/vnd.ms-excel', sizeBytes: 500 })).toMatchObject({
    ext: 'csv',
    kind: 'text',
    mimeType: 'text/csv',
  });
  for (const bad of ['payload.svg', 'index.html', 'Perplexity.lnk', 'run.exe', 'noext']) {
    expect(() => classifyUploadedFile({ filename: bad, mimeType: 'application/octet-stream', sizeBytes: 10 })).toThrow(/Định dạng tệp/);
  }
  expect(() => classifyUploadedFile({ filename: 'huge.pdf', mimeType: 'application/pdf', sizeBytes: MAX_FILE_BYTES + 1 })).toThrow(/25 MB/);
});

test('trích xuất text sạch từ .docx và .pptx theo đúng thứ tự slide', async () => {
  const docx = makeZip([
    {
      name: 'word/document.xml',
      content: '<w:document><w:body><w:p><w:r><w:t>Đề cương môn Database</w:t></w:r></w:p><w:p><w:r><w:t>50% quá trình &amp; 50% cuối kỳ</w:t></w:r></w:p></w:body></w:document>',
    },
  ]);
  const docxText = await extractTextFromBuffer(docx, 'docx');
  expect(docxText).toContain('Đề cương môn Database');
  expect(docxText).toContain('50% quá trình & 50% cuối kỳ');

  const pptx = makeZip([
    { name: 'ppt/slides/slide10.xml', content: '<p:sld><a:t>Slide mười TCP</a:t></p:sld>' },
    { name: 'ppt/slides/slide2.xml', content: '<p:sld><a:t>Slide hai Physical Layer</a:t></p:sld>' },
  ]);
  const pptxText = await extractTextFromBuffer(pptx, 'pptx');
  expect(pptxText.indexOf('Slide hai Physical Layer')).toBeLessThan(pptxText.indexOf('Slide mười TCP'));
});

test('trích xuất text từ PDF hợp lệ qua unpdf', async () => {
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
    '4 0 obj << /Length 44 >> stream\nBT /F1 12 Tf 20 150 Td (Hello Jarvis PDF) Tj ET\nendstream endobj\n',
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const extracted = await extractTextFromBuffer(Buffer.from(pdf, 'utf8'), 'pdf');
  expect(extracted).toContain('Hello Jarvis PDF');
});

test('tệp PDF hỏng hoặc ảnh trả về chuỗi rỗng an toàn, không ném lỗi', async () => {
  expect(await extractTextFromBuffer(new Uint8Array([0xff, 0xd8, 0xff]), 'jpg')).toBe('');
  expect(await extractTextFromBuffer(new Uint8Array([1, 2, 3]), 'pdf')).toBe('');
});
