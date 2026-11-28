'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useEmbedded } from '@/lib/split-view';

/**
 * Inside the Context frame of "Context + Chat", a link to a chat ("Bắt đầu việc 1", "Tạo từ tài liệu") must open
 * in the Chat half, not replace Context in the frame: hand the whole window over to that chat URL.
 */
export function EmbeddedBridge() {
  const pathname = usePathname();
  const embedded = useEmbedded();
  useEffect(() => {
    if (embedded && pathname === '/chat' && window.top) window.top.location.assign(window.location.href);
  }, [embedded, pathname]);
  return null;
}
