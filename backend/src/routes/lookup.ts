import { Router } from 'express';
import { getSession, setSession } from '../utils/sessions.js';
import { lookupWinesBatch } from '../services/wine-lookup.js';
import { calculateMarkup, calculateValueScore } from '../services/value-calculator.js';

const router = Router();

router.post('/:sessionId', async (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  if (session.status === 'looking_up') {
    res.status(409).json({ error: 'Lookup already in progress' });
    return;
  }

  session.status = 'looking_up';
  setSession(session);

  // Return immediately, do lookups in background
  res.json({ message: 'Lookup started', sessionId: session.id });

  try {
    const pendingWines = session.wines.filter(w => w.lookupStatus === 'pending');

    // Each wine gets its own web search API call, run in waves of 5 parallel
    const WAVE_SIZE = 5;
    const waves: typeof pendingWines[] = [];
    for (let i = 0; i < pendingWines.length; i += WAVE_SIZE) {
      waves.push(pendingWines.slice(i, i + WAVE_SIZE));
    }

    console.log(`Looking up ${pendingWines.length} wines in ${waves.length} waves of ${WAVE_SIZE}`);

    for (let waveIdx = 0; waveIdx < waves.length; waveIdx++) {
      const wave = waves[waveIdx];
      console.log(`  Wave ${waveIdx + 1}/${waves.length} (${wave.length} wines in parallel)`);

      const results = await lookupWinesBatch(wave, session.currency);

      for (let i = 0; i < wave.length; i++) {
        const wine = wave[i];
        const data = results[i];

        if (data) {
          wine.retailPriceAvg = data.retailPriceAvg;
          wine.retailPriceMin = data.retailPriceMin;
          wine.criticScore = data.criticScore;
          wine.communityScore = data.communityScore;
          wine.communityReviewCount = data.communityReviewCount;

          // Generate links for user to verify
          const searchName = encodeURIComponent(wine.name.replace(/ /g, '+'));
          wine.wineSearcherUrl = `https://www.wine-searcher.com/find/${searchName}${wine.vintage ? '/' + wine.vintage : ''}`;
          wine.cellarTrackerUrl = `https://www.cellartracker.com/list.html?szSearch=${encodeURIComponent(wine.name + (wine.vintage ? ' ' + wine.vintage : ''))}`;

          // Calculate derived values
          if (wine.retailPriceAvg) {
            wine.markupPercent = Math.round(calculateMarkup(wine.restaurantPrice, wine.retailPriceAvg));
          }

          wine.valueScore = calculateValueScore(
            wine.restaurantPrice,
            wine.retailPriceAvg,
            wine.criticScore,
            wine.communityScore
          );

          // Determine lookup status
          if (wine.retailPriceAvg || wine.communityScore) {
            wine.lookupStatus = wine.retailPriceAvg && wine.communityScore ? 'found' : 'partial';
          } else {
            wine.lookupStatus = 'not_found';
          }
        } else {
          wine.lookupStatus = 'not_found';
        }
      }

      // Persist after each wave so polling sees progress
      setSession(session);
    }

    session.status = 'complete';
    setSession(session);
    console.log('Lookup complete for session', session.id);
  } catch (err) {
    console.error('Lookup error:', err);
    session.status = 'error';
    session.error = (err as Error).message;
    setSession(session);
  }
});

export default router;
