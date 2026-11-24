import type { Db } from '@/db/client';
import { notes } from '@/db/schema';
import { APP_TZ, todayIn } from '@/lib/dates';
import { eq } from 'drizzle-orm';
import { buildContext } from '../ai/context-builder';
import { hiddenMigratedNoteIds } from '../ai/document-visibility';
import { buildSystemPrompt } from '../ai/prompt';
import { collect, type AiProvider } from '../ai/provider';
import { AiCapExceededError } from '../errors';
import { countAiRequest } from '../services/ai-usage';
import { ProposalBlockFilter, parseProposal } from './extract';
import { PROPOSE_CHANGES_TOOL } from './schema';
import { createPendingAction, supersedeForNote } from './store';
import { stampActions } from './validate';

export type ExtractNoteResult =
  | { status: 'proposed'; pendingActionId: string }
  | { status: 'none'; reason: string };

export async function extractNoteProposal(
  deps: { db: Db; provider: AiProvider; actionMode: 'tools' | 'json' | 'off'; dailyCap: number; now: Date },
  noteId: string,
): Promise<ExtractNoteResult> {
  const { db } = deps;
  const [note] = await db.select().from(notes).where(eq(notes.id, noteId));
  if (!note || note.inboxStatus !== 'inbox') {
    return { status: 'none', reason: 'Ghi chú không còn trong Inbox.' };
  }
  if (note.aiExcluded || (await hiddenMigratedNoteIds(db, [note.id])).size > 0) {
    return { status: 'none', reason: 'Ghi chú này đang tắt gửi cho AI.' };
  }
  if (deps.actionMode === 'off') {
    return { status: 'none', reason: 'Chế độ đề xuất đang tắt.' };
  }

  try {
    await countAiRequest(db, todayIn(APP_TZ, deps.now), deps.dailyCap);
  } catch (err) {
    if (err instanceof AiCapExceededError) {
      return { status: 'none', reason: 'Đã chạm trần số lượt hỏi AI hôm nay.' };
    }
    throw err;
  }

  const ctx = await buildContext(db, {
    message: note.text,
    recentUserMessages: [],
    scope: { mode: 'auto' },
    now: deps.now,
  });

  const safeText = note.text.replace(/</g, '&lt;');
  const userMessage =
    `Phân loại ghi chú sau thành các hành động cập nhật. Chỉ đề xuất điều ghi chú nói rõ; phần nào không rõ thuộc mục nào thì bỏ qua.\n\n<note>\n${safeText}\n</note>`;

  const tools = deps.actionMode === 'tools' ? [PROPOSE_CHANGES_TOOL] : undefined;
  let collected: Awaited<ReturnType<typeof collect>>;
  try {
    collected = await collect(
      deps.provider.stream({
        messages: [
          { role: 'system', content: buildSystemPrompt({ stateJson: ctx.json, actionMode: deps.actionMode }) },
          { role: 'user', content: userMessage },
        ],
        tools,
        maxOutputTokens: 1500,
      }),
    );
  } catch {
    return { status: 'none', reason: 'Không gọi được AI. Ghi chú vẫn nằm trong Inbox.' };
  }

  let rawProposal: string | null = null;
  if (deps.actionMode === 'tools') {
    rawProposal = collected.toolCalls.find((c) => c.name === PROPOSE_CHANGES_TOOL.name)?.argsJson ?? null;
  } else {
    const filter = new ProposalBlockFilter();
    filter.push(collected.text);
    rawProposal = filter.end().rawJson;
  }

  if (rawProposal === null) {
    return { status: 'none', reason: 'AI không tìm thấy cập nhật nào hợp lệ trong ghi chú.' };
  }
  const parsed = parseProposal(rawProposal);
  if (!parsed.ok) {
    return { status: 'none', reason: 'AI không tìm thấy cập nhật nào hợp lệ trong ghi chú.' };
  }
  const stamped = await stampActions(db, parsed.value.actions);
  if (!stamped.ok) {
    return { status: 'none', reason: 'AI không tìm thấy cập nhật nào hợp lệ trong ghi chú.' };
  }

  const pending = await db.transaction(async (tx) => {
    await supersedeForNote(tx, note.id);
    return createPendingAction(tx, {
      source: 'capture',
      noteId: note.id,
      proposal: parsed.value,
      requestText: note.text,
    });
  });

  if (!pending) {
    return { status: 'none', reason: 'AI không tìm thấy cập nhật nào hợp lệ trong ghi chú.' };
  }
  return { status: 'proposed', pendingActionId: pending.id };
}
