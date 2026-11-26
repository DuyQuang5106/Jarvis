import type { ContextScope } from '@/server/ai/context-builder';

/** A first message another screen hands to Chat: sent on a new conversation with this scope. */
export type ChatPreset = { scope: ContextScope; message: string };

// Module state, not the URL: it survives the client-side navigation to /chat and is gone after one use,
// so a reload or back/forward never sends the message again.
let queued: ChatPreset | null = null;

export function queueChatPreset(preset: ChatPreset): void {
  queued = preset;
}

/** The queued preset, at most once. */
export function takeChatPreset(): ChatPreset | null {
  const preset = queued;
  queued = null;
  return preset;
}
