'use client';

import { AlarmClock } from 'lucide-react';
import { useState, useTransition } from 'react';
import { finishReminderAction, snoozeReminderAction } from '@/app/(app)/_actions/reminders';
import { Button } from '@/components/ui/button';
import { formatDateTimeVi } from '@/lib/dates';
import type { ReminderView } from '@/server/reminders/reminders';

/** Reminders whose time has come, at the top of a new chat: "Xong" or "Nhắc lại sau 1 giờ". */
export function ReminderCards({ initial }: { initial: ReminderView[] }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (items.length === 0) return null;

  function act(id: string, action: (id: string) => ReturnType<typeof finishReminderAction>) {
    setError(null);
    startTransition(async () => {
      const res = await action(id);
      if (res.ok) setItems((list) => list.filter((r) => r.id !== id));
      else setError(res.error);
    });
  }

  return (
    <section aria-label="Nhắc việc" className="w-full space-y-2 text-left">
      {items.map((r) => (
        <div key={r.id} data-testid="reminder" className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <AlarmClock className="size-4" aria-hidden />
            Nhắc việc · {formatDateTimeVi(r.remindAt)}
            {r.areaName ? ` · ${r.areaName}` : ''}
          </p>
          <p className="font-medium">{r.text}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="min-h-11" disabled={pending} onClick={() => act(r.id, finishReminderAction)}>Xong</Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={() => act(r.id, snoozeReminderAction)}>
              Nhắc lại sau 1 giờ
            </Button>
          </div>
        </div>
      ))}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
