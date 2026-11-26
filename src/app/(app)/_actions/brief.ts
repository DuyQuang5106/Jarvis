'use server';

import { getDb } from '@/db/client';
import { getProvider } from '@/server/ai/provider';
import { requireOwner } from '@/server/auth';
import { generateDailyBrief, type BriefFailure, type DailyBrief } from '@/server/brief/daily-brief';
import { getConfig } from '@/server/config';
import type { ActionResult } from './result';

const FAILED = 'Chưa chuẩn bị được định hướng hôm nay. Dữ liệu của bạn không bị ảnh hưởng.';
const MESSAGES: Record<Exclude<BriefFailure, 'empty'>, string> = {
  cap: 'Đã chạm trần số lượt hỏi AI hôm nay.',
  provider: FAILED,
  invalid: 'AI trả về định hướng không đọc được.',
};

/** `data: null` = nothing to orient on yet (empty workspace): the card stays hidden. */
async function run(force: boolean): Promise<ActionResult<DailyBrief | null>> {
  await requireOwner();
  try {
    const cfg = getConfig();
    // getProvider() throws when the AI is not configured: reported like any other failed attempt.
    const result = await generateDailyBrief(
      { db: await getDb(), provider: getProvider(), dailyCap: cfg.aiDailyRequestCap, now: new Date() },
      { force },
    );
    if (result.ok) return { ok: true, data: result.brief };
    if (result.reason === 'empty') return { ok: true, data: null };
    return { ok: false, error: MESSAGES[result.reason] };
  } catch (err) {
    console.error('Daily brief action failed:', err instanceof Error ? err.name : 'UnknownError');
    return { ok: false, error: FAILED };
  }
}

/** Today's stored brief, or a newly generated one on the first Chat visit of the day. */
export async function getOrCreateDailyBrief(): Promise<ActionResult<DailyBrief | null>> {
  return run(false);
}

/** `Làm mới`: generates again and overwrites today's brief (the old one stays if this fails). */
export async function refreshDailyBrief(): Promise<ActionResult<DailyBrief | null>> {
  return run(true);
}
