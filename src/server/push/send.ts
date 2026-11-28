import { eq, sql } from 'drizzle-orm';
import { sendNotification } from 'web-push';
import type { DbOrTx } from '@/db/client';
import { pushSubscriptions, type PushSubscriptionRow } from '@/db/schema';
import { getConfig } from '../config';

/** What the service worker shows (`public/sw.js`). `url` is a path inside the app opened on tap. */
export type PushPayload = { title: string; body: string; url: string; tag?: string };

export type PushSender = (
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
) => Promise<{ statusCode: number }>;

export type SendReport = { sent: number; removed: number; failed: number };

/** Configured VAPID details, or null when the deployment has no push keys. */
export function vapidConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const cfg = getConfig();
  if (!cfg.vapidPublicKey || !cfg.vapidPrivateKey || !cfg.vapidSubject) return null;
  return { publicKey: cfg.vapidPublicKey, privateKey: cfg.vapidPrivateKey, subject: cfg.vapidSubject };
}

/** The real sender: `web-push` signed with the deployment's VAPID keys. */
export function webPushSender(): PushSender | null {
  const vapid = vapidConfig();
  if (!vapid) return null;
  return (sub, payload) =>
    sendNotification(sub, payload, {
      vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      TTL: 60 * 60,
      urgency: 'normal',
    });
}

const statusOf = (err: unknown): number | null =>
  err && typeof err === 'object' && 'statusCode' in err && typeof (err as { statusCode: unknown }).statusCode === 'number'
    ? (err as { statusCode: number }).statusCode
    : null;

/**
 * Sends one notification to every subscribed device. A device the push service no longer knows (404/410) is
 * removed; any other failure only counts against it, so a flaky network does not unsubscribe anyone.
 */
export async function sendToAll(db: DbOrTx, payload: PushPayload, send: PushSender, now: Date = new Date()): Promise<SendReport> {
  const subs: PushSubscriptionRow[] = await db.select().from(pushSubscriptions);
  const report: SendReport = { sent: 0, removed: 0, failed: 0 };
  const body = JSON.stringify(payload);
  for (const s of subs) {
    try {
      await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
      await db.update(pushSubscriptions).set({ lastSuccessAt: now, failedCount: 0 }).where(eq(pushSubscriptions.id, s.id));
      report.sent += 1;
    } catch (err) {
      const status = statusOf(err);
      if (status === 404 || status === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        report.removed += 1;
      } else {
        await db.update(pushSubscriptions).set({ failedCount: sql`${pushSubscriptions.failedCount} + 1` }).where(eq(pushSubscriptions.id, s.id));
        report.failed += 1;
        // Status only: the endpoint is a capability URL and stays out of logs.
        console.warn('push failed', { status });
      }
    }
  }
  return report;
}
