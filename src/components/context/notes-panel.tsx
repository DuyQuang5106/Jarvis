'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createEntityAction, deleteEntityAction, updateEntityAction } from '@/app/(app)/_actions/entities';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { NoteRow } from '@/db/schema';
import { DeleteButton, RowStatus } from './row-controls';

/** A note typed in this session. It gets an `id` after its first save and keeps its editor across saves. */
type Draft = { key: string; id: string | null; empty: boolean; text?: string; aiExcluded?: boolean; error?: string };

/**
 * Edits whose save failed after their editor was gone (drawer closed or tab switched). They are kept here,
 * outside React state, so reopening Notes restores the text with its error instead of losing it.
 */
const unsaved = new Map<string, Draft[]>();

function stash(areaId: string, d: Draft) {
  unsaved.set(areaId, [d, ...(unsaved.get(areaId) ?? []).filter((x) => x.key !== d.key)]);
}

const SAVE_FAILED = 'Không lưu được ghi chú.';

export const AUTOSAVE_MS = 1500;

export function NotesPanel({ areaId, notes }: { areaId: string; notes: NoteRow[] }) {
  const [drafts, setDrafts] = useState<Draft[]>(() => {
    const restored = unsaved.get(areaId) ?? [];
    unsaved.delete(areaId);
    return restored;
  });
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
              draft={d}
              autoFocus={d.id === null && d.text === undefined}
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
  draft,
  autoFocus,
  onCreated,
  onEmpty,
  onRemoved,
}: {
  areaId: string;
  note?: NoteRow;
  draft?: Draft;
  autoFocus?: boolean;
  onCreated?: (id: string) => void;
  onEmpty?: (empty: boolean) => void;
  onRemoved: () => void;
}) {
  const uid = useId();
  const [text, setText] = useState(draft?.text ?? note?.text ?? '');
  const [excluded, setExcluded] = useState(draft?.aiExcluded ?? note?.aiExcluded ?? false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(draft?.error ?? null);
  const [pending, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();

  const textRef = useRef(text);
  const excludedRef = useRef(excluded);
  const serverExcluded = useRef(note?.aiExcluded ?? false);
  const idRef = useRef<string | null>(draft?.id ?? note?.id ?? null);
  const mounted = useRef(true);
  const keyRef = useRef(draft?.key ?? note?.id ?? crypto.randomUUID());
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
      const sentExcluded = excludedRef.current;
      let res: Awaited<ReturnType<typeof createEntityAction>>;
      try {
        res = idRef.current
          ? await updateEntityAction('note', idRef.current, { text: next })
          : await createEntityAction('note', { areaId, text: next, aiExcluded: sentExcluded });
      } catch {
        res = { ok: false, error: SAVE_FAILED };
      }
      if (!res.ok) {
        if (mounted.current) setError(res.error);
        else {
          // The editor is gone: tell the user and keep the text for when Notes is opened again.
          toast.error(`${res.error} Nội dung được giữ lại trong mục Notes.`);
          stash(areaId, { key: keyRef.current, id: idRef.current, empty: false, text: next, aiExcluded: excludedRef.current, error: res.error });
        }
        return;
      }
      lastSaved.current = next;
      if (!idRef.current) {
        idRef.current = res.data.id;
        serverExcluded.current = sentExcluded;
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
    () => {
      mounted.current = true;
      return () => {
        mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      void persist();
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** Runs after any save in flight, so a toggle made during a create is applied to the new note. */
  function toggleExcluded(next: boolean) {
    setExcluded(next);
    excludedRef.current = next;
    startTransition(async () => {
      chain.current = chain.current.then(async () => {
        const id = idRef.current;
        const want = excludedRef.current;
        if (!id || removed.current || want === serverExcluded.current) return;
        let res: Awaited<ReturnType<typeof updateEntityAction>>;
        try {
          res = await updateEntityAction('note', id, { aiExcluded: want });
        } catch {
          res = { ok: false, error: SAVE_FAILED };
        }
        if (res.ok) serverExcluded.current = want;
        else if (mounted.current) setError(res.error);
      });
      await chain.current;
    });
  }

  function remove() {
    removed.current = true;
    if (timer.current) clearTimeout(timer.current);
    startDelete(async () => {
      // A create may still be in flight: wait for it so the note it makes is deleted too.
      await chain.current;
      const id = idRef.current;
      if (!id) {
        onRemoved();
        return;
      }
      let res: Awaited<ReturnType<typeof deleteEntityAction>>;
      try {
        res = await deleteEntityAction('note', id);
      } catch {
        res = { ok: false, error: 'Không xóa được ghi chú.' };
      }
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
