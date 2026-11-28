'use client';

/**
 * The chat view tells the sidebar's thread list that a thread just got a message (its last line and order change)
 * without a router refresh. A window event, not a module store: the layout and the page can hold separate copies
 * of a module.
 */
export const THREAD_TOUCHED = 'jarvis:thread-touched';

export type ThreadTouch = { key: string; conversationId: string; lastMessage: string; at: string };

/** Every touch of this page's life, kept on `window`: a list mounted later (the phone menu) applies them too. */
export function threadTouches(): ThreadTouch[] {
  const w = window as unknown as { __jarvisThreadTouches?: ThreadTouch[] };
  w.__jarvisThreadTouches ??= [];
  return w.__jarvisThreadTouches;
}

export function touchThread(detail: ThreadTouch) {
  threadTouches().push(detail);
  window.dispatchEvent(new CustomEvent<ThreadTouch>(THREAD_TOUCHED, { detail }));
}
