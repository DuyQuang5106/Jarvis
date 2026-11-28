import { z } from 'zod';

/**
 * Which scheduled notifications are on, and the quiet hours (kept in `settings.preferences_json.notify`).
 * Reminders the owner asked for are always sent at their time, quiet hours or not.
 */
export type NotifyPrefs = { checkin: boolean; weekly: boolean; brief: boolean; quietStart: string; quietEnd: string };

export const DEFAULT_NOTIFY: NotifyPrefs = { checkin: true, weekly: true, brief: true, quietStart: '23:00', quietEnd: '07:00' };

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Giờ cần dạng HH:MM.' });

export const NotifyPrefsSchema = z
  .object({ checkin: z.boolean(), weekly: z.boolean(), brief: z.boolean(), quietStart: hhmm, quietEnd: hhmm })
  .partial()
  .strict();

export function readNotifyPrefs(preferences: unknown): NotifyPrefs {
  const p = preferences && typeof preferences === 'object' ? (preferences as Record<string, unknown>).notify : undefined;
  const parsed = NotifyPrefsSchema.safeParse(p ?? {});
  return { ...DEFAULT_NOTIFY, ...(parsed.success ? parsed.data : {}) };
}

/** Quiet hours may wrap midnight (23:00–07:00). Equal start and end means no quiet hours. */
export function inQuietHours(time: string, start: string, end: string): boolean {
  if (start === end) return false;
  return start < end ? time >= start && time < end : time >= start || time < end;
}

/** The morning brief notification goes out from 07:30 until 11:00, once a day. */
export const BRIEF_FROM = '07:30';
export const BRIEF_UNTIL = '11:00';
