'use client';

import { BellRing, Trash2 } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { getPushStatusAction, removePushDeviceAction, savePushSubscriptionAction, sendTestPushAction, type PushStatus } from '@/app/(app)/_actions/push';
import { Button } from '@/components/ui/button';
import { formatDateTimeVi } from '@/lib/dates';

/** VAPID public keys travel as URL-safe base64; `pushManager.subscribe` wants the raw bytes. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type Support = 'ok' | 'needs-install' | 'unsupported';

/** iOS only delivers Web Push to an app added to the Home Screen (iOS 16.4+). */
function detectSupport(): Support {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window) || !window.isSecureContext) return 'unsupported';
  return 'ok';
}

/**
 * "Thông báo" in Settings: turn notifications on for this device (the permission prompt must come from a tap),
 * send a test, and see or remove the devices that receive them.
 */
export function NotificationSettings() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [support, setSupport] = useState<Support | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  async function refresh() {
    const res = await getPushStatusAction();
    if (res.ok) setStatus(res.data);
    else setMessage({ kind: 'error', text: res.error });
  }

  useEffect(() => {
    // Browser capabilities exist only after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupport(detectSupport());
    void refresh();
  }, []);

  function enable() {
    setMessage(null);
    startTransition(async () => {
      if (!status?.publicKey) return;
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setMessage({ kind: 'error', text: 'Bạn chưa cho phép thông báo. Bật lại trong Cài đặt của máy → Thông báo → Jarvis.' });
          return;
        }
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(status.publicKey) }));
        const res = await savePushSubscriptionAction({ ...sub.toJSON(), userAgent: navigator.userAgent });
        if (!res.ok) return setMessage({ kind: 'error', text: res.error });
        setMessage({ kind: 'ok', text: 'Đã bật thông báo cho thiết bị này.' });
        await refresh();
      } catch {
        setMessage({ kind: 'error', text: 'Không bật được thông báo trên thiết bị này.' });
      }
    });
  }

  function test() {
    setMessage(null);
    startTransition(async () => {
      const res = await sendTestPushAction();
      if (!res.ok) return setMessage({ kind: 'error', text: res.error });
      const { sent, removed, failed } = res.data;
      setMessage(
        sent > 0
          ? { kind: 'ok', text: `Đã gửi tới ${sent} thiết bị${failed ? `, ${failed} thiết bị lỗi` : ''}${removed ? `, gỡ ${removed} thiết bị không còn dùng` : ''}.` }
          : { kind: 'error', text: 'Chưa gửi được tới thiết bị nào.' },
      );
      await refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await removePushDeviceAction(id);
      if (!res.ok) setMessage({ kind: 'error', text: res.error });
      await refresh();
    });
  }

  return (
    <section aria-label="Thông báo" className="space-y-3 rounded-lg border p-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <BellRing className="size-4" aria-hidden />
        Thông báo
      </h3>
      {status && !status.publicKey && (
        <p className="text-sm text-muted-foreground">Máy chủ chưa có khóa thông báo. Thêm VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT theo docs/deploy.md.</p>
      )}
      {support === 'needs-install' && (
        <p className="text-sm text-muted-foreground">Trên iPhone, thông báo chỉ chạy khi mở Jarvis từ Màn hình chính: trong Safari bấm Chia sẻ → Thêm vào Màn hình chính, rồi mở từ biểu tượng đó.</p>
      )}
      {support === 'unsupported' && <p className="text-sm text-muted-foreground">Trình duyệt này không nhận thông báo đẩy.</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-11" onClick={enable} disabled={pending || support !== 'ok' || !status?.publicKey}>
          Bật thông báo trên thiết bị này
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={test} disabled={pending || !status?.publicKey || (status?.devices.length ?? 0) === 0}>
          Gửi thử
        </Button>
      </div>
      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
          {message.text}
        </p>
      )}
      {status && status.devices.length > 0 && (
        <ul aria-label="Thiết bị nhận thông báo" className="space-y-1.5">
          {status.devices.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1">
                {d.label}
                <span className="block text-xs text-muted-foreground">
                  {d.lastSuccessAt ? `Nhận lần cuối ${formatDateTimeVi(d.lastSuccessAt)}` : `Thêm ${formatDateTimeVi(d.createdAt)}`}
                  {d.failedCount > 0 ? ` · lỗi ${d.failedCount} lần` : ''}
                </span>
              </span>
              <Button type="button" variant="ghost" size="icon" className="size-11" onClick={() => remove(d.id)} disabled={pending} aria-label={`Gỡ ${d.label}`}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
