'use client';

import { SearchIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AddAreaDialog } from './add-area-dialog';
import type { TabId } from './use-context-params';

export function ContextHeader({
  tab,
  onTab,
  query,
  onQuery,
}: {
  tab: TabId;
  onTab: (t: TabId) => void;
  query: string;
  onQuery: (q: string) => void;
}) {
  return (
    <header className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Context</h1>
        <AddAreaDialog tab={tab} />
      </div>
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
