'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Chat is on the left, Context on the right: swiping left on Chat opens Context, swiping right goes back. */
const NEXT: Record<string, { left?: string; right?: string }> = {
  '/chat': { left: '/context' },
  '/context': { right: '/chat' },
};

const MIN_DISTANCE = 80;
const MAX_MS = 700;

/** A touch that starts here is the element's own gesture, not a page swipe. */
function ownsGesture(target: EventTarget | null): boolean {
  for (let el = target instanceof Element ? target : null; el; el = el.parentElement) {
    if (el.matches('input, textarea, select, [contenteditable="true"], [role="dialog"], [data-no-swipe]')) return true;
    // Something that scrolls sideways (a table, a code block, a row of chips) keeps horizontal swipes.
    const overflowX = getComputedStyle(el).overflowX;
    if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth) return true;
  }
  return false;
}

/**
 * Phone only (no room for Chat and Context side by side): a quick, mostly horizontal swipe switches between
 * them. Swipes on fields, dialogs, sideways-scrolling content or while text is selected are left alone.
 */
export function SwipeNav() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const targets = NEXT[pathname];
    if (!targets || !matchMedia('(pointer: coarse) and (max-width: 1023px)').matches) return;
    let start: { x: number; y: number; t: number } | null = null;

    const onStart = (e: TouchEvent) => {
      start = e.touches.length === 1 && !ownsGesture(e.target) ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: e.timeStamp } : null;
    };
    const onEnd = (e: TouchEvent) => {
      const s = start;
      start = null;
      if (!s || e.changedTouches.length !== 1) return;
      const dx = e.changedTouches[0].clientX - s.x;
      const dy = e.changedTouches[0].clientY - s.y;
      if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dy) > Math.abs(dx) * 0.5 || e.timeStamp - s.t > MAX_MS) return;
      if (window.getSelection()?.toString()) return;
      const to = dx < 0 ? targets.left : targets.right;
      if (to) router.push(to);
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, [pathname, router]);

  return null;
}
