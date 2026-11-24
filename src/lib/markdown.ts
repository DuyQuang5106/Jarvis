/**
 * Helpers for GFM Markdown documents: lossless checklist toggling, heading outline extraction,
 * and section hashing/splitting without mutating unrelated formatting.
 */

export type MarkdownHeading = { level: number; text: string; line: number };

const FENCE_RE = /^ {0,3}(```|~~~)/;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*$/;
const CHECKLIST_RE = /^(\s*[-*+]\s+\[)([ xX])(\]\s+.*)$/;

export function extractHeadings(md: string): MarkdownHeading[] {
  const lines = md.split(/\r?\n/);
  const out: MarkdownHeading[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = HEADING_RE.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2].trim(), line: i });
  }
  return out;
}

/**
 * Toggles the Nth GFM task list item (`- [ ]` / `- [x]`, ignoring fenced code blocks)
 * while leaving every other line byte-for-byte identical.
 */
export function toggleChecklistAt(md: string, targetIndex: number): string {
  const eol = md.includes('\r\n') ? '\r\n' : '\n';
  const lines = md.split(/\r?\n/);
  let inFence = false;
  let seen = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (FENCE_RE.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = CHECKLIST_RE.exec(lines[i]);
    if (!m) continue;
    if (seen === targetIndex) {
      const nextMark = m[2] === ' ' ? 'x' : ' ';
      lines[i] = `${m[1]}${nextMark}${m[3]}`;
      return lines.join(eol);
    }
    seen += 1;
  }
  return md;
}

/** Toggles a GFM task list item at an exact 1-based source line number (from remark AST position). */
export function toggleChecklistAtLine(md: string, lineOneBased: number): string {
  const eol = md.includes('\r\n') ? '\r\n' : '\n';
  const lines = md.split(/\r?\n/);
  const idx = lineOneBased - 1;
  if (idx < 0 || idx >= lines.length) return md;
  const m = CHECKLIST_RE.exec(lines[idx]);
  if (!m) return md;
  const nextMark = m[2] === ' ' ? 'x' : ' ';
  lines[idx] = `${m[1]}${nextMark}${m[3]}`;
  return lines.join(eol);
}
