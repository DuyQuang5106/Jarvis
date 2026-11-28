'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { queueChatPreset } from '@/components/chat/chat-preset';
import { CheckinCard } from '@/components/chat/checkin-card';
import { DailyBriefCard } from '@/components/chat/daily-brief-card';
import { ReminderCards } from '@/components/chat/reminder-cards';
import { WeeklyReviewCard, WeeklyReviewLink } from '@/components/chat/weekly-review-card';
import { ContextOverview, type FocusItem, type UpcomingItem } from '@/components/context/context-overview';
import type { WeekDelta } from '@/lib/state-metrics';
import type { DailyBrief } from '@/server/brief/daily-brief';
import type { PendingCheckin } from '@/server/checkin/checkin';
import type { ReminderView } from '@/server/reminders/reminders';
import type { WeeklyReviewCard as WeeklyReviewCardData } from '@/server/review/weekly-review';

/**
 * The phone's "Hôm nay" tab: what is due now (reminders), the overview of every subject, the one thing to do, and
 * the day's cards. A card that answers in words (check-in, "Bắt đầu việc 1") sends it in "Chung".
 */
export function TodayView({
  dateLabel,
  reminders,
  attention,
  upcoming,
  week,
  focus,
  brief,
  showBrief,
  checkin,
  weeklyReview,
  today,
}: {
  dateLabel: string;
  reminders: ReminderView[];
  attention: { id: string; name: string }[];
  upcoming: UpcomingItem[];
  week: WeekDelta;
  focus: FocusItem | null;
  brief: DailyBrief | null;
  showBrief: boolean;
  checkin: PendingCheckin | null;
  weeklyReview: WeeklyReviewCardData | null;
  today: string;
}) {
  const router = useRouter();
  const [manualReview, setManualReview] = useState(0);
  const sendInGeneral = (message: string) => {
    queueChatPreset({ scope: { mode: 'auto' }, message });
    router.push('/chat');
  };
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Hôm nay</h1>
        <p className="text-sm text-muted-foreground">{dateLabel}</p>
      </header>
      <ReminderCards initial={reminders} />
      <ContextOverview attention={attention} upcoming={upcoming} week={week} focus={focus} onOpen={(id) => router.push(`/context?item=${id}`)} />
      {checkin && <CheckinCard key={checkin.slots.map((s) => `${s.day}:${s.slot}`).join(',')} initial={checkin} onSend={sendInGeneral} />}
      <WeeklyReviewCard initial={weeklyReview} manualRequest={manualReview} />
      {showBrief && <DailyBriefCard initial={brief} today={today} onStart={sendInGeneral} />}
      <div className="flex justify-center">
        <WeeklyReviewLink onClick={() => setManualReview((n) => n + 1)} />
      </div>
    </div>
  );
}
