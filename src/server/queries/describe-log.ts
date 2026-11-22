import type { ActivityLogRow } from '@/db/schema';
import { APP_TZ, formatDateFullVi, formatDateTimeVi } from '@/lib/dates';
import {
  AREA_STATUS_LABEL,
  BLOCKER_STATUS_LABEL,
  DEADLINE_TYPE_LABEL,
  INBOX_STATUS_LABEL,
  MILESTONE_STATUS_LABEL,
  PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  TOPIC_STATUS_LABEL,
} from '@/lib/labels';

export type LogChange = { field: string; before: string | null; after: string | null };
export type DescribedLog = { title: string; changes: LogChange[] };

/** Fields that never appear in a diff. */
const EXCLUDED = new Set(['updatedAt', 'createdAt', 'id', 'areaId', 'sortOrder']);

export const FIELD_LABEL: Record<string, string> = {
  name: 'Tên',
  title: 'Tiêu đề',
  kind: 'Loại',
  aliases: 'Tên gọi khác',
  summary: 'Tóm tắt',
  goal: 'Mục tiêu',
  status: 'Trạng thái',
  priority: 'Ưu tiên',
  startDate: 'Bắt đầu',
  deadlineDate: 'Hạn',
  nextAction: 'Việc tiếp theo',
  aiExcluded: 'Không gửi cho AI',
  archivedAt: 'Lưu trữ lúc',
  term: 'Học kỳ',
  credits: 'Tín chỉ',
  targetGrade: 'Điểm mục tiêu',
  gradingScheme: 'Cách tính điểm',
  examFormat: 'Hình thức thi',
  courseOutline: 'Đề cương',
  role: 'Vai trò',
  collaborators: 'Cộng sự',
  scope: 'Phạm vi',
  cadence: 'Nhịp làm việc',
  evidence: 'Bằng chứng',
  acceptanceCriteria: 'Tiêu chí hoàn thành',
  targetDate: 'Ngày mục tiêu',
  lastAttempt: 'Lần thử gần nhất',
  externalDependency: 'Phụ thuộc bên ngoài',
  resolvedAt: 'Gỡ lúc',
  milestoneId: 'Milestone',
  dueDate: 'Hạn',
  dueTime: 'Giờ hạn',
  deadlineType: 'Loại hạn',
  estimateMinutes: 'Ước tính (phút)',
  blockedReason: 'Lý do bị chặn',
  weight: 'Trọng số',
  score: 'Điểm',
  maxScore: 'Điểm tối đa',
  text: 'Nội dung',
  inboxStatus: 'Hộp thư',
};

const KIND_LABEL: Record<string, string> = { academic: 'Academic', project: 'Project' };

/** `status` is shared by several entity types; their label sets agree on every shared value. */
const STATUS_LABEL: Record<string, string> = {
  ...AREA_STATUS_LABEL,
  ...TOPIC_STATUS_LABEL,
  ...TASK_STATUS_LABEL,
  ...MILESTONE_STATUS_LABEL,
  ...BLOCKER_STATUS_LABEL,
};

const ENUM_LABEL: Record<string, Record<string, string>> = {
  status: STATUS_LABEL,
  priority: PRIORITY_LABEL,
  deadlineType: DEADLINE_TYPE_LABEL,
  inboxStatus: INBOX_STATUS_LABEL,
  kind: KIND_LABEL,
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/;

export function fieldLabel(field: string): string {
  return FIELD_LABEL[field] ?? field;
}

/** Display text for a field value: enums as labels, booleans as Có/Không, dates as dd/MM/yyyy; null stays null. */
export function formatFieldValue(field: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (Array.isArray(value)) return value.length === 0 ? null : value.map((v) => formatFieldValue(field, v) ?? '').join(', ');
  if (typeof value === 'string') {
    if (value === '') return null;
    const label = ENUM_LABEL[field]?.[value];
    if (label) return label;
    if (DATE_ONLY.test(value)) return formatDateFullVi(value);
    if (TIMESTAMP.test(value)) return `${formatDateTimeVi(value, APP_TZ)}`;
    return value;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

type Flat = Record<string, unknown>;

/** Area logs snapshot `{...area, details: {...}}`; the nested details are lifted to the top level. */
function flatten(json: unknown): Flat {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return {};
  const { details, ...rest } = json as Flat;
  const out: Flat = { ...rest };
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    for (const [k, v] of Object.entries(details as Flat)) if (!(k in out)) out[k] = v;
  }
  return out;
}

const norm = (v: unknown) => (v === undefined || v === '' || (Array.isArray(v) && v.length === 0) ? null : v);

const NAME_MAX = 40;

/** The quoted part of a title: the record's title/name, or the first 40 characters of a note. */
export function entityName(log: Pick<ActivityLogRow, 'beforeJson' | 'afterJson'>): string | null {
  for (const json of [log.afterJson, log.beforeJson]) {
    const f = flatten(json);
    for (const key of ['title', 'name']) if (typeof f[key] === 'string' && f[key]) return f[key] as string;
    if (typeof f.text === 'string' && f.text) {
      return f.text.length > NAME_MAX ? `${f.text.slice(0, NAME_MAX)}…` : f.text;
    }
  }
  return null;
}

const NOUN: Record<string, string> = {
  area: 'mục',
  task: 'task',
  topic: 'topic',
  assessment: 'assessment',
  milestone: 'milestone',
  blocker: 'blocker',
  note: 'ghi chú',
};

const VERB: Record<string, string> = { create: 'Tạo', update: 'Sửa', delete: 'Xóa' };

export function describeLog(log: ActivityLogRow): DescribedLog {
  const before = flatten(log.beforeJson);
  const after = flatten(log.afterJson);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !EXCLUDED.has(k));
  const changes: LogChange[] = [];
  for (const k of keys) {
    const b = norm(before[k]);
    const a = norm(after[k]);
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    changes.push({ field: fieldLabel(k), before: formatFieldValue(k, b), after: formatFieldValue(k, a) });
  }

  if (log.action === 'progress') return { title: 'Ghi nhận tiến độ', changes };
  if (log.action === 'archive') return { title: 'Lưu trữ mục', changes };
  const noun = NOUN[log.entityType] ?? log.entityType;
  const name = entityName(log);
  return { title: `${VERB[log.action] ?? log.action} ${noun}${name ? ` “${name}”` : ''}`, changes };
}
