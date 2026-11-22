import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  time,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  AREA_KINDS,
  AREA_STATUSES,
  BLOCKER_STATUSES,
  DEADLINE_TYPES,
  ENTITY_TYPES,
  INBOX_STATUSES,
  LOG_ACTIONS,
  MESSAGE_ROLES,
  MILESTONE_STATUSES,
  ORIGINS,
  PENDING_SOURCES,
  PENDING_STATUSES,
  PRIORITIES,
  TASK_STATUSES,
  TOPIC_STATUSES,
} from './enums';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const tz = (name: string) => timestamp(name, { withTimezone: true });

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

export const TABLE_NAMES: readonly string[] = [
  'areas',
  'academic_details',
  'project_details',
  'topics',
  'milestones',
  'blockers',
  'tasks',
  'assessments',
  'notes',
  'activity_logs',
  'conversations',
  'messages',
  'pending_actions',
  'settings',
  'ai_usage',
];

export type AreaRow = typeof areas.$inferSelect;
export type AcademicDetailsRow = typeof academicDetails.$inferSelect;
export type ProjectDetailsRow = typeof projectDetails.$inferSelect;
export type TopicRow = typeof topics.$inferSelect;
export type MilestoneRow = typeof milestones.$inferSelect;
export type BlockerRow = typeof blockers.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type AssessmentRow = typeof assessments.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;
export type ActivityLogRow = typeof activityLogs.$inferSelect;
export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type PendingActionRow = typeof pendingActions.$inferSelect;
export type SettingsRow = typeof settings.$inferSelect;
export type AiUsageRow = typeof aiUsage.$inferSelect;
