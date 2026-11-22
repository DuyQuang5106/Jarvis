'use client';

import { Trash2Icon } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import type { ActionResult } from '@/app/(app)/_actions/result';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type Run = (fn: () => Promise<ActionResult<unknown>>) => void;

/** Per-row pending and error state (ruling P1-R6): the row is `aria-busy` while a write is in flight. */
export function useRowAction(): { pending: boolean; error: string | null; run: Run } {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run: Run = (fn) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
    });
  };
  return { pending, error, run };
}

export function RowStatus({ pending, error }: { pending: boolean; error: string | null }) {
  return (
    <>
      {pending && <p className="text-xs text-muted-foreground">Đang lưu…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </>
  );
}

/** Click-to-edit title; Escape discards, Enter or blur commits a changed non-empty value. */
export function InlineTitle({
  value,
  label,
  onCommit,
  className,
}: {
  value: string;
  label: string;
  onCommit: (next: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);

  function commit(raw: string) {
    setEditing(false);
    if (cancelled.current) return;
    const next = raw.trim();
    if (next && next !== value) onCommit(next);
  }

  if (editing) {
    return (
      <Input
        autoFocus
        data-inline-edit
        aria-label={label}
        defaultValue={value}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            // The drawer ignores this Escape (see DrawerShell); discard the edit without saving.
            cancelled.current = true;
            setEditing(false);
          }
        }}
        className="h-11 min-w-0 flex-1"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        cancelled.current = false;
        setEditing(true);
      }}
      className={cn(
        'min-h-11 min-w-0 flex-1 rounded-lg px-2 text-left text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
    >
      {value}
    </button>
  );
}

/** Trash button that asks for `Xác nhận xóa` before calling `onDelete`. */
export function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <div className="flex shrink-0 gap-1">
        <Button type="button" variant="destructive" className="min-h-11 px-3" onClick={onDelete}>
          Xác nhận xóa
        </Button>
        <Button type="button" variant="ghost" className="min-h-11 px-3" onClick={() => setConfirming(false)}>
          Hủy
        </Button>
      </div>
    );
  }
  return (
    <Button type="button" variant="ghost" aria-label="Xóa" className="size-11 shrink-0" onClick={() => setConfirming(true)}>
      <Trash2Icon aria-hidden />
    </Button>
  );
}

export function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

/** An empty or blank text is stored as null. */
export const textOrNull = (s: string) => (s.trim() === '' ? null : s);
export const numberOrNull = (s: string) => (s.trim() === '' ? null : Number(s));
