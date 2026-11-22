'use client';

import { useSyncExternalStore } from 'react';

/**
 * Conversations the chat view has just written to, so `Recent chats` shows a new conversation (and moves an
 * active one to the top) without a router refresh in the middle of the user's next click. The server list
 * stays the source of truth: an entry only adds or re-orders, and the server's title wins when it has one.
 */
export type ConversationTouch = { id: string; title: string; at: number };

const EMPTY: ConversationTouch[] = [];
let touches: ConversationTouch[] = EMPTY;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function touchConversation(id: string, title: string): void {
  touches = [{ id, title, at: Date.now() }, ...touches.filter((t) => t.id !== id)];
  emit();
}

export function forgetConversation(id: string): void {
  if (!touches.some((t) => t.id === id)) return;
  touches = touches.filter((t) => t.id !== id);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useConversationTouches(): ConversationTouch[] {
  return useSyncExternalStore(subscribe, () => touches, () => EMPTY);
}

/** Server rows (newest first) merged with local touches, newest first, at most `limit`. */
export function mergeRecent<T extends { id: string; title: string; updatedAt: string }>(
  rows: T[],
  local: ConversationTouch[],
  limit: number,
): { id: string; title: string }[] {
  const byId = new Map<string, { id: string; title: string; at: number }>();
  for (const r of rows) byId.set(r.id, { id: r.id, title: r.title, at: Date.parse(r.updatedAt) });
  for (const t of local) {
    const known = byId.get(t.id);
    byId.set(t.id, known ? { ...known, at: Math.max(known.at, t.at) } : t);
  }
  return [...byId.values()].sort((a, b) => b.at - a.at).slice(0, limit).map(({ id, title }) => ({ id, title }));
}
