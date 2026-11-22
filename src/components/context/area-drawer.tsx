'use client';

import type { ReactNode } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AreaKind } from '@/db/enums';
import type { AreaDetails } from '@/server/queries/area-details';
import { OverviewForm } from './overview-form';
import { TaskList } from './task-list';
import { useContextParams } from './use-context-params';

const SOON = <p className="text-sm text-muted-foreground">Sắp có.</p>;

/**
 * Single registry of drawer sections, keyed by `?section=`.
 * Tasks 6 and 7 replace the `SOON` placeholders below with their real components, one entry each.
 */
const SECTIONS: Record<string, { label: string; render: (d: AreaDetails) => ReactNode }> = {
  overview: { label: 'Tổng quan', render: (d) => <OverviewForm details={d} /> },
  tasks: { label: 'Tasks', render: (d) => <TaskList details={d} /> },
  topics: { label: 'Topics', render: () => SOON },
  assessments: { label: 'Assessments', render: () => SOON },
  milestones: { label: 'Milestones', render: () => SOON },
  blockers: { label: 'Blockers', render: () => SOON },
  notes: { label: 'Notes', render: () => SOON },
  activity: { label: 'Activity', render: () => SOON },
};

/** Which sections each kind shows, in tab order. */
const KIND_SECTIONS: Record<AreaKind, string[]> = {
  academic: ['overview', 'tasks', 'topics', 'assessments', 'notes', 'activity'],
  project: ['overview', 'tasks', 'milestones', 'blockers', 'notes', 'activity'],
};

const CONTENT_CLASS =
  'gap-0 overflow-hidden data-[side=right]:w-full data-[side=right]:sm:max-w-none data-[side=right]:md:w-[40rem] data-[side=right]:md:max-w-[40rem]';

function DrawerShell({ title, children }: { title: string; children: ReactNode }) {
  const { closeItem } = useContextParams();
  return (
    <Sheet open onOpenChange={(open) => !open && closeItem()}>
      <SheetContent className={CONTENT_CLASS}>
        <SheetHeader className="pr-12">
          <SheetTitle className="text-lg">{title}</SheetTitle>
          <SheetDescription className="sr-only">Chi tiết mục</SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}

export function AreaDrawer({ details, section }: { details: AreaDetails; section: string }) {
  const { setSection } = useContextParams();
  const ids = KIND_SECTIONS[details.area.kind];
  const active = ids.includes(section) ? section : 'overview';
  return (
    <DrawerShell title={details.area.name}>
      <Tabs value={active} onValueChange={setSection} className="min-h-0 flex-1 gap-0">
        <div className="overflow-x-auto px-4 pb-2">
          <TabsList variant="line" className="h-11 w-max">
            {ids.map((id) => (
              <TabsTrigger key={id} value={id} className="min-h-11 px-3 text-base">
                {SECTIONS[id].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value={active} className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-2">
          {SECTIONS[active].render(details)}
        </TabsContent>
      </Tabs>
    </DrawerShell>
  );
}

export function MissingAreaDrawer() {
  return (
    <DrawerShell title="Không tìm thấy mục">
      <p className="px-4 text-sm">Không tìm thấy mục này.</p>
    </DrawerShell>
  );
}
