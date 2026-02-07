import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import type { ParsedWine } from '../types/wine.js';
import { config } from '../config.js';

const client = new Anthropic({
  apiKey: config.anthropicApiKey,
  timeout: 5 * 60 * 1000, // 5 minutes for large PDFs
});

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

const MIME_MAP: Record<string, ImageMediaType> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const PARSE_PROMPT = `You are a wine expert analyzing a restaurant wine list.

First, determine the currency used on this menu (USD $, GBP £, EUR €, etc.).

Then extract every wine from this menu image/PDF. For each wine, extract:
- name: the full wine name as it would be searched on wine-searcher.com (e.g., "Chateau Margaux Premier Grand Cru Classe"). Include the producer name as part of the search-friendly name.
- producer: the winery or producer name
- vintage: the year as a number, or null if non-vintage (NV)
- region: the wine region if listed or inferable
- grapeVariety: the grape variety if listed or inferable
- restaurantPrice: the price as a number (no currency symbol). If by-the-glass and by-the-bottle are both listed, use the bottle price.
- rawText: the exact text as printed on the menu for this wine
- confidence: your confidence in the extraction accuracy (0.0 to 1.0)

Be thorough -- extract ALL wines on the list. If a section header indicates a category (e.g., "Red Wines - Bordeaux"), use that context to fill in region/grape fields.

Return ONLY a JSON object with:
- "currency": the currency code (e.g., "GBP", "USD", "EUR")
- "wines": array of wine objects

No other text.`;

interface ParseResult {
  currency: string;
  wines: ParsedWine[];
}

export async function parseWineList(filePath: string): Promise<ParseResult> {
  const ext = path.extname(filePath).toLowerCase();
  const fileBuffer = fs.readFileSync(filePath);
  const base64 = fileBuffer.toString('base64');

  let contentBlocks: Anthropic.Messages.ContentBlockParam[];

  if (ext === '.pdf') {
    contentBlocks = [
      {
        type: 'document' as const,
        source: {
          type: 'base64' as const,
          media_type: 'application/pdf',
          data: base64,
        },
      },
      { type: 'text' as const, text: PARSE_PROMPT },
    ];
  } else {
    const mediaType = MIME_MAP[ext];
    if (!mediaType) {
      throw new Error(`Unsupported file type: ${ext}`);
    }
    contentBlocks = [
      {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: mediaType,
          data: base64,
        },
      },
      { type: 'text' as const, text: PARSE_PROMPT },
    ];
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    messages: [{ role: 'user', content: contentBlocks }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  // Extract JSON from the response (may be wrapped in markdown code blocks)
  let jsonStr = textBlock.text.trim();

  // Strip markdown code fences if present
  if (jsonStr.startsWith('```')) {
    // Remove opening fence (```json or ```)
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '');
    // Remove closing fence
    jsonStr = jsonStr.replace(/\n?```\s*$/, '');
  }

  // As a fallback, find the first { and last } to extract JSON object
  if (!jsonStr.startsWith('{') && !jsonStr.startsWith('[')) {
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }
  }

  const parsed = JSON.parse(jsonStr.trim());
  return {
    currency: parsed.currency || 'USD',
    wines: parsed.wines as ParsedWine[],
  };
}
