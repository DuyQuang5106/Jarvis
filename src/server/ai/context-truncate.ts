import type { AreaDetailForAi, WorkspaceState } from './context-builder';
import { clip } from './clip';
import { documentOutline, type DocumentContext } from './document-context';

export { clip };

const KEEP_LOGS = 5;
const KEEP_NOTES = 3;
const NOTE_MAX = 500;
const OUTLINE_MAX = 2000;

type Step = (s: WorkspaceState) => WorkspaceState | null;

const mapDetails = (state: WorkspaceState, f: (d: AreaDetailForAi) => AreaDetailForAi): WorkspaceState => ({
  ...state,
  details: state.details.map(f),
});

const withDocuments = (state: WorkspaceState, documents: DocumentContext[]): WorkspaceState => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- drop the key when empty
  const { documents: _, ...rest } = state;
  return documents.length ? { ...rest, documents } : rest;
};

const isExcerptOnly = (doc: DocumentContext) => doc.content === undefined && !doc.omitted;

/** A core document reduced to its name and outline. */
function toOmitted(doc: DocumentContext): DocumentContext {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip the text
  const { content, outline, excerpts, ...rest } = doc;
  const headings = outline ?? (content ? documentOutline(content) : []);
  return { ...rest, omitted: true, ...(headings.length ? { outline: headings } : {}) };
}

/** Converts the last core document at index ≥ `from` that still has text. */
const omitLastCore = (from: number): Step => (s) => {
  const docs = s.documents ?? [];
  for (let i = docs.length - 1; i >= from; i--) {
    if (docs[i].content !== undefined) return withDocuments(s, docs.map((doc, j) => (j === i ? toOmitted(doc) : doc)));
  }
  return null;
};

/** `repeat` steps run until they return null; `once` steps run a single time. */
const repeat = (run: Step) => ({ run, once: false });
const once = (run: (s: WorkspaceState) => WorkspaceState) => ({ run, once: true });

const STEPS: { run: Step; once: boolean }[] = [
  // 1. Trích đoạn tài liệu gốc, từ cuối danh sách.
  repeat((s) => {
    const docs = s.documents ?? [];
    for (let i = docs.length - 1; i >= 0; i--) {
      if (isExcerptOnly(docs[i])) return withDocuments(s, docs.filter((_, j) => j !== i));
    }
    return null;
  }),
  // 2. Mỗi detail giữ 5 recentLogs.
  once((s) => mapDetails(s, (d) => ({ ...d, recentLogs: d.recentLogs.slice(0, KEEP_LOGS) }))),
  // 3. Mỗi detail giữ 3 notes, mỗi note tối đa 500 ký tự; sau đó courseOutline tối đa 2000 ký tự.
  once((s) =>
    mapDetails(s, (d) => ({
      ...d,
      notes: d.notes.slice(0, KEEP_NOTES).map((n) => ({ ...n, text: clip(n.text, NOTE_MAX) })),
    })),
  ),
  once((s) =>
    mapDetails(s, (d) =>
      d.academic?.courseOutline
        ? { ...d, academic: { ...d.academic, courseOutline: clip(d.academic.courseOutline, OUTLINE_MAX) } }
        : d,
    ),
  ),
  // 4. Tài liệu lõi từ cuối danh sách chuyển sang omitted; tài liệu đầu tiên (trạng thái) được giữ.
  repeat(omitLastCore(1)),
  // 5. Bỏ details từ cuối, giữ detail đầu tiên (liên quan nhất).
  repeat((s) => (s.details.length > 1 ? { ...s, details: s.details.slice(0, -1) } : null)),
  // 6. Bỏ hết recentLogs và notes của phần còn lại.
  once((s) => mapDetails(s, (d) => ({ ...d, recentLogs: [], notes: [] }))),
  // 7. Tài liệu đầu tiên chuyển sang omitted.
  repeat(omitLastCore(0)),
  // 8. Bỏ các tài liệu còn lại từ cuối.
  repeat((s) => (s.documents?.length ? withDocuments(s, s.documents.slice(0, -1)) : null)),
  // 9. Bỏ detail cuối cùng.
  repeat((s) => (s.details.length ? { ...s, details: s.details.slice(0, -1) } : null)),
];

/**
 * Applies the fixed truncation order until `fits(state)` holds. Tier 1 (`now`, `termGoal`, `areas`,
 * `dueTasks`, `upcomingAssessments`, `staleAreaIds`) is never touched; if it alone does not fit, the
 * result has no details or documents and still `truncated: true`. The first document (the state
 * document of the most relevant area) keeps its text until only it and the first detail remain.
 */
export function truncateState(
  state: WorkspaceState,
  fits: (s: WorkspaceState) => boolean,
): { state: WorkspaceState; truncated: boolean } {
  if (fits(state)) return { state, truncated: false };
  let s = state;
  for (const step of STEPS) {
    for (let next = step.run(s); next; next = step.once ? null : step.run(s)) {
      s = next;
      if (fits(s)) return { state: s, truncated: true };
    }
  }
  return { state: s, truncated: true };
}
