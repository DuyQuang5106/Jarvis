'use client';

import { useId, useState } from 'react';
import { deleteEntityAction, updateEntityAction } from '@/app/(app)/_actions/entities';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { NoteRow } from '@/db/schema';
import { formatDateTimeVi } from '@/lib/dates';
import { DeleteButton, RowStatus, useRowAction } from './row-controls';
import { NATIVE_SELECT } from './styles';

export type AreaOption = { id: string; name: string };

/** Notes captured without an area. Collapsible, hidden when empty. No `<li>`: the page's list rows are areas. */
export function InboxList({ notes, areas }: { notes: NoteRow[]; areas: AreaOption[] }) {
  if (notes.length === 0) return null;
  return (
    <details open className="rounded-lg border bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-base font-medium">
        Inbox ({notes.length})
      </summary>
      <div className="space-y-2 border-t p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled className="min-h-11 px-4">
            Extract suggestions
          </Button>
          <span className="text-sm text-muted-foreground">Có ở Phase 3</span>
        </div>
        {notes.map((n) => (
          <InboxItem key={n.id} note={n} areas={areas} />
        ))}
      </div>
    </details>
  );
}

function InboxItem({ note, areas }: { note: NoteRow; areas: AreaOption[] }) {
  const uid = useId();
  const { pending, error, run } = useRowAction();
  const [excluded, setExcluded] = useState(note.aiExcluded);

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

  return (
    <div aria-busy={pending} className="space-y-2 rounded-lg border p-3">
      <p className="whitespace-pre-wrap break-words text-base">{note.text}</p>
      <p className="text-xs text-muted-foreground">{formatDateTimeVi(note.createdAt)}</p>
      <label htmlFor={`${uid}-ai`} className="flex min-h-11 w-fit items-center gap-2 text-sm">
        <Switch id={`${uid}-ai`} checked={excluded} disabled={pending} onCheckedChange={toggleExcluded} />
        Không gửi cho AI
      </label>
      <div className="flex items-center gap-2">
        <select
          id={`${uid}-area`}
          aria-label="Gắn vào…"
          value=""
          disabled={pending}
          onChange={(e) => {
            const areaId = e.target.value;
            if (areaId) run(() => updateEntityAction('note', note.id, { areaId, inboxStatus: 'processed' }));
          }}
          className={NATIVE_SELECT}
        >
          <option value="">Gắn vào…</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <DeleteButton onDelete={() => run(() => deleteEntityAction('note', note.id))} />
      </div>
      <RowStatus pending={pending} error={error} />
    </div>
  );
}
