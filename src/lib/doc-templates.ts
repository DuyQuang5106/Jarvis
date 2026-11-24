import type { AreaKind } from '@/db/enums';

export type DocTemplate = { key: string; title: string; bodyMd: string };

const ACADEMIC_TEMPLATES: DocTemplate[] = [
  {
    key: 'academic_overview',
    title: 'Tổng quan môn',
    bodyMd: `# Tổng quan môn

## Mục tiêu
- Điểm mục tiêu: A
- Học kỳ / số tín chỉ:

## Ghi chú chung
`,
  },
  {
    key: 'academic_syllabus',
    title: 'Syllabus & hình thức thi',
    bodyMd: `# Syllabus & hình thức thi

## Hình thức đánh giá
- Quá trình / Lab:
- Giữa kỳ:
- Cuối kỳ:

## Nội dung chính
- 
`,
  },
  {
    key: 'academic_progress',
    title: 'Tiến độ ôn tập',
    bodyMd: `# Tiến độ ôn tập

## Việc cần làm
- [ ] Rà lại đề cương
- [ ] Làm bài tập mẫu
`,
  },
];

const PROJECT_TEMPLATES: DocTemplate[] = [
  {
    key: 'project_overview',
    title: 'Tổng quan dự án',
    bodyMd: `# Tổng quan dự án

## Mục tiêu & phạm vi
- 

## Vai trò & đối tác
- 
`,
  },
  {
    key: 'project_tech_log',
    title: 'Nhật ký kỹ thuật',
    bodyMd: `# Nhật ký kỹ thuật

## Quyết định gần đây
- 
`,
  },
  {
    key: 'project_blockers',
    title: 'Blockers & thử nghiệm',
    bodyMd: `# Blockers & thử nghiệm

## Đang mắc
- 

## Thử nghiệm tiếp theo
- [ ] 
`,
  },
];

export function templatesForKind(kind: AreaKind): DocTemplate[] {
  return kind === 'academic' ? ACADEMIC_TEMPLATES : PROJECT_TEMPLATES;
}
