'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { createEntityAction, deleteEntityAction, updateEntityAction } from '@/app/(app)/_actions/entities';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { NoteRow } from '@/db/schema';
import { DeleteButton, RowStatus } from './row-controls';

/** A note typed in this session. It gets an `id` after its first save and keeps its editor across saves. */
type Draft = { key: string; id: string | null; empty: boolean };

export const AUTOSAVE_MS = 1500;

export function NotesPanel({ areaId, notes }: { areaId: string; notes: NoteRow[] }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [gone, setGone] = useState<Set<string>>(new Set());

  function add() {
    setDrafts((prev) => [
      // A never-saved empty note disappears when a different one is added.
      { key: crypto.randomUUID(), id: null, empty: true },
      ...prev.filter((d) => d.id !== null || !d.empty),
    ]);
  }
  const patch = (key: string, p: Partial<Draft>) => setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...p } : d)));

  const claimed = new Set(drafts.map((d) => d.id).filter((x): x is string => x !== null));
  const saved = notes.filter((n) => !claimed.has(n.id) && !gone.has(n.id));

  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" className="min-h-11 px-4" onClick={add}>
        Thêm ghi chú
      </Button>
      {drafts.length === 0 && saved.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có ghi chú nào.</p>
      ) : (
        <ul className="space-y-3">
          {drafts.map((d) => (
            <NoteEditor
              key={d.key}
              areaId={areaId}
              note={notes.find((n) => n.id === d.id)}
              autoFocus={d.id === null}
              onCreated={(id) => patch(d.key, { id })}
              onEmpty={(empty) => patch(d.key, { empty })}
              onRemoved={() => {
                if (d.id) setGone((g) => new Set(g).add(d.id as string));
                setDrafts((prev) => prev.filter((x) => x.key !== d.key));
              }}
            />
          ))}
          {saved.map((n) => (
            <NoteEditor
              key={n.id}
              areaId={areaId}
              note={n}
              onRemoved={() => setGone((g) => new Set(g).add(n.id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function NoteEditor({
  areaId,
  note,
  autoFocus,
  onCreated,
  onEmpty,
  onRemoved,
}: {
  areaId: string;
  note?: NoteRow;
  autoFocus?: boolean;
  onCreated?: (id: string) => void;
  onEmpty?: (empty: boolean) => void;
  onRemoved: () => void;
}) {
  const uid = useId();
  const [text, setText] = useState(note?.text ?? '');
  const [excluded, setExcluded] = useState(note?.aiExcluded ?? false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();

  const textRef = useRef(text);
  const excludedRef = useRef(excluded);
  const idRef = useRef<string | null>(note?.id ?? null);
  const lastSaved = useRef(note?.text ?? '');
  const chain = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removed = useRef(false);

  /** Saves the latest text if it differs from the last saved one; saves run one after another. */
  function persist(): Promise<void> {
    chain.current = chain.current.then(async () => {
      const next = textRef.current;
      if (removed.current || next.trim() === '' || next === lastSaved.current) return;
      setError(null);
      const res = idRef.current
        ? await updateEntityAction('note', idRef.current, { text: next })
        : await createEntityAction('note', { areaId, text: next, aiExcluded: excludedRef.current });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      lastSaved.current = next;
      if (!idRef.current) {
        idRef.current = res.data.id;
        onCreated?.(res.data.id);
      }
      setSaved(textRef.current === next);
    });
    return chain.current;
  }

  function flush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    startTransition(async () => {
      await persist();
    });
  }

  function onChange(next: string) {
    setText(next);
    textRef.current = next;
    setSaved(false);
    onEmpty?.(next.trim() === '');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, AUTOSAVE_MS);
  }

  // Closing the drawer or switching tab must not lose a pending edit.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      void persist();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function toggleExcluded(next: boolean) {
    setExcluded(next);
    excludedRef.current = next;
    if (idRef.current) {
      const id = idRef.current;
      startTransition(async () => {
        const res = await updateEntityAction('note', id, { aiExcluded: next });
        if (!res.ok) setError(res.error);
      });
    }
  }

  function remove() {
    removed.current = true;
    if (timer.current) clearTimeout(timer.current);
    const id = idRef.current;
    if (!id) {
      onRemoved();
      return;
    }
    startDelete(async () => {
      await chain.current;
      const res = await deleteEntityAction('note', id);
      if (res.ok) onRemoved();
      else {
        removed.current = false;
        setError(res.error);
      }
    });
  }

  const busy = pending || deleting;
  return (
    <li aria-busy={busy} className="space-y-2 rounded-lg border bg-card p-3">
      <Textarea
        autoFocus={autoFocus}
        aria-label="Nội dung ghi chú"
        placeholder="Viết ghi chú (Markdown)…"
        value={text}
        maxLength={20000}
        onChange={(e) => onChange(e.target.value)}
        onBlur={flush}
        className="min-h-24"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={`${uid}-ai`} className="flex min-h-11 items-center gap-2 text-sm">
          <Switch id={`${uid}-ai`} checked={excluded} onCheckedChange={toggleExcluded} />
          Không gửi cho AI
        </label>
        <span className="flex-1 text-xs text-muted-foreground" aria-live="polite">
          {!busy && saved && !error ? 'Đã lưu' : ''}
        </span>
        <DeleteButton onDelete={remove} />
      </div>
      <RowStatus pending={busy} error={error} />
    </li>
  );
}
