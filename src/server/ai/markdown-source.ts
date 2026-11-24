type SourceLine = {
  text: string;
  start: number;
  end: number;
  fenced: boolean;
  heading?: { label: string; level: number; end: number };
  checklist?: { label: string; mark: number };
};

const ATX = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const CHECKLIST = /^( {0,3}(?:[-+*]|\d+[.)])[ \t]+\[)([ xX])\][ \t]+(.+)$/;

export function readMarkdownLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let fence: { marker: string; length: number } | undefined;
  for (const match of source.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)) {
    const raw = match[0];
    if (!raw) continue;
    const text = raw.replace(/[\r\n]+$/, '');
    const start = match.index;
    const marker = FENCE.exec(text);
    const previous = lines.at(-1);
    const line: SourceLine = { text, start, end: start + raw.length, fenced: !!fence || !!marker };
    lines.push(line);
    if (fence) {
      if (marker && marker[1][0] === fence.marker && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      continue;
    }
    if (marker) {
      fence = { marker: marker[1][0], length: marker[1].length };
      continue;
    }
    const atx = ATX.exec(text);
    if (atx) {
      line.heading = { label: atx[2].replace(/[ \t]+#+[ \t]*$/, '').trim(), level: atx[1].length, end: line.end };
      continue;
    }
    const underline = SETEXT.exec(text);
    if (underline && previous && canBeSetext(previous)) {
      previous.heading = { label: previous.text.trim(), level: underline[1][0] === '=' ? 1 : 2, end: line.end };
      continue;
    }
    const checklist = CHECKLIST.exec(text);
    if (checklist) line.checklist = { label: checklist[3].trim(), mark: start + checklist[1].length };
  }
  return lines;
}

function canBeSetext(line: SourceLine): boolean {
  return !line.heading && !line.fenced && !line.checklist && !!line.text.trim() &&
    !/^(?: {4}|\t| {0,3}(?:[>\x60~]|(?:[-+*]|\d+[.)])[ \t]|(?:[-*_][ \t]*){3,}$))/.test(line.text);
}
