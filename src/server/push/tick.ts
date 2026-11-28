import { isNull, ne, and, count } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { areas, notificationLog } from '@/db/schema';
import { APP_TZ, todayIn } from '@/lib/dates';
import { BRIEF_FROM, BRIEF_UNTIL, inQuietHours, readNotifyPrefs } from '@/lib/notify-prefs';
import { getPendingCheckin, loadCheckinConfig } from '../checkin/checkin';
import { markSent, unsentDue } from '../reminders/reminders';
import { getWeeklyReviewCard } from '../review/weekly-review';
import { getSettings } from '../services/settings';
import { sendToAll, type PushPayload, type PushSender } from './send';

export type TickReport = { sent: string[]; quiet: boolean };

const localTime = (now: Date, tz: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);

/** Claims a notification key; false when an earlier tick (or a concurrent one) already sent it. */
async function claim(db: DbOrTx, key: string, kind: string): Promise<boolean> {
  const rows = await db.insert(notificationLog).values({ key, kind }).onConflictDoNothing().returning({ key: notificationLog.key });
  return rows.length > 0;
}

/**
 * One scheduler tick (every few minutes, from Supabase pg_cron). In order:
 * 1. reminders whose time has come (always, quiet hours or not: the owner asked for that time);
 * then, outside quiet hours and only for the kinds turned on:
 * 2. the check-in of a day slot that just ended (N1);
 * 3. the weekly review, from Sunday evening (N2);
 * 4. the morning brief, from 07:30 (M5).
 * Each scheduled notification is claimed in `notification_log` first, so a repeated tick sends nothing twice.
 */
export async function runTick(db: DbOrTx, now: Date, send: PushSender, tz: string = APP_TZ): Promise<TickReport> {
  const sent: string[] = [];
  const push = async (key: string, payload: PushPayload) => {
    await sendToAll(db, payload, send, now);
    sent.push(key);
  };

  const due = await unsentDue(db, now);
  for (const r of due) await push(`reminder:${r.id}`, { title: 'Nhắc việc', body: r.text, url: '/chat', tag: `reminder-${r.id}` });
  await markSent(db, due.map((r) => r.id), now);

  const prefs = readNotifyPrefs((await getSettings(db)).preferencesJson);
  const time = localTime(now, tz);
  if (inQuietHours(time, prefs.quietStart, prefs.quietEnd)) return { sent, quiet: true };

  if (prefs.checkin) {
    const checkin = await getPendingCheckin(db, now, await loadCheckinConfig(db));
    if (checkin) {
      const key = `checkin:${checkin.day}:${checkin.slots.map((s) => s.slot).join('+')}`;
      if (await claim(db, key, 'checkin')) {
        await push(key, { title: 'Check-in', body: `${checkin.label} bạn đã làm gì? Mở để ghi lại.`, url: '/chat', tag: 'checkin' });
      }
    }
  }

  if (prefs.weekly) {
    const review = await getWeeklyReviewCard(db, now, tz);
    if (review) {
      const key = `weekly:${review.weekStart}`;
      if (await claim(db, key, 'weekly')) {
        await push(key, { title: 'Tổng kết tuần', body: 'Tuần này đã có đủ dữ liệu để tổng kết. Mở để xem và duyệt.', url: '/chat', tag: 'weekly' });
      }
    }
  }

  if (prefs.brief && time >= BRIEF_FROM && time < BRIEF_UNTIL) {
    const [{ open }] = await db
      .select({ open: count() })
      .from(areas)
      .where(and(isNull(areas.archivedAt), ne(areas.status, 'completed'), ne(areas.aiExcluded, true)));
    const key = `brief:${todayIn(tz, now)}`;
    if (open > 0 && (await claim(db, key, 'brief'))) {
      await push(key, { title: 'Hôm nay', body: 'Mở Jarvis xem 3 việc nên làm hôm nay.', url: '/chat', tag: 'brief' });
    }
  }
  return { sent, quiet: false };
}
