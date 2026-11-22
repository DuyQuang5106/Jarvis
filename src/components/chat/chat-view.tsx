'use client';

import { RotateCcwIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ContextScope } from '@/server/ai/context-builder';
import type { TurnEvent } from '@/server/chat/run-turn';
import { Composer } from './composer';
import type { ChatMessageView } from './message-bubble';
import { MessageList } from './message-list';
import { touchConversation } from './recent-chats-store';
import { ScopeSelector, type ChatAreaOption } from './scope-selector';
import { SuggestedPrompts } from './suggested-prompts';
import { useChatStream, type ChatSendInput } from './use-chat-stream';

export type { ChatAreaOption } from './scope-selector';
export type { ChatMessageView } from './message-bubble';

const AUTO: ContextScope = { mode: 'auto' };
/** Same cut as the server's title of a new conversation (run-turn). */
const TITLE_LEN = 60;

/** What `Thử lại` does: regenerate the saved turn, or resend a message the server never saved. */
type Retry = { kind: 'regenerate' } | { kind: 'resend'; text: string; localId: string };
type Notice = { kind: 'error'; message: string; retry: Retry } | { kind: 'stopped'; retry: Retry };

let localSeq = 0;
const localId = () => `local-${++localSeq}`;

export function ChatView({
  conversation,
  messages: initialMessages,
  areas,
}: {
  conversation: { id: string; title: string } | null;
  messages: ChatMessageView[];
  areas: ChatAreaOption[];
}) {
  const urlId = useSearchParams().get('c');
  const stream = useChatStream();
  const streaming = stream.status === 'streaming';

  const [conversationId, setConversationId] = useState<string | null>(conversation?.id ?? null);
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [scope, setScope] = useState<ContextScope>(AUTO);
  const [input, setInput] = useState('');
  const [pinKey, setPinKey] = useState(0);
  // Bumped whenever the view switches conversation; events of an older turn are ignored.
  const [generation, setGeneration] = useState(0);
  const generationRef = useRef(0);

  // The URL is the source of truth for which conversation is open. Our own replaceState after `meta`
  // gives the id we already hold; anything else (a Recent chats link, `Chat mới`) loads the server's copy.
  const [seenUrlId, setSeenUrlId] = useState(urlId);
  if (urlId !== seenUrlId) {
    setSeenUrlId(urlId);
    if (urlId !== conversationId) {
      setConversationId(conversation?.id ?? null);
      setMessages(initialMessages);
      setDraft(null);
      setNotice(null);
      setScope(AUTO);
      setGeneration((g) => g + 1);
    }
  }
  const { abort } = stream;
  useEffect(() => {
    if (generationRef.current === generation) return;
    generationRef.current = generation;
    abort(); // a turn still streaming belongs to the conversation we left
  }, [generation, abort]);

  async function runTurn(body: ChatSendInput, pendingUserId: string | null) {
    const gen = generationRef.current;
    let text = '';
    let metaSeen = false;
    setDraft('');
    setNotice(null);
    setPinKey((k) => k + 1);
    await stream.send(body, {
      onEvent(e: TurnEvent) {
        if (gen !== generationRef.current) return;
        switch (e.type) {
          case 'meta':
            metaSeen = true;
            setConversationId(e.conversationId);
            // Recent chats: a new conversation appears, an existing one moves up (the server title wins).
            touchConversation(e.conversationId, conversation?.title ?? (body.message ?? '').trim().slice(0, TITLE_LEN));
            if (pendingUserId) setMessages((ms) => ms.map((m) => (m.id === pendingUserId ? { ...m, id: e.userMessageId } : m)));
            if (new URLSearchParams(window.location.search).get('c') !== e.conversationId) {
              // Not a navigation: the view (and this stream) stays mounted. `null` data lets Next sync its
              // router (useSearchParams, later refreshes) to the new URL.
              window.history.replaceState(null, '', `/chat?c=${e.conversationId}`);
            }
            break;
          case 'text':
            text += e.delta;
            setDraft(text);
            break;
          case 'done':
            setDraft(null);
            setMessages((ms) => [
              ...ms,
              { id: e.assistantMessageId, role: 'assistant', content: text, contextRefs: e.contextRefs, summaryCount: e.summaryCount },
            ]);
            break;
          case 'error':
            // The server saved nothing of a failed reply, so the partial text goes too.
            setDraft(null);
            setNotice({
              kind: 'error',
              message: e.message,
              retry: metaSeen || !pendingUserId ? { kind: 'regenerate' } : { kind: 'resend', text: body.message ?? '', localId: pendingUserId },
            });
            break;
        }
      },
    });
  }

  function sendMessage(raw: string) {
    const text = raw.trim();
    if (!text || streaming) return;
    const id = localId();
    setMessages((ms) => [...ms, { id, role: 'user', content: text, contextRefs: [], summaryCount: 0 }]);
    setInput('');
    void runTurn({ conversationId: conversationId ?? undefined, message: text, scope }, id);
  }

  function regenerate() {
    if (streaming || !conversationId) return;
    // The server replaces the last reply; drop ours now so the new one streams in its place.
    setMessages((ms) => (ms.at(-1)?.role === 'assistant' ? ms.slice(0, -1) : ms));
    void runTurn({ conversationId, regenerate: true, scope }, null);
  }

  function retry(r: Retry) {
    if (r.kind === 'regenerate') return regenerate();
    setMessages((ms) => ms.filter((m) => m.id !== r.localId));
    sendMessage(r.text);
  }

  function stop() {
    stream.abort();
    setDraft(null);
    // The user message is kept (the server saved it before streaming); the partial reply is dropped.
    const lastUser = messages.findLast((m) => m.role === 'user');
    const saved = lastUser && !lastUser.id.startsWith('local-');
    setNotice({
      kind: 'stopped',
      retry: saved || !lastUser ? { kind: 'regenerate' } : { kind: 'resend', text: lastUser.content, localId: lastUser.id },
    });
  }

  const missing = urlId !== null && conversation === null && conversationId === null;

  return (
    <div className="absolute inset-0 flex flex-col">
      <h1 className="sr-only">Chat</h1>
      <MessageList
        messages={messages}
        draft={draft}
        pinKey={pinKey}
        onRegenerate={streaming ? undefined : regenerate}
        empty={
          <div className="m-auto flex max-w-xl flex-col items-center gap-4 py-8 text-center">
            {missing && <p className="text-sm text-muted-foreground">Không tìm thấy cuộc chat này. Bắt đầu cuộc chat mới bên dưới.</p>}
            <p className="text-lg font-medium">Hôm nay mình giúp gì được?</p>
            <SuggestedPrompts onPick={sendMessage} disabled={streaming} />
          </div>
        }
        after={notice && <NoticeBlock notice={notice} onRetry={() => retry(notice.retry)} disabled={streaming} />}
      />
      <Composer
        value={input}
        onChange={setInput}
        onSubmit={() => sendMessage(input)}
        onStop={stop}
        streaming={streaming}
        toolbar={<ScopeSelector scope={scope} areas={areas} onChange={setScope} />}
      />
    </div>
  );
}

function NoticeBlock({ notice, onRetry, disabled }: { notice: Notice; onRetry: () => void; disabled: boolean }) {
  const retryButton = (
    <Button type="button" variant="outline" className="min-h-11 gap-1.5" onClick={onRetry} disabled={disabled}>
      <RotateCcwIcon aria-hidden />
      Thử lại
    </Button>
  );
  if (notice.kind === 'stopped') {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>Đã dừng trả lời.</span>
        {retryButton}
      </div>
    );
  }
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <p className="min-w-0 flex-1 text-destructive">{notice.message}</p>
      {retryButton}
    </div>
  );
}
