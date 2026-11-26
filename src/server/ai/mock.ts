import { isFromDocumentsRequest } from '@/lib/from-documents';
import { AiProviderError } from '../errors';
import { normalizeVi } from './match-areas';
import { BRIEF_PROMPT_MARKER } from './prompt';
import type { AiProvider, ProviderEvent, StreamRequest } from './provider';

type MockState = {
  now: { date: string };
  areas: { id: string; name: string; status: string; kind?: string }[];
  documents?: { documentId: string; areaId: string; title: string; docRole: string; content?: string; outline?: string[][] }[];
  details: {
    areaId: string;
    name: string;
    kind?: string;
    topics: { id: string; title: string; status: string }[];
    assessments?: { title: string }[];
    milestones?: { title: string }[];
    tasks?: { title: string }[];
  }[];
};

/** `YYYY-MM-DD` plus `days`. */
function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** How far ahead the mock puts its tentative exam. */
export const MOCK_EXAM_IN_DAYS = 14;

/**
 * `Tạo từ tài liệu`: a fixed set of records for the scoped area (the first area in `details`, which is the
 * one area an `item` scope loads), skipping titles the area already has. Null when nothing is left to propose.
 */
function fromDocumentsProposal(state: MockState): { summary: string; actions: Record<string, unknown>[] } | null {
  const detail = state.details[0];
  if (!detail) return null;
  const areaId = detail.areaId;
  const has = (rows: { title: string }[] | undefined, title: string) => (rows ?? []).some((r) => r.title === title);
  const actions: Record<string, unknown>[] = [];
  if (detail.kind === 'project') {
    for (const [title, status] of [['Bản chạy được đầu tiên', 'in_progress'], ['Bản dùng thử', 'not_started']] as const)
      if (!has(detail.milestones, title)) actions.push({ type: 'upsert_milestone', areaId, title, status });
  } else {
    const topics = [
      ['Chương 1', 'familiar', 'Tài liệu ghi đã học xong, chưa làm bài tập.'],
      ['Chương 2', 'not_started', null],
      ['Chương 3', 'not_started', null],
    ] as const;
    for (const [title, status, evidence] of topics)
      if (!has(detail.topics, title)) actions.push({ type: 'upsert_topic', areaId, title, status, ...(evidence ? { evidence } : {}) });
    if (!has(detail.assessments, 'Giữa kỳ (dự kiến)'))
      actions.push({ type: 'upsert_assessment', areaId, title: 'Giữa kỳ (dự kiến)', dueDate: addDays(state.now.date, MOCK_EXAM_IN_DAYS) });
  }
  if (!has(detail.tasks, 'Làm bài tập Chương 1')) actions.push({ type: 'create_task', areaId, title: 'Làm bài tập Chương 1' });
  return actions.length ? { summary: `Tạo bản ghi từ tài liệu của ${detail.name}`, actions } : null;
}

/** Headings of a state document, from its text or (when only listed) its outline, in document order. */
function documentHeadings(doc: NonNullable<MockState['documents']>[number]): string[] {
  if (doc.content !== undefined) {
    return [...doc.content.matchAll(/^ {0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm)].map((m) => m[1].trim());
  }
  return (doc.outline ?? []).map((path) => path[path.length - 1]).filter(Boolean);
}

/**
 * `MOCK_DECISION`: the decision goes under a real heading of the first Markdown document of the area named in
 * the message (a decision/log heading when there is one), or into a new `STATE.md` when the area has none.
 */
function decisionProposal(state: MockState, message: string): { summary: string; actions: Record<string, unknown>[] } | null {
  const norm = normalizeVi(message);
  const area = state.areas.find((a) => normalizeVi(a.name).length > 0 && norm.includes(normalizeVi(a.name)));
  if (!area) return null;
  const line = `- ${state.now.date}: ${message.replace('MOCK_DECISION', '').trim()}`;
  for (const doc of state.documents ?? []) {
    if (doc.areaId !== area.id) continue;
    const headings = documentHeadings(doc);
    if (!headings.length) continue;
    const heading = headings.find((h) => /quyet dinh|nhat ky|log/.test(normalizeVi(h))) ?? headings[0];
    return { summary: `Ghi quyết định vào ${doc.title}`, actions: [{ type: 'append_to_document', documentId: doc.documentId, heading, markdown: line }] };
  }
  const markdown = [`# Trạng thái ${area.name}`, '## Trạng thái hiện tại', `## Quyết định\n\n${line}`, '## Vướng mắc', '## Nhật ký'].join('\n\n') + '\n';
  return { summary: `Tạo STATE.md cho ${area.name}`, actions: [{ type: 'create_document', areaId: area.id, title: 'STATE.md', markdown }] };
}

function parseState(system: string): MockState | null {
  const m = /<workspace_state>\n([\s\S]*)\n<\/workspace_state>/.exec(system);
  if (!m) return null;
  try {
    const s = JSON.parse(m[1]) as MockState;
    return s && s.now && Array.isArray(s.areas) && Array.isArray(s.details) ? s : null;
  } catch {
    return null;
  }
}

const MOCK_IMAGE_MARKDOWN = '![x](https://example.invalid/leak?d=1)';

const SLOW_CHUNKS = 20;
const SLOW_STEP_MS = 250;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AiProviderError('mock aborted'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new AiProviderError('mock aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function* emitWithProposal(
  req: StreamRequest,
  system: string,
  text: string,
  proposal: unknown,
): AsyncGenerator<ProviderEvent> {
  yield { type: 'text', delta: text };
  if (req.tools?.some((t) => t.name === 'propose_changes')) {
    yield { type: 'tool_call', name: 'propose_changes', argsJson: JSON.stringify(proposal) };
    return;
  }
  if (system.includes('<proposed_actions>')) {
    // Split the opening tag across two chunks to test ProposalBlockFilter boundary handling.
    yield { type: 'text', delta: '<proposed_' };
    yield { type: 'text', delta: `actions>${JSON.stringify(proposal)}</proposed_actions>` };
  }
}

export function createMockProvider(): AiProvider {
  return {
    async *stream(req: StreamRequest): AsyncGenerator<ProviderEvent> {
      const u = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      if (u.includes('MOCK_ERROR')) throw new AiProviderError('mock failure');
      if (u.includes('MOCK_PARTIAL_ERROR')) {
        yield { type: 'text', delta: 'Đang trả lời' };
        throw new AiProviderError('mock partial failure');
      }
      if (u.includes('MOCK_IMAGE')) {
        // Markdown image pointing off-site: the chat must not load it (it could carry data out in its URL).
        yield { type: 'text', delta: `Ảnh đây: ${MOCK_IMAGE_MARKDOWN} hết.` };
        return;
      }
      if (u.includes('MOCK_LENGTH')) {
        // The reply hit the output cap: the provider reports `finish_reason = length`.
        yield { type: 'text', delta: 'Phần đầu' };
        req.onFinishReason?.('length');
        return;
      }
      if (u.includes('MOCK_SLOW')) {
        // A long reply for testing `Dừng` and the waiting status: one chunk every SLOW_STEP_MS (the first one
        // too, so the status shows before any text), stopping as soon as the request aborts.
        for (let i = 1; i <= SLOW_CHUNKS; i++) {
          await sleep(SLOW_STEP_MS, req.signal);
          yield { type: 'text', delta: `MOCK_SLOW_CHUNK_${i} ` };
        }
        return;
      }

      const system = req.messages.find((m) => m.role === 'system')?.content ?? '';
      const state = parseState(system);

      if (system.includes(BRIEF_PROMPT_MARKER)) {
        // Daily brief: a deterministic brief over the first three areas of the state, wrapped in a code
        // fence and split across chunks the way real models tend to answer.
        const picked = (state?.areas ?? []).slice(0, 3);
        const brief = {
          focus: `MOCK_BRIEF ${state?.now.date ?? ''}: bắt đầu với ${picked[0]?.name ?? 'việc gần nhất'}.`,
          tasks: picked.map((a, i) => ({ title: `Việc ${i + 1} cho ${a.name}`, area: a.name, why: `Trạng thái hiện tại: ${a.status}.` })),
          upcoming: null,
          stale: picked.map((a) => a.name).join(', '),
        };
        yield { type: 'text', delta: '```json\n' };
        yield { type: 'text', delta: `${JSON.stringify(brief)}\n\`\`\`` };
        return;
      }

      if (u.includes('MOCK_BAD_PROPOSAL')) {
        yield* emitWithProposal(req, system, 'Đề xuất lỗi.', {
          summary: 'Hỏng',
          actions: [{ type: 'update_task', id: '00000000-0000-4000-8000-000000000000', patch: { status: 'done' } }],
        });
        return;
      }

      // A turn without the proposal machinery (a pure question) falls through to the plain state reply.
      const offersProposal = !!req.tools?.some((t) => t.name === 'propose_changes') || system.includes('<proposed_actions>');
      if (u.includes('MOCK_DECISION') && state && offersProposal) {
        const proposal = decisionProposal(state, u);
        if (proposal) yield* emitWithProposal(req, system, 'Đề xuất ghi quyết định vào tài liệu.', proposal);
        else yield { type: 'text', delta: 'Không rõ ghi vào môn hay dự án nào.' };
        return;
      }

      if (isFromDocumentsRequest(u) && state) {
        const proposal = fromDocumentsProposal(state);
        if (proposal) yield* emitWithProposal(req, system, 'Đề xuất tạo bản ghi từ tài liệu.', proposal);
        else yield { type: 'text', delta: 'Tài liệu không có gì mới để đề xuất.' };
        return;
      }

      if (u.startsWith('Cập nhật tài liệu') && state) {
        const norm = normalizeVi(u);
        const document = state.documents?.find((item) => item.docRole === 'context' && norm.includes(normalizeVi(item.title)));
        if (document) {
          yield* emitWithProposal(req, system, 'Đề xuất sửa Markdown.', {
            summary: 'Cập nhật tài liệu',
            actions: [{ type: 'replace_section', documentId: document.documentId, heading: 'Tiến độ', markdown: 'Đã đọc chương mới.' }],
          });
          return;
        }
      }

      if (u.startsWith('Báo blocker') && state) {
        const area = state.areas.find((item) => normalizeVi(u).includes(normalizeVi(item.name)));
        if (area) {
          yield* emitWithProposal(req, system, 'Đề xuất ghi vướng mắc.', {
            summary: 'Ghi nhận vướng mắc',
            actions: [{ type: 'create_blocker', areaId: area.id, title: 'Thiếu thiết bị thử nghiệm' }],
          });
          return;
        }
      }

      if (u.startsWith('Hạn nộp') && state) {
        const area = state.areas.find((item) => normalizeVi(u).includes(normalizeVi(item.name)));
        const date = u.match(/\d{4}-\d{2}-\d{2}/)?.[0];
        if (area && date) {
          yield* emitWithProposal(req, system, 'Đề xuất tạo việc có hạn nộp.', {
            summary: 'Ghi nhận hạn nộp',
            actions: [{ type: 'create_task', areaId: area.id, title: 'Nộp bài', dueDate: date }],
          });
          return;
        }
      }

      if (u.startsWith('Phân loại ghi chú') && state) {
        const normU = normalizeVi(u);
        const area = state.areas.find((a) => {
          const n = normalizeVi(a.name);
          return n.length > 0 && normU.includes(n);
        });
        if (area) {
          yield* emitWithProposal(req, system, 'Đề xuất từ ghi chú.', {
            summary: 'Từ ghi chú',
            actions: [{ type: 'create_task', areaId: area.id, title: 'Việc từ ghi chú' }],
          });
        } else {
          yield { type: 'text', delta: 'Không có đề xuất.' };
        }
        return;
      }

      if (/hoàn thành|đã xong/i.test(u) && state) {
        const detail = state.details.find((d) => d.topics.length > 0);
        if (detail) {
          yield* emitWithProposal(req, system, 'Ghi nhận. Đề xuất cập nhật.', {
            summary: 'Cập nhật tiến độ',
            actions: [
              { type: 'upsert_topic', areaId: detail.areaId, id: detail.topics[0].id, status: 'confident' },
              { type: 'add_progress_log', areaId: detail.areaId, text: u },
            ],
          });
          return;
        }
      }

      if (state) {
        const areas = state.areas.map((a) => `${a.name}=${a.status}`).join('; ');
        const details = state.details
          .map((d) => ` | detail:${d.name} topics:${d.topics.map((t) => `${t.title}=${t.status}`).join(',')}`)
          .join('');
        yield { type: 'text', delta: `MOCK_STATE today=${state.now.date} | ` };
        yield { type: 'text', delta: areas + details };
        return;
      }
      yield { type: 'text', delta: 'MOCK_REPLY: ' };
      yield { type: 'text', delta: u };
    },
  };
}
