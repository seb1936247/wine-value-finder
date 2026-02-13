import type { WineValueResult } from '../types/wine.js';
import { lookupViaWineSearcherApi, getRemainingApiCalls } from './wine-searcher-api.js';
import { lookupCommunityScore } from './community-lookup.js';
import { lookupViaWebSearch } from './web-search-fallback.js';

// ── Types ──────────────────────────────────────────────────────
export interface WineLookupData {
  retailPriceAvg: number | null;
  retailPriceMin: number | null;
  criticScore: number | null;
  communityScore: number | null;
  communityReviewCount: number | null;
  dataSource?: 'api' | 'web_search' | 'mixed';
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

export function clearWineCache(wine: WineValueResult, currency: string): void {
  lookupCache.delete(cacheKey(wine, currency));
}

export function getLookupStatus(): { apiCallsRemaining: number; cacheSize: number } {
  return {
    apiCallsRemaining: getRemainingApiCalls(),
    cacheSize: lookupCache.size,
  };
}

// ── Single wine lookup — orchestrator ───────────────────────────
// Strategy:
// 1. Wine-Searcher API for price + critic (fast, accurate)
// 2. In parallel: Claude web search for CellarTracker community score
// 3. If API fails: Claude web search fallback for price + critic
async function lookupSingleWine(wine: WineValueResult, currency: string): Promise<WineLookupData> {
  // Run API call and community score lookup IN PARALLEL
  const [apiResult, communityResult] = await Promise.allSettled([
    lookupViaWineSearcherApi(wine.name, wine.producer, wine.vintage, currency),
    lookupCommunityScore(wine.name, wine.producer, wine.vintage),
  ]);

  const apiData = apiResult.status === 'fulfilled' ? apiResult.value : null;
  const communityData = communityResult.status === 'fulfilled' ? communityResult.value : null;

  let result: WineLookupData = {
    retailPriceAvg: null,
    retailPriceMin: null,
    criticScore: null,
    communityScore: communityData?.communityScore ?? null,
    communityReviewCount: communityData?.communityReviewCount ?? null,
    dataSource: undefined,
  };

  if (apiData && apiData.status === 'success' && (apiData.retailPriceAvg !== null || apiData.criticScore !== null)) {
    // API gave us good data
    result.retailPriceAvg = apiData.retailPriceAvg;
    result.retailPriceMin = apiData.retailPriceMin;
    result.criticScore = apiData.criticScore;
    result.dataSource = communityData?.communityScore !== null ? 'mixed' : 'api';
    console.log(`  [API] "${wine.name}" ${wine.vintage ?? 'NV'}: avg=${apiData.retailPriceAvg}, critic=${apiData.criticScore}`);
  } else {
    // API failed or unavailable — fall back to web search
    const reason = apiData?.status ?? 'error';
    console.log(`  [API] "${wine.name}" ${wine.vintage ?? 'NV'}: ${reason}, falling back to web search`);

    const fallbackData = await lookupViaWebSearch(wine, currency);
    result.retailPriceAvg = fallbackData.retailPriceAvg;
    result.retailPriceMin = fallbackData.retailPriceMin;
    result.criticScore = fallbackData.criticScore;
    result.dataSource = 'web_search';

    // If community score wasn't found by dedicated lookup, use fallback's data
    if (result.communityScore === null) {
      result.communityScore = fallbackData.communityScore;
      result.communityReviewCount = fallbackData.communityReviewCount;
    }
  }

  return result;
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
