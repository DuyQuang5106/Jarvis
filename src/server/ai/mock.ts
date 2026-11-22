import { AiProviderError } from '../errors';
import type { AiProvider, ProviderEvent, StreamRequest } from './provider';

type MockState = {
  now: { date: string };
  areas: { name: string; status: string }[];
  details: { name: string; topics: { title: string; status: string }[] }[];
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

export function createMockProvider(): AiProvider {
  return {
    async *stream(req: StreamRequest): AsyncGenerator<ProviderEvent> {
      const u = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      if (u.includes('MOCK_ERROR')) throw new AiProviderError('mock failure');
      if (u.includes('MOCK_PARTIAL_ERROR')) {
        yield { type: 'text', delta: 'Đang trả lời' };
        throw new AiProviderError('mock partial failure');
      }
      const state = parseState(req.messages.find((m) => m.role === 'system')?.content ?? '');
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
