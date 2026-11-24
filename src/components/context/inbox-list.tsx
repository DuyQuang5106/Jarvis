'use client';

import { useId, useState, useTransition } from 'react';
import { deleteEntityAction, updateEntityAction } from '@/app/(app)/_actions/entities';
import { extractNoteAction } from '@/app/(app)/_actions/proposals';
import { ProposalCard } from '@/components/chat/proposal-card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { formatDateTimeVi } from '@/lib/dates';
import type { InboxNote } from '@/server/queries/area-details';
import { DeleteButton, RowStatus, useRowAction } from './row-controls';
import { NATIVE_SELECT } from './styles';

export type AreaOption = { id: string; name: string };

/** Notes captured without an area. Collapsible, hidden when empty. No `<li>`: the page's list rows are areas. */
export function InboxList({
  notes,
  areas,
  actionMode = 'off',
}: {
  notes: InboxNote[];
  areas: AreaOption[];
  actionMode?: 'tools' | 'json' | 'off';
}) {
  if (notes.length === 0) return null;
  return (
    <details open className="rounded-lg border bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-base font-medium">
        Inbox ({notes.length})
      </summary>
      <div className="space-y-2 border-t p-3">
        {actionMode === 'off' && (
          <p className="text-sm text-muted-foreground">Chế độ đề xuất đang tắt.</p>
        )}
        {notes.map((n) => (
          <InboxItem key={n.id} note={n} areas={areas} actionMode={actionMode} />
        ))}
      </div>
    </details>
  );
}

function InboxItem({
  note,
  areas,
  actionMode,
}: {
  note: InboxNote;
  areas: AreaOption[];
  actionMode: 'tools' | 'json' | 'off';
}) {
  const uid = useId();
  const { pending, error, run } = useRowAction();
  const [excluded, setExcluded] = useState(note.aiExcluded);
  const [pendingActionId, setPendingActionId] = useState<string | null>(note.pendingActionId);
  const [extractReason, setExtractReason] = useState<string | null>(null);
  const [extracting, startExtract] = useTransition();

  // Saves on toggle; a failed save puts the switch back so it never shows an unsaved privacy state.
  function toggleExcluded(next: boolean) {
    setExcluded(next);
    run(async () => {
      let res: Awaited<ReturnType<typeof updateEntityAction>>;
      try {
        res = await updateEntityAction('note', note.id, { aiExcluded: next });
      } catch {
        res = { ok: false, error: 'Không lưu được thay đổi.' };
      }
      if (!res.ok) setExcluded(!next);
      return res;
    });
  }

  function handleExtract() {
    if (extracting || actionMode === 'off' || excluded) return;
    setExtractReason(null);
    startExtract(async () => {
      const res = await extractNoteAction(note.id);
      if (!res.ok) {
        setExtractReason(res.error);
        return;
      }
      if (res.data.status === 'proposed') {
        setPendingActionId(res.data.pendingActionId);
      } else {
        setPendingActionId(null);
        setExtractReason(res.data.reason);
      }
    });
  }

  return (
    <div aria-busy={pending || extracting} className="space-y-2 rounded-lg border p-3">
      <p className="whitespace-pre-wrap break-words text-base">{note.text}</p>
      <p className="text-xs text-muted-foreground">{formatDateTimeVi(note.createdAt)}</p>
      <label htmlFor={`${uid}-ai`} className="flex min-h-11 w-fit items-center gap-2 text-sm">
        <Switch id={`${uid}-ai`} checked={excluded} disabled={pending} onCheckedChange={toggleExcluded} />
        Không gửi cho AI
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={`${uid}-area`}
          aria-label="Gắn vào…"
          value=""
          disabled={pending}
          onChange={(e) => {
            const areaId = e.target.value;
            if (areaId) run(() => updateEntityAction('note', note.id, { areaId, inboxStatus: 'processed' }));
          }}
          className={`${NATIVE_SELECT} min-w-40 flex-1`}
        >
          <option value="">Gắn vào…</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 px-4"
          disabled={pending || extracting || excluded || actionMode === 'off'}
          onClick={handleExtract}
        >
          {extracting ? 'Đang phân tích…' : 'Extract suggestions'}
        </Button>
        <DeleteButton onDelete={() => run(() => deleteEntityAction('note', note.id))} />
      </div>
      {extractReason && <p className="text-sm text-muted-foreground">{extractReason}</p>}
      {pendingActionId && <ProposalCard key={pendingActionId} proposalId={pendingActionId} />}
      <RowStatus pending={pending} error={error} />
    </div>
  );
}
