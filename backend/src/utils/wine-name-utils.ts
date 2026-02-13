// ── Common wine producer abbreviation expansions ─────────────────
const PRODUCER_EXPANSIONS: Record<string, string> = {
  'py': 'Pierre-Yves',
  'jl': 'Jean-Louis',
  'jm': 'Jean-Marc',
  'jp': 'Jean-Pierre',
  'jf': 'Jean-François',
  'jb': 'Jean-Baptiste',
  'fl': 'François-Louis',
  'ch': 'Chateau',
  'ch.': 'Chateau',
  'dom': 'Domaine',
  'dom.': 'Domaine',
  'cht': 'Chateau',
  'cht.': 'Chateau',
  'mme': 'Madame',
};

export function expandProducerName(producer: string): string {
  const words = producer.split(/\s+/);
  const expanded = words.map(w => {
    const lower = w.toLowerCase();
    return PRODUCER_EXPANSIONS[lower] || w;
  });
  return expanded.join(' ');
}

/**
 * Build a search-friendly wine name for API queries.
 * Expands producer abbreviations, combines producer + wine name, strips extra whitespace.
 */
export function buildSearchName(name: string, producer: string): string {
  const expandedProducer = expandProducerName(producer || '');
  const winePart = name.replace(producer, '').trim();
  return `${expandedProducer} ${winePart}`.trim();
}

/**
 * Format a wine name for the Wine-Searcher API (spaces → +, no special chars).
 */
export function buildApiWineName(name: string, producer: string): string {
  const searchName = buildSearchName(name, producer);
  // API expects + for spaces and no special URL characters
  return searchName.replace(/\s+/g, '+');
}
