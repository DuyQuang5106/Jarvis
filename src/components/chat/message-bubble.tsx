'use client';

import { CheckIcon, CopyIcon, RefreshCwIcon } from 'lucide-react';
import { createContext, useContext, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ReplyStats as Stats } from '@/server/chat/run-turn';
import { ReplyStats } from './reply-stats';

export type ChatMessageView = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Tokens and timing of an assistant reply; null for user messages and replies saved before stats existed. */
  stats?: Stats | null;
  pendingActionId?: string | null;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    toast.error('Không sao chép được.');
    return false;
  }
}

/** Icon button that shows a check for a moment after copying. */
function CopyButton({ label, getText, className }: { label: string; getText: () => string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn('min-h-11 gap-1.5 px-2 text-muted-foreground md:min-h-8', className)}
      onClick={async () => {
        if (await copyText(getText())) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
    >
      {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
      {label}
    </Button>
  );
}

/** react-markdown passes its hast `node` to custom components; it must not reach the DOM. */
function withoutNode<T extends { node?: unknown }>({ node, ...rest }: T): Omit<T, 'node'> {
  void node;
  return rest;
}

function CodeBlock(props: ComponentProps<'pre'> & { node?: unknown }) {
  const { children, ...rest } = withoutNode(props);
  const ref = useRef<HTMLPreElement>(null);
  return (
    <div className="group/code relative">
      <pre ref={ref} {...rest}>
        {children}
      </pre>
      <CopyButton
        label="Sao chép mã"
        getText={() => ref.current?.innerText ?? ''}
        className="absolute top-1 right-1 bg-background/80 text-xs"
      />
    </div>
  );
}

/** Set inside a markdown link, where an image must not become a second (nested) link. */
const InLink = createContext(false);

/**
 * A markdown image is never loaded: fetching a URL the model wrote could carry data out in it. It shows as
 * a link to open on purpose, or as plain text inside another link.
 */
function ImageAsLink(props: ComponentProps<'img'> & { node?: unknown }) {
  const { src, alt } = withoutNode(props);
  const inLink = useContext(InLink);
  const label = `[ảnh: ${alt ?? ''}]`;
  if (inLink || typeof src !== 'string' || !src) return <span>{label}</span>;
  return (
    <a href={src} target="_blank" rel="noreferrer noopener">
      {label}
    </a>
  );
}

const MARKDOWN: Components = {
  // Model output is untrusted: no raw HTML (no rehype-raw), and links leave the app in a new tab.
  a: (props) => (
    <InLink.Provider value>
      <a {...withoutNode(props)} target="_blank" rel="noreferrer noopener" />
    </InLink.Provider>
  ),
  img: ImageAsLink,
  pre: CodeBlock,
  table: (props) => (
    <div className="overflow-x-auto">
      <table {...withoutNode(props)} />
    </div>
  ),
};

export function MarkdownContent({ text }: { text: string }) {
  return (
    <div className="chat-markdown">
      <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN}>
        {text}
      </Markdown>
    </div>
  );
}

export function MessageBubble({
  message,
  streaming = false,
  status,
  onRegenerate,
  footer,
}: {
  message: ChatMessageView;
  /** The reply is still arriving: show a blinking cursor and no actions. */
  streaming?: boolean;
  /** While streaming and before the first text: what the server is doing (`Đang đọc 3 tài liệu…`). */
  status?: string | null;
  /** Only the last assistant message gets `Tạo lại`. */
  onRegenerate?: () => void;
  /** Phase 3 renders the proposal card here. */
  footer?: ReactNode;
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div
          data-role="user"
          className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-base break-words whitespace-pre-wrap"
        >
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div data-role="assistant" aria-busy={streaming || undefined} className="min-w-0 space-y-2">
      <div className="text-base">
        {streaming && status && message.content === '' ? (
          <p role="status" className="text-sm text-muted-foreground motion-safe:animate-pulse">
            {status}
          </p>
        ) : (
          <MarkdownContent text={message.content} />
        )}
        {streaming && !(status && message.content === '') && (
          <span
            aria-hidden
            className="ml-0.5 inline-block h-[1.1em] w-2 translate-y-[0.2em] bg-foreground motion-safe:animate-pulse"
          />
        )}
      </div>
      {!streaming && (
        <>
          <div className="-ml-2 flex flex-wrap items-center gap-1">
            <CopyButton label="Sao chép" getText={() => message.content} />
            {onRegenerate && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 gap-1.5 px-2 text-muted-foreground md:min-h-8"
                onClick={onRegenerate}
              >
                <RefreshCwIcon aria-hidden />
                Tạo lại
              </Button>
            )}
          </div>
          <ReplyStats stats={message.stats} />
          {footer}
        </>
      )}
    </div>
  );
}
