'use client';

import type { AreaSummary } from '@/server/queries/snapshot';

/** "Cần cập nhật": stale areas of both tabs. div/button only (no <li>), see the markup rule. */
export function StaleStrip({ areas, onOpen }: { areas: AreaSummary[]; onOpen: (a: AreaSummary) => void }) {
  if (areas.length === 0) return null;
  return (
    <section aria-label="Cần cập nhật" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
      <h2 className="mb-2 text-sm font-medium">Cần cập nhật</h2>
      <div className="flex flex-wrap gap-2">
        {areas.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onOpen(a)}
            className="min-h-11 rounded-full border bg-background px-3 text-sm"
          >
            {a.name} · {a.daysSinceUpdate} ngày
          </button>
        ))}
      </div>
    </section>
  );
}
