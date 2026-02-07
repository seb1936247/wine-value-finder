import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import type { WineValueResult } from '../types/wine.js';

const client = new Anthropic({ apiKey: config.anthropicApiKey });

export interface WineLookupData {
  retailPriceAvg: number | null;
  retailPriceMin: number | null;
  criticScore: number | null;
  communityScore: number | null;
  communityReviewCount: number | null;
}

// ── In-memory cache ─────────────────────────────────────────────
// Key = normalized "name|vintage|currency", e.g. "chateau margaux|2015|GBP"
const lookupCache = new Map<string, { data: WineLookupData; ts: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function cacheKey(wine: WineValueResult, currency: string): string {
  const name = wine.name.toLowerCase().trim();
  const vintage = wine.vintage ?? 'nv';
  return `${name}|${vintage}|${currency}`;
}

function getCached(wine: WineValueResult, currency: string): WineLookupData | null {
  const key = cacheKey(wine, currency);
  const entry = lookupCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) {
    return entry.data;
  }
  if (entry) lookupCache.delete(key);
  return null;
}

function setCache(wine: WineValueResult, currency: string, data: WineLookupData): void {
  lookupCache.set(cacheKey(wine, currency), { data, ts: Date.now() });
}

export function getCacheStats() {
  return { size: lookupCache.size };
}

// ── Batch lookup ────────────────────────────────────────────────
export async function lookupWinesBatch(wines: WineValueResult[], currency: string = 'USD'): Promise<WineLookupData[]> {
  const currencySymbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';

  // Check cache first — separate cached vs uncached
  const results: (WineLookupData | null)[] = new Array(wines.length).fill(null);
  const uncachedIndices: number[] = [];

  for (let i = 0; i < wines.length; i++) {
    const cached = getCached(wines[i], currency);
    if (cached) {
      results[i] = cached;
    } else {
      uncachedIndices.push(i);
    }
  }

  const cachedCount = wines.length - uncachedIndices.length;
  if (cachedCount > 0) {
    console.log(`  Cache hit: ${cachedCount}/${wines.length} wines`);
  }

  if (uncachedIndices.length === 0) {
    return results as WineLookupData[];
  }

  // Build compact list for uncached wines only
  const uncachedWines = uncachedIndices.map(i => wines[i]);
  const wineList = uncachedWines.map((w, i) =>
    `${i + 1}. ${w.name} (${w.vintage ?? 'NV'}) ${w.region || ''} — ${currencySymbol}${w.restaurantPrice}`
  ).join('\n');

  const prompt = `Wine price/rating lookup. Currency: ${currency}. For each wine return JSON array with: retailPriceAvg, retailPriceMin (in ${currency}), criticScore (100-pt), communityScore (100-pt), communityReviewCount.

Give best estimates. Use null ONLY if truly unknown. These are restaurant wines from known producers.
${currency === 'GBP' ? 'Use UK retail prices.' : currency === 'EUR' ? 'Use EU retail prices.' : ''}

${wineList}

JSON array only, no markdown:`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  let jsonStr = textBlock.text.trim();

  // Strip markdown code fences if present
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '');
    jsonStr = jsonStr.replace(/\n?```\s*$/, '');
  }

  // Fallback: find the array
  if (!jsonStr.startsWith('[')) {
    const firstBracket = jsonStr.indexOf('[');
    const lastBracket = jsonStr.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
      jsonStr = jsonStr.substring(firstBracket, lastBracket + 1);
    }
  }

  let apiResults: WineLookupData[];
  try {
    apiResults = JSON.parse(jsonStr.trim());
  } catch (err) {
    console.error('Failed to parse lookup response. Raw text:', textBlock.text.substring(0, 500));
    throw err;
  }

  // Map results back and populate cache
  for (let j = 0; j < uncachedIndices.length; j++) {
    const origIdx = uncachedIndices[j];
    const data = apiResults[j];
    if (data) {
      results[origIdx] = data;
      setCache(wines[origIdx], currency, data);
    }
  }

  const found = apiResults.filter(r => r.retailPriceAvg !== null).length;
  console.log(`  API result: ${found}/${apiResults.length} wines with price data`);

  return results as WineLookupData[];
}
