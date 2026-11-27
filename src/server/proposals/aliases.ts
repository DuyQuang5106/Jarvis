/** "môn tư tưởng" → "tư tưởng": the user types the subject's own name, not the word "môn" in front of it. */
export function cleanAlias(raw: string): string {
  return raw.trim().replace(/^(môn học|môn|dự án)\s+/iu, '').trim();
}

/**
 * The aliases an area has after a proposal adds some: existing ones first, then the new ones, without
 * duplicates (case-insensitive) and without repeating the area's own name. Nothing is ever removed.
 */
export function mergeAliases(current: readonly string[], add: readonly string[], name?: string): string[] {
  const seen = new Set([...(name ? [name] : []), ...current].map((a) => a.trim().toLocaleLowerCase('vi')));
  const out = [...current];
  for (const raw of add) {
    const alias = cleanAlias(raw);
    if (alias.length < 2) continue;
    const key = alias.toLocaleLowerCase('vi');
    if (!alias || seen.has(key)) continue;
    seen.add(key);
    out.push(alias);
  }
  return out;
}
