'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { MessageBubble, type ChatMessageView } from './message-bubble';
import { ProposalCard } from './proposal-card';

/** Within this many pixels of the bottom counts as "at the bottom" (auto-scroll stays on). */
const STICK_PX = 64;

const DRAFT_ID = 'draft';

/**
 * The scrolling transcript. New content keeps it pinned to the bottom unless the user has scrolled up;
 * `pinKey` changing (a new turn sent) pins it again.
 */
export function MessageList({
  messages,
  draft,
  pinKey,
  onRegenerate,
  empty,
  after,
}: {
  messages: ChatMessageView[];
  /** The assistant reply being streamed, or null. */
  draft: string | null;
  pinKey: number;
  onRegenerate?: () => void;
  /** Rendered instead of messages when there are none. */
  empty?: ReactNode;
  /** Error or stop notice under the transcript. */
  after?: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useLayoutEffect(() => {
    stick.current = true;
  }, [pinKey]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, draft, after, pinKey]);

  const last = messages.at(-1);
  return (
    <div
      ref={scroller}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
      }}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-5 px-4 py-4 md:px-6">
        {messages.length === 0 && draft === null && empty}
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            onRegenerate={m === last && m.role === 'assistant' && draft === null ? onRegenerate : undefined}
            footer={m.pendingActionId ? <ProposalCard proposalId={m.pendingActionId} /> : undefined}
          />
        ))}
        {draft !== null && (
          <MessageBubble streaming message={{ id: DRAFT_ID, role: 'assistant', content: draft, contextRefs: [], summaryCount: 0 }} />
        )}
        {after}
      </div>
    </div>
  );
}
