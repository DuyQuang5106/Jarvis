import { z } from 'zod';
import {
  CreateAssessmentInput,
  CreateBlockerInput,
  CreateMilestoneInput,
  CreateNoteInput,
  CreateTaskInput,
  CreateTopicInput,
  DocumentTitle,
  Name,
  UpdateAreaInput,
  UpdateAssessmentInput,
  UpdateMilestoneInput,
  UpdateTaskInput,
  UpdateTopicInput,
} from '@/server/schemas';
import type { ToolDef } from '../ai/provider';

const uuid = (label: string) => z.uuid({ error: `${label} không hợp lệ.` });

const nonEmptyPatch = <T extends Record<string, unknown>>(obj: T) =>
  Object.values(obj).some((v) => v !== undefined);

const TaskPatchSchema = UpdateTaskInput.pick({
  title: true,
  status: true,
  dueDate: true,
  deadlineType: true,
  estimateMinutes: true,
  blockedReason: true,
}).refine(nonEmptyPatch, { error: 'Cần ít nhất một trường để cập nhật task.' });

const AreaPatchSchema = UpdateAreaInput.pick({
  status: true,
  priority: true,
  nextAction: true,
  summary: true,
  goal: true,
  startDate: true,
  deadlineDate: true,
}).refine(nonEmptyPatch, { error: 'Cần ít nhất một trường để cập nhật mục.' });

function hasUpsertFields(val: { id?: string; title?: string }, keys: string[], record: Record<string, unknown>): boolean {
  if (!val.id) return typeof val.title === 'string' && val.title.trim().length > 0;
  return keys.some((k) => record[k] !== undefined);
}

const CreateTaskActionSchema = CreateTaskInput.pick({
  areaId: true,
  title: true,
  status: true,
  dueDate: true,
  deadlineType: true,
  estimateMinutes: true,
  milestoneId: true,
}).extend({ type: z.literal('create_task') });

const UpdateTaskActionSchema = z.object({
  type: z.literal('update_task'),
  id: uuid('Task'),
  patch: TaskPatchSchema,
});

const UpdateAreaActionSchema = z.object({
  type: z.literal('update_area'),
  id: uuid('Mục'),
  patch: AreaPatchSchema,
});

const UpsertTopicActionSchema = z
  .object({
    type: z.literal('upsert_topic'),
    areaId: CreateTopicInput.shape.areaId,
    id: uuid('Topic').optional(),
    title: Name.optional(),
    status: UpdateTopicInput.shape.status,
    evidence: UpdateTopicInput.shape.evidence,
  })
  .refine((v) => hasUpsertFields(v, ['title', 'status', 'evidence'], v), {
    error: 'Tạo topic cần title; sửa topic cần ít nhất một trường.',
  });

const UpsertMilestoneActionSchema = z
  .object({
    type: z.literal('upsert_milestone'),
    areaId: CreateMilestoneInput.shape.areaId,
    id: uuid('Milestone').optional(),
    title: Name.optional(),
    acceptanceCriteria: UpdateMilestoneInput.shape.acceptanceCriteria,
    targetDate: UpdateMilestoneInput.shape.targetDate,
    status: UpdateMilestoneInput.shape.status,
  })
  .refine((v) => hasUpsertFields(v, ['title', 'acceptanceCriteria', 'targetDate', 'status'], v), {
    error: 'Tạo milestone cần title; sửa milestone cần ít nhất một trường.',
  });

const UpsertAssessmentActionSchema = z
  .object({
    type: z.literal('upsert_assessment'),
    areaId: CreateAssessmentInput.shape.areaId,
    id: uuid('Assessment').optional(),
    title: Name.optional(),
    dueDate: UpdateAssessmentInput.shape.dueDate,
    weight: UpdateAssessmentInput.shape.weight,
    score: UpdateAssessmentInput.shape.score,
    maxScore: UpdateAssessmentInput.shape.maxScore,
  })
  .refine((v) => hasUpsertFields(v, ['title', 'dueDate', 'weight', 'score', 'maxScore'], v), {
    error: 'Tạo assessment cần title; sửa assessment cần ít nhất một trường.',
  });

const CreateNoteActionSchema = z.object({
  type: z.literal('create_note'),
  areaId: CreateNoteInput.shape.areaId,
  text: CreateNoteInput.shape.text,
});

const AddProgressLogActionSchema = z.object({
  type: z.literal('add_progress_log'),
  areaId: uuid('Mục'),
  text: z
    .string({ error: 'Nội dung tiến độ phải là chuỗi.' })
    .trim()
    .min(1, { error: 'Nội dung tiến độ không được để trống.' })
    .max(2000, { error: 'Nội dung tiến độ tối đa 2000 ký tự.' }),
});

const CreateBlockerActionSchema = CreateBlockerInput.pick({
  areaId: true,
  title: true,
  lastAttempt: true,
  nextAction: true,
  externalDependency: true,
}).extend({ type: z.literal('create_blocker') });

const ResolveBlockerActionSchema = z.object({
  type: z.literal('resolve_blocker'),
  id: uuid('Blocker'),
});

const documentId = uuid('Tài liệu');
const anchorText = z.string().trim().min(1, 'Cần chỉ rõ mục trong tài liệu.').max(300, 'Tên mục tối đa 300 ký tự.');
const markdown = z.string().max(20_000, 'Nội dung đề xuất tối đa 20.000 ký tự.');

const CreateDocumentActionSchema = z.object({
  type: z.literal('create_document'), areaId: uuid('Mục'), title: DocumentTitle, markdown,
});
const AppendToDocumentActionSchema = z.object({
  type: z.literal('append_to_document'), documentId, heading: anchorText.optional(),
  markdown: markdown.refine((text) => !!text.trim(), 'Nội dung thêm không được để trống.'),
});
const ReplaceSectionActionSchema = z.object({
  type: z.literal('replace_section'), documentId, heading: anchorText, markdown,
});
const SetChecklistItemActionSchema = z.object({
  type: z.literal('set_checklist_item'), documentId, itemText: anchorText, checked: z.boolean(),
});
const RenameDocumentActionSchema = z.object({
  type: z.literal('rename_document'), documentId, title: DocumentTitle,
});

export const ProposedActionSchema = z.discriminatedUnion('type', [
  CreateTaskActionSchema,
  UpdateTaskActionSchema,
  UpdateAreaActionSchema,
  UpsertTopicActionSchema,
  UpsertMilestoneActionSchema,
  UpsertAssessmentActionSchema,
  CreateNoteActionSchema,
  AddProgressLogActionSchema,
  CreateBlockerActionSchema,
  ResolveBlockerActionSchema,
  CreateDocumentActionSchema,
  AppendToDocumentActionSchema,
  ReplaceSectionActionSchema,
  SetChecklistItemActionSchema,
  RenameDocumentActionSchema,
]);

export type ProposedAction = z.infer<typeof ProposedActionSchema>;

export const ProposeChangesSchema = z.object({
  summary: z
    .string({ error: 'Tóm tắt phải là chuỗi.' })
    .trim()
    .min(1, { error: 'Tóm tắt không được để trống.' })
    .max(300, { error: 'Tóm tắt tối đa 300 ký tự.' }),
  actions: z
    .array(ProposedActionSchema, { error: 'Danh sách hành động không hợp lệ.' })
    .min(1, { error: 'Cần ít nhất 1 hành động.' })
    .max(20, { error: 'Tối đa 20 hành động mỗi đề xuất.' }),
});

export type ProposeChanges = z.infer<typeof ProposeChangesSchema>;

export const PROPOSE_CHANGES_TOOL: ToolDef = {
  name: 'propose_changes',
  description: 'Đề xuất thay đổi dữ liệu để người dùng duyệt. Không thay đổi nào được ghi trước khi họ duyệt.',
  parameters: z.toJSONSchema(ProposeChangesSchema) as Record<string, unknown>,
};

export type StoredAction = {
  key: number;
  action: ProposedAction;
  baseUpdatedAt: string | null;
  baseRevision?: number;
  sectionHash?: string;
};
export type StoredProposal = {
  summary: string;
  actions: StoredAction[];
  appliedKeys?: number[];
  requiresDeadlineRoute?: boolean;
  batchId?: string;
  undoneAt?: string;
};

export type ActionPreview = {
  key: number;
  type: ProposedAction['type'];
  areaId: string | null;
  areaName: string | null;
  label: string;
  changes: { field: string; before: string | null; after: string | null }[];
  isCreate: boolean;
  documentId?: string;
  diff?: { before: string; after: string };
  conflict: 'none' | 'changed' | 'missing';
};
