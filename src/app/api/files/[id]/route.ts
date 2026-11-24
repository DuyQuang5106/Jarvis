import { connection } from 'next/server';
import { getDb } from '@/db/client';
import { withOwner } from '@/server/auth';
import { isInlinePreviewable } from '@/server/files/policy';
import { getDocument } from '@/server/queries/documents';
import { getStorage } from '@/server/storage';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function downloadFilename(title: string, ext: string): string {
  const clean = title.replace(/[\r\n"/\\]+/g, ' ').trim() || 'file';
  return clean.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? clean : `${clean}.${ext}`;
}

const handler = withOwner(async (req, _owner, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!UUID.test(id)) {
    return Response.json({ error: 'Tài liệu không hợp lệ.' }, { status: 400 });
  }

  const doc = await getDocument(await getDb(), id);
  if (!doc) {
    return Response.json({ error: 'Không tìm thấy tài liệu.' }, { status: 404 });
  }

  const reqUrl = new URL(req.url);
  const wantInline = reqUrl.searchParams.get('disposition') === 'inline' && isInlinePreviewable(doc.fileExt);
  const disposition = wantInline
    ? 'inline'
    : `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename(doc.title, doc.fileExt))}`;

  const headers = new Headers({
    'Content-Type': doc.mimeType,
    'Content-Disposition': disposition,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });
  if (!wantInline) {
    headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
  }

  if (!doc.storageKey) {
    return new Response(doc.bodyMd, { status: 200, headers });
  }

  const stored = await getStorage().get(doc.storageKey);
  if (!stored) {
    return Response.json({ error: 'Không tìm thấy dữ liệu tệp.' }, { status: 404 });
  }
  const body = new Uint8Array(stored.bytes);
  return new Response(body, { status: 200, headers });
});

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  return handler(req, ctx);
}
