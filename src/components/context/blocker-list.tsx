'use client';

import { useId } from 'react';
import { createEntityAction, deleteEntityAction, updateEntityAction } from '@/app/(app)/_actions/entities';
import { Button } from '@/components/ui/button';
import type { BlockerRow } from '@/db/schema';
import { AddForm } from './add-form';
import { DeleteButton, Field, InlineTitle, RowStatus, textOrNull, useRowAction } from './row-controls';
import { SyncedInput } from './synced-input';

export function BlockerList({ areaId, blockers }: { areaId: string; blockers: BlockerRow[] }) {
  const open = blockers.filter((b) => b.status === 'open');
  const resolved = blockers.filter((b) => b.status === 'resolved');
  return (
    <div className="space-y-3">
      <AddForm
        openLabel="Thêm blocker"
        fields={[
          { key: 'title', label: 'Vấn đề', required: true },
          { key: 'lastAttempt', label: 'Bước thử gần nhất' },
          { key: 'nextAction', label: 'Bước tiếp theo' },
          { key: 'externalDependency', label: 'Phụ thuộc bên ngoài' },
        ]}
        onSubmit={(v) =>
          createEntityAction('blocker', {
            areaId,
            title: v.title ?? '',
            lastAttempt: textOrNull(v.lastAttempt ?? ''),
            nextAction: textOrNull(v.nextAction ?? ''),
            externalDependency: textOrNull(v.externalDependency ?? ''),
          })
        }
      />
      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">Không có blocker nào đang mở.</p>
      ) : (
        <ul className="space-y-2">
          {open.map((b) => (
            <BlockerItem key={b.id} blocker={b} />
          ))}
        </ul>
      )}
      {resolved.length > 0 && (
        <details className="rounded-lg border bg-card p-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">{`Đã gỡ (${resolved.length})`}</summary>
          <ul className="space-y-2">
            {resolved.map((b) => (
              <BlockerItem key={b.id} blocker={b} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function BlockerItem({ blocker: b }: { blocker: BlockerRow }) {
  const uid = useId();
  const { pending, error, run } = useRowAction();
  const update = (patch: Record<string, unknown>) => run(() => updateEntityAction('blocker', b.id, patch));
  const isOpen = b.status === 'open';

  return (
    <li aria-busy={pending} className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-1">
        <InlineTitle value={b.title} label="Vấn đề" onCommit={(v) => update({ title: v })} />
        {isOpen ? (
          <Button type="button" variant="outline" disabled={pending} className="min-h-11 px-3" onClick={() => update({ status: 'resolved' })}>
            Đã gỡ
          </Button>
        ) : (
          <Button type="button" variant="outline" disabled={pending} className="min-h-11 px-3" onClick={() => update({ status: 'open' })}>
            Mở lại
          </Button>
        )}
        <DeleteButton onDelete={() => run(() => deleteEntityAction('blocker', b.id))} />
      </div>
      <RowStatus pending={pending} error={error} />
      <div className="space-y-2">
        <Field id={`${uid}-la`} label="Bước thử gần nhất">
          <SyncedInput id={`${uid}-la`} value={b.lastAttempt ?? ''} onSave={(v) => update({ lastAttempt: textOrNull(v) })} className="h-11" autoComplete="off" />
        </Field>
        <Field id={`${uid}-na`} label="Bước tiếp theo">
          <SyncedInput id={`${uid}-na`} value={b.nextAction ?? ''} onSave={(v) => update({ nextAction: textOrNull(v) })} className="h-11" autoComplete="off" />
        </Field>
        <Field id={`${uid}-ed`} label="Phụ thuộc bên ngoài">
          <SyncedInput id={`${uid}-ed`} value={b.externalDependency ?? ''} onSave={(v) => update({ externalDependency: textOrNull(v) })} className="h-11" autoComplete="off" />
        </Field>
      </div>
    </li>
  );
}
