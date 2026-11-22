'use client';

import { ArrowUpIcon, SquareIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const MAX_LINES = 6;
/** Same limit as the server (run-turn). */
const MAX_MESSAGE = 8000;
/** The character count shows from here on. */
const COUNT_FROM = 7000;

/** Grows with its content up to MAX_LINES, then scrolls (field-sizing is not in every iOS Safari yet). */
function useAutoGrow(ref: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
    const chrome =
      parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth), line * MAX_LINES + chrome)}px`;
  }, [ref, value]);
}

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  streaming,
  toolbar,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  /** The context scope selector, shown next to the field. */
  toolbar: ReactNode;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(ref, value);
  // Text typed into the server-rendered field before hydration (a slow phone) is kept, not dropped.
  useEffect(() => {
    const typed = ref.current?.value ?? '';
    if (typed !== '' && typed !== value) onChange(typed);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, at hydration
  }, []);
  const empty = value.trim() === '';

  return (
    <form
      className="shrink-0 border-t bg-background px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:px-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!streaming && !empty) onSubmit();
      }}
    >
      <div className="mx-auto max-w-3xl space-y-1.5">
        <div className="flex items-end gap-2">
          <Textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
              // Touch keyboards have no Shift+Enter: Enter is a newline there and the button sends.
              if (window.matchMedia('(pointer: coarse)').matches) return;
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }}
            placeholder="Nhắn gì đó…"
            aria-label="Tin nhắn"
            maxLength={MAX_MESSAGE}
            enterKeyHint="enter"
            className="field-sizing-fixed max-h-none min-h-11 resize-none overflow-y-auto leading-6"
          />
          {streaming ? (
            <Button type="button" variant="secondary" size="icon" className="size-11 shrink-0" aria-label="Dừng" onClick={onStop}>
              <SquareIcon aria-hidden className="fill-current" />
            </Button>
          ) : (
            <Button type="submit" size="icon" className="size-11 shrink-0" aria-label="Gửi" disabled={empty}>
              <ArrowUpIcon aria-hidden />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {toolbar}
          {value.length >= COUNT_FROM && (
            <span className="ml-auto text-xs text-muted-foreground tabular-nums" data-testid="composer-count">
              {value.length}/{MAX_MESSAGE}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
