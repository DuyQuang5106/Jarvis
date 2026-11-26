import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { settings, type SettingsRow } from '@/db/schema';
import { ValidationError } from '../errors';
import { UpdateSettingsInput } from '../schemas';

/** Returns the single settings row, creating it with defaults on first use. */
export async function getSettings(db: DbOrTx): Promise<SettingsRow> {
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing();
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  return row;
}

export async function updateSettings(db: DbOrTx, rawPatch: UpdateSettingsInput): Promise<SettingsRow> {
  const parsed = UpdateSettingsInput.safeParse(rawPatch);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.');
  const current = await getSettings(db);
  const { checkinsEnabled, daySlots, ...columns } = parsed.data;
  const patch: Record<string, unknown> = Object.fromEntries(Object.entries(columns).filter(([, v]) => v !== undefined));
  if (checkinsEnabled !== undefined || daySlots !== undefined) {
    // Merged into the stored preferences: other keys there stay as they are.
    const prefs = current.preferencesJson && typeof current.preferencesJson === 'object' ? current.preferencesJson : {};
    patch.preferencesJson = {
      ...prefs,
      ...(checkinsEnabled !== undefined ? { checkinsEnabled } : {}),
      ...(daySlots !== undefined ? { daySlots } : {}),
    };
  }
  if (Object.keys(patch).length === 0) return current;
  const [row] = await db.update(settings).set(patch).where(eq(settings.id, 1)).returning();
  return row;
}

export async function markOnboarded(db: DbOrTx, at: Date): Promise<void> {
  await getSettings(db);
  await db.update(settings).set({ onboardedAt: at }).where(eq(settings.id, 1));
}
