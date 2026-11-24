import { normalizeVi } from '../ai/match-areas';
import { isDocumentAction } from './document-actions';
import type { ProposedAction } from './schema';

export const DEADLINE_ROUTE_ERROR = 'Hạn nộp cần được ghi vào task hoặc assessment có ngày đến hạn.';

export function hasDeadline(text: string): boolean {
  const plain = normalizeVi(text);
  return /\b(deadline|han nop|han chot|han cuoi|den han|due|nop truoc|phai nop)\b/.test(plain) &&
    /\b(\d{1,4}|hom nay|ngay mai|mai|tuan (?:nay|sau|toi)|cuoi tuan|thu (?:hai|ba|tu|nam|sau|bay)|chu nhat)\b/.test(plain);
}

export function hasDeadlineRoute(actions: ProposedAction[]): boolean {
  if (!actions.some(isDocumentAction)) return true;
  return actions.some((action) => {
    if (action.type === 'create_task' || action.type === 'upsert_assessment') return !!action.dueDate;
    return action.type === 'update_task' && !!action.patch.dueDate;
  });
}
