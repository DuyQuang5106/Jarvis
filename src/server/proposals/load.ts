import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import type { PendingStatus } from '@/db/enums';
import { pendingActions } from '@/db/schema';
import { describeStored } from './describe';
import type { ActionPreview, StoredAction, StoredProposal } from './schema';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ProposalView = {
  id: string;
  status: PendingStatus;
  summary: string;
  previews: ActionPreview[];
  actions: StoredAction[];
  appliedKeys: number[];
  canUndo: boolean;
  undone: boolean;
};

export async function loadProposal(db: DbOrTx, id: string): Promise<ProposalView | null> {
  if (!UUID.test(id)) return null;
  const [row] = await db.select().from(pendingActions).where(eq(pendingActions.id, id));
  if (!row) return null;
  const stored = row.actionsJson as StoredProposal;
  const rawPreviews = await describeStored(db, stored.actions);
  const previews =
    row.status === 'pending'
      ? rawPreviews
      : rawPreviews.map((p) => ({ ...p, conflict: 'none' as const }));
  return {
    id: row.id,
    status: row.status,
    summary: stored.summary,
    previews,
    actions: stored.actions,
    appliedKeys: stored.appliedKeys ?? [],
    canUndo: Boolean(stored.batchId && !stored.undoneAt && (row.status === 'applied' || row.status === 'partially_applied')),
    undone: Boolean(stored.undoneAt),
  };
}
