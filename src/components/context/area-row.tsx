'use client';

import { LockIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { APP_TZ } from '@/lib/dates';
import { MISSING_LABEL } from '@/lib/labels';
import type { AreaSummary } from '@/server/queries/snapshot';
import { AreaStatusBadge } from './area-status-badge';

const dayMonth = new Intl.DateTimeFormat('en-GB', { timeZone: APP_TZ, day: '2-digit', month: '2-digit' });

export function progressText(a: AreaSummary): string | null {
  if (a.nextAction?.trim()) return a.nextAction;
  const { topics, milestones } = a.counts;
  if (topics) {
    const total = Object.values(topics).reduce((s, n) => s + n, 0);
    if (total > 0) return `${topics.practiced + topics.confident}/${total} topics Practiced trở lên`;
  }
  if (milestones) {
    const total = Object.values(milestones).reduce((s, n) => s + n, 0);
    if (total > 0) return `${milestones.done}/${total} milestones Done`;
  }
  return null;
}

export function AreaRow({ area, onOpen }: { area: AreaSummary; onOpen: (a: AreaSummary) => void }) {
  const progress = progressText(area);
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
        {progress && <span className="min-w-0 text-sm wrap-anywhere text-muted-foreground">{progress}</span>}
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>Cập nhật {dayMonth.format(new Date(area.updatedAt))}</span>
          {area.missing.map((m) => (
            <Badge key={m} variant="outline">{MISSING_LABEL[m]}</Badge>
          ))}
          {area.openBlockers.length > 0 && (
            <Badge variant="destructive">{area.openBlockers.length} blocker</Badge>
          )}
          {area.lastOrigin === 'seed' && <Badge variant="outline">chưa xác minh lại</Badge>}
        </span>
      </button>
    </li>
  );
}
