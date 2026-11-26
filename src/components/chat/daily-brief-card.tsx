'use client';

import { RotateCcwIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getOrCreateDailyBrief, refreshDailyBrief } from '@/app/(app)/_actions/brief';
import { Button } from '@/components/ui/button';
import { formatDateVi, weekdayVi } from '@/lib/dates';
import type { DailyBrief } from '@/server/brief/daily-brief';

const FAILED = 'Chưa chuẩn bị được định hướng hôm nay.';

/** The message `Bắt đầu việc 1` sends through the normal chat path. */
export const startTaskMessage = (task: { title: string; area: string }) => `Giúp tôi bắt đầu: ${task.title} (${task.area})`;

/** The last brief this tab loaded: the card comes back without a loading state after `Chat mới`. */
let lastLoaded: DailyBrief | null = null;

type Load = 'idle' | 'loading' | 'refreshing';

/**
 * Today's orientation card on a new conversation. The page passes the stored brief when there is one;
 * otherwise the card asks the server for it on mount (the page never waits for the AI).
 */
export function DailyBriefCard({
  initial,
  today,
  onStart,
  disabled,
}: {
  initial: DailyBrief | null;
  /** The app day (YYYY-MM-DD) the page was rendered for. */
  today: string;
  onStart: (message: string) => void;
  disabled?: boolean;
}) {
  const [brief, setBrief] = useState<DailyBrief | null>(() => initial ?? (lastLoaded?.day === today ? lastLoaded : null));
  const [load, setLoad] = useState<Load>(brief ? 'idle' : 'loading');
  const [error, setError] = useState<string | null>(null);
  // `null` data from the server: nothing to orient on yet, the card stays away.
  const [hidden, setHidden] = useState(false);
  const alive = useRef(true);
  const requested = useRef(false);

  async function request(force: boolean) {
    setLoad(force ? 'refreshing' : 'loading');
    setError(null);
    let res: Awaited<ReturnType<typeof getOrCreateDailyBrief>>;
    try {
      res = await (force ? refreshDailyBrief() : getOrCreateDailyBrief());
    } catch {
      res = { ok: false, error: FAILED };
    }
    if (!alive.current) return;
    setLoad('idle');
    if (!res.ok) return setError(res.error);
    if (res.data === null) return setHidden(true);
    lastLoaded = res.data;
    setBrief(res.data);
  }

  useEffect(() => {
    alive.current = true;
    // Once per mount, also under StrictMode's double effect.
    if (!brief && !requested.current) {
      requested.current = true;
      void request(false);
    }
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  if (hidden) return null;
  const busy = load !== 'idle';
  const first = brief?.content.tasks[0];
  const day = brief?.day ?? today;

  return (
    <section
      data-testid="daily-brief"
      aria-label="Định hướng hôm nay"
      aria-busy={busy}
      className="w-full rounded-xl border bg-card p-4 text-left text-sm"
    >
      <p className="text-xs font-medium text-muted-foreground">
        Định hướng hôm nay · {weekdayVi(day)}, {formatDateVi(day)}
      </p>
      {!brief && load === 'loading' && <p className="mt-2 text-muted-foreground">Đang chuẩn bị định hướng hôm nay…</p>}
      {brief && (
        <>
          <p className="mt-2 font-medium">{brief.content.focus}</p>
          <ol className="mt-3 flex flex-col gap-2.5">
            {brief.content.tasks.map((task, i) => (
              <li key={i} data-testid="daily-brief-task" className="flex gap-2.5">
                <span aria-hidden className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p>
                    <span className="font-medium">{task.title}</span> <span className="text-muted-foreground">· {task.area}</span>
                  </p>
                  <p className="text-muted-foreground">{task.why}</p>
                </div>
              </li>
            ))}
          </ol>
          {(brief.content.upcoming || brief.content.stale) && (
            <div className="mt-3 flex flex-col gap-1 border-t pt-3 text-xs text-muted-foreground">
              {brief.content.upcoming && <p>Hạn sắp tới: {brief.content.upcoming}</p>}
              {brief.content.stale && <p>Lâu chưa cập nhật: {brief.content.stale}</p>}
            </div>
          )}
        </>
      )}
      {/* Not role="alert": the brief is optional, a failure must not interrupt the screen reader. */}
      {error && (
        <p data-testid="daily-brief-error" className="mt-2 text-destructive">
          {error}
        </p>
      )}
      <p aria-live="polite" className="sr-only">
        {load === 'refreshing' ? 'Đang làm mới định hướng…' : ''}
      </p>
      {(brief || error) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {first && (
            <Button type="button" className="min-h-11 px-4" onClick={() => onStart(startTaskMessage(first))} disabled={disabled || busy}>
              Bắt đầu việc 1
            </Button>
          )}
          <Button type="button" variant="outline" className="min-h-11 gap-1.5 px-4" onClick={() => void request(brief !== null)} disabled={busy}>
            <RotateCcwIcon aria-hidden />
            {brief ? (load === 'refreshing' ? 'Đang làm mới…' : 'Làm mới') : 'Thử lại'}
          </Button>
        </div>
      )}
    </section>
  );
}
