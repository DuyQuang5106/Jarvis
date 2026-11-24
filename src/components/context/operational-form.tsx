'use client';

import { useRouter } from 'next/navigation';
import { useContext, useId, useLayoutEffect, useState, useSyncExternalStore, useTransition } from 'react';
import { archiveAreaAction, updateAreaAction } from '@/app/(app)/_actions/areas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { AREA_STATUSES, PRIORITIES } from '@/db/enums';
import { AREA_STATUS_LABEL, PRIORITY_LABEL } from '@/lib/labels';
import type { AreaDetails } from '@/server/queries/area-details';
import { OverviewDirtyContext } from './overview-form';
import { RowStatus, useRowAction } from './row-controls';
import { NATIVE_SELECT } from './styles';
import { useContextParams } from './use-context-params';

type Values = Record<string, string>;

const NULLABLE_AREA_TEXT = ['nextAction', 'startDate', 'deadlineDate'] as const;

function initialValues(d: AreaDetails): Values {
  const { area } = d;
  return {
    name: area.name,
    aliases: area.aliases.join(', '),
    status: area.status,
    priority: area.priority,
    startDate: area.startDate ?? '',
    deadlineDate: area.deadlineDate ?? '',
    nextAction: area.nextAction ?? '',
  };
}

const orNull = (s: string) => (s.trim() === '' ? null : s);

function buildPatch(base: Values, cur: Values): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (cur.name !== base.name) patch.name = cur.name;
  for (const k of NULLABLE_AREA_TEXT) if (cur[k] !== base[k]) patch[k] = orNull(cur[k]);
  if (cur.aliases !== base.aliases) {
    patch.aliases = cur.aliases.split(',').map((a) => a.trim()).filter(Boolean);
  }
  for (const k of ['status', 'priority']) if (cur[k] !== base[k]) patch[k] = cur[k];
  return patch;
}

const subscribeNoop = () => () => {};

/** Compact operational metadata form: keeps structured fields while flexible content lives in Markdown docs. */
export function OperationalForm({ details }: { details: AreaDetails }) {
  const hydrated = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const uid = useId();
  const router = useRouter();
  const { closeItem } = useContextParams();
  const { area } = details;
  const base = initialValues(details);
  const [values, setValues] = useState<Values>(base);
  const [savedValues, setSavedValues] = useState<Values | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [pending, startTransition] = useTransition();

  const changed = (from: Values) => Object.keys(buildPatch(from, values)).length > 0;
  const dirty = changed(base) && (savedValues === null || changed(savedValues));
  const reportDirty = useContext(OverviewDirtyContext);
  useLayoutEffect(() => {
    reportDirty(dirty);
  }, [dirty, reportDirty]);
  useLayoutEffect(() => () => reportDirty(false), [reportDirty]);

  const set = (key: string, value: string) => {
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
          value={values[key]}
          placeholder={opts.placeholder}
          onChange={(e) => set(key, e.target.value)}
          className="h-11 text-base"
          autoComplete="off"
        />
      </div>
    );
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const patch = buildPatch(base, values);
    if (Object.keys(patch).length === 0) {
      setMessage({ ok: true, text: 'Đã lưu' });
      return;
    }
    setMessage(null);
    const previous = savedValues;
    setSavedValues(values);
    startTransition(async () => {
      const res = await updateAreaAction(area.id, patch);
      if (res.ok) {
        setMessage({ ok: true, text: 'Đã lưu' });
        router.refresh();
      } else {
        setSavedValues(previous);
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
    <form onSubmit={save} noValidate>
      <fieldset disabled={!hydrated} className="space-y-4">
        {field('name', 'Tên')}
        {field('aliases', 'Tên gọi tắt', { placeholder: 'Cách nhau bằng dấu phẩy' })}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor={id('status')} className="text-sm font-medium">Trạng thái</label>
            <select id={id('status')} value={values.status} onChange={(e) => set('status', e.target.value)} className={NATIVE_SELECT}>
              {AREA_STATUSES.map((s) => (
                <option key={s} value={s}>{AREA_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={id('priority')} className="text-sm font-medium">Ưu tiên</label>
            <select id={id('priority')} value={values.priority} onChange={(e) => set('priority', e.target.value)} className={NATIVE_SELECT}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
              ))}
            </select>
          </div>
          {field('startDate', 'Ngày bắt đầu', { type: 'date' })}
          {field('deadlineDate', 'Deadline', { type: 'date' })}
        </div>
        {field('nextAction', 'Việc tiếp theo')}
        <AreaPrivacySwitch areaId={area.id} initial={area.aiExcluded} />
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
      </fieldset>
    </form>
  );
}

function AreaPrivacySwitch({ areaId, initial }: { areaId: string; initial: boolean }) {
  const uid = useId();
  const router = useRouter();
  const [checked, setChecked] = useState(initial);
  const { pending, error, run } = useRowAction();

  function toggle(next: boolean) {
    setChecked(next);
    run(async () => {
      let res: Awaited<ReturnType<typeof updateAreaAction>>;
      try {
        res = await updateAreaAction(areaId, { aiExcluded: next });
      } catch {
        res = { ok: false, error: 'Không lưu được thay đổi.' };
      }
      if (res.ok) router.refresh();
      else setChecked(!next);
      return res;
    });
  }

  return (
    <div aria-busy={pending} className="space-y-1">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <label htmlFor={`${uid}-ai`} className="text-sm font-medium">Không gửi cho AI</label>
        <Switch id={`${uid}-ai`} checked={checked} disabled={pending} onCheckedChange={toggle} />
      </div>
      <RowStatus pending={pending} error={error} />
    </div>
  );
}
