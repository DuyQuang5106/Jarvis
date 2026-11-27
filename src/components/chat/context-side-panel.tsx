'use client';

import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { DATA_CHANGED_EVENT } from '@/lib/data-changed';

const KEY = 'jarvis:context-panel';

const listeners = new Set<() => void>();
/** The choice when localStorage cannot keep it (private mode): it then lasts until the page is left. */
let memory: boolean | null = null;
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function readOpen(): boolean {
  if (memory !== null) return memory;
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
function writeOpen(next: boolean) {
  memory = next;
  try {
    localStorage.setItem(KEY, next ? '1' : '0');
  } catch {
    // Private mode: `memory` keeps it for now.
  }
  for (const l of listeners) l();
}
const noSubscribe = () => () => {};
const isEmbedded = () => window.self !== window.top;

/**
 * Chat beside Context on wide screens: the Context page runs in a frame (same origin, same session), so its
 * list, progress and workspaces work as on their own page. The frame reloads after the chat applies or undoes
 * a proposal. Hidden below `lg`, where there is no room for two columns.
 */
export function ChatWithContext({ children }: { children: ReactNode }) {
  // Server render: closed, not embedded. A page inside the frame never nests another panel.
  const open = useSyncExternalStore(subscribe, readOpen, () => false);
  const embedded = useSyncExternalStore(noSubscribe, isEmbedded, () => false);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!open) return;
    const reload = () => frame.current?.contentWindow?.location.reload();
    window.addEventListener(DATA_CHANGED_EVENT, reload);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, reload);
  }, [open]);

  const toggle = () => writeOpen(!open);

  if (embedded) return <>{children}</>;
  return (
    <div className="absolute inset-0 flex">
      <div className="relative min-w-0 flex-1">
        {children}
        <Button
          variant="outline"
          size="sm"
          onClick={toggle}
          aria-pressed={open}
          className="absolute top-3 right-3 z-10 hidden lg:inline-flex"
        >
          {open ? <PanelRightClose /> : <PanelRightOpen />}
          {open ? 'Ẩn Context' : 'Context bên cạnh'}
        </Button>
      </div>
      {open && (
        <iframe
          ref={frame}
          src="/context"
          title="Context"
          className="hidden h-full w-[clamp(380px,42%,640px)] shrink-0 border-l bg-background lg:block"
        />
      )}
    </div>
  );
}
