import { cn } from '@/lib/utils';
import { progressLabel, type AreaProgress } from '@/lib/progress';

/**
 * A bar with its count always written next to it (`3/8 topic vững`); renders nothing when the denominator
 * is 0. `decorative` hides the bar from assistive tech where the text beside it already says the same
 * (inside a row that is itself a button); otherwise the bar is a `progressbar` with its values.
 */
export function ProgressBar({
  progress,
  decorative = false,
  className,
}: {
  progress: AreaProgress;
  decorative?: boolean;
  className?: string;
}) {
  const label = progressLabel(progress);
  if (label === null) return null;
  const { done, total } = progress;
  const bar = (
    <span className="block h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/15">
      <span className="block h-full rounded-full bg-primary" style={{ width: `${(done / total) * 100}%` }} />
    </span>
  );
  return (
    <span data-testid="progress" className={cn('flex min-w-0 items-center gap-2 text-sm', className)}>
      {decorative ? (
        <span aria-hidden data-testid="progress-bar" className="flex min-w-0 flex-1">
          {bar}
        </span>
      ) : (
        <span
          role="progressbar"
          data-testid="progress-bar"
          aria-label="Tiến độ"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-valuetext={label}
          className="flex min-w-0 flex-1"
        >
          {bar}
        </span>
      )}
      <span className="shrink-0 tabular-nums text-muted-foreground">{label}</span>
    </span>
  );
}
