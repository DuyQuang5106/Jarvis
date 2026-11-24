import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { areas, documents, type DocumentRow } from '@/db/schema';
import { readMarkdownLines } from '../ai/markdown-source';
import { visibleDocumentConditions } from '../ai/document-visibility';
import type { ActionPreview, ProposedAction, StoredAction } from './schema';

type ExistingDocumentAction = Extract<ProposedAction, { documentId: string }>;
export type DocumentAction = ExistingDocumentAction | Extract<ProposedAction, { type: 'create_document' }>;

export function isDocumentAction(action: ProposedAction): action is DocumentAction {
  return action.type === 'create_document' || 'documentId' in action;
}

export async function loadEditableDocument(db: DbOrTx, id: string) {
  const [target] = await db.select({ doc: documents, areaName: areas.name }).from(documents)
    .innerJoin(areas, eq(areas.id, documents.areaId))
    .where(and(...await visibleDocumentConditions(db), eq(documents.id, id),
      isNull(areas.archivedAt), isNull(documents.storageKey), eq(documents.fileExt, 'md')));
  return target ?? null;
}

export async function loadDocumentArea(db: DbOrTx, id: string) {
  const [area] = await db.select().from(areas).where(eq(areas.id, id));
  return area && !area.aiExcluded && !area.archivedAt ? area : null;
}

export function editDocument(doc: Pick<DocumentRow, 'bodyMd' | 'title'>, action: ExistingDocumentAction) {
  const body = doc.bodyMd;
  if (action.type === 'rename_document') {
    return { before: doc.title, after: action.title, anchor: doc.title, body, title: action.title };
  }
  const lines = readMarkdownLines(body);
  if (action.type === 'set_checklist_item') {
    const matches = lines.filter((line) => line.checklist?.label === action.itemText);
    if (matches.length !== 1) return null;
    const line = matches[0];
    const mark = line.checklist!.mark;
    const checked = action.checked ? (body[mark] === 'X' ? 'X' : 'x') : ' ';
    const relative = mark - line.start;
    return {
      before: line.text,
      after: line.text.slice(0, relative) + checked + line.text.slice(relative + 1),
      anchor: line.text,
      body: body.slice(0, mark) + checked + body.slice(mark + 1),
      title: doc.title,
    };
  }

  const newline = body.includes('\r\n') ? '\r\n' : '\n';
  const markdown = action.markdown.trim().replace(/\r\n|\r|\n/g, newline);
  if (!action.heading) {
    const next = body.trimEnd() ? body.trimEnd() + newline.repeat(2) + markdown + newline : markdown + newline;
    return { before: '', after: markdown, anchor: body, body: next, title: doc.title };
  }
  const matches = lines.filter((line) => line.heading?.label === action.heading);
  if (matches.length !== 1) return null;
  const head = matches[0];
  const following = lines.find((line) => line.start > head.start && line.heading && line.heading.level <= head.heading!.level);
  const end = following?.start ?? body.length;
  const contentStart = head.heading!.end;
  const original = body.slice(contentStart, end);
  const before = original.trimEnd();
  const after = action.type === 'replace_section' ? markdown : [before, markdown].filter(Boolean).join(newline.repeat(2));
  const heading = body.slice(head.start, contentStart);
  const next = body.slice(0, contentStart) + (/[\r\n]$/.test(heading) ? '' : newline)
    + (after ? after + newline : '') + (following ? newline : '') + body.slice(end);
  return { before, after, anchor: heading + original, body: next, title: doc.title };
}

export function sectionHash(anchor: string) {
  return createHash('sha256').update(anchor).digest('hex');
}

export async function stampDocumentAction(db: DbOrTx, action: DocumentAction) {
  if (action.type === 'create_document') {
    return await loadDocumentArea(db, action.areaId) ? { baseUpdatedAt: null } : null;
  }
  const target = await loadEditableDocument(db, action.documentId);
  if (!target) return null;
  const edit = editDocument(target.doc, action);
  if (!edit) return null;
  return { baseUpdatedAt: null, baseRevision: target.doc.revision, sectionHash: sectionHash(edit.anchor) };
}

export async function describeDocumentAction(db: DbOrTx, item: StoredAction, action: DocumentAction): Promise<ActionPreview> {
  const common = { key: item.key, type: action.type, changes: [], isCreate: action.type === 'create_document' };
  if (action.type === 'create_document') {
    const area = await loadDocumentArea(db, action.areaId);
    return {
      ...common, areaId: area?.id ?? null, areaName: area?.name ?? null,
      label: area ? 'Tạo tài liệu “' + action.title + '”' : 'Không thể truy cập workspace',
      conflict: area ? 'none' : 'missing',
      ...(area ? { diff: { before: '', after: action.markdown } } : {}),
    };
  }
  const target = await loadEditableDocument(db, action.documentId);
  if (!target) return { ...common, areaId: null, areaName: null, label: 'Không thể sửa tài liệu đích', conflict: 'missing' };
  const { doc, areaName } = target;
  const edit = editDocument(doc, action);
  const section = 'heading' in action ? action.heading : 'itemText' in action ? action.itemText : undefined;
  return {
    ...common, areaId: doc.areaId, areaName, documentId: doc.id,
    label: section ? doc.title + ' › ' + section : doc.title,
    conflict: edit && item.baseRevision !== undefined && item.baseRevision <= doc.revision &&
      item.sectionHash === sectionHash(edit.anchor) ? 'none' : 'changed',
    ...(edit ? { diff: { before: edit.before, after: edit.after } } : {}),
  };
}
