'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AreaKind } from '@/db/enums';
import type { AreaDetails } from '@/server/queries/area-details';
import type { AreaSummary } from '@/server/queries/snapshot';
import { AssessmentList } from './assessment-list';
import { BlockerList } from './blocker-list';
import { ActivityTimeline } from './activity-timeline';
import { MilestoneList } from './milestone-list';
import { NotesPanel } from './notes-panel';
import { OverviewDirtyContext, OverviewForm } from './overview-form';
import { ProjectHealth } from './project-health';
import { TaskList } from './task-list';
import { TopicList } from './topic-list';
import { useContextParams } from './use-context-params';

/**
 * Single registry of drawer sections, keyed by `?section=`.
 */
type Ctx = { summary: AreaSummary | null; today: string };

const SECTIONS: Record<string, { label: string; render: (d: AreaDetails, ctx: Ctx) => ReactNode }> = {
  overview: {
    label: 'Tổng quan',
    render: (d, { summary, today }) => (
      <>
        {d.area.kind === 'project' && summary && <ProjectHealth summary={summary} milestones={d.milestones} today={today} />}
        <OverviewForm details={d} />
      </>
    ),
  },
  tasks: { label: 'Tasks', render: (d) => <TaskList details={d} /> },
  topics: { label: 'Topics', render: (d) => <TopicList areaId={d.area.id} topics={d.topics} /> },
  assessments: { label: 'Assessments', render: (d) => <AssessmentList areaId={d.area.id} assessments={d.assessments} /> },
  milestones: { label: 'Milestones', render: (d) => <MilestoneList areaId={d.area.id} milestones={d.milestones} /> },
  blockers: { label: 'Blockers', render: (d) => <BlockerList areaId={d.area.id} blockers={d.blockers} /> },
  notes: { label: 'Notes', render: (d) => <NotesPanel areaId={d.area.id} notes={d.notes} /> },
  activity: { label: 'Activity', render: (d) => <ActivityTimeline areaId={d.area.id} logs={d.logs} /> },
};

/** Which sections each kind shows, in tab order. */
const KIND_SECTIONS: Record<AreaKind, string[]> = {
  academic: ['overview', 'tasks', 'topics', 'assessments', 'notes', 'activity'],
  project: ['overview', 'tasks', 'milestones', 'blockers', 'notes', 'activity'],
};

const CONTENT_CLASS =
  'gap-0 overflow-hidden data-[side=right]:w-full data-[side=right]:sm:max-w-none data-[side=right]:md:w-[40rem] data-[side=right]:md:max-w-[40rem]';

/**
 * Closing with X, Escape or the overlay asks first while the overview has unsaved edits (ruling P1-R9).
 * Browser back changes the URL directly and unmounts the drawer; those edits are dropped.
 */
function DrawerShell({ title, children }: { title: string; children: ReactNode }) {
  const { closeItem } = useContextParams();
  const dirty = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const reportDirty = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);

  function requestClose() {
    if (dirty.current) setConfirming(true);
    else closeItem();
  }

  return (
    <OverviewDirtyContext.Provider value={reportDirty}>
      <Sheet open onOpenChange={(open) => !open && requestClose()}>
        <SheetContent
          className={CONTENT_CLASS}
          onEscapeKeyDown={(e) => {
            // Escape inside an inline edit cancels that edit only, not the whole drawer.
            if (e.target instanceof Element && e.target.closest('[data-inline-edit]')) e.preventDefault();
          }}
        >
          <SheetHeader className="pr-14">
            <SheetTitle className="text-lg">{title}</SheetTitle>
            <SheetDescription className="sr-only">Chi tiết mục</SheetDescription>
          </SheetHeader>
          {children}
        </SheetContent>
      </Sheet>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent role="alertdialog" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Bỏ thay đổi chưa lưu?</DialogTitle>
            <DialogDescription>Các thay đổi ở Tổng quan chưa được lưu.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11 px-4" onClick={() => setConfirming(false)}>
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 px-4"
              onClick={() => {
                setConfirming(false);
                dirty.current = false;
                closeItem();
              }}
            >
              Bỏ thay đổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OverviewDirtyContext.Provider>
  );
}

export function AreaDrawer({
  details,
  section,
  summary,
  today,
}: {
  details: AreaDetails;
  section: string;
  summary: AreaSummary | null;
  today: string;
}) {
  const ctx: Ctx = { summary, today };
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
        {/* The overview stays mounted (hidden) so unsaved edits survive switching tabs. */}
        <TabsContent
          value="overview"
          forceMount
          hidden={active !== 'overview'}
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-2"
        >
          {SECTIONS.overview.render(details, ctx)}
        </TabsContent>
        {active !== 'overview' && (
          <TabsContent value={active} className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-2">
            {SECTIONS[active].render(details, ctx)}
          </TabsContent>
        )}
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
