import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import type { WineValueResult } from '../types/wine.js';

const client = new Anthropic({
  apiKey: config.anthropicApiKey,
  timeout: 5 * 60 * 1000, // 5 min timeout
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

// ── Build Wine-Searcher URL ─────────────────────────────────────
function buildWineSearcherUrl(wine: WineValueResult, currency: string): string {
  const searchTerms = wine.name
    .replace(/['']/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, '+')
    .toLowerCase();
  const vintageStr = wine.vintage ? `/${wine.vintage}` : '';
  const country = currency === 'GBP' ? '/uk'
    : currency === 'EUR' ? '/europe'
    : currency === 'AUD' ? '/australia'
    : '/usa';
  return `https://www.wine-searcher.com/find/${searchTerms}${vintageStr}${country}`;
}

// ── Single wine lookup with web search + web fetch ──────────────
async function lookupSingleWine(wine: WineValueResult, currency: string): Promise<WineLookupData> {
  const vintageStr = wine.vintage ?? 'NV';
  const producer = wine.producer || '';
  const wsUrl = buildWineSearcherUrl(wine, currency);

  const currencyLabel = currency === 'GBP' ? 'British Pounds (GBP/£)'
    : currency === 'EUR' ? 'Euros (EUR/€)'
    : 'US Dollars (USD/$)';

  const prompt = `I need you to fetch the Wine-Searcher page for this wine and extract pricing and rating data.

Wine: "${wine.name}" ${vintageStr}
Producer: "${producer}"

Wine-Searcher URL: ${wsUrl}

Please fetch this Wine-Searcher URL and extract:
1. The average retail price (look in the meta description for "Avg Price (ex-tax)" or in the page content)
2. Critic scores (look in the JSON-LD structured data for "CriticReview" entries — Parker, Suckling, Wine Spectator, Vinous, Jancis Robinson, Decanter)
3. CellarTracker community score (look in JSON-LD for a review where author name is "CellarTracker")

If the Wine-Searcher page doesn't load or shows a search results list instead of a wine page, search for "${producer} ${wine.name.replace(producer, '').trim()} ${vintageStr} wine-searcher" to find the correct page, then fetch that.

Also search for "${producer} ${wine.name.replace(producer, '').trim()} ${vintageStr} cellartracker" for community score if not found on Wine-Searcher.

Prices must be in ${currencyLabel}.

Return ONLY a JSON object, no explanation:
{"retailPriceAvg": <number or null>, "retailPriceMin": <number or null>, "criticScore": <number 0-100 or null>, "communityScore": <number 0-100 or null>, "communityReviewCount": <number or null>}`;

  // Build user location for currency-appropriate results
  const userLocation = currency === 'GBP'
    ? { type: 'approximate', country: 'GB', region: 'England', city: 'London' }
    : currency === 'EUR'
    ? { type: 'approximate', country: 'FR', region: 'Ile-de-France', city: 'Paris' }
    : { type: 'approximate', country: 'US', region: 'New York', city: 'New York' };

  const requestBody: any = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    betas: ['web-fetch-2025-09-10'],
    messages: [{ role: 'user', content: prompt }],
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 3,
        allowed_domains: ['wine-searcher.com', 'cellartracker.com'],
        user_location: userLocation,
      },
      {
        type: 'web_fetch_20250910',
        name: 'web_fetch',
        max_uses: 2,
        allowed_domains: ['wine-searcher.com', 'cellartracker.com'],
      },
    ],
  };

  let response = await (client.beta as any).messages.create(requestBody);

  // Handle pause_turn — continue the conversation if Claude paused
  let attempts = 0;
  while ((response.stop_reason as string) === 'pause_turn' && attempts < 6) {
    attempts++;
    console.log(`    pause_turn for "${wine.name}", continuing (attempt ${attempts})...`);
    requestBody.messages = [
      { role: 'user', content: prompt },
      { role: 'assistant', content: response.content },
      { role: 'user', content: 'Please continue and provide the JSON result.' },
    ];
    response = await (client.beta as any).messages.create(requestBody);
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
