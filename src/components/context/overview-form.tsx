'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { archiveAreaAction, updateAreaAction } from '@/app/(app)/_actions/areas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { AREA_STATUSES, PRIORITIES } from '@/db/enums';
import { AREA_STATUS_LABEL, PRIORITY_LABEL } from '@/lib/labels';
import type { AreaDetails } from '@/server/queries/area-details';
import { NATIVE_SELECT } from './styles';
import { useContextParams } from './use-context-params';

type Values = Record<string, string | boolean>;

type DetailField = { key: string; label: string; multiline?: boolean; numeric?: boolean };

const ACADEMIC_FIELDS: DetailField[] = [
  { key: 'term', label: 'Học kỳ' },
  { key: 'credits', label: 'Số tín chỉ', numeric: true },
  { key: 'targetGrade', label: 'Mục tiêu điểm' },
  { key: 'gradingScheme', label: 'Hình thức đánh giá' },
  { key: 'examFormat', label: 'Hình thức thi' },
  { key: 'courseOutline', label: 'Course content overview', multiline: true },
];
const PROJECT_FIELDS: DetailField[] = [
  { key: 'role', label: 'Vai trò' },
  { key: 'collaborators', label: 'Đối tác/nhóm' },
  { key: 'scope', label: 'Phạm vi' },
  { key: 'cadence', label: 'Nhịp độ mong muốn' },
];

// Area columns whose empty value is sent as null (name is required, so it is sent as typed).
const NULLABLE_AREA_TEXT = ['summary', 'goal', 'nextAction', 'startDate', 'deadlineDate'] as const;

function initialValues(d: AreaDetails): Values {
  const { area } = d;
  const v: Values = {
    name: area.name,
    aliases: area.aliases.join(', '),
    summary: area.summary ?? '',
    goal: area.goal ?? '',
    status: area.status,
    priority: area.priority,
    startDate: area.startDate ?? '',
    deadlineDate: area.deadlineDate ?? '',
    nextAction: area.nextAction ?? '',
    aiExcluded: area.aiExcluded,
  };
  const detail = (d.academic ?? d.project ?? {}) as Record<string, unknown>;
  for (const f of area.kind === 'academic' ? ACADEMIC_FIELDS : PROJECT_FIELDS) {
    const raw = detail[f.key];
    v[f.key] = raw === null || raw === undefined ? '' : String(raw);
  }
  return v;
}

const orNull = (s: string) => (s.trim() === '' ? null : s);

/** Only the changed fields; an empty text or date becomes null. */
function buildPatch(kind: 'academic' | 'project', base: Values, cur: Values): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (cur.name !== base.name) patch.name = cur.name;
  for (const k of NULLABLE_AREA_TEXT) if (cur[k] !== base[k]) patch[k] = orNull(cur[k] as string);
  if (cur.aliases !== base.aliases) {
    patch.aliases = (cur.aliases as string).split(',').map((a) => a.trim()).filter(Boolean);
  }
  for (const k of ['status', 'priority', 'aiExcluded']) if (cur[k] !== base[k]) patch[k] = cur[k];
  const details: Record<string, unknown> = {};
  for (const f of kind === 'academic' ? ACADEMIC_FIELDS : PROJECT_FIELDS) {
    if (cur[f.key] === base[f.key]) continue;
    const raw = cur[f.key] as string;
    details[f.key] = f.numeric ? (raw.trim() === '' ? null : Number(raw)) : orNull(raw);
  }
  if (Object.keys(details).length > 0) patch[kind] = details;
  return patch;
}

export function OverviewForm({ details }: { details: AreaDetails }) {
  const uid = useId();
  const router = useRouter();
  const { closeItem } = useContextParams();
  const { area } = details;
  const base = initialValues(details);
  const [values, setValues] = useState<Values>(base);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = (key: string, value: string | boolean) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  };
  const id = (key: string) => `${uid}-${key}`;

  function field(key: string, label: string, opts: { type?: string; placeholder?: string } = {}) {
    return (
      <div className="space-y-1.5">
        <label htmlFor={id(key)} className="text-sm font-medium">{label}</label>
        <Input
          id={id(key)}
          type={opts.type}
          inputMode={opts.type === 'number' ? 'numeric' : undefined}
          value={values[key] as string}
          placeholder={opts.placeholder}
          onChange={(e) => set(key, e.target.value)}
          className="h-11"
          autoComplete="off"
        />
      </div>
    );
  }

  function multiline(key: string, label: string) {
    return (
      <div className="space-y-1.5">
        <label htmlFor={id(key)} className="text-sm font-medium">{label}</label>
        <Textarea id={id(key)} value={values[key] as string} onChange={(e) => set(key, e.target.value)} />
      </div>
    );
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const patch = buildPatch(area.kind, base, values);
    if (Object.keys(patch).length === 0) {
      setMessage({ ok: true, text: 'Đã lưu' });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const res = await updateAreaAction(area.id, patch);
      if (res.ok) {
        setMessage({ ok: true, text: 'Đã lưu' });
        router.refresh();
      } else {
        setMessage({ ok: false, text: res.error });
      }
    });
  }

  function archive() {
    startTransition(async () => {
      const res = await archiveAreaAction(area.id);
      if (res.ok) {
        router.refresh();
        closeItem();
      } else {
        setConfirmArchive(false);
        setMessage({ ok: false, text: res.error });
      }
    });
  }

  return (
    <form onSubmit={save} noValidate className="space-y-4">
      {field('name', 'Tên')}
      {field('aliases', 'Tên gọi tắt', { placeholder: 'Cách nhau bằng dấu phẩy' })}
      {multiline('summary', 'Mô tả ngắn')}
      {multiline('goal', 'Mục tiêu')}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor={id('status')} className="text-sm font-medium">Trạng thái</label>
          <select id={id('status')} value={values.status as string} onChange={(e) => set('status', e.target.value)} className={NATIVE_SELECT}>
            {AREA_STATUSES.map((s) => (
              <option key={s} value={s}>{AREA_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={id('priority')} className="text-sm font-medium">Ưu tiên</label>
          <select id={id('priority')} value={values.priority as string} onChange={(e) => set('priority', e.target.value)} className={NATIVE_SELECT}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
            ))}
          </select>
        </div>
        {field('startDate', 'Ngày bắt đầu', { type: 'date' })}
        {field('deadlineDate', 'Deadline', { type: 'date' })}
      </div>
      {field('nextAction', 'Việc tiếp theo')}
      {(area.kind === 'academic' ? ACADEMIC_FIELDS : PROJECT_FIELDS).map((f) => (
        <div key={f.key}>
          {f.multiline ? multiline(f.key, f.label) : field(f.key, f.label, f.numeric ? { type: 'number' } : {})}
        </div>
      ))}
      <div className="flex min-h-11 items-center justify-between gap-3">
        <label htmlFor={id('aiExcluded')} className="text-sm font-medium">Không gửi cho AI</label>
        <Switch id={id('aiExcluded')} checked={values.aiExcluded as boolean} onCheckedChange={(c) => set('aiExcluded', c)} />
      </div>
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>
          {message.text}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending} className="min-h-11 px-5">{pending ? 'Đang lưu…' : 'Lưu'}</Button>
        {confirmArchive ? (
          <>
            <Button type="button" variant="destructive" disabled={pending} onClick={archive} className="min-h-11 px-4">
              Xác nhận lưu trữ
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirmArchive(false)} className="min-h-11 px-4">
              Hủy
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" onClick={() => setConfirmArchive(true)} className="min-h-11 px-4">
            Lưu trữ
          </Button>
        )}
      </div>
    </form>
  );
}
