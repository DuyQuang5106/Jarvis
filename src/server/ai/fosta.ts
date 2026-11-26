import OpenAI from 'openai';
import { AiProviderError } from '../errors';
import type { AiProvider, ProviderEvent, StreamRequest, TokenUsage } from './provider';

type Opts = { baseUrl: string; apiKey: string; model: string; fetch?: typeof fetch };

function wrap(err: unknown): AiProviderError {
  if (err instanceof AiProviderError) return err;
  const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : undefined;
  // Không đưa nội dung tin nhắn hay key vào thông báo lỗi.
  const label = status ? `Provider AI trả lỗi HTTP ${status}.` : 'Không gọi được provider AI.';
  return new AiProviderError(label, status);
}

export function createFostaProvider(opts: Opts): AiProvider {
  const client = new OpenAI({
    baseURL: opts.baseUrl,
    apiKey: opts.apiKey,
    maxRetries: 0,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });

  return {
    async *stream(req: StreamRequest): AsyncGenerator<ProviderEvent> {
      const calls = new Map<number, { name: string; args: string }>();
      let chunks = 0;
      let finishReason: string | null = null;
      let usage: TokenUsage | null = null;
      try {
        const stream = await client.chat.completions.create(
          {
            model: opts.model,
            messages: req.messages,
            stream: true,
            // The last chunk then carries token counts (shown under each reply).
            stream_options: { include_usage: true },
            max_tokens: req.maxOutputTokens,
            ...(req.tools?.length
              ? {
                  tools: req.tools.map((t) => ({
                    type: 'function' as const,
                    function: { name: t.name, description: t.description, parameters: t.parameters },
                  })),
                }
              : {}),
          },
          { signal: req.signal },
        );
        for await (const part of stream) {
          chunks += 1;
          if (part.usage) usage = { inputTokens: part.usage.prompt_tokens ?? 0, outputTokens: part.usage.completion_tokens ?? 0 };
          const choice = part.choices?.[0];
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          const delta = choice?.delta;
          if (!delta) continue;
          if (delta.content) yield { type: 'text', delta: delta.content };
          for (const tc of delta.tool_calls ?? []) {
            const cur = calls.get(tc.index) ?? { name: '', args: '' };
            // Tên đến một lần; có gateway gửi lại nguyên tên ở mỗi delta, nên chỉ giữ tên đầu tiên.
            if (tc.function?.name && !cur.name) cur.name = tc.function.name;
            if (tc.function?.arguments) cur.args += tc.function.arguments;
            calls.set(tc.index, cur);
          }
        }
      } catch (err) {
        throw wrap(err);
      }
      // Body 200 không phải SSE (HTML của gateway, JSON không stream...) không sinh chunk nào.
      if (chunks === 0) throw new AiProviderError('Provider AI không trả về stream hợp lệ.');
      req.onFinishReason?.(finishReason);
      if (usage) req.onUsage?.(usage);
      const ordered = [...calls.entries()].sort((a, b) => a[0] - b[0]);
      // Tool call không có tên là phản hồi hỏng: báo lỗi, không phát ra tool call tên rỗng.
      if (ordered.some(([, c]) => !c.name)) throw new AiProviderError('Provider AI trả về tool call không có tên.');
      for (const [, c] of ordered) {
        yield { type: 'tool_call', name: c.name, argsJson: c.args };
      }
    },
  };
}
