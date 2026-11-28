'use server';

import { getDb } from '@/db/client';
import { requireOwner } from '@/server/auth';
import { sendToAll, vapidConfig, webPushSender, type SendReport } from '@/server/push/send';
import { listDevices, removeSubscription, saveSubscription, type DeviceView } from '@/server/push/subscriptions';
import { runAction, type ActionResult } from './result';

export type PushStatus = { publicKey: string | null; devices: DeviceView[] };

/** For the Settings dialog: whether push is configured on the server, and the devices that receive it. */
export async function getPushStatusAction(): Promise<ActionResult<PushStatus>> {
  await requireOwner();
  try {
    return { ok: true, data: { publicKey: vapidConfig()?.publicKey ?? null, devices: await listDevices(await getDb()) } };
  } catch {
    return { ok: false, error: 'Có lỗi xảy ra, thử lại.' };
  }
}

export async function savePushSubscriptionAction(subscription: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction((db) => saveSubscription(db, subscription), []);
}

export async function removePushDeviceAction(id: string): Promise<ActionResult<undefined>> {
  return runAction(async (db) => {
    await removeSubscription(db, id);
    return undefined;
  }, []);
}

export async function sendTestPushAction(): Promise<ActionResult<SendReport>> {
  const sender = webPushSender();
  if (!sender) {
    await requireOwner();
    return { ok: false, error: 'Máy chủ chưa có khóa thông báo (VAPID).' };
  }
  return runAction(
    (db) => sendToAll(db, { title: 'Jarvis', body: 'Thông báo thử: Jarvis đã gửi được tới thiết bị này.', url: '/chat', tag: 'test' }, sender),
    [],
  );
}
