import Link from 'next/link';
import { APP_TZ, formatDateVi, todayIn } from '@/lib/dates';
import type { ContextRef } from '@/server/ai/context-builder';

const chipBase = 'inline-flex items-center rounded-full border px-2.5 text-xs';
const chip = `${chipBase} min-h-8`;
/** Source chips are links: a full touch target on a phone. */
const linkChip = `${chipBase} min-h-11 md:min-h-8`;

/** `Dựa trên:` line under an assistant message: one link per expanded area, plus the summary count. */
export function ContextRefs({ refs, summaryCount }: { refs: ContextRef[]; summaryCount: number }) {
  if (refs.length === 0 && summaryCount <= 0) return null;
  return (
    <div data-testid="context-refs" className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <span>Dựa trên:</span>
      {refs.map((r) => (
        <Link
          key={r.documentId ?? r.areaId}
          href={`/context?tab=${r.kind === 'academic' ? 'academic' : 'projects'}&item=${r.areaId}${r.documentId ? `&doc=${r.documentId}` : ''}`}
          className={`${linkChip} max-w-full text-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 outline-none`}
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
