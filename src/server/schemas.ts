import { z } from 'zod';
import {
  BLOCKER_STATUSES,
  DEADLINE_TYPES,
  INBOX_STATUSES,
  MILESTONE_STATUSES,
  TASK_STATUSES,
  TOPIC_STATUSES,
} from '@/db/enums';
import { isValidDateStr } from '@/lib/dates';

// Error messages are Vietnamese at the source and name the field, so ValidationError can
// simply surface the first issue's message.

const dateStr = (label: string) =>
  z
    .string({ error: `${label} phải là chuỗi ngày YYYY-MM-DD.` })
    .refine(isValidDateStr, { error: `${label} không hợp lệ, cần định dạng YYYY-MM-DD.` });

const uuid = (label: string) => z.uuid({ error: `${label} không hợp lệ.` });

const choice = <const T extends readonly [string, ...string[]]>(label: string, values: T) =>
  z.enum(values, { error: `${label} không hợp lệ.` });

const text = (label: string) => z.string({ error: `${label} phải là chuỗi.` });

const num = (label: string) => z.number({ error: `${label} phải là một số.` });

const sortOrder = z
  .number({ error: 'Thứ tự phải là một số.' })
  .int({ error: 'Thứ tự phải là số nguyên.' })
  .optional();

export const DateStr = dateStr('Ngày');

export const Name = z
  .string({ error: 'Tên phải là chuỗi.' })
  .trim()
  .min(1, { error: 'Tên không được để trống.' })
  .max(200, { error: 'Tên tối đa 200 ký tự.' });

export const Alias = z
  .string({ error: 'Tên gọi khác phải là chuỗi.' })
  .trim()
  .min(2, { error: 'Tên gọi khác cần ít nhất 2 ký tự.' })
  .max(50, { error: 'Tên gọi khác tối đa 50 ký tự.' });

const areaId = uuid('Mục');

// ---- tasks
export const CreateTaskInput = z.object({
  areaId,
  title: Name,
  status: choice('Trạng thái công việc', TASK_STATUSES).optional(),
  dueDate: dateStr('Hạn chót').nullable().optional(),
  dueTime: z
    .string({ error: 'Giờ hạn phải là chuỗi HH:MM.' })
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Giờ hạn không hợp lệ, cần định dạng HH:MM.' })
    .nullable()
    .optional(),
  deadlineType: choice('Loại hạn chót', DEADLINE_TYPES).optional(),
  estimateMinutes: z
    .number({ error: 'Ước lượng phải là một số.' })
    .int({ error: 'Ước lượng phải là số nguyên.' })
    .min(1, { error: 'Ước lượng tối thiểu 1 phút.' })
    .max(10000, { error: 'Ước lượng tối đa 10000 phút.' })
    .nullable()
    .optional(),
  milestoneId: uuid('Milestone').nullable().optional(),
  blockedReason: text('Lý do bị chặn').nullable().optional(),
  sortOrder,
});
export const UpdateTaskInput = CreateTaskInput.omit({ areaId: true }).partial();

// ---- topics
export const CreateTopicInput = z.object({
  areaId,
  title: Name,
  status: choice('Trạng thái chủ đề', TOPIC_STATUSES).optional(),
  evidence: text('Bằng chứng').nullable().optional(),
  sortOrder,
});
export const UpdateTopicInput = CreateTopicInput.omit({ areaId: true }).partial();

// ---- assessments
export const CreateAssessmentInput = z.object({
  areaId,
  title: Name,
  dueDate: dateStr('Ngày đánh giá').nullable().optional(),
  weight: num('Trọng số')
    .min(0, { error: 'Trọng số tối thiểu 0.' })
    .max(100, { error: 'Trọng số tối đa 100.' })
    .nullable()
    .optional(),
  score: num('Điểm').min(0, { error: 'Điểm không được âm.' }).nullable().optional(),
  maxScore: num('Điểm tối đa').gt(0, { error: 'Điểm tối đa phải lớn hơn 0.' }).nullable().optional(),
});
export const UpdateAssessmentInput = CreateAssessmentInput.omit({ areaId: true }).partial();

// ---- milestones
export const CreateMilestoneInput = z.object({
  areaId,
  title: Name,
  acceptanceCriteria: text('Tiêu chí nghiệm thu').nullable().optional(),
  targetDate: dateStr('Ngày mục tiêu').nullable().optional(),
  status: choice('Trạng thái milestone', MILESTONE_STATUSES).optional(),
});
export const UpdateMilestoneInput = CreateMilestoneInput.omit({ areaId: true }).partial();

// ---- blockers
export const CreateBlockerInput = z.object({
  areaId,
  title: Name,
  lastAttempt: text('Lần thử gần nhất').nullable().optional(),
  nextAction: text('Bước tiếp theo').nullable().optional(),
  externalDependency: text('Phụ thuộc bên ngoài').nullable().optional(),
});
export const UpdateBlockerInput = CreateBlockerInput.omit({ areaId: true })
  .extend({ status: choice('Trạng thái blocker', BLOCKER_STATUSES) })
  .partial();

// ---- notes
export const CreateNoteInput = z.object({
  areaId: uuid('Mục').nullable().optional(),
  text: z
    .string({ error: 'Nội dung ghi chú phải là chuỗi.' })
    .min(1, { error: 'Nội dung ghi chú không được để trống.' })
    .max(20000, { error: 'Nội dung ghi chú tối đa 20000 ký tự.' }),
  inboxStatus: choice('Trạng thái hộp thư', INBOX_STATUSES).optional(),
  aiExcluded: z.boolean({ error: 'Loại khỏi AI phải là đúng/sai.' }).optional(),
});
export const UpdateNoteInput = CreateNoteInput.partial();

export type CreateTaskInput = z.infer<typeof CreateTaskInput>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskInput>;
export type CreateTopicInput = z.infer<typeof CreateTopicInput>;
export type UpdateTopicInput = z.infer<typeof UpdateTopicInput>;
export type CreateAssessmentInput = z.infer<typeof CreateAssessmentInput>;
export type UpdateAssessmentInput = z.infer<typeof UpdateAssessmentInput>;
export type CreateMilestoneInput = z.infer<typeof CreateMilestoneInput>;
export type UpdateMilestoneInput = z.infer<typeof UpdateMilestoneInput>;
export type CreateBlockerInput = z.infer<typeof CreateBlockerInput>;
export type UpdateBlockerInput = z.infer<typeof UpdateBlockerInput>;
export type CreateNoteInput = z.infer<typeof CreateNoteInput>;
export type UpdateNoteInput = z.infer<typeof UpdateNoteInput>;
