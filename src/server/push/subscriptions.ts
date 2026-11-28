import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTx } from '@/db/client';
import { pushSubscriptions } from '@/db/schema';
import { ValidationError } from '../errors';

/** The browser's `PushSubscription.toJSON()`, plus the user agent to tell devices apart. */
const SubscriptionInput = z.object({
  endpoint: z.url({ protocol: /^https$/, error: 'Địa chỉ nhận thông báo không hợp lệ.' }).max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  userAgent: z.string().max(400).nullable().optional(),
});

export type DeviceView = { id: string; label: string; createdAt: string; lastSuccessAt: string | null; failedCount: number };

/** Saves (or refreshes) a device; the same endpoint subscribing again replaces its keys. */
export async function saveSubscription(db: DbOrTx, raw: unknown): Promise<{ id: string }> {
  const parsed = SubscriptionInput.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Đăng ký thông báo không hợp lệ.');
  const { endpoint, keys, userAgent } = parsed.data;
  const [row] = await db
    .insert(pushSubscriptions)
    .values({ endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent ?? null })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent ?? null, failedCount: 0 } })
    .returning({ id: pushSubscriptions.id });
  return row;
}

export async function removeSubscription(db: DbOrTx, id: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
}

/** "iPhone · Safari", "Windows · Chrome": enough to recognise a device, nothing more. */
export function deviceLabel(userAgent: string | null): string {
  const ua = userAgent ?? '';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Thiết bị';
  const browser = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : null;
  return browser ? `${os} · ${browser}` : os;
}

export async function listDevices(db: DbOrTx): Promise<DeviceView[]> {
  const rows = await db.select().from(pushSubscriptions).orderBy(desc(pushSubscriptions.createdAt));
  return rows.map((r) => ({
    id: r.id,
    label: deviceLabel(r.userAgent),
    createdAt: r.createdAt.toISOString(),
    lastSuccessAt: r.lastSuccessAt?.toISOString() ?? null,
    failedCount: r.failedCount,
  }));
}
