const FENCE = '---';
const MAX_LINES = 60;
const META = /^([a-z0-9_]+):[ \t]*(.*?)[ \t]*$/;
/** Lines a YAML block may hold: `key: value`, indented continuations, list items. Anything else means Markdown. */
const YAML_LINE = /^(?:[A-Za-z0-9_-]+:(?:[ \t].*)?|[ \t]+\S.*|-[ \t].*|-)$/;

const unquote = (value: string) => (/^(["']).*\1$/.test(value) && value.length >= 2 ? value.slice(1, -1) : value);

/**
 * Splits a leading YAML frontmatter block from Markdown. Only a block that opens with a first line of
 * exactly `---`, closes with a `---` line within the first 60 lines and holds nothing but YAML-looking
 * lines counts; otherwise the text is returned untouched so a horizontal rule never swallows content.
 */
export function splitFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const lines = text.split('\n');
  if (lines[0]?.replace(/\r$/, '') !== FENCE) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  for (let i = 1; i < Math.min(lines.length, MAX_LINES); i++) {
    const line = lines[i].replace(/\r$/, '');
    if (line === FENCE) return { meta, body: lines.slice(i + 1).join('\n') };
    if (!line.trim()) continue;
    if (!YAML_LINE.test(line)) break;
    const pair = META.exec(line);
    if (pair && pair[2]) meta[pair[1]] = unquote(pair[2]);
  }
  return { meta: {}, body: text };
}
