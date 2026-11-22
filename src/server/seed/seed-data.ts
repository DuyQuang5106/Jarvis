import type { AreaKind, AreaStatus } from '@/db/enums';

export type SeedItem = {
  key: string;
  kind: AreaKind;
  name: string;
  aliases: string[];
  summary: string | null;
  status: AreaStatus;
};

export const SEED_TERM_GOAL = 'GPA 4.0/4.0, 23 tín chỉ';

const NOT_STARTED = 'Chưa bắt đầu ôn có hệ thống; cần xác minh syllabus và phương thức thi.';
const ON_TRACK = 'Đang theo tiến độ, theo tự đánh giá.';

export const SEED_ITEMS: readonly SeedItem[] = [
  { key: 'technical-writing', kind: 'academic', name: 'Technical Writing', aliases: [], summary: null, status: 'unknown' },
  { key: 'database', kind: 'academic', name: 'Database', aliases: ['DB'], summary: 'Có phần Lab', status: 'unknown' },
  { key: 'algebra', kind: 'academic', name: 'Algebra', aliases: [], summary: 'Học cải thiện', status: 'unknown' },
  { key: 'computer-networks', kind: 'academic', name: 'Computer Networks', aliases: ['Networks'], summary: `Có phần Lab. ${ON_TRACK}`, status: 'active' },
  { key: 'intro-comm-eng', kind: 'academic', name: 'Introduction to Communications Engineering', aliases: ['ICE'], summary: ON_TRACK, status: 'active' },
  { key: 'c-programming', kind: 'academic', name: 'C Programming', aliases: [], summary: 'Học cải thiện', status: 'unknown' },
  { key: 'mobile-programming', kind: 'academic', name: 'Mobile Programming', aliases: ['Mobile'], summary: NOT_STARTED, status: 'not_started' },
  { key: 'software-engineering', kind: 'academic', name: 'Software Engineering', aliases: ['SE'], summary: NOT_STARTED, status: 'not_started' },
  { key: 'tthcm', kind: 'academic', name: 'Tư tưởng Hồ Chí Minh', aliases: ['TTHCM'], summary: null, status: 'unknown' },
  { key: 'llm4ad', kind: 'project', name: 'LLM4AD/LLMEC', aliases: ['LLM4AD', 'LLMEC'], summary: 'Personal research', status: 'unknown' },
  { key: 'research-assistant', kind: 'project', name: 'Research Assistant', aliases: ['RA'], summary: 'Hỗ trợ nhóm khác', status: 'unknown' },
  { key: 'question-house', kind: 'project', name: 'Question House', aliases: ['QH'], summary: 'Android app', status: 'unknown' },
  { key: 'stewiesat', kind: 'project', name: 'StewieSAT', aliases: [], summary: 'Website/platform', status: 'unknown' },
  { key: 'atgt', kind: 'project', name: 'ATGT Competition', aliases: ['ATGT'], summary: 'Thi tháng 1/2027', status: 'unknown' },
];
