'use client';

import { useState, useTransition } from 'react';
import { unarchiveAreaAction } from '@/app/(app)/_actions/areas';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { AreaRow as ArchivedArea } from '@/db/schema';
import type { AreaSummary } from '@/server/queries/snapshot';
import { AreaRow } from './area-row';

export function AreaList({
  areas,
  archived,
  kindLabel,
  searching,
  onOpen,
}: {
  areas: AreaSummary[];
  archived: ArchivedArea[];
  kindLabel: 'môn học' | 'dự án';
  searching: boolean;
  onOpen: (a: AreaSummary) => void;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function restore(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await unarchiveAreaAction(id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="space-y-4">
      {areas.length > 0 ? (
        <ul aria-label="Danh sách mục" className="space-y-2">
          {areas.map((a) => (
            <AreaRow key={a.id} area={a} onOpen={onOpen} />
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {searching
            ? 'Không có mục nào khớp.'
            : `Chưa có mục nào. Bấm Thêm để tạo ${kindLabel} đầu tiên.`}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
        <label htmlFor="show-archived" className="min-h-11 flex-1 content-center text-sm">Hiện mục đã lưu trữ</label>
      </div>

      {showArchived && (
        <section aria-label="Mục đã lưu trữ" className="space-y-2">
          {archived.length === 0 && <p className="text-sm text-muted-foreground">Chưa có mục nào được lưu trữ.</p>}
          {archived.map((a) => (
            <article key={a.id} className="flex items-center gap-3 rounded-lg border p-3">
              <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
              <Button variant="outline" className="min-h-11" disabled={pending} onClick={() => restore(a.id)}>
                Khôi phục
              </Button>
            </article>
          ))}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </section>
      )}
    </div>
  );
}
