'use client';

import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { deleteConversationAction, renameConversationAction } from '@/app/(app)/_actions/conversations';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { forgetConversation, mergeRecent, useConversationTouches } from '@/components/chat/recent-chats-store';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useSidebarNavigate } from './sidebar';

export type RecentChatItem = { id: string; title: string };

export function RecentChatList({ items: rows, limit }: { items: (RecentChatItem & { updatedAt: string })[]; limit: number }) {
  const pathname = usePathname();
  const c = useSearchParams().get('c');
  const openId = pathname === '/chat' ? c : null;
  const touches = useConversationTouches();
  const items = mergeRecent(rows, touches, limit);
  if (items.length === 0) return <p className="px-3 text-sm text-muted-foreground">Chưa có cuộc chat nào.</p>;
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => (
        <RecentChatRow key={item.id} item={item} active={item.id === openId} />
      ))}
    </ul>
  );
}

function RecentChatRow({ item, active }: { item: RecentChatItem; active: boolean }) {
  const router = useRouter();
  const onNavigate = useSidebarNavigate();
  const [mode, setMode] = useState<'view' | 'rename' | 'confirm'>('view');
  const [pending, startTransition] = useTransition();
  // Set by a menu item that moves focus into the row (rename field, delete confirm) instead of back to the trigger.
  const keepFocus = useRef(false);
  const cancelled = useRef(false);

  function rename(raw: string) {
    setMode('view');
    if (cancelled.current) return;
    const title = raw.trim();
    if (!title || title === item.title) return;
    startTransition(async () => {
      const res = await renameConversationAction(item.id, title);
      if (!res.ok) toast.error(res.error);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteConversationAction(item.id);
      if (!res.ok) {
        toast.error(res.error);
        setMode('view');
        return;
      }
      forgetConversation(item.id);
      // Deleting the open conversation leaves an empty new chat.
      if (active) router.replace('/chat');
      router.refresh();
    });
  }

  return (
    <li aria-busy={pending || undefined} className={cn('group relative', pending && 'opacity-60')}>
      {mode === 'rename' ? (
        <div className="px-1 py-0.5">
          <Input
            autoFocus
            aria-label="Tên cuộc chat"
            defaultValue={item.title}
            maxLength={200}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => rename(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                cancelled.current = true;
                setMode('view');
              }
            }}
            className="h-11"
          />
        </div>
      ) : (
        <div className="flex items-center">
          <Link
            href={`/chat?c=${item.id}`}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 min-w-0 flex-1 items-center rounded-lg px-3 pr-12 text-sm outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring/50',
              active && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
            )}
          >
            <span className="truncate">{item.title}</span>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Tùy chọn cuộc chat"
                disabled={pending}
                className="absolute right-0 size-11 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontalIcon aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-44"
              onCloseAutoFocus={(e) => {
                if (keepFocus.current) e.preventDefault();
                keepFocus.current = false;
              }}
            >
              <DropdownMenuItem
                className="min-h-11 md:min-h-8"
                onSelect={() => {
                  keepFocus.current = true;
                  cancelled.current = false;
                  setMode('rename');
                }}
              >
                <PencilIcon aria-hidden />
                Đổi tên
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                className="min-h-11 md:min-h-8"
                onSelect={() => {
                  keepFocus.current = true;
                  setMode('confirm');
                }}
              >
                <Trash2Icon aria-hidden />
                Xóa
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {mode === 'confirm' && (
        <div className="flex gap-1 px-1 pb-1">
          <Button type="button" variant="destructive" autoFocus className="min-h-11 flex-1 px-3" disabled={pending} onClick={remove}>
            Xác nhận xóa
          </Button>
          <Button type="button" variant="ghost" className="min-h-11 px-3" disabled={pending} onClick={() => setMode('view')}>
            Hủy
          </Button>
        </div>
      )}
    </li>
  );
}
