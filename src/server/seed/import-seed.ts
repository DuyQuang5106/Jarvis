import type { Db } from '@/db/client';
import { ValidationError } from '../errors';
import { Name } from '../schemas';
import { createArea } from '../services/areas';
import { getSettings, markOnboarded, updateSettings } from '../services/settings';
import { SEED_ITEMS } from './seed-data';

export type ImportSeedInput = {
  items: { key: string; name: string }[];
  termGoal: string | null;
  now: Date;
};

/** One-time import of the draft seed: only known keys, names editable, every row origin `seed`. */
export async function importSeed(db: Db, input: ImportSeedInput): Promise<{ created: number }> {
  return db.transaction(async (tx) => {
    // Re-checked inside the transaction so a double submit cannot import twice.
    if ((await getSettings(tx)).onboardedAt) throw new ValidationError('Đã hoàn tất thiết lập ban đầu.');

    const seen = new Set<string>();
    const picked: { seed: (typeof SEED_ITEMS)[number]; name: string }[] = [];
    for (const item of input.items) {
      const seed = SEED_ITEMS.find((s) => s.key === item.key);
      if (!seed || seen.has(seed.key)) continue;
      seen.add(seed.key);
      const name = Name.safeParse(item.name);
      if (!name.success) throw new ValidationError(name.error.issues[0]?.message ?? 'Tên không hợp lệ.');
      picked.push({ seed, name: name.data });
    }

    for (const { seed, name } of picked) {
      await createArea(
        tx,
        { kind: seed.kind, name, aliases: seed.aliases, summary: seed.summary, status: seed.status },
        { origin: 'seed' },
      );
    }
    await updateSettings(tx, { termGoal: input.termGoal });
    await markOnboarded(tx, input.now);
    return { created: picked.length };
  });
}
