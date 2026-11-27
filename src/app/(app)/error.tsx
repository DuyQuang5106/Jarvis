'use client';

import { Button } from '@/components/ui/button';

/** A page that failed on the server: say so in Vietnamese and let the owner retry without reloading the app. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && 'digest' in error ? String((error as { digest?: unknown }).digest ?? '') : '';
  return (
    <div role="alert" className="mx-auto flex max-w-sm flex-col items-start gap-3 py-16">
      <h2 className="text-lg font-semibold">Trang chưa tải được</h2>
      <p className="text-sm text-muted-foreground">Máy chủ gặp lỗi khi tải trang này. Dữ liệu của bạn không bị ảnh hưởng.</p>
      <Button onClick={() => retry()}>Thử lại</Button>
      {digest && <p className="font-mono text-xs text-muted-foreground">Mã lỗi {digest}</p>}
    </div>
  );
}
