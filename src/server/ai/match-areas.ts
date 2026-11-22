export function normalizeVi(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(s: string): string[] {
  const n = normalizeVi(s);
  return n ? n.split(' ') : [];
}

function containsRun(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((t, j) => haystack[i + j] === t)) return true;
  }
  return false;
}

export function matchAreas(
  texts: string[],
  areas: { id: string; name: string; aliases: string[] }[],
): string[] {
  const textTokens = texts.map(tokens);
  const ids: string[] = [];
  for (const area of areas) {
    if (ids.includes(area.id)) continue;
    const hit = [area.name, ...area.aliases].some((label) => {
      const norm = normalizeVi(label);
      if (norm.length < 2) return false;
      const needle = norm.split(' ');
      return textTokens.some((t) => containsRun(t, needle));
    });
    if (hit) ids.push(area.id);
  }
  return ids;
}
