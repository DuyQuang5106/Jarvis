'use client';

import { LockIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { MISSING_LABEL } from '@/lib/labels';
import { areaProgress, countdownText, emptyProgressHint, updatedText } from '@/lib/progress';
import type { AreaSummary, MissingFlag, NearestDate } from '@/server/queries/snapshot';
import { AreaStatusBadge } from './area-status-badge';
import { ProgressBar } from './progress-bar';

/** Said by the progress line itself (`Chưa có topic`), so not repeated as a badge. */
const SHOWN_AS_HINT: MissingFlag[] = ['no_topics', 'no_milestones'];

/** `Thi sau 12 ngày · Giữa kỳ (dự kiến)`; an overdue date is worded as such and set apart, not only coloured. */
export function Countdown({ nearest, className }: { nearest: NearestDate; className?: string }) {
  const overdue = nearest.daysLeft < 0;
  return (
    <span data-testid="countdown" data-overdue={overdue || undefined} className={className}>
      <span className={overdue ? 'font-semibold text-destructive' : 'font-medium text-foreground'}>{countdownText(nearest)}</span>
      {nearest.title && <span> · {nearest.title}</span>}
    </span>
  );
}

export function AreaRow({ area, onOpen }: { area: AreaSummary; onOpen: (a: AreaSummary) => void }) {
  const progress = areaProgress(area);
  const badges = area.missing.filter((m) => !SHOWN_AS_HINT.includes(m));
  return (
    <li className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => onOpen(area)}
        className="flex min-h-11 w-full flex-col gap-1.5 rounded-lg p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium">{area.name}</span>
          {area.aiExcluded && <LockIcon aria-label="Không gửi cho AI" className="size-4 shrink-0 text-muted-foreground" />}
          <AreaStatusBadge status={area.status} />
        </span>
        {area.nextAction?.trim() && <span className="min-w-0 text-sm wrap-anywhere text-muted-foreground">{area.nextAction}</span>}
        {progress.total > 0 ? (
          <ProgressBar progress={progress} decorative />
        ) : (
          <span data-testid="progress-empty" className="text-xs text-muted-foreground">{emptyProgressHint(progress.unit)}</span>
        )}
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {area.nearestDate && <Countdown nearest={area.nearestDate} className="max-w-full min-w-0 truncate" />}
          <span>{updatedText(area.daysSinceUpdate)}</span>
        </span>
        {(badges.length > 0 || area.openBlockers.length > 0 || area.lastOrigin === 'seed') && (
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {badges.map((m) => (
              <Badge key={m} variant="outline">{MISSING_LABEL[m]}</Badge>
            ))}
            {area.openBlockers.length > 0 && (
              <Badge variant="destructive">{area.openBlockers.length} blocker</Badge>
            )}
            {area.lastOrigin === 'seed' && <Badge variant="outline">chưa xác minh lại</Badge>}
          </span>
        )}
      </button>
    </li>
  );
}
