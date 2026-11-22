import type {
  AreaStatus,
  BlockerStatus,
  InboxStatus,
  Origin,
  DeadlineType,
  MilestoneStatus,
  Priority,
  TaskStatus,
  TopicStatus,
} from '@/db/enums';
import type { MissingFlag } from '@/server/queries/snapshot';

export const AREA_STATUS_LABEL: Record<AreaStatus, string> = {
  unknown: 'Unknown',
  not_started: 'Not started',
  active: 'Active',
  blocked: 'Blocked',
  on_hold: 'On hold',
  completed: 'Completed',
};

export const TOPIC_STATUS_LABEL: Record<TopicStatus, string> = {
  not_started: 'Not started',
  familiar: 'Familiar',
  practiced: 'Practiced',
  confident: 'Confident',
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  doing: 'Doing',
  done: 'Done',
  blocked: 'Blocked',
};

export const DEADLINE_TYPE_LABEL: Record<DeadlineType, string> = {
  hard: 'Hard',
  committed: 'Committed',
  flexible: 'Flexible',
};

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const MISSING_LABEL: Record<MissingFlag, string> = {
  status_unknown: 'Chưa rõ trạng thái',
  no_next_action: 'Chưa có việc tiếp theo',
  no_topics: 'Chưa có topic',
  no_assessment_date: 'Chưa có ngày thi',
  no_milestones: 'Chưa có milestone',
};

export const BLOCKER_STATUS_LABEL: Record<BlockerStatus, string> = {
  open: 'Open',
  resolved: 'Resolved',
};

export const INBOX_STATUS_LABEL: Record<InboxStatus, string> = {
  none: 'Không',
  inbox: 'Inbox',
  processed: 'Đã xử lý',
};

export const ORIGIN_LABEL: Record<Origin, string> = {
  manual: 'Thủ công',
  ai_approved: 'AI (đã duyệt)',
  seed: 'Seed',
  undo: 'Hoàn tác',
};
