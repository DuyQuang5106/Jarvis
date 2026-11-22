/** One factual line with a denominator, hidden when there is nothing to count. */
export function ProgressSummary({ done, total, suffix }: { done: number; total: number; suffix: string }) {
  if (total === 0) return null;
  return <p className="text-sm text-muted-foreground">{`${done}/${total} ${suffix}`}</p>;
}
