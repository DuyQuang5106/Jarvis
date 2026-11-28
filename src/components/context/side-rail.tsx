'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Between `md` and `xl` (the Context half of the split, a narrow window): three columns do not fit. */
const COMPACT = '(min-width: 768px) and (max-width: 1279px)';
function subscribeCompact(onChange: () => void) {
  const mq = window.matchMedia(COMPACT);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
export const useCompactWorkspace = () => useSyncExternalStore(subscribeCompact, () => window.matchMedia(COMPACT).matches, () => false);

const pinKey = (id: string) => `jarvis:rail-pinned:${id}`;
function readPin(id: string): boolean {
  try {
    return localStorage.getItem(pinKey(id)) === '1';
  } catch {
    return false;
  }
}
function writePin(id: string, pinned: boolean) {
  try {
    localStorage.setItem(pinKey(id), pinned ? '1' : '0');
  } catch {
    // Private mode: the pin lasts for this page only.
  }
}

/** Something layered above the page (a menu, a dialog) opened from inside the panel: keep the panel while it is up. */
const layerOpen = (rail: Element | null) =>
  // The workspace itself is a dialog holding the rail: only a layer elsewhere counts.
  [...document.querySelectorAll('[role="menu"], [role="dialog"], [role="listbox"]')].some((el) => !rail || (!el.contains(rail) && !rail.contains(el)));
const CLOSE_DELAY_MS = 250;

/**
 * A side column of the workspace. On wide screens it is a plain column. In the compact range it folds into a
 * narrow button: pointing at it shows the column over the editor until the pointer leaves; clicking it pins
 * the column in place (taking room again) until it is clicked once more. The pin is remembered per column.
 */
export function SideRail({
  id,
  side,
  label,
  icon,
  className,
  children,
}: {
  id: string;
  side: 'left' | 'right';
  label: string;
  icon: ReactNode;
  /** The column's own classes (width, border, background). */
  className: string;
  children: ReactNode;
}) {
  const compact = useCompactWorkspace();
  const [pinned, setPinned] = useState(false);
  const [peek, setPeek] = useState(false);
  const inside = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    // localStorage exists only in the browser.
    setPinned(readPin(id));
  }, [id]);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  // `side-rail-full`: hidden in the compact range by CSS, so the first paint (before this knows the width) shows
  // no full column that then folds away.
  if (!compact) return <aside className={cn(className, 'side-rail-full')}>{children}</aside>;

  const scheduleClose = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(function check() {
      if (inside.current) return;
      // A menu opened from the panel sits outside it: wait until it closes.
      if (layerOpen(root.current)) {
        timer.current = window.setTimeout(check, 300);
        return;
      }
      setPeek(false);
    }, CLOSE_DELAY_MS);
  };
  const enter = () => {
    inside.current = true;
    if (timer.current) window.clearTimeout(timer.current);
    setPeek(true);
  };
  const leave = () => {
    inside.current = false;
    scheduleClose();
  };
  const toggle = () => {
    const next = !pinned;
    setPinned(next);
    writePin(id, next);
    // Unpinning under the pointer would only turn it into a peek: fold it now.
    if (!next) {
      inside.current = false;
      setPeek(false);
    }
  };

  const rail = (
    <button
      type="button"
      data-testid={`rail-${id}`}
      aria-label={pinned ? `Thu gọn ${label}` : `Ghim ${label}`}
      aria-pressed={pinned}
      title={pinned ? `Bấm để thu gọn ${label}` : `Rê chuột để xem, bấm để ghim ${label}`}
      onClick={toggle}
      className={cn(
        'flex w-10 shrink-0 flex-col items-center gap-3 bg-muted/20 py-3 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground',
        side === 'left' ? 'border-r' : 'border-l',
        pinned && 'bg-muted/50 text-foreground',
      )}
    >
      {icon}
      <span className="text-xs font-medium [writing-mode:vertical-rl]">{label}</span>
    </button>
  );

  const panel = (pinned || peek) && (
    <aside
      data-testid={`rail-panel-${id}`}
      className={cn(
        className,
        // Docked takes room; a peek floats over the editor.
        !pinned && 'absolute inset-y-0 z-30 bg-background shadow-2xl',
        !pinned && (side === 'left' ? 'left-full' : 'right-full'),
      )}
    >
      {children}
    </aside>
  );

  return (
    <div
      ref={root}
      className="relative flex min-h-0 shrink-0"
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={enter}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) leave();
      }}
    >
      {side === 'left' ? (
        <>
          {rail}
          {panel}
        </>
      ) : (
        <>
          {panel}
          {rail}
        </>
      )}
    </div>
  );
}
