'use client';

import { useId } from 'react';
import { createEntityAction, deleteEntityAction, updateEntityAction } from '@/app/(app)/_actions/entities';
import type { AssessmentRow } from '@/db/schema';
import { AddForm } from './add-form';
import { shouldSaveDateOnChange } from './date-input';
import { DeleteButton, Field, InlineTitle, numberOrNull, RowStatus, useRowAction } from './row-controls';
import { SyncedInput } from './synced-input';

const str = (n: number | null) => (n === null ? '' : String(n));

export function AssessmentList({ areaId, assessments }: { areaId: string; assessments: AssessmentRow[] }) {
  return (
    <div className="space-y-3">
      <AddForm
        openLabel="Thêm assessment"
        fields={[
          { key: 'title', label: 'Tên', required: true },
          { key: 'dueDate', label: 'Ngày', type: 'date' },
          { key: 'weight', label: 'Trọng số (%)', type: 'number' },
          { key: 'score', label: 'Điểm', type: 'number' },
          { key: 'maxScore', label: 'Điểm tối đa', type: 'number' },
        ]}
        onSubmit={(v) =>
          createEntityAction('assessment', {
            areaId,
            title: v.title ?? '',
            dueDate: v.dueDate || null,
            weight: numberOrNull(v.weight ?? ''),
            score: numberOrNull(v.score ?? ''),
            maxScore: numberOrNull(v.maxScore ?? ''),
          })
        }
      />
      {assessments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có assessment nào.</p>
      ) : (
        <ul className="space-y-2">
          {assessments.map((a) => (
            <AssessmentItem key={a.id} assessment={a} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AssessmentItem({ assessment: a }: { assessment: AssessmentRow }) {
  const uid = useId();
  const { pending, error, run } = useRowAction();
  const update = (patch: Record<string, unknown>) => run(() => updateEntityAction('assessment', a.id, patch));

  return (
    <li aria-busy={pending} className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1">
        <InlineTitle value={a.title} label="Tên assessment" onCommit={(v) => update({ title: v })} />
        <DeleteButton onDelete={() => run(() => deleteEntityAction('assessment', a.id))} />
      </div>
      <RowStatus pending={pending} error={error} />
      <div className="grid grid-cols-2 gap-2">
        <Field id={`${uid}-d`} label="Ngày">
          <SyncedInput
            id={`${uid}-d`}
            type="date"
            value={a.dueDate ?? ''}
            saveOnChange={shouldSaveDateOnChange}
            onSave={(v) => update({ dueDate: v || null })}
            className="h-11"
          />
        </Field>
        <Field id={`${uid}-w`} label="Trọng số (%)">
          <SyncedInput
            id={`${uid}-w`}
            type="number"
            inputMode="decimal"
            step="any"
            value={str(a.weight)}
            onSave={(v) => update({ weight: numberOrNull(v) })}
            className="h-11"
          />
        </Field>
        <Field id={`${uid}-s`} label="Điểm">
          <SyncedInput
            id={`${uid}-s`}
            type="number"
            inputMode="decimal"
            step="any"
            value={str(a.score)}
            onSave={(v) => update({ score: numberOrNull(v) })}
            className="h-11"
          />
        </Field>
        <Field id={`${uid}-m`} label="Điểm tối đa">
          <SyncedInput
            id={`${uid}-m`}
            type="number"
            inputMode="decimal"
            step="any"
            value={str(a.maxScore)}
            onSave={(v) => update({ maxScore: numberOrNull(v) })}
            className="h-11"
          />
        </Field>
      </div>
    </li>
  );
}
