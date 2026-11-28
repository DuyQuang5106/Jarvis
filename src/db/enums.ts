export const AREA_KINDS = ['academic', 'project'] as const;
export type AreaKind = (typeof AREA_KINDS)[number];

export const AREA_STATUSES = ['unknown', 'not_started', 'active', 'blocked', 'on_hold', 'completed'] as const;
export type AreaStatus = (typeof AREA_STATUSES)[number];

export const PRIORITIES = ['high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TOPIC_STATUSES = ['not_started', 'familiar', 'practiced', 'confident'] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

export const TASK_STATUSES = ['todo', 'doing', 'done', 'blocked'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const DEADLINE_TYPES = ['hard', 'committed', 'flexible'] as const;
export type DeadlineType = (typeof DEADLINE_TYPES)[number];

export const MILESTONE_STATUSES = ['not_started', 'in_progress', 'done'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const BLOCKER_STATUSES = ['open', 'resolved'] as const;
export type BlockerStatus = (typeof BLOCKER_STATUSES)[number];

export const INBOX_STATUSES = ['none', 'inbox', 'processed'] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];

export const LOG_ACTIONS = ['create', 'update', 'delete', 'archive', 'progress'] as const;
export type LogAction = (typeof LOG_ACTIONS)[number];

export const ORIGINS = ['manual', 'ai_approved', 'seed', 'undo', 'migration'] as const;
export type Origin = (typeof ORIGINS)[number];

export const ENTITY_TYPES = ['area', 'task', 'topic', 'assessment', 'milestone', 'blocker', 'note', 'folder', 'document'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const DOC_ROLES = ['context', 'raw', 'instruction'] as const;
export type DocRole = (typeof DOC_ROLES)[number];

export const PENDING_STATUSES = ['pending', 'applied', 'partially_applied', 'rejected', 'superseded', 'failed'] as const;
export type PendingStatus = (typeof PENDING_STATUSES)[number];

export const PENDING_SOURCES = ['chat', 'capture'] as const;
export type PendingSource = (typeof PENDING_SOURCES)[number];

export const REMINDER_STATUSES = ['pending', 'sent', 'done'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const MESSAGE_ROLES = ['user', 'assistant'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

/** The parts of a day the check-in asks about, in order (labels and times live in `@/lib/day-slots`). */
export const SLOT_KEYS = ['morning', 'noon', 'afternoon', 'evening'] as const;
export type SlotKey = (typeof SLOT_KEYS)[number];

/** `pending` = summary generated, card not handled yet; the others are final. */
export const CHECKIN_STATUSES = ['pending', 'recorded', 'answered', 'skipped'] as const;
export type CheckinStatus = (typeof CHECKIN_STATUSES)[number];
