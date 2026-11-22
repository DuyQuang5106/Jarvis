'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TABS = ['academic', 'projects'] as const;
type TabId = (typeof TABS)[number];

export function ContextTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get('tab');
  const tab: TabId = (TABS as readonly string[]).includes(raw ?? '') ? (raw as TabId) : 'academic';

  function select(next: string) {
    const q = new URLSearchParams(params.toString());
    q.set('tab', next);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={tab} onValueChange={select}>
      <TabsList className="h-11">
        <TabsTrigger value="academic" className="min-h-11 px-4">Academic</TabsTrigger>
        <TabsTrigger value="projects" className="min-h-11 px-4">Projects</TabsTrigger>
      </TabsList>
      <TabsContent value="academic" className="text-sm text-muted-foreground">Môn học và bài tập sẽ hiển thị ở đây.</TabsContent>
      <TabsContent value="projects" className="text-sm text-muted-foreground">Dự án sẽ hiển thị ở đây.</TabsContent>
    </Tabs>
  );
}
