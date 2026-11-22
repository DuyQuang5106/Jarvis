'use client';

import { CheckIcon, ChevronDownIcon, LayersIcon } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AreaKind } from '@/db/enums';
import { cn } from '@/lib/utils';
import type { ContextScope } from '@/server/ai/context-builder';

export type ChatAreaOption = { id: string; name: string; kind: AreaKind; aiExcluded: boolean };

const MODES = [
  { mode: 'auto', label: 'Auto' },
  { mode: 'all', label: 'All' },
  { mode: 'academic', label: 'Academic' },
  { mode: 'projects', label: 'Projects' },
] as const;

export function scopeLabel(scope: ContextScope, areas: ChatAreaOption[]): string {
  if (scope.mode === 'item') return areas.find((a) => a.id === scope.areaId)?.name ?? 'Specific item';
  return MODES.find((m) => m.mode === scope.mode)?.label ?? 'Auto';
}

const GROUPS: { kind: AreaKind; label: string }[] = [
  { kind: 'academic', label: 'Academic' },
  { kind: 'project', label: 'Projects' },
];

/** Single-select listbox: arrow keys move between options, Enter or Space picks. */
function AreaListbox({
  areas,
  selectedId,
  onPick,
}: {
  areas: ChatAreaOption[];
  selectedId: string | undefined;
  onPick: (id: string) => void;
}) {
  const ordered = GROUPS.flatMap((g) => areas.filter((a) => a.kind === g.kind));
  const initial = Math.max(0, ordered.findIndex((a) => a.id === selectedId));
  const [active, setActive] = useState(initial);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  function move(to: number) {
    const next = Math.max(0, Math.min(ordered.length - 1, to));
    setActive(next);
    refs.current[next]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const keys: Record<string, () => void> = {
      ArrowDown: () => move(active + 1),
      ArrowUp: () => move(active - 1),
      Home: () => move(0),
      End: () => move(ordered.length - 1),
      Enter: () => ordered[active] && onPick(ordered[active].id),
      ' ': () => ordered[active] && onPick(ordered[active].id),
    };
    const fn = keys[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  }

  if (ordered.length === 0) return <p className="text-sm text-muted-foreground">Chưa có môn học hay dự án nào.</p>;

  let index = 0;
  return (
    <div role="listbox" aria-label="Môn học và dự án" className="-mx-1 max-h-[60dvh] overflow-y-auto" onKeyDown={onKeyDown}>
      {GROUPS.map((g) => {
        const items = areas.filter((a) => a.kind === g.kind);
        if (items.length === 0) return null;
        return (
          <div key={g.kind} role="group" aria-label={g.label} className="py-1">
            <div aria-hidden className="px-2 py-1 text-xs font-medium text-muted-foreground">{g.label}</div>
            {items.map((a) => {
              const i = index++;
              const selected = a.id === selectedId;
              return (
                <div
                  key={a.id}
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  role="option"
                  aria-selected={selected}
                  tabIndex={i === active ? 0 : -1}
                  onClick={() => onPick(a.id)}
                  onFocus={() => setActive(i)}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-base outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm',
                    selected && 'font-medium',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {a.name}
                    {a.aiExcluded && <span className="text-muted-foreground"> (không gửi cho AI)</span>}
                  </span>
                  {selected && <CheckIcon aria-hidden className="size-4 shrink-0" />}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** Which part of the workspace the AI reads for this conversation (kept while the conversation is open). */
export function ScopeSelector({
  scope,
  areas,
  onChange,
}: {
  scope: ContextScope;
  areas: ChatAreaOption[];
  onChange: (scope: ContextScope) => void;
}) {
  const [picking, setPicking] = useState(false);
  const opening = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const label = scopeLabel(scope, areas);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={trigger} type="button" variant="ghost" size="sm" className="min-h-11 max-w-[60vw] gap-1.5 px-2 text-muted-foreground md:min-h-8">
            <LayersIcon aria-hidden />
            <span className="truncate">{label}</span>
            <ChevronDownIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="top"
          className="w-56"
          onCloseAutoFocus={(e) => {
            // Focus goes to the area list instead of back to the trigger.
            if (opening.current) e.preventDefault();
            opening.current = false;
          }}
        >
          {MODES.map((m) => (
            <DropdownMenuItem key={m.mode} className="min-h-11 md:min-h-8" onSelect={() => onChange({ mode: m.mode })}>
              <span className="flex-1">{m.label}</span>
              {scope.mode === m.mode && <CheckIcon aria-hidden />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            className="min-h-11 md:min-h-8"
            onSelect={() => {
              opening.current = true;
              setPicking(true);
            }}
          >
            <span className="flex-1">Specific item</span>
            {scope.mode === 'item' && <CheckIcon aria-hidden />}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            trigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Chọn mục</DialogTitle>
            <DialogDescription>AI sẽ đọc chi tiết đúng mục này trong cuộc chat.</DialogDescription>
          </DialogHeader>
          <AreaListbox
            areas={areas}
            selectedId={scope.mode === 'item' ? scope.areaId : undefined}
            onPick={(areaId) => {
              onChange({ mode: 'item', areaId });
              setPicking(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
