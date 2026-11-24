'use client';

import { ArrowDownIcon, ArrowUpIcon, FileTextIcon, MenuIcon, PlusIcon, SearchIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import {
  createDocumentAction,
  reorderDocumentsAction,
  softDeleteDocumentAction,
} from '@/app/(app)/_actions/documents';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AreaKind, AreaStatus } from '@/db/enums';
import type { DocumentRow } from '@/db/schema';
import { templatesForKind } from '@/lib/doc-templates';
import { normalizeVi } from '@/server/ai/match-areas';
import type { AreaDetails } from '@/server/queries/area-details';
import type { AreaSummary } from '@/server/queries/snapshot';
import { ActivityTimeline } from './activity-timeline';
import { AreaStatusBadge } from './area-status-badge';
import { AssessmentList } from './assessment-list';
import { BlockerList } from './blocker-list';
import { DocEditor } from './doc-editor';
import { DocSearchDialog } from './doc-search-dialog';
import { DocVersionsDialog } from './doc-versions-dialog';
import { MilestoneList } from './milestone-list';
import { OperationalForm } from './operational-form';
import { OverviewDirtyContext } from './overview-form';
import { ProjectHealth } from './project-health';
import { TaskList } from './task-list';
import { TopicList } from './topic-list';
import { KIND_TAB, useContextParams } from './use-context-params';

type Ctx = { summary: AreaSummary | null; today: string };

const SECTIONS: Record<string, { label: string; render: (d: AreaDetails, ctx: Ctx) => ReactNode }> = {
  overview: {
    label: 'Vận hành',
    render: (d, { summary, today }) => (
      <>
        {d.area.kind === 'project' && summary && <ProjectHealth summary={summary} milestones={d.milestones} today={today} />}
        <OperationalForm details={d} />
      </>
    ),
  },
  tasks: { label: 'Tasks', render: (d) => <TaskList details={d} /> },
  topics: { label: 'Topics', render: (d) => <TopicList areaId={d.area.id} topics={d.topics} /> },
  assessments: { label: 'Assessments', render: (d) => <AssessmentList areaId={d.area.id} assessments={d.assessments} /> },
  milestones: { label: 'Milestones', render: (d) => <MilestoneList areaId={d.area.id} milestones={d.milestones} /> },
  blockers: { label: 'Blockers', render: (d) => <BlockerList areaId={d.area.id} blockers={d.blockers} /> },
  activity: { label: 'Activity', render: (d) => <ActivityTimeline areaId={d.area.id} logs={d.logs} /> },
};

const KIND_SECTIONS: Record<AreaKind, string[]> = {
  academic: ['overview', 'tasks', 'topics', 'assessments', 'activity'],
  project: ['overview', 'tasks', 'milestones', 'blockers', 'activity'],
};

function WorkspaceShell({
  title,
  status,
  onClose,
  headerActions,
  children,
}: {
  title: string;
  status?: AreaStatus;
  onClose: () => void;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  const dirty = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const reportDirty = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);

  const requestClose = useCallback(() => {
    if (dirty.current) setConfirming(true);
    else onClose();
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (e.target instanceof Element && e.target.closest('[data-inline-edit]')) return;
      // Do not close the whole workspace if a nested radix dialog/sheet is open.
      if (document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length > 1) return;
      requestClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [requestClose]);

  return (
    <OverviewDirtyContext.Provider value={reportDirty}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-0 z-40 flex flex-col bg-background app-frame"
      >
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b px-3 py-2 md:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {headerActions}
            <h2 className="truncate text-lg font-semibold">{title}</h2>
            {status && <AreaStatusBadge status={status} />}
          </div>
          <Button type="button" variant="ghost" aria-label="Đóng" className="min-h-11 min-w-11 px-3" onClick={requestClose}>
            <XIcon className="size-5" />
            <span className="sr-only md:not-sr-only md:ml-1">Đóng</span>
          </Button>
        </header>
        {children}
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent role="alertdialog" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Bỏ thay đổi chưa lưu?</DialogTitle>
            <DialogDescription>Các thay đổi ở thông tin vận hành chưa được lưu.</DialogDescription>
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
                onClose();
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

function DocumentExplorer({
  kind,
  docs,
  activeId,
  onSelect,
  onCreate,
  onReorder,
  onDelete,
  creating,
}: {
  kind: AreaKind;
  docs: DocumentRow[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: (title: string, bodyMd: string, templateKey?: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onDelete: (id: string) => void;
  creating: boolean;
}) {
  const [filter, setFilter] = useState('');
  const [templateMenu, setTemplateMenu] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const templates = templatesForKind(kind);

  const visible = useMemo(() => {
    const q = normalizeVi(filter);
    if (!q) return docs;
    return docs.filter((d) => normalizeVi(d.title).includes(q));
  }, [docs, filter]);

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= docs.length) return;
    const next = docs.map((d) => d.id);
    [next[index], next[target]] = [next[target], next[index]];
    onReorder(next);
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          className="min-h-11 flex-1 gap-1.5"
          disabled={creating}
          onClick={() => onCreate('Tài liệu mới', '')}
        >
          <PlusIcon className="size-4" />
          Tài liệu
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 px-3"
          aria-expanded={templateMenu}
          onClick={() => setTemplateMenu((v) => !v)}
        >
          Mẫu
        </Button>
      </div>

      {templateMenu && (
        <div className="space-y-1 rounded-lg border bg-card p-2">
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Tạo từ mẫu tùy chọn</p>
          {templates.map((tpl) => (
            <button
              key={tpl.key}
              type="button"
              disabled={creating}
              onClick={() => {
                setTemplateMenu(false);
                onCreate(tpl.title, tpl.bodyMd, tpl.key);
              }}
              className="flex min-h-11 w-full items-center rounded-md px-2 text-left text-sm hover:bg-accent"
            >
              {tpl.title}
            </button>
          ))}
        </div>
      )}

      <Input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Lọc tài liệu…"
        aria-label="Lọc tài liệu"
        className="h-11 text-base"
      />

      {visible.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">
          {docs.length === 0 ? 'Chưa có tài liệu nào.' : 'Không có tài liệu khớp.'}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {visible.map((d) => {
            const idx = docs.findIndex((x) => x.id === d.id);
            const active = d.id === activeId;
            return (
              <li
                key={d.id}
                className={`rounded-lg border p-1.5 ${active ? 'border-primary bg-accent/50' : 'bg-card'}`}
              >
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSelect(d.id)}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded px-2 text-left text-sm font-medium"
                  >
                    <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{d.title}</span>
                  </button>
                  {filter.trim() === '' && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`Lên ${d.title}`}
                        className="min-h-11 min-w-11 px-2"
                        disabled={idx <= 0}
                        onClick={() => move(idx, -1)}
                      >
                        <ArrowUpIcon className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`Xuống ${d.title}`}
                        className="min-h-11 min-w-11 px-2"
                        disabled={idx < 0 || idx >= docs.length - 1}
                        onClick={() => move(idx, 1)}
                      >
                        <ArrowDownIcon className="size-4" />
                      </Button>
                    </>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Xóa ${d.title}`}
                    className="min-h-11 min-w-11 px-2 text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmDeleteId(d.id)}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
                {confirmDeleteId === d.id && (
                  <div className="mt-1 flex items-center justify-end gap-1.5 border-t pt-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11 px-3"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      Hủy
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      className="min-h-11 px-3"
                      onClick={() => {
                        setConfirmDeleteId(null);
                        onDelete(d.id);
                      }}
                    >
                      Xác nhận xóa
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function WorkspaceView({
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
  const router = useRouter();
  const { doc: urlDocId, setDoc, setSection, closeItem, openItem } = useContextParams();
  const [docs, setDocs] = useState<DocumentRow[]>(details.documents);
  const [mobilePane, setMobilePane] = useState<'docs' | 'ops'>(() =>
    section !== 'overview' && section !== '' && !urlDocId ? 'ops' : 'docs',
  );
  const [explorerSheetOpen, setExplorerSheetOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [editorRevisionBump, setEditorRevisionBump] = useState(0);
  const [creating, startCreate] = useTransition();

  const ids = KIND_SECTIONS[details.area.kind];
  const activeSection = ids.includes(section) ? section : 'overview';

  const activeDoc = useMemo(() => {
    if (urlDocId) {
      const hit = docs.find((d) => d.id === urlDocId);
      if (hit) return hit;
    }
    return docs[0] ?? null;
  }, [docs, urlDocId]);

  function handleCreateDoc(title: string, bodyMd: string, templateKey?: string) {
    startCreate(async () => {
      const res = await createDocumentAction({
        areaId: details.area.id,
        title,
        bodyMd,
        templateKey: templateKey ?? null,
      });
      if (res.ok) {
        setDocs((prev) => [...prev, res.data]);
        setDoc(res.data.id);
        setExplorerSheetOpen(false);
        setMobilePane('docs');
        router.refresh();
      }
    });
  }

  async function handleReorder(orderedIds: string[]) {
    const byId = new Map(docs.map((d) => [d.id, d]));
    setDocs(orderedIds.map((id, i) => ({ ...byId.get(id)!, sortOrder: i })));
    await reorderDocumentsAction(details.area.id, orderedIds);
    router.refresh();
  }

  async function handleDeleteDoc(id: string) {
    const res = await softDeleteDocumentAction(id);
    if (res.ok) {
      setDocs((prev) => {
        const rest = prev.filter((d) => d.id !== id);
        if (urlDocId === id) setDoc(rest[0]?.id ?? null);
        return rest;
      });
      router.refresh();
    }
  }

  function handleDocSaved(updated: DocumentRow) {
    setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }

  function handleJumpToSection(target: 'tasks' | 'milestones') {
    setSection(target);
    setMobilePane('ops');
  }

  const operationalPanel = (
    <Tabs value={activeSection} onValueChange={setSection} className="flex min-h-0 flex-1 flex-col gap-0">
      <div className="overflow-x-auto border-b px-3">
        <TabsList variant="line" className="h-11 w-max">
          {ids.map((id) => (
            <TabsTrigger key={id} value={id} className="min-h-11 px-3 text-base">
              {SECTIONS[id].label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent
        value="overview"
        forceMount
        hidden={activeSection !== 'overview'}
        className="min-h-0 flex-1 overflow-y-auto p-4"
      >
        {SECTIONS.overview.render(details, { summary, today })}
      </TabsContent>
      {activeSection !== 'overview' && (
        <TabsContent value={activeSection} className="min-h-0 flex-1 overflow-y-auto p-4">
          {SECTIONS[activeSection].render(details, { summary, today })}
        </TabsContent>
      )}
    </Tabs>
  );

  const explorerNode = (
    <DocumentExplorer
      kind={details.area.kind}
      docs={docs}
      activeId={activeDoc?.id ?? null}
      onSelect={(id) => {
        setDoc(id);
        setExplorerSheetOpen(false);
        setMobilePane('docs');
      }}
      onCreate={handleCreateDoc}
      onReorder={handleReorder}
      onDelete={handleDeleteDoc}
      creating={creating}
    />
  );

  const editorNode = activeDoc ? (
    <DocEditor
      key={`${activeDoc.id}-${editorRevisionBump}`}
      doc={activeDoc}
      tasks={details.tasks}
      milestones={details.milestones}
      onSaved={handleDocSaved}
      onJumpToSection={handleJumpToSection}
      onOpenVersions={() => setVersionsOpen(true)}
    />
  ) : (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-base font-medium">Chưa có tài liệu nào trong workspace này</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Tạo tài liệu Markdown trống hoặc chọn một mẫu khởi tạo bên dưới.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" className="min-h-11 px-4" disabled={creating} onClick={() => handleCreateDoc('Tài liệu mới', '')}>
          + Tạo tài liệu trống
        </Button>
        {templatesForKind(details.area.kind).map((tpl) => (
          <Button
            key={tpl.key}
            type="button"
            variant="outline"
            className="min-h-11 px-4"
            disabled={creating}
            onClick={() => handleCreateDoc(tpl.title, tpl.bodyMd, tpl.key)}
          >
            {tpl.title}
          </Button>
        ))}
      </div>
    </div>
  );

  return (
    <WorkspaceShell
      title={details.area.name}
      status={details.area.status}
      onClose={closeItem}
      headerActions={
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            aria-label="Danh sách tài liệu"
            className="min-h-11 min-w-11 px-2.5 md:hidden"
            onClick={() => setExplorerSheetOpen(true)}
          >
            <MenuIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label="Tìm trong workspace"
            className="min-h-11 min-w-11 px-2.5"
            onClick={() => setSearchOpen(true)}
          >
            <SearchIcon className="size-4" />
          </Button>
        </div>
      }
    >
      {/* Mobile switcher: Tài liệu vs Vận hành */}
      <div className="grid grid-cols-2 gap-2 border-b px-3 py-2 md:hidden">
        <Button
          type="button"
          variant={mobilePane === 'docs' ? 'default' : 'outline'}
          className="min-h-11"
          onClick={() => setMobilePane('docs')}
        >
          Tài liệu ({docs.length})
        </Button>
        <Button
          type="button"
          variant={mobilePane === 'ops' ? 'default' : 'outline'}
          className="min-h-11"
          onClick={() => setMobilePane('ops')}
        >
          Vận hành
        </Button>
      </div>

      {/* Desktop 3-column layout / Mobile single-pane */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r bg-muted/20 md:block">
          {explorerNode}
        </aside>

        <main
          className={`min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-3 md:flex md:p-5 ${
            mobilePane === 'docs' ? 'flex' : 'hidden'
          }`}
        >
          {editorNode}
        </main>

        <aside
          className={`min-h-0 w-full shrink-0 flex-col border-l bg-background md:flex md:w-[25rem] lg:w-[28rem] ${
            mobilePane === 'ops' ? 'flex' : 'hidden'
          }`}
        >
          {operationalPanel}
        </aside>
      </div>

      {/* Mobile Explorer Sheet */}
      <Sheet open={explorerSheetOpen} onOpenChange={setExplorerSheetOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-xs p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle>Tài liệu</SheetTitle>
            <SheetDescription className="sr-only">Danh sách tài liệu của workspace</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">{explorerNode}</div>
        </SheetContent>
      </Sheet>

      {activeDoc && (
        <DocVersionsDialog
          open={versionsOpen}
          onOpenChange={setVersionsOpen}
          documentId={activeDoc.id}
          currentBody={activeDoc.bodyMd}
          onRestored={(restored) => {
            handleDocSaved(restored);
            setEditorRevisionBump((n) => n + 1);
            router.refresh();
          }}
        />
      )}

      <DocSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        areaId={details.area.id}
        onPick={(hit) => {
          openItem(hit.areaId, KIND_TAB[hit.areaKind], hit.id);
          setMobilePane('docs');
        }}
      />
    </WorkspaceShell>
  );
}

export function MissingAreaWorkspace() {
  const { closeItem } = useContextParams();
  return (
    <WorkspaceShell title="Không tìm thấy mục" onClose={closeItem}>
      <p className="p-5 text-sm">Không tìm thấy mục này.</p>
    </WorkspaceShell>
  );
}
