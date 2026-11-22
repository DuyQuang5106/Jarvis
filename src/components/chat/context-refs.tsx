import Link from 'next/link';
import { APP_TZ, formatDateVi, todayIn } from '@/lib/dates';
import type { ContextRef } from '@/server/ai/context-builder';

const chip = 'inline-flex min-h-8 items-center rounded-full border px-2.5 text-xs';

/** `Dựa trên:` line under an assistant message: one link per expanded area, plus the summary count. */
export function ContextRefs({ refs, summaryCount }: { refs: ContextRef[]; summaryCount: number }) {
  if (refs.length === 0 && summaryCount <= 0) return null;
  return (
    <div data-testid="context-refs" className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <span>Dựa trên:</span>
      {refs.map((r) => (
        <Link
          key={r.areaId}
          href={`/context?tab=${r.kind === 'academic' ? 'academic' : 'projects'}&item=${r.areaId}`}
          className={`${chip} max-w-full text-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 outline-none`}
        >
          <span className="truncate">{r.name}</span>
          <span aria-hidden className="mx-1">·</span>
          <span className="shrink-0">{formatDateVi(todayIn(APP_TZ, new Date(r.updatedAt)))}</span>
        </Link>
      ))}
      {summaryCount > 0 && <span className={chip}>Tổng quan {summaryCount} mục</span>}
    </div>
  );
}
