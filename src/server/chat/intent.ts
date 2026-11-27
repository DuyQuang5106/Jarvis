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
  'chua luyen',
  'chua hoc',
  'chua lam',
  'muc tieu',
  'nhac toi',
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

/**
 * New information about an area that its documents may not hold yet: a decision, a test result, a problem,
 * a change of plan, an announcement (accent-free, whole words).
 */
const NEW_INFORMATION = [
  'quyet dinh',
  'chot',
  'se dung',
  'chuyen sang',
  'doi sang',
  'khong dung nua',
  'bo qua phan',
  'da thu',
  'thu nghiem',
  'ket qua',
  'bi loi',
  'bi ket',
  'vuong',
  'gap van de',
  'phat hien',
  'thay doi ke hoach',
  'doi lich',
  'thay thong bao',
  'co thong bao',
  'nhom thong nhat',
  'deadline moi',
  'lui han',
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

/** A question: ends with `?` or holds a question phrase. `plain` is the accent-free form of `message`. */
/**
 * `kiểm tra`, `phân tích`, `tóm tắt`… ask only as a request (`kiểm tra lịch thi`, `hãy tóm tắt…`); inside a
 * report they name things (`Kiểm tra trên lớp 20%`, `bài kiểm tra Lab`).
 */
const REQUEST_VERBS = ['kiem tra', 'phan tich', 'tom tat', 'liet ke', 'tinh hinh'];
const REQUEST_LEADS = ['', 'hay ', 'giup toi ', 'ban hay ', 'ban giup toi ', 'cho toi '];
const asksAsRequest = (plain: string, verb: string) => REQUEST_LEADS.some((lead) => plain.startsWith(`${lead}${verb}`));

const isQuestion = (message: string, plain: string) =>
  message.trim().endsWith('?') ||
  QUESTION.some((p) => (REQUEST_VERBS.includes(p) ? asksAsRequest(plain, p) : hasPhrase(plain, p)));

/** Extra question phrases that only matter when looking for a question anywhere in a longer message. */
const ASIDE_QUESTION = ['ngay gi', 'ngay bao nhieu', 'hom nay la', 'may gio', 'o dau', 'tai sao', 'vi sao', 'lam sao', 'nhu the nao', 'biet khong', 'duoc khong'];

/**
 * The message asks something anywhere, not only at its end (`… by the way bạn biết hôm nay là ngày gì`).
 * Used to make sure a report that also asks gets a written answer, not just a proposal.
 */
export function asksSomething(message: string): boolean {
  const plain = normalizeVi(message);
  // `kiểm tra`, `tóm tắt`… also name things (`bài kiểm tra Lab`): only the asking phrases count here.
  const asking = QUESTION.filter((p) => !REQUEST_VERBS.includes(p));
  return message.includes('?') || [...asking, ...ASIDE_QUESTION].some((p) => hasPhrase(plain, p));
}

/**
 * The user tells something new (a decision, a result, a problem, an announcement) rather than asking:
 * `có nên chuyển sang Supabase không?` is still a question. `plain` is the accent-free form ({@link normalizeVi}),
 * which drops `?`: pass the raw text as `message` so a trailing `?` still counts.
 */
export function reportsNewInformation(plain: string, message: string = plain): boolean {
  return NEW_INFORMATION.some((p) => hasPhrase(plain, p)) && !isQuestion(message, plain);
}

/**
 * Whether this turn may carry a proposal: false for a pure question, true when the message reports or
 * commands something (even with a question mark) or tells new information, true by default.
 */
export function allowsProposal(message: string): boolean {
  // `Tạo từ tài liệu` is a command whatever the area is called (a name may read like a question).
  if (isFromDocumentsRequest(message)) return true;
  const plain = normalizeVi(message);
  if (REPORT_OR_COMMAND.some((p) => hasPhrase(plain, p)) || reportsReachedPoint(plain) || reportsScore(message)) return true;
  if (reportsNewInformation(plain, message)) return true;
  return !isQuestion(message, plain);
}
