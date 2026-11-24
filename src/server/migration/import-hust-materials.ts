import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '@/db/client';
import type { DocRole } from '@/db/enums';
import { areas, documents, folders } from '@/db/schema';
import { ingestUploadedFile } from '@/server/files/ingest';
import { classifyUploadedFile } from '@/server/files/policy';
import { folderService } from '@/server/services/folders';
import type { FileStorage } from '@/server/storage';

export type CourseMapping = {
  areaName: string;
  contextSubpath?: string;
  rawSubpath?: string;
};

export const DEFAULT_COURSE_MAPPINGS: readonly CourseMapping[] = [
  {
    areaName: 'Database',
    contextSubpath: 'Database_IT3292E_Personal_AI_Workspace_Context_2026-11-24/Database_IT3292E',
    rawSubpath: 'IT3290E - DATABASE AND DB LAB',
  },
  {
    areaName: 'Software Engineering',
    contextSubpath: 'IT4082E_Personal_AI_Workspace_Context/HUST-IT4082E',
    rawSubpath: 'IT4082E - SOFTWARE ENGINEERING',
  },
  {
    areaName: 'Introduction to Communications Engineering',
    contextSubpath: 'IT4593E_Personal_AI_Workspace_context/IT4593E',
    rawSubpath: 'IT4593E - INTRODUCTION TO COMMS ENGINEERING',
  },
  {
    areaName: 'Mobile Programming',
    contextSubpath: 'IT4785E_Personal_AI_Workspace_Context/IT4785E_Mobile_Programming',
    rawSubpath: 'IT4785E - MOBILE PROGRAMMING',
  },
  {
    areaName: 'Computer Networks',
    contextSubpath: 'Personal_AI_Workspace_Computer_Networks/IT3080E',
    rawSubpath: 'IT3080E - COMPUTER NETWORKS',
  },
  {
    areaName: 'C Programming',
    contextSubpath: 'Personal_AI_Workspace_IT3220_Context_Pack/Personal_AI_Workspace_IT3220',
    rawSubpath: 'IT3220 - C PROGRAMMING INTRODUCTION',
  },
  {
    areaName: 'Algebra',
    contextSubpath: 'Personal_AI_Workspace_MI1144E_context_2026-11-24/MI1144E',
    rawSubpath: 'MI1144E - ALGEBRA',
  },
  {
    areaName: 'Tư tưởng Hồ Chí Minh',
    contextSubpath: 'TTHCM_SSH1151_20261_Context_Pack/TTHCM_SSH1151_20261_CONTEXT',
    rawSubpath: 'SSH1151 - TU TUONG HO CHI MINH',
  },
  {
    areaName: 'Technical Writing',
    rawSubpath: 'IT2030 - TECHNICAL WRITING AND PRESENTATION',
  },
];

export type ClassifiedImportItem = {
  folderPath: string[];
  title: string;
  docRole: DocRole;
};

const CONTEXT_NAME_MAP: Record<string, { folder: string; title: string; role: DocRole }> = {
  '00_source_audit.md': { folder: '00_Kiểm_kê', title: '00_SOURCE_AUDIT.md', role: 'context' },
  'source_audit.md': { folder: '00_Kiểm_kê', title: '00_SOURCE_AUDIT.md', role: 'context' },
  '08_validation.md': { folder: '00_Kiểm_kê', title: '08_VALIDATION.md', role: 'context' },
  'validation.md': { folder: '00_Kiểm_kê', title: '08_VALIDATION.md', role: 'context' },
  'validation_report.md': { folder: '00_Kiểm_kê', title: '08_VALIDATION.md', role: 'context' },
  'completeness_audit.md': { folder: '00_Kiểm_kê', title: '08_VALIDATION.md', role: 'context' },
  '08_completeness_and_decision_test.md': { folder: '00_Kiểm_kê', title: '08_VALIDATION.md', role: 'context' },
  'manifest.json': { folder: '00_Kiểm_kê', title: 'manifest.json', role: 'context' },

  '01_context.md': { folder: '01_Context', title: '01_CONTEXT.md', role: 'context' },
  'context.md': { folder: '01_Context', title: '01_CONTEXT.md', role: 'context' },
  '02_course_map.md': { folder: '01_Context', title: '02_COURSE_MAP.md', role: 'context' },
  'course_map.md': { folder: '01_Context', title: '02_COURSE_MAP.md', role: 'context' },
  '04_state.md': { folder: '01_Context', title: '04_STATE.md', role: 'context' },
  'state.md': { folder: '01_Context', title: '04_STATE.md', role: 'context' },
  '05_log.md': { folder: '01_Context', title: '05_LOG.md', role: 'context' },
  'log.md': { folder: '01_Context', title: '05_LOG.md', role: 'context' },
  '06_timeline.md': { folder: '01_Context', title: '06_TIMELINE.md', role: 'context' },
  'timeline.md': { folder: '01_Context', title: '06_TIMELINE.md', role: 'context' },
  '07_missing_info.md': { folder: '01_Context', title: '07_MISSING_INFO.md', role: 'context' },
  'missing_info.md': { folder: '01_Context', title: '07_MISSING_INFO.md', role: 'context' },
  'readme.md': { folder: '01_Context', title: 'README.md', role: 'context' },

  '03_exam_analysis.md': { folder: '03_Đề_thi_&_Ôn_tập', title: '03_EXAM_ANALYSIS.md', role: 'raw' },
  'exam_analysis.md': { folder: '03_Đề_thi_&_Ôn_tập', title: '03_EXAM_ANALYSIS.md', role: 'raw' },
};

const EXAM_HINT_RE =
  /(?:^|\/)(?:midterm|finals)(?:\/|$)|(?:giữa kì|cuối kì|thi thử|thi thực hành|ngân hàng|quiz|ôn tập|chữa đề|đáp án|đề mẫu|_CK\b|_GK\b|20\d{2}_?QA|final_term|Exam_Playbook|De_giua_ky|On_tap_giua_ky|De_Loi_Kiep|HỆ THỐNG VẤN ĐỀ|ĐỀ CƯƠNG TƯ TƯỞNG)/i;

const WRAPPER_SUBDIR_RE = /^(?:OneDrive_1_[^/]+|hr_database_\.3m|midterm|finals)$/i;

export function classifyContextPackFile(filename: string): ClassifiedImportItem {
  const lower = filename.toLowerCase();
  const mapped = CONTEXT_NAME_MAP[lower];
  if (mapped) {
    return { folderPath: [mapped.folder], title: mapped.title, docRole: mapped.role };
  }
  if (lower.startsWith('question_') || lower.endsWith('.csv')) {
    return { folderPath: ['03_Đề_thi_&_Ôn_tập'], title: filename, docRole: 'raw' };
  }
  return { folderPath: ['01_Context'], title: filename, docRole: 'context' };
}

export function classifyRawCourseFile(relPath: string): ClassifiedImportItem {
  const norm = relPath.replace(/\\/g, '/');
  const parts = norm.split('/').filter(Boolean);
  const filename = parts.pop() ?? norm;
  const subdirs = parts.filter((seg) => !WRAPPER_SUBDIR_RE.test(seg));
  const root = EXAM_HINT_RE.test(norm) ? '03_Đề_thi_&_Ôn_tập' : '02_Tài_liệu_học';
  return {
    folderPath: [root, ...subdirs],
    title: filename.slice(0, 200),
    docRole: 'raw',
  };
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort((a, b) => a.localeCompare(b, 'en'))) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

export type ImportReport = {
  dryRun: boolean;
  coursesFound: number;
  missingAreas: string[];
  foldersCreated: number;
  docsCreated: number;
  docsSkipped: number;
  skippedUnsupported: { area: string; file: string; reason: string }[];
  errors: { area: string; file: string; message: string }[];
  perArea: { area: string; created: number; skipped: number }[];
};

const MIGRATION_META = { origin: 'migration' as const };

async function ensureFolderPath(
  db: Db,
  areaId: string,
  segments: string[],
  cache: Map<string, string>,
  dryRun: boolean,
  report: ImportReport,
): Promise<string | null> {
  let parentId: string | null = null;
  let keyPrefix = areaId;
  for (const seg of segments) {
    const cacheKey = `${keyPrefix}/${seg}`;
    const hit = cache.get(cacheKey);
    if (hit) {
      parentId = hit;
      keyPrefix = cacheKey;
      continue;
    }
    const isVirtualParent: boolean = typeof parentId === 'string' && parentId.startsWith('virtual:');
    let existing: { id: string } | undefined;
    if (!isVirtualParent) {
      [existing] = await db
        .select({ id: folders.id })
        .from(folders)
        .where(
          and(
            eq(folders.areaId, areaId),
            parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId),
            eq(folders.name, seg),
            isNull(folders.deletedAt),
          ),
        );
    }
    if (existing) {
      cache.set(cacheKey, existing.id);
      parentId = existing.id;
      keyPrefix = cacheKey;
      continue;
    }
    if (dryRun) {
      const virtualId = `virtual:${cacheKey}`;
      cache.set(cacheKey, virtualId);
      report.foldersCreated += 1;
      parentId = virtualId;
      keyPrefix = cacheKey;
      continue;
    }
    const created = await folderService.create(
      db,
      { areaId, parentId, name: seg },
      MIGRATION_META,
      { touchArea: false },
    );
    cache.set(cacheKey, created.id);
    report.foldersCreated += 1;
    parentId = created.id;
    keyPrefix = cacheKey;
  }
  return parentId;
}

export async function importHustMaterials(
  db: Db,
  storage: FileStorage,
  opts: {
    contextRoot?: string;
    rawRoot?: string;
    mappings?: readonly CourseMapping[];
    dryRun?: boolean;
  },
): Promise<ImportReport> {
  const dryRun = opts.dryRun ?? true;
  const mappings = opts.mappings ?? DEFAULT_COURSE_MAPPINGS;
  const report: ImportReport = {
    dryRun,
    coursesFound: mappings.length,
    missingAreas: [],
    foldersCreated: 0,
    docsCreated: 0,
    docsSkipped: 0,
    skippedUnsupported: [],
    errors: [],
    perArea: [],
  };

  const folderCache = new Map<string, string>();

  for (const mapping of mappings) {
    const [area] = await db
      .select({ id: areas.id, name: areas.name })
      .from(areas)
      .where(eq(areas.name, mapping.areaName));
    if (!area) {
      report.missingAreas.push(mapping.areaName);
      continue;
    }

    const areaStat = { area: mapping.areaName, created: 0, skipped: 0 };
    const candidates: { absPath: string; item: ClassifiedImportItem }[] = [];

    if (opts.contextRoot && mapping.contextSubpath) {
      const cDir = join(opts.contextRoot, mapping.contextSubpath);
      try {
        if (statSync(cDir).isDirectory()) {
          for (const absPath of walkFiles(cDir)) {
            const rel = relative(cDir, absPath).replace(/\\/g, '/');
            const base = rel.split('/').pop() ?? rel;
            candidates.push({ absPath, item: classifyContextPackFile(base) });
          }
        }
      } catch {
        // Optional missing pack folder skipped gracefully.
      }
    }

    if (opts.rawRoot && mapping.rawSubpath) {
      const rDir = join(opts.rawRoot, mapping.rawSubpath);
      try {
        if (statSync(rDir).isDirectory()) {
          for (const absPath of walkFiles(rDir)) {
            const rel = relative(rDir, absPath);
            candidates.push({ absPath, item: classifyRawCourseFile(rel) });
          }
        }
      } catch {
        // Optional missing raw folder skipped gracefully.
      }
    }

    for (const { absPath, item } of candidates) {
      const sizeBytes = statSync(absPath).size;
      const filename = absPath.replace(/\\/g, '/').split('/').pop() ?? item.title;
      try {
        classifyUploadedFile({ filename, sizeBytes });
      } catch (err) {
        report.skippedUnsupported.push({
          area: mapping.areaName,
          file: absPath,
          reason: err instanceof Error ? err.message : 'Định dạng không hỗ trợ',
        });
        continue;
      }

      try {
        const folderId = await ensureFolderPath(db, area.id, item.folderPath, folderCache, dryRun, report);
        const isVirtualFolder = folderId?.startsWith('virtual:') ?? false;
        let exists = false;
        if (!isVirtualFolder) {
          const [hit] = await db
            .select({ id: documents.id })
            .from(documents)
            .where(
              and(
                eq(documents.areaId, area.id),
                folderId ? eq(documents.folderId, folderId) : isNull(documents.folderId),
                eq(documents.title, item.title),
                isNull(documents.deletedAt),
              ),
            );
          exists = Boolean(hit);
        }

        if (exists) {
          report.docsSkipped += 1;
          areaStat.skipped += 1;
          continue;
        }

        if (dryRun) {
          report.docsCreated += 1;
          areaStat.created += 1;
          continue;
        }

        const bytes = new Uint8Array(readFileSync(absPath));
        await ingestUploadedFile(
          db,
          storage,
          {
            areaId: area.id,
            folderId,
            docRole: item.docRole,
            filename,
            titleOverride: item.title,
            bytes,
          },
          MIGRATION_META,
          { touchArea: false },
        );
        report.docsCreated += 1;
        areaStat.created += 1;
      } catch (err) {
        report.errors.push({
          area: mapping.areaName,
          file: absPath,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    report.perArea.push(areaStat);
  }

  return report;
}
