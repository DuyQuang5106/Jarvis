'use client';

import { RotateCcwIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { answerMessage, recordMessage } from '@/lib/checkin-message';
import type { CheckinAction, PendingCheckin } from '@/server/checkin/checkin';

const LOAD_FAILED = 'Chưa tóm tắt được buổi vừa qua.';
const MARK_FAILED = 'Chưa bỏ qua được, thử lại.';
const ANSWER_MAX = 500;

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

async function fetchCheckin(): Promise<{ ok: true; checkin: PendingCheckin | null } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/checkin', { cache: 'no-store' });
    const body = (await res.json().catch(() => ({}))) as { checkin?: PendingCheckin | null; error?: string };
    if (!res.ok) return { ok: false, error: body.error ?? LOAD_FAILED };
    return { ok: true, checkin: body.checkin ?? null };
  } catch {
    return { ok: false, error: LOAD_FAILED };
  }
}

async function markCheckin(action: CheckinAction, checkin: PendingCheckin): Promise<boolean> {
  try {
    const res = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, slots: checkin.slots }),
      // `Ghi lại` sends a chat message right away: the mark must still land if the view changes.
      keepalive: true,
    });
    // 409: the slots are no longer pending (handled in another tab, or out of the window): nothing to redo.
    return res.ok || res.status === 409;
  } catch {
    return false;
  }
}

/**
 * The check-in card on a new conversation, for the slots that ended since the app was last opened. With
 * activity it shows the AI summary (generated on first view, through the route handler) and offers
 * `Ghi lại`; without activity it asks what was done. Either way the answer goes through the normal chat path.
 */
export function CheckinCard({
  initial,
  onSend,
  disabled,
}: {
  initial: PendingCheckin;
  onSend: (message: string) => void;
  disabled?: boolean;
}) {
  const uid = useId();
  const [checkin, setCheckin] = useState<PendingCheckin | null>(initial);
  const needsSummary = (c: PendingCheckin | null) => !!c && c.hasActivity && !c.summary;
  const [loading, setLoading] = useState(needsSummary(initial));
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<{ message: string; retry: 'load' | 'skip' } | null>(null);
  const [answer, setAnswer] = useState('');
  const alive = useRef(true);
  const requested = useRef(false);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await fetchCheckin();
    if (!alive.current) return;
    setLoading(false);
    if (!res.ok) return setError({ message: res.error, retry: 'load' });
    setCheckin(res.checkin);
  }

  useEffect(() => {
    alive.current = true;
    // Once per mount, also under StrictMode's double effect.
    if (needsSummary(initial) && !requested.current) {
      requested.current = true;
      void load();
    }
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  if (!checkin) return null;
  const current = checkin;

  function send(action: Exclude<CheckinAction, 'skip'>, message: string) {
    onSend(message);
    void markCheckin(action, current);
    setCheckin(null);
  }

  async function skip() {
    setMarking(true);
    setError(null);
    const ok = await markCheckin('skip', current);
    if (!alive.current) return;
    setMarking(false);
    if (ok) setCheckin(null);
    else setError({ message: MARK_FAILED, retry: 'skip' });
  }

  function submitAnswer(e: React.FormEvent) {
    e.preventDefault();
    const text = answer.trim();
    if (!text || disabled) return;
    send('answer', answerMessage(current.phrase, text));
  }

  const busy = loading || marking;
  const summary = current.summary;
  const asking = !current.hasActivity;

  return (
    <section
      data-testid="checkin-card"
      aria-label={`Check-in ${lowerFirst(current.label)}`}
      aria-busy={busy}
      className="w-full rounded-xl border bg-card p-4 text-left text-sm"
    >
      {asking ? (
        <form onSubmit={submitAnswer} className="flex flex-col gap-3">
          <label htmlFor={`${uid}-answer`} className="font-medium">
            Buổi {lowerFirst(current.label)} bạn đã làm gì?
          </label>
          {current.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="Gợi ý từ định hướng hôm đó" role="group">
              {current.suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={disabled}
                  onClick={() => setAnswer(s)}
                  className="min-h-11 rounded-full border bg-background px-3 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <Input
            id={`${uid}-answer`}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            maxLength={ANSWER_MAX}
            placeholder="Ví dụ: ôn chương 5 Algebra"
            autoComplete="off"
            enterKeyHint="send"
            className="h-11 md:text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="min-h-11 px-4" disabled={disabled || busy || answer.trim() === ''}>
              Trả lời
            </Button>
            <Button type="button" variant="outline" className="min-h-11 px-4" onClick={() => void skip()} disabled={busy}>
              Bỏ qua
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p className="font-medium">{current.label} bạn đã:</p>
          {loading && !summary && <p className="mt-2 text-muted-foreground">Đang tóm tắt buổi vừa qua…</p>}
          {summary && (
            <>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5">
                {summary.items.map((item, i) => (
                  <li key={i} data-testid="checkin-item">
                    {item.text}
                    {item.area && <span className="text-muted-foreground"> · {item.area}</span>}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-muted-foreground">{summary.summary}</p>
              <p className="mt-3">Ghi lại như vậy nhé?</p>
            </>
          )}
          {(summary || error || !loading) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {summary && (
                <Button
                  type="button"
                  className="min-h-11 px-4"
                  onClick={() => send('record', recordMessage(current.phrase, summary.items))}
                  disabled={disabled || busy}
                >
                  Ghi lại
                </Button>
              )}
              <Button type="button" variant="outline" className="min-h-11 px-4" onClick={() => void skip()} disabled={busy}>
                Bỏ qua
              </Button>
            </div>
          )}
        </>
      )}
      {/* Not role="alert": the check-in is optional, a failure must not interrupt the screen reader. */}
      {error && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p data-testid="checkin-error" className="min-w-0 flex-1 text-destructive">
            {error.message}
          </p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-1.5 px-4"
            onClick={() => void (error.retry === 'load' ? load() : skip())}
            disabled={busy}
          >
            <RotateCcwIcon aria-hidden />
            Thử lại
          </Button>
        </div>
      )}
    </section>
  );
}
