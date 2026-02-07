import { distance } from 'fastest-levenshtein';

const ABBREVIATIONS: [RegExp, string][] = [
  [/\bch\.\s*/gi, 'Chateau '],
  [/\bcht\.\s*/gi, 'Chateau '],
  [/\bdom\.\s*/gi, 'Domaine '],
  [/\bst\.\s*/gi, 'Saint '],
  [/\bst\s+/gi, 'Saint '],
  [/\bmt\.\s*/gi, 'Mount '],
  [/\bcab\.\s*/gi, 'Cabernet '],
  [/\bsauv\.\s*/gi, 'Sauvignon '],
  [/\bchard\.\s*/gi, 'Chardonnay '],
  [/\bries\.\s*/gi, 'Riesling '],
  [/\bpnt?\.\s*/gi, 'Pinot '],
  [/\bgrn?\.\s*/gi, 'Grand '],
  [/\bvyd\.?\s*/gi, 'Vineyard '],
  [/\bvly\.?\s*/gi, 'Valley '],
];

export function normalizeWineName(raw: string): string {
  let name = raw.trim();

  // Expand abbreviations
  for (const [pattern, replacement] of ABBREVIATIONS) {
    name = name.replace(pattern, replacement);
  }

  // Normalize vintage shorthand: '18 -> 2018, '98 -> 1998
  name = name.replace(/'(\d{2})\b/g, (_, year) => {
    const num = parseInt(year);
    return num > 50 ? `19${year}` : `20${year}`;
  });

  // Remove extra whitespace
  name = name.replace(/\s+/g, ' ').trim();

  return name;
}

export function buildSearchQuery(name: string, vintage: number | null): string {
  const normalized = normalizeWineName(name);
  return vintage ? `${normalized} ${vintage}` : normalized;
}

export function isCloseMatch(a: string, b: string, threshold = 0.35): boolean {
  const na = normalizeWineName(a).toLowerCase();
  const nb = normalizeWineName(b).toLowerCase();
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return true;
  return distance(na, nb) / maxLen <= threshold;
}
