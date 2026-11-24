import { z } from 'zod';
import {
  AREA_KINDS,
  AREA_STATUSES,
  BLOCKER_STATUSES,
  DEADLINE_TYPES,
  DOC_ROLES,
  INBOX_STATUSES,
  MILESTONE_STATUSES,
  PRIORITIES,
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

// ---- areas
const nullableText = (label: string) => text(label).nullable().optional();

const AcademicDetailsInput = z.object({
  term: nullableText('Học kỳ'),
  credits: z
    .number({ error: 'Số tín chỉ phải là một số.' })
    .int({ error: 'Số tín chỉ phải là số nguyên.' })
    .min(0, { error: 'Số tín chỉ tối thiểu 0.' })
    .max(30, { error: 'Số tín chỉ tối đa 30.' })
    .nullable()
    .optional(),
  targetGrade: nullableText('Điểm mục tiêu'),
  gradingScheme: nullableText('Cách tính điểm'),
  examFormat: nullableText('Hình thức thi'),
  courseOutline: nullableText('Đề cương môn học'),
});

const ProjectDetailsInput = z.object({
  role: nullableText('Vai trò'),
  collaborators: nullableText('Người cộng tác'),
  scope: nullableText('Phạm vi'),
  cadence: nullableText('Nhịp làm việc'),
});

const Aliases = z
  .array(Alias, { error: 'Tên gọi khác phải là danh sách.' })
  .max(10, { error: 'Tối đa 10 tên gọi khác.' })
  .refine((list) => new Set(list.map((a) => a.toLowerCase())).size === list.length, {
    error: 'Tên gọi khác bị trùng nhau.',
  });

export const CreateAreaInput = z.object({
  kind: choice('Loại mục', AREA_KINDS),
  name: Name,
  aliases: Aliases.optional(),
  summary: nullableText('Tóm tắt'),
  goal: nullableText('Mục tiêu'),
  status: choice('Trạng thái mục', AREA_STATUSES).optional(),
  priority: choice('Mức ưu tiên', PRIORITIES).optional(),
  startDate: dateStr('Ngày bắt đầu').nullable().optional(),
  deadlineDate: dateStr('Ngày hạn chót').nullable().optional(),
  nextAction: nullableText('Bước tiếp theo'),
  aiExcluded: z.boolean({ error: 'Loại khỏi AI phải là đúng/sai.' }).optional(),
  academic: AcademicDetailsInput.optional(),
  project: ProjectDetailsInput.optional(),
});
export const UpdateAreaInput = CreateAreaInput.omit({ kind: true }).partial();

// ---- settings
export const UpdateSettingsInput = z.object({
  staleAfterDays: z
    .number({ error: 'Số ngày cũ phải là một số.' })
    .int({ error: 'Số ngày cũ phải là số nguyên.' })
    .min(1, { error: 'Số ngày cũ tối thiểu 1.' })
    .max(90, { error: 'Số ngày cũ tối đa 90.' })
    .optional(),
  termGoal: nullableText('Mục tiêu học kỳ'),
  defaultFocusMinutes: z
    .number({ error: 'Số phút tập trung phải là một số.' })
    .int({ error: 'Số phút tập trung phải là số nguyên.' })
    .min(5, { error: 'Số phút tập trung tối thiểu 5.' })
    .max(240, { error: 'Số phút tập trung tối đa 240.' })
    .nullable()
    .optional(),
});

// ---- conversations
export const ConversationId = uuid('Cuộc trò chuyện');
export const ConversationTitle = z
  .string({ error: 'Tiêu đề phải là chuỗi.' })
  .trim()
  .min(1, { error: 'Tiêu đề phải dài 1–200 ký tự.' })
  .max(200, { error: 'Tiêu đề phải dài 1–200 ký tự.' });

// ---- folders & documents
export const MAX_DOCUMENT_CHARS = 200_000;
export const MAX_SEARCH_SOURCE_CHARS = 500_000;
export const FolderId = uuid('Thư mục');
export const FolderName = z
  .string({ error: 'Tên thư mục phải là chuỗi.' })
  .trim()
  .min(1, { error: 'Tên thư mục không được để trống.' })
  .max(200, { error: 'Tên thư mục tối đa 200 ký tự.' });
export const CreateFolderInput = z.object({
  areaId,
  parentId: FolderId.nullable().optional(),
  name: FolderName,
  aiExcluded: z.boolean({ error: 'Loại khỏi AI phải là đúng/sai.' }).optional(),
  sortOrder,
});
export const RenameFolderInput = z.object({ id: FolderId, name: FolderName });
export const MoveFolderInput = z.object({ id: FolderId, parentId: FolderId.nullable() });
export const ReorderFoldersInput = z.object({
  areaId,
  parentId: FolderId.nullable().optional(),
  orderedIds: z.array(FolderId, { error: 'Danh sách thư mục không hợp lệ.' }),
});
export type CreateFolderInput = z.infer<typeof CreateFolderInput>;

export const DocumentId = uuid('Tài liệu');
export const DocumentVersionId = uuid('Phiên bản tài liệu');
export const DocumentTitle = z
  .string({ error: 'Tiêu đề tài liệu phải là chuỗi.' })
  .trim()
  .min(1, { error: 'Tiêu đề tài liệu không được để trống.' })
  .max(200, { error: 'Tiêu đề tài liệu tối đa 200 ký tự.' });
export const DocumentBody = z
  .string({ error: 'Nội dung tài liệu phải là chuỗi.' })
  .max(MAX_DOCUMENT_CHARS, { error: 'Nội dung tài liệu tối đa 200.000 ký tự.' });

export const CreateDocumentInput = z.object({
  areaId,
  folderId: FolderId.nullable().optional(),
  title: DocumentTitle,
  bodyMd: DocumentBody.optional(),
  docRole: choice('Vai trò tài liệu', DOC_ROLES).optional(),
  mimeType: text('Loại MIME').optional(),
  fileExt: text('Phần mở rộng').optional(),
  storageKey: text('Khóa lưu trữ').nullable().optional(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  extractedText: z.string().max(MAX_SEARCH_SOURCE_CHARS).optional(),
  templateKey: text('Mẫu tài liệu').nullable().optional(),
  aiExcluded: z.boolean({ error: 'Loại khỏi AI phải là đúng/sai.' }).optional(),
  sortOrder,
});
export const RenameDocumentInput = z.object({ id: DocumentId, title: DocumentTitle });
export const MoveDocumentInput = z.object({ id: DocumentId, folderId: FolderId.nullable() });
export const SetDocumentRoleInput = z.object({ id: DocumentId, docRole: choice('Vai trò tài liệu', DOC_ROLES) });
export const UpdateDocumentBodyInput = z.object({
  id: DocumentId,
  bodyMd: DocumentBody,
  expectedRevision: z.number({ error: 'Phiên bản không hợp lệ.' }).int().positive(),
});
export const ReorderDocumentsInput = z.object({
  areaId,
  orderedIds: z.array(DocumentId, { error: 'Danh sách tài liệu không hợp lệ.' }),
});
export type CreateDocumentInput = z.infer<typeof CreateDocumentInput>;

export type CreateAreaInput = z.infer<typeof CreateAreaInput>;
export type UpdateAreaInput = z.infer<typeof UpdateAreaInput>;
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsInput>;

export type CreateTaskInput =z.infer<typeof CreateTaskInput>;
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
