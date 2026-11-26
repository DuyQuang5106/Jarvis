'use client';

import { RotateCcwIcon } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { firstChars } from '@/lib/utils';
import type { ContextScope } from '@/server/ai/context-builder';
import type { DailyBrief } from '@/server/brief/daily-brief';
import type { PendingCheckin } from '@/server/checkin/checkin';
import type { TurnEvent } from '@/server/chat/run-turn';
import { takeChatPreset, type ChatPreset } from './chat-preset';
import { CheckinCard } from './checkin-card';
import { Composer } from './composer';
import { DailyBriefCard } from './daily-brief-card';
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

/** The server's answer to a message it refused as empty or too long (run-turn). */
const INVALID_MESSAGE = 'Tin nhắn trống hoặc quá dài.';

/** What `Thử lại` does: regenerate the saved turn, or resend a message the server never saved. */
type Retry = { kind: 'regenerate' } | { kind: 'resend'; text: string; localId: string };
/** `retry` is null when trying again unchanged cannot help (the message itself was refused). */
type Notice = { kind: 'error'; message: string; retry: Retry | null } | { kind: 'stopped'; retry: Retry };

let localSeq = 0;
const localId = () => `local-${++localSeq}`;

export function ChatView({
  conversation,
  messages: initialMessages,
  areas,
  requestedId,
  brief,
  checkin,
  today,
}: {
  conversation: { id: string; title: string } | null;
  messages: ChatMessageView[];
  areas: ChatAreaOption[];
  /** The `c` search param the server rendered these props for (null: none). */
  requestedId: string | null;
  /** Today's stored orientation brief, or null (the card then asks for it itself). */
  brief: DailyBrief | null;
  /** The check-in card to show on a new conversation (summary possibly still to generate), or null. */
  checkin: PendingCheckin | null;
  /** The app day (YYYY-MM-DD) these props were rendered for. */
  today: string;
}) {
  const router = useRouter();
  const urlId = useSearchParams().get('c');
  const stream = useChatStream();
  const streaming = stream.status === 'streaming';

  const [conversationId, setConversationId] = useState<string | null>(conversation?.id ?? null);
  // Recent chats title: the server's, or (a new conversation) the first message cut like the server cuts it.
  // Later turns and regenerate never change it.
  const [title, setTitle] = useState<string | null>(conversation?.title ?? null);
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState<string | null>(null);
  // Transient status (`Đang đọc N tài liệu…`) for the draft until its first text; never saved.
  const [draftStatus, setDraftStatus] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [scope, setScope] = useState<ContextScope>(AUTO);
  const [input, setInput] = useState('');
  const [pinKey, setPinKey] = useState(0);
  // Bumped whenever the view switches conversation; events of an older turn are ignored.
  const [generation, setGeneration] = useState(0);
  const generationRef = useRef(0);
  // The reply `Tạo lại` hides while the new one streams; it comes back if the new one fails or is stopped.
  const replaced = useRef<ChatMessageView | null>(null);

  function loadServerCopy() {
    setConversationId(conversation?.id ?? null);
    setTitle(conversation?.title ?? null);
    setMessages(initialMessages);
    setDraft(null);
    setDraftStatus(null);
    setNotice(null);
    setScope(AUTO);
    setGeneration((g) => g + 1);
  }

  // The URL is the source of truth for which conversation is open. Our own replaceState after `meta`
  // gives the id we already hold; anything else (a Recent chats link, `Chat mới`) loads the server's copy.
  const [seenUrlId, setSeenUrlId] = useState(urlId);
  if (urlId !== seenUrlId) {
    setSeenUrlId(urlId);
    if (urlId !== conversationId) loadServerCopy();
  }

  // Back/forward can restore this page from router state saved before our replaceState, i.e. props rendered
  // for another URL (`/chat` without `c`). Such props are stale: fetch the current URL's once, then load them.
  const stale = requestedId !== urlId && conversationId !== urlId;
  const refreshedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!stale || refreshedFor.current === urlId) return;
    refreshedFor.current = urlId;
    router.refresh();
  }, [stale, urlId, router]);
  const [seenRequestedId, setSeenRequestedId] = useState(requestedId);
  if (requestedId !== seenRequestedId) {
    setSeenRequestedId(requestedId);
    if (requestedId === urlId && urlId !== conversationId && !streaming) loadServerCopy();
  }
  const { abort } = stream;
  useEffect(() => {
    if (generationRef.current === generation) return;
    generationRef.current = generation;
    replaced.current = null; // a reply hidden by `Tạo lại` belongs to the conversation we left
    abort(); // a turn still streaming belongs to the conversation we left
  }, [generation, abort]);

  async function runTurn(body: ChatSendInput, pendingUserId: string | null) {
    const gen = generationRef.current;
    let text = '';
    let metaSeen = false;
    let pendingActionId: string | null = null;
    setDraft('');
    setDraftStatus(null);
    setNotice(null);
    setPinKey((k) => k + 1);
    await stream.send(body, {
      onEvent(e: TurnEvent) {
        if (gen !== generationRef.current) return;
        switch (e.type) {
          case 'meta': {
            metaSeen = true;
            setConversationId(e.conversationId);
            // Recent chats: a new conversation appears, an existing one moves up (the server title wins).
            const t = title ?? firstChars(body.message?.trim() || messages.find((m) => m.role === 'user')?.content || '', TITLE_LEN);
            setTitle(t);
            touchConversation(e.conversationId, t);
            if (pendingUserId) setMessages((ms) => ms.map((m) => (m.id === pendingUserId ? { ...m, id: e.userMessageId } : m)));
            if (new URLSearchParams(window.location.search).get('c') !== e.conversationId) {
              // Not a navigation: the view (and this stream) stays mounted. `null` data lets Next sync its
              // router (useSearchParams, later refreshes) to the new URL.
              window.history.replaceState(null, '', `/chat?c=${e.conversationId}`);
            }
            break;
          }
          case 'status':
            if (text === '') setDraftStatus(e.message);
            break;
          case 'text':
            text += e.delta;
            setDraft(text);
            setDraftStatus(null);
            break;
          case 'proposal':
            pendingActionId = e.pendingActionId;
            break;
          case 'done':
            replaced.current = null;
            setDraft(null);
            setDraftStatus(null);
            setMessages((ms) => [
              ...ms,
              {
                id: e.assistantMessageId,
                role: 'assistant',
                content: text,
                contextRefs: e.contextRefs,
                summaryCount: e.summaryCount,
                pendingActionId,
              },
            ]);
            break;
          case 'error':
            // The server saved nothing of a failed reply, so the partial text goes too.
            setDraft(null);
            setDraftStatus(null);
            restoreReplaced();
            if (!metaSeen && pendingUserId && e.message === INVALID_MESSAGE) {
              // Refused before saving: the text goes back into the composer to be edited.
              const typed = body.message ?? '';
              setMessages((ms) => ms.filter((m) => m.id !== pendingUserId));
              setInput((cur) => (cur === '' ? typed : cur));
              setNotice({ kind: 'error', message: e.message, retry: null });
              break;
            }
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

  // A message queued by another screen (Context's `Tạo từ tài liệu`) opens this new conversation with its
  // own scope. Taking it empties the queue, so a re-run of this effect (StrictMode, the page shown again)
  // sends nothing twice. Declared after the generation effect: a turn of the conversation we left is
  // aborted before this one starts.
  function startPreset(preset: ChatPreset) {
    const id = localId();
    setScope(preset.scope);
    setMessages([{ id, role: 'user', content: preset.message, contextRefs: [], summaryCount: 0 }]);
    void runTurn({ message: preset.message, scope: preset.scope }, id);
  }
  useEffect(() => {
    if (urlId !== null) return;
    const preset = takeChatPreset();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a message handed over by another screen is an external event, taken once
    if (preset) startPreset(preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per time the new-conversation view is shown
  }, [urlId]);

  function restoreReplaced() {
    const old = replaced.current;
    replaced.current = null;
    if (old) setMessages((ms) => (ms.some((m) => m.id === old.id) ? ms : [...ms, old]));
  }

  function regenerate() {
    if (streaming || !conversationId) return;
    // The server replaces the last reply only once the new one is saved; hide ours so the new one
    // streams in its place, and keep it to put back if the new one fails or is stopped.
    const last = messages.at(-1);
    if (last?.role === 'assistant') {
      replaced.current = last;
      setMessages((ms) => ms.slice(0, -1));
    }
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
    setDraftStatus(null);
    restoreReplaced();
    // The user message is kept (the server saved it before streaming); the partial reply is dropped.
    const lastUser = messages.findLast((m) => m.role === 'user');
    const saved = lastUser && !lastUser.id.startsWith('local-');
    setNotice({
      kind: 'stopped',
      retry: saved || !lastUser ? { kind: 'regenerate' } : { kind: 'resend', text: lastUser.content, localId: lastUser.id },
    });
  }

  const missing = urlId !== null && !stale && conversation === null && conversationId === null;

  return (
    <div className="absolute inset-0 flex flex-col">
      <h1 className="sr-only">Chat</h1>
      <MessageList
        messages={messages}
        draft={draft}
        draftStatus={draftStatus}
        pinKey={pinKey}
        onRegenerate={streaming ? undefined : regenerate}
        empty={
          // Stale props (see above) are about to be replaced: no prompts to click in the meantime.
          !stale && (
            <div className="m-auto flex w-full max-w-xl flex-col items-center gap-4 py-4 text-center">
              {checkin && (
                <CheckinCard key={checkin.slots.map((s) => `${s.day}:${s.slot}`).join(',')} initial={checkin} onSend={sendMessage} disabled={streaming} />
              )}
              {/* Nothing the AI may read: no card, and no request for one. */}
              {(brief || areas.some((a) => !a.aiExcluded)) && (
                <DailyBriefCard initial={brief} today={today} onStart={sendMessage} disabled={streaming} />
              )}
              {missing && <p className="text-sm text-muted-foreground">Không tìm thấy cuộc chat này. Bắt đầu cuộc chat mới bên dưới.</p>}
              <p className="text-lg font-medium">Hôm nay mình giúp gì được?</p>
              <SuggestedPrompts onPick={sendMessage} disabled={streaming} />
            </div>
          )
        }
        after={
          notice && (
            <NoticeBlock notice={notice} onRetry={notice.retry ? () => retry(notice.retry!) : undefined} disabled={streaming} />
          )
        }
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

function NoticeBlock({ notice, onRetry, disabled }: { notice: Notice; onRetry?: () => void; disabled: boolean }) {
  const retryButton = onRetry && (
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
