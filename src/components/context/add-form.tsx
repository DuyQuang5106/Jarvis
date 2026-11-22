'use client';

import { useId, useState, useTransition } from 'react';
import type { ActionResult } from '@/app/(app)/_actions/result';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MILESTONE_STATUSES } from '@/db/enums';
import { MILESTONE_STATUS_LABEL } from '@/lib/labels';
import { NATIVE_SELECT } from './styles';

export type FormField = {
  key: string;
  label: string;
  type?: 'text' | 'date' | 'number' | 'status';
  required?: boolean;
};

/**
 * Inline "add" form: a button opens it, `Lưu` submits, `Hủy` closes. `onSubmit` gets the raw
 * strings (empty ones included); the caller turns them into the entity input.
 */
export function AddForm({
  openLabel,
  fields,
  onSubmit,
}: {
  openLabel: string;
  fields: FormField[];
  onSubmit: (values: Record<string, string>) => Promise<ActionResult<unknown>>;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setValues({});
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await onSubmit(values);
      if (res.ok) close();
      else setError(res.error);
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" className="min-h-11 px-4" onClick={() => setOpen(true)}>
        {openLabel}
      </Button>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-lg border bg-card p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => {
          const id = `${uid}-${f.key}`;
          const set = (v: string) => setValues((prev) => ({ ...prev, [f.key]: v }));
          return (
            <div key={f.key} className="space-y-1.5">
              <label htmlFor={id} className="text-sm font-medium">{f.label}</label>
              {f.type === 'status' ? (
                <select id={id} value={values[f.key] ?? 'not_started'} onChange={(e) => set(e.target.value)} className={NATIVE_SELECT}>
                  {MILESTONE_STATUSES.map((s) => (
                    <option key={s} value={s}>{MILESTONE_STATUS_LABEL[s]}</option>
                  ))}
                </select>
              ) : (
                <Input
                  id={id}
                  type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                  inputMode={f.type === 'number' ? 'decimal' : undefined}
                  step={f.type === 'number' ? 'any' : undefined}
                  required={f.required}
                  value={values[f.key] ?? ''}
                  onChange={(e) => set(e.target.value)}
                  className="h-11"
                  autoComplete="off"
                />
              )}
            </div>
          );
        })}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="min-h-11 px-5">{pending ? 'Đang lưu…' : 'Lưu'}</Button>
        <Button type="button" variant="ghost" onClick={close} className="min-h-11 px-4">Hủy</Button>
      </div>
    </form>
  );
}
