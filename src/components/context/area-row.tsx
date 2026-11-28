'use client';

import { ChevronDown, LockIcon } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { TopicStatus } from '@/db/enums';
import { MISSING_LABEL } from '@/lib/labels';
import { areaProgress, countdownText, emptyProgressHint, updatedText } from '@/lib/progress';
import { countLabel, formatPoints, HEALTH_LABEL, type Health, type HealthLevel } from '@/lib/state-metrics';
import { cn } from '@/lib/utils';
import type { AreaGlance, AreaMetrics } from '@/server/queries/area-metrics';
import type { AreaSummary, MissingFlag, NearestDate } from '@/server/queries/snapshot';
import { AreaStatusBadge } from './area-status-badge';

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

const HEALTH_STYLE: Record<HealthLevel, string> = {
  on_track: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  at_risk: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  off_track: 'bg-red-500/10 text-red-700 dark:text-red-300',
  unknown: 'bg-foreground/10 text-muted-foreground',
};

export function HealthChip({ health }: { health: Health }) {
  return (
    <span data-testid="health" data-level={health.level} className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold', HEALTH_STYLE[health.level])}>
      {HEALTH_LABEL[health.level]}
    </span>
  );
}

/**
 * Two layers for a subject: studied (light) under mastered (strong), with both counts written out. A project
 * shows milestones done. Decorative: the text next to it says the same.
 */
function StateBar({ area, metrics }: { area: AreaSummary; metrics: AreaMetrics }) {
  const p = metrics.progress;
  const project = area.kind === 'project';
  const label = project
    ? `${p.covered}/${p.total} milestone xong`
    : `Học ${p.covered}/${p.total} · Thành thạo ${formatPoints(p.masteryPoints)}/${p.total}`;
  return (
    <span data-testid="progress" className="flex min-w-0 items-center gap-2 text-sm">
      <span aria-hidden data-testid="progress-bar" className="relative block h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/15">
        <span className={cn('absolute inset-y-0 left-0 rounded-full', project ? 'bg-primary' : 'bg-primary/35')} style={{ width: `${(p.covered / p.total) * 100}%` }} />
        {!project && <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${(p.masteryPoints / p.total) * 100}%` }} />}
      </span>
      <span className="shrink-0 tabular-nums text-muted-foreground">{label}</span>
    </span>
  );
}

const LEVEL: Record<TopicStatus, { label: string; dot: string }> = {
  confident: { label: 'Vững', dot: 'bg-primary border-primary' },
  practiced: { label: 'Đã luyện', dot: 'bg-primary/60 border-primary/60' },
  familiar: { label: 'Đã học', dot: 'bg-primary/25 border-primary/40' },
  not_started: { label: 'Chưa học', dot: 'bg-transparent border-foreground/40' },
};

const dueText = (d: number | null) => (d === null ? null : d < 0 ? `quá hạn ${-d} ngày` : d === 0 ? 'hôm nay' : d === 1 ? 'ngày mai' : `còn ${d} ngày`);

function GlancePanel({ area, glance, onOpen }: { area: AreaSummary; glance: AreaGlance | undefined; onOpen: () => void }) {
  const topics = glance?.topics ?? [];
  const tasks = glance?.tasks ?? [];
  return (
    <div data-testid="glance" className="grid gap-5 border-t p-3 sm:grid-cols-2">
      {area.kind === 'academic' && (
        <section aria-label="Topic" className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">Topic</h3>
          {topics.length > 0 ? (
            <ul className="space-y-1.5">
              {topics.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <span aria-hidden className={cn('size-3 shrink-0 rounded-[3px] border', LEVEL[t.status].dot)} />
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="text-xs text-muted-foreground">{LEVEL[t.status].label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Chưa có topic. Mở môn này để thêm, hoặc nhờ Jarvis tạo từ tài liệu.</p>
          )}
        </section>
      )}
      <section aria-label="Việc đang làm" className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground">Việc đang làm</h3>
        {tasks.length > 0 ? (
          <ul className="space-y-2">
            {tasks.map((t) => {
              const count = countLabel(t.progressDone, t.progressTotal);
              const due = dueText(t.daysLeft);
              return (
                <li key={t.id} className="space-y-1 rounded-md border bg-background/40 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1">{t.title}</span>
                    {due && <span className={cn('shrink-0 text-xs', t.daysLeft! < 0 ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{due}</span>}
                  </div>
                  {count && (
                    <div className="flex items-center gap-2" data-testid="task-count">
                      <span aria-hidden className="relative block h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/15">
                        <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${(Math.min(t.progressDone!, t.progressTotal!) / t.progressTotal!) * 100}%` }} />
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Không có việc nào đang mở.</p>
        )}
        <button type="button" onClick={onOpen} className="min-h-11 text-sm font-medium text-primary underline-offset-4 hover:underline">
          Mở {area.name} →
        </button>
      </section>
    </div>
  );
}

export function AreaRow({
  area,
  metrics,
  glance,
  onOpen,
}: {
  area: AreaSummary;
  metrics?: AreaMetrics;
  glance?: AreaGlance;
  onOpen: (a: AreaSummary) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const badges = area.missing.filter((m) => !SHOWN_AS_HINT.includes(m));
  const fallback = areaProgress(area);
  const total = metrics?.progress.total ?? fallback.total;
  return (
    <li className="rounded-lg border bg-card">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => onOpen(area)}
          className="flex min-h-11 min-w-0 flex-1 flex-col gap-1.5 rounded-lg p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-medium">{area.name}</span>
            {area.aiExcluded && <LockIcon aria-label="Không gửi cho AI" className="size-4 shrink-0 text-muted-foreground" />}
            {metrics?.health && <HealthChip health={metrics.health} />}
            <AreaStatusBadge status={area.status} />
          </span>
          {metrics?.health && <span data-testid="health-reason" className="text-sm text-muted-foreground">{metrics.health.reason}</span>}
          {total > 0 && metrics ? (
            <StateBar area={area} metrics={metrics} />
          ) : (
            <span data-testid="progress-empty" className="text-xs text-muted-foreground">{emptyProgressHint(fallback.unit)}</span>
          )}
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {area.nearestDate && <Countdown nearest={area.nearestDate} className="max-w-full min-w-0 truncate" />}
            <span>{updatedText(area.daysSinceUpdate)}</span>
          </span>
          {area.nextAction?.trim() && (
            <span className="min-w-0 text-sm wrap-anywhere">
              <span className="text-muted-foreground">Tiếp theo: </span>
              {area.nextAction}
            </span>
          )}
          {(badges.length > 0 || area.openBlockers.length > 0 || area.lastOrigin === 'seed') && (
            <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {badges.map((m) => (
                <Badge key={m} variant="outline">{MISSING_LABEL[m]}</Badge>
              ))}
              {area.openBlockers.length > 0 && <Badge variant="destructive">{area.openBlockers.length} blocker</Badge>}
              {area.lastOrigin === 'seed' && <Badge variant="outline">chưa xác minh lại</Badge>}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Thu gọn' : 'Xem nhanh'} ${area.name}`}
          className="flex w-11 shrink-0 items-start justify-center rounded-lg pt-3 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronDown className={cn('size-5 transition-transform', expanded && 'rotate-180')} />
        </button>
      </div>
      {expanded && <GlancePanel area={area} glance={glance} onOpen={() => onOpen(area)} />}
    </li>
  );
}
