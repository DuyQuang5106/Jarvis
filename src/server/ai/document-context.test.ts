import { expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeArea } from '@/db/test-helpers';
import { createTestDb } from '@/db/testing';
import { documents } from '@/db/schema';
import { runChatTurn, HIDDEN_HISTORY, type TurnEvent } from '../chat/run-turn';
import { appendMessage, createConversation } from '../services/conversations';
import { documentService } from '../services/documents';
import { folderService } from '../services/folders';
import { buildContext, serializeState } from './context-builder';
import { searchContext, splitDocument } from './document-context';
import type { AiProvider, StreamRequest } from './provider';

const manual = { origin: 'manual' } as const;
const now = new Date('2026-11-24T03:00:00Z');

test('tìm FTS không dấu qua các workspace, theo đoạn mới nhất và văn bản PDF', async () => {
  const db = await createTestDb();
  const math = await makeArea(db, { name: 'Algebra' });
  const networks = await makeArea(db, { name: 'Computer Networks' });
  const mathDoc = await documentService.create(db, {
    areaId: math.id, title: 'Bài giảng', bodyMd: '# Cơ sở\n\n## Nhân ma trận\n\nCông thức ma trận.', docRole: 'context',
  }, { origin: 'migration' }, { now: new Date('2026-10-01T00:00:00Z') });
  const pdf = await documentService.create(db, {
    areaId: networks.id, title: 'Bài giảng', bodyMd: '', fileExt: 'pdf', docRole: 'raw',
    extractedText: 'Ma trận kề của đồ thị.\n\nPhần này nói về định tuyến.',
  }, manual);
  const hits = await searchContext(db, 'ma tran');
  expect(hits.map(({ documentId }) => documentId)).toEqual(expect.arrayContaining([mathDoc.id, pdf.id]));
  expect(hits.find((hit) => hit.documentId === mathDoc.id)).toMatchObject({
    heading_path: ['Cơ sở', 'Nhân ma trận'], origin: 'migration',
  });
  expect((await searchContext(db, 'ma tran', { areaIds: [math.id] })).every((hit) => hit.documentId === mathDoc.id)).toBe(true);
  const scoped = await buildContext(db, { message: 'Học gì?', recentUserMessages: [], scope: { mode: 'item', areaId: math.id }, now });
  expect(scoped.state.documents).toEqual([expect.objectContaining({
    documentId: mathDoc.id, possibly_stale: true, days_since_update: 54, content: '# Cơ sở\n\n## Nhân ma trận\n\nCông thức ma trận.',
  })]);
  expect(scoped.state.documents?.[0]).not.toHaveProperty('excerpts');
  await documentService.updateBody(db, mathDoc.id, '# Định thức\n\nKhai triển Laplace.', mathDoc.revision, manual);
  expect(await searchContext(db, 'ma tran', { areaIds: [math.id] })).toEqual([]);
  expect(await searchContext(db, 'dinh thuc', { areaIds: [math.id] })).toEqual(expect.arrayContaining([expect.objectContaining({ documentId: mathDoc.id, text: 'Khai triển Laplace.' })]));
});

test('tôn trọng ngân sách đã serialize và giữ đủ dữ liệu tầng 1', async () => {
  const db = await createTestDb();
  const area = await makeArea(db, { name: 'Algebra' });
  await documentService.create(db, {
    areaId: area.id, title: 'Tóm tắt mâu thuẫn',
    bodyMd: Array.from({ length: 30 }, (_, index) => '## Chương ' + index + '\n' + '<matrix '.repeat(96)).join('\n\n'),
  }, manual);
  const input = { message: 'matrix', recentUserMessages: [], scope: { mode: 'item' as const, areaId: area.id }, now };
  const limited = await buildContext(db, { ...input, maxChars: 3200 });
  const full = await buildContext(db, input);
  expect(limited.state.areas).toEqual(full.state.areas);
  expect(limited.json.length).toBeLessThanOrEqual(3200);
  const tierOne = serializeState({ ...limited.state, details: [], documents: undefined }).length;
  expect(JSON.stringify(limited.state.documents ?? []).replace(/</g, '\\u003c').length).toBeLessThanOrEqual(Math.floor((3200 - tierOne) * 0.7));
  expect(limited.state.documents?.[0]).toMatchObject({ title: 'Tóm tắt mâu thuẫn', omitted: true });
  expect(full.state.documents?.[0].content).toContain('## Chương 29');
  expect(limited.truncated).toBe(true);
  expect(full.state.areas[0].status).toBe('active');
  expect(full.state.documents?.[0].title).toBe('Tóm tắt mâu thuẫn');
});

test('lọc toàn bộ payload provider khi tài liệu, workspace, hướng dẫn hoặc tổ tiên bị ẩn', async () => {
  const db = await createTestDb();
  const open = await makeArea(db, { name: 'Algebra' });
  const hidden = await makeArea(db, { name: 'Kho tư', aiExcluded: true });
  const root = await folderService.create(db, { areaId: open.id, name: 'THU_MUC_RIENG', aiExcluded: true }, manual);
  const branch = await folderService.create(db, { areaId: open.id, name: 'THU_MUC_CON', parentId: root.id }, manual);
  const deep = await folderService.create(db, { areaId: open.id, name: 'THU_MUC_SAU', parentId: branch.id }, manual);
  const direct = await documentService.create(db, { areaId: open.id, title: 'RIENG_TRUC_TIEP', bodyMd: 'matrix trực tiếp' }, manual);
  await documentService.setAiExcluded(db, direct.id, true, manual);
  await documentService.create(db, { areaId: open.id, title: 'RIENG_TO_TIEN', bodyMd: 'matrix tổ tiên', folderId: deep.id }, manual);
  await documentService.create(db, { areaId: hidden.id, title: 'RIENG_WORKSPACE', bodyMd: 'matrix workspace' }, manual);
  const instruction = await documentService.create(db, { areaId: open.id, title: 'RIENG_HUONG_DAN', bodyMd: 'matrix hướng dẫn' }, manual);
  await documentService.setRole(db, instruction.id, 'instruction', manual);
  const visible = await documentService.create(db, { areaId: open.id, title: 'CÔNG KHAI', bodyMd: 'matrix nội dung công khai' }, manual);
  const conv = await createConversation(db, 'Algebra');
  await appendMessage(db, conv.id, 'assistant', 'RIENG_LICH_SU', { contextRefs: [{ areaId: open.id, documentId: direct.id }] });
  await appendMessage(db, conv.id, 'assistant', 'VISIBLE_HISTORY', { contextRefs: [{ areaId: open.id, documentId: visible.id }] });
  const seen: StreamRequest[] = [];
  const provider: AiProvider = { async *stream(request) { seen.push(request); yield { type: 'text', delta: 'Đã đọc dữ liệu' }; } };
  const events: TurnEvent[] = [];
  for await (const event of runChatTurn({ db, provider, actionMode: 'tools', dailyCap: 10, now }, {
    conversationId: conv.id, message: 'Algebra có gì về matrix?', scope: { mode: 'all' },
  })) events.push(event);
  expect(events.at(-1)).toMatchObject({ type: 'done' });
  const payload = JSON.stringify(seen[0]);
  expect(payload).not.toMatch(/RIENG_|THU_MUC_|matrix trực tiếp|matrix tổ tiên|matrix workspace|matrix hướng dẫn/);
  expect(payload).toContain(HIDDEN_HISTORY);
  expect(payload).toContain('VISIBLE_HISTORY');
  expect(payload).toContain('matrix nội dung công khai');
  expect((await searchContext(db, 'matrix')).map((hit) => hit.documentId)).toEqual([visible.id]);
  await db.update(documents).set({ deletedAt: now }).where(eq(documents.id, visible.id));
  expect(await searchContext(db, 'matrix')).toEqual([]);
});

test('chunk giữ đường dẫn và bỏ qua heading giả trong code block', () => {
  const result = splitDocument('# Thật\n\n```md\n# Giả\n```\n\n## Con\n\nđoạn cuối', true);
  expect(result.at(-1)).toMatchObject({ heading_path: ['Thật', 'Con'], text: 'đoạn cuối' });
  expect(result.some((chunk) => chunk.heading_path.includes('Giả'))).toBe(false);
});

test('splitDocument bỏ frontmatter YAML trước khi chia đoạn', () => {
  const result = splitDocument('---\nentity: HUST/MI1144E/Algebra\ndocument_type: state_snapshot\nstatus: PARTIAL\n---\n\n# 04 — STATE\n\nĐang học đến đầu Chương 5', true);
  expect(result[0].text.startsWith('# 04 — STATE')).toBe(true);
  expect(result[0].heading_path).toEqual(['04 — STATE']);
  expect(result.some((chunk) => chunk.text.includes('document_type:') || chunk.heading_path.some((h) => h.includes('status')))).toBe(false);
});

test('câu hỏi tổng thể: tài liệu trạng thái bị ẩn không được chọn thay tài liệu nhìn thấy', async () => {
  const db = await createTestDb();
  const open = await makeArea(db, { name: 'Algebra' });
  const folder = await folderService.create(db, { areaId: open.id, name: 'Kín', aiExcluded: true }, manual);
  const state = '---\ndocument_type: state_snapshot\n---\n# STATE\n\n';
  const direct = await documentService.create(db, { areaId: open.id, title: '04_STATE.md', bodyMd: state + 'RIENG_TRUC_TIEP' }, manual);
  await documentService.setAiExcluded(db, direct.id, true, manual);
  await documentService.create(db, { areaId: open.id, title: '04_STATE_FOLDER.md', bodyMd: state + 'RIENG_THU_MUC', folderId: folder.id }, manual);
  const instruction = await documentService.create(db, { areaId: open.id, title: 'STATE_GUIDE.md', bodyMd: state + 'RIENG_HUONG_DAN' }, manual);
  await documentService.setRole(db, instruction.id, 'instruction', manual);
  await documentService.create(db, { areaId: open.id, title: '01_CONTEXT.md', bodyMd: '# Bối cảnh\n\nCÔNG_KHAI' }, manual);
  const ctx = await buildContext(db, { message: 'Hôm nay nên làm gì?', recentUserMessages: [], scope: { mode: 'auto' }, now });
  expect(ctx.state.documents?.map((doc) => doc.title)).toEqual(['01_CONTEXT.md']);
  expect(ctx.json).toContain('CÔNG_KHAI');
  expect(ctx.json).not.toMatch(/RIENG_/);
});

test('môn được nhắc trong tin hiện tại đọc đủ trước môn chỉ có trong tin cũ', async () => {
  const db = await createTestDb();
  const networks = await makeArea(db, { name: 'Computer Networks' });
  const comm = await makeArea(db, { name: 'Introduction to Communications Engineering' });
  const big = (label: string) => `# ${label}\n\n${'Nội dung dài. '.repeat(1500)}`;
  for (const title of ['04_STATE.md', '05_LOG.md', '07_MISSING_INFO.md']) {
    await documentService.create(db, { areaId: networks.id, title, bodyMd: big(`CN ${title}`), docRole: 'context' }, manual);
    await documentService.create(db, { areaId: comm.id, title, bodyMd: big(`COMM ${title}`), docRole: 'context' }, manual);
  }
  const ctx = await buildContext(db, {
    message: 'tiếp tục với môn introduction to communications engineering, nói cho tôi bạn biết gì',
    recentUserMessages: ['Computer Networks: đã học xong chương 4'],
    scope: { mode: 'auto' },
    now,
    maxChars: 120_000,
  });
  const commDocs = (ctx.state.documents ?? []).filter((d) => d.areaId === comm.id);
  expect(commDocs.map((d) => d.title).sort()).toEqual(['04_STATE.md', '05_LOG.md', '07_MISSING_INFO.md']);
  expect(commDocs.every((d) => d.content !== undefined && !d.omitted && !d.content.endsWith('…'))).toBe(true);
});
