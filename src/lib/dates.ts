export const APP_TZ = 'Asia/Ho_Chi_Minh';

const WEEKDAYS_VI = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function parse(dateStr: string): number {
  const m = DATE_RE.exec(dateStr);
  if (!m) throw new Error(`Invalid date string: ${dateStr}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function format(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Ngày hiện tại (YYYY-MM-DD) tại múi giờ `tz`. */
export function todayIn(tz: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Số ngày từ `today` đến `dateStr`; âm nghĩa là quá hạn. */
export function daysUntil(dateStr: string, today: string): number {
  return Math.round((parse(dateStr) - parse(today)) / DAY_MS);
}

/** Số ngày lịch giữa ngày của `at` (tại `tz`) và `today`. */
export function daysSince(at: Date, today: string, tz: string): number {
  return daysUntil(today, todayIn(tz, at));
}

/** Tuần chứa `today`: thứ Hai đến Chủ nhật. */
export function weekRange(today: string): { start: string; end: string } {
  const ms = parse(today);
  const dow = (new Date(ms).getUTCDay() + 6) % 7; // 0 = thứ Hai
  const start = ms - dow * DAY_MS;
  return { start: format(start), end: format(start + 6 * DAY_MS) };
}

export function weekdayVi(dateStr: string): string {
  return WEEKDAYS_VI[(new Date(parse(dateStr)).getUTCDay() + 6) % 7];
}

/** 'YYYY-MM-DD' -> 'DD/MM'. */
export function formatDateVi(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

export function isValidDateStr(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  return format(parse(s)) === s;
}

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY'. */
export function formatDateFullVi(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/** An instant as `dd/MM HH:mm` in `tz` (the activity timeline). */
export function formatDateTimeVi(at: Date | string, tz: string = APP_TZ): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(at));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}/${get('month')} ${get('hour')}:${get('minute')}`;
}
