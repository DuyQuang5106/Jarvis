import { headers } from 'next/headers';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { TodayView } from '@/components/today/today-view';
import { getDb } from '@/db/client';
import { APP_TZ, todayIn } from '@/lib/dates';
import { attentionAreas, focusItem, upcomingWeek } from '@/lib/overview';
import { requireOwner } from '@/server/auth';
import { getDailyBrief } from '@/server/brief/daily-brief';
import { getPendingCheckin, loadCheckinConfig } from '@/server/checkin/checkin';
import { getAreaGlance, getAreaMetrics } from '@/server/queries/area-metrics';
import { getPortfolioSnapshot } from '@/server/queries/snapshot';
import { dueReminders } from '@/server/reminders/reminders';
import { requestNow } from '@/server/request-now';
import { getWeeklyReviewCard } from '@/server/review/weekly-review';

export const metadata = { title: 'Hôm nay' };
// The brief and weekly review cards call the AI through their own routes; this page only reads what is stored.
export const maxDuration = 60;

export default function TodayPage() {
  return (
    <Suspense fallback={null}>
      <Today />
    </Suspense>
  );
}

async function Today() {
  await connection();
  await requireOwner();
  const db = await getDb();
  // The clock can be set by E2E runs (requestNow), as on the chat page.
  const now = requestNow(await headers());
  const today = todayIn(APP_TZ, now);
  const [snapshot, metrics, glance, brief, checkin, weeklyReview, reminders] = await Promise.all([
    getPortfolioSnapshot(db, now),
    getAreaMetrics(db, now),
    getAreaGlance(db, now),
    getDailyBrief(db, today),
    loadCheckinConfig(db).then((cfg) => getPendingCheckin(db, now, cfg)),
    getWeeklyReviewCard(db, now, APP_TZ),
    dueReminders(db, now),
  ]);
  const attention = attentionAreas(snapshot.areas, metrics.byArea);
  return (
    <TodayView
      dateLabel={`${snapshot.weekday} ${today.slice(8, 10)}/${today.slice(5, 7)}`}
      reminders={reminders}
      attention={attention.map((a) => ({ id: a.id, name: a.name }))}
      upcoming={upcomingWeek(snapshot)}
      week={metrics.week}
      focus={focusItem(attention, metrics.byArea, glance)}
      brief={brief}
      // Nothing the AI may read: no brief, and no request for one.
      showBrief={brief !== null || snapshot.areas.some((a) => !a.aiExcluded)}
      checkin={checkin}
      weeklyReview={weeklyReview}
      today={today}
    />
  );
}
