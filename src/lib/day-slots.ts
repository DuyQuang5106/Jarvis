import { z } from 'zod';
import { SLOT_KEYS, type SlotKey } from '@/db/enums';
import { formatDateVi, todayIn } from './dates';

export { SLOT_KEYS, type SlotKey };

export const SLOT_NAME: Record<SlotKey, string> = { morning: 'Sáng', noon: 'Trưa', afternoon: 'Chiều', evening: 'Tối' };

/** Local wall-clock times `HH:MM`; `end` is exclusive. */
export type SlotTimes = { start: string; end: string };
export type DaySlots = Record<SlotKey, SlotTimes>;

export const DEFAULT_DAY_SLOTS: DaySlots = {
  morning: { start: '06:00', end: '11:00' },
  noon: { start: '11:00', end: '13:00' },
  afternoon: { start: '13:00', end: '18:00' },
  evening: { start: '18:00', end: '23:00' },
};

/** A slot of a given local day. */
export type DaySlot = { day: string; slot: SlotKey };

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

const time = z.string().regex(HHMM, { error: 'Giờ phải có dạng HH:MM.' });
const slotTimes = z.object({ start: time, end: time });

/** Four slots, each `start < end`, in order and not overlapping (a slot may start where the previous one ends). */
export const DaySlotsSchema = z
  .object({ morning: slotTimes, noon: slotTimes, afternoon: slotTimes, evening: slotTimes })
  .superRefine((slots, ctx) => {
    let previousEnd = -1;
    for (const key of SLOT_KEYS) {
      const { start, end } = slots[key];
      if (minutes(start) >= minutes(end)) {
        ctx.addIssue({ code: 'custom', path: [key], message: `Buổi ${SLOT_NAME[key].toLowerCase()} phải kết thúc sau khi bắt đầu.` });
        return;
      }
      if (minutes(start) < previousEnd) {
        ctx.addIssue({ code: 'custom', path: [key], message: `Buổi ${SLOT_NAME[key].toLowerCase()} chồng lên buổi trước.` });
        return;
      }
      previousEnd = minutes(end);
    }
  });

/** Check-in preferences kept in `settings.preferences_json`. */
export type CheckinPrefs = { checkinsEnabled: boolean; daySlots: DaySlots };

/** Reads the check-in preferences; anything missing or invalid falls back to the defaults (check-ins on). */
export function readCheckinPrefs(preferences: unknown): CheckinPrefs {
  const p = (preferences && typeof preferences === 'object' ? preferences : {}) as Record<string, unknown>;
  const slots = DaySlotsSchema.safeParse(p.daySlots);
  return {
    checkinsEnabled: p.checkinsEnabled !== false,
    daySlots: slots.success ? slots.data : DEFAULT_DAY_SLOTS,
  };
}

/** `tz`'s offset from UTC (ms) at `instant`. */
function tzOffsetMs(instant: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The instant of local wall time `hhmm` on `day` in `tz`. */
export function localTimeToUtc(day: string, hhmm: string, tz: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5)));
  // Two passes settle the offset around a DST change.
  let utc = wall - tzOffsetMs(wall, tz);
  utc = wall - tzOffsetMs(utc, tz);
  return new Date(utc);
}

/** `YYYY-MM-DD` plus `days`. */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** `[start, end)` of `slot` on local `day`, as instants. */
export function slotRange(day: string, slot: SlotKey, tz: string, slots: DaySlots = DEFAULT_DAY_SLOTS): { start: Date; end: Date } {
  return { start: localTimeToUtc(day, slots[slot].start, tz), end: localTimeToUtc(day, slots[slot].end, tz) };
}

const WINDOW_MS = 24 * 3_600_000;

/**
 * Slots that ended within the last 24 hours, oldest first: opening the app early in the morning still
 * offers last evening.
 */
export function endedSlots(now: Date, tz: string, slots: DaySlots = DEFAULT_DAY_SLOTS): DaySlot[] {
  const today = todayIn(tz, now);
  const out: { at: number; item: DaySlot }[] = [];
  for (const day of [addDays(today, -1), today]) {
    for (const slot of SLOT_KEYS) {
      const end = slotRange(day, slot, tz, slots).end.getTime();
      if (end <= now.getTime() && end > now.getTime() - WINDOW_MS) out.push({ at: end, item: { day, slot } });
    }
  }
  return out.sort((a, b) => a.at - b.at).map((o) => o.item);
}

/** `Sáng`, `Sáng và trưa`, `Sáng, trưa và chiều`. */
function joinNames(keys: SlotKey[]): string {
  const names = SLOT_KEYS.filter((k) => keys.includes(k)).map((k, i) => (i === 0 ? SLOT_NAME[k] : SLOT_NAME[k].toLowerCase()));
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} và ${names.at(-1)}`;
}

/** `Sáng nay`, `Sáng và trưa nay`, `Tối qua`, or `Sáng 24/11` for an older day. */
export function slotLabel(day: string, slots: SlotKey[], today: string): string {
  const when = day === today ? 'nay' : day === addDays(today, -1) ? 'qua' : formatDateVi(day);
  return `${joinNames(slots)} ${when}`;
}

/** Groups slots by day, oldest day first. */
function byDay(items: DaySlot[]): { day: string; slots: SlotKey[] }[] {
  const days = [...new Set(items.map((i) => i.day))].sort();
  return days.map((day) => ({ day, slots: items.filter((i) => i.day === day).map((i) => i.slot) }));
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The label of a card covering `items`: `Sáng nay`, `Tối qua và sáng nay`. */
export function checkinLabel(items: DaySlot[], today: string): string {
  return byDay(items)
    .map((g, i) => (i === 0 ? slotLabel(g.day, g.slots, today) : lowerFirst(slotLabel(g.day, g.slots, today))))
    .join(' và ');
}

/** The slots with their dates, for a chat message: `sáng 26/11`, `sáng và trưa 26/11`, `tối 25/11 và sáng 26/11`. */
export function slotsPhrase(items: DaySlot[]): string {
  return byDay(items)
    .map((g) => `${joinNames(g.slots).toLowerCase()} ${formatDateVi(g.day)}`)
    .join(' và ');
}

export const slotId = (s: DaySlot) => `${s.day}:${s.slot}`;
