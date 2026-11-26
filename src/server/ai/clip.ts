/** Cuts `s` to `max` UTF-16 units plus `…`, never splitting a surrogate pair. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const code = s.charCodeAt(max - 1);
  const end = code >= 0xd800 && code <= 0xdbff ? max - 1 : max;
  return `${s.slice(0, end)}…`;
}
