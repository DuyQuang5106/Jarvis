'use client';

import {
  CheckSquareIcon,
  HistoryIcon,
  Link2Icon,
  Redo2Icon,
  Undo2Icon,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ComponentProps } from 'react';
import Markdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import {
  getDocumentAction,
  moveDocumentAction,
  renameDocumentAction,
  setDocumentAiExcludedAction,
  setDocumentRoleAction,
  updateDocumentBodyAction,
} from '@/app/(app)/_actions/documents';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { DOC_ROLES, type DocRole } from '@/db/enums';
import type { DocumentRow, FolderRow, MilestoneRow, TaskRow } from '@/db/schema';
import { formatDateVi } from '@/lib/dates';
import { formatEntityMarkdownLink, parseEntityLink } from '@/lib/doc-links';
import { DOC_ROLE_LABEL, MILESTONE_STATUS_LABEL, TASK_STATUS_LABEL } from '@/lib/labels';
import { computeLineDiff } from '@/lib/line-diff';
import { toggleChecklistAt } from '@/lib/markdown';
import { normalizeVi } from '@/server/ai/match-areas';
import { buildFolderPathOptions } from './file-viewer';
import { RowStatus, useRowAction } from './row-controls';
import { NATIVE_SELECT } from './styles';

export const DOC_AUTOSAVE_MS = 1500;

type StashedDraft = { bodyMd: string; revision: number; error: string };
const unsavedDocs = new Map<string, StashedDraft>();

function withoutNode<T extends { node?: unknown }>({ node, ...rest }: T): Omit<T, 'node'> {
  void node;
  return rest;
}

const subscribeNoop = () => () => {};

export function DocEditor({
  doc,
  folders = [],
  tasks,
  milestones,
  onSaved,
  onJumpToSection,
  onOpenVersions,
}: {
  doc: DocumentRow;
  folders?: FolderRow[];
  tasks: TaskRow[];
  milestones: MilestoneRow[];
  onSaved: (updated: DocumentRow) => void;
  onJumpToSection: (section: 'tasks' | 'milestones') => void;
  onOpenVersions: () => void;
}) {
  const hydrated = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const uid = useId();
  const initialStash = unsavedDocs.get(doc.id);
  if (initialStash) unsavedDocs.delete(doc.id);

  const [title, setTitle] = useState(doc.title);
  const [body, setBody] = useState(initialStash?.bodyMd ?? doc.bodyMd);
  const [revision, setRevision] = useState(initialStash?.revision ?? doc.revision);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [excluded, setExcluded] = useState(doc.aiExcluded);
  const [folderId, setFolderId] = useState(doc.folderId ?? '');
  const [docRole, setDocRole] = useState<DocRole>(doc.docRole);
  const [saving, setSaving] = useState(false);
  const [savedFlag, setSavedFlag] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(initialStash?.error ?? null);
  const [conflictDoc, setConflictDoc] = useState<DocumentRow | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [stashedLocal, setStashedLocal] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');

  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef(body);
  const lastSavedRef = useRef(doc.bodyMd);
  const revisionRef = useRef(initialStash?.revision ?? doc.revision);
  const mountedRef = useRef(true);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const { pending: metaPending, error: metaError, run: runMeta } = useRowAction();
  const [, startRename] = useTransition();

  function commitBodyChange(next: string, opts: { recordUndo?: boolean } = {}) {
    if (opts.recordUndo !== false && next !== bodyRef.current) {
      setUndoStack((s) => [...s.slice(-49), bodyRef.current]);
      setRedoStack([]);
    }
    bodyRef.current = next;
    setBody(next);
    setSavedFlag(false);
  }

  function persist(nextOverride?: string): Promise<void> {
    chainRef.current = chainRef.current.then(async () => {
      const next = nextOverride ?? bodyRef.current;
      if (next === lastSavedRef.current) return;
      if (mountedRef.current) {
        setSaving(true);
        setSaveError(null);
      }
      let res: Awaited<ReturnType<typeof updateDocumentBodyAction>>;
      try {
        res = await updateDocumentBodyAction(doc.id, next, revisionRef.current);
      } catch {
        res = { ok: false, error: 'Không lưu được tài liệu.' };
      }
      if (!res.ok) {
        if (res.error === 'Tài liệu đã thay đổi ở nơi khác.') {
          const fresh = await getDocumentAction(doc.id).catch(() => null);
          if (mountedRef.current) {
            setSaving(false);
            setSaveError(res.error);
            if (fresh && fresh.ok) setConflictDoc(fresh.data);
          } else {
            unsavedDocs.set(doc.id, { bodyMd: next, revision: revisionRef.current, error: res.error });
          }
          return;
        }
        if (mountedRef.current) {
          setSaving(false);
          setSaveError(res.error);
        } else {
          toast.error(`${res.error} Nội dung chưa lưu đã được giữ lại.`);
          unsavedDocs.set(doc.id, { bodyMd: next, revision: revisionRef.current, error: res.error });
        }
        return;
      }
      lastSavedRef.current = next;
      revisionRef.current = res.data.revision;
      if (mountedRef.current) {
        setRevision(res.data.revision);
        setSaving(false);
        setConflictDoc(null);
        setShowDiff(false);
        setSavedFlag(bodyRef.current === next);
        onSavedRef.current(res.data);
      }
    });
    return chainRef.current;
  }

  function scheduleSave() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void persist();
    }, DOC_AUTOSAVE_MS);
  }

  function flush() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void persist();
  }

  useEffect(() => {
    mountedRef.current = true;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const onPageHide = () => flush();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  function handleUndo() {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, bodyRef.current]);
      bodyRef.current = last;
      setBody(last);
      setSavedFlag(false);
      scheduleSave();
      return prev.slice(0, -1);
    });
  }

  function handleRedo() {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[prev.length - 1];
      setUndoStack((u) => [...u, bodyRef.current]);
      bodyRef.current = next;
      setBody(next);
      setSavedFlag(false);
      scheduleSave();
      return prev.slice(0, -1);
    });
  }

  function handleRenameBlur() {
    const trimmed = title.trim();
    if (!trimmed || trimmed === doc.title) {
      setTitle(doc.title);
      return;
    }
    startRename(async () => {
      const res = await renameDocumentAction(doc.id, trimmed);
      if (res.ok) onSavedRef.current(res.data);
      else {
        setTitle(doc.title);
        setSaveError(res.error);
      }
    });
  }

  function toggleExcluded(next: boolean) {
    setExcluded(next);
    runMeta(async () => {
      const res = await setDocumentAiExcludedAction(doc.id, next);
      if (res.ok) onSavedRef.current(res.data);
      else setExcluded(!next);
      return res;
    });
  }

  function changeFolder(nextFolderId: string) {
    const prev = folderId;
    setFolderId(nextFolderId);
    runMeta(async () => {
      const res = await moveDocumentAction(doc.id, nextFolderId || null);
      if (res.ok) onSavedRef.current(res.data);
      else setFolderId(prev);
      return res;
    });
  }

  function changeRole(nextRole: DocRole) {
    const prev = docRole;
    setDocRole(nextRole);
    runMeta(async () => {
      const res = await setDocumentRoleAction(doc.id, nextRole);
      if (res.ok) onSavedRef.current(res.data);
      else setDocRole(prev);
      return res;
    });
  }

  const folderOptions = useMemo(() => buildFolderPathOptions(folders), [folders]);

  function insertLink(kind: 'task' | 'milestone', id: string, itemTitle: string) {
    const snippet = formatEntityMarkdownLink(kind, id, itemTitle);
    const el = textareaRef.current;
    const start = el ? el.selectionStart : bodyRef.current.length;
    const end = el ? el.selectionEnd : bodyRef.current.length;
    const next = bodyRef.current.slice(0, start) + snippet + bodyRef.current.slice(end);
    commitBodyChange(next);
    setLinkOpen(false);
    setLinkQuery('');
    scheduleSave();
  }

  function acceptServerVersion() {
    if (!conflictDoc) return;
    if (bodyRef.current !== conflictDoc.bodyMd) {
      setStashedLocal(bodyRef.current);
    }
    lastSavedRef.current = conflictDoc.bodyMd;
    revisionRef.current = conflictDoc.revision;
    setRevision(conflictDoc.revision);
    bodyRef.current = conflictDoc.bodyMd;
    setBody(conflictDoc.bodyMd);
    setTitle(conflictDoc.title);
    setConflictDoc(null);
    setSaveError(null);
    setShowDiff(false);
    onSavedRef.current(conflictDoc);
  }

  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const milestoneMap = useMemo(() => new Map(milestones.map((m) => [m.id, m])), [milestones]);

  const linkOptions = useMemo(() => {
    const q = normalizeVi(linkQuery);
    const all = [
      ...tasks.map((t) => ({ kind: 'task' as const, id: t.id, title: t.title, status: TASK_STATUS_LABEL[t.status] })),
      ...milestones.map((m) => ({
        kind: 'milestone' as const,
        id: m.id,
        title: m.title,
        status: MILESTONE_STATUS_LABEL[m.status],
      })),
    ];
    if (!q) return all;
    return all.filter((item) => normalizeVi(item.title).includes(q));
  }, [tasks, milestones, linkQuery]);

  const markdownComponents: Components = {
    input(props: ComponentProps<'input'> & { node?: unknown }) {
      const { type, checked, ...rest } = withoutNode(props);
      if (type !== 'checkbox') return <input type={type} {...rest} />;
      return (
        <input
          type="checkbox"
          checked={Boolean(checked)}
          aria-label="Checklist item"
          onChange={(e) => {
            const boxes = [...(previewRef.current?.querySelectorAll('input[type="checkbox"]') ?? [])];
            const index = boxes.indexOf(e.currentTarget);
            if (index < 0) return;
            const next = toggleChecklistAt(bodyRef.current, index);
            if (next !== bodyRef.current) {
              commitBodyChange(next);
              void persist(next);
            }
          }}
          className="mr-2 size-4 cursor-pointer align-middle accent-primary"
        />
      );
    },
    a(props: ComponentProps<'a'> & { node?: unknown }) {
      const { href, children, ...rest } = withoutNode(props);
      const parsed = parseEntityLink(href);
      if (!parsed) {
        return (
          <a href={href} target="_blank" rel="noreferrer noopener" {...rest}>
            {children}
          </a>
        );
      }
      if (parsed.kind === 'task') {
        const task = taskMap.get(parsed.id);
        if (!task) {
          return <Badge variant="destructive">liên kết hỏng</Badge>;
        }
        return (
          <button
            type="button"
            onClick={() => onJumpToSection('tasks')}
            className="inline-flex min-h-7 items-center gap-1.5 rounded-md border bg-muted/60 px-2 py-0.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <span>{task.title}</span>
            <span className="text-muted-foreground">
              · {TASK_STATUS_LABEL[task.status]}
              {task.dueDate ? ` · ${formatDateVi(task.dueDate)}` : ''}
            </span>
          </button>
        );
      }
      const ms = milestoneMap.get(parsed.id);
      if (!ms) {
        return <Badge variant="destructive">liên kết hỏng</Badge>;
      }
      return (
        <button
          type="button"
          onClick={() => onJumpToSection('milestones')}
          className="inline-flex min-h-7 items-center gap-1.5 rounded-md border bg-muted/60 px-2 py-0.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          <span>{ms.title}</span>
          <span className="text-muted-foreground">
            · {MILESTONE_STATUS_LABEL[ms.status]}
            {ms.targetDate ? ` · ${formatDateVi(ms.targetDate)}` : ''}
          </span>
        </button>
      );
    },
  };

  const conflictDiff = useMemo(
    () => (conflictDoc && showDiff ? computeLineDiff(conflictDoc.bodyMd, body) : []),
    [conflictDoc, showDiff, body],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Document title & metadata bar */}
      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        <Input
          aria-label="Tiêu đề tài liệu"
          disabled={!hydrated}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleRenameBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className="h-11 min-w-48 flex-1 text-base font-medium"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant={mode === 'edit' ? 'default' : 'outline'}
            className="min-h-11 px-3"
            onClick={() => setMode('edit')}
          >
            Soạn thảo
          </Button>
          <Button
            type="button"
            variant={mode === 'preview' ? 'default' : 'outline'}
            className="min-h-11 px-3"
            onClick={() => setMode('preview')}
          >
            Xem trước
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label="Hoàn tác"
            className="min-h-11 min-w-11 px-2.5"
            disabled={undoStack.length === 0}
            onClick={handleUndo}
          >
            <Undo2Icon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label="Làm lại"
            className="min-h-11 min-w-11 px-2.5"
            disabled={redoStack.length === 0}
            onClick={handleRedo}
          >
            <Redo2Icon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-1.5 px-3"
            onClick={() => setLinkOpen((v) => !v)}
          >
            <Link2Icon className="size-4" />
            Chèn liên kết
          </Button>
          <Button type="button" variant="outline" className="min-h-11 gap-1.5 px-3" onClick={onOpenVersions}>
            <HistoryIcon className="size-4" />
            Lịch sử
          </Button>
        </div>
      </div>

      {/* Privacy, folder, role & save status */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Thư mục tài liệu"
            disabled={!hydrated || metaPending}
            value={folderId}
            onChange={(e) => changeFolder(e.target.value)}
            className={NATIVE_SELECT}
          >
            <option value="">Thư mục gốc</option>
            {folderOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
          <select
            aria-label="Vai trò tài liệu"
            disabled={!hydrated || metaPending}
            value={docRole}
            onChange={(e) => changeRole(e.target.value as DocRole)}
            className={NATIVE_SELECT}
          >
            {DOC_ROLES.map((r) => (
              <option key={r} value={r}>{DOC_ROLE_LABEL[r]}</option>
            ))}
          </select>
          <label htmlFor={`${uid}-doc-ai`} className="flex min-h-11 w-fit items-center gap-2 text-sm text-foreground">
            <Switch id={`${uid}-doc-ai`} checked={excluded} disabled={metaPending} onCheckedChange={toggleExcluded} />
            Không gửi cho AI
          </label>
        </div>
        <div className="flex items-center gap-2">
          <span>v{revision}</span>
          {saving && <span>Đang lưu…</span>}
          {!saving && savedFlag && !saveError && <span>Đã lưu</span>}
        </div>
      </div>

      {/* Insert task/milestone link picker */}
      {linkOpen && (
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Chèn liên kết tới task hoặc milestone</span>
            <Button type="button" variant="ghost" className="min-h-11 px-3" onClick={() => setLinkOpen(false)}>
              Đóng
            </Button>
          </div>
          <Input
            value={linkQuery}
            onChange={(e) => setLinkQuery(e.target.value)}
            placeholder="Tìm task hoặc milestone…"
            aria-label="Tìm task hoặc milestone"
            className="h-11 text-base"
          />
          {linkOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">Chưa có task hoặc milestone phù hợp.</p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {linkOptions.map((opt) => (
                <li key={`${opt.kind}-${opt.id}`}>
                  <button
                    type="button"
                    onClick={() => insertLink(opt.kind, opt.id, opt.title)}
                    className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-2.5 text-left text-sm hover:bg-accent"
                  >
                    <span className="truncate">{opt.title}</span>
                    <Badge variant="outline">{opt.kind === 'task' ? 'Task' : 'Milestone'} · {opt.status}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Conflict or error alert */}
      {saveError && (
        <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive">{saveError}</p>
          {conflictDoc && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="min-h-11 px-3" onClick={acceptServerVersion}>
                Tải bản mới
              </Button>
              <Button type="button" variant="outline" className="min-h-11 px-3" onClick={() => setShowDiff((v) => !v)}>
                {showDiff ? 'Ẩn khác biệt' : 'Xem khác biệt'}
              </Button>
            </div>
          )}
          {showDiff && conflictDiff.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded border bg-background p-2 font-mono text-xs">
              {conflictDiff.map((line, i) => (
                <div
                  key={i}
                  className={
                    line.kind === 'add'
                      ? 'bg-emerald-500/15 px-1 text-emerald-900 dark:text-emerald-200'
                      : line.kind === 'del'
                        ? 'bg-red-500/15 px-1 text-red-900 dark:text-red-200'
                        : 'px-1 text-muted-foreground'
                  }
                >
                  {line.kind === 'add' ? '+ ' : line.kind === 'del' ? '- ' : '  '}
                  {line.text || ' '}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {stashedLocal !== null && (
        <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Bản bạn đang gõ trước khi tải bản mới (để chép lại nếu cần):</span>
            <Button type="button" variant="ghost" className="min-h-9 px-2" onClick={() => setStashedLocal(null)}>
              Ẩn
            </Button>
          </div>
          <Textarea readOnly value={stashedLocal} className="min-h-20 text-base" />
        </div>
      )}

      <RowStatus pending={false} error={metaError} />

      {/* Editor or Interactive GFM Preview */}
      {mode === 'edit' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Hỗ trợ Markdown GFM (heading, danh sách, `- [ ]` checklist, bảng, code block)</span>
            <button
              type="button"
              onClick={() => {
                const line = '- [ ] ';
                const el = textareaRef.current;
                const start = el ? el.selectionStart : bodyRef.current.length;
                const prefix = start > 0 && bodyRef.current[start - 1] !== '\n' ? '\n' : '';
                const next = bodyRef.current.slice(0, start) + prefix + line + bodyRef.current.slice(start);
                commitBodyChange(next);
                scheduleSave();
              }}
              className="inline-flex min-h-9 items-center gap-1 rounded px-2 hover:bg-muted"
            >
              <CheckSquareIcon className="size-3.5" />
              + Checklist
            </button>
          </div>
          <Textarea
            ref={textareaRef}
            aria-label="Nội dung tài liệu"
            disabled={!hydrated}
            value={body}
            placeholder="Viết tài liệu bằng Markdown…"
            onChange={(e) => {
              commitBodyChange(e.target.value);
              scheduleSave();
            }}
            onBlur={flush}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                if (e.shiftKey) {
                  if (redoStack.length > 0) {
                    e.preventDefault();
                    handleRedo();
                  }
                } else if (undoStack.length > 0) {
                  e.preventDefault();
                  handleUndo();
                }
              } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && redoStack.length > 0) {
                e.preventDefault();
                handleRedo();
              }
            }}
            className="min-h-[18rem] flex-1 resize-none font-mono text-base leading-relaxed"
          />
        </div>
      ) : (
        <div ref={previewRef} className="min-h-[18rem] flex-1 overflow-y-auto rounded-lg border bg-card p-4">
          {body.trim() === '' ? (
            <p className="text-sm text-muted-foreground">Tài liệu trống.</p>
          ) : (
            <div className="chat-markdown text-base">
              <Markdown
                remarkPlugins={[remarkGfm]}
                urlTransform={(url) => (parseEntityLink(url) ? url : defaultUrlTransform(url))}
                components={markdownComponents}
              >
                {body}
              </Markdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
