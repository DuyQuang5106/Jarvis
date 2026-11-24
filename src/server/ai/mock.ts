import { AiProviderError } from '../errors';
import { normalizeVi } from './match-areas';
import type { AiProvider, ProviderEvent, StreamRequest } from './provider';

type MockState = {
  now: { date: string };
  areas: { id: string; name: string; status: string }[];
  details: { areaId: string; name: string; topics: { id: string; title: string; status: string }[] }[];
};

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
      if (u.includes('MOCK_SLOW')) {
        // A long reply for testing `Dừng`: one chunk every SLOW_STEP_MS, stopping as soon as the request aborts.
        for (let i = 1; i <= SLOW_CHUNKS; i++) {
          if (i > 1) await sleep(SLOW_STEP_MS, req.signal);
          yield { type: 'text', delta: `MOCK_SLOW_CHUNK_${i} ` };
        }
        return;
      }

      const system = req.messages.find((m) => m.role === 'system')?.content ?? '';
      const state = parseState(system);

      if (u.includes('MOCK_BAD_PROPOSAL')) {
        yield* emitWithProposal(req, system, 'Đề xuất lỗi.', {
          summary: 'Hỏng',
          actions: [{ type: 'update_task', id: '00000000-0000-4000-8000-000000000000', patch: { status: 'done' } }],
        });
        return;
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
