import { isFromDocumentsRequest } from '@/lib/from-documents';
import { normalizeVi } from '../ai/match-areas';

/** The user reports something done or asks for a change (accent-free, whole words). */
const REPORT_OR_COMMAND = [
  'them',
  'ghi',
  'ghi nhan',
  'cap nhat',
  'danh dau',
  'sua',
  'doi',
  'tao',
  'luu',
  'nho giup',
  'xoa',
  'da xong',
  'xong roi',
  'hoan thanh',
  'da hoc',
  'hoc xong',
  'lam xong',
  'da nop',
  'nop roi',
  'da lam',
  'vua hoc',
  'vua lam',
];

/** The user only asks (accent-free, whole words). */
const QUESTION = [
  'the nao',
  'sao roi',
  'den dau',
  'bao nhieu',
  'khi nao',
  'la gi',
  'co nen',
  'nen lam gi',
  'nen hoc gi',
  'phan tich',
  'kiem tra',
  'tinh hinh',
  'tom tat',
  'liet ke',
  'cho toi biet',
];

/** Sentence-final particles that leave a question a question (`đến đâu rồi`, `đến đâu vậy`). */
const PARTICLES = new Set(['roi', 'vay', 'nhi', 'the', 'a', 'ha', 'chua', 'nhe', 'day']);

const hasPhrase = (plain: string, phrase: string) => ` ${plain} `.includes(` ${phrase} `);

/**
 * `đang học đến <chỗ>` reports progress; `đang học đến đâu (rồi)` asks it. Without accents `đâu` and `đầu`
 * are both `dau`, so a bare `dau` (plus particles) after the phrase counts as the question.
 */
function reportsReachedPoint(plain: string): boolean {
  const marker = ' dang hoc den ';
  const at = ` ${plain} `.indexOf(marker);
  if (at < 0) return false;
  const rest = ` ${plain} `
    .slice(at + marker.length)
    .split(' ')
    .filter((w) => w && !PARTICLES.has(w));
  return !(rest.length === 0 || (rest.length === 1 && rest[0] === 'dau'));
}

/** A score: `8/10`, `7,5 / 10`, `được 8 điểm`, `điểm 9`. */
function reportsScore(text: string): boolean {
  const plain = text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
  return (
    /\b\d+(?:[.,]\d+)?\s*\/\s*\d+\b/.test(plain) ||
    /\b\d+(?:[.,]\d+)?\s*diem\b/.test(plain) ||
    /\bdiem\s*(?:so\s*)?:?\s*\d/.test(plain)
  );
}

/**
 * Whether this turn may carry a proposal: false for a pure question, true when the message reports or
 * commands something (even with a question mark), true by default.
 */
export function allowsProposal(message: string): boolean {
  // `Tạo từ tài liệu` is a command whatever the area is called (a name may read like a question).
  if (isFromDocumentsRequest(message)) return true;
  const plain = normalizeVi(message);
  if (REPORT_OR_COMMAND.some((p) => hasPhrase(plain, p)) || reportsReachedPoint(plain) || reportsScore(message)) return true;
  const asks = message.trim().endsWith('?') || QUESTION.some((p) => hasPhrase(plain, p));
  return !asks;
}
