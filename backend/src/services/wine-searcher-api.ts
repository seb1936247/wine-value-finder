import { config } from '../config.js';
import { buildApiWineName } from '../utils/wine-name-utils.js';

// ── Types ──────────────────────────────────────────────────────
export interface WineSearcherApiResult {
  status: 'success' | 'no_match' | 'ambiguous' | 'error' | 'rate_limited';
  retailPriceAvg: number | null;
  retailPriceMin: number | null;
  retailPriceMax: number | null;
  criticScore: number | null;
  region: string | null;
  grape: string | null;
  matchedName: string | null;
}

const NULL_RESULT: WineSearcherApiResult = {
  status: 'error',
  retailPriceAvg: null,
  retailPriceMin: null,
  retailPriceMax: null,
  criticScore: null,
  region: null,
  grape: null,
  matchedName: null,
};

// ── Daily rate tracking (100 calls/day free trial) ──────────────
let dailyCallCount = 0;
let dailyResetDate = new Date().toDateString();
const DAILY_LIMIT = 95; // 5-call buffer below 100

function checkAndIncrementDailyLimit(): boolean {
  const today = new Date().toDateString();
  if (today !== dailyResetDate) {
    dailyCallCount = 0;
    dailyResetDate = today;
  }
  if (dailyCallCount >= DAILY_LIMIT) return false;
  dailyCallCount++;
  return true;
}

export function getRemainingApiCalls(): number {
  const today = new Date().toDateString();
  if (today !== dailyResetDate) return DAILY_LIMIT;
  return Math.max(0, DAILY_LIMIT - dailyCallCount);
}

// ── API currency code mapping ──────────────────────────────────
const CURRENCY_CODES: Record<string, string> = {
  USD: 'USD',
  GBP: 'GBP',
  EUR: 'EUR',
  AUD: 'AUD',
  CAD: 'CAD',
  CHF: 'CHF',
};

// ── Parse Wine-Searcher API response ───────────────────────────
function parseApiResponse(data: any): WineSearcherApiResult {
  // The Wine Check API returns a JSON object with status and wine data
  // Response structure varies; handle multiple formats
  try {
    // Check status code
    const statusCode = data?.status ?? data?.['status-code'] ?? data?.statusCode;

    if (statusCode === 1 || statusCode === 9) {
      return { ...NULL_RESULT, status: 'no_match' };
    }
    if (statusCode === 8) {
      return { ...NULL_RESULT, status: 'ambiguous' };
    }
    if (statusCode === 5 || statusCode === 6 || statusCode === 7) {
      return { ...NULL_RESULT, status: 'rate_limited' };
    }
    if (statusCode !== 0 && statusCode !== undefined) {
      return { ...NULL_RESULT, status: 'error' };
    }

    // Extract wine data — handle both flat and nested response structures
    const wines = data?.wines ?? data?.wine ?? data?.List ?? [data];
    const wine = Array.isArray(wines) ? wines[0] : wines;

    if (!wine) {
      return { ...NULL_RESULT, status: 'no_match' };
    }

    // Price fields — try multiple possible field names
    const priceAvg = parseFloat(wine['price-average'] ?? wine['Price-Average'] ?? wine['priceAverage'] ?? wine['average_price'] ?? '');
    const priceMin = parseFloat(wine['price-min'] ?? wine['Price-Min'] ?? wine['priceMin'] ?? wine['min_price'] ?? '');
    const priceMax = parseFloat(wine['price-max'] ?? wine['Price-Max'] ?? wine['priceMax'] ?? wine['max_price'] ?? '');

    // Score field
    const score = parseFloat(wine['score'] ?? wine['Score'] ?? wine['critic-score'] ?? wine['criticScore'] ?? '');

    // Other fields
    const region = wine['region'] ?? wine['Region'] ?? null;
    const grape = wine['grape'] ?? wine['Grape'] ?? null;
    const matchedName = wine['name'] ?? wine['Name'] ?? wine['wine-name'] ?? null;

    return {
      status: 'success',
      retailPriceAvg: isNaN(priceAvg) ? null : Math.round(priceAvg),
      retailPriceMin: isNaN(priceMin) ? null : Math.round(priceMin),
      retailPriceMax: isNaN(priceMax) ? null : Math.round(priceMax),
      criticScore: isNaN(score) ? null : Math.round(score),
      region: region || null,
      grape: grape || null,
      matchedName: matchedName || null,
    };
  } catch {
    return { ...NULL_RESULT, status: 'error' };
  }
}

// ── Main API lookup function ───────────────────────────────────
export async function lookupViaWineSearcherApi(
  wineName: string,
  producer: string,
  vintage: number | null,
  currency: string
): Promise<WineSearcherApiResult> {
  // Check if API key is configured
  if (!config.wineSearcherApiKey) {
    return { ...NULL_RESULT, status: 'error' };
  }

  // Check daily rate limit
  if (!checkAndIncrementDailyLimit()) {
    console.log('  [API] Daily rate limit reached');
    return { ...NULL_RESULT, status: 'rate_limited' };
  }

  const apiWineName = buildApiWineName(wineName, producer);
  const currencyCode = CURRENCY_CODES[currency] || 'USD';

  // Build API URL
  const params = new URLSearchParams({
    api_key: config.wineSearcherApiKey,
    winename: apiWineName,
    currencycode: currencyCode,
  });

  if (vintage) {
    params.set('vintage', String(vintage));
  }

  // Wine-Searcher API base URL (Wine Check endpoint)
  const url = `https://api.wine-searcher.com/wine-select-api.lml?${params.toString()}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.log(`  [API] HTTP ${response.status} for "${wineName}"`);
      return { ...NULL_RESULT, status: 'error' };
    }

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('json')) {
      const data = await response.json();
      return parseApiResponse(data);
    } else {
      // Try parsing as JSON anyway (some APIs don't set content-type correctly)
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        return parseApiResponse(data);
      } catch {
        // Might be pipe-delimited or XML — try basic extraction
        console.log(`  [API] Unexpected response format for "${wineName}": ${contentType}`);
        return { ...NULL_RESULT, status: 'error' };
      }
    }
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('abort')) {
      console.log(`  [API] Timeout for "${wineName}"`);
    } else {
      console.log(`  [API] Error for "${wineName}": ${message}`);
    }
    return { ...NULL_RESULT, status: 'error' };
  }
}
