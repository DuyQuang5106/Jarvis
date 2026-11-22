/** Lowercase, strip diacritics, đ -> d: so "tu tuong" finds "Tư tưởng". */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
}

export function matchesQuery(area: { name: string; aliases: string[] }, query: string): boolean {
  const q = normalize(query.trim());
  if (!q) return true;
  return [area.name, ...area.aliases].some((t) => normalize(t).includes(q));
}
