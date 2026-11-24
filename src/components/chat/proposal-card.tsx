'use client';

import { CheckIcon } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import {
  approveProposalAction,
  getProposalAction,
  rebaseProposalAction,
  rejectProposalAction,
} from '@/app/(app)/_actions/proposals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { ProposalView } from '@/server/proposals/load';
import type { ActionPreview, ProposedAction } from '@/server/proposals/schema';
import { ProposalActionEditor, previewWithEdits } from './proposal-action-editor';

export function ProposalCard({
  proposalId,
  onResolved,
}: {
  proposalId: string;
  onResolved?: () => void;
}) {
  const [view, setView] = useState<ProposalView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<number, ProposedAction>>({});
  const [conflicts, setConflicts] = useState<Map<number, 'changed' | 'missing'>>(new Map());
  const [fieldErrors, setFieldErrors] = useState<Map<number, string>>(new Map());
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function syncFromView(next: ProposalView) {
    setView(next);
    const nextConflicts = new Map<number, 'changed' | 'missing'>();
    const selectable = new Set<number>();
    for (const p of next.previews) {
      if (p.conflict !== 'none') nextConflicts.set(p.key, p.conflict);
      if (p.conflict !== 'missing') selectable.add(p.key);
    }
    setConflicts(nextConflicts);
    setSelected((prev) => {
      if (prev.size === 0 && next.status === 'pending') return selectable;
      return new Set([...prev].filter((k) => selectable.has(k)));
    });
  }

  useEffect(() => {
    let active = true;
    void getProposalAction(proposalId).then((res) => {
      if (!active) return;
      if (res.ok) {
        setLoadError(null);
        syncFromView(res.data);
      } else {
        setLoadError(res.error);
      }
    });
    return () => {
      active = false;
    };
  }, [proposalId]);

  if (loadError) {
    return (
      <div data-testid="proposal-card" className="rounded-xl border p-3 text-sm text-destructive">
        {loadError}
      </div>
    );
  }
  if (!view) {
    return (
      <div data-testid="proposal-card" className="rounded-xl border p-3 text-sm text-muted-foreground">
        Đang tải đề xuất…
      </div>
    );
  }

  const appliedSet = new Set(view.appliedKeys);
  const isPending = view.status === 'pending';

  function toggleKey(key: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function handleApprove() {
    if (selected.size === 0 || busy) return;
    setAlert(null);
    setFieldErrors(new Map());
    startTransition(async () => {
      const res = await approveProposalAction(proposalId, {
        selectedKeys: [...selected],
        edits: Object.keys(edits).length > 0 ? edits : undefined,
      });
      if (!res.ok) {
        setAlert(res.error);
        return;
      }
      const r = res.data;
      if (r.status === 'applied' || r.status === 'partially_applied') {
        const reloaded = await getProposalAction(proposalId);
        if (reloaded.ok) setView(reloaded.data);
        setConflicts(new Map());
        onResolved?.();
        return;
      }
      if (r.status === 'already_resolved') {
        const reloaded = await getProposalAction(proposalId);
        if (reloaded.ok) syncFromView(reloaded.data);
        return;
      }
      if (r.status === 'conflict') {
        setAlert('Dữ liệu đã thay đổi sau khi AI đề xuất. Chưa có gì được ghi.');
        const reloaded = await getProposalAction(proposalId);
        if (reloaded.ok) syncFromView(reloaded.data);
        const cMap = new Map(r.conflicts.map((c) => [c.key, c.kind]));
        setConflicts(cMap);
        setSelected((prev) => new Set([...prev].filter((k) => cMap.get(k) !== 'missing')));
        return;
      }
      if (r.status === 'invalid') {
        const errMap = new Map<number, string>();
        for (const e of r.errors) errMap.set(e.key, e.message);
        setFieldErrors(errMap);
        if (errMap.has(-1)) setAlert(errMap.get(-1)!);
        return;
      }
      if (r.status === 'failed') {
        setAlert('Không áp dụng được thay đổi.');
      }
    });
  }

  function handleReject() {
    if (busy) return;
    setAlert(null);
    startTransition(async () => {
      const res = await rejectProposalAction(proposalId);
      if (res.ok) setView(res.data);
      else setAlert(res.error);
    });
  }

  function handleRebase() {
    if (busy) return;
    setAlert(null);
    startTransition(async () => {
      const res = await rebaseProposalAction(proposalId);
      if (res.ok) syncFromView(res.data);
      else setAlert(res.error);
    });
  }

  return (
    <section
      data-testid="proposal-card"
      aria-label="Đề xuất cập nhật"
      className="space-y-3 rounded-xl border bg-card p-3 text-sm"
    >
      <div className="space-y-0.5">
        <p className="font-medium">Đề xuất cập nhật</p>
        <p className="text-muted-foreground">{view.summary}</p>
      </div>

      {alert && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">
          {alert}
        </div>
      )}

      <ul className="space-y-2">
        {view.previews.map((p) => {
          const actionObj = edits[p.key] ?? view.actions.find((a) => a.key === p.key)?.action;
          const conflict = conflicts.get(p.key) ?? (isPending ? p.conflict : 'none');
          const rowError = fieldErrors.get(p.key);
          const isMissing = conflict === 'missing';
          const isApplied = appliedSet.has(p.key);

          return (
            <li key={p.key} className="space-y-1.5 rounded-lg border bg-background/60 p-2.5">
              <div className="flex items-start gap-2.5">
                {isPending ? (
                  <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center -my-2 -ml-2">
                    <Checkbox
                      aria-label={p.label}
                      checked={selected.has(p.key)}
                      disabled={busy || isMissing}
                      onCheckedChange={(checked) => toggleKey(p.key, checked === true)}
                    />
                  </label>
                ) : (
                  <span className="mt-0.5 shrink-0 text-xs font-medium text-muted-foreground">
                    {view.status === 'applied' || view.status === 'partially_applied' ? (
                      isApplied ? (
                        <CheckIcon aria-label="Đã áp dụng" className="size-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        'Bỏ qua'
                      )
                    ) : null}
                  </span>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium wrap-anywhere">{p.label}</span>
                    {p.areaName && <Badge variant="outline">{p.areaName}</Badge>}
                    {conflict === 'changed' && <Badge variant="destructive">Đã thay đổi</Badge>}
                    {conflict === 'missing' && <Badge variant="destructive">Không còn tồn tại</Badge>}
                  </div>
                  {editing && isPending && actionObj ? (
                    <ProposalActionEditor
                      action={actionObj}
                      onChange={(next) => setEdits((prev) => ({ ...prev, [p.key]: next }))}
                    />
                  ) : (
                    <PreviewChanges changes={previewWithEdits(p.changes, edits[p.key])} />
                  )}
                  {rowError && (
                    <p role="alert" className="text-xs text-destructive">
                      {rowError}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {isPending && (
        <div className="space-y-2">
          {editing ? (
            <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => setEditing(false)}>
              Xong
            </Button>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={selected.size === 0 || busy}
                  onClick={handleApprove}
                >
                  Approve
                </Button>
                <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={handleReject}>
                  Reject
                </Button>
              </div>
              {conflicts.size > 0 && (
                <Button type="button" variant="secondary" className="min-h-11 w-full" disabled={busy} onClick={handleRebase}>
                  Vẫn áp dụng
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {(view.status === 'applied' || view.status === 'partially_applied') && (
        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
          Đã áp dụng {view.appliedKeys.length}/{view.previews.length} thay đổi
        </p>
      )}
      {view.status === 'rejected' && <p className="text-xs text-muted-foreground">Đã từ chối</p>}
      {view.status === 'superseded' && <p className="text-xs text-muted-foreground">Đã thay bằng đề xuất mới</p>}
      {view.status === 'failed' && <p className="text-xs text-destructive">Không áp dụng được thay đổi.</p>}
    </section>
  );
}

function PreviewChanges({ changes }: { changes: ActionPreview['changes'] }) {
  if (changes.length === 0) return null;
  return (
    <ul className="space-y-0.5 text-xs text-muted-foreground">
      {changes.map((c, idx) => (
        <li key={`${c.field}-${idx}`} className="wrap-anywhere">
          {c.before !== null ? (
            <>
              {c.field}: {c.before} → {c.after ?? 'Trống'}
            </>
          ) : (
            <>
              {c.field}: {c.after ?? 'Trống'}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
