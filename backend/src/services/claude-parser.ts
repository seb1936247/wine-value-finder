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

// Try to salvage truncated JSON by extracting complete wine objects
function salvageTruncatedJson(text: string): ParseResult | null {
  // Find the wines array start
  const winesIdx = text.indexOf('"wines"');
  if (winesIdx === -1) return null;

  const arrayStart = text.indexOf('[', winesIdx);
  if (arrayStart === -1) return null;

  // Extract currency
  const currencyMatch = text.match(/"currency"\s*:\s*"(\w+)"/);
  const currency = currencyMatch ? currencyMatch[1] : 'USD';

  // Find all complete wine objects by matching balanced braces
  const wines: ParsedWine[] = [];
  let depth = 0;
  let objStart = -1;

  for (let i = arrayStart + 1; i < text.length; i++) {
    if (text[i] === '{' && depth === 0) {
      objStart = i;
      depth = 1;
    } else if (text[i] === '{') {
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        const objStr = text.substring(objStart, i + 1);
        try {
          wines.push(JSON.parse(objStr));
        } catch { /* skip malformed object */ }
        objStart = -1;
      }
    }
  }

  if (wines.length > 0) {
    console.log(`  Salvaged ${wines.length} wines from truncated response`);
    return { currency, wines };
  }
  return null;
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
    max_tokens: 32768,
    messages: [{ role: 'user', content: contentBlocks }],
  });

  console.log(`Parse response: stop_reason=${response.stop_reason}, content blocks=${response.content.length}`);

  // Collect all text from all text blocks
  const textBlocks = response.content.filter(b => b.type === 'text');
  if (textBlocks.length === 0) {
    throw new Error('No text response from Claude');
  }

  const allText = textBlocks.map(b => b.type === 'text' ? b.text : '').join('\n');

  // Try each text block (last first) to find complete JSON
  for (const block of [...textBlocks].reverse()) {
    if (block.type !== 'text') continue;
    let jsonStr = block.text.trim();

    // Strip markdown code fences if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '');
      jsonStr = jsonStr.replace(/\n?```\s*$/, '');
    }

    // Find JSON object
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        const parsed = JSON.parse(jsonStr.substring(firstBrace, lastBrace + 1));
        return {
          currency: parsed.currency || 'USD',
          wines: parsed.wines as ParsedWine[],
        };
      } catch { /* try next block or salvage */ }
    }
  }

  // If JSON was truncated (hit max_tokens), salvage what we can
  if (response.stop_reason === 'max_tokens') {
    console.log('Response was truncated (max_tokens). Attempting to salvage partial wines...');
    const salvaged = salvageTruncatedJson(allText);
    if (salvaged) return salvaged;
  }

  // Last resort: try to salvage from any text
  const salvaged = salvageTruncatedJson(allText);
  if (salvaged) return salvaged;

  console.error('Failed to find JSON in parser response. Full text:', allText.substring(0, 1000));
  throw new Error(`Could not parse wine list. Claude responded: "${allText.substring(0, 100)}..."`);
}
