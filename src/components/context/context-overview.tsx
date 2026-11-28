'use client';

import { Button } from '@/components/ui/button';
import { deltaLabel, type WeekDelta } from '@/lib/state-metrics';

export type UpcomingItem = { key: string; title: string; areaName: string; daysLeft: number };
export type FocusItem = { areaId: string; areaName: string; action: string | null; reason: string };

const when = (d: number) => (d < 0 ? `quá hạn ${-d} ngày` : d === 0 ? 'hôm nay' : d === 1 ? 'ngày mai' : `còn ${d} ngày`);

/**
 * The 5-second layer of Context (docs/context-2.md): what needs attention, what is due within a week, what
 * changed this week, and the one thing to do now. No overall percentage: subjects and projects do not add up.
 */
export function ContextOverview({
  attention,
  upcoming,
  week,
  focus,
  onOpen,
}: {
  attention: { id: string; name: string }[];
  upcoming: UpcomingItem[];
  week: WeekDelta;
  focus: FocusItem | null;
  onOpen: (areaId: string) => void;
}) {
  const changed = deltaLabel(week);
  return (
    <section aria-label="Tổng quan" className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Tile label="Cần chú ý" value={String(attention.length)} detail={attention.length > 0 ? attention.map((a) => a.name).join(' · ') : 'Không có mục nào lệch hướng hay có rủi ro'} />
        <Tile
          label="Sắp tới hạn · 7 ngày"
          value={String(upcoming.length)}
          detail={upcoming.length > 0 ? upcoming.slice(0, 3).map((u) => `${u.title} (${u.areaName}, ${when(u.daysLeft)})`).join(' · ') : 'Không có hạn hay lịch thi trong 7 ngày'}
        />
        <Tile label="Thay đổi tuần này" value={changed ? `+${week.levelUps + week.tasksDone + week.milestonesDone + week.datesChanged}` : '0'} detail={changed ?? 'Chưa có thay đổi nào được ghi tuần này'} />
      </div>
      {focus && (
        <div data-testid="focus" className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
          <div className="min-w-0 flex-[999_1_320px] space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Nên làm bây giờ</p>
            <p className="font-semibold">
              {focus.areaName}
              {focus.action ? ` — ${focus.action}` : ''}
            </p>
            <p className="text-sm text-muted-foreground">Vì: {focus.reason}</p>
          </div>
          <Button type="button" className="min-h-11" onClick={() => onOpen(focus.areaId)}>Mở {focus.areaName}</Button>
        </div>
      )}
    </section>
  );
}

function Tile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 space-y-1 rounded-xl border bg-card p-3 sm:p-4">
      <p className="text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {/* On a phone the three tiles share one row: the detail is for wider screens (and screen readers). */}
      <p className="sr-only line-clamp-2 text-xs text-muted-foreground sm:not-sr-only">{detail}</p>
    </div>
  );
}
