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

// ── Batch lookup with web search ────────────────────────────────
export async function lookupWinesBatch(wines: WineValueResult[], currency: string = 'USD'): Promise<WineLookupData[]> {
  const currencySymbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';

  // Check cache first
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

  // Build wine list for uncached wines
  const uncachedWines = uncachedIndices.map(i => wines[i]);
  const wineList = uncachedWines.map((w, i) =>
    `${i + 1}. ${w.name} (${w.vintage ?? 'NV'}) ${w.region || ''} — restaurant price: ${currencySymbol}${w.restaurantPrice}`
  ).join('\n');

  const prompt = `I need REAL current retail prices and ratings for these wines. Use web search to look up ACTUAL data from wine-searcher.com and cellartracker.com.

For each wine, search for:
1. The current average retail price and minimum retail price (in ${currency}) from wine-searcher.com
2. The professional critic score (from Wine Advocate, Wine Spectator, Jancis Robinson, James Suckling, Vinous, or Decanter) — use the highest available
3. The CellarTracker community score and number of tasting notes

Here are the wines:
${wineList}

After searching, return ONLY a JSON array (no markdown, no explanation) with one object per wine in the same order. Each object must have:
- retailPriceAvg: number or null (average retail price in ${currency})
- retailPriceMin: number or null (lowest retail price in ${currency})
- criticScore: number or null (professional critic score, 100-point scale)
- communityScore: number or null (CellarTracker community score, 100-point scale)
- communityReviewCount: number or null (number of CellarTracker tasting notes)

Use null only if you truly cannot find the data after searching. Return the JSON array only:`;

  // Allow generous web searches for the batch — up to 20 searches for thorough lookups
  const maxSearches = Math.min(uncachedWines.length * 2, 20);

  const requestBody: any = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
    tools: [{
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: maxSearches,
    }],
  };

  const response = await client.messages.create(requestBody);

  // Extract the final text block (after all search results)
  const textBlocks = response.content.filter(b => b.type === 'text');
  const lastTextBlock = textBlocks[textBlocks.length - 1];

  if (!lastTextBlock || lastTextBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  let jsonStr = lastTextBlock.text.trim();

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
    console.error('Failed to parse lookup response. Raw text:', lastTextBlock.text.substring(0, 500));
    // Try to find JSON in ALL text blocks (Claude might put it in an earlier one)
    for (const block of textBlocks) {
      if (block.type === 'text') {
        let tryStr = block.text.trim();
        if (tryStr.startsWith('```')) {
          tryStr = tryStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
        }
        const fb = tryStr.indexOf('[');
        const lb = tryStr.lastIndexOf(']');
        if (fb !== -1 && lb !== -1 && lb > fb) {
          try {
            apiResults = JSON.parse(tryStr.substring(fb, lb + 1));
            break;
          } catch { /* continue */ }
        }
      }
    }
    if (!apiResults!) {
      throw err;
    }
  }

  // Log search usage
  const searchUse = (response.usage as any)?.server_tool_use;
  if (searchUse) {
    console.log(`  Web searches used: ${searchUse.web_search_requests}`);
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
  console.log(`  Result: ${found}/${apiResults.length} wines with price data`);

  return results as WineLookupData[];
}
