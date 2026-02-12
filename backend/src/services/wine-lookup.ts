import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import type { WineValueResult } from '../types/wine.js';

const client = new Anthropic({
  apiKey: config.anthropicApiKey,
  timeout: 3 * 60 * 1000, // 3 min timeout per request
});

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

// ── Single wine lookup with web search ──────────────────────────
async function lookupSingleWine(wine: WineValueResult, currency: string): Promise<WineLookupData> {
  const vintageStr = wine.vintage ?? 'NV';
  // Build a concise search name: producer + key wine name (without long descriptors)
  const producer = wine.producer || '';
  const simpleName = producer ? `${producer} ${wine.name.replace(producer, '').trim()}` : wine.name;

  const prompt = `Find retail price and ratings for this wine. Return JSON only.

Wine: "${wine.name}"
Producer: ${producer || 'unknown'}
Vintage: ${vintageStr}

Search wine-searcher.com for "${simpleName} ${vintageStr}" to find:
- Average retail price and lowest price for a 750ml bottle in ${currency}
- Critic score (Parker, Suckling, Wine Spectator, Vinous, or Decanter)

Then search cellartracker.com for "${producer} ${vintageStr}" to find community score.

${currency === 'GBP' ? 'Prices in GBP (£).' : currency === 'EUR' ? 'Prices in EUR (€).' : 'Prices in USD ($).'}

Return ONLY JSON (no markdown):
{"retailPriceAvg": <number or null>, "retailPriceMin": <number or null>, "criticScore": <number 0-100 or null>, "communityScore": <number 0-100 or null>, "communityReviewCount": <number or null>}`;

  const requestBody: any = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
    tools: [{
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 5,
    }],
  };

  let response = await client.messages.create(requestBody);

  // Handle pause_turn — continue the conversation if Claude paused
  let attempts = 0;
  while ((response.stop_reason as string) === 'pause_turn' && attempts < 5) {
    attempts++;
    console.log(`    pause_turn for "${wine.name}", continuing (attempt ${attempts})...`);
    requestBody.messages = [
      { role: 'user', content: prompt },
      { role: 'assistant', content: response.content },
      { role: 'user', content: 'Please continue and provide the JSON result.' },
    ];
    response = await client.messages.create(requestBody);
  }

  // Extract JSON from response
  const textBlocks = response.content.filter((b: any) => b.type === 'text');

  for (const block of [...textBlocks].reverse()) {
    if (block.type !== 'text') continue;
    let str = block.text.trim();

    // Strip markdown fences
    if (str.startsWith('```')) {
      str = str.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    // Find JSON object
    const firstBrace = str.indexOf('{');
    const lastBrace = str.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(str.substring(firstBrace, lastBrace + 1));
      } catch { /* try next block */ }
    }
  }

  console.log(`    No valid JSON for "${wine.name}", returning nulls`);
  return { retailPriceAvg: null, retailPriceMin: null, criticScore: null, communityScore: null, communityReviewCount: null };
}

// ── Batch lookup — runs individual lookups in parallel ───────────
export async function lookupWinesBatch(wines: WineValueResult[], currency: string = 'USD'): Promise<WineLookupData[]> {
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

  // Look up each uncached wine individually (in parallel within this batch)
  const lookupPromises = uncachedIndices.map(async (origIdx) => {
    const wine = wines[origIdx];
    try {
      const data = await lookupSingleWine(wine, currency);
      setCache(wine, currency, data);
      return { origIdx, data };
    } catch (err) {
      console.error(`  Error looking up "${wine.name}":`, (err as Error).message);
      const nullData: WineLookupData = { retailPriceAvg: null, retailPriceMin: null, criticScore: null, communityScore: null, communityReviewCount: null };
      return { origIdx, data: nullData };
    }
  });

  const lookupResults = await Promise.all(lookupPromises);

  for (const { origIdx, data } of lookupResults) {
    results[origIdx] = data;
  }

  const found = lookupResults.filter(r => r.data.retailPriceAvg !== null).length;
  console.log(`  Result: ${found}/${uncachedIndices.length} wines with price data`);

  return results as WineLookupData[];
}
