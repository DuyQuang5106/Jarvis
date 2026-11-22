'use client';

import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { useId, useState, useTransition } from 'react';
import { createEntityAction, deleteEntityAction, moveTopicAction, updateEntityAction } from '@/app/(app)/_actions/entities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TOPIC_STATUSES } from '@/db/enums';
import type { TopicRow } from '@/db/schema';
import { TOPIC_STATUS_LABEL } from '@/lib/labels';
import { ProgressSummary } from './progress-summary';
import { DeleteButton, Field, InlineTitle, RowStatus, textOrNull, useRowAction } from './row-controls';
import { NATIVE_SELECT } from './styles';
import { SyncedInput } from './synced-input';

export function TopicList({ areaId, topics }: { areaId: string; topics: TopicRow[] }) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setError(null);
    startTransition(async () => {
      const next = topics.reduce((m, x) => Math.max(m, x.sortOrder), -1) + 1;
      const res = await createEntityAction('topic', { areaId, title: t, sortOrder: next });
      if (res.ok) setTitle('');
      else setError(res.error);
    });
  }

  const practiced = topics.filter((t) => t.status === 'practiced' || t.status === 'confident').length;

  return (
    <div className="space-y-3">
      <ProgressSummary done={practiced} total={topics.length} suffix="topics từ Practiced trở lên" />
      <form onSubmit={add}>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Thêm topic…"
          aria-label="Thêm topic"
          className="h-11"
          autoComplete="off"
        />
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {topics.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có topic nào.</p>
      ) : (
        <ul className="space-y-2">
          {topics.map((t, i) => (
            <TopicItem key={t.id} topic={t} first={i === 0} last={i === topics.length - 1} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TopicItem({ topic, first, last }: { topic: TopicRow; first: boolean; last: boolean }) {
  const uid = useId();
  const { pending, error, run } = useRowAction();
  const update = (patch: Record<string, unknown>) => run(() => updateEntityAction('topic', topic.id, patch));

  return (
    <li aria-busy={pending} className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1">
        <InlineTitle value={topic.title} label="Tiêu đề topic" onCommit={(v) => update({ title: v })} />
        <Button type="button" variant="ghost" aria-label="Lên" disabled={first || pending} className="size-11 shrink-0" onClick={() => run(() => moveTopicAction(topic.id, 'up'))}>
          <ArrowUpIcon aria-hidden />
        </Button>
        <Button type="button" variant="ghost" aria-label="Xuống" disabled={last || pending} className="size-11 shrink-0" onClick={() => run(() => moveTopicAction(topic.id, 'down'))}>
          <ArrowDownIcon aria-hidden />
        </Button>
        <DeleteButton onDelete={() => run(() => deleteEntityAction('topic', topic.id))} />
      </div>
      <RowStatus pending={pending} error={error} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Field id={`${uid}-st`} label="Trạng thái">
          <select
            id={`${uid}-st`}
            value={topic.status}
            onChange={(e) => update({ status: e.target.value })}
            className={NATIVE_SELECT}
          >
            {TOPIC_STATUSES.map((s) => (
              <option key={s} value={s}>{TOPIC_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </Field>
        <Field id={`${uid}-ev`} label="Bằng chứng">
          <SyncedInput
            id={`${uid}-ev`}
            value={topic.evidence ?? ''}
            onSave={(v) => update({ evidence: textOrNull(v) })}
            className="h-11"
            autoComplete="off"
          />
        </Field>
      </div>
    </li>
  );
}
