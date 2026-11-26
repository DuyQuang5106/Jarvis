import { and, eq, gte, isNull, lt, notInArray } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { areas, checkins, documents } from '@/db/schema';
import { CHECKIN_MESSAGE } from '@/lib/checkin-message';
import { formatDateTimeVi, formatDateVi } from '@/lib/dates';
import { SLOT_NAME, addDays } from '@/lib/day-slots';
import { weekEnd, weekInstants } from '@/lib/weeks';
import { clip } from '../ai/clip';
import { corePriority } from '../ai/document-context';
import { visibleDocumentConditions } from '../ai/document-visibility';
import { splitFrontmatter } from '../ai/frontmatter';
import { readMarkdownLines } from '../ai/markdown-source';
import { slotActivity, type ActivityItem } from '../checkin/activity';

export const WEEK_LIMITS = { message: 60, log: 120, document: 60, proposal: 40, text: 200, datedLines: 6, candidates: 8 } as const;
/** A log section longer than this is worth compressing even without two dated lines in the week. */
export const LONG_LOG_SECTION = 4000;

/** A section of a state or log document with progress lines dated in the week. */
export type DatedSection = {
  area: string;
  document: string;
  heading: string;
  /** Lines of the section holding a date of the week (first {@link WEEK_LIMITS.datedLines}, clipped). */
  lines: string[];
  count: number;
  chars: number;
  /** No sub-heading under it: `replace_section` would rewrite only this section. */
  leaf: boolean;
  log: boolean;
};

export type WeekActivity = {
  weekStart: string;
  items: ActivityItem[];
  checkins: { label: string; status: string; summary: string | null }[];
  sections: DatedSection[];
  /** Sections the review may compress with `replace_section` (leaf only, at most 8). */
  candidates: DatedSection[];
};

const ISO = /\b(20\d\d)-(\d\d)-(\d\d)\b/g;
const VI = /\b(\d{1,2})\/(\d{1,2})\/(20\d\d)\b/g;

/** Days (YYYY-MM-DD) written in `line`, as `2026-11-24` or `24/11/2026`. */
export function datesIn(line: string): string[] {
  const out = [...line.matchAll(ISO)].map((m) => `${m[1]}-${m[2]}-${m[3]}`);
  for (const m of line.matchAll(VI)) out.push(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  return out;
}

/**
 * Every section of a Markdown body (frontmatter ignored) with its lines dated within `[from, to]`. A section
 * is the text under a heading up to the next heading of any level.
 */
export function datedSections(body: string, from: string, to: string): Omit<DatedSection, 'area' | 'document' | 'log'>[] {
  const text = splitFrontmatter(body).body;
  const lines = readMarkdownLines(text);
  const out: Omit<DatedSection, 'area' | 'document' | 'log'>[] = [];
  let current: { heading: string; level: number; lines: string[]; count: number; chars: number; leaf: boolean } | null = null;
  const flush = () => {
    if (current) out.push({ heading: current.heading, lines: current.lines, count: current.count, chars: current.chars, leaf: current.leaf });
  };
  // Leaf: the next heading after it is not deeper.
  const headings = lines.filter((l) => l.heading);
  for (const line of lines) {
    if (line.heading) {
      flush();
      const next = headings[headings.indexOf(line) + 1];
      current = { heading: line.heading.label, level: line.heading.level, lines: [], count: 0, chars: 0, leaf: !next || next.heading!.level <= line.heading.level };
      continue;
    }
    if (!current) continue;
    current.chars += line.text.length;
    if (line.fenced) continue;
    if (datesIn(line.text).some((d) => d >= from && d <= to)) {
      current.count++;
      if (current.lines.length < WEEK_LIMITS.datedLines) current.lines.push(clip(line.text.replace(/\s+/g, ' ').trim(), WEEK_LIMITS.text));
    }
  }
  flush();
  return out;
}

/**
 * Everything the weekly review reads about the week of `weekStart`: record changes (not migration or seed),
 * check-ins and their answers, the user's messages (at most 60, 200 characters each), documents edited, and
 * the dated progress lines of the week in each area's state and log documents. Areas and documents hidden
 * from the AI are left out. A fixed number of queries.
 */
export async function collectWeekActivity(db: DbOrTx, weekStart: string, tz: string): Promise<WeekActivity> {
  const { start, end } = weekInstants(weekStart, tz);
  const last = weekEnd(weekStart);
  const [activity, checkinRows, docConditions] = await Promise.all([
    slotActivity(db, start, end, {
      limits: { message: WEEK_LIMITS.message, log: WEEK_LIMITS.log, document: WEEK_LIMITS.document, proposal: WEEK_LIMITS.proposal },
      total: WEEK_LIMITS.message + WEEK_LIMITS.log + WEEK_LIMITS.document + WEEK_LIMITS.proposal,
      keepCheckinMessages: true,
    }),
    db
      .select()
      .from(checkins)
      .where(and(gte(checkins.day, weekStart), lt(checkins.day, addDays(weekStart, 7))))
      .orderBy(checkins.day),
    visibleDocumentConditions(db),
  ]);
  const docs = await db
    .select({ title: documents.title, bodyMd: documents.bodyMd, area: areas.name, areaId: areas.id })
    .from(documents)
    .innerJoin(areas, eq(areas.id, documents.areaId))
    .where(and(...docConditions, isNull(areas.archivedAt), eq(documents.docRole, 'context'), eq(documents.fileExt, 'md'), notInArray(areas.status, ['completed', 'on_hold'])))
    .orderBy(areas.name, documents.title);

  const all: DatedSection[] = [];
  for (const d of docs) {
    const docType = splitFrontmatter(d.bodyMd).meta.document_type;
    const priority = corePriority({ title: d.title, docType, updatedAt: new Date(0) });
    if (priority !== 0 && priority !== 2) continue; // state and log documents only
    const log = priority === 2;
    all.push(...datedSections(d.bodyMd, weekStart, last).map((s) => ({ ...s, area: d.area, document: d.title, log })));
  }
  const sections = all.filter((s) => s.count > 0);
  const candidates = all
    .filter((s) => s.leaf && (s.count >= 2 || (s.log && s.chars > LONG_LOG_SECTION)))
    .slice(0, WEEK_LIMITS.candidates);

  const order = ['morning', 'noon', 'afternoon', 'evening'];
  return {
    weekStart,
    items: activity.items,
    checkins: checkinRows
      .filter((r) => r.status !== 'pending')
      .sort((a, b) => a.day.localeCompare(b.day) || order.indexOf(a.slot) - order.indexOf(b.slot))
      .map((r) => {
        const s = r.summary as { summary?: unknown } | null;
        return { label: `${SLOT_NAME[r.slot].toLowerCase()} ${formatDateVi(r.day)}`, status: r.status, summary: typeof s?.summary === 'string' ? s.summary : null };
      }),
    sections,
    candidates,
  };
}

/** Whether anything happened in the week (the card is offered on its own only then). */
export const hasWeekActivity = (w: WeekActivity) => w.items.length > 0 || w.checkins.some((c) => c.status !== 'skipped');

/** Prompt text cannot open or close a tag. */
const safe = (s: string) => s.replace(/</g, '‹');

const STATUS_VI: Record<string, string> = { recorded: 'đã ghi lại', answered: 'đã trả lời', skipped: 'bỏ qua' };

/** The `<week_activity>` block of the weekly review prompt. */
export function weekActivityBlock(w: WeekActivity, tz: string): string {
  const when = (i: ActivityItem) => formatDateTimeVi(i.at, tz);
  const byArea = new Map<string, string[]>();
  for (const i of w.items.filter((x) => x.kind !== 'message')) {
    const key = i.area ?? 'Không thuộc mục nào';
    byArea.set(key, [...(byArea.get(key) ?? []), `- ${when(i)} · ${i.text}`]);
  }
  const messages = w.items.filter((x) => x.kind === 'message' && !CHECKIN_MESSAGE.test(x.text));
  const answers = w.items.filter((x) => x.kind === 'message' && CHECKIN_MESSAGE.test(x.text));
  const none = '- (không có)';
  const parts = [
    `Tuần ${formatDateVi(w.weekStart)}–${formatDateVi(weekEnd(w.weekStart))} (${w.weekStart} đến ${weekEnd(w.weekStart)}).`,
    '## Thay đổi bản ghi, tài liệu và đề xuất đã duyệt, theo từng mục',
    ...(byArea.size ? [...byArea].flatMap(([area, lines]) => [`### ${area}`, ...lines]) : [none]),
    '## Check-in',
    ...(w.checkins.length || answers.length
      ? [
          ...w.checkins.map((c) => `- ${c.label}: ${STATUS_VI[c.status] ?? c.status}${c.summary ? ` · ${c.summary}` : ''}`),
          ...answers.map((a) => `- ${when(a)} · ${a.text}`),
        ]
      : [none]),
    '## Tin nhắn của người dùng',
    ...(messages.length ? messages.map((m) => `- ${when(m)} · ${m.text}`) : [none]),
    '## Dòng tiến độ có ngày trong tuần (tài liệu trạng thái và nhật ký)',
    ...(w.sections.length
      ? w.sections.flatMap((s) => [`- ${s.area} · ${s.document} › ${s.heading}: ${s.count} dòng`, ...s.lines.map((l) => `  - ${l}`)])
      : [none]),
    '## Mục nên nén',
    ...(w.candidates.length
      ? w.candidates.map((s) => `- ${s.area} · ${s.document} › ${s.heading} (${s.count} dòng có ngày trong tuần, ${s.chars} ký tự)`)
      : [none]),
  ];
  return `<week_activity>\n${safe(parts.join('\n'))}\n</week_activity>`;
}
