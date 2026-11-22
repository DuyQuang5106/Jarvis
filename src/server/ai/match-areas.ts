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

/** Tokens of the text as typed: diacritics and case kept. */
function originalTokens(s: string): string[] {
  return s.normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Aliases this short (normalized) would match everyday Vietnamese words once diacritics are dropped. */
const SHORT_ALIAS = 3;
/** Short aliases that are also common words: they must be typed in capitals ("RA", not "ra"). */
const COMMON_WORDS = new Set(
  'ra ai ma la co da se di do de ve an em cho con khi nay gi toi ban len xem hay thi vi ne'.split(' '),
);

const isUpper = (t: string) => t === t.toUpperCase() && t !== t.toLowerCase();

/**
 * A short alias matches only a token typed with the same letters and diacritics (any case), so "sẽ" is
 * not "SE"; one that is also a common word must be in capitals. Names and longer aliases ignore diacritics.
 */
function matchesShortAlias(textTokens: string[], alias: string, norm: string): boolean {
  const lower = (t: string) => t.toLocaleLowerCase('vi');
  const needle = originalTokens(alias).map(lower);
  const mustBeUpper = COMMON_WORDS.has(norm);
  if (needle.length === 0 || needle.length > textTokens.length) return false;
  for (let i = 0; i + needle.length <= textTokens.length; i++) {
    if (needle.every((t, j) => lower(textTokens[i + j]) === t && (!mustBeUpper || isUpper(textTokens[i + j])))) return true;
  }
  return false;
}

export function matchAreas(
  texts: string[],
  areas: { id: string; name: string; aliases: string[] }[],
): string[] {
  const textTokens = texts.map(tokens);
  const typedTokens = texts.map(originalTokens);
  const ids: string[] = [];
  for (const area of areas) {
    if (ids.includes(area.id)) continue;
    const labels = [
      { label: area.name, alias: false },
      ...area.aliases.map((label) => ({ label, alias: true })),
    ];
    const hit = labels.some(({ label, alias }) => {
      const norm = normalizeVi(label);
      if (norm.length < 2) return false;
      if (alias && norm.length <= SHORT_ALIAS) return typedTokens.some((t) => matchesShortAlias(t, label, norm));
      const needle = norm.split(' ');
      return textTokens.some((t) => containsRun(t, needle));
    });
    if (hit) ids.push(area.id);
  }
  return ids;
}
