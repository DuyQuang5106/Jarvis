import type {
  AreaStatus,
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
