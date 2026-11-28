'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { DATA_CHANGED_EVENT } from '@/lib/data-changed';
import { useRouter } from 'next/navigation';
import { CONTEXT_ITEM_MESSAGE, setSplitOpen, takeContextUrl, useEmbedded, useSplitOpen } from '@/lib/split-view';

/**
 * "Context + Chat" on wide screens: Context, the part you watch, on the left half; Chat, where you change it, on
 * the right half. Context runs in a frame (same origin, same session), so its list, progress and workspaces work
 * as on their own page; it reloads after the chat applies or undoes a proposal. Below `lg` the frame is not shown.
 */
export function ChatWithContext({ children, contextItem = null }: { children: ReactNode; contextItem?: string | null }) {
  const router = useRouter();
  const open = useSplitOpen();
  const embedded = useEmbedded();
  const frame = useRef<HTMLIFrameElement>(null);
  // Read once per opening: the Context view the split was opened from, else the list.
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage exists only in the browser
    setSrc(takeContextUrl(contextItem));
    const reload = () => frame.current?.contentWindow?.location.reload();
    window.addEventListener(DATA_CHANGED_EVENT, reload);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the frame's first page is chosen once per opening
  }, [open]);

  // Opening a subject on the left switches the chat to that subject's thread.
  const shownItem = useRef<string | null>(contextItem);
  useEffect(() => {
    if (!open) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const data = e.data as { type?: unknown; areaId?: unknown } | null;
      if (data?.type !== CONTEXT_ITEM_MESSAGE || typeof data.areaId !== 'string') return;
      shownItem.current = data.areaId;
      if (data.areaId !== contextItem) router.push(`/chat?area=${data.areaId}`);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open, contextItem, router]);
  // And the other way: a subject's thread opened from the sidebar shows that subject on the left.
  useEffect(() => {
    if (!open || !contextItem || shownItem.current === contextItem) return;
    shownItem.current = contextItem;
    frame.current?.contentWindow?.location.replace(`/context?item=${contextItem}`);
  }, [open, contextItem]);

  if (embedded) return <>{children}</>;
  return (
    <div className="absolute inset-0 flex">
      {open && src && (
        <iframe
          ref={frame}
          src={src}
          title="Context"
          className="hidden h-full w-1/2 shrink-0 border-r bg-background lg:block"
        />
      )}
      <div className="relative min-w-0 flex-1">
        {children}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSplitOpen(!open)}
          aria-pressed={open}
          className="absolute top-3 right-3 z-10 hidden lg:inline-flex"
        >
          {open ? <PanelLeftClose /> : <PanelLeftOpen />}
          {open ? 'Ẩn Context' : 'Context bên cạnh'}
        </Button>
      </div>
    </div>
  );
}
