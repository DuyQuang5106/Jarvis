import { getConfig } from '../config';
import { ConfigError } from '../errors';
import { createFostaProvider } from './fosta';
import { createMockProvider } from './mock';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
/** `parameters` là JSON Schema. */
export type ToolDef = { name: string; description: string; parameters: Record<string, unknown> };
export type ProviderEvent = { type: 'text'; delta: string } | { type: 'tool_call'; name: string; argsJson: string };
export type StreamRequest = {
  messages: ChatMessage[];
  tools?: ToolDef[];
  maxOutputTokens: number;
  signal?: AbortSignal;
  /** Chẩn đoán: provider báo `finish_reason` cuối cùng (null nếu không có) khi stream kết thúc bình thường. */
  onFinishReason?: (reason: string | null) => void;
  /** Token counts of this request, when the provider reports them (called at most once, at the end). */
  onUsage?: (usage: TokenUsage) => void;
};
export type TokenUsage = { inputTokens: number; outputTokens: number };

export interface AiProvider {
  stream(req: StreamRequest): AsyncIterable<ProviderEvent>;
}

export function getProvider(): AiProvider {
  const cfg = getConfig();
  if (cfg.aiProvider === 'mock') return createMockProvider();
  if (!cfg.aiBaseUrl) throw new ConfigError('Thiếu biến môi trường AI_BASE_URL.');
  if (!cfg.aiApiKey) throw new ConfigError('Thiếu biến môi trường AI_API_KEY.');
  if (!cfg.aiModel) throw new ConfigError('Thiếu biến môi trường AI_MODEL.');
  return createFostaProvider({ baseUrl: cfg.aiBaseUrl, apiKey: cfg.aiApiKey, model: cfg.aiModel });
}

export async function collect(
  events: AsyncIterable<ProviderEvent>,
): Promise<{ text: string; toolCalls: { name: string; argsJson: string }[] }> {
  let text = '';
  const toolCalls: { name: string; argsJson: string }[] = [];
  for await (const e of events) {
    if (e.type === 'text') text += e.delta;
    else toolCalls.push({ name: e.name, argsJson: e.argsJson });
  }
  return { text, toolCalls };
}
