'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { listDocumentVersionsAction, restoreDocumentVersionAction } from '@/app/(app)/_actions/documents';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { DocumentRow, DocumentVersionRow } from '@/db/schema';
import { formatDateTimeVi } from '@/lib/dates';
import { ORIGIN_LABEL } from '@/lib/labels';
import { computeLineDiff } from '@/lib/line-diff';

export function DocVersionsDialog({
  open,
  onOpenChange,
  documentId,
  currentBody,
  onRestored,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  documentId: string;
  currentBody: string;
  onRestored: (doc: DocumentRow) => void;
}) {
  const [versions, setVersions] = useState<DocumentVersionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, startRestore] = useTransition();

  useEffect(() => {
    if (!open) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setLoading(true);
      setError(null);
      return listDocumentVersionsAction(documentId);
    }).then((res) => {
      if (!active || !res) return;
      setLoading(false);
      if (res.ok) {
        setVersions(res.data);
        setSelectedId((prev) => (prev && res.data.some((v) => v.id === prev) ? prev : (res.data[0]?.id ?? null)));
      } else {
        setError(res.error);
      }
    });
    return () => {
      active = false;
    };
  }, [open, documentId]);

  const selected = versions.find((v) => v.id === selectedId) ?? null;
  const diff = useMemo(
    () => (selected ? computeLineDiff(currentBody, selected.bodyMd) : []),
    [selected, currentBody],
  );

  function handleRestore() {
    if (!selected || restoring) return;
    setError(null);
    startRestore(async () => {
      const res = await restoreDocumentVersionAction(documentId, selected.id);
      if (res.ok) {
        onRestored(res.data);
        onOpenChange(false);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Lịch sử phiên bản</DialogTitle>
          <DialogDescription>So sánh với bản hiện tại và khôi phục khi cần (không xóa lịch sử).</DialogDescription>
        </DialogHeader>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {loading ? (
          <p className="py-4 text-sm text-muted-foreground">Đang tải phiên bản…</p>
        ) : versions.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Chưa có phiên bản nào.</p>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[15rem_1fr]">
            <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-1 md:max-h-none">
              {versions.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(v.id)}
                    className={`flex min-h-11 w-full flex-col gap-1 rounded-lg border p-2.5 text-left text-sm ${
                      v.id === selectedId ? 'border-primary bg-accent/50' : 'bg-card'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">v{v.revision}</span>
                      <Badge variant="outline">{ORIGIN_LABEL[v.origin]}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDateTimeVi(v.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex min-h-0 flex-col gap-2">
              {selected && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">{selected.title} (v{selected.revision})</span>
                    <Button type="button" className="min-h-11 px-4" disabled={restoring} onClick={handleRestore}>
                      {restoring ? 'Đang khôi phục…' : 'Khôi phục bản này'}
                    </Button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-muted/30 p-2 font-mono text-xs">
                    {diff.length === 0 ? (
                      <p className="p-2 text-muted-foreground">Bản này trống.</p>
                    ) : (
                      diff.map((line, i) => (
                        <div
                          key={i}
                          className={
                            line.kind === 'add'
                              ? 'bg-emerald-500/15 px-1.5 py-0.5 text-emerald-900 wrap-anywhere dark:text-emerald-200'
                              : line.kind === 'del'
                                ? 'bg-red-500/15 px-1.5 py-0.5 text-red-900 wrap-anywhere dark:text-red-200'
                                : 'px-1.5 py-0.5 text-muted-foreground wrap-anywhere'
                          }
                        >
                          <span className="mr-1.5 select-none">
                            {line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}
                          </span>
                          {line.text || ' '}
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
