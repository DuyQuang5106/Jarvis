import type { DbOrTx } from '@/db/client';
import { loadEditableDocument } from './document-actions';
import type { ProposedAction } from './schema';

/** Text of a written line compared loosely: no list marker, no leading date, no emphasis, case or spacing. */
export function looseLine(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) =>
      line
        .replace(/^\s*[-*+]\s+/, '')
        .replace(/^\d{4}-\d{2}-\d{2}\s*[:\-–—]?\s*/, '')
        .replace(/[*_`]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join('\n');
}

/**
 * Drops `append_to_document` actions that would write a line twice: the same text as an earlier append in this
 * proposal (models copy one report into 04_STATE and 05_LOG), or text the target document already holds.
 * These are not errors, so they are not counted as skipped. Returns the kept actions and how many were dropped.
 */
export async function dropDuplicateWrites(db: DbOrTx, actions: ProposedAction[]): Promise<{ actions: ProposedAction[]; dropped: number }> {
  const seen = new Set<string>();
  const bodies = new Map<string, string | null>();
  const kept: ProposedAction[] = [];
  for (const action of actions) {
    if (action.type !== 'append_to_document') {
      kept.push(action);
      continue;
    }
    const text = looseLine(action.markdown);
    if (!text) {
      kept.push(action);
      continue;
    }
    if (seen.has(text)) continue;
    if (!bodies.has(action.documentId)) {
      const target = await loadEditableDocument(db, action.documentId);
      bodies.set(action.documentId, target ? looseLine(target.doc.bodyMd) : null);
    }
    const body = bodies.get(action.documentId);
    if (body && body.includes(text)) continue;
    seen.add(text);
    kept.push(action);
  }
  return { actions: kept, dropped: actions.length - kept.length };
}
