import { sql, type SQL } from 'drizzle-orm';
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  time,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import {
  AREA_KINDS,
  AREA_STATUSES,
  BLOCKER_STATUSES,
  CHECKIN_STATUSES,
  DEADLINE_TYPES,
  DOC_ROLES,
  ENTITY_TYPES,
  INBOX_STATUSES,
  LOG_ACTIONS,
  MESSAGE_ROLES,
  MILESTONE_STATUSES,
  ORIGINS,
  PENDING_SOURCES,
  PENDING_STATUSES,
  PRIORITIES,
  SLOT_KEYS,
  TASK_STATUSES,
  TOPIC_STATUSES,
  REMINDER_STATUSES,
} from './enums';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const tz = (name: string) => timestamp(name, { withTimezone: true });
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const areas = pgTable('areas', {
  id: id(),
  kind: text('kind', { enum: AREA_KINDS }).notNull(),
  name: text('name').notNull(),
  aliases: jsonb('aliases').$type<string[]>().notNull().default([]),
  summary: text('summary'),
  goal: text('goal'),
  status: text('status', { enum: AREA_STATUSES }).notNull().default('unknown'),
  priority: text('priority', { enum: PRIORITIES }).notNull().default('medium'),
  startDate: date('start_date', { mode: 'string' }),
  deadlineDate: date('deadline_date', { mode: 'string' }),
  nextAction: text('next_action'),
  aiExcluded: boolean('ai_excluded').notNull().default(false),
  archivedAt: tz('archived_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

export const academicDetails = pgTable('academic_details', {
  areaId: uuid('area_id').primaryKey().references(() => areas.id, { onDelete: 'cascade' }),
  term: text('term'),
  credits: integer('credits'),
  targetGrade: text('target_grade').default('A'),
  gradingScheme: text('grading_scheme'),
  examFormat: text('exam_format'),
  courseOutline: text('course_outline'),
}).enableRLS();

export const projectDetails = pgTable('project_details', {
  areaId: uuid('area_id').primaryKey().references(() => areas.id, { onDelete: 'cascade' }),
  role: text('role'),
  collaborators: text('collaborators'),
  scope: text('scope'),
  cadence: text('cadence'),
}).enableRLS();

export const topics = pgTable(
  'topics',
  {
    id: id(),
    areaId: uuid('area_id').notNull().references(() => areas.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    status: text('status', { enum: TOPIC_STATUSES }).notNull().default('not_started'),
    evidence: text('evidence'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('topics_area_id_idx').on(t.areaId)],
).enableRLS();

export const milestones = pgTable('milestones', {
  id: id(),
  areaId: uuid('area_id').notNull().references(() => areas.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  acceptanceCriteria: text('acceptance_criteria'),
  targetDate: date('target_date', { mode: 'string' }),
  status: text('status', { enum: MILESTONE_STATUSES }).notNull().default('not_started'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

export const blockers = pgTable('blockers', {
  id: id(),
  areaId: uuid('area_id').notNull().references(() => areas.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  lastAttempt: text('last_attempt'),
  nextAction: text('next_action'),
  externalDependency: text('external_dependency'),
  status: text('status', { enum: BLOCKER_STATUSES }).notNull().default('open'),
  resolvedAt: tz('resolved_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    areaId: uuid('area_id').notNull().references(() => areas.id, { onDelete: 'cascade' }),
    milestoneId: uuid('milestone_id').references(() => milestones.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    status: text('status', { enum: TASK_STATUSES }).notNull().default('todo'),
    dueDate: date('due_date', { mode: 'string' }),
    dueTime: time('due_time'),
    deadlineType: text('deadline_type', { enum: DEADLINE_TYPES }).notNull().default('flexible'),
    estimateMinutes: integer('estimate_minutes'),
    blockedReason: text('blocked_reason'),
    /** A countable task (10 practice sessions, 9 exercises): how many are done out of how many. Both or neither. */
    progressDone: integer('progress_done'),
    progressTotal: integer('progress_total'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('tasks_area_id_idx').on(t.areaId), index('tasks_due_date_idx').on(t.dueDate)],
).enableRLS();

export const assessments = pgTable('assessments', {
  id: id(),
  areaId: uuid('area_id').notNull().references(() => areas.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  dueDate: date('due_date', { mode: 'string' }),
  weight: real('weight'),
  score: real('score'),
  maxScore: real('max_score'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

export const notes = pgTable('notes', {
  id: id(),
  areaId: uuid('area_id').references(() => areas.id, { onDelete: 'set null' }),
  text: text('text').notNull(),
  inboxStatus: text('inbox_status', { enum: INBOX_STATUSES }).notNull().default('none'),
  aiExcluded: boolean('ai_excluded').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

export const activityLogs = pgTable(
  'activity_logs',
  {
    id: id(),
    areaId: uuid('area_id').references(() => areas.id, { onDelete: 'set null' }),
    entityType: text('entity_type', { enum: ENTITY_TYPES }).notNull(),
    entityId: uuid('entity_id').notNull(),
    action: text('action', { enum: LOG_ACTIONS }).notNull(),
    beforeJson: jsonb('before_json'),
    afterJson: jsonb('after_json'),
    origin: text('origin', { enum: ORIGINS }).notNull(),
    batchId: uuid('batch_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('activity_logs_area_id_created_at_idx').on(t.areaId, t.createdAt),
    index('activity_logs_entity_id_idx').on(t.entityId),
  ],
).enableRLS();

export const conversations = pgTable('conversations', {
  id: id(),
  title: text('title').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

export const messages = pgTable(
  'messages',
  {
    id: id(),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role', { enum: MESSAGE_ROLES }).notNull(),
    content: text('content').notNull(),
    metadata: jsonb('metadata'),
    createdAt: createdAt(),
  },
  (t) => [index('messages_conversation_id_created_at_idx').on(t.conversationId, t.createdAt)],
).enableRLS();

export const pendingActions = pgTable(
  'pending_actions',
  {
    id: id(),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
    noteId: uuid('note_id').references(() => notes.id, { onDelete: 'set null' }),
    source: text('source', { enum: PENDING_SOURCES }).notNull(),
    actionsJson: jsonb('actions_json').notNull(),
    status: text('status', { enum: PENDING_STATUSES }).notNull().default('pending'),
    error: text('error'),
    createdAt: createdAt(),
    resolvedAt: tz('resolved_at'),
  },
  (t) => [index('pending_actions_status_idx').on(t.status)],
).enableRLS();

export const settings = pgTable('settings', {
  id: integer('id').primaryKey(),
  timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
  defaultFocusMinutes: integer('default_focus_minutes'),
  staleAfterDays: integer('stale_after_days').notNull().default(7),
  termGoal: text('term_goal'),
  preferencesJson: jsonb('preferences_json').notNull().default({}),
  onboardedAt: tz('onboarded_at'),
}).enableRLS();

export const aiUsage = pgTable('ai_usage', {
  day: date('day', { mode: 'string' }).primaryKey(),
  count: integer('count').notNull().default(0),
}).enableRLS();

export const folders = pgTable(
  'folders',
  {
    id: id(),
    areaId: uuid('area_id').notNull().references(() => areas.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references((): AnyPgColumn => folders.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    aiExcluded: boolean('ai_excluded').notNull().default(false),
    deletedAt: tz('deleted_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('folders_area_id_parent_id_sort_order_idx').on(t.areaId, t.parentId, t.sortOrder)],
).enableRLS();

export const documents = pgTable(
  'documents',
  {
    id: id(),
    areaId: uuid('area_id').notNull().references(() => areas.id, { onDelete: 'cascade' }),
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    bodyMd: text('body_md').notNull().default(''),
    docRole: text('doc_role', { enum: DOC_ROLES }).notNull().default('context'),
    mimeType: text('mime_type').notNull().default('text/markdown'),
    fileExt: text('file_ext').notNull().default('md'),
    storageKey: text('storage_key'),
    sizeBytes: integer('size_bytes'),
    extractedText: text('extracted_text').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    templateKey: text('template_key'),
    aiExcluded: boolean('ai_excluded').notNull().default(false),
    revision: integer('revision').notNull().default(1),
    searchText: text('search_text').notNull().default(''),
    searchTsv: tsvector('search_tsv').generatedAlwaysAs((): SQL => sql`to_tsvector('simple', search_text)`),
    deletedAt: tz('deleted_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('documents_area_id_sort_order_idx').on(t.areaId, t.sortOrder),
    index('documents_folder_id_sort_order_idx').on(t.folderId, t.sortOrder),
    index('documents_search_tsv_idx').using('gin', t.searchTsv),
  ],
).enableRLS();

export const documentVersions = pgTable(
  'document_versions',
  {
    id: id(),
    documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    title: text('title').notNull(),
    bodyMd: text('body_md').notNull(),
    origin: text('origin', { enum: ORIGINS }).notNull(),
    batchId: uuid('batch_id'),
    /** The text right before an approved AI rewrite (replace_section, e.g. the weekly compression): never pruned. */
    pinned: boolean('pinned').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('document_versions_document_id_revision_idx').on(t.documentId, t.revision)],
).enableRLS();

export const noteDocumentMap = pgTable('note_document_map', {
  noteId: uuid('note_id').primaryKey().references(() => notes.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  migratedAt: createdAt(),
}).enableRLS();

/** One orientation brief per app day (Asia/Ho_Chi_Minh); regenerating overwrites the row. */
export const dailyBriefs = pgTable('daily_briefs', {
  day: date('day', { mode: 'string' }).primaryKey(),
  content: jsonb('content').notNull(),
  createdAt: createdAt(),
}).enableRLS();

/**
 * One row per handled (or summarised) check-in slot of a local day. A slot without a row is still to ask
 * about; `pending` keeps the generated summary so reopening the app does not generate it again.
 */
export const checkins = pgTable(
  'checkins',
  {
    day: date('day', { mode: 'string' }).notNull(),
    slot: text('slot', { enum: SLOT_KEYS }).notNull(),
    status: text('status', { enum: CHECKIN_STATUSES }).notNull(),
    summary: jsonb('summary'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.day, t.slot] })],
).enableRLS();

/**
 * One weekly review per week (Monday, local): the conversation that holds it and the proposal it made.
 * Reviewing a week again on purpose replaces the row; the earlier conversation stays.
 */
export const weeklyReviews = pgTable('weekly_reviews', {
  weekStart: date('week_start', { mode: 'string' }).primaryKey(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  pendingActionId: uuid('pending_action_id').references(() => pendingActions.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}).enableRLS();

/** Browsers (one per installed device) that receive Web Push notifications. */
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: id(),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: createdAt(),
  lastSuccessAt: tz('last_success_at'),
  failedCount: integer('failed_count').notNull().default(0),
}).enableRLS();
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;

/** "Nhắc tôi … lúc …" from chat (approved like every AI change). `sent`: pushed or shown; `done`: dismissed. */
export const reminders = pgTable(
  'reminders',
  {
    id: id(),
    text: text('text').notNull(),
    remindAt: tz('remind_at').notNull(),
    areaId: uuid('area_id').references(() => areas.id, { onDelete: 'set null' }),
    status: text('status', { enum: REMINDER_STATUSES }).notNull().default('pending'),
    sentAt: tz('sent_at'),
    createdAt: createdAt(),
  },
  (t) => [index('reminders_status_remind_at_idx').on(t.status, t.remindAt)],
).enableRLS();
export type ReminderRow = typeof reminders.$inferSelect;

/** Every table by its SQL name: the single source for TABLE_NAMES, export and RLS checks. */
export const TABLES = {
  areas,
  academic_details: academicDetails,
  project_details: projectDetails,
  topics,
  milestones,
  blockers,
  tasks,
  assessments,
  notes,
  folders,
  documents,
  document_versions: documentVersions,
  note_document_map: noteDocumentMap,
  activity_logs: activityLogs,
  conversations,
  messages,
  pending_actions: pendingActions,
  settings,
  ai_usage: aiUsage,
  daily_briefs: dailyBriefs,
  checkins,
  weekly_reviews: weeklyReviews,
  push_subscriptions: pushSubscriptions,
  reminders,
} as const;

export const TABLE_NAMES: readonly string[] = Object.keys(TABLES);

export type AreaRow = typeof areas.$inferSelect;
export type AcademicDetailsRow = typeof academicDetails.$inferSelect;
export type ProjectDetailsRow = typeof projectDetails.$inferSelect;
export type TopicRow = typeof topics.$inferSelect;
export type MilestoneRow = typeof milestones.$inferSelect;
export type BlockerRow = typeof blockers.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type AssessmentRow = typeof assessments.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;
export type FolderRow = typeof folders.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type DocumentVersionRow = typeof documentVersions.$inferSelect;
export type NoteDocumentMapRow = typeof noteDocumentMap.$inferSelect;
export type ActivityLogRow = typeof activityLogs.$inferSelect;
export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type PendingActionRow = typeof pendingActions.$inferSelect;
export type SettingsRow = typeof settings.$inferSelect;
export type AiUsageRow = typeof aiUsage.$inferSelect;
export type DailyBriefRow = typeof dailyBriefs.$inferSelect;
export type CheckinRow = typeof checkins.$inferSelect;
export type WeeklyReviewRow = typeof weeklyReviews.$inferSelect;
