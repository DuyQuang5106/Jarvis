'use client';

import './globals.css';

/** Last resort when the root layout itself fails; it replaces the whole document, so it brings its own html. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && 'digest' in error ? String((error as { digest?: unknown }).digest ?? '') : '';
  return (
    <html lang="vi" className="dark">
      <body className="bg-background text-foreground">
        <div role="alert" className="mx-auto flex max-w-sm flex-col items-start gap-3 px-4 py-16">
          <h2 className="text-lg font-semibold">Jarvis chưa tải được</h2>
          <p className="text-sm text-muted-foreground">Máy chủ gặp lỗi. Dữ liệu của bạn không bị ảnh hưởng.</p>
          <button type="button" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={() => retry()}>
            Thử lại
          </button>
          {digest && <p className="font-mono text-xs text-muted-foreground">Mã lỗi {digest}</p>}
        </div>
      </body>
    </html>
  );
}
