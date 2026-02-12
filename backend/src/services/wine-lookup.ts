import type { WineValueResult } from '../types/wine.js';

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

// ── Wine-Searcher direct scraping ───────────────────────────────
// Wine-Searcher exposes structured data (JSON-LD) in its HTML that contains:
// - Average price (from meta description)
// - Critic reviews with scores
// - CellarTracker community score
// - Individual merchant offers with prices

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface WineSearcherData {
  retailPriceAvg: number | null;
  retailPriceMin: number | null;
  criticScore: number | null;
  communityScore: number | null;
  communityReviewCount: number | null;
}

// Map currency to Wine-Searcher country code
function currencyToCountry(currency: string): string {
  switch (currency) {
    case 'GBP': return 'uk';
    case 'EUR': return 'europe';
    case 'AUD': return 'australia';
    case 'CAD': return 'canada';
    default: return 'usa';
  }
}

async function scrapeWineSearcher(wine: WineValueResult, currency: string): Promise<WineSearcherData> {
  // Build Wine-Searcher URL
  const searchTerms = wine.name
    .replace(/['']/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, '+')
    .toLowerCase();
  const vintageStr = wine.vintage ? `/${wine.vintage}` : '';
  const country = currencyToCountry(currency);
  const url = `https://www.wine-searcher.com/find/${searchTerms}${vintageStr}/${country}`;

  console.log(`    Scraping: ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!response.ok) {
    console.log(`    Wine-Searcher returned ${response.status} for "${wine.name}"`);
    return { retailPriceAvg: null, retailPriceMin: null, criticScore: null, communityScore: null, communityReviewCount: null };
  }

  const html = await response.text();

  // ── Extract average price from meta description ──
  let retailPriceAvg: number | null = null;
  const metaDescMatch = html.match(/<meta name="description" content="([^"]+)"/);
  if (metaDescMatch) {
    const priceMatch = metaDescMatch[1].match(/Avg Price \(ex-tax\)\s*[£$€]?([\d,]+(?:\.\d{2})?)/);
    if (priceMatch) {
      retailPriceAvg = parseFloat(priceMatch[1].replace(/,/g, ''));
    }
  }

  // ── Extract JSON-LD structured data ──
  let criticScore: number | null = null;
  let communityScore: number | null = null;
  let communityReviewCount: number | null = null;
  let retailPriceMin: number | null = null;

  const ldMatches = html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
  for (const match of ldMatches) {
    try {
      const data = JSON.parse(match[1]);
      if (data['@type'] !== 'Product') continue;

      // Extract aggregate rating
      if (data.aggregateRating) {
        const aggRating = data.aggregateRating.ratingValue;
        const aggCount = data.aggregateRating.ratingCount;
        if (aggRating && !criticScore) {
          criticScore = typeof aggRating === 'number' ? aggRating : parseInt(aggRating);
        }
        if (aggCount) {
          communityReviewCount = typeof aggCount === 'number' ? aggCount : parseInt(aggCount);
        }
      }

      // Extract critic reviews (includes CellarTracker)
      if (Array.isArray(data.review)) {
        let highestCritic: number | null = null;

        for (const review of data.review) {
          const author = review.author?.name || '';
          const rating = review.reviewRating?.ratingValue;
          if (!rating) continue;

          const score = typeof rating === 'number' ? rating : parseFloat(rating);

          if (author === 'CellarTracker') {
            communityScore = score;
          } else {
            // It's a critic review — track the highest
            if (highestCritic === null || score > highestCritic) {
              highestCritic = score;
            }
          }
        }

        if (highestCritic !== null) {
          criticScore = highestCritic;
        }
      }

      // Extract min price from offers
      if (Array.isArray(data.offers) && data.offers.length > 0) {
        const perBottlePrices: number[] = [];
        for (const offer of data.offers) {
          const price = parseFloat(offer.price);
          if (isNaN(price) || price <= 0) continue;

          const desc = (offer.description || '').toLowerCase();
          let perBottle = price;
          if (desc.includes('case of 6')) perBottle = price / 6;
          else if (desc.includes('case of 12')) perBottle = price / 12;
          else if (desc.includes('case of 3')) perBottle = price / 3;

          perBottlePrices.push(Math.round(perBottle * 100) / 100);
        }

        if (perBottlePrices.length > 0) {
          retailPriceMin = Math.min(...perBottlePrices);
          // If we didn't get avg from meta description, calculate from offers
          if (retailPriceAvg === null) {
            retailPriceAvg = Math.round((perBottlePrices.reduce((a, b) => a + b, 0) / perBottlePrices.length) * 100) / 100;
          }
        }
      }
    } catch {
      // Skip malformed JSON-LD
    }
  }

  return { retailPriceAvg, retailPriceMin, criticScore, communityScore, communityReviewCount };
}

// ── Single wine lookup ──────────────────────────────────────────
async function lookupSingleWine(wine: WineValueResult, currency: string): Promise<WineLookupData> {
  try {
    const data = await scrapeWineSearcher(wine, currency);
    console.log(`    ${wine.name}: price=${data.retailPriceAvg}, critic=${data.criticScore}, community=${data.communityScore}`);
    return data;
  } catch (err) {
    console.error(`    Error scraping "${wine.name}":`, (err as Error).message);
    return { retailPriceAvg: null, retailPriceMin: null, criticScore: null, communityScore: null, communityReviewCount: null };
  }
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

  // Look up each uncached wine in parallel
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
