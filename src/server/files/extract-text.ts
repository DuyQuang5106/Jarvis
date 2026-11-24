import { extractText as extractPdfText } from 'unpdf';
import { MAX_EXTRACTED_TEXT_CHARS, type AllowedExt } from './policy';
import { readZipEntries, xmlToPlainText } from './zip-xml';

function clampText(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_EXTRACTED_TEXT_CHARS ? trimmed.slice(0, MAX_EXTRACTED_TEXT_CHARS) : trimmed;
}

function slideNumber(name: string): number {
  const match = name.match(/slide(\d+)\.xml$/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  try {
    // Pass a copy: pdf.js may transfer/detach the underlying ArrayBuffer.
    const { text } = await extractPdfText(new Uint8Array(bytes), { mergePages: true });
    return clampText(typeof text === 'string' ? text : '');
  } catch {
    return '';
  }
}

function extractDocx(bytes: Uint8Array): string {
  const entries = readZipEntries(bytes, (n) => /^word\/(document|header\d*|footer\d*)\.xml$/i.test(n));
  if (entries.length === 0) return '';
  entries.sort((a, b) => (a.name.endsWith('document.xml') ? -1 : b.name.endsWith('document.xml') ? 1 : a.name.localeCompare(b.name)));
  return clampText(entries.map((e) => xmlToPlainText(e.data.toString('utf8'))).filter(Boolean).join('\n\n'));
}

function extractPptx(bytes: Uint8Array): string {
  const slides = readZipEntries(bytes, (n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n));
  if (slides.length === 0) return '';
  slides.sort((a, b) => slideNumber(a.name) - slideNumber(b.name));
  const parts: string[] = [];
  for (const s of slides) {
    const text = xmlToPlainText(s.data.toString('utf8'));
    if (text) parts.push(`[Slide ${slideNumber(s.name)}]\n${text}`);
  }
  return clampText(parts.join('\n\n'));
}

export async function extractTextFromBuffer(bytes: Uint8Array, ext: AllowedExt): Promise<string> {
  if (ext === 'md' || ext === 'txt' || ext === 'csv' || ext === 'json') {
    return clampText(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('utf8'));
  }
  if (ext === 'pdf') return extractPdf(bytes);
  if (ext === 'docx') return extractDocx(bytes);
  if (ext === 'pptx') return extractPptx(bytes);
  return '';
}
