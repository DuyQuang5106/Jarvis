import { AiProviderError } from '../errors';
import { collect, type AiProvider, type ToolDef } from './provider';

export type ProbeReport = {
  chat: boolean;
  streaming: boolean;
  tools: { passed: number; total: number };
  json: { passed: number; total: number };
  notes: string[];
};

const AREA_ID = '11111111-1111-4111-8111-111111111111';
const TOOL_ATTEMPTS = 3;
const JSON_ATTEMPTS = 5;

const PROPOSE_TOOL: ToolDef = {
  name: 'propose_changes',
  description: 'Đề xuất các thay đổi dữ liệu cho người dùng duyệt.',
  parameters: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['create_task'] },
            areaId: { type: 'string' },
            title: { type: 'string' },
          },
          required: ['type', 'areaId', 'title'],
        },
      },
    },
    required: ['summary', 'actions'],
  },
};

const TASK_PROMPT = `Tạo task tên Probe task cho area ${AREA_ID}`;

const JSON_SYSTEM = `Bạn là trợ lý. Khi người dùng nhờ tạo task, hãy trả lời ngắn gọn rồi đặt đúng một object JSON dạng {"summary": string, "actions": [{"type": "create_task", "areaId": string, "title": string}]} giữa thẻ <proposed_actions> và </proposed_actions> ở cuối câu trả lời.`;

function describe(err: unknown): string {
  if (err instanceof AiProviderError) return err.status ? `HTTP ${err.status}` : err.message;
  return err instanceof Error ? err.message : 'lỗi không rõ';
}

function isGoodPayload(value: unknown): boolean {
  const v = value as { actions?: { title?: unknown; areaId?: unknown }[] } | null;
  const a = v && Array.isArray(v.actions) ? v.actions[0] : undefined;
  return !!a && a.title === 'Probe task' && a.areaId === AREA_ID;
}

function parseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export async function runProbe(provider: AiProvider): Promise<ProbeReport> {
  const report: ProbeReport = {
    chat: false,
    streaming: false,
    tools: { passed: 0, total: TOOL_ATTEMPTS },
    json: { passed: 0, total: JSON_ATTEMPTS },
    notes: [],
  };

  try {
    const { text } = await collect(
      provider.stream({ messages: [{ role: 'user', content: 'Trả lời đúng một từ: xin chào' }], maxOutputTokens: 50 }),
    );
    report.chat = text.trim().length > 0;
    if (!report.chat) report.notes.push('chat: câu trả lời rỗng');
  } catch (err) {
    report.notes.push(`chat: ${describe(err)}`);
  }

  try {
    let textEvents = 0;
    for await (const e of provider.stream({
      messages: [{ role: 'user', content: 'Đếm từ 1 đến 20, mỗi số một dòng' }],
      maxOutputTokens: 200,
    })) {
      if (e.type === 'text') textEvents += 1;
    }
    report.streaming = textEvents >= 2;
    if (!report.streaming) report.notes.push(`streaming: chỉ nhận ${textEvents} sự kiện text`);
  } catch (err) {
    report.notes.push(`streaming: ${describe(err)}`);
  }

  for (let i = 0; i < TOOL_ATTEMPTS; i += 1) {
    try {
      const { toolCalls } = await collect(
        provider.stream({
          messages: [{ role: 'user', content: TASK_PROMPT }],
          tools: [PROPOSE_TOOL],
          maxOutputTokens: 400,
        }),
      );
      if (toolCalls.length === 1 && isGoodPayload(parseJson(toolCalls[0].argsJson))) report.tools.passed += 1;
      else report.notes.push(`tools #${i + 1}: ${toolCalls.length} tool call, nội dung không đạt`);
    } catch (err) {
      report.notes.push(`tools #${i + 1}: ${describe(err)}`);
    }
  }

  for (let i = 0; i < JSON_ATTEMPTS; i += 1) {
    try {
      const { text } = await collect(
        provider.stream({
          messages: [
            { role: 'system', content: JSON_SYSTEM },
            { role: 'user', content: TASK_PROMPT },
          ],
          maxOutputTokens: 600,
        }),
      );
      const m = /<proposed_actions>([\s\S]*?)<\/proposed_actions>/.exec(text);
      if (m && isGoodPayload(parseJson(m[1].trim()))) report.json.passed += 1;
      else report.notes.push(`json #${i + 1}: không tách/parse được khối hợp lệ`);
    } catch (err) {
      report.notes.push(`json #${i + 1}: ${describe(err)}`);
    }
  }

  return report;
}

export function recommendMode(r: ProbeReport): 'tools' | 'json' | 'off' {
  if (r.tools.passed === r.tools.total) return 'tools';
  if (r.json.passed === r.json.total) return 'json';
  return 'off';
}
