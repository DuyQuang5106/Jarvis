import type { AreaDetailForAi, WorkspaceState } from './context-builder';

const KEEP_LOGS = 5;
const KEEP_NOTES = 3;
const NOTE_MAX = 500;
const OUTLINE_MAX = 2000;

/** Cuts `s` to `max` UTF-16 units plus `…`, never splitting a surrogate pair. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const code = s.charCodeAt(max - 1);
  const end = code >= 0xd800 && code <= 0xdbff ? max - 1 : max;
  return `${s.slice(0, end)}…`;
}

const mapDetails = (state: WorkspaceState, f: (d: AreaDetailForAi) => AreaDetailForAi): WorkspaceState => ({
  ...state,
  details: state.details.map(f),
});

const STEPS: ((s: WorkspaceState) => WorkspaceState)[] = [
  // 1. Mỗi detail giữ 5 recentLogs.
  (s) => mapDetails(s, (d) => ({ ...d, recentLogs: d.recentLogs.slice(0, KEEP_LOGS) })),
  // 2. Mỗi detail giữ 3 notes, mỗi note tối đa 500 ký tự.
  (s) =>
    mapDetails(s, (d) => ({
      ...d,
      notes: d.notes.slice(0, KEEP_NOTES).map((n) => ({ ...n, text: clip(n.text, NOTE_MAX) })),
    })),
  // 3. courseOutline tối đa 2000 ký tự.
  (s) =>
    mapDetails(s, (d) =>
      d.academic?.courseOutline
        ? { ...d, academic: { ...d.academic, courseOutline: clip(d.academic.courseOutline, OUTLINE_MAX) } }
        : d,
    ),
];

/**
 * Applies the fixed truncation order until `fits(state)` holds. Tier 1 (everything but `details`)
 * is never touched; if it alone does not fit, the result has no details and still `truncated: true`.
 *
 * Steps: 1–3 above; 4. drop details from the end, keeping the first (most relevant) one;
 * 5. drop `recentLogs` and `notes` of what remains; finally drop the last detail.
 */
export function truncateState(
  state: WorkspaceState,
  fits: (s: WorkspaceState) => boolean,
): { state: WorkspaceState; truncated: boolean } {
  if (fits(state)) return { state, truncated: false };
  let s = state;
  for (const step of STEPS) {
    s = step(s);
    if (fits(s)) return { state: s, truncated: true };
  }
  while (s.details.length > 1) {
    s = { ...s, details: s.details.slice(0, -1) };
    if (fits(s)) return { state: s, truncated: true };
  }
  s = mapDetails(s, (d) => ({ ...d, recentLogs: [], notes: [] }));
  if (fits(s)) return { state: s, truncated: true };
  return { state: { ...s, details: [] }, truncated: true };
}
