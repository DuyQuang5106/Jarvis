import { getConfig } from './config';

/** E2E only: the instant the server treats as "now" for this request (ISO 8601). Ignored unless E2E=1. */
export const E2E_NOW_HEADER = 'x-e2e-now';

/** The request's "now": the real clock, or (E2E runs only) the instant in {@link E2E_NOW_HEADER}. */
export function requestNow(headers: Pick<Headers, 'get'>): Date {
  if (getConfig().e2e) {
    const raw = headers.get(E2E_NOW_HEADER);
    const at = raw ? new Date(raw) : null;
    if (at && !Number.isNaN(at.getTime())) return at;
  }
  return new Date();
}
