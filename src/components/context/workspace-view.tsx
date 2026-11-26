'use client';

import { MenuIcon, SearchIcon, XIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition, type ComponentProps, type ReactNode } from 'react';
import {
  createDocumentAction,
  softDeleteDocumentAction,
} from '@/app/(app)/_actions/documents';
import {
  createFolderAction,
  moveFolderAction,
  renameFolderAction,
  setFolderAiExcludedAction,
  softDeleteFolderAction,
} from '@/app/(app)/_actions/folders';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AreaKind, AreaStatus } from '@/db/enums';
import type { DocumentRow, FolderRow } from '@/db/schema';
import { templatesForKind } from '@/lib/doc-templates';
import type { AreaDetails } from '@/server/queries/area-details';
import type { AreaSummary } from '@/server/queries/snapshot';
import { queueChatPreset } from '@/components/chat/chat-preset';
import { fromDocumentsMessage } from '@/lib/from-documents';
import { ActivityTimeline } from './activity-timeline';
import { AreaProgressStrip } from './area-progress-strip';
import { AreaStatusBadge } from './area-status-badge';
import { AssessmentList } from './assessment-list';
import { BlockerList } from './blocker-list';
import { DocEditor } from './doc-editor';
import { DocSearchDialog } from './doc-search-dialog';
import { DocVersionsDialog } from './doc-versions-dialog';
import { FileViewer } from './file-viewer';
import { FolderExplorer } from './folder-explorer';
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

/**
 * Runs an action that leaves the workspace (closing it, going to Chat), asking first while the operational
 * form has unsaved edits. Outside a workspace shell the action just runs.
 */
const LeaveContext = createContext<(action: () => void) => void>((action) => action());

function WorkspaceShell({
  title,
  status,
  onClose,
  headerActions,
  subheader,
  children,
}: {
  title: string;
  status?: AreaStatus;
  onClose: () => void;
  headerActions?: ReactNode;
  /** Shown under the title on every pane. */
  subheader?: ReactNode;
  children: ReactNode;
}) {
  const dirty = useRef(false);
  // The action waiting for `Bỏ thay đổi` (closing, or leaving for Chat); null while nothing is asked.
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const confirming = pendingLeave !== null;
  const reportDirty = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);

  const requestLeave = useCallback((action: () => void) => {
    if (dirty.current) setPendingLeave(() => action);
    else action();
  }, []);
  const requestClose = useCallback(() => requestLeave(onClose), [requestLeave, onClose]);

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
        <LeaveContext.Provider value={requestLeave}>{subheader}</LeaveContext.Provider>
        {children}
      </div>

      <Dialog open={confirming} onOpenChange={(open) => !open && setPendingLeave(null)}>
        <DialogContent role="alertdialog" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Bỏ thay đổi chưa lưu?</DialogTitle>
            <DialogDescription>Các thay đổi ở thông tin vận hành chưa được lưu.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11 px-4" onClick={() => setPendingLeave(null)}>
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 px-4"
              onClick={() => {
                const action = pendingLeave;
                setPendingLeave(null);
                dirty.current = false;
                action?.();
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

export function WorkspaceView({
  details,
  section,
  summary,
  today,
  actionMode = 'off',
}: {
  details: AreaDetails;
  section: string;
  summary: AreaSummary | null;
  today: string;
  /** `off`: the AI cannot propose, so `Tạo từ tài liệu` is not offered. */
  actionMode?: 'tools' | 'json' | 'off';
}) {
  const router = useRouter();
  const { doc: urlDocId, folder: urlFolderId, setDoc, setFolder, setSection, closeItem, openItem } = useContextParams();
  const [folders, setFolders] = useState<FolderRow[]>(details.folders);
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

  function handleCreateDoc(title: string, bodyMd: string, templateKey?: string, folderId?: string | null) {
    startCreate(async () => {
      const res = await createDocumentAction({
        areaId: details.area.id,
        folderId: folderId ?? null,
        title,
        bodyMd,
        templateKey: templateKey ?? null,
      });
      if (res.ok) {
        setDocs((prev) => [...prev, res.data]);
        setDoc(res.data.id, res.data.folderId ?? null);
        setExplorerSheetOpen(false);
        setMobilePane('docs');
        router.refresh();
      }
    });
  }

  async function handleCreateFolder(name: string, parentId: string | null) {
    const res = await createFolderAction({ areaId: details.area.id, parentId, name });
    if (res.ok) {
      setFolders((prev) => [...prev, res.data]);
      setFolder(res.data.id);
      router.refresh();
    }
  }

  async function handleRenameFolder(id: string, name: string) {
    const res = await renameFolderAction(id, name);
    if (res.ok) {
      setFolders((prev) => prev.map((f) => (f.id === id ? res.data : f)));
      router.refresh();
    }
  }

  async function handleMoveFolder(id: string, parentId: string | null) {
    const res = await moveFolderAction(id, parentId);
    if (res.ok) {
      setFolders((prev) => prev.map((f) => (f.id === id ? res.data : f)));
      router.refresh();
    }
  }

  async function handleToggleFolderExcluded(id: string, aiExcluded: boolean) {
    const res = await setFolderAiExcludedAction(id, aiExcluded);
    if (res.ok) {
      setFolders((prev) => prev.map((f) => (f.id === id ? res.data : f)));
      router.refresh();
    }
  }

  async function handleDeleteFolder(id: string) {
    const res = await softDeleteFolderAction(id);
    if (res.ok) {
      const byParent = new Map<string | null, string[]>();
      for (const f of folders) {
        const arr = byParent.get(f.parentId) ?? [];
        arr.push(f.id);
        byParent.set(f.parentId, arr);
      }
      const removed = new Set<string>([id]);
      const queue = [id];
      for (let i = 0; i < queue.length; i += 1) {
        for (const child of byParent.get(queue[i]) ?? []) {
          if (!removed.has(child)) {
            removed.add(child);
            queue.push(child);
          }
        }
      }
      const rest = docs.filter((d) => !d.folderId || !removed.has(d.folderId));
      setFolders((prev) => prev.filter((f) => !removed.has(f.id)));
      setDocs(rest);
      if (urlDocId && !rest.some((d) => d.id === urlDocId)) {
        setDoc(rest[0]?.id ?? null, null);
      } else if (urlFolderId && removed.has(urlFolderId)) {
        setFolder(null);
      }
      router.refresh();
    }
  }

  function handleUploadedDoc(uploaded: DocumentRow) {
    setDocs((prev) => [...prev, uploaded]);
    setDoc(uploaded.id, uploaded.folderId ?? null);
    setExplorerSheetOpen(false);
    setMobilePane('docs');
    router.refresh();
  }

  async function handleDeleteDoc(id: string) {
    const res = await softDeleteDocumentAction(id);
    if (res.ok) {
      const rest = docs.filter((d) => d.id !== id);
      setDocs(rest);
      if (urlDocId === id) setDoc(rest[0]?.id ?? null);
      router.refresh();
    }
  }

  function handleDocSaved(updated: DocumentRow) {
    setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }

  /** `Tạo từ tài liệu`: a new conversation scoped to this area, opened with the preset command. */
  function startFromDocuments() {
    queueChatPreset({ scope: { mode: 'item', areaId: details.area.id }, message: fromDocumentsMessage(details.area) });
    router.push('/chat');
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
    <FolderExplorer
      areaId={details.area.id}
      kind={details.area.kind}
      folders={folders}
      docs={docs}
      activeDocId={activeDoc?.id ?? null}
      selectedFolderId={urlFolderId}
      creating={creating}
      onSelectFolder={(fid) => setFolder(fid)}
      onSelectDoc={(docId, fid) => {
        setDoc(docId, fid);
        setExplorerSheetOpen(false);
        setMobilePane('docs');
      }}
      onCreateFolder={handleCreateFolder}
      onRenameFolder={handleRenameFolder}
      onMoveFolder={handleMoveFolder}
      onToggleFolderExcluded={handleToggleFolderExcluded}
      onDeleteFolder={handleDeleteFolder}
      onCreateDoc={handleCreateDoc}
      onUploadedDoc={handleUploadedDoc}
      onDeleteDoc={handleDeleteDoc}
    />
  );

  const editorNode = activeDoc ? (
    activeDoc.fileExt.toLowerCase() === 'md' ? (
      <DocEditor
        key={`${activeDoc.id}-${editorRevisionBump}`}
        doc={activeDoc}
        folders={folders}
        tasks={details.tasks}
        milestones={details.milestones}
        onSaved={handleDocSaved}
        onJumpToSection={handleJumpToSection}
        onOpenVersions={() => setVersionsOpen(true)}
      />
    ) : (
      <FileViewer key={activeDoc.id} doc={activeDoc} folders={folders} onSaved={handleDocSaved} />
    )
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
      subheader={
        <ProgressSubheader
          details={details}
          summary={summary}
          documentCount={docs.length}
          canPropose={actionMode !== 'off'}
          onFromDocuments={startFromDocuments}
        />
      }
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
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-r bg-muted/20 md:block">
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

      {activeDoc && activeDoc.fileExt.toLowerCase() === 'md' && (
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
          openItem(hit.areaId, KIND_TAB[hit.areaKind], hit.id, hit.folderId);
          setMobilePane('docs');
        }}
      />
    </WorkspaceShell>
  );
}

/** The progress strip, with `Tạo từ tài liệu` guarded by the shell's unsaved-edits question. */
function ProgressSubheader({ onFromDocuments, ...props }: ComponentProps<typeof AreaProgressStrip>) {
  const leave = useContext(LeaveContext);
  return <AreaProgressStrip {...props} onFromDocuments={() => leave(onFromDocuments)} />;
}

export function MissingAreaWorkspace() {
  const { closeItem } = useContextParams();
  return (
    <WorkspaceShell title="Không tìm thấy mục" onClose={closeItem}>
      <p className="p-5 text-sm">Không tìm thấy mục này.</p>
    </WorkspaceShell>
  );
}
