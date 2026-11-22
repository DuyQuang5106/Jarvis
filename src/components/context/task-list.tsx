'use client';

import { Trash2Icon } from 'lucide-react';
import { useId, useState, useTransition } from 'react';
import type { ActionResult } from '@/app/(app)/_actions/result';
import { createEntityAction, deleteEntityAction, updateEntityAction } from '@/app/(app)/_actions/entities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DEADLINE_TYPES, TASK_STATUSES } from '@/db/enums';
import type { MilestoneRow, TaskRow } from '@/db/schema';
import { DEADLINE_TYPE_LABEL, TASK_STATUS_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';
import type { AreaDetails } from '@/server/queries/area-details';
import { NATIVE_SELECT } from './styles';

type Run = (fn: () => Promise<ActionResult<unknown>>) => void;

/** Done tasks go last; the order inside each group is the server's. */
function sortTasks(list: TaskRow[]): TaskRow[] {
  return [...list.filter((t) => t.status !== 'done'), ...list.filter((t) => t.status === 'done')];
}

export function TaskList({ details }: { details: AreaDetails }) {
  const { area } = details;
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const run: Run = (fn) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
    });
  };

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
            <TaskItem key={`${t.id}:${String(t.updatedAt)}`} task={t} milestones={milestones} run={run} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskItem({ task, milestones, run }: { task: TaskRow; milestones: MilestoneRow[] | null; run: Run }) {
  const uid = useId();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const done = task.status === 'done';

  const update = (patch: Record<string, unknown>) => run(() => updateEntityAction('task', task.id, patch));

  function commitTitle(value: string) {
    setEditing(false);
    const next = value.trim();
    if (next && next !== task.title) update({ title: next });
  }

  return (
    <li className="space-y-2 rounded-lg border bg-card p-3">
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
        {editing ? (
          <Input
            autoFocus
            aria-label="Tiêu đề task"
            defaultValue={task.title}
            onBlur={(e) => commitTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                e.stopPropagation();
                setEditing(false);
              }
            }}
            className="h-11 min-w-0 flex-1"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={cn(
              'min-h-11 min-w-0 flex-1 rounded-lg px-2 text-left text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              done && 'text-muted-foreground line-through',
            )}
          >
            {task.title}
          </button>
        )}
        {confirming ? (
          <div className="flex shrink-0 gap-1">
            <Button type="button" variant="destructive" className="min-h-11 px-3" onClick={() => run(() => deleteEntityAction('task', task.id))}>
              Xác nhận xóa
            </Button>
            <Button type="button" variant="ghost" className="min-h-11 px-3" onClick={() => setConfirming(false)}>
              Hủy
            </Button>
          </div>
        ) : (
          <Button type="button" variant="ghost" aria-label="Xóa" className="size-11 shrink-0" onClick={() => setConfirming(true)}>
            <Trash2Icon aria-hidden />
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label htmlFor={`${uid}-due`} className="text-xs text-muted-foreground">Hạn</label>
          <Input
            id={`${uid}-due`}
            type="date"
            defaultValue={task.dueDate ?? ''}
            onBlur={(e) => {
              if (e.target.value !== (task.dueDate ?? '')) update({ dueDate: e.target.value || null });
            }}
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
          <Input
            id={`${uid}-est`}
            type="number"
            inputMode="numeric"
            min={1}
            defaultValue={task.estimateMinutes ?? ''}
            onBlur={(e) => {
              const raw = e.target.value.trim();
              const next = raw === '' ? null : Number(raw);
              if (next !== task.estimateMinutes) update({ estimateMinutes: next });
            }}
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
