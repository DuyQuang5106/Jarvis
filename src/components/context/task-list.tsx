'use client';

import { useId, useState, useTransition } from 'react';
import { createEntityAction, deleteEntityAction, updateEntityAction } from '@/app/(app)/_actions/entities';
import { Input } from '@/components/ui/input';
import { DEADLINE_TYPES, TASK_STATUSES } from '@/db/enums';
import type { MilestoneRow, TaskRow } from '@/db/schema';
import { DEADLINE_TYPE_LABEL, TASK_STATUS_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';
import type { AreaDetails } from '@/server/queries/area-details';
import { shouldSaveDateOnChange } from './date-input';
import { DeleteButton, InlineTitle, RowStatus, useRowAction } from './row-controls';
import { NATIVE_SELECT } from './styles';
import { SyncedInput } from './synced-input';

/** Done tasks go last; the order inside each group is the server's. */
function sortTasks(list: TaskRow[]): TaskRow[] {
  return [...list.filter((t) => t.status !== 'done'), ...list.filter((t) => t.status === 'done')];
}

export function TaskList({ details }: { details: AreaDetails }) {
  const { area } = details;
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setError(null);
    startTransition(async () => {
      const res = await createEntityAction('task', { areaId: area.id, title: t });
      if (res.ok) {
        setTitle('');
      } else {
        setError(res.error);
      }
    });
  }

  const tasks = sortTasks(details.tasks);
  const milestones = area.kind === 'project' ? details.milestones : null;

  return (
    <div className="space-y-3">
      <form onSubmit={add}>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Thêm task…"
          aria-label="Thêm task"
          className="h-11"
          autoComplete="off"
        />
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có task nào.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <TaskItem key={t.id} task={t} milestones={milestones} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskItem({ task, milestones }: { task: TaskRow; milestones: MilestoneRow[] | null }) {
  const uid = useId();
  const { pending, error, run } = useRowAction();
  const done = task.status === 'done';

  const update = (patch: Record<string, unknown>) => run(() => updateEntityAction('task', task.id, patch));

  return (
    <li aria-busy={pending} className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2">
        <select
          aria-label="Trạng thái"
          value={task.status}
          onChange={(e) => update({ status: e.target.value })}
          className={cn(NATIVE_SELECT, 'w-32 shrink-0')}
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
          ))}
        </select>
        <InlineTitle
          value={task.title}
          label="Tiêu đề task"
          onCommit={(v) => update({ title: v })}
          className={cn(done && 'text-muted-foreground line-through')}
        />
        <DeleteButton onDelete={() => run(() => deleteEntityAction('task', task.id))} />
      </div>
      <RowStatus pending={pending} error={error} />
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label htmlFor={`${uid}-due`} className="text-xs text-muted-foreground">Hạn</label>
          <SyncedInput
            id={`${uid}-due`}
            type="date"
            value={task.dueDate ?? ''}
            saveOnChange={shouldSaveDateOnChange}
            onSave={(v) => update({ dueDate: v || null })}
            className="h-11"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${uid}-type`} className="text-xs text-muted-foreground">Loại deadline</label>
          <select
            id={`${uid}-type`}
            value={task.deadlineType}
            onChange={(e) => update({ deadlineType: e.target.value })}
            className={NATIVE_SELECT}
          >
            {DEADLINE_TYPES.map((d) => (
              <option key={d} value={d}>{DEADLINE_TYPE_LABEL[d]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${uid}-est`} className="text-xs text-muted-foreground">Ước lượng (phút)</label>
          <SyncedInput
            id={`${uid}-est`}
            type="number"
            inputMode="numeric"
            min={1}
            value={task.estimateMinutes === null ? '' : String(task.estimateMinutes)}
            onSave={(v) => update({ estimateMinutes: v.trim() === '' ? null : Number(v) })}
            className="h-11"
          />
        </div>
        {milestones && (
          <div className="space-y-1">
            <label htmlFor={`${uid}-ms`} className="text-xs text-muted-foreground">Milestone</label>
            <select
              id={`${uid}-ms`}
              value={task.milestoneId ?? ''}
              onChange={(e) => update({ milestoneId: e.target.value || null })}
              className={NATIVE_SELECT}
            >
              <option value="">Không có</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </li>
  );
}
