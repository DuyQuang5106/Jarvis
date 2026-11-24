import { connection } from 'next/server';
import { getDb } from '@/db/client';
import { DOC_ROLES, type DocRole } from '@/db/enums';
import { withOwner } from '@/server/auth';
import { NotFoundError, ValidationError } from '@/server/errors';
import { ingestUploadedFile } from '@/server/files/ingest';
import { getStorage } from '@/server/storage';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const handler = withOwner(async (req) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: 'Dữ liệu tải lên không hợp lệ.' }, { status: 400 });
  }

  const file = form.get('file');
  const areaId = String(form.get('areaId') ?? '').trim();
  const folderRaw = form.get('folderId');
  const folderId = folderRaw ? String(folderRaw).trim() : null;
  const roleRaw = form.get('docRole');
  const docRole = roleRaw ? (String(roleRaw).trim() as DocRole) : undefined;
  const titleRaw = form.get('title');
  const titleOverride = titleRaw ? String(titleRaw).trim() : undefined;

  if (!UUID.test(areaId)) {
    return Response.json({ error: 'Mục không hợp lệ.' }, { status: 400 });
  }
  if (folderId && !UUID.test(folderId)) {
    return Response.json({ error: 'Thư mục không hợp lệ.' }, { status: 400 });
  }
  if (docRole && !(DOC_ROLES as readonly string[]).includes(docRole)) {
    return Response.json({ error: 'Vai trò tài liệu không hợp lệ.' }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return Response.json({ error: 'Thiếu tệp tải lên.' }, { status: 400 });
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await ingestUploadedFile(
      await getDb(),
      getStorage(),
      {
        areaId,
        folderId,
        docRole,
        filename: file.name || 'document.txt',
        titleOverride,
        mimeType: file.type,
        bytes,
      },
      { origin: 'manual' },
    );
    return Response.json({ document: doc }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) return Response.json({ error: err.message }, { status: 400 });
    if (err instanceof NotFoundError) return Response.json({ error: err.message }, { status: 404 });
    throw err;
  }
});

export async function POST(req: Request) {
  await connection();
  return handler(req, undefined);
}
