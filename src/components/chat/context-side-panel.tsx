'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { DATA_CHANGED_EVENT } from '@/lib/data-changed';
import { setSplitOpen, takeContextUrl, useEmbedded, useSplitOpen } from '@/lib/split-view';

/**
 * "Context + Chat" on wide screens: Context, the part you watch, on the left half; Chat, where you change it, on
 * the right half. Context runs in a frame (same origin, same session), so its list, progress and workspaces work
 * as on their own page; it reloads after the chat applies or undoes a proposal. Below `lg` the frame is not shown.
 */
export function ChatWithContext({ children }: { children: ReactNode }) {
  const open = useSplitOpen();
  const embedded = useEmbedded();
  const frame = useRef<HTMLIFrameElement>(null);
  // Read once per opening: the Context view the split was opened from, else the list.
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage exists only in the browser
    setSrc(takeContextUrl());
    const reload = () => frame.current?.contentWindow?.location.reload();
    window.addEventListener(DATA_CHANGED_EVENT, reload);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, reload);
  }, [open]);

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
