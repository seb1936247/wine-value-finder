export interface ParsedWine {
  name: string;
  producer: string;
  vintage: number | null;
  region: string;
  grapeVariety: string;
  restaurantPrice: number;
  rawText: string;
  confidence: number;
}

export interface WineValueResult extends ParsedWine {
  retailPriceAvg: number | null;
  retailPriceMin: number | null;
  criticScore: number | null;
  communityScore: number | null;
  communityReviewCount: number | null;
  lookupStatus: 'pending' | 'found' | 'partial' | 'not_found' | 'error';
  wineSearcherUrl: string | null;
  cellarTrackerUrl: string | null;
  markupPercent: number | null;
  valueScore: number | null;
}

export interface SessionData {
  id: string;
  wines: WineValueResult[];
  currency: string;
  status: 'parsing' | 'parsed' | 'looking_up' | 'complete' | 'error';
  createdAt: string;
  error?: string;
}
