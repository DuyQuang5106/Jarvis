'use client';

import { useId } from 'react';
import { createEntityAction, deleteEntityAction, updateEntityAction } from '@/app/(app)/_actions/entities';
import { MILESTONE_STATUSES } from '@/db/enums';
import type { MilestoneRow } from '@/db/schema';
import { MILESTONE_STATUS_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { AddForm } from './add-form';
import { shouldSaveDateOnChange } from './date-input';
import { ProgressSummary } from './progress-summary';
import { DeleteButton, Field, InlineTitle, RowStatus, textOrNull, useRowAction } from './row-controls';
import { NATIVE_SELECT } from './styles';
import { SyncedInput } from './synced-input';

export function MilestoneList({ areaId, milestones }: { areaId: string; milestones: MilestoneRow[] }) {
  const done = milestones.filter((m) => m.status === 'done').length;
  return (
    <div className="space-y-3">
      <ProgressSummary done={done} total={milestones.length} suffix="milestones Done" />
      <AddForm
        openLabel="Thêm milestone"
        fields={[
          { key: 'title', label: 'Deliverable', required: true },
          { key: 'acceptanceCriteria', label: 'Tiêu chí hoàn thành' },
          { key: 'targetDate', label: 'Ngày mục tiêu', type: 'date' },
          { key: 'status', label: 'Trạng thái', type: 'status' },
        ]}
        onSubmit={(v) =>
          createEntityAction('milestone', {
            areaId,
            title: v.title ?? '',
            acceptanceCriteria: textOrNull(v.acceptanceCriteria ?? ''),
            targetDate: v.targetDate || null,
            status: v.status || 'not_started',
          })
        }
      />
      {milestones.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có milestone nào.</p>
      ) : (
        <ul className="space-y-2">
          {milestones.map((m) => (
            <MilestoneItem key={m.id} milestone={m} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MilestoneItem({ milestone: m }: { milestone: MilestoneRow }) {
  const uid = useId();
  const { pending, error, run } = useRowAction();
  const update = (patch: Record<string, unknown>) => run(() => updateEntityAction('milestone', m.id, patch));

  return (
    <li aria-busy={pending} className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1">
        <InlineTitle
          value={m.title}
          label="Deliverable"
          onCommit={(v) => update({ title: v })}
          className={cn(m.status === 'done' && 'text-muted-foreground line-through')}
        />
        <DeleteButton onDelete={() => run(() => deleteEntityAction('milestone', m.id))} />
      </div>
      <RowStatus pending={pending} error={error} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Field id={`${uid}-st`} label="Trạng thái">
          <select
            id={`${uid}-st`}
            value={m.status}
            onChange={(e) => update({ status: e.target.value })}
            className={NATIVE_SELECT}
          >
            {MILESTONE_STATUSES.map((s) => (
              <option key={s} value={s}>{MILESTONE_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </Field>
        <Field id={`${uid}-td`} label="Ngày mục tiêu">
          <SyncedInput
            id={`${uid}-td`}
            type="date"
            value={m.targetDate ?? ''}
            saveOnChange={shouldSaveDateOnChange}
            onSave={(v) => update({ targetDate: v || null })}
            className="h-11"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field id={`${uid}-ac`} label="Tiêu chí hoàn thành">
            <SyncedInput
              id={`${uid}-ac`}
              value={m.acceptanceCriteria ?? ''}
              onSave={(v) => update({ acceptanceCriteria: textOrNull(v) })}
              className="h-11"
              autoComplete="off"
            />
          </Field>
        </div>
      </div>
    </li>
  );
}
