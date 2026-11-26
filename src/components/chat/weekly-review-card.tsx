'use client';

import { RotateCcwIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ReadyReview, WeeklyReviewCard as Card } from '@/server/review/weekly-review';

const FAILED = 'Chưa tổng kết được tuần này.';

type Week = 'due' | 'current';
type State =
  | { kind: 'idle' }
  | { kind: 'generating'; label: string | null; week: Week }
  | { kind: 'ready'; review: ReadyReview; week: Week }
  | { kind: 'error'; message: string; label: string | null; week: Week; regenerate: boolean };

async function requestReview(week: Week, regenerate: boolean): Promise<{ ok: true; review: ReadyReview } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/weekly-review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ week, ...(regenerate ? { regenerate } : {}) }),
    });
    const body = (await res.json().catch(() => ({}))) as { review?: ReadyReview; error?: string };
    if (!res.ok || !body.review) return { ok: false, error: body.error ?? FAILED };
    return { ok: true, review: body.review };
  } catch {
    return { ok: false, error: FAILED };
  }
}

function initialState(card: Card | null): State {
  if (!card) return { kind: 'idle' };
  if (card.state === 'pending') return { kind: 'generating', label: card.label, week: 'due' };
  return { kind: 'ready', review: card, week: 'due' };
}

/**
 * The weekly review card on a new conversation. A week waiting for its review is generated as soon as the
 * card shows (through the route handler, so the chat stays usable); then it shows the key points and opens
 * the review conversation, where its proposal waits for approval. `manualRequest` (bumped by `Tổng kết tuần
 * này`) reviews the current week on any day.
 */
export function WeeklyReviewCard({ initial, manualRequest }: { initial: Card | null; manualRequest: number }) {
  const [state, setState] = useState<State>(() => initialState(initial));
  const alive = useRef(true);
  const started = useRef(false);
  const seenManual = useRef(manualRequest);

  async function run(week: Week, label: string | null, regenerate = false) {
    setState({ kind: 'generating', label, week });
    const res = await requestReview(week, regenerate);
    if (!alive.current) return;
    if (res.ok) setState({ kind: 'ready', review: res.review, week });
    else setState({ kind: 'error', message: res.error, label, week, regenerate });
  }

  useEffect(() => {
    alive.current = true;
    // Once per mount, also under StrictMode's double effect.
    if (initial?.state === 'pending' && !started.current) {
      started.current = true;
      void run('due', initial.label);
    }
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  useEffect(() => {
    if (manualRequest === seenManual.current) return;
    seenManual.current = manualRequest;
    void run('current', null);
  }, [manualRequest]);

  if (state.kind === 'idle') return null;
  const label = state.kind === 'ready' ? state.review.label : state.label;
  const title = label ? `Tổng kết tuần ${label}` : 'Tổng kết tuần này';
  const busy = state.kind === 'generating';

  return (
    <section data-testid="weekly-review-card" aria-label={title} aria-busy={busy} className="w-full rounded-xl border bg-card p-4 text-left text-sm">
      <p className="font-medium">{title}</p>
      {busy && <p className="mt-2 text-muted-foreground">Đang tổng kết tuần…</p>}
      {state.kind === 'ready' && (
        <>
          {state.review.highlights.length > 0 && (
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5">
              {state.review.highlights.map((h, i) => (
                <li key={i} data-testid="weekly-review-highlight">{h}</li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild className="min-h-11 px-4">
              <Link href={`/chat?c=${state.review.conversationId}`}>
                {state.review.pendingActionId ? 'Mở tổng kết và duyệt' : 'Mở tổng kết'}
              </Link>
            </Button>
            <Button type="button" variant="ghost" className="min-h-11 px-4" onClick={() => void run(state.week, state.review.label, true)}>
              Tạo lại
            </Button>
          </div>
        </>
      )}
      {/* Not role="alert": the review is optional, a failure must not interrupt the screen reader. */}
      {state.kind === 'error' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p data-testid="weekly-review-error" className="min-w-0 flex-1 text-destructive">{state.message}</p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-1.5 px-4"
            onClick={() => void run(state.week, state.label, state.regenerate)}
          >
            <RotateCcwIcon aria-hidden />
            Thử lại
          </Button>
        </div>
      )}
    </section>
  );
}

/** `Tổng kết tuần này`: reviews the current week on any day. */
export function WeeklyReviewLink({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-11 px-2 text-sm text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
    >
      Tổng kết tuần này
    </button>
  );
}
