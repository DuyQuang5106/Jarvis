import type { TurnEvent } from './run-turn';

const GENERIC_ERROR = 'Có lỗi xảy ra, thử lại.';

/** One JSON line per event; each is enqueued as soon as it is yielded (pull-based, no buffering). */
export function toNdjsonStream(events: AsyncIterable<TurnEvent>): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const it = events[Symbol.asyncIterator]();
  const line = (e: TurnEvent) => enc.encode(`${JSON.stringify(e)}\n`);
  let cancelled = false; // the client went away (e.g. `Dừng`): nothing more can be enqueued
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const r = await it.next();
        if (cancelled) return;
        if (r.done) controller.close();
        else controller.enqueue(line(r.value));
      } catch (e) {
        if (cancelled) return;
        console.error('chat stream failed', { name: (e as Error)?.name });
        controller.enqueue(line({ type: 'error', message: GENERIC_ERROR }));
        controller.close();
      }
    },
    async cancel() {
      cancelled = true;
      await it.return?.();
    },
  });
}
