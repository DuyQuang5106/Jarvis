'use client';

import { useState, useTransition } from 'react';
import { addProgressLogAction } from '@/app/(app)/_actions/areas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ActivityLogRow } from '@/db/schema';
import { formatDateTimeVi } from '@/lib/dates';
import { ORIGIN_LABEL } from '@/lib/labels';
import { describeLog } from '@/server/queries/describe-log';

export function ActivityTimeline({ areaId, logs }: { areaId: string; logs: ActivityLogRow[] }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setError(null);
    startTransition(async () => {
      const res = await addProgressLogAction(areaId, t);
      if (res.ok) setText('');
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-3">
      <form onSubmit={add} className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ghi nhận tiến độ…"
          aria-label="Ghi nhận tiến độ"
          className="h-11 min-w-0 flex-1"
          autoComplete="off"
        />
        <Button type="submit" disabled={pending} className="min-h-11 shrink-0 px-4">
          Thêm log
        </Button>
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có hoạt động nào.</p>
      ) : (
        <ol className="space-y-2">
          {logs.map((log) => (
            <LogItem key={log.id} log={log} />
          ))}
        </ol>
      )}
    </div>
  );
}

function LogItem({ log }: { log: ActivityLogRow }) {
  const { title, changes } = describeLog(log);
  // Create and delete already name the record in the title; listing every field would only add noise.
  const shown = log.action === 'create' || log.action === 'delete' ? [] : changes;
  return (
    <li className="space-y-1 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
        <time dateTime={new Date(log.createdAt).toISOString()}>{formatDateTimeVi(log.createdAt)}</time>
        <span aria-hidden>·</span>
        <span>{ORIGIN_LABEL[log.origin]}</span>
      </div>
      <p className="text-sm font-medium break-words">{title}</p>
      {shown.length > 0 && (
        <ul className="space-y-0.5 text-sm text-muted-foreground">
          {shown.map((c) => (
            <li key={c.field} className="break-words">
              <span className="font-medium text-foreground">{c.field}:</span> {c.before ?? '—'} → {c.after ?? '—'}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
