'use client';

import { useId } from 'react';
import { NATIVE_SELECT } from '@/components/context/styles';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AREA_STATUSES,
  DEADLINE_TYPES,
  MILESTONE_STATUSES,
  PRIORITIES,
  TASK_STATUSES,
  TOPIC_STATUSES,
} from '@/db/enums';
import {
  AREA_STATUS_LABEL,
  DEADLINE_TYPE_LABEL,
  MILESTONE_STATUS_LABEL,
  PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  TOPIC_STATUS_LABEL,
} from '@/lib/labels';
import type { ActionPreview, ProposedAction } from '@/server/proposals/schema';
import { formatDateFullVi } from '@/lib/dates';

function fmtEditVal(field: string, v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return formatDateFullVi(v);
  if (field === 'status') {
    return (
      (AREA_STATUS_LABEL as Record<string, string>)[String(v)] ??
      (TASK_STATUS_LABEL as Record<string, string>)[String(v)] ??
      (TOPIC_STATUS_LABEL as Record<string, string>)[String(v)] ??
      (MILESTONE_STATUS_LABEL as Record<string, string>)[String(v)] ??
      String(v)
    );
  }
  if (field === 'priority') return (PRIORITY_LABEL as Record<string, string>)[String(v)] ?? String(v);
  if (field === 'deadlineType') return (DEADLINE_TYPE_LABEL as Record<string, string>)[String(v)] ?? String(v);
  return String(v);
}

const LABEL_FOR: Record<string, string> = {
  title: 'Tiêu đề',
  status: 'Trạng thái',
  dueDate: 'Hạn',
  deadlineType: 'Loại hạn',
  estimateMinutes: 'Ước tính (phút)',
  blockedReason: 'Lý do bị chặn',
  priority: 'Ưu tiên',
  nextAction: 'Việc tiếp theo',
  summary: 'Tóm tắt',
  goal: 'Mục tiêu',
  startDate: 'Bắt đầu',
  deadlineDate: 'Hạn',
  evidence: 'Bằng chứng',
  targetDate: 'Ngày mục tiêu',
  acceptanceCriteria: 'Tiêu chí hoàn thành',
  weight: 'Trọng số',
  score: 'Điểm',
  maxScore: 'Điểm tối đa',
  text: 'Nội dung',
  lastAttempt: 'Lần thử gần nhất',
  externalDependency: 'Phụ thuộc bên ngoài',
};

/** Applies local unsaved edits over the server-computed preview changes so clicking `Xong` shows new values. */
export function previewWithEdits(
  original: ActionPreview['changes'],
  edited: ProposedAction | undefined,
): ActionPreview['changes'] {
  if (!edited) return original;
  const src: Record<string, unknown> = 'patch' in edited ? edited.patch : edited;
  const byField = new Map<string, ActionPreview['changes'][number]>();
  for (const c of original) byField.set(c.field, c);
  for (const [k, v] of Object.entries(src)) {
    if (k === 'type' || k === 'id' || k === 'areaId' || v === undefined) continue;
    const label = LABEL_FOR[k];
    if (!label) continue;
    const prev = byField.get(label);
    byField.set(label, { field: label, before: prev?.before ?? null, after: fmtEditVal(k, v) });
  }
  return [...byField.values()];
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

const orNull = (v: string) => (v.trim() === '' ? null : v);
const orNum = (v: string) => (v.trim() === '' ? null : Number(v));

export function ProposalActionEditor({
  action,
  onChange,
}: {
  action: ProposedAction;
  onChange: (next: ProposedAction) => void;
}) {
  const uid = useId();
  const fid = (k: string) => `${uid}-${k}`;

  switch (action.type) {
    case 'create_task':
      return (
        <div className="space-y-2 pt-1">
          <Field id={fid('title')} label="Tiêu đề">
            <Input
              id={fid('title')}
              className="h-11 text-base"
              value={action.title}
              onChange={(e) => onChange({ ...action, title: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field id={fid('status')} label="Trạng thái">
              <select
                id={fid('status')}
                className={NATIVE_SELECT}
                value={action.status ?? 'todo'}
                onChange={(e) => onChange({ ...action, status: e.target.value as (typeof TASK_STATUSES)[number] })}
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </Field>
            <Field id={fid('dueDate')} label="Hạn">
              <Input
                id={fid('dueDate')}
                type="date"
                className="h-11 text-base"
                value={action.dueDate ?? ''}
                onChange={(e) => onChange({ ...action, dueDate: orNull(e.target.value) })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field id={fid('deadlineType')} label="Loại hạn">
              <select
                id={fid('deadlineType')}
                className={NATIVE_SELECT}
                value={action.deadlineType ?? 'flexible'}
                onChange={(e) => onChange({ ...action, deadlineType: e.target.value as (typeof DEADLINE_TYPES)[number] })}
              >
                {DEADLINE_TYPES.map((s) => (
                  <option key={s} value={s}>{DEADLINE_TYPE_LABEL[s]}</option>
                ))}
              </select>
            </Field>
            <Field id={fid('est')} label="Ước tính (phút)">
              <Input
                id={fid('est')}
                type="number"
                inputMode="numeric"
                className="h-11 text-base"
                value={action.estimateMinutes ?? ''}
                onChange={(e) => onChange({ ...action, estimateMinutes: orNum(e.target.value) })}
              />
            </Field>
          </div>
        </div>
      );

    case 'update_task': {
      const p = action.patch;
      const setPatch = (patch: Partial<typeof p>) => onChange({ ...action, patch: { ...p, ...patch } });
      return (
        <div className="space-y-2 pt-1">
          {p.title !== undefined && (
            <Field id={fid('title')} label="Tiêu đề">
              <Input id={fid('title')} className="h-11 text-base" value={p.title} onChange={(e) => setPatch({ title: e.target.value })} />
            </Field>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {p.status !== undefined && (
              <Field id={fid('status')} label="Trạng thái">
                <select
                  id={fid('status')}
                  className={NATIVE_SELECT}
                  value={p.status}
                  onChange={(e) => setPatch({ status: e.target.value as (typeof TASK_STATUSES)[number] })}
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </Field>
            )}
            {p.dueDate !== undefined && (
              <Field id={fid('dueDate')} label="Hạn">
                <Input
                  id={fid('dueDate')}
                  type="date"
                  className="h-11 text-base"
                  value={p.dueDate ?? ''}
                  onChange={(e) => setPatch({ dueDate: orNull(e.target.value) })}
                />
              </Field>
            )}
          </div>
          {p.blockedReason !== undefined && (
            <Field id={fid('blocked')} label="Lý do bị chặn">
              <Input
                id={fid('blocked')}
                className="h-11 text-base"
                value={p.blockedReason ?? ''}
                onChange={(e) => setPatch({ blockedReason: orNull(e.target.value) })}
              />
            </Field>
          )}
        </div>
      );
    }

    case 'update_area': {
      const p = action.patch;
      const setPatch = (patch: Partial<typeof p>) => onChange({ ...action, patch: { ...p, ...patch } });
      return (
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {p.status !== undefined && (
              <Field id={fid('status')} label="Trạng thái">
                <select
                  id={fid('status')}
                  className={NATIVE_SELECT}
                  value={p.status}
                  onChange={(e) => setPatch({ status: e.target.value as (typeof AREA_STATUSES)[number] })}
                >
                  {AREA_STATUSES.map((s) => (
                    <option key={s} value={s}>{AREA_STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </Field>
            )}
            {p.priority !== undefined && (
              <Field id={fid('priority')} label="Ưu tiên">
                <select
                  id={fid('priority')}
                  className={NATIVE_SELECT}
                  value={p.priority}
                  onChange={(e) => setPatch({ priority: e.target.value as (typeof PRIORITIES)[number] })}
                >
                  {PRIORITIES.map((s) => (
                    <option key={s} value={s}>{PRIORITY_LABEL[s]}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          {p.nextAction !== undefined && (
            <Field id={fid('nextAction')} label="Việc tiếp theo">
              <Input
                id={fid('nextAction')}
                className="h-11 text-base"
                value={p.nextAction ?? ''}
                onChange={(e) => setPatch({ nextAction: orNull(e.target.value) })}
              />
            </Field>
          )}
          {p.summary !== undefined && (
            <Field id={fid('summary')} label="Tóm tắt">
              <Textarea
                id={fid('summary')}
                className="text-base"
                value={p.summary ?? ''}
                onChange={(e) => setPatch({ summary: orNull(e.target.value) })}
              />
            </Field>
          )}
          {p.goal !== undefined && (
            <Field id={fid('goal')} label="Mục tiêu">
              <Textarea
                id={fid('goal')}
                className="text-base"
                value={p.goal ?? ''}
                onChange={(e) => setPatch({ goal: orNull(e.target.value) })}
              />
            </Field>
          )}
        </div>
      );
    }

    case 'upsert_topic':
      return (
        <div className="space-y-2 pt-1">
          {action.title !== undefined && (
            <Field id={fid('title')} label="Tiêu đề">
              <Input
                id={fid('title')}
                className="h-11 text-base"
                value={action.title}
                onChange={(e) => onChange({ ...action, title: e.target.value })}
              />
            </Field>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field id={fid('status')} label="Trạng thái">
              <select
                id={fid('status')}
                className={NATIVE_SELECT}
                value={action.status ?? 'not_started'}
                onChange={(e) => onChange({ ...action, status: e.target.value as (typeof TOPIC_STATUSES)[number] })}
              >
                {TOPIC_STATUSES.map((s) => (
                  <option key={s} value={s}>{TOPIC_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </Field>
            <Field id={fid('evidence')} label="Bằng chứng">
              <Input
                id={fid('evidence')}
                className="h-11 text-base"
                value={action.evidence ?? ''}
                onChange={(e) => onChange({ ...action, evidence: orNull(e.target.value) })}
              />
            </Field>
          </div>
        </div>
      );

    case 'upsert_milestone':
      return (
        <div className="space-y-2 pt-1">
          {action.title !== undefined && (
            <Field id={fid('title')} label="Tiêu đề">
              <Input
                id={fid('title')}
                className="h-11 text-base"
                value={action.title}
                onChange={(e) => onChange({ ...action, title: e.target.value })}
              />
            </Field>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field id={fid('status')} label="Trạng thái">
              <select
                id={fid('status')}
                className={NATIVE_SELECT}
                value={action.status ?? 'not_started'}
                onChange={(e) => onChange({ ...action, status: e.target.value as (typeof MILESTONE_STATUSES)[number] })}
              >
                {MILESTONE_STATUSES.map((s) => (
                  <option key={s} value={s}>{MILESTONE_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </Field>
            <Field id={fid('targetDate')} label="Ngày mục tiêu">
              <Input
                id={fid('targetDate')}
                type="date"
                className="h-11 text-base"
                value={action.targetDate ?? ''}
                onChange={(e) => onChange({ ...action, targetDate: orNull(e.target.value) })}
              />
            </Field>
          </div>
        </div>
      );

    case 'upsert_assessment':
      return (
        <div className="space-y-2 pt-1">
          {action.title !== undefined && (
            <Field id={fid('title')} label="Tiêu đề">
              <Input
                id={fid('title')}
                className="h-11 text-base"
                value={action.title}
                onChange={(e) => onChange({ ...action, title: e.target.value })}
              />
            </Field>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field id={fid('dueDate')} label="Ngày đánh giá">
              <Input
                id={fid('dueDate')}
                type="date"
                className="h-11 text-base"
                value={action.dueDate ?? ''}
                onChange={(e) => onChange({ ...action, dueDate: orNull(e.target.value) })}
              />
            </Field>
            <Field id={fid('score')} label="Điểm">
              <Input
                id={fid('score')}
                type="number"
                step="any"
                className="h-11 text-base"
                value={action.score ?? ''}
                onChange={(e) => onChange({ ...action, score: orNum(e.target.value) })}
              />
            </Field>
            <Field id={fid('maxScore')} label="Điểm tối đa">
              <Input
                id={fid('maxScore')}
                type="number"
                step="any"
                className="h-11 text-base"
                value={action.maxScore ?? ''}
                onChange={(e) => onChange({ ...action, maxScore: orNum(e.target.value) })}
              />
            </Field>
          </div>
        </div>
      );

    case 'create_note':
    case 'add_progress_log':
      return (
        <div className="pt-1">
          <Field id={fid('text')} label="Nội dung">
            <Textarea
              id={fid('text')}
              className="text-base"
              value={action.text}
              onChange={(e) => onChange({ ...action, text: e.target.value })}
            />
          </Field>
        </div>
      );

    case 'create_blocker':
      return (
        <div className="space-y-2 pt-1">
          <Field id={fid('title')} label="Tiêu đề">
            <Input
              id={fid('title')}
              className="h-11 text-base"
              value={action.title}
              onChange={(e) => onChange({ ...action, title: e.target.value })}
            />
          </Field>
          <Field id={fid('nextAction')} label="Bước tiếp theo">
            <Input
              id={fid('nextAction')}
              className="h-11 text-base"
              value={action.nextAction ?? ''}
              onChange={(e) => onChange({ ...action, nextAction: orNull(e.target.value) })}
            />
          </Field>
        </div>
      );

    case 'resolve_blocker':
      return <p className="pt-1 text-xs text-muted-foreground">Đánh dấu blocker đã được gỡ.</p>;
  }
}
