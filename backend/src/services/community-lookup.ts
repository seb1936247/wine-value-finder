import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { buildSearchName } from '../utils/wine-name-utils.js';

const client = new Anthropic({
  apiKey: config.anthropicApiKey,
  timeout: 2 * 60 * 1000, // 2 min timeout (shorter — this is a focused lookup)
});

export interface CommunityScoreResult {
  communityScore: number | null;
  communityReviewCount: number | null;
}

const NULL_RESULT: CommunityScoreResult = {
  communityScore: null,
  communityReviewCount: null,
};

/**
 * Look up CellarTracker community score via Claude web search.
 * Uses a tight, focused prompt — only searches CellarTracker, only returns community data.
 */
export async function lookupCommunityScore(
  wineName: string,
  producer: string,
  vintage: number | null
): Promise<CommunityScoreResult> {
  const vintageStr = vintage ?? 'NV';
  const searchName = buildSearchName(wineName, producer);

  const prompt = `Find the CellarTracker community score for this wine.

Wine: "${searchName}" ${vintageStr}

INSTRUCTIONS:
1. Search for: site:cellartracker.com "${searchName}" ${vintageStr}
2. Look ONLY at CellarTracker results.
3. The community score appears as "CT XX" (a number out of 100) on CellarTracker pages.
4. The review count appears as "X reviews" or "X community tasting notes".

CRITICAL RULES:
- ONLY return data from CellarTracker.com results.
- The vintage MUST match exactly: ${vintageStr}. If you only see scores for a different vintage, return null.
- Do NOT look at Wine-Searcher, Vivino, or any other site.
- Do NOT return any price data or critic scores.

Return ONLY a JSON object, no explanation:
{"communityScore": <number 0-100 or null>, "communityReviewCount": <number or null>}`;

  try {
    const requestBody: any = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 2,
        },
      ],
    };

    let response = await client.messages.create(requestBody);

    // Handle pause_turn
    let attempts = 0;
    while ((response.stop_reason as string) === 'pause_turn' && attempts < 3) {
      attempts++;
      requestBody.messages = [
        { role: 'user', content: prompt },
        { role: 'assistant', content: response.content },
        { role: 'user', content: 'Please provide the JSON result now.' },
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
          const parsed = JSON.parse(str.substring(firstBrace, lastBrace + 1));
          return {
            communityScore: typeof parsed.communityScore === 'number' ? parsed.communityScore : null,
            communityReviewCount: typeof parsed.communityReviewCount === 'number' ? parsed.communityReviewCount : null,
          };
        } catch { /* try next block */ }
      }
    }

    return NULL_RESULT;
  } catch (err) {
    console.log(`  [Community] Error for "${wineName}": ${(err as Error).message}`);
    return NULL_RESULT;
  }
}
