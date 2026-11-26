import type { ReplyStats as Stats } from '@/server/chat/run-turn';

const tokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace('.', ',')}k` : String(n));
const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} giây`;

/** Under an assistant reply: tokens spent and how long it took. Older replies saved without stats show nothing. */
export function ReplyStats({ stats }: { stats: Stats | null | undefined }) {
  if (!stats) return null;
  const parts: string[] = [];
  if (stats.inputTokens !== null && stats.outputTokens !== null) {
    parts.push(`${tokens(stats.inputTokens + stats.outputTokens)} token (vào ${tokens(stats.inputTokens)} · ra ${tokens(stats.outputTokens)})`);
  }
  if (stats.firstTokenMs !== null) parts.push(`chữ đầu sau ${seconds(stats.firstTokenMs)}`);
  parts.push(`tổng ${seconds(stats.totalMs)}`);
  return (
    <p data-testid="reply-stats" className="text-xs text-muted-foreground tabular-nums">
      {parts.join(' · ')}
    </p>
  );
}
