import { Router } from 'express';
import { getSession, setSession } from '../utils/sessions.js';
import { lookupWinesBatch, clearWineCache } from '../services/wine-lookup.js';
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

  const sess = session; // TS narrowing: guaranteed non-undefined after early return above

  try {
    const pendingWines = sess.wines.filter(w => w.lookupStatus === 'pending');

    // Each wine gets its own API call with web search, run in parallel waves
    const WAVE_SIZE = 5;

    async function runWaves(wines: typeof pendingWines, label: string) {
      const waves: typeof pendingWines[] = [];
      for (let i = 0; i < wines.length; i += WAVE_SIZE) {
        waves.push(wines.slice(i, i + WAVE_SIZE));
      }

      console.log(`${label}: ${wines.length} wines in ${waves.length} waves of ${WAVE_SIZE}`);

      for (let waveIdx = 0; waveIdx < waves.length; waveIdx++) {
        const wave = waves[waveIdx];
        console.log(`  Wave ${waveIdx + 1}/${waves.length} (${wave.length} wines in parallel)`);

        const results = await lookupWinesBatch(wave, sess.currency);

        for (let i = 0; i < wave.length; i++) {
          const wine = wave[i];
          const data = results[i];

          if (data) {
            // Merge data — keep existing non-null values, fill in nulls from new data
            wine.retailPriceAvg = wine.retailPriceAvg ?? data.retailPriceAvg;
            wine.retailPriceMin = wine.retailPriceMin ?? data.retailPriceMin;
            wine.criticScore = wine.criticScore ?? data.criticScore;
            wine.communityScore = wine.communityScore ?? data.communityScore;
            wine.communityReviewCount = wine.communityReviewCount ?? data.communityReviewCount;

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

            // Determine lookup status — 'found' if we have enough for a value score
            if (wine.valueScore !== null) {
              wine.lookupStatus = 'found';
            } else if (wine.retailPriceAvg || wine.criticScore || wine.communityScore) {
              wine.lookupStatus = 'partial';
            } else {
              wine.lookupStatus = 'not_found';
            }
          } else {
            if (!wine.retailPriceAvg && !wine.criticScore && !wine.communityScore) {
              wine.lookupStatus = 'not_found';
            }
          }
        }

        // Persist after each wave so polling sees progress
        setSession(sess);
      }
    }

    // First pass: look up all pending wines
    await runWaves(pendingWines, 'Pass 1');

    // Second pass: retry wines that are still missing value scores
    // Clear their cache entries so we get fresh search results
    const needsRetry = sess.wines.filter(w =>
      w.valueScore === null && w.lookupStatus !== 'pending'
    );

    if (needsRetry.length > 0) {
      console.log(`\nRetrying ${needsRetry.length} wines that are missing value scores...`);
      // Reset their cache so they get fresh search results
      for (const wine of needsRetry) {
        clearWineCache(wine, sess.currency);
      }
      await runWaves(needsRetry, 'Pass 2 (retry)');
    }

    sess.status = 'complete';
    setSession(sess);

    const scored = sess.wines.filter(w => w.valueScore !== null).length;
    const total = sess.wines.length;
    console.log(`Lookup complete for session ${sess.id}: ${scored}/${total} wines scored`);
  } catch (err) {
    console.error('Lookup error:', err);
    sess.status = 'error';
    sess.error = (err as Error).message;
    setSession(sess);
  }
});

export default router;
