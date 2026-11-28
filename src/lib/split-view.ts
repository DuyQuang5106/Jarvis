'use client';

import { useSyncExternalStore } from 'react';

/**
 * "Context + Chat" on wide screens: Context on the left, Chat on the right. The choice and the sidebar pin are
 * per-browser preferences in localStorage; a module-level fallback keeps them for the page's life when storage
 * is unavailable (private mode).
 */
const SPLIT_KEY = 'jarvis:context-panel';
const PIN_KEY = 'jarvis:sidebar-pinned';
/** The Context URL to show on the left when the split is opened from the Context page. */
const CONTEXT_URL_KEY = 'jarvis:split-context-url';
const WIDE = '(min-width: 1024px)'; // Tailwind `lg`

// Pages and the layout can end up with separate copies of this module (one per bundle chunk), so the
// notification goes through a window event and the fallback lives on `window`, not in module variables.
const EVENT = 'jarvis:split-view';

function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

function memoryMap(): Map<string, boolean> {
  const w = window as unknown as { __jarvisSplitView?: Map<string, boolean> };
  w.__jarvisSplitView ??= new Map();
  return w.__jarvisSplitView;
}

function read(key: string): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return stored === '1';
  } catch {
    // Private mode: fall back to what this page set.
  }
  return memoryMap().get(key) ?? false;
}

function write(key: string, value: boolean) {
  memoryMap().set(key, value);
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Private mode: the map on `window` keeps it for now.
  }
  window.dispatchEvent(new Event(EVENT));
}

export const useSplitOpen = () => useSyncExternalStore(subscribe, () => read(SPLIT_KEY), () => false);
export const setSplitOpen = (open: boolean) => write(SPLIT_KEY, open);

export const useSidebarPinned = () => useSyncExternalStore(subscribe, () => read(PIN_KEY), () => false);
export const setSidebarPinned = (pinned: boolean) => write(PIN_KEY, pinned);

function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
/** Room for two columns. The server render assumes not. */
export const useWide = () => useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);

const noSubscribe = () => () => {};
/** True inside the Context frame of the split: such a page never nests another split. */
export const useEmbedded = () => useSyncExternalStore(noSubscribe, () => window.self !== window.top, () => false);

/** Remembers which Context view to show on the left, then the caller navigates to /chat. */
export function rememberContextUrl(url: string) {
  try {
    sessionStorage.setItem(CONTEXT_URL_KEY, url);
  } catch {
    // Without storage the left side opens on the Context list.
  }
}

/** Posted by the Context frame to the chat page when a subject is opened on the left. */
export const CONTEXT_ITEM_MESSAGE = 'jarvis:context-item';

/** The remembered Context view (once); else the open thread's subject, or the list. Only /context paths count. */
export function takeContextUrl(areaId: string | null = null): string {
  try {
    const url = sessionStorage.getItem(CONTEXT_URL_KEY);
    sessionStorage.removeItem(CONTEXT_URL_KEY);
    if (url && /^\/context(\?|$)/.test(url)) return url;
  } catch {
    // Fall through.
  }
  return areaId ? `/context?item=${areaId}` : '/context';
}
