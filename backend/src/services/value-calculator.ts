export function calculateMarkup(restaurantPrice: number, retailPrice: number): number {
  return ((restaurantPrice - retailPrice) / retailPrice) * 100;
}

export function calculateValueScore(
  restaurantPrice: number,
  retailPriceAvg: number | null,
  criticScore: number | null,
  communityScore: number | null
): number | null {
  if (!retailPriceAvg) return null;

  // Combine critic and community scores
  // Weight: 40% critic, 60% community
  let qualityScore: number | null = null;

  if (criticScore !== null && communityScore !== null) {
    qualityScore = criticScore * 0.4 + communityScore * 0.6;
  } else if (criticScore !== null) {
    qualityScore = criticScore;
  } else if (communityScore !== null) {
    qualityScore = communityScore;
  }

  if (qualityScore === null) return null;

  // Markup ratio: restaurant price / retail price
  // Typical restaurant markup is 2-3x
  const markupRatio = restaurantPrice / retailPriceAvg;

  // Value Score = Quality / Markup Ratio
  // 90pt wine at 2x markup = 45 (decent), at 1.5x = 60 (great), at 3x = 30 (poor)
  const valueScore = qualityScore / markupRatio;

  return Math.min(100, Math.max(0, Math.round(valueScore)));
}
