'use client';

import { useCallback, useRef, useState } from 'react';
import type { ContextScope } from '@/server/ai/context-builder';
import type { TurnEvent } from '@/server/chat/run-turn';

export type ChatStreamStatus = 'idle' | 'streaming' | 'error';
export type ChatSendInput = {
  conversationId?: string;
  message?: string;
  scope: ContextScope;
  regenerate?: boolean;
  thread?: { general: true } | { areaId: string };
};
export type ChatStreamHandlers = { onEvent(e: TurnEvent): void };

const NETWORK_ERROR = 'Mất kết nối tới máy chủ. Thử lại.';
const GENERIC_ERROR = 'Có lỗi xảy ra, thử lại.';
const UNAUTHORIZED = 'Phiên đăng nhập đã hết hạn. Hãy tải lại trang để đăng nhập.';

function httpError(status: number): string {
  return status === 401 ? UNAUTHORIZED : GENERIC_ERROR;
}

/**
 * Posts one chat turn and reads the NDJSON reply line by line, keeping the unfinished tail of a line
 * between chunks. HTTP and network failures, and a stream that ends without `done`, become an `error` event.
 * `abort()` cancels the request quietly: no event follows, and the status goes back to `idle`.
 */
export function useChatStream(): {
  status: ChatStreamStatus;
  send(input: ChatSendInput, handlers: ChatStreamHandlers): Promise<void>;
  abort(): void;
} {
  const [status, setStatus] = useState<ChatStreamStatus>('idle');
  const controller = useRef<AbortController | null>(null);

  const send = useCallback(async (input: ChatSendInput, { onEvent }: ChatStreamHandlers) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setStatus('streaming');
    let finished = false;
    const emit = (e: TurnEvent) => {
      if (ctrl.signal.aborted || finished) return;
      if (e.type === 'done' || e.type === 'error') finished = true;
      if (e.type === 'error') setStatus('error');
      onEvent(e);
    };

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        emit({ type: 'error', message: httpError(res.status) });
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      const handleLine = (line: string) => {
        if (!line.trim()) return;
        let event: TurnEvent;
        try {
          event = JSON.parse(line) as TurnEvent;
        } catch {
          return; // a malformed line is skipped; the missing `done` is reported below
        }
        emit(event);
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          handleLine(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
        }
        if (finished) break;
      }
      if (!finished) handleLine(buffer);
      if (!finished) emit({ type: 'error', message: GENERIC_ERROR });
    } catch {
      if (!ctrl.signal.aborted) emit({ type: 'error', message: NETWORK_ERROR });
    } finally {
      // abort() already reset the state; a newer send owns it otherwise.
      if (controller.current === ctrl) {
        controller.current = null;
        setStatus((s) => (s === 'error' ? s : 'idle'));
      }
    }
  }, []);

  const abort = useCallback(() => {
    const ctrl = controller.current;
    if (!ctrl) return;
    ctrl.abort();
    controller.current = null;
    setStatus('idle');
  }, []);

  return { status, send, abort };
}
