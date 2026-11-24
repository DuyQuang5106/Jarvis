'use client';

import { useEffect, useState } from 'react';
import { searchDocumentsAction } from '@/app/(app)/_actions/documents';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { normalizeVi } from '@/server/ai/match-areas';
import type { DocumentSearchHit } from '@/server/queries/documents';

function HighlightSnippet({ text, query }: { text: string; query: string }) {
  const tokens = normalizeVi(query).split(' ').filter(Boolean);
  if (tokens.length === 0 || !text) return <span>{text}</span>;

  // Map diacritic-insensitive matches back to original character positions.
  const chars = [...text];
  const normChars: string[] = [];
  const normToOrig: number[] = [];
  for (let i = 0; i < chars.length; i += 1) {
    const n = normalizeVi(chars[i]);
    if (!n) {
      normChars.push(' ');
      normToOrig.push(i);
    } else {
      for (const ch of n) {
        normChars.push(ch);
        normToOrig.push(i);
      }
    }
  }
  const normStr = normChars.join('');
  const ranges: [number, number][] = [];
  for (const tok of tokens) {
    let idx = 0;
    while ((idx = normStr.indexOf(tok, idx)) >= 0) {
      const start = normToOrig[idx] ?? 0;
      const end = (normToOrig[idx + tok.length - 1] ?? start) + 1;
      ranges.push([start, end]);
      idx += tok.length;
    }
  }
  if (ranges.length === 0) return <span>{text}</span>;
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [ranges[0]];
  for (const [s, e] of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  merged.forEach(([s, e], i) => {
    if (s > cursor) parts.push(<span key={`t-${i}`}>{text.slice(cursor, s)}</span>);
    parts.push(<mark key={`m-${i}`} className="rounded bg-amber-300/60 px-0.5 text-foreground dark:bg-amber-500/40">{text.slice(s, e)}</mark>);
    cursor = e;
  });
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>);
  return <>{parts}</>;
}

export function DocSearchDialog({
  open,
  onOpenChange,
  areaId,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  areaId?: string;
  onPick: (hit: DocumentSearchHit) => void;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<DocumentSearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!trimmed) {
      const id = setTimeout(() => setHits([]), 0);
      return () => clearTimeout(id);
    }
    let active = true;
    const t = setTimeout(() => {
      setSearching(true);
      void searchDocumentsAction(trimmed, areaId).then((res) => {
        if (!active) return;
        setSearching(false);
        if (res.ok) setHits(res.data);
      });
    }, 200);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [open, query, areaId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] max-w-xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{areaId ? 'Tìm trong workspace' : 'Tìm kiếm tài liệu'}</DialogTitle>
          <DialogDescription>Hỗ trợ tìm tiếng Việt không dấu (ví dụ: “tu tuong”).</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nhập từ khóa tìm tài liệu…"
          aria-label="Từ khóa tìm tài liệu"
          className="h-11 text-base"
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {searching ? (
            <p className="py-3 text-sm text-muted-foreground">Đang tìm…</p>
          ) : query.trim() === '' ? (
            <p className="py-3 text-sm text-muted-foreground">Gõ từ khóa để tìm trong tiêu đề và nội dung Markdown.</p>
          ) : hits.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">Không tìm thấy tài liệu nào khớp.</p>
          ) : (
            <ul className="space-y-2 py-1">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(h);
                      onOpenChange(false);
                    }}
                    className="flex min-h-11 w-full flex-col gap-1 rounded-lg border bg-card p-3 text-left hover:bg-accent/40"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{h.title}</span>
                      <Badge variant="outline">{h.areaName}</Badge>
                    </div>
                    {h.snippet && (
                      <p className="text-xs text-muted-foreground wrap-anywhere">
                        <HighlightSnippet text={h.snippet} query={query} />
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
