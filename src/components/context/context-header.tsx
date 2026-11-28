'use client';

import { MessageSquare, SearchIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { rememberContextUrl, setSplitOpen } from '@/lib/split-view';
import { AddAreaDialog } from './add-area-dialog';
import { QuickCapture } from './quick-capture';
import type { TabId } from './use-context-params';

export function ContextHeader({
  tab,
  onTab,
  query,
  onQuery,
  onSearchDocs,
}: {
  tab: TabId;
  onTab: (t: TabId) => void;
  query: string;
  onQuery: (q: string) => void;
  onSearchDocs: () => void;
}) {
  const router = useRouter();
  // Opens "Context + Chat" with this very view on the left (wide screens; hidden inside the split's own frame).
  const openWithChat = () => {
    rememberContextUrl(window.location.pathname + window.location.search);
    setSplitOpen(true);
    router.push('/chat');
  };
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Context</h1>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" className="app-embedded-hide hidden min-h-11 gap-1.5 px-3 lg:inline-flex" onClick={openWithChat}>
            <MessageSquare className="size-4" />
            Chat bên cạnh
          </Button>
          <Button type="button" variant="outline" className="min-h-11 gap-1.5 px-3" onClick={onSearchDocs}>
            <SearchIcon className="size-4" />
            Tìm tài liệu
          </Button>
          <AddAreaDialog tab={tab} />
        </div>
      </div>
      <QuickCapture />
      <Tabs value={tab} onValueChange={(v) => onTab(v as TabId)}>
        <TabsList className="h-11 md:text-base">
          <TabsTrigger value="academic" className="min-h-11 px-4">Academic</TabsTrigger>
          <TabsTrigger value="projects" className="min-h-11 px-4">Projects</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="relative">
        <SearchIcon aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Tìm theo tên"
          aria-label="Tìm theo tên"
          className="h-11 pl-9 md:text-base"
        />
      </div>
    </header>
  );
}
