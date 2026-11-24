'use client';

import {
  ChevronDownIcon,
  ChevronRightIcon,
  EyeOffIcon,
  FileCodeIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  ImageIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { AreaKind } from '@/db/enums';
import type { DocumentRow, FolderRow } from '@/db/schema';
import { templatesForKind } from '@/lib/doc-templates';
import { normalizeVi } from '@/server/ai/match-areas';
import { collectExcludedFolderIds } from '@/server/queries/folders';
import { NATIVE_SELECT } from './styles';

function FileKindIcon({ ext }: { ext: string }) {
  const e = ext.toLowerCase();
  if (e === 'csv') return <FileSpreadsheetIcon className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />;
  if (e === 'json') return <FileCodeIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />;
  if (e === 'png' || e === 'jpg' || e === 'jpeg' || e === 'webp') {
    return <ImageIcon className="size-4 shrink-0 text-sky-600 dark:text-sky-400" />;
  }
  return <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />;
}

function collectDescendantIds(folders: FolderRow[], rootId: string): Set<string> {
  const byParent = new Map<string | null, string[]>();
  for (const f of folders) {
    const arr = byParent.get(f.parentId) ?? [];
    arr.push(f.id);
    byParent.set(f.parentId, arr);
  }
  const set = new Set<string>([rootId]);
  const q = [rootId];
  for (let i = 0; i < q.length; i += 1) {
    for (const c of byParent.get(q[i]) ?? []) {
      if (!set.has(c)) {
        set.add(c);
        q.push(c);
      }
    }
  }
  return set;
}

export function FolderExplorer({
  areaId,
  kind,
  folders,
  docs,
  activeDocId,
  selectedFolderId,
  creating,
  onSelectFolder,
  onSelectDoc,
  onCreateFolder,
  onRenameFolder,
  onMoveFolder,
  onToggleFolderExcluded,
  onDeleteFolder,
  onCreateDoc,
  onUploadedDoc,
  onDeleteDoc,
}: {
  areaId: string;
  kind: AreaKind;
  folders: FolderRow[];
  docs: DocumentRow[];
  activeDocId: string | null;
  selectedFolderId: string | null;
  creating: boolean;
  onSelectFolder: (folderId: string | null) => void;
  onSelectDoc: (docId: string, folderId: string | null) => void;
  onCreateFolder: (name: string, parentId: string | null) => Promise<void>;
  onRenameFolder: (id: string, name: string) => Promise<void>;
  onMoveFolder: (id: string, parentId: string | null) => Promise<void>;
  onToggleFolderExcluded: (id: string, aiExcluded: boolean) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
  onCreateDoc: (title: string, bodyMd: string, templateKey?: string, folderId?: string | null) => void;
  onUploadedDoc: (doc: DocumentRow) => void;
  onDeleteDoc: (id: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const [templateMenu, setTemplateMenu] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [menuFolderId, setMenuFolderId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<string | null>(null);
  const [confirmDeleteDocId, setConfirmDeleteDocId] = useState<string | null>(null);

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const templates = templatesForKind(kind);

  const excludedFolderIds = useMemo(() => collectExcludedFolderIds(folders), [folders]);

  const folderByParent = useMemo(() => {
    const map = new Map<string | null, FolderRow[]>();
    for (const f of folders) {
      const list = map.get(f.parentId) ?? [];
      list.push(f);
      map.set(f.parentId, list);
    }
    return map;
  }, [folders]);

  const docsByFolder = useMemo(() => {
    const map = new Map<string | null, DocumentRow[]>();
    for (const d of docs) {
      const key = d.folderId ?? null;
      const list = map.get(key) ?? [];
      list.push(d);
      map.set(key, list);
    }
    return map;
  }, [docs]);

  const q = normalizeVi(filter);
  const matchingFolderIds = useMemo(() => {
    if (!q) return null;
    const match = new Set<string>();
    const parentMap = new Map(folders.map((f) => [f.id, f.parentId]));
    const markAncestors = (fid: string | null) => {
      let cur = fid;
      const seen = new Set<string>();
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        match.add(cur);
        cur = parentMap.get(cur) ?? null;
      }
    };
    for (const f of folders) {
      if (normalizeVi(f.name).includes(q)) markAncestors(f.id);
    }
    for (const d of docs) {
      if (normalizeVi(d.title).includes(q) && d.folderId) markAncestors(d.folderId);
    }
    return match;
  }, [q, folders, docs]);

  const selectedFolder = folders.find((f) => f.id === selectedFolderId) ?? null;

  async function handleUploadFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(fileList)) {
        const fd = new FormData();
        fd.append('areaId', areaId);
        if (selectedFolderId) fd.append('folderId', selectedFolderId);
        fd.append('file', file);
        const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
        const payload = (await res.json()) as { document?: DocumentRow; error?: string };
        if (!res.ok || !payload.document) {
          setUploadError(payload.error ?? `Không tải lên được ${file.name}.`);
          break;
        }
        onUploadedDoc(payload.document);
      }
    } catch {
      setUploadError('Lỗi mạng khi tải tệp lên.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function renderDocRow(d: DocumentRow, depth: number) {
    if (q && !normalizeVi(d.title).includes(q)) return null;
    const active = d.id === activeDocId;
    const ext = d.fileExt.toLowerCase();
    const isAiBlocked = d.aiExcluded || (d.folderId ? excludedFolderIds.has(d.folderId) : false);
    return (
      <li
        key={d.id}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        className={`rounded-lg border p-1 ${active ? 'border-primary bg-accent/50' : 'bg-card'}`}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onSelectDoc(d.id, d.folderId ?? null)}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 text-left text-sm font-medium"
          >
            <FileKindIcon ext={ext} />
            <span className="truncate">{d.title}</span>
          </button>
          {ext !== 'md' && (
            <Badge variant="outline" className="shrink-0 px-1 text-[10px] uppercase">{ext}</Badge>
          )}
          {d.docRole === 'raw' && (
            <Badge variant="secondary" className="shrink-0 px-1 text-[10px]">Gốc</Badge>
          )}
          {isAiBlocked && <EyeOffIcon aria-label="Ẩn khỏi AI" className="size-3.5 shrink-0 text-muted-foreground" />}
          <Button
            type="button"
            variant="ghost"
            aria-label={`Xóa ${d.title}`}
            className="min-h-11 min-w-11 shrink-0 px-2 text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmDeleteDocId(d.id)}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
        {confirmDeleteDocId === d.id && (
          <div className="mt-1 flex items-center justify-end gap-1.5 border-t pt-1.5">
            <Button type="button" variant="ghost" className="min-h-11 px-3" onClick={() => setConfirmDeleteDocId(null)}>
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 px-3"
              onClick={() => {
                setConfirmDeleteDocId(null);
                onDeleteDoc(d.id);
              }}
            >
              Xác nhận xóa
            </Button>
          </div>
        )}
      </li>
    );
  }

  function renderFolderBranch(f: FolderRow, depth: number): React.ReactNode {
    if (matchingFolderIds && !matchingFolderIds.has(f.id)) return null;
    const isExpanded = Boolean(q) || !collapsed.has(f.id);
    const isSelected = selectedFolderId === f.id;
    const isExcluded = excludedFolderIds.has(f.id);
    const childFolders = folderByParent.get(f.id) ?? [];
    const childDocs = docsByFolder.get(f.id) ?? [];
    const descendants = menuFolderId === f.id ? collectDescendantIds(folders, f.id) : null;

    return (
      <li key={f.id} className="space-y-1">
        <div
          style={{ paddingLeft: `${depth * 14 + 2}px` }}
          className={`rounded-lg border p-1 ${isSelected ? 'border-primary/70 bg-accent/40' : 'bg-muted/30'}`}
        >
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label={isExpanded ? `Thu gọn ${f.name}` : `Mở rộng ${f.name}`}
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(f.id)) next.delete(f.id);
                  else next.add(f.id);
                  return next;
                })
              }
              className="flex min-h-11 min-w-9 shrink-0 items-center justify-center rounded hover:bg-accent"
            >
              {isExpanded ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
            </button>
            <button
              type="button"
              onClick={() => onSelectFolder(isSelected ? null : f.id)}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 rounded px-1 text-left text-sm font-medium"
            >
              {isExpanded ? (
                <FolderOpenIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              ) : (
                <FolderIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              )}
              <span className="truncate">{f.name}</span>
            </button>
            {isExcluded && <EyeOffIcon aria-label="Thư mục ẩn khỏi AI" className="size-3.5 shrink-0 text-muted-foreground" />}
            <Button
              type="button"
              variant="ghost"
              aria-label={`Tùy chọn ${f.name}`}
              className="min-h-11 min-w-11 shrink-0 px-2"
              onClick={() => {
                if (menuFolderId === f.id) {
                  setMenuFolderId(null);
                } else {
                  setMenuFolderId(f.id);
                  setRenameDraft(f.name);
                  setConfirmDeleteFolderId(null);
                }
              }}
            >
              <MoreHorizontalIcon className="size-4" />
            </Button>
          </div>

          {menuFolderId === f.id && (
            <div className="mt-1 space-y-2 border-t bg-card p-2 text-xs">
              <form
                className="flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const next = renameDraft.trim();
                  if (next) void onRenameFolder(f.id, next).then(() => setMenuFolderId(null));
                }}
              >
                <Input
                  aria-label="Đổi tên thư mục"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  className="h-11 flex-1 text-base"
                />
                <Button type="submit" variant="outline" className="min-h-11 px-3">Lưu</Button>
              </form>

              <div className="space-y-1">
                <label className="text-muted-foreground">Di chuyển thư mục tới</label>
                <select
                  aria-label={`Di chuyển thư mục ${f.name}`}
                  value={f.parentId ?? ''}
                  onChange={(e) => void onMoveFolder(f.id, e.target.value || null)}
                  className={NATIVE_SELECT}
                >
                  <option value="">Thư mục gốc</option>
                  {folders
                    .filter((cand) => !descendants?.has(cand.id))
                    .map((cand) => (
                      <option key={cand.id} value={cand.id}>{cand.name}</option>
                    ))}
                </select>
              </div>

              <label className="flex min-h-11 items-center justify-between gap-2 text-sm">
                <span>Không gửi thư mục cho AI</span>
                <Switch
                  aria-label={`Không gửi ${f.name} cho AI`}
                  checked={f.aiExcluded}
                  onCheckedChange={(v) => void onToggleFolderExcluded(f.id, v)}
                />
              </label>

              {confirmDeleteFolderId === f.id ? (
                <div className="flex items-center justify-end gap-1.5">
                  <Button type="button" variant="ghost" className="min-h-11 px-3" onClick={() => setConfirmDeleteFolderId(null)}>
                    Hủy
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="min-h-11 px-3"
                    onClick={() => {
                      setConfirmDeleteFolderId(null);
                      setMenuFolderId(null);
                      void onDeleteFolder(f.id);
                    }}
                  >
                    Xác nhận xóa
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 w-full justify-start gap-1.5 text-destructive hover:text-destructive"
                  onClick={() => setConfirmDeleteFolderId(f.id)}
                >
                  <Trash2Icon className="size-4" />
                  Xóa thư mục (gồm nội dung)
                </Button>
              )}
            </div>
          )}
        </div>

        {isExpanded && (childFolders.length > 0 || childDocs.length > 0) && (
          <ul className="space-y-1">
            {childFolders.map((cf) => renderFolderBranch(cf, depth + 1))}
            {childDocs.map((cd) => renderDocRow(cd, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  const rootFolders = folderByParent.get(null) ?? [];
  const rootDocs = docsByFolder.get(null) ?? [];

  return (
    <div className="flex h-full flex-col gap-2.5 p-3">
      {/* Primary actions */}
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          type="button"
          className="min-h-11 gap-1 px-2.5"
          disabled={creating}
          onClick={() => onCreateDoc('Tài liệu mới', '', undefined, selectedFolderId)}
        >
          <PlusIcon className="size-4" />
          Tài liệu
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 gap-1 px-2.5"
          disabled={creating}
          onClick={() => setNewFolderOpen((v) => !v)}
        >
          <FolderPlusIcon className="size-4" />
          Thư mục
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 gap-1 px-2.5"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadIcon className="size-4" />
          {uploading ? 'Đang tải…' : 'Tải tệp'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 px-2.5"
          aria-expanded={templateMenu}
          onClick={() => setTemplateMenu((v) => !v)}
        >
          Mẫu
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          aria-label="Chọn tệp tải lên"
          accept=".md,.txt,.csv,.json,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={(e) => void handleUploadFiles(e.target.files)}
        />
      </div>

      {selectedFolder && (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-2.5 py-1 text-xs">
          <span className="truncate">Trong: <strong>{selectedFolder.name}</strong></span>
          <button
            type="button"
            onClick={() => onSelectFolder(null)}
            className="min-h-8 shrink-0 font-medium text-primary hover:underline"
          >
            Về gốc
          </button>
        </div>
      )}

      {newFolderOpen && (
        <form
          className="flex gap-1.5 rounded-lg border bg-card p-2"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = newFolderName.trim();
            if (!trimmed) return;
            void onCreateFolder(trimmed, selectedFolderId).then(() => {
              setNewFolderName('');
              setNewFolderOpen(false);
            });
          }}
        >
          <Input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Tên thư mục…"
            aria-label="Tên thư mục mới"
            className="h-11 flex-1 text-base"
          />
          <Button type="submit" disabled={creating} className="min-h-11 px-3">
            Tạo
          </Button>
        </form>
      )}

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
                onCreateDoc(tpl.title, tpl.bodyMd, tpl.key, selectedFolderId);
              }}
              className="flex min-h-11 w-full items-center rounded-md px-2 text-left text-sm hover:bg-accent"
            >
              {tpl.title}
            </button>
          ))}
        </div>
      )}

      {uploadError && (
        <p role="alert" className="rounded border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
          {uploadError}
        </p>
      )}

      <Input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Lọc tệp & thư mục…"
        aria-label="Lọc tài liệu"
        className="h-11 text-base"
      />

      {folders.length === 0 && docs.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">Chưa có tài liệu nào.</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {rootFolders.map((f) => renderFolderBranch(f, 0))}
          {rootDocs.map((d) => renderDocRow(d, 0))}
        </ul>
      )}
    </div>
  );
}
