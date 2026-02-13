import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { buildSearchName, expandProducerName } from '../utils/wine-name-utils.js';
import type { WineValueResult } from '../types/wine.js';

const client = new Anthropic({
  apiKey: config.anthropicApiKey,
  timeout: 5 * 60 * 1000, // 5 min timeout
});

export interface WebSearchFallbackResult {
  retailPriceAvg: number | null;
  retailPriceMin: number | null;
  criticScore: number | null;
  communityScore: number | null;
  communityReviewCount: number | null;
}

const NULL_RESULT: WebSearchFallbackResult = {
  retailPriceAvg: null,
  retailPriceMin: null,
  criticScore: null,
  communityScore: null,
  communityReviewCount: null,
};

/**
 * Full web search fallback — used when Wine-Searcher API is unavailable.
 * Improved prompt with strict vintage verification.
 */
export async function lookupViaWebSearch(
  wine: WineValueResult,
  currency: string
): Promise<WebSearchFallbackResult> {
  const vintageStr = wine.vintage ?? 'NV';
  const producer = wine.producer || '';
  const expandedProducer = expandProducerName(producer);
  const searchName = buildSearchName(wine.name, producer);

  const currencyLabel = currency === 'GBP' ? 'British Pounds (GBP/£)'
    : currency === 'EUR' ? 'Euros (EUR/€)'
    : currency === 'AUD' ? 'Australian Dollars (AUD/A$)'
    : 'US Dollars (USD/$)';

  const conversionNote = currency === 'GBP'
    ? 'If prices are in USD, convert to GBP (1 USD ≈ 0.79 GBP). If in EUR, convert (1 EUR ≈ 0.84 GBP).'
    : currency === 'EUR'
    ? 'If prices are in USD, convert to EUR (1 USD ≈ 0.92 EUR). If in GBP, convert (1 GBP ≈ 1.19 EUR).'
    : '';

  const prompt = `Find retail price and critic ratings for this wine using web search.

Wine: "${wine.name}" ${vintageStr}
Producer: "${expandedProducer}"

VINTAGE VERIFICATION (CRITICAL):
- You MUST verify that any data you extract is for vintage ${vintageStr} specifically.
- Wine-Searcher pages show data for MULTIPLE vintages. Make sure you're looking at the correct one.
- If you cannot confirm the vintage matches, return null for that field.

Search Strategy:
1. Search for: ${searchName} ${vintageStr} wine-searcher.com price
   - Look for "Avg Price (ex-tax)" — this is the retailPriceAvg
   - Look for the lowest retail price — this is retailPriceMin
   - ONLY use the "Avg Price (ex-tax)" value, NOT retail/auction/restaurant prices
   - Look for the aggregated critic score shown as "XX / 100"
   - Make sure it's the AGGREGATED critic score (mean of multiple critics), not a single reviewer's score

2. Search for: ${searchName} ${vintageStr} cellartracker community score
   - CellarTracker scores appear as "CT XX" out of 100

3. If the above don't return results, try: "${searchName} ${vintageStr} wine price critic score"

BEFORE returning JSON, verify:
- Is the vintage correct? (must be ${vintageStr})
- Is the price the AVERAGE retail price ex-tax, not auction or restaurant?
- Is the critic score the aggregated score, not a single review?

${conversionNote}
Prices should be in ${currencyLabel}. Round to the nearest whole number.

Return ONLY a JSON object, no explanation:
{"retailPriceAvg": <number or null>, "retailPriceMin": <number or null>, "criticScore": <number 0-100 or null>, "communityScore": <number 0-100 or null>, "communityReviewCount": <number or null>}`;

  // Build user location for currency-appropriate results
  const userLocation = currency === 'GBP'
    ? { type: 'approximate', country: 'GB', region: 'England', city: 'London' }
    : currency === 'EUR'
    ? { type: 'approximate', country: 'FR', region: 'Ile-de-France', city: 'Paris' }
    : currency === 'AUD'
    ? { type: 'approximate', country: 'AU', region: 'New South Wales', city: 'Sydney' }
    : { type: 'approximate', country: 'US', region: 'New York', city: 'New York' };

  try {
    const requestBody: any = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
          user_location: userLocation,
        },
      ],
    };

    let response = await client.messages.create(requestBody);

    // Handle pause_turn
    let attempts = 0;
    while ((response.stop_reason as string) === 'pause_turn' && attempts < 5) {
      attempts++;
      console.log(`    [Fallback] pause_turn for "${wine.name}", continuing (attempt ${attempts})...`);
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

      if (str.startsWith('```')) {
        str = str.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }

      const firstBrace = str.indexOf('{');
      const lastBrace = str.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          return JSON.parse(str.substring(firstBrace, lastBrace + 1));
        } catch { /* try next block */ }
      }
    }

    console.log(`    [Fallback] No valid JSON for "${wine.name}", returning nulls`);
    return NULL_RESULT;
  } catch (err) {
    console.error(`  [Fallback] Error for "${wine.name}":`, (err as Error).message);
    return NULL_RESULT;
  }
}
