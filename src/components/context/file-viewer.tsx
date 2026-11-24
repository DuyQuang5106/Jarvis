'use client';

import {
  DownloadIcon,
  ExternalLinkIcon,
  FileCodeIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  ImageIcon,
  TableIcon,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react';
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
import type { DocumentRow, FolderRow } from '@/db/schema';
import { parseCsv } from '@/lib/csv';
import { DOC_ROLE_LABEL } from '@/lib/labels';
import { isImageExt } from '@/server/files/policy';
import { normalizeVi } from '@/server/ai/match-areas';
import { RowStatus, useRowAction } from './row-controls';
import { NATIVE_SELECT } from './styles';

const subscribeNoop = () => () => {};
const TEXT_AUTOSAVE_MS = 1500;

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function buildFolderPathOptions(folders: FolderRow[]): { id: string; label: string }[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const pathOf = (f: FolderRow): string => {
    const parts: string[] = [f.name];
    let cur = f.parentId;
    const seen = new Set<string>([f.id]);
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const p = byId.get(cur);
      if (!p) break;
      parts.unshift(p.name);
      cur = p.parentId;
    }
    return parts.join(' / ');
  };
  return folders
    .map((f) => ({ id: f.id, label: pathOf(f) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'vi'));
}

export function FileViewer({
  doc,
  folders,
  onSaved,
}: {
  doc: DocumentRow;
  folders: FolderRow[];
  onSaved: (updated: DocumentRow) => void;
}) {
  const hydrated = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const uid = useId();
  const ext = doc.fileExt.toLowerCase();
  const isEditableText = ext === 'txt' || ext === 'json' || ext === 'csv';
  const isImage = isImageExt(ext);
  const isPdf = ext === 'pdf';

  const [title, setTitle] = useState(doc.title);
  const [role, setRole] = useState<DocRole>(doc.docRole);
  const [folderId, setFolderId] = useState<string>(doc.folderId ?? '');
  const [excluded, setExcluded] = useState(doc.aiExcluded);

  const [body, setBody] = useState(doc.bodyMd);
  const [revision, setRevision] = useState(doc.revision);
  const [saving, setSaving] = useState(false);
  const [savedFlag, setSavedFlag] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflictDoc, setConflictDoc] = useState<DocumentRow | null>(null);

  const [csvFilter, setCsvFilter] = useState('');
  const [subMode, setSubMode] = useState<'formatted' | 'raw'>(
    ext === 'txt' ? 'raw' : 'formatted',
  );

  const bodyRef = useRef(body);
  const lastSavedRef = useRef(doc.bodyMd);
  const revisionRef = useRef(doc.revision);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const { pending: metaPending, error: metaError, run: runMeta } = useRowAction();
  const [, startRename] = useTransition();

  const folderOptions = useMemo(() => buildFolderPathOptions(folders), [folders]);

  function persist(nextOverride?: string): Promise<void> {
    if (!isEditableText) return Promise.resolve();
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
        res = { ok: false, error: 'Không lưu được tệp.' };
      }
      if (!res.ok) {
        if (res.error === 'Tài liệu đã thay đổi ở nơi khác.') {
          const fresh = await getDocumentAction(doc.id).catch(() => null);
          if (mountedRef.current) {
            setSaving(false);
            setSaveError(res.error);
            if (fresh && fresh.ok) setConflictDoc(fresh.data);
          }
          return;
        }
        if (mountedRef.current) {
          setSaving(false);
          setSaveError(res.error);
        }
        return;
      }
      lastSavedRef.current = next;
      revisionRef.current = res.data.revision;
      if (mountedRef.current) {
        setRevision(res.data.revision);
        setSaving(false);
        setConflictDoc(null);
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
    }, TEXT_AUTOSAVE_MS);
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
    return () => {
      mountedRef.current = false;
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

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

  function handleRoleChange(nextRole: DocRole) {
    const prev = role;
    setRole(nextRole);
    runMeta(async () => {
      const res = await setDocumentRoleAction(doc.id, nextRole);
      if (res.ok) onSavedRef.current(res.data);
      else setRole(prev);
      return res;
    });
  }

  function handleFolderChange(nextFolderId: string) {
    const prev = folderId;
    setFolderId(nextFolderId);
    runMeta(async () => {
      const res = await moveDocumentAction(doc.id, nextFolderId || null);
      if (res.ok) onSavedRef.current(res.data);
      else setFolderId(prev);
      return res;
    });
  }

  function handleExcludedChange(next: boolean) {
    setExcluded(next);
    runMeta(async () => {
      const res = await setDocumentAiExcludedAction(doc.id, next);
      if (res.ok) onSavedRef.current(res.data);
      else setExcluded(!next);
      return res;
    });
  }

  const parsedCsv = useMemo(() => (ext === 'csv' ? parseCsv(body) : null), [ext, body]);
  const filteredCsvRows = useMemo(() => {
    if (!parsedCsv) return [];
    const q = normalizeVi(csvFilter);
    if (!q) return parsedCsv.rows;
    return parsedCsv.rows.filter((r) => r.some((cell) => normalizeVi(cell).includes(q)));
  }, [parsedCsv, csvFilter]);

  const prettyJson = useMemo(() => {
    if (ext !== 'json') return null;
    try {
      return { ok: true as const, text: JSON.stringify(JSON.parse(body), null, 2) };
    } catch {
      return { ok: false as const, text: body };
    }
  }, [ext, body]);

  const fileUrl = `/api/files/${doc.id}`;
  const inlineUrl = `${fileUrl}?disposition=inline`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* File title & quick download/open */}
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
        <Badge variant="outline" className="uppercase">{ext}</Badge>
        {doc.sizeBytes !== null && <span className="text-xs text-muted-foreground">{formatBytes(doc.sizeBytes)}</span>}
        {isPdf && (
          <a
            href={inlineUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent"
          >
            <ExternalLinkIcon className="size-4" />
            Mở PDF
          </a>
        )}
        <a
          href={fileUrl}
          download
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent"
        >
          <DownloadIcon className="size-4" />
          Tải xuống
        </a>
      </div>

      {/* Folder, role & privacy controls */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <label htmlFor={`${uid}-folder`} className="sr-only">Thư mục tài liệu</label>
          <select
            id={`${uid}-folder`}
            aria-label="Thư mục tài liệu"
            disabled={!hydrated || metaPending}
            value={folderId}
            onChange={(e) => handleFolderChange(e.target.value)}
            className={NATIVE_SELECT}
          >
            <option value="">Thư mục gốc</option>
            {folderOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <label htmlFor={`${uid}-role`} className="sr-only">Vai trò tài liệu</label>
          <select
            id={`${uid}-role`}
            aria-label="Vai trò tài liệu"
            disabled={!hydrated || metaPending}
            value={role}
            onChange={(e) => handleRoleChange(e.target.value as DocRole)}
            className={NATIVE_SELECT}
          >
            {DOC_ROLES.map((r) => (
              <option key={r} value={r}>{DOC_ROLE_LABEL[r]}</option>
            ))}
          </select>
        </div>

        <label htmlFor={`${uid}-ai`} className="flex min-h-11 w-fit items-center gap-2 text-sm text-foreground">
          <Switch id={`${uid}-ai`} checked={excluded} disabled={metaPending} onCheckedChange={handleExcludedChange} />
          Không gửi cho AI
        </label>

        {isEditableText && (
          <div className="ml-auto flex items-center gap-2">
            <span>v{revision}</span>
            {saving && <span>Đang lưu…</span>}
            {!saving && savedFlag && !saveError && <span>Đã lưu</span>}
          </div>
        )}
      </div>

      {saveError && (
        <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive">{saveError}</p>
          {conflictDoc && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 px-3"
              onClick={() => {
                lastSavedRef.current = conflictDoc.bodyMd;
                revisionRef.current = conflictDoc.revision;
                bodyRef.current = conflictDoc.bodyMd;
                setRevision(conflictDoc.revision);
                setBody(conflictDoc.bodyMd);
                setConflictDoc(null);
                setSaveError(null);
                onSavedRef.current(conflictDoc);
              }}
            >
              Tải bản mới
            </Button>
          )}
        </div>
      )}

      <RowStatus pending={false} error={metaError} />

      {/* Format-specific view */}
      {ext === 'csv' && parsedCsv && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant={subMode === 'formatted' ? 'default' : 'outline'}
                className="min-h-11 gap-1.5 px-3"
                onClick={() => setSubMode('formatted')}
              >
                <TableIcon className="size-4" />
                Bảng ({filteredCsvRows.length}/{parsedCsv.totalRows})
              </Button>
              <Button
                type="button"
                variant={subMode === 'raw' ? 'default' : 'outline'}
                className="min-h-11 gap-1.5 px-3"
                onClick={() => setSubMode('raw')}
              >
                <FileSpreadsheetIcon className="size-4" />
                Sửa thô
              </Button>
            </div>
            {subMode === 'formatted' && (
              <Input
                type="search"
                value={csvFilter}
                onChange={(e) => setCsvFilter(e.target.value)}
                placeholder="Lọc dòng CSV…"
                aria-label="Lọc dòng CSV"
                className="h-11 min-w-44 max-w-xs text-base"
              />
            )}
          </div>

          {subMode === 'formatted' ? (
            <div className="min-h-[16rem] max-w-full flex-1 overflow-auto rounded-lg border bg-card">
              {parsedCsv.headers.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Tệp CSV trống.</p>
              ) : (
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      {parsedCsv.headers.map((h, i) => (
                        <th key={i} className="border-b border-r px-3 py-2 font-medium whitespace-nowrap last:border-r-0">
                          {h || `Cột ${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCsvRows.map((r, ri) => (
                      <tr key={ri} className="border-b last:border-b-0 hover:bg-muted/30">
                        {r.map((cell, ci) => (
                          <td key={ci} className="max-w-xs border-r px-3 py-1.5 align-top wrap-anywhere last:border-r-0">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {parsedCsv.truncated && (
                <p className="border-t bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Hiển thị tối đa {parsedCsv.rows.length}/{parsedCsv.totalRows} dòng. Bấm Tải xuống để xem toàn bộ.
                </p>
              )}
            </div>
          ) : (
            <Textarea
              aria-label="Nội dung tài liệu"
              disabled={!hydrated}
              value={body}
              onChange={(e) => {
                bodyRef.current = e.target.value;
                setBody(e.target.value);
                setSavedFlag(false);
                scheduleSave();
              }}
              onBlur={flush}
              className="min-h-[18rem] flex-1 resize-none font-mono text-base"
            />
          )}
        </div>
      )}

      {(ext === 'json' || ext === 'txt') && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {ext === 'json' && (
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant={subMode === 'formatted' ? 'default' : 'outline'}
                className="min-h-11 gap-1.5 px-3"
                onClick={() => setSubMode('formatted')}
              >
                <FileCodeIcon className="size-4" />
                Định dạng JSON
              </Button>
              <Button
                type="button"
                variant={subMode === 'raw' ? 'default' : 'outline'}
                className="min-h-11 px-3"
                onClick={() => setSubMode('raw')}
              >
                Soạn thảo
              </Button>
            </div>
          )}
          {ext === 'json' && subMode === 'formatted' && prettyJson ? (
            <pre className="min-h-[18rem] max-w-full flex-1 overflow-auto rounded-lg border bg-card p-4 font-mono text-sm">
              {prettyJson.text}
            </pre>
          ) : (
            <Textarea
              aria-label="Nội dung tài liệu"
              disabled={!hydrated}
              value={body}
              onChange={(e) => {
                bodyRef.current = e.target.value;
                setBody(e.target.value);
                setSavedFlag(false);
                scheduleSave();
              }}
              onBlur={flush}
              className="min-h-[18rem] flex-1 resize-none font-mono text-base leading-relaxed"
            />
          )}
        </div>
      )}

      {isImage && (
        <div className="flex min-h-[18rem] flex-1 flex-col items-center justify-center overflow-auto rounded-lg border bg-card p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={inlineUrl}
            alt={doc.title}
            className="max-h-[68dvh] max-w-full rounded object-contain"
          />
        </div>
      )}

      {isPdf && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant={subMode === 'formatted' ? 'default' : 'outline'}
              className="min-h-11 gap-1.5 px-3"
              onClick={() => setSubMode('formatted')}
            >
              <FileTextIcon className="size-4" />
              Xem PDF
            </Button>
            <Button
              type="button"
              variant={subMode === 'raw' ? 'default' : 'outline'}
              className="min-h-11 px-3"
              onClick={() => setSubMode('raw')}
            >
              Văn bản trích xuất ({doc.extractedText.length.toLocaleString('vi-VN')} ký tự)
            </Button>
          </div>
          {subMode === 'formatted' ? (
            <iframe
              title={doc.title}
              src={inlineUrl}
              className="min-h-[24rem] w-full flex-1 rounded-lg border bg-white"
            />
          ) : (
            <div className="min-h-[18rem] max-w-full flex-1 overflow-auto rounded-lg border bg-card p-4">
              {doc.extractedText ? (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed wrap-anywhere">
                  {doc.extractedText}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Tệp PDF này là bản scan ảnh hoặc chưa trích xuất được lớp chữ. Bấm “Mở PDF” hoặc “Tải xuống” để xem nguyên bản.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {!isEditableText && !isImage && !isPdf && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex items-center gap-2">
              <ImageIcon className="size-4 text-muted-foreground" />
              <span>Tệp đính kèm (.{ext}) · {formatBytes(doc.sizeBytes)}</span>
            </div>
            <span className="text-xs text-muted-foreground">Bản xem nhanh nội dung văn bản trích xuất</span>
          </div>
          <div className="min-h-[16rem] max-w-full flex-1 overflow-auto rounded-lg border bg-card p-4">
            {doc.extractedText ? (
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed wrap-anywhere">
                {doc.extractedText}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">
                Không có văn bản trích xuất cho tệp này. Bấm “Tải xuống” để mở bằng ứng dụng ngoài.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
