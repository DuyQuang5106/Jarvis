import { inflateRawSync } from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

export type ZipEntry = { name: string; data: Buffer };

/** Minimal ZIP reader over EOCD + central directory supporting Store (0) and Deflate (8). */
export function readZipEntries(input: Uint8Array, filter?: (name: string) => boolean): ZipEntry[] {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (buf.length < 22) return [];

  let eocdOffset = -1;
  const minOffset = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minOffset; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) return [];

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  if (cdOffset >= buf.length) return [];

  const entries: ZipEntry[] = [];
  let cursor = cdOffset;
  for (let i = 0; i < totalEntries && cursor + 46 <= buf.length; i += 1) {
    if (buf.readUInt32LE(cursor) !== CENTRAL_SIG) break;
    const method = buf.readUInt16LE(cursor + 10);
    const compSize = buf.readUInt32LE(cursor + 20);
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    const localHeaderOffset = buf.readUInt32LE(cursor + 42);
    const name = buf.toString('utf8', cursor + 46, cursor + 46 + nameLen);
    cursor += 46 + nameLen + extraLen + commentLen;

    if (filter && !filter(name)) continue;
    if (localHeaderOffset + 30 > buf.length || buf.readUInt32LE(localHeaderOffset) !== LOCAL_SIG) continue;
    const lNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const lExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen;
    if (dataStart + compSize > buf.length) continue;

    const compressed = buf.subarray(dataStart, dataStart + compSize);
    try {
      if (method === 0) entries.push({ name, data: Buffer.from(compressed) });
      else if (method === 8) entries.push({ name, data: inflateRawSync(compressed) });
    } catch {
      // Skip corrupted individual ZIP member without failing the whole document.
    }
  }
  return entries;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
}

export function xmlToPlainText(xml: string): string {
  const withBreaks = xml
    .replace(/<\/(?:w:p|a:p|w:tr|a:tr|p:txBody)>/g, '\n')
    .replace(/<(?:w:br|a:br|w:tab|a:tab)\b[^>]*\/>/g, ' ');
  const stripped = withBreaks.replace(/<[^>]+>/g, '');
  return decodeXmlEntities(stripped)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
