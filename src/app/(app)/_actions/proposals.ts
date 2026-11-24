'use server';

import { z } from 'zod';
import { getProvider } from '@/server/ai/provider';
import { getConfig } from '@/server/config';
import { NotFoundError, ValidationError } from '@/server/errors';
import { extractNoteProposal, type ExtractNoteResult } from '@/server/proposals/extract-note';
import { loadProposal, type ProposalView } from '@/server/proposals/load';
import {
  approvePendingAction,
  rebasePendingAction,
  rejectPendingAction,
  type ApproveResult,
} from '@/server/proposals/resolve';
import { runAction, type ActionResult } from './result';

const IdSchema = z.uuid({ error: 'ID đề xuất không hợp lệ.' });
const ApproveInputSchema = z.object({
  selectedKeys: z.array(z.number().int().nonnegative()),
  edits: z.record(z.string(), z.unknown()).optional(),
});

function parseId(id: string): string {
  const res = IdSchema.safeParse(id);
  if (!res.success) throw new ValidationError(res.error.issues[0]?.message ?? 'ID không hợp lệ.');
  return res.data;
}

export async function getProposalAction(id: string): Promise<ActionResult<ProposalView>> {
  return runAction(async (db) => {
    const view = await loadProposal(db, parseId(id));
    if (!view) throw new NotFoundError('Không tìm thấy đề xuất.');
    return view;
  }, []);
}

export async function approveProposalAction(
  id: string,
  rawInput: { selectedKeys: number[]; edits?: Record<number, unknown> },
): Promise<ActionResult<ApproveResult>> {
  return runAction(async (db) => {
    const validId = parseId(id);
    const parsed = ApproveInputSchema.safeParse(rawInput);
    if (!parsed.success) throw new ValidationError('Dữ liệu duyệt không hợp lệ.');
    const edits: Record<number, unknown> | undefined = parsed.data.edits
      ? Object.fromEntries(Object.entries(parsed.data.edits).map(([k, v]) => [Number(k), v]))
      : undefined;
    return approvePendingAction(db, validId, { selectedKeys: parsed.data.selectedKeys, edits });
  }, ['/context', '/chat']);
}

export async function rejectProposalAction(id: string): Promise<ActionResult<ProposalView>> {
  return runAction(async (db) => {
    const validId = parseId(id);
    await rejectPendingAction(db, validId);
    const view = await loadProposal(db, validId);
    if (!view) throw new NotFoundError('Không tìm thấy đề xuất.');
    return view;
  }, ['/context', '/chat']);
}

export async function rebaseProposalAction(id: string): Promise<ActionResult<ProposalView>> {
  return runAction(async (db) => {
    const validId = parseId(id);
    await rebasePendingAction(db, validId);
    const view = await loadProposal(db, validId);
    if (!view) throw new NotFoundError('Không tìm thấy đề xuất.');
    return view;
  }, ['/context', '/chat']);
}

export async function extractNoteAction(noteId: string): Promise<ActionResult<ExtractNoteResult>> {
  return runAction(async (db) => {
    const validId = parseId(noteId);
    const cfg = getConfig();
    return extractNoteProposal(
      {
        db,
        provider: getProvider(),
        actionMode: cfg.aiActionMode,
        dailyCap: cfg.aiDailyRequestCap,
        now: new Date(),
      },
      validId,
    );
  }, ['/context']);
}
