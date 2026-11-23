import { Badge } from '@/components/ui/badge';
import type { AreaStatus } from '@/db/enums';
import { AREA_STATUS_LABEL } from '@/lib/labels';

export const AREA_STATUS_BADGE_CLASS: Record<AreaStatus, string> = {
  unknown: 'border-border bg-secondary text-secondary-foreground',
  not_started: 'border-border bg-secondary text-secondary-foreground',
  active: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
  blocked: 'border-red-500/30 bg-red-500/15 text-red-800 dark:text-red-300',
  on_hold: 'border-amber-500/35 bg-amber-500/15 text-amber-900 dark:text-amber-300',
  completed: 'border-border/70 bg-muted/50 text-muted-foreground',
};

export function AreaStatusBadge({ status }: { status: AreaStatus }) {
  return (
    <Badge variant="outline" data-area-status={status} className={AREA_STATUS_BADGE_CLASS[status]}>
      {AREA_STATUS_LABEL[status]}
    </Badge>
  );
}
