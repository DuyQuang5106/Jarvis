import { readFile, writeFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../src/db/schema';

import { buildContext } from '../src/server/ai/context-builder';
import { createFostaProvider } from '../src/server/ai/fosta';
import { createMockProvider } from '../src/server/ai/mock';
import type { StreamRequest } from '../src/server/ai/provider';
import { runChatTurn } from '../src/server/chat/run-turn';
import { createArea } from '../src/server/services/areas';
import { documentService } from '../src/server/services/documents';
import { folderService } from '../src/server/services/folders';
import { topicService } from '../src/server/services/entities';

const REPORT = 'docs/ai-probe-report.md';
const MARKER = '<!-- phase-b-evaluation -->';
const actionMode = process.argv.includes('--json') ? 'json' : 'tools';
const live = process.argv.includes('--live');
const manual = { origin: 'manual' } as const;
const now = new Date('2026-11-24T03:00:00Z');

async function main() {
  const envArg = process.argv.find((arg) => arg.startsWith('--env='));
  if (envArg) process.loadEnvFile(envArg.slice('--env='.length));
  const { AI_BASE_URL: baseUrl, AI_API_KEY: apiKey, AI_MODEL: model } = process.env;
  if (live && (!baseUrl || !apiKey || !model)) throw new Error('Thiếu cấu hình provider cho --live.');
  const provider = live && baseUrl && apiKey && model ? createFostaProvider({ baseUrl, apiKey, model }) : createMockProvider();
  const client = new PGlite();
  try {
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: 'drizzle' });
    const algebra = await createArea(db, { kind: 'academic', name: 'Algebra', status: 'active' }, manual);
    const network = await createArea(db, { kind: 'academic', name: 'Computer Networks', status: 'active' }, manual);
    await topicService.create(db, { areaId: algebra.id, title: 'Nhân ma trận', status: 'confident' }, manual);
    const summary = await documentService.create(db, {
      areaId: algebra.id, title: 'Tiến độ ôn tập', bodyMd: '# Tiến độ\n\nChưa học nhân ma trận.',
    }, { origin: 'migration' }, { now: new Date('2026-10-01T00:00:00Z') });
    const notes = await documentService.create(db, {
      areaId: network.id, title: 'Bài giảng mạng', bodyMd: '# Tiến độ\n\nMa trận kề biểu diễn liên kết.',
      docRole: 'raw',
    }, manual);
    const folder = await folderService.create(db, { areaId: algebra.id, name: 'PRIVATE_PHASE_B', aiExcluded: true }, manual);
    await documentService.create(db, {
      areaId: algebra.id, folderId: folder.id, title: 'PRIVATE_PHASE_B', bodyMd: 'ma trận PRIVATE_PHASE_B',
    }, manual);

    const context = await buildContext(db, { message: 'Ma trận ở những môn nào?', recentUserMessages: [], scope: { mode: 'all' }, now });
    const seen: StreamRequest[] = [];
    async function ask(message: string) {
      let text = '';
      let proposed = false;
      let providerFailed = false;
      for await (const event of runChatTurn({
        db, actionMode, now, dailyCap: 10, signal: AbortSignal.timeout(60_000),
        provider: { stream(request) { seen.push(request); return provider.stream(request); } },
      }, { message, scope: { mode: 'item', areaId: algebra.id } })) {
        if (event.type === 'text') text += event.delta;
        if (event.type === 'proposal') proposed = true;
        if (event.type === 'error') providerFailed = true;
      }
      return { text, proposed, providerFailed };
    }
    const answer = await ask('Tình trạng chương Nhân ma trận của Algebra là gì? Hãy chỉ rõ nếu tài liệu Tiến độ ôn tập mâu thuẫn với topic.');
    const proposal = await ask('Cập nhật tài liệu Tiến độ ôn tập của Algebra. Thay nội dung mục Tiến độ bằng dòng “Đã đọc chương mới.”');
    const [current] = await db.select().from(schema.documents).where(eq(schema.documents.id, summary.id));
    const checks = [
      ['Tài liệu cũ và trạng thái có cấu trúc cùng có trong dữ liệu', context.state.details.some((detail) =>
        detail.topics.some((topic) => topic.status === 'confident')) && context.state.documents?.some((doc) =>
        doc.documentId === summary.id && doc.possibly_stale && doc.origin === 'migration')],
      ['Hai tài liệu cùng heading trỏ đúng hai workspace', [summary.id, notes.id].every((id) => context.refs.some((ref) => ref.documentId === id))],
      ['Payload gửi provider giữ kín thư mục riêng tư', !context.json.includes('PRIVATE_PHASE_B') && !JSON.stringify(seen).includes('PRIVATE_PHASE_B')],
      ['Đề xuất Markdown đi qua engine duyệt và chưa ghi', proposal.proposed && current.revision === summary.revision],
      ...(live ? [
        ['Provider trả lời cả hai yêu cầu', !answer.providerFailed && !proposal.providerFailed],
        ['Câu trả lời nhận ra mâu thuẫn tiến độ', /mâu thuẫn|khác biệt|chưa học|không khớp/i.test(answer.text)],
      ] : []),
    ] as const;
    const old = await readFile(REPORT, 'utf8');
    const heading = '| Hành vi | Kết quả |\n| --- | --- |';
    const table = checks.map(([label, pass]) => '| ' + label + ' | ' + (pass ? 'Đạt' : 'Trượt') + ' |').join('\n');
    const run = '### ' + (live ? 'Provider thật' : 'Mock') + ' · ' + actionMode + '\n\n' + heading + '\n' + table;
    const start = old.indexOf(MARKER);
    const base = (start < 0 ? old : old.slice(0, start)).trimEnd();
    const previous = start < 0 ? '' : old.slice(start).split(/(?=^### )/m).slice(1)
      .filter((section) => !section.startsWith(run.split('\n')[0] + '\n')).map((section) => section.trim()).join('\n\n');
    await writeFile(REPORT, base + '\n\n' + MARKER + '\n\n## Đánh giá Phase B với dữ liệu mẫu\n\n' + [previous, run].filter(Boolean).join('\n\n') + '\n');
    console.log(table);
    if (checks.some(([, pass]) => !pass)) process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Không chạy được đánh giá Phase B.');
  process.exitCode = 1;
});
