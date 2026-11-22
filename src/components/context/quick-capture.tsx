'use client';

import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createEntityAction } from '@/app/(app)/_actions/entities';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/** One-line (growing) capture box: saves a note straight to the Inbox, without an area. */
export function QuickCapture() {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Cmd/Ctrl+Enter calls requestSubmit(), which ignores the disabled button; a ref guards against a second save.
  const saving = useRef(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || saving.current) return;
    saving.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const res = await createEntityAction('note', { text: t, inboxStatus: 'inbox' });
        if (res.ok) {
          setText('');
          toast.success('Đã lưu vào Inbox');
        } else setError(res.error);
      } finally {
        saving.current = false;
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      <div className="flex items-start gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
          }}
          rows={1}
          maxLength={20000}
          placeholder="Ghi nhanh…"
          aria-label="Ghi nhanh"
          className="max-h-40 min-h-11 min-w-0 flex-1 py-2.5"
        />
        <Button type="submit" disabled={pending || text.trim() === ''} className="min-h-11 shrink-0 px-4">
          {pending ? 'Đang lưu…' : 'Lưu ghi chú'}
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
