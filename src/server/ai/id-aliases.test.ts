import { expect, test } from 'vitest';
import type { WorkspaceState } from './context-builder';
import { aliasWorkspaceState, resolveProposalAliases } from './id-aliases';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

test('aliasWorkspaceState thay mọi UUID nhất quán và không còn chuỗi UUID nào trong JSON gửi AI', () => {
  const areaId = '11111111-1111-4111-8111-111111111111';
  const docId = '22222222-2222-4222-8222-222222222222';
  const topicId = '33333333-3333-4333-8333-333333333333';
  const taskId = '44444444-4444-4444-8444-444444444444';
  const msId = '55555555-5555-4555-8555-555555555555';

  const state: WorkspaceState = {
    now: { date: '2026-11-24', weekday: 'Thứ Ba', weekStart: '2026-11-23', weekEnd: '2026-11-29', timezone: 'Asia/Ho_Chi_Minh' },
    termGoal: null,
    areas: [
      {
        id: areaId, kind: 'academic', name: 'Algebra', aliases: [], status: 'active', priority: 'medium',
        nextAction: null, deadlineDate: null, deadlineDaysLeft: null, updatedAt: '2026-11-24T00:00:00Z',
        daysSinceUpdate: 0, isStale: false, lastOrigin: 'manual',
        counts: { topics: { not_started: 0, familiar: 0, practiced: 0, confident: 1 }, milestones: null, openTasks: 1 },
        openBlockers: [], missing: [],
      },
    ],
    dueTasks: [
      {
        id: taskId, areaId, title: 'Làm bài tập',
        status: 'todo', dueDate: '2026-11-25', deadlineType: 'committed', daysLeft: 1,
      },
    ],
    upcomingAssessments: [],
    staleAreaIds: [areaId],
    details: [
      {
        areaId, name: 'Algebra', kind: 'academic', summary: null, goal: null, startDate: null, deadlineDate: null,
        academic: null, project: null,
        topics: [{ id: topicId, title: 'Ma trận', status: 'confident', evidence: null }],
        assessments: [],
        milestones: [{ id: msId, title: 'M1', status: 'not_started', targetDate: null, acceptanceCriteria: null }],
        blockers: [],
        tasks: [
          {
            id: taskId, title: 'Làm bài tập', status: 'todo', dueDate: '2026-11-25', daysLeft: 1,
            deadlineType: 'committed', estimateMinutes: null, blockedReason: null, milestoneId: msId,
          },
        ],
        notes: [],
        recentLogs: [],
      },
    ],
    documents: [
      {
        documentId: docId, areaId, title: 'Tiến độ ôn tập', docRole: 'context',
        updated_at: '2026-10-01T00:00:00Z', days_since_update: 54, origin: 'migration', possibly_stale: true,
        excerpts: [{ heading_path: ['Tiến độ'], ordinal: 0, text: 'Chưa học' }],
      },
    ],
  };

  const aliased = aliasWorkspaceState(state);
  expect(UUID_RE.test(aliased.json)).toBe(false);
  expect(aliased.state.areas[0].id).toBe('a1');
  expect(aliased.state.details[0].areaId).toBe('a1');
  expect(aliased.state.documents?.[0]).toMatchObject({ documentId: 'd1', areaId: 'a1' });
  expect(aliased.state.details[0].tasks[0]).toMatchObject({ id: 't1', milestoneId: 'm1' });

  const resolved = JSON.parse(
    resolveProposalAliases(
      JSON.stringify({
        summary: 'Cập nhật',
        actions: [
          { type: 'replace_section', documentId: 'd1', heading: 'Tiến độ', markdown: 'Đã học' },
          { type: 'upsert_topic', areaId: 'a1', id: 'tp1', status: 'practiced' },
          { type: 'create_task', areaId: 'a1', title: 'Mới', milestoneId: 'm1' },
          { type: 'update_task', id: '00000000-0000-0000-0000-000000000000', patch: { status: 'done' } },
        ],
      }),
      aliased.aliasToReal,
    ),
  ) as { actions: Record<string, unknown>[] };

  expect(resolved.actions[0].documentId).toBe(docId);
  expect(resolved.actions[1]).toMatchObject({ areaId, id: topicId });
  expect(resolved.actions[2]).toMatchObject({ areaId, milestoneId: msId });
  expect(resolved.actions[3].id).toBe('00000000-0000-0000-0000-000000000000');
  expect(resolveProposalAliases('not-json', aliased.aliasToReal)).toBe('not-json');
});
