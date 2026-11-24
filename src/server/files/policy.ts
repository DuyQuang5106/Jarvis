import { ValidationError } from '@/server/errors';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_EXTRACTED_TEXT_CHARS = 500_000;

export type AllowedTextExt = 'md' | 'txt' | 'csv' | 'json';
export type AllowedBinaryExt = 'pdf' | 'docx' | 'pptx' | 'png' | 'jpg' | 'jpeg' | 'webp';
export type AllowedExt = AllowedTextExt | AllowedBinaryExt;

export const TEXT_EXT_MIME: Record<AllowedTextExt, string> = {
  md: 'text/markdown',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
};

export const BINARY_EXT_MIME: Record<AllowedBinaryExt, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export type ClassifiedFile = {
  ext: AllowedExt;
  kind: 'text' | 'binary';
  mimeType: string;
  title: string;
};

export function classifyUploadedFile(input: {
  filename: string;
  mimeType?: string;
  sizeBytes: number;
}): ClassifiedFile {
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new ValidationError('Tệp trống hoặc kích thước không hợp lệ.');
  }
  if (input.sizeBytes > MAX_FILE_BYTES) {
    throw new ValidationError('Tệp vượt quá giới hạn 25 MB.');
  }
  const base = input.filename.replace(/\\/g, '/').split('/').pop()?.trim() ?? '';
  const dot = base.lastIndexOf('.');
  if (!base || dot <= 0 || dot === base.length - 1) {
    throw new ValidationError('Định dạng tệp không được hỗ trợ.');
  }
  const ext = base.slice(dot + 1).toLowerCase();
  if (Object.hasOwn(TEXT_EXT_MIME, ext)) {
    const typed = ext as AllowedTextExt;
    return { ext: typed, kind: 'text', mimeType: TEXT_EXT_MIME[typed], title: base.slice(0, 200) };
  }
  if (Object.hasOwn(BINARY_EXT_MIME, ext)) {
    const typed = ext as AllowedBinaryExt;
    return { ext: typed, kind: 'binary', mimeType: BINARY_EXT_MIME[typed], title: base.slice(0, 200) };
  }
  throw new ValidationError(
    `Định dạng tệp .${ext} không được hỗ trợ. Chỉ nhận: md, txt, csv, json, pdf, docx, pptx, png, jpg, webp.`,
  );
}

export function isImageExt(ext: string): boolean {
  const e = ext.toLowerCase();
  return e === 'png' || e === 'jpg' || e === 'jpeg' || e === 'webp';
}

export function isInlinePreviewable(ext: string): boolean {
  const e = ext.toLowerCase();
  return e === 'pdf' || isImageExt(e);
}
