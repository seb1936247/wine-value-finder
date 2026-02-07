import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import type { WineValueResult } from '../types/wine.js';

const client = new Anthropic({ apiKey: config.anthropicApiKey });

interface WineLookupData {
  retailPriceAvg: number | null;
  retailPriceMin: number | null;
  criticScore: number | null;
  communityScore: number | null;
  communityReviewCount: number | null;
}

export async function lookupWinesBatch(wines: WineValueResult[], currency: string = 'USD'): Promise<WineLookupData[]> {
  const currencySymbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';

  // Build a list of wines to look up, including producer for better identification
  const wineList = wines.map((w, i) =>
    `${i + 1}. "${w.name}" by ${w.producer} (${w.vintage ?? 'NV'}) [${w.region || 'unknown region'}] — restaurant price: ${currencySymbol}${w.restaurantPrice}`
  ).join('\n');

  const prompt = `You are a sommelier and wine market expert. I need retail price and rating data for the following wines from a restaurant wine list. The restaurant prices are in ${currency}.

For EACH wine, provide:
- retailPriceAvg: the typical RETAIL price in ${currency} (what a consumer would pay at a wine shop or online retailer). Use ${currency} to match the restaurant's currency.
- retailPriceMin: the lowest retail price you'd expect to find in ${currency}
- criticScore: the typical professional critic score (Wine Advocate/Robert Parker, Wine Spectator, Jancis Robinson, James Suckling, Vinous, etc.) on a 100-point scale. Many of these wines WILL have professional reviews.
- communityScore: the typical CellarTracker or Vivino community score on a 100-point scale
- communityReviewCount: approximate number of community tasting notes (estimate based on the wine's popularity)

IMPORTANT GUIDELINES:
- Most of these wines are from well-known producers. You SHOULD be able to provide estimates for the majority.
- For well-known producers (Egly-Ouriet, Jacques Selosse, Pierre Peters, Billecart-Salmon, Salon, Taittinger, etc.), you definitely know approximate prices and scores.
- Provide your BEST ESTIMATE rather than null. Only use null if you truly have zero information about a wine.
- Retail prices should be in ${currency} and reflect current market prices (2024-2025).
- For NV Champagnes, use the current release pricing.
- For UK/GBP prices, use UK retail pricing (e.g., from Berry Bros, Justerini & Brooks, Lea & Sandeman, The Wine Society, etc.)

Here are the wines:
${wineList}

Return ONLY a JSON array (no markdown, no explanation) where each element has: retailPriceAvg, retailPriceMin, criticScore, communityScore, communityReviewCount.`;

  const response = await client.messages.create({
    model: 'claude-3-5-haiku-20241022',
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

  let results: WineLookupData[];
  try {
    results = JSON.parse(jsonStr.trim());
  } catch (err) {
    console.error('Failed to parse lookup response. Raw text:', textBlock.text.substring(0, 500));
    throw err;
  }

  const found = results.filter(r => r.retailPriceAvg !== null).length;
  console.log(`  Batch result: ${found}/${results.length} wines with price data`);

  return results;
}
